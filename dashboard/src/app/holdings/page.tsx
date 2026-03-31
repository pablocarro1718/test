"use client";

import { useEffect, useState } from "react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { xirr } from "@/lib/xirr";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { DataTable, ColumnDef } from "@/components/data-table";

/* ── Types ─────────────────────────────────────────── */

interface BrokerDetail {
  broker: string;
  quantity: number;
  costBasis: number;
  avgCost: number;
}

interface Holding {
  ticker: string;
  name: string;
  assetType: string;
  currency: string;
  quantity: number;
  costBasis: number;
  avgCostPerUnit: number;
  commission: number;
  firstBuy: string;
  lastBuy: string;
  dividends: number;
  brokers: BrokerDetail[];
}

interface HoldingsData {
  holdings: Holding[];
  summary: {
    totalPositions: number;
    totalCostBasis: number;
    totalCommission: number;
    totalDividends: number;
  };
  brokerList: string[];
  cashFlowsByTicker: Record<string, Array<{ date: string; amount: number }>>;
}

interface PricesData {
  prices: Record<
    string,
    {
      price: number;
      priceEur: number;
      currency: string;
      change: number;
      changePercent: number;
    }
  >;
}

type HoldingRow = Holding & {
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  dailyChange: number;
  weight: number;
  tir: number | null;
};

/* ── Constants ──────────────────────────────────────── */

const TYPE_TABS = ["All", "Stock", "ETF", "Crypto"] as const;

const BROKER_VARIANT: Record<string, string> = {
  Degiro: "bg-blue-100 text-blue-700 border-blue-200",
  "Trading 212": "bg-emerald-100 text-emerald-700 border-emerald-200",
  Kraken: "bg-purple-100 text-purple-700 border-purple-200",
  IBKR: "bg-red-100 text-red-700 border-red-200",
  Fintual: "bg-amber-100 text-amber-700 border-amber-200",
};

/* ── Component ──────────────────────────────────────── */

