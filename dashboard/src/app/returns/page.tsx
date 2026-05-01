"use client";

import { useEffect, useState } from "react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber, formatPercent, formatDate } from "@/lib/format";
import { DataTable, ColumnDef } from "@/components/data-table";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

/* ── Types ─────────────────────────────────────────── */

interface ClosedTrade {
  ticker: string;
  firstBuy: string;
  lastSell: string;
  costOfSold: number;
  proceeds: number;
  pnl: number;
  pnlPercent: number;
  isFullyClosed: boolean;
  holdingPeriod: string;
  holdingDays: number;
}

interface ReturnsData {
  closedTrades: ClosedTrade[];
  totalRealizedPnl: number;
  totalCostOfSold: number;
  winRate: number;
  winnersCount: number;
  losersCount: number;
  avgHoldingDays: number;
  totalDividends: number;
  dividendsByQuarter: Array<{ label: string; total: number }>;
}

/* ── Helpers ─────────────────────────────────────────── */

function formatHoldingDays(days: number): string {
  if (days < 30)       return `${days}d`;
  if (days < 365)      return `${Math.floor(days / 30)} meses`;
  const years  = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return months > 0 ? `${years}a ${months}m` : `${years} año${years > 1 ? "s" : ""}`;
}

/* ── Component ──────────────────────────────────────── */

