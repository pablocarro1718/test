"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber, formatPercent, formatPriceOriginal } from "@/lib/format";
import { xirr } from "@/lib/xirr";
import { cn } from "@/lib/utils";
import {
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
  tirFlows: Array<{ date: string; amount: number; open: boolean }>;
  externalValue: number;
  cashBalance: number;
  externalPositions: Array<{ platform: string; description: string; value_eur: number }>;
  allocation: Array<{ assetType: string; costBasis: number }>;
  byGeography: Array<{ name: string; value: number; percent: number }>;
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

const GEO_COLORS: Record<string, string> = {
  "North America": "#3b82f6",
  "Europe":        "#10b981",
  "Asia":          "#ef4444",
  "Latam":         "#8b5cf6",
  "Crypto":        "#f59e0b",
  "Global":        "#6b7280",
  "Other":         "#9ca3af",
};

/* ── Custom pie tooltip ─────────────────────────────── */

function PieTooltipContent({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { pct: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-mono font-semibold">{d.name}</p>
      <p className="text-muted-foreground">{formatCurrency(d.value)}</p>
      <p className="font-medium">{formatNumber(d.payload.pct, 1)}%</p>
    </div>
  );
}

/* ── Period selector ────────────────────────────────── */

type Period = "1D" | "1W" | "1M" | "YTD" | "1Y" | "ALL";

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: "1D",  label: "1D"  },
  { key: "1W",  label: "1S"  },
  { key: "1M",  label: "1M"  },
  { key: "YTD", label: "YTD" },
  { key: "1Y",  label: "1A"  },
  { key: "ALL", label: "TODO" },
];

