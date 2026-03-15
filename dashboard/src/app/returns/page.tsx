"use client";

import { useEffect, useState, useMemo } from "react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent } from "@/lib/format";
import { DataTable, ColumnDef } from "@/components/data-table";
import { xirr } from "@/lib/xirr";
import { cn } from "@/lib/utils";
import {
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/* ── Types ─────────────────────────────────────────── */

interface ReturnsData {
  xirrFlows: Array<{ date: string; amount: number }>;
  monthlyFlow: Array<{
    month: string;
    invested: number;
    sold: number;
    dividends: number;
    cumInvested: number;
    cumSold: number;
    cumDividends: number;
    cumNet: number;
  }>;
  closedTrades: Array<{
    ticker: string;
    firstBuy: string;
    lastSell: string;
    costOfSold: number;
    proceeds: number;
    pnl: number;
    pnlPercent: number;
    isFullyClosed: boolean;
    holdingPeriod: string;
  }>;
  totalRealizedPnl: number;
  winRate: number;
  winnersCount: number;
  losersCount: number;
  totalDividends: number;
  dividendsByQuarter: Array<{ label: string; total: number }>;
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

interface DashboardData {
  holdings: Array<{
    ticker: string;
    quantity: number;
    costBasis: number;
  }>;
}

/* ── Constants ──────────────────────────────────────── */

const TIME_RANGES = ["1M", "3M", "6M", "1Y", "All"] as const;
type TimeRange = (typeof TIME_RANGES)[number];

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/* ── Helpers ────────────────────────────────────────── */

function getMonthsBack(range: TimeRange): number {
  switch (range) {
    case "1M": return 1;
    case "3M": return 3;
    case "6M": return 6;
    case "1Y": return 12;
    case "All": return 999;
  }
}

/* ── Component ──────────────────────────────────────── */

export default function ReturnsPage() {
  const [data, setData] = useState<ReturnsData | null>(null);
  const [prices, setPrices] = useState<PricesData | null>(null);
  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("All");

  useEffect(() => {
    Promise.all([
      fetch("/api/returns").then((r) => r.json()),
      fetch("/api/prices").then((r) => r.json()),
      fetch("/api/dashboard").then((r) => r.json()),
    ])
      .then(([returnsData, pricesData, dash]) => {
        setData(returnsData);
        setPrices(pricesData);
        setDashData(dash);
      })
      .finally(() => setLoading(false));
  }, []);

  // XIRR calculation: use actual current market value as terminal cash flow
  const xirrResult = useMemo(() => {
    if (!data || !dashData) return null;
    const marketValue = dashData.holdings.reduce((sum, h) => {
      const p = prices?.prices[h.ticker];
      return sum + (p ? p.priceEur * h.quantity : h.costBasis);
    }, 0);
    if (marketValue <= 0) return null;

    const flows = [
      ...data.xirrFlows.map((f) => ({
        date: new Date(f.date),
        amount: f.amount,
      })),
      { date: new Date(), amount: marketValue },
    ];
    return xirr(flows);
  }, [data, prices, dashData]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading returns...</div>
      </div>
    );
  }

  if (!data) return null;

  /* ── Filtered monthly flow ──────────────────── */

  const monthsBack = getMonthsBack(timeRange);
  const filteredFlow =
    timeRange === "All"
      ? data.monthlyFlow
      : data.monthlyFlow.slice(-monthsBack);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold font-serif">Returns</h1>
        <p className="text-sm text-muted-foreground">
          Performance, realized gains, and dividend income
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="XIRR"
          value={
            xirrResult !== null ? formatPercent(xirrResult * 100) : "N/A"
          }
          subtitle="Annualized return"
        />
        <MetricCard
          title="Realized P&L"
          value={formatCurrency(data.totalRealizedPnl)}
          trend={{
            value:
              data.winnersCount + data.losersCount > 0
                ? `${data.winnersCount}W / ${data.losersCount}L`
                : "—",
            positive: data.totalRealizedPnl >= 0,
          }}
        />
        <MetricCard
          title="Win Rate"
          value={`${data.winRate.toFixed(0)}%`}
          subtitle={`${data.winnersCount + data.losersCount} closed trades`}
        />
        <MetricCard
          title="Total Dividends"
          value={formatCurrency(data.totalDividends)}
          subtitle="All time"
        />
      </div>

      {/* Portfolio Value Over Time */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Portfolio Value Over Time
            </p>
            <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
              {TIME_RANGES.map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={cn(
                    "rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                    timeRange === range
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          {filteredFlow.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data yet</p>
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={filteredFlow}>
                  <defs>
                    <linearGradient
                      id="investedGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#9ca3af"
                        stopOpacity={0.2}
                      />
                      <stop
                        offset="100%"
                        stopColor="#9ca3af"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickFormatter={(v: string) => {
                      const [, m] = v.split("-");
                      return MONTH_LABELS[parseInt(m) - 1] || v;
                    }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickFormatter={(v: number) =>
                      `€${(v / 1000).toFixed(0)}k`
                    }
                    width={50}
                  />
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => [
                      formatCurrency(value as number),
                      name === "cumInvested"
                        ? "Cumulative Invested"
                        : "Net Capital",
                    ]}
                    labelFormatter={(label: unknown) => {
                      const [y, m] = String(label).split("-");
                      const months = [
                        "January", "February", "March", "April",
                        "May", "June", "July", "August",
                        "September", "October", "November", "December",
                      ];
                      return `${months[parseInt(m) - 1]} ${y}`;
                    }}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e0dbd3",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumInvested"
                    stroke="#9ca3af"
                    strokeWidth={1}
                    fill="url(#investedGrad)"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumNet"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Closed Positions */}
      {data.closedTrades.length > 0 && (() => {
        type ClosedTrade = typeof data.closedTrades[0];
        const closedCols: ColumnDef<ClosedTrade>[] = [
          {
            key: "ticker",
            label: "Ticker",
            sortable: true,
            getStringValue: (r) => r.ticker,
            render: (r) => (
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-medium">{r.ticker}</span>
                {!r.isFullyClosed && <Badge variant="outline" className="text-[9px] font-normal">partial</Badge>}
              </div>
            ),
          },
          {
            key: "firstBuy",
            label: "Buy Date",
            sortable: true,
            getStringValue: (r) => r.firstBuy,
            render: (r) => <span className="tabular-nums text-sm">{r.firstBuy}</span>,
          },
          {
            key: "lastSell",
            label: "Sell Date",
            sortable: true,
            getStringValue: (r) => r.lastSell,
            render: (r) => <span className="tabular-nums text-sm">{r.lastSell}</span>,
          },
          {
            key: "pnl",
            label: "P&L",
            sortable: true,
            align: "right",
            footer: "sum",
            getValue: (r) => r.pnl,
            render: (r) => (
              <span className={cn("font-mono text-sm font-medium", r.pnl >= 0 ? "text-positive" : "text-negative")}>
                {formatCurrency(r.pnl)}
              </span>
            ),
          },
          {
            key: "pnlPercent",
            label: "P&L %",
            sortable: true,
            align: "right",
            footer: "avg",
            getValue: (r) => r.pnlPercent,
            render: (r) => (
              <span className={cn("font-mono text-sm", r.pnlPercent >= 0 ? "text-positive" : "text-negative")}>
                {formatPercent(r.pnlPercent)}
              </span>
            ),
          },
          // Secondary
          {
            key: "costOfSold",
            label: "Cost",
            secondary: true,
            sortable: true,
            align: "right",
            footer: "sum",
            getValue: (r) => r.costOfSold,
            render: (r) => <span className="font-mono text-sm">{formatCurrency(r.costOfSold)}</span>,
          },
          {
            key: "proceeds",
            label: "Proceeds",
            secondary: true,
            sortable: true,
            align: "right",
            footer: "sum",
            getValue: (r) => r.proceeds,
            render: (r) => <span className="font-mono text-sm">{formatCurrency(r.proceeds)}</span>,
          },
          {
            key: "holdingPeriod",
            label: "Period",
            secondary: true,
            sortable: false,
            align: "right",
            render: (r) => <span className="text-sm text-muted-foreground">{r.holdingPeriod}</span>,
          },
        ];
        return (
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Closed Positions
            </p>
            <DataTable<ClosedTrade>
              data={data.closedTrades}
              columns={closedCols}
              defaultSort={{ key: "lastSell", dir: "desc" }}
              storageKey="returns-closed"
              getRowKey={(r, i) => `${r.ticker}-${r.lastSell}-${i}`}
            />
          </div>
        );
      })()}

      {/* Dividends by Quarter */}
      {data.dividendsByQuarter.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Dividends by Quarter
            </p>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.dividendsByQuarter}
                  barCategoryGap="25%"
                >
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: "#6b7280" }}
                    angle={-45}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickFormatter={(v: number) => `€${v.toFixed(0)}`}
                    width={50}
                  />
                  <Tooltip
                    formatter={(value: unknown) => [
                      formatCurrency(value as number),
                      "Dividends",
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e0dbd3",
                      fontSize: "12px",
                    }}
                  />
                  <Bar
                    dataKey="total"
                    fill="#16a34a"
                    radius={[4, 4, 0, 0]}
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
