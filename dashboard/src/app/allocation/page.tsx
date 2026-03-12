"use client";

import { useEffect, useState } from "react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface AllocationEntry {
  name: string;
  value: number;
  percent: number;
}

interface AllocationData {
  totalValue: number;
  byAssetType: AllocationEntry[];
  byCurrency: AllocationEntry[];
  byBroker: AllocationEntry[];
  byGeography: AllocationEntry[];
  uniqueCurrencies: number;
  uniqueBrokers: number;
  topConcentration: { ticker: string; costBasis: number } | null;
}

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#a855f7",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

function AllocationSection({
  title,
  data,
  total,
}: {
  title: string;
  data: AllocationEntry[];
  total: number;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <div className="flex items-center gap-6">
          <div className="h-36 w-36 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={60}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {data.map((_, i) => (
                    <Cell
                      key={i}
                      fill={COLORS[i % COLORS.length]}
                      stroke="transparent"
                    />
                  ))}
                </Pie>
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
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2">
            {data.map((item, i) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-sm">{item.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">
                    {formatCurrency(item.value, 0)}
                  </span>
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    {item.percent.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AllocationPage() {
  const [data, setData] = useState<AllocationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/allocation")
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

  const cryptoEntry = data.byAssetType.find((a) => a.name === "Crypto");
  const cryptoPercent = cryptoEntry?.percent || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif">Allocation</h1>
        <p className="text-sm text-muted-foreground">
          Portfolio exposure by type, currency, geography, and broker
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Currency Exposure"
          value={`${data.uniqueCurrencies} currencies`}
          subtitle="EUR, USD, CAD..."
        />
        <MetricCard
          title="Top Concentration"
          value={data.topConcentration?.ticker || "-"}
          subtitle={
            data.topConcentration
              ? formatCurrency(data.topConcentration.costBasis)
              : undefined
          }
        />
        <MetricCard
          title="Crypto Weight"
          value={`${cryptoPercent.toFixed(1)}%`}
          subtitle="Of total portfolio"
        />
        <MetricCard
          title="Active Brokers"
          value={`${data.uniqueBrokers}`}
          subtitle="Multi-broker portfolio"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AllocationSection
          title="By Asset Type"
          data={data.byAssetType}
          total={data.totalValue}
        />
        <AllocationSection
          title="By Currency"
          data={data.byCurrency}
          total={data.totalValue}
        />
        <AllocationSection
          title="By Geography"
          data={data.byGeography}
          total={data.totalValue}
        />
        <AllocationSection
          title="By Broker"
          data={data.byBroker}
          total={data.totalValue}
        />
      </div>
    </div>
  );
}