/* ── Component ──────────────────────────────────────── */

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [prices, setPrices] = useState<PricesData | null>(null);
  const [loading, setLoading] = useState(true);

  // Period selector state — hooks must be before any conditional returns
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("1D");
  const [fetchedReturn, setFetchedReturn] = useState<{ changeEur: number; changePercent: number } | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  // Ref holds current marketValue so the async handler always uses the latest value
  const marketValueRef = useRef(0);

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

  // Money-weighted TIR (XIRR) on securities operations, with current market value as the
  // terminal flow. Two views: full history (all positions) and live portfolio (open only).
  // Deposits/idle cash are excluded upstream, so uninvested cash never distorts these.
  const now = new Date();
  const tirGeneral = xirr([
    ...data.tirFlows.map((f) => ({ date: new Date(f.date), amount: f.amount })),
    { date: now, amount: marketValue },
  ]);
  const tirVivo = xirr([
    ...data.tirFlows
      .filter((f) => f.open)
      .map((f) => ({ date: new Date(f.date), amount: f.amount })),
    { date: now, amount: marketValue },
  ]);

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
        price: p?.price || 0,
        currency: p?.currency || h.currency || "EUR",
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

  // Daily portfolio change (sum of price move × quantity for each holding)
  const dailyChange = data.holdings.reduce((sum, h) => {
    const p = prices?.prices[h.ticker];
    if (!p || !p.changePercent) return sum;
    return sum + (p.priceEur * h.quantity * p.changePercent) / 100;
  }, 0);
  const prevMarketValue = marketValue - dailyChange;
  const dailyChangePct = prevMarketValue > 0 ? (dailyChange / prevMarketValue) * 100 : 0;

  // Is weekend?
  const dayOfWeek = new Date().getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Keep ref in sync so the async handler always uses the latest market value
  marketValueRef.current = marketValue;

  // Period change handler (defined after marketValue is available)
  async function handlePeriodChange(period: Period) {
    setSelectedPeriod(period);
    if (period === "1D" || period === "ALL") {
      setPeriodLoading(false);
      return;
    }
    setPeriodLoading(true);
    setFetchedReturn(null);
    try {
      const res = await fetch(
        `/api/period-returns?period=${period}&endValue=${Math.round(marketValueRef.current)}`
      );
      if (res.ok) {
        const json = await res.json();
        setFetchedReturn({ changeEur: json.changeEur, changePercent: json.changePercent });
      }
    } catch { /* noop */ }
    finally { setPeriodLoading(false); }
  }

  // Values for the selected period (1D and ALL computed locally, others from fetch)
  const currentPeriodChange =
    selectedPeriod === "1D"  ? { changeEur: dailyChange,    changePercent: dailyChangePct  } :
    selectedPeriod === "ALL" ? { changeEur: unrealizedPnl,  changePercent: unrealizedPct   } :
    fetchedReturn;

  const PERIOD_DESCRIPTIONS: Record<Period, string> = {
    "1D":  isWeekend ? "Último día" : "Hoy",
    "1W":  "Última semana",
    "1M":  "Último mes",
    "YTD": "Este año",
    "1Y":  "Último año",
    "ALL": "P&L no realizado",
  };

  return (
    <div className="space-y-5">
      {/* ── Hero Card ────────────────────────────── */}
      <Card>
        <CardContent className="p-6">

          {/* Top row: label + period tabs */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Portfolio Value
            </p>
            <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => handlePeriodChange(p.key)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    selectedPeriod === p.key
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Portfolio value */}
          <p className="mt-2 text-5xl font-bold tracking-tight tabular-nums">
            {formatCurrency(marketValue, 0)}
          </p>

          {/* Period return row */}
          <div className="mt-4 h-12 flex items-center">
            {periodLoading ? (
              <div className="flex items-center gap-3">
                <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
                <div className="h-5 w-16 animate-pulse rounded-md bg-muted" />
              </div>
            ) : currentPeriodChange !== null ? (
              <div className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-0.5",
                currentPeriodChange.changeEur >= 0 ? "text-positive" : "text-negative"
              )}>
                <div className="flex items-center gap-1.5 text-2xl font-bold tabular-nums">
                  {currentPeriodChange.changeEur >= 0
                    ? <ArrowUpRight className="h-6 w-6 shrink-0" />
                    : <ArrowDownRight className="h-6 w-6 shrink-0" />}
                  {formatCurrency(Math.abs(currentPeriodChange.changeEur), 0)}
                </div>
                <span className="text-base font-semibold tabular-nums">
                  {formatPercent(currentPeriodChange.changePercent)}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {PERIOD_DESCRIPTIONS[selectedPeriod]}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
              </div>
            )}
          </div>

          {/* Metadata footer */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground border-t border-border/40 pt-3">
            <span>
              Cost Basis:{" "}
              <span className="font-medium text-foreground">
                {formatCurrency(data.openCostBasis, 0)}
              </span>
            </span>
            <span className="text-border select-none">·</span>
            <span title="Rentabilidad anualizada (money-weighted) de todo tu histórico: posiciones abiertas y cerradas">
              TIR general:{" "}
              <span className={cn(
                "font-medium",
                tirGeneral !== null && tirGeneral >= 0 ? "text-positive"
                  : tirGeneral !== null ? "text-negative"
                  : "text-foreground"
              )}>
                {tirGeneral !== null ? formatPercent(tirGeneral * 100) : "N/A"}
              </span>
            </span>
            <span className="text-border select-none">·</span>
            <span title="Rentabilidad anualizada (money-weighted) de las posiciones que tienes abiertas ahora mismo">
              TIR vivo:{" "}
              <span className={cn(
                "font-medium",
                tirVivo !== null && tirVivo >= 0 ? "text-positive"
                  : tirVivo !== null ? "text-negative"
                  : "text-foreground"
              )}>
                {tirVivo !== null ? formatPercent(tirVivo * 100) : "N/A"}
              </span>
            </span>
            <span className="text-border select-none">·</span>
            <span>
              <span className="font-medium text-foreground">{data.positionsCount}</span>{" "}
              posiciones abiertas
            </span>
            {(data.cashBalance ?? 0) > 0 && (
              <>
                <span className="text-border select-none">·</span>
                <span title="Efectivo sin invertir en el broker (no cuenta en la TIR ni en el valor de cartera)">
                  Cash en broker:{" "}
                  <span className="font-medium text-foreground">
                    {formatCurrency(data.cashBalance, 0)}
                  </span>
                </span>
              </>
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
                            {formatPriceOriginal(m.price, m.currency)}
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
                            {formatPriceOriginal(m.price, m.currency)}
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
                      {formatNumber(a.pct, 1)}%
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
                          {formatNumber(entry.pct, 1)}%
                        </td>
                        <td className="py-1 text-right font-mono tabular-nums text-muted-foreground">
                          {formatCurrency(entry.value, 0)}
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

      {/* ── Geography Breakdown ──────────────────── */}
      {data.byGeography.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Geographic Exposure
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
              {/* Donut chart */}
              <div className="h-[160px] w-full sm:w-[160px] sm:shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.byGeography}
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                      isAnimationActive={false}
                    >
                      {data.byGeography.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={GEO_COLORS[entry.name] ?? "#9ca3af"}
                          stroke="transparent"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: unknown) => [formatCurrency(v as number, 0), undefined]}
                      contentStyle={{ borderRadius: "8px", border: "1px solid var(--border)", fontSize: "12px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend table */}
              <div className="flex-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="pb-1.5 text-left font-medium">Region</th>
                      <th className="pb-1.5 text-right font-medium">%</th>
                      <th className="pb-1.5 text-right font-medium">Cost Basis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byGeography.map((entry) => (
                      <tr key={entry.name} className="border-t border-border/40">
                        <td className="py-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: GEO_COLORS[entry.name] ?? "#9ca3af" }}
                            />
                            <span className="font-medium">{entry.name}</span>
                          </div>
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                          {formatNumber(entry.percent, 1)}%
                        </td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                          {formatCurrency(entry.value, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
