"use client";

import { useEffect, useState } from "react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatNumber, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DataTable, ColumnDef } from "@/components/data-table";
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
          value={formatCurrency(data.totalDeposited, 0)}
          subtitle="All time"
        />
        <MetricCard
          title="Total Withdrawn"
          value={formatCurrency(data.totalWithdrawn, 0)}
          subtitle="Returned to bank"
        />
        <MetricCard
          title="Net Deployed"
          value={formatCurrency(data.netDeployed, 0)}
          trend={{
            value: data.totalDeposited > 0
              ? `${formatNumber((data.totalWithdrawn / data.totalDeposited) * 100, 0)}% returned`
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
                    formatter={(value, name) => {
                      const labels: Record<string, string> = {
                        deposits: "Deposited",
                        withdrawals: "Withdrawn",
                        cumNet: "Net Deployed",
                      };
                      const key = String(name ?? "");
                      return [formatCurrency(value as number), labels[key] || key];
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
      {data.detail.length > 0 && (() => {
        type FlowRow = typeof data.detail[0];
        const flowCols: ColumnDef<FlowRow>[] = [
          {
            key: "date",
            label: "Date",
            sortable: true,
            getStringValue: (r) => r.date,
            render: (r) => <span className="tabular-nums text-sm">{formatDate(r.date)}</span>,
          },
          {
            key: "broker",
            label: "Broker",
            sortable: true,
            getStringValue: (r) => r.broker,
            render: (r) => (
              <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium", BROKER_COLORS[r.broker] || "bg-gray-100 text-gray-700 border-gray-200")}>
                {r.broker}
              </span>
            ),
          },
          {
            key: "flow_type",
            label: "Type",
            sortable: true,
            getStringValue: (r) => r.flow_type,
            render: (r) => (
              <span className={cn("text-xs font-medium", r.flow_type === "deposit" ? "text-positive" : "text-negative")}>
                {r.flow_type === "deposit" ? "Deposit" : "Withdrawal"}
              </span>
            ),
          },
          {
            key: "amount_eur",
            label: "Amount (EUR)",
            sortable: true,
            align: "right",
            footer: "sum",
            getValue: (r) => r.amount_eur,
            render: (r) => (
              <span className={cn("font-mono text-sm", r.flow_type === "deposit" ? "text-positive" : "text-negative")}>
                {r.flow_type === "deposit" ? "+" : "-"}{formatCurrency(Math.abs(r.amount_eur))}
              </span>
            ),
          },
        ];
        return (
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Transaction History
            </p>
            <DataTable<FlowRow>
              data={data.detail}
              columns={flowCols}
              defaultSort={{ key: "date", dir: "desc" }}
              storageKey="flows"
              getRowKey={(r, i) => `${r.date}-${r.broker}-${i}`}
            />
          </div>
        );
      })()}
    </div>
  );
}
