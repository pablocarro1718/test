"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent } from "@/lib/format";
import { xirr } from "@/lib/xirr";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────── */

interface DashboardData {
  holdings: Array<{
    ticker: string;
    name: string;
    assetType: string;
    currency: string;
    quantity: number;
    costBasis: number;
  }>;
  openCostBasis: number;
  positionsCount: number;
  allTime: {
    totalInvested: number;
    totalSold: number;
    totalDividends: number;
    realizedPnl: number;
  };
  xirrFlows: Array<{ date: string; amount: number }>;
  externalValue: number;
  externalPositions: Array<{ platform: string; description: string; value_eur: number }>;
  allocation: Array<{ assetType: string; costBasis: number }>;
  topHoldings: Array<{
    ticker: string;
    name: string;
    assetType: string;
    currency: string;
    quantity: number;
    costBasis: number;
  }>;
  monthlyPulse: Array<{ month: string; netChange: number }>;
  byBroker: Array<{ broker: string; invested: number }>;
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

/* ── Color maps ─────────────────────────────────────── */

const ASSET_COLORS: Record<string, string> = {
  Stock: "#3b82f6",
  ETF: "#8b5cf6",
  Crypto: "#f59e0b",
  Unknown: "#9ca3af",
};

const PIE_COLORS = [
  "#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#6366f1",
  "#14b8a6", "#a855f7", "#f43f5e", "#22c55e", "#0ea5e9",
];

/* ── Custom pie tooltip ─────────────────────────────── */

function PieTooltipContent({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { pct: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-mono font-semibold">{d.name}</p>
      <p className="text-muted-foreground">{formatCurrency(d.value)}</p>
      <p className="font-medium">{d.payload.pct.toFixed(1)}%</p>
    </div>
  );
}

/* ── Component ──────────────────────────────────────── */

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [prices, setPrices] = useState<PricesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard").then((r) => r.json()),
      fetch("/api/prices").then((r) => r.json()),
    ])
      .then(([dashData, pricesData]) => {
        setData(dashData);
        setPrices(pricesData);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-sm text-muted-foreground">
          Loading portfolio...
        </div>
      </div>
    );
  }

  if (!data) return null;

  /* ── Derived values ─────────────────────────────── */

  // Market value from live prices + external positions (e.g. Fintual)
  const stocksValue = data.holdings.reduce((sum, h) => {
    const p = prices?.prices[h.ticker];
    return sum + (p ? p.priceEur * h.quantity : h.costBasis);
  }, 0);
  const marketValue = stocksValue + (data.externalValue ?? 0);

  const unrealizedPnl = marketValue - data.openCostBasis;
  const unrealizedPct =
    data.openCostBasis > 0
      ? ((marketValue - data.openCostBasis) / data.openCostBasis) * 100
      : 0;

  // XIRR
  const xirrFlowsDated = [
    ...data.xirrFlows.map((f) => ({
      date: new Date(f.date),
      amount: f.amount,
    })),
    { date: new Date(), amount: marketValue },
  ];
  const xirrResult = xirr(xirrFlowsDated);

  // Sparkline data: build cumulative flow from monthlyPulse
  let cumulative = data.openCostBasis;
  const sparkData = data.monthlyPulse.map((m) => {
    cumulative += m.netChange;
    return { month: m.month, value: cumulative };
  });
  if (sparkData.length > 0) {
    sparkData.push({ month: "now", value: marketValue });
  }

  // Today's movers: sort holdings by changePercent
  const movers = data.holdings
    .map((h) => {
      const p = prices?.prices[h.ticker];
      return {
        ticker: h.ticker,
        name: h.name,
        change: p?.change || 0,
        changePercent: p?.changePercent || 0,
        priceEur: p?.priceEur || 0,
      };
    })
    .filter((m) => m.changePercent !== 0);

  const gainers = [...movers]
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 6);
  const losers = [...movers]
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 6)
    .filter((m) => m.changePercent < 0);

  // Allocation: compute by market value (includes external positions)
  const allocationByType: Record<string, number> = {};
  for (const h of data.holdings) {
    const p = prices?.prices[h.ticker];
    const val = p ? p.priceEur * h.quantity : h.costBasis;
    const type = h.assetType || "Unknown";
    allocationByType[type] = (allocationByType[type] || 0) + val;
  }
  // Add external positions as "Fondo Externo" asset type
  if ((data.externalValue ?? 0) > 0) {
    allocationByType["Fondo Externo"] = (allocationByType["Fondo Externo"] || 0) + data.externalValue;
  }
  const totalAllocation = Object.values(allocationByType).reduce(
    (s, v) => s + v,
    0
  );
  const allocationEntries = Object.entries(allocationByType)
    .map(([type, value]) => ({
      type,
      value,
      pct: totalAllocation > 0 ? (value / totalAllocation) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // Pie chart data: all tickers by market value + external positions
  const externalPieEntries = (data.externalPositions ?? []).map((ep) => ({
    name: ep.platform,
    value: ep.value_eur,
    pct: totalAllocation > 0 ? (ep.value_eur / totalAllocation) * 100 : 0,
  }));
  const pieData = [
    ...data.holdings
      .map((h) => {
        const p = prices?.prices[h.ticker];
        const val = p ? p.priceEur * h.quantity : h.costBasis;
        return { name: h.ticker, value: val, pct: totalAllocation > 0 ? (val / totalAllocation) * 100 : 0 };
      }),
    ...externalPieEntries,
  ].sort((a, b) => b.value - a.value);

  // Is weekend?
  const dayOfWeek = new Date().getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  return (
    <div className="space-y-5">
      {/* ── Hero Card ────────────────────────────── */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Portfolio Value
              </p>
              <p className="mt-1 text-4xl font-bold tracking-tight">
                {formatCurrency(marketValue)}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 text-sm font-semibold",
                    unrealizedPnl >= 0 ? "text-positive" : "text-negative"
                  )}
                >
                  {unrealizedPnl >= 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                  {formatCurrency(Math.abs(unrealizedPnl))} (
                  {formatPercent(unrealizedPct)})
                </span>
                <span className="text-xs text-muted-foreground">
                  unrealized
                </span>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  Cost Basis:{" "}
                  <span className="font-medium text-foreground">
                    {formatCurrency(data.openCostBasis)}
                  </span>
                </span>
                <span className="text-border">·</span>
                <span>
                  Total Invested:{" "}
                  <span className="font-medium text-foreground">
                    {formatCurrency(data.allTime.totalInvested)}
                  </span>
                </span>
                <span className="text-border">·</span>
                <span>
                  XIRR:{" "}
                  <span
                    className={cn(
                      "font-medium",
                      xirrResult !== null && xirrResult >= 0
                        ? "text-positive"
                        : xirrResult !== null
                          ? "text-negative"
                          : "text-foreground"
                    )}
                  >
                    {xirrResult !== null
                      ? formatPercent(xirrResult * 100)
                      : "N/A"}
                  </span>
                </span>
              </div>
            </div>
            {/* Sparkline */}
            {sparkData.length > 1 && (
              <div className="ml-4 h-[50px] w-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparkData}>
                    <defs>
                      <linearGradient
                        id="sparkGrad"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={
                            unrealizedPnl >= 0 ? "#16a34a" : "#dc2626"
                          }
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="100%"
                          stopColor={
                            unrealizedPnl >= 0 ? "#16a34a" : "#dc2626"
                          }
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={unrealizedPnl >= 0 ? "#16a34a" : "#dc2626"}
                      strokeWidth={1.5}
                      fill="url(#sparkGrad)"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Today's Movers + Allocation ──────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Today's Movers */}
        <Card>
          <CardContent className="p-5">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isWeekend ? "This Week's Movers" : "Today's Movers"}
            </p>
            {movers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No price changes available
              </p>
            ) : (
              <div className="space-y-4">
                {/* Gainers */}
                {gainers.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <TrendingUp className="h-3.5 w-3.5 text-positive" />
                      <span>Gainers</span>
                    </div>
                    {gainers.map((m) => (
                      <div
                        key={m.ticker}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="font-mono text-xs"
                          >
                            {m.ticker}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                            {m.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {formatCurrency(m.priceEur)}
                          </span>
                          <span className="text-xs font-semibold text-positive">
                            {formatPercent(m.changePercent)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Losers */}
                {losers.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <TrendingDown className="h-3.5 w-3.5 text-negative" />
                      <span>Losers</span>
                    </div>
                    {losers.map((m) => (
                      <div
                        key={m.ticker}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="font-mono text-xs"
                          >
                            {m.ticker}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                            {m.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {formatCurrency(m.priceEur)}
                          </span>
                          <span className="text-xs font-semibold text-negative">
                            {formatPercent(m.changePercent)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Allocation Snapshot */}
        <Card>
          <CardContent className="p-5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Allocation
            </p>
            {/* Stacked bar */}
            <div className="mb-2 flex h-3 overflow-hidden rounded-full">
              {allocationEntries.map((a) => (
                <div
                  key={a.type}
                  style={{
                    width: `${a.pct}%`,
                    backgroundColor: ASSET_COLORS[a.type] || "#9ca3af",
                  }}
                />
              ))}
            </div>
            {/* Legend */}
            <div className="mb-4 flex items-center gap-4">
              {allocationEntries.map((a) => (
                <div key={a.type} className="flex items-center gap-1.5">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: ASSET_COLORS[a.type] || "#9ca3af",
                    }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {a.type}{" "}
                    <span className="font-medium text-foreground">
                      {a.pct.toFixed(1)}%
                    </span>
                  </span>
                </div>
              ))}
            </div>
            {/* Pie chart */}
            {pieData.length > 0 && (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={1}
                      dataKey="value"
                      isAnimationActive={false}
                    >
                      {pieData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                          fillOpacity={0.9}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltipContent />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Legend table */}
            {pieData.length > 0 && (
              <div className="mt-4 max-h-[180px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="pb-1.5 text-left font-medium">Asset</th>
                      <th className="pb-1.5 text-right font-medium">%</th>
                      <th className="pb-1.5 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pieData.map((entry, i) => (
                      <tr key={entry.name} className="border-t border-border/40">
                        <td className="py-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                            />
                            <span className="font-mono font-medium">{entry.name}</span>
                          </div>
                        </td>
                        <td className="py-1 text-right tabular-nums text-muted-foreground">
                          {entry.pct.toFixed(1)}%
                        </td>
                        <td className="py-1 text-right font-mono tabular-nums text-muted-foreground">
                          {formatCurrency(entry.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
