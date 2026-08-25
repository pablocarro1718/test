"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatPercent, formatNumber, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface BenchmarkData {
  series: Array<{ date: string; portfolio: number; benchmark: number }>;
  summary: {
    invested: number;
    portfolioValue: number;
    benchmarkValue: number;
    diff: number;
    diffPct: number;
  };
}

const MINE = "#16a34a";
const SP = "#9ca3af";

function ChartTooltip(props: { active?: boolean; payload?: Array<{ payload: { date: string; portfolio: number; benchmark: number } }> }) {
  const { active, payload } = props;
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-white px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 font-medium">{formatDate(p.date)}</div>
      <div style={{ color: MINE }}>Tu cartera: {formatCurrency(p.portfolio, 0)}</div>
      <div style={{ color: "#6b7280" }}>S&amp;P 500: {formatCurrency(p.benchmark, 0)}</div>
    </div>
  );
}

export default function BenchmarkPage() {
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/benchmark")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const s = data?.summary;
  const beat = (s?.diff ?? 0) >= 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Portfolio vs S&amp;P 500</h1>
        <p className="text-sm text-muted-foreground">
          Tu cartera frente a haber invertido el mismo dinero, en las mismas fechas, en el S&amp;P 500 (en €)
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Cargando…</div>
      ) : !data || data.series.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Sin histórico disponible (nav_history vacío).
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">Capital neto invertido</div>
              <div className="text-xl font-semibold">{formatCurrency(s!.invested, 0)}</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">Tu cartera</div>
              <div className="text-xl font-semibold" style={{ color: MINE }}>{formatCurrency(s!.portfolioValue, 0)}</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">En el S&amp;P 500</div>
              <div className="text-xl font-semibold" style={{ color: "#6b7280" }}>{formatCurrency(s!.benchmarkValue, 0)}</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">Diferencia</div>
              <div className={cn("text-xl font-semibold", beat ? "text-positive" : "text-negative")}>
                {beat ? "+" : ""}{formatCurrency(s!.diff, 0)} ({formatPercent(s!.diffPct)})
              </div>
            </div>
          </div>

          {/* Chart */}
          <Card>
            <CardContent className="pt-6">
              <div className="h-96 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.series} margin={{ top: 10, right: 12, bottom: 0, left: 4 }}>
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => {
                        const [y, m] = d.split("-");
                        return `${["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][+m]} ${y.slice(2)}`;
                      }}
                      tick={{ fontSize: 11 }}
                      minTickGap={50}
                      stroke="#b8b2a7"
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatNumber(v, 0)}
                      tick={{ fontSize: 11 }}
                      width={58}
                      stroke="#b8b2a7"
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      formatter={(value) => (value === "portfolio" ? "Tu cartera" : "S&P 500 (misma inversión)")}
                      wrapperStyle={{ fontSize: 12 }}
                    />
                    <Line type="monotone" dataKey="portfolio" stroke={MINE} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="benchmark" stroke={SP} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-3 px-1 text-xs text-muted-foreground">
                Ambas líneas reciben exactamente el mismo dinero en las mismas fechas (tus compras y ventas de valores),
                así que la distancia entre ellas es tu rentabilidad frente al índice. Excluye el efectivo sin invertir.
                Benchmark: índice de precio ^GSPC (sin dividendos), convertido a EUR.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
