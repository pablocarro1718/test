"use client";

import { useEffect, useState } from "react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChevronRight, ChevronDown } from "lucide-react";

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
    if (filterBroker && !h.brokers.some((b) => b.broker === filterBroker))
      return false;
    return true;
  });

  /* ── Market value enrichment ────────────────── */

  const holdingsWithMarket = filtered.map((h) => {
    const p = prices?.prices[h.ticker];
    const marketValue = p ? p.priceEur * h.quantity : h.costBasis;
    const unrealizedPnl = marketValue - h.costBasis;
    const unrealizedPct =
      h.costBasis > 0 ? (unrealizedPnl / h.costBasis) * 100 : 0;
    const dailyChange = p?.changePercent || 0;
    return { ...h, marketValue, unrealizedPnl, unrealizedPct, dailyChange };
  });

  const totalMarketValue = holdingsWithMarket.reduce(
    (s, h) => s + h.marketValue,
    0
  );
  const totalUnrealizedPnl = holdingsWithMarket.reduce(
    (s, h) => s + h.unrealizedPnl,
    0
  );
  const totalCostBasis = holdingsWithMarket.reduce(
    (s, h) => s + h.costBasis,
    0
  );
  const totalUnrealizedPct =
    totalCostBasis > 0 ? (totalUnrealizedPnl / totalCostBasis) * 100 : 0;

  const bestPerformer = holdingsWithMarket.reduce(
    (best, h) =>
      h.unrealizedPct > (best?.unrealizedPct ?? -Infinity) ? h : best,
    holdingsWithMarket[0]
  );
  const worstPerformer = holdingsWithMarket.reduce(
    (worst, h) =>
      h.unrealizedPct < (worst?.unrealizedPct ?? Infinity) ? h : worst,
    holdingsWithMarket[0]
  );

  /* ── Toggle expand ──────────────────────────── */

  function toggleExpand(ticker: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }

  /* ── Cost vs Value chart data ────────────────── */

  const chartData = [...holdingsWithMarket]
    .sort((a, b) => Math.abs(b.unrealizedPnl) - Math.abs(a.unrealizedPnl))
    .slice(0, 10)
    .map((h) => ({
      ticker: h.ticker,
      cost: h.costBasis,
      market: h.marketValue,
    }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold font-serif">Holdings</h1>
        <p className="text-sm text-muted-foreground">
          Open positions consolidated by ticker
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Unrealized P&L"
          value={formatCurrency(totalUnrealizedPnl)}
          trend={{
            value: formatPercent(totalUnrealizedPct),
            positive: totalUnrealizedPnl >= 0,
          }}
        />
        <MetricCard
          title="Best Performer"
          value={bestPerformer?.ticker || "-"}
          trend={
            bestPerformer
              ? {
                  value: formatPercent(bestPerformer.unrealizedPct),
                  positive: bestPerformer.unrealizedPct >= 0,
                }
              : undefined
          }
        />
        <MetricCard
          title="Worst Performer"
          value={worstPerformer?.ticker || "-"}
          trend={
            worstPerformer
              ? {
                  value: formatPercent(worstPerformer.unrealizedPct),
                  positive: worstPerformer.unrealizedPct >= 0,
                }
              : undefined
          }
        />
        <MetricCard
          title="Active Positions"
          value={String(filtered.length)}
          subtitle={`of ${data.summary.totalPositions} total`}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        {/* Type tabs */}
        <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterType(tab)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                filterType === tab
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "All" ? "All" : `${tab}s`}
            </button>
          ))}
        </div>
        {/* Broker dropdown */}
        <select
          value={filterBroker}
          onChange={(e) => setFilterBroker(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs"
        >
          <option value="">All Brokers</option>
          {data.brokerList.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      {/* Consolidated Holdings Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Ticker</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Avg Cost</TableHead>
                <TableHead className="text-right">Cost Basis</TableHead>
                <TableHead className="text-right">Mkt Value</TableHead>
                <TableHead className="text-right">P&L</TableHead>
                <TableHead className="text-right">P&L %</TableHead>
                <TableHead className="text-right">Weight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdingsWithMarket.map((h) => {
                const isExpanded = expanded.has(h.ticker);
                const hasBrokers = h.brokers.length > 1;
                return (
                  <>
                    <TableRow
                      key={h.ticker}
                      className={cn(
                        hasBrokers && "cursor-pointer hover:bg-muted/30",
                        isExpanded && "border-b-0"
                      )}
                      onClick={() => hasBrokers && toggleExpand(h.ticker)}
                    >
                      <TableCell className="w-8 px-2">
                        {hasBrokers ? (
                          isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="font-mono font-medium">
                              {h.ticker}
                            </span>
                            <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                              {h.name}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[10px] font-normal"
                          >
                            {h.assetType}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatNumber(h.quantity, h.quantity < 1 ? 6 : 2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(h.avgCostPerUnit)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(h.costBasis)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">
                        {formatCurrency(h.marketValue)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono text-sm font-medium",
                          h.unrealizedPnl >= 0
                            ? "text-positive"
                            : "text-negative"
                        )}
                      >
                        {formatCurrency(h.unrealizedPnl)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono text-sm",
                          h.unrealizedPct >= 0
                            ? "text-positive"
                            : "text-negative"
                        )}
                      >
                        {formatPercent(h.unrealizedPct)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {totalMarketValue > 0
                          ? ((h.marketValue / totalMarketValue) * 100).toFixed(1)
                          : "0"}
                        %
                      </TableCell>
                    </TableRow>
                    {/* Expanded broker sub-rows */}
                    {isExpanded &&
                      h.brokers.map((b) => {
                        const p = prices?.prices[h.ticker];
                        const brokerMarketVal = p
                          ? p.priceEur * b.quantity
                          : b.costBasis;
                        const brokerPnl = brokerMarketVal - b.costBasis;
                        const brokerPct =
                          b.costBasis > 0
                            ? (brokerPnl / b.costBasis) * 100
                            : 0;
                        return (
                          <TableRow
                            key={`${h.ticker}-${b.broker}`}
                            className="bg-muted/20"
                          >
                            <TableCell />
                            <TableCell className="pl-8">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                                  BROKER_VARIANT[b.broker] || ""
                                )}
                              >
                                {b.broker}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              {formatNumber(
                                b.quantity,
                                b.quantity < 1 ? 6 : 2
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              {formatCurrency(b.avgCost)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              {formatCurrency(b.costBasis)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              {formatCurrency(brokerMarketVal)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right font-mono text-xs",
                                brokerPnl >= 0
                                  ? "text-positive"
                                  : "text-negative"
                              )}
                            >
                              {formatCurrency(brokerPnl)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right font-mono text-xs",
                                brokerPct >= 0
                                  ? "text-positive"
                                  : "text-negative"
                              )}
                            >
                              {formatPercent(brokerPct)}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        );
                      })}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cost vs Value Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cost vs Market Value — Top 10
            </p>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  barGap={2}
                  margin={{ left: 10, right: 20 }}
                >
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickFormatter={(v: number) =>
                      `€${(v / 1000).toFixed(0)}k`
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="ticker"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#1a1a1a", fontFamily: "monospace" }}
                    width={60}
                  />
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => [
                      formatCurrency(value as number),
                      name === "cost" ? "Cost Basis" : "Market Value",
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e0dbd3",
                      fontSize: "12px",
                    }}
                  />
                  <Legend
                    formatter={(value: string) =>
                      value === "cost" ? "Cost Basis" : "Market Value"
                    }
                    wrapperStyle={{ fontSize: "12px" }}
                  />
                  <Bar
                    dataKey="cost"
                    fill="#9ca3af"
                    radius={[0, 4, 4, 0]}
                    barSize={12}
                  />
                  <Bar
                    dataKey="market"
                    fill="#3b82f6"
                    radius={[0, 4, 4, 0]}
                    barSize={12}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