export default function ReturnsPage() {
  const [data, setData] = useState<ReturnsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/returns")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!data) return null;

  const rentabilidad = data.totalCostOfSold > 0
    ? (data.totalRealizedPnl / data.totalCostOfSold) * 100
    : 0;

  // Bar chart data: sorted best → worst by pnlPercent
  const barData = [...data.closedTrades].sort((a, b) => b.pnlPercent - a.pnlPercent);

  // Dynamic bar chart height: at least 200px, 40px per trade
  const barHeight = Math.max(200, barData.length * 44);

  /* ── Column definitions ──────────────────────────── */

  const columns: ColumnDef<ClosedTrade>[] = [
    {
      key: "ticker",
      label: "Ticker",
      sortable: true,
      getStringValue: (r) => r.ticker,
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-medium">{r.ticker}</span>
          {!r.isFullyClosed && (
            <Badge variant="outline" className="text-[9px] font-normal">
              partial
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "holdingPeriod",
      label: "Período",
      sortable: true,
      getValue: (r) => r.holdingDays,
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.holdingPeriod}</span>
      ),
    },
    {
      key: "pnl",
      label: "P&L",
      sortable: true,
      align: "right",
      footer: "sum",
      getValue: (r) => r.pnl,
      render: (r) => (
        <span
          className={cn(
            "font-mono text-sm font-medium",
            r.pnl >= 0 ? "text-positive" : "text-negative"
          )}
        >
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
        <span
          className={cn(
            "font-mono text-sm font-semibold",
            r.pnlPercent >= 0 ? "text-positive" : "text-negative"
          )}
        >
          {formatPercent(r.pnlPercent)}
        </span>
      ),
    },
    // Secondary columns
    {
      key: "costOfSold",
      label: "Coste",
      secondary: true,
      sortable: true,
      align: "right",
      footer: "sum",
      getValue: (r) => r.costOfSold,
      render: (r) => (
        <span className="font-mono text-sm">{formatCurrency(r.costOfSold)}</span>
      ),
    },
    {
      key: "proceeds",
      label: "Proceeds",
      secondary: true,
      sortable: true,
      align: "right",
      footer: "sum",
      getValue: (r) => r.proceeds,
      render: (r) => (
        <span className="font-mono text-sm">{formatCurrency(r.proceeds)}</span>
      ),
    },
    {
      key: "firstBuy",
      label: "Primera compra",
      secondary: true,
      sortable: true,
      getStringValue: (r) => r.firstBuy,
      render: (r) => (
        <span className="tabular-nums text-sm text-muted-foreground">
          {formatDate(r.firstBuy)}
        </span>
      ),
    },
    {
      key: "lastSell",
      label: "Última venta",
      secondary: true,
      sortable: true,
      getStringValue: (r) => r.lastSell,
      render: (r) => (
        <span className="tabular-nums text-sm text-muted-foreground">
          {formatDate(r.lastSell)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold font-serif">Returns</h1>
        <p className="text-sm text-muted-foreground">
          Análisis de posiciones cerradas y rentabilidad realizada
        </p>
      </div>

      {/* ── KPIs ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="P&L Realizado"
          value={formatCurrency(data.totalRealizedPnl, 0)}
          trend={{
            value: `${data.winnersCount}G / ${data.losersCount}P`,
            positive: data.totalRealizedPnl >= 0,
          }}
        />
        <MetricCard
          title="Rentabilidad"
          value={formatPercent(rentabilidad)}
          subtitle={`sobre ${formatCurrency(data.totalCostOfSold, 0)} invertidos`}
        />
        <MetricCard
          title="Período medio"
          value={formatHoldingDays(data.avgHoldingDays)}
          subtitle={`${data.winnersCount + data.losersCount} posiciones cerradas`}
        />
        <MetricCard
          title="Win Rate"
          value={`${formatNumber(data.winRate, 0)}%`}
          subtitle={`${data.winnersCount}G · ${data.losersCount}P`}
        />
      </div>

      {/* ── P&L por posición ─────────────────────────── */}
      {barData.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              P&L por posición (% sobre coste)
            </p>
            <div style={{ height: barHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barData}
                  layout="vertical"
                  margin={{ left: 8, right: 40, top: 4, bottom: 4 }}
                >
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${formatNumber(v, 0)}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="ticker"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "#1a1a1a", fontFamily: "monospace" }}
                    width={52}
                  />
                  <ReferenceLine x={0} stroke="#e5e7eb" strokeWidth={1} />
                  <Tooltip
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    formatter={(value: unknown, _: unknown, props: { payload?: ClosedTrade }) => {
                      const t = props.payload;
                      if (!t) return [formatPercent(value as number), "P&L %"];
                      return [
                        `${formatPercent(value as number)}  ·  ${formatCurrency(t.pnl)}`,
                        t.ticker,
                      ];
                    }}
                    labelFormatter={() => ""}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="pnlPercent" barSize={18} radius={[0, 4, 4, 0]}>
                    {barData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.pnlPercent >= 0 ? "#16a34a" : "#dc2626"}
                        fillOpacity={0.82}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tabla de posiciones cerradas ─────────────── */}
      {data.closedTrades.length > 0 && (
        <div>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Detalle de posiciones cerradas
          </p>
          <DataTable<ClosedTrade>
            data={data.closedTrades}
            columns={columns}
            defaultSort={{ key: "pnl", dir: "desc" }}
            storageKey="returns-closed"
            getRowKey={(r, i) => `${r.ticker}-${r.lastSell}-${i}`}
          />
        </div>
      )}

      {/* ── Dividendos por trimestre ──────────────────── */}
      {data.dividendsByQuarter.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Dividendos por trimestre
              </p>
              <p className="text-xs text-muted-foreground">
                Total:{" "}
                <span className="font-medium text-foreground">
                  {formatCurrency(data.totalDividends, 0)}
                </span>
              </p>
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dividendsByQuarter} barCategoryGap="25%">
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
                    tickFormatter={(v: number) => `€${formatNumber(v, 0)}`}
                    width={55}
                  />
                  <Tooltip
                    formatter={(value: unknown) => [
                      formatCurrency(value as number),
                      "Dividendos",
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      fontSize: "12px",
                    }}
                  />
                  <Bar
                    dataKey="total"
                    fill="#16a34a"
                    radius={[4, 4, 0, 0]}
                    fillOpacity={0.82}
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
