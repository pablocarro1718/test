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
import { ChevronRight, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

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

type SortKey = "ticker" | "quantity" | "avgCostPerUnit" | "costBasis" | "marketValue" | "unrealizedPnl" | "unrealizedPct" | "weight";

/* ── Constants ──────────────────────────────────────── */

const TYPE_TABS = ["All", "Stock", "ETF", "Crypto"] as const;

const BROKER_VARIANT: Record<string, string> = {
  Degiro: "bg-blue-100 text-blue-700 border-blue-200",
  "Trading 212": "bg-emerald-100 text-emerald-700 border-emerald-200",
  Kraken: "bg-purple-100 text-purple-700 border-purple-200",
  IBKR: "bg-red-100 text-red-700 border-red-200",
  Fintual: "bg-amber-100 text-amber-700 border-amber-200",
};

/* ── Sort indicator ─────────────────────────────────── */

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: "asc" | "desc" }) {
  if (col !== sortKey) return <ArrowUpDown className="ml-1 inline h-3 w-3 text-muted-foreground/40" />;
  return sortDir === "asc"
    ? <ArrowUp className="ml-1 inline h-3 w-3 text-foreground" />
    : <ArrowDown className="ml-1 inline h-3 w-3 text-foreground" />;
}

/* ── Component ──────────────────────────────────────── */

export default function HoldingsPage() {
  const [data, setData] = useState<HoldingsData | null>(null);
  const [prices, setPrices] = useState<PricesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("All");
  const [filterBroker, setFilterBroker] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("marketValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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

  /* ── Sorting ────────────────────────────────── */

  function handleSort(col: SortKey) {
    if (col === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("desc");
    }
  }

  const sorted = [...holdingsWithMarket].sort((a, b) => {
    let av: number | string = 0, bv: number | string = 0;
    switch (sortKey) {
      case "ticker": av = a.ticker; bv = b.ticker; break;
      case "quantity": av = a.quantity; bv = b.quantity; break;
      case "avgCostPerUnit": av = a.avgCostPerUnit; bv = b.avgCostPerUnit; break;
      case "costBasis": av = a.costBasis; bv = b.costBasis; break;
      case "marketValue": av = a.marketValue; bv = b.marketValue; break;
      case "unrealizedPnl": av = a.unrealizedPnl; bv = b.unrealizedPnl; break;
      case "unrealizedPct": av = a.unrealizedPct; bv = b.unrealizedPct; break;
      case "weight":
        av = totalMarketValue > 0 ? a.marketValue / totalMarketValue : 0;
        bv = totalMarketValue > 0 ? b.marketValue / totalMarketValue : 0;
        break;
    }
    if (typeof av === "string") {
      return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
    }
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

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

  /* ── Commissions chart data ──────────────────── */

  const commissionData = [...holdingsWithMarket]
    .filter((h) => h.commission > 0)
    .sort((a, b) => b.commission - a.commission)
    .slice(0, 10)
    .map((h) => ({ ticker: h.ticker, commission: h.commission }));

  const thClass = "cursor-pointer select-none hover:text-foreground";

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
          title="Commissions Paid"
          value={formatCurrency(data.summary.totalCommission)}
          subtitle={`across ${data.summary.totalPositions} positions`}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
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
                <TableHead className={thClass} onClick={() => handleSort("ticker")}>
                  Ticker <SortIcon col="ticker" sortKey={sortKey} sortDir={sortDir} />
                </TableHead>
                <TableHead className={cn(thClass, "text-right")} onClick={() => handleSort("quantity")}>
                  Qty <SortIcon col="quantity" sortKey={sortKey} sortDir={sortDir} />
                </TableHead>
                <TableHead className={cn(thClass, "text-right")} onClick={() => handleSort("avgCostPerUnit")}>
                  Avg Cost <SortIcon col="avgCostPerUnit" sortKey={sortKey} sortDir={sortDir} />
                </TableHead>
                <TableHead className={cn(thClass, "text-right")} onClick={() => handleSort("costBasis")}>
                  Cost Basis <SortIcon col="costBasis" sortKey={sortKey} sortDir={sortDir} />
                </TableHead>
                <TableHead className={cn(thClass, "text-right")} onClick={() => handleSort("marketValue")}>
                  Mkt Value <SortIcon col="marketValue" sortKey={sortKey} sortDir={sortDir} />
                </TableHead>
                <TableHead className={cn(thClass, "text-right")} onClick={() => handleSort("unrealizedPnl")}>
                  P&L <SortIcon col="unrealizedPnl" sortKey={sortKey} sortDir={sortDir} />
                </TableHead>
                <TableHead className={cn(thClass, "text-right")} onClick={() => handleSort("unrealizedPct")}>
                  P&L % <SortIcon col="unrealizedPct" sortKey={sortKey} sortDir={sortDir} />
                </TableHead>
                <TableHead className={cn(thClass, "text-right")} onClick={() => handleSort("weight")}>
                  Weight <SortIcon col="weight" sortKey={sortKey} sortDir={sortDir} />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((h) => {
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
                              {formatNumber(b.quantity, b.quantity < 1 ? 6 : 2)}
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
                <BarChart
                  data={commissionData}
                  layout="vertical"
                  margin={{ left: 10, right: 20 }}
                >
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickFormatter={(v: number) => `€${v.toFixed(0)}`}
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
                    formatter={(value: unknown) => [
                      formatCurrency(value as number),
                      "Commission",
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e0dbd3",
                      fontSize: "12px",
                    }}
                  />
                  <Bar
                    dataKey="commission"
                    fill="#f59e0b"
                    radius={[0, 4, 4, 0]}
                    barSize={14}
                    fillOpacity={0.85}
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
