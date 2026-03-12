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
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/* ── Types ─────────────────────────────────────────── */

interface FlowsData {
  totalDeposited: number;
  totalWithdrawn: number;
  netDeployed: number;
  monthlyFlow: Array<{
    month: string;
    deposits: number;
    withdrawals: number;
    cumNet: number;
  }>;
  detail: Array<{
    date: string;
    broker: string;
    flow_type: string;
    amount_eur: number;
    currency: string;
  }>;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const BROKER_COLORS: Record<string, string> = {
  Degiro: "bg-blue-100 text-blue-700 border-blue-200",
  "Trading 212": "bg-emerald-100 text-emerald-700 border-emerald-200",
  Kraken: "bg-purple-100 text-purple-700 border-purple-200",
  IBKR: "bg-red-100 text-red-700 border-red-200",
  Fintual: "bg-amber-100 text-amber-700 border-amber-200",
};

/* ── Component ──────────────────────────────────────── */

export default function FlowsPage() {
  const [data, setData] = useState<FlowsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/flows")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading flows...</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold font-serif">Cash Flows</h1>
        <p className="text-sm text-muted-foreground">
          Capital deposited to and withdrawn from brokers
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          title="Total Deposited"
          value={formatCurrency(data.totalDeposited)}
          subtitle="All time"
        />
        <MetricCard
          title="Total Withdrawn"
          value={formatCurrency(data.totalWithdrawn)}
          subtitle="Returned to bank"
        />
        <MetricCard
          title="Net Deployed"
          value={formatCurrency(data.netDeployed)}
          trend={{
            value: data.totalDeposited > 0
              ? `${((data.totalWithdrawn / data.totalDeposited) * 100).toFixed(0)}% returned`
              : "—",
            positive: data.netDeployed >= 0,
          }}
        />
      </div>

      {/* Monthly bar chart + cumulative line */}
      {data.monthlyFlow.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Monthly Cash Flows &amp; Cumulative Net Deployed
            </p>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.monthlyFlow} barGap={2}>
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickFormatter={(v: string) => {
                      const [y, m] = v.split("-");
                      const label = MONTH_LABELS[parseInt(m) - 1] || v;
                      // Only show year on January
                      return parseInt(m) === 1 ? `${label} '${y.slice(2)}` : label;
                    }}
                  />
                  <YAxis
                    yAxisId="bar"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`}
                    width={50}
                  />
                  <YAxis
                    yAxisId="line"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`}
                    width={50}
                  />
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => {
                      const labels: Record<string, string> = {
                        deposits: "Deposited",
                        withdrawals: "Withdrawn",
                        cumNet: "Net Deployed",
                      };
                      return [formatCurrency(value as number), labels[name as string] || name];
                    }}
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
                  <Legend
                    formatter={(value: string) => {
                      const labels: Record<string, string> = {
                        deposits: "Deposited",
                        withdrawals: "Withdrawn",
                        cumNet: "Net Deployed (cumulative)",
                      };
                      return labels[value] || value;
                    }}
                    wrapperStyle={{ fontSize: "12px" }}
                  />
                  <Bar yAxisId="bar" dataKey="deposits" fill="#16a34a" fillOpacity={0.85} radius={[4, 4, 0, 0]} barSize={16} />
                  <Bar yAxisId="bar" dataKey="withdrawals" fill="#dc2626" fillOpacity={0.75} radius={[4, 4, 0, 0]} barSize={16} />
                  <Line
                    yAxisId="line"
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
          </CardContent>
        </Card>
      )}

      {/* Detail table */}
      {data.detail.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="p-5 pb-0">
              <p className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Transaction History
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Broker</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount (EUR)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.detail.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{row.date}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                          BROKER_COLORS[row.broker] || "bg-gray-100 text-gray-700 border-gray-200"
                        )}
                      >
                        {row.broker}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "text-xs font-medium",
                          row.flow_type === "deposit" ? "text-positive" : "text-negative"
                        )}
                      >
                        {row.flow_type === "deposit" ? "Deposit" : "Withdrawal"}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono text-sm",
                        row.flow_type === "deposit" ? "text-positive" : "text-negative"
                      )}
                    >
                      {row.flow_type === "deposit" ? "+" : "-"}
                      {formatCurrency(Math.abs(row.amount_eur))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
