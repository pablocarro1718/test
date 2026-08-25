import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type Period = "1W" | "1M" | "YTD" | "1Y";

interface PeriodReturnResult {
  changeEur: number;
  changePercent: number;
  startValue: number;
  endValue: number;
  netFlows: number;
  method: "twr";
}

const cache: Record<string, { data: PeriodReturnResult; timestamp: number }> = {};
const CACHE_TTL = 30 * 60 * 1000;

function getPeriodStart(period: Period): string {
  const now = new Date();
  const d = new Date(now);
  switch (period) {
    case "1W": d.setDate(d.getDate() - 7); break;
    case "1M": d.setMonth(d.getMonth() - 1); break;
    case "YTD": return `${now.getFullYear()}-01-01`;
    case "1Y": d.setFullYear(d.getFullYear() - 1); break;
  }
  return d.toISOString().split("T")[0];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") ?? "1M") as Period;

  const cached = cache[period];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  const db = getDb();
  const startDateStr = getPeriodStart(period);

  // Daily NAV series (value + net securities flow per day) — the exact foundation.
  type NavRow = { date: string; value_eur: number; net_flow_eur: number };
  const nav = (await db.execute(
    `SELECT date, value_eur, net_flow_eur FROM nav_history ORDER BY date`
  )).rows as unknown as NavRow[];

  if (nav.length === 0) {
    const empty: PeriodReturnResult = { changeEur: 0, changePercent: 0, startValue: 0, endValue: 0, netFlows: 0, method: "twr" };
    return NextResponse.json(empty);
  }

  // V_start = last NAV snapshot on/before the period start
  let V_start = 0;
  for (const r of nav) {
    if (r.date <= startDateStr) V_start = r.value_eur;
    else break;
  }
  const periodRows = nav.filter((r) => r.date > startDateStr);
  const V_end = nav[nav.length - 1].value_eur;
  const netFlows = periodRows.reduce((s, r) => s + r.net_flow_eur, 0);

  // Time-Weighted Return: chain each day's market return, r_D = (V_D − F_D) / V_{D-1} − 1.
  // A buy/sell day contributes ~0% (value moves with the flow, not the market), so churn
  // like the forced Trading212/Degiro closes doesn't distort the return.
  let prod = 1;
  let prev = V_start;
  for (const r of periodRows) {
    if (prev > 0) {
      prod *= 1 + (r.value_eur - r.net_flow_eur) / prev - 1;
    }
    prev = r.value_eur;
  }
  const changePercent = (prod - 1) * 100;
  const changeEur = V_end - V_start - netFlows; // total market P&L over the period (net of flows)

  const result: PeriodReturnResult = {
    changeEur,
    changePercent,
    startValue: V_start,
    endValue: V_end,
    netFlows,
    method: "twr",
  };

  cache[period] = { data: result, timestamp: Date.now() };
  return NextResponse.json(result);
}
