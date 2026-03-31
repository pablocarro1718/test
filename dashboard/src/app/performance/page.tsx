"use client";

import { useEffect, useState } from "react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

interface ClosedTrade {
  ticker: string;
  qtySold: number;
  costOfSold: number;
  proceeds: number;
  pnl: number;
  pnlPercent: number;
  isFullyClosed: boolean;
}

interface PerformanceData {
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
  closedTrades: ClosedTrade[];
  totalRealizedPnl: number;
  winRate: number;
  bestTrade: ClosedTrade | null;
  worstTrade: ClosedTrade | null;
  dividendsByMonth: Array<{ month: string; total: number }>;
  totalDividends: number;
}

export default function PerformancePage() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/performance")
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif">Performance</h1>
        <p className="text-sm text-muted-foreground">
          Returns, P&L, and investment flow
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Realized P&L"
          value={formatCurrency(data.totalRealizedPnl, 0)}
          trend={{
            value: formatPercent(
              data.totalRealizedPnl >= 0 ? data.winRate : -data.winRate
            ),
            positive: data.totalRealizedPnl >= 0,
          }}
          subtitle="From closed positions"
        />
        <MetricCard
          title="Win Rate"
          value={`${formatNumber(data.winRate, 0)}%`}
          subtitle={`${data.closedTrades.filter((t) => t.pnl > 0).length}W / ${data.closedTrades.filter((t) => t.pnl < 0).length}L`}
        />
        <MetricCard
          title="Best Trade"
          value={data.bestTrade?.ticker || "-"}
          trend={
            data.bestTrade
              ? {
                  value: formatCurrency(data.bestTrade.pnl, 0),
                  positive: true,
                }
              : undefined
          }
        />
        <MetricCard
          title="Total Dividends"
          value={formatCurrency(data.totalDividends, 0)}
          subtitle={`${data.dividendsByMonth.length} months with income`}
        />
      </div>

      {/* Cumulative Investment Chart */}
      <Card>
        <CardContent className="p-4">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cumulative Investment Over Time
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.monthlyFlow}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => v.slice(2)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value) => [
                    formatCurrency(Number(value)),
                    undefined,
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="cumInvested"
                  name="Total Invested"
                  stroke="var(--chart-1)"
                  fill="var(--chart-1)"
                  fillOpacity={0.1}
                />
                <Area
                  type="monotone"
                  dataKey="cumDividends"
                  name="Cum. Dividends"
                  stroke="var(--chart-2)"
                  fill="var(--chart-2)"
                  fillOpacity={0.1}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Flow Bar Chart */}
      <Card>
        <CardContent className="p-4">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Monthly Investment Flow
          </p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthlyFlow}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => v.slice(2)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value) => [
                    formatCurrency(Number(value)),
                    undefined,
                  ]}
                />
                <Bar
                  dataKey="invested"
                  name="Bought"
                  fill="var(--chart-1)"
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="sold"
                  name="Sold"
                  fill="var(--chart-3)"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Closed Trades Table */}
      <Card>
        <CardContent className="p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Closed Positions — Realized P&L
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Cost Sold</TableHead>
                <TableHead className="text-right">Proceeds</TableHead>
                <TableHead className="text-right">P&L</TableHead>
                <TableHead className="text-right">P&L %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.closedTrades.map((t) => (
                <TableRow key={t.ticker}>
                  <TableCell className="font-mono font-medium">
                    {t.ticker}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={t.isFullyClosed ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {t.isFullyClosed ? "Closed" : "Partial"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(t.costOfSold)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(t.proceeds)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono text-sm font-medium ${t.pnl >= 0 ? "text-positive" : "text-negative"}`}
                  >
                    {formatCurrency(t.pnl)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono text-sm ${t.pnlPercent >= 0 ? "text-positive" : "text-negative"}`}
                  >
                    {formatPercent(t.pnlPercent)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