export default function HoldingsPage() {
  const [data, setData] = useState<HoldingsData | null>(null);
  const [prices, setPrices] = useState<PricesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("All");
  const [filterBroker, setFilterBroker] = useState<string>("");

  useEffect(() => {
    Promise.all([
      fetch("/api/holdings").then((r) => r.json()),
      fetch("/api/prices").then((r) => r.json()),
    ])
      .then(([holdingsData, pricesData]) => {
        setData(holdingsData);
        setPrices(pricesData);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading holdings...</div>
      </div>
    );
  }

  if (!data) return null;

  /* ── Filtering ──────────────────────────────── */

  const filtered = data.holdings.filter((h) => {
    if (filterType !== "All" && h.assetType !== filterType) return false;
    if (filterBroker && !h.brokers.some((b) => b.broker === filterBroker)) return false;
    return true;
  });

  /* ── Market value enrichment ────────────────── */

  const totalMarketValue = filtered.reduce((s, h) => {
    const p = prices?.prices[h.ticker];
    return s + (p ? p.priceEur * h.quantity : h.costBasis);
  }, 0);

  const holdingsWithMarket: HoldingRow[] = filtered.map((h) => {
    const p = prices?.prices[h.ticker];
    const marketValue = p ? p.priceEur * h.quantity : h.costBasis;
    const unrealizedPnl = marketValue - h.costBasis;
    const unrealizedPct = h.costBasis > 0 ? (unrealizedPnl / h.costBasis) * 100 : 0;
    const dailyChange = p?.changePercent || 0;
    const weight = totalMarketValue > 0 ? (marketValue / totalMarketValue) * 100 : 0;
    const historicFlows = (data.cashFlowsByTicker[h.ticker] || []).map((f) => ({
      date: new Date(f.date),
      amount: f.amount,
    }));
    const tir = historicFlows.length >= 1
      ? xirr([...historicFlows, { date: new Date(), amount: marketValue }])
      : null;
    return { ...h, marketValue, unrealizedPnl, unrealizedPct, dailyChange, weight, tir };
  });

  /* ── KPI computations ────────────────────────── */

  const totalUnrealizedPnl = holdingsWithMarket.reduce((s, h) => s + h.unrealizedPnl, 0);
  const totalCostBasis = holdingsWithMarket.reduce((s, h) => s + h.costBasis, 0);
  const totalUnrealizedPct = totalCostBasis > 0 ? (totalUnrealizedPnl / totalCostBasis) * 100 : 0;
  const top3Best = [...holdingsWithMarket].sort((a, b) => b.unrealizedPct - a.unrealizedPct).slice(0, 3);
  const top3Worst = [...holdingsWithMarket].sort((a, b) => a.unrealizedPct - b.unrealizedPct).slice(0, 3);

  // Portfolio-level TIR from all filtered holdings' cash flows
  const portfolioFlows = holdingsWithMarket.flatMap((h) =>
    (data.cashFlowsByTicker[h.ticker] || []).map((f) => ({
      date: new Date(f.date),
      amount: f.amount,
    }))
  );
  const portfolioTIR =
    portfolioFlows.length >= 1
      ? xirr([...portfolioFlows, { date: new Date(), amount: totalMarketValue }])
      : null;

  // Avg commission as % of total invested
  const avgCommissionPct =
    totalCostBasis > 0 ? (data.summary.totalCommission / totalCostBasis) * 100 : 0;

  /* ── Chart data ──────────────────────────────── */

  const chartData = [...holdingsWithMarket]
    .sort((a, b) => Math.abs(b.unrealizedPnl) - Math.abs(a.unrealizedPnl))
    .slice(0, 10)
    .map((h) => ({ ticker: h.ticker, cost: h.costBasis, market: h.marketValue }));

  const commissionData = [...holdingsWithMarket]
    .filter((h) => h.commission > 0)
    .sort((a, b) => b.commission - a.commission)
    .slice(0, 10)
    .map((h) => ({ ticker: h.ticker, commission: h.commission }));

  /* ── Column definitions ──────────────────────── */

  const columns: ColumnDef<HoldingRow>[] = [
    {
      key: "ticker",
      label: "Ticker",
      sortable: true,
      getStringValue: (r) => r.ticker,
      render: (r) => (
        <div className="flex items-center gap-2">
          <div>
            <span className="font-mono font-medium">{r.ticker}</span>
            <p className="max-w-[150px] truncate text-xs text-muted-foreground">{r.name}</p>
          </div>
          <Badge variant="outline" className="text-[10px] font-normal">{r.assetType}</Badge>
        </div>
      ),
    },
    {
      key: "costBasis",
      label: "Cost Basis",
      sortable: true,
      align: "right",
      footer: "sum",
      getValue: (r) => r.costBasis,
      render: (r) => <span className="font-mono text-sm">{formatCurrency(r.costBasis)}</span>,
    },
    {
      key: "marketValue",
      label: "Mkt Value",
      sortable: true,
      align: "right",
      footer: "sum",
      getValue: (r) => r.marketValue,
      render: (r) => <span className="font-mono text-sm font-medium">{formatCurrency(r.marketValue)}</span>,
    },
    {
      key: "unrealizedPnl",
      label: "P&L",
      sortable: true,
      align: "right",
      footer: "sum",
      getValue: (r) => r.unrealizedPnl,
      render: (r) => (
        <span className={cn("font-mono text-sm font-medium", r.unrealizedPnl >= 0 ? "text-positive" : "text-negative")}>
          {formatCurrency(r.unrealizedPnl)}
        </span>
      ),
    },
    {
      key: "unrealizedPct",
      label: "P&L %",
      sortable: true,
      align: "right",
      footer: "avg",
      getValue: (r) => r.unrealizedPct,
      render: (r) => (
        <span className={cn("font-mono text-sm", r.unrealizedPct >= 0 ? "text-positive" : "text-negative")}>
          {formatPercent(r.unrealizedPct)}
        </span>
      ),
    },
    {
      key: "weight",
      label: "Weight",
      sortable: true,
      align: "right",
      footer: "sum",
      getValue: (r) => r.weight,
      render: (r) => <span className="text-sm">{formatNumber(r.weight, 1)}%</span>,
    },
    {
      key: "tir",
      label: "TIR",
      secondary: true,
      sortable: true,
      align: "right",
      getValue: (r) => r.tir ?? -Infinity,
      render: (r) => r.tir != null
        ? <span className={cn("font-mono text-sm", r.tir >= 0 ? "text-positive" : "text-negative")}>{formatPercent(r.tir * 100)}</span>
        : <span className="text-sm text-muted-foreground">—</span>,
    },
    // Secondary columns
    {
      key: "quantity",
      label: "Qty",
      secondary: true,
      sortable: true,
      align: "right",
      getValue: (r) => r.quantity,
      render: (r) => <span className="font-mono text-sm">{formatNumber(r.quantity, r.quantity < 1 ? 6 : 2)}</span>,
    },
    {
      key: "avgCostPerUnit",
      label: "Avg Cost",
      secondary: true,
      sortable: true,
      align: "right",
      getValue: (r) => r.avgCostPerUnit,
      render: (r) => <span className="font-mono text-sm">{formatCurrency(r.avgCostPerUnit)}</span>,
    },
    {
      key: "firstBuy",
      label: "First Buy",
      secondary: true,
      sortable: true,
      getStringValue: (r) => r.firstBuy,
      render: (r) => <span className="text-sm tabular-nums text-muted-foreground">{r.firstBuy || "—"}</span>,
    },
    {
      key: "lastBuy",
      label: "Last Buy",
      secondary: true,
      sortable: true,
      getStringValue: (r) => r.lastBuy,
      render: (r) => <span className="text-sm tabular-nums text-muted-foreground">{r.lastBuy || "—"}</span>,
    },
    {
      key: "dividends",
      label: "Dividends",
      secondary: true,
      sortable: true,
      align: "right",
      footer: "sum",
      getValue: (r) => r.dividends,
      render: (r) => <span className="font-mono text-sm text-muted-foreground">{r.dividends > 0 ? formatCurrency(r.dividends) : "—"}</span>,
    },
    {
      key: "currency",
      label: "Currency",
      secondary: true,
      sortable: false,
      render: (r) => <span className="text-sm text-muted-foreground">{r.currency || "—"}</span>,
    },
  ];

  /* ── Expand row: broker breakdown ────────────── */

  function renderBrokerRows(h: HoldingRow) {
    if (h.brokers.length <= 1) return null;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="pb-1 text-left font-medium">Broker</th>
              <th className="pb-1 pr-2 text-right font-medium">Qty</th>
              <th className="pb-1 pr-2 text-right font-medium">Avg Cost</th>
              <th className="pb-1 pr-2 text-right font-medium">Cost Basis</th>
              <th className="pb-1 pr-2 text-right font-medium">Mkt Value</th>
              <th className="pb-1 pr-2 text-right font-medium">P&L</th>
              <th className="pb-1 text-right font-medium">P&L %</th>
            </tr>
          </thead>
          <tbody>
            {h.brokers.map((b) => {
              const p = prices?.prices[h.ticker];
              const brokerMarketVal = p ? p.priceEur * b.quantity : b.costBasis;
              const brokerPnl = brokerMarketVal - b.costBasis;
              const brokerPct = b.costBasis > 0 ? (brokerPnl / b.costBasis) * 100 : 0;
              return (
                <tr key={b.broker} className="border-t border-border/40">
                  <td className="py-1">
                    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium", BROKER_VARIANT[b.broker] || "")}>
                      {b.broker}
                    </span>
                  </td>
                  <td className="pr-2 text-right font-mono text-muted-foreground">
                    {formatNumber(b.quantity, b.quantity < 1 ? 6 : 2)}
                  </td>
                  <td className="pr-2 text-right font-mono text-muted-foreground">{formatCurrency(b.avgCost)}</td>
                  <td className="pr-2 text-right font-mono text-muted-foreground">{formatCurrency(b.costBasis)}</td>
                  <td className="pr-2 text-right font-mono text-muted-foreground">{formatCurrency(brokerMarketVal)}</td>
                  <td className={cn("pr-2 text-right font-mono", brokerPnl >= 0 ? "text-positive" : "text-negative")}>
                    {formatCurrency(brokerPnl)}
                  </td>
                  <td className={cn("text-right font-mono", brokerPct >= 0 ? "text-positive" : "text-negative")}>
                    {formatPercent(brokerPct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const filterSlot = (
    <>
      <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setFilterType(tab)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              filterType === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "All" ? "All" : `${tab}s`}
          </button>
        ))}
      </div>
      <select
        value={filterBroker}
        onChange={(e) => setFilterBroker(e.target.value)}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-xs"
      >
        <option value="">All Brokers</option>
        {data.brokerList.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>
    </>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold font-serif">Holdings</h1>
        <p className="text-sm text-muted-foreground">Open positions consolidated by ticker</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Unrealized P&amp;L</p>
            <p className={cn("mt-0.5 text-2xl font-bold", totalUnrealizedPnl >= 0 ? "text-positive" : "text-negative")}>
              {formatCurrency(totalUnrealizedPnl, 0)}
            </p>
            <p className={cn("text-xs", totalUnrealizedPct >= 0 ? "text-positive" : "text-negative")}>
              {formatPercent(totalUnrealizedPct)}
            </p>
            {portfolioTIR != null && (
              <div className="mt-2 border-t border-border/40 pt-2">
                <p className="text-[10px] text-muted-foreground">TIR (XIRR)</p>
                <p className={cn("text-sm font-semibold", portfolioTIR >= 0 ? "text-positive" : "text-negative")}>
                  {formatPercent(portfolioTIR * 100)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Top 3 Best</p>
            {top3Best.map((h) => (
              <div key={h.ticker} className="flex items-center justify-between py-1 text-sm border-t border-border/40 first:border-0">
                <span className="font-mono font-medium w-14 shrink-0">{h.ticker}</span>
                <span className={cn("font-mono text-xs", h.unrealizedPct >= 0 ? "text-positive" : "text-negative")}>{formatPercent(h.unrealizedPct)}</span>
                <span className="font-mono text-xs text-muted-foreground">{formatCurrency(h.marketValue)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Top 3 Worst</p>
            {top3Worst.map((h) => (
              <div key={h.ticker} className="flex items-center justify-between py-1 text-sm border-t border-border/40 first:border-0">
                <span className="font-mono font-medium w-14 shrink-0">{h.ticker}</span>
                <span className={cn("font-mono text-xs", h.unrealizedPct >= 0 ? "text-positive" : "text-negative")}>{formatPercent(h.unrealizedPct)}</span>
                <span className="font-mono text-xs text-muted-foreground">{formatCurrency(h.marketValue)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <MetricCard
          title="Commissions Paid"
          value={formatCurrency(data.summary.totalCommission)}
          subtitle={`avg ${formatNumber(avgCommissionPct, 2)}% of invested`}
        />
      </div>

      {/* Holdings Table */}
      <DataTable<HoldingRow>
        data={holdingsWithMarket}
        columns={columns}
        defaultSort={{ key: "marketValue", dir: "desc" }}
        storageKey="holdings"
        getRowKey={(r) => r.ticker}
        expandRow={(r) => renderBrokerRows(r) ?? undefined}
        filterSlot={filterSlot}
      />

      {/* Cost vs Value Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cost vs Market Value — Top 10
            </p>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" barGap={2} margin={{ left: 10, right: 20 }}>
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="ticker" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#1a1a1a", fontFamily: "monospace" }} width={60} />
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => [formatCurrency(value as number), name === "cost" ? "Cost Basis" : "Market Value"]}
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e0dbd3", fontSize: "12px" }}
                  />
                  <Legend formatter={(value: string) => value === "cost" ? "Cost Basis" : "Market Value"} wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="cost" fill="#9ca3af" radius={[0, 4, 4, 0]} barSize={12} />
                  <Bar dataKey="market" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Commissions by Ticker */}
      {commissionData.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Commissions Paid — Top 10
            </p>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={commissionData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={(v: number) => `€${v.toFixed(0)}`} />
                  <YAxis type="category" dataKey="ticker" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#1a1a1a", fontFamily: "monospace" }} width={60} />
                  <Tooltip formatter={(value: unknown) => [formatCurrency(value as number), "Commission"]} contentStyle={{ borderRadius: "8px", border: "1px solid #e0dbd3", fontSize: "12px" }} />
                  <Bar dataKey="commission" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={14} fillOpacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
