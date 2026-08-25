import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fetchYahooHistory } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

interface BenchmarkResult {
  series: Array<{ date: string; portfolio: number; benchmark: number }>;
  summary: {
    invested: number;        // Σ flujos netos de securities (compras − ventas)
    portfolioValue: number;  // valor actual de tu cartera (securities)
    benchmarkValue: number;  // valor si esos mismos flujos hubieran ido al S&P 500
    diff: number;
    diffPct: number;
  };
}

let cache: { data: BenchmarkResult; timestamp: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  const db = getDb();

  // 1. Línea de tu cartera (NAV diario) + flujos netos de securities por día
  type NavRow = { date: string; value_eur: number; net_flow_eur: number };
  const nav = (await db.execute(
    `SELECT date, value_eur, net_flow_eur FROM nav_history ORDER BY date`
  )).rows as unknown as NavRow[];

  if (nav.length === 0) {
    const empty: BenchmarkResult = {
      series: [],
      summary: { invested: 0, portfolioValue: 0, benchmarkValue: 0, diff: 0, diffPct: 0 },
    };
    return NextResponse.json(empty);
  }

  // 2. Histórico del S&P 500 (^GSPC, USD) y del EUR/USD → S&P en EUR
  const [gspc, eurusd] = await Promise.all([
    fetchYahooHistory("^GSPC", "10y"),
    fetchYahooHistory("EURUSD=X", "10y"),
  ]);

  const toMap = (h: Array<{ timestamp: number; close: number }>) => {
    const m = new Map<string, number>();
    for (const p of h) m.set(new Date(p.timestamp).toISOString().split("T")[0], p.close);
    return m;
  };
  const gspcMap = toMap(gspc);
  const eurusdMap = toMap(eurusd);

  // S&P en EUR = ^GSPC / (USD por EUR). Forward-fill sobre las fechas del NAV.
  const spEur: Record<string, number> = {};
  let lastGspc = 0, lastFx = 0, lastSp = 0;
  for (const row of nav) {
    if (gspcMap.has(row.date)) lastGspc = gspcMap.get(row.date)!;
    if (eurusdMap.has(row.date)) lastFx = eurusdMap.get(row.date)!;
    if (lastGspc > 0 && lastFx > 0) lastSp = lastGspc / lastFx;
    spEur[row.date] = lastSp;
  }

  // 3. Réplica: cada flujo neto compra/vende unidades del S&P en su fecha.
  //    unidades(D) = Σ_{t<=D} flujo(t) / SP_eur(t)   ·   réplica(D) = unidades(D) × SP_eur(D)
  const full: Array<{ date: string; portfolio: number; benchmark: number }> = [];
  let units = 0;
  for (const row of nav) {
    const sp = spEur[row.date];
    if (sp > 0 && row.net_flow_eur !== 0) units += row.net_flow_eur / sp;
    full.push({
      date: row.date,
      portfolio: Math.round(row.value_eur),
      benchmark: sp > 0 ? Math.round(units * sp) : 0,
    });
  }

  // 4. Downsample a ~semanal para el gráfico (manteniendo el último punto exacto)
  const step = Math.max(1, Math.floor(full.length / 400));
  const series = full.filter((_, i) => i % step === 0);
  if (series[series.length - 1]?.date !== full[full.length - 1].date) {
    series.push(full[full.length - 1]);
  }

  const invested = nav.reduce((s, r) => s + r.net_flow_eur, 0);
  const last = full[full.length - 1];
  const diff = last.portfolio - last.benchmark;
  const result: BenchmarkResult = {
    series,
    summary: {
      invested: Math.round(invested),
      portfolioValue: last.portfolio,
      benchmarkValue: last.benchmark,
      diff: Math.round(diff),
      diffPct: last.benchmark > 0 ? (diff / last.benchmark) * 100 : 0,
    },
  };

  cache = { data: result, timestamp: Date.now() };
  return NextResponse.json(result);
}
