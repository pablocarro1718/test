import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fetchYahooHistory, getFxRate } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

type Period = "1W" | "1M" | "YTD" | "1Y";

interface PeriodReturnResult {
  changeEur: number;
  changePercent: number;
  startValue: number;
  endValue: number;
  netFlows: number;
  method: "modified_dietz";
}

// Module-level cache keyed by `period-${roundedEndValue}`, TTL 30 min
const cache: Record<string, { data: PeriodReturnResult; timestamp: number }> = {};
const CACHE_TTL = 30 * 60 * 1000;

function getPeriodConfig(period: Period): { startDate: string; range: string } {
  const now = new Date();
  switch (period) {
    case "1W": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { startDate: d.toISOString().split("T")[0], range: "5d" };
    }
    case "1M": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return { startDate: d.toISOString().split("T")[0], range: "1mo" };
    }
    case "YTD":
      return { startDate: `${now.getFullYear()}-01-01`, range: "ytd" };
    case "1Y": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return { startDate: d.toISOString().split("T")[0], range: "1y" };
    }
  }
}

/**
 * Modified Dietz return for a period with cash flows.
 *
 * R = (V_end − V_start − F) / (V_start + Σ(F_i × W_i))
 *
 * Where W_i = (T − t_i) / T  (flow weight: 1 at period start, 0 at end)
 * changeEur = V_end − V_start − F  (absolute return, net of capital flows)
 */
function modifiedDietz(
  startValue: number,
  endValue: number,
  flows: Array<{ date: string; amountEur: number }>,
  startDate: Date,
  endDate: Date
): { changeEur: number; changePercent: number } {
  const T = Math.max(1, (endDate.getTime() - startDate.getTime()) / 86400000);
  const F = flows.reduce((s, f) => s + f.amountEur, 0);
  const weightedF = flows.reduce((s, f) => {
    const daysSinceStart = (new Date(f.date).getTime() - startDate.getTime()) / 86400000;
    const W = Math.max(0, Math.min(1, (T - daysSinceStart) / T));
    return s + f.amountEur * W;
  }, 0);
  const denominator = startValue + weightedF;
  const changeEur = endValue - startValue - F;
  const changePercent = denominator > 0 ? (changeEur / denominator) * 100 : 0;
  return { changeEur, changePercent };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") ?? "1M") as Period;
  // endValue is passed by the client (it already has live prices loaded)
  const endValue = parseFloat(searchParams.get("endValue") ?? "0");

  // Cache key: period + endValue rounded to nearest 100 to avoid excessive misses
  const cacheKey = `${period}-${Math.round(endValue / 100) * 100}`;
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  const db = getDb();
  const { startDate: startDateStr, range } = getPeriodConfig(period);
  const startDate = new Date(startDateStr);
  const endDate = new Date();

  // 1. Holdings as of startDate
  type HoldingRow = {
    ticker: string;
    yfinance_symbol: string | null;
    currency: string;
    net_qty: number;
  };
  const holdingsAtStart = (await db.execute({
    sql: `SELECT o.ticker, s.yfinance_symbol, COALESCE(s.currency, 'USD') as currency,
            SUM(CASE WHEN o.operation_type='BUY' THEN o.quantity ELSE -o.quantity END) as net_qty
          FROM operations o
          LEFT JOIN symbols s ON o.ticker = s.ticker
          WHERE o.operation_type IN ('BUY','SELL') AND o.date <= ?
          GROUP BY o.ticker
          HAVING net_qty > 0.001`,
    args: [startDateStr],
  })).rows as unknown as HoldingRow[];

  // 2. External positions — use current value as approximation for all periods
  type ExtRow = { value_eur: number };
  const extRows = (await db.execute(
    `SELECT COALESCE(SUM(value_eur), 0) as value_eur FROM external_positions`
  )).rows as unknown as ExtRow[];
  const externalValue = extRows[0]?.value_eur ?? 0;

  // 3. Historical price at start of period for each holding (parallel fetch)
  //    Uses the oldest available datapoint in the Yahoo Finance range — closest to startDate.
  const priceResults = await Promise.allSettled(
    holdingsAtStart.map(async (h) => {
      const symbol = h.yfinance_symbol || h.ticker;
      const history = await fetchYahooHistory(symbol, range);
      if (history.length === 0) return { priceEur: 0, net_qty: h.net_qty };
      const fxRate = await getFxRate(h.currency);
      return { priceEur: history[0].close * fxRate, net_qty: h.net_qty };
    })
  );

  let V_start = externalValue;
  for (const r of priceResults) {
    if (r.status === "fulfilled" && r.value.priceEur > 0) {
      V_start += r.value.priceEur * r.value.net_qty;
    }
  }

  // 4. Cash flows during period (deposits = +, withdrawals = −)
  type FlowRow = { date: string; flow_type: string; amount_eur: number };
  const flowRows = (await db.execute({
    sql: `SELECT date, flow_type, amount_eur FROM cash_flows WHERE date > ? ORDER BY date`,
    args: [startDateStr],
  })).rows as unknown as FlowRow[];

  // amount_eur is already signed in the DB: positive for deposits, negative for withdrawals
  const flows = flowRows.map((f) => ({
    date: f.date,
    amountEur: f.amount_eur,
  }));

  // 5. Modified Dietz
  const { changeEur, changePercent } = modifiedDietz(
    V_start,
    endValue,
    flows,
    startDate,
    endDate
  );

  const result: PeriodReturnResult = {
    changeEur,
    changePercent,
    startValue: V_start,
    endValue,
    netFlows: flows.reduce((s, f) => s + f.amountEur, 0),
    method: "modified_dietz",
  };

  cache[cacheKey] = { data: result, timestamp: Date.now() };
  return NextResponse.json(result);
}
