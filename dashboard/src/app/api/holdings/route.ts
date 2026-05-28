import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type ConsolidatedRow = {
  ticker: string; name: string | null; asset_type: string | null; currency: string | null;
  net_qty: number; total_qty_buy: number; total_cost: number; total_commission: number;
  first_buy: string; last_buy: string; dividends_received: number;
  avg_price_original: number | null;
};
type BrokerRow = { ticker: string; broker: string; net_qty: number; total_qty_buy: number; total_cost: number };
type BrokerListRow = { broker: string };
type TickerFlowRow = { ticker: string; date: string; amount: number };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const typeFilter = searchParams.get("type");
  const brokerFilter = searchParams.get("broker");

  const db = getDb();

  const conditions: string[] = [];
  const args: string[] = [];
  if (typeFilter) { conditions.push("s.asset_type = ?"); args.push(typeFilter); }
  if (brokerFilter) { conditions.push("o.broker = ?"); args.push(brokerFilter); }
  const whereClause = conditions.length > 0 ? "AND " + conditions.join(" AND ") : "";

  // Filters for the CTE (no symbol join, broker filter applies directly on o.broker)
  const cteConditions: string[] = [];
  const cteArgs: string[] = [];
  if (brokerFilter) { cteConditions.push("o.broker = ?"); cteArgs.push(brokerFilter); }
  const cteWhere = cteConditions.length > 0 ? "AND " + cteConditions.join(" AND ") : "";

  // Dividends need type filter (symbol join required)
  const divConditions: string[] = [];
  const divArgs: string[] = [...cteArgs];
  if (typeFilter) { divConditions.push("s.asset_type = ?"); divArgs.push(typeFilter); }
  const divWhere = divConditions.length > 0 ? "AND " + divConditions.join(" AND ") : "";

  // --- CONSOLIDATED BY TICKER ---
  // Use a CTE that first groups by (ticker, broker) and filters out fully-closed broker
  // positions (net_qty ≈ 0). This prevents sold lots from distorting the cost basis of
  // re-opened positions (e.g. sold AAPL via Degiro, then re-bought via Fintual).
  const consolidated = (await db.execute({
    sql: `WITH open_broker_pos AS (
        SELECT o.ticker, o.broker,
          SUM(CASE WHEN o.operation_type='BUY' THEN o.quantity ELSE -o.quantity END) AS net_qty,
          SUM(CASE WHEN o.operation_type='BUY' THEN o.quantity ELSE 0 END) AS qty_buy,
          SUM(CASE WHEN o.operation_type='BUY' THEN ABS(o.net_amount_eur) ELSE 0 END) AS cost_eur,
          SUM(CASE WHEN o.operation_type='BUY' THEN o.commission_eur ELSE 0 END) AS commission_eur,
          MIN(CASE WHEN o.operation_type='BUY' THEN o.date END) AS first_buy,
          MAX(CASE WHEN o.operation_type='BUY' THEN o.date END) AS last_buy
        FROM operations o
        WHERE o.operation_type IN ('BUY', 'SELL') ${cteWhere}
        GROUP BY o.ticker, o.broker
        HAVING net_qty > 0.001
      ),
      div_agg AS (
        SELECT o.ticker,
          SUM(o.net_amount_eur) AS dividends_received
        FROM operations o
        LEFT JOIN symbols s ON o.ticker = s.ticker
        WHERE o.operation_type = 'DIVIDEND' ${divWhere}
        GROUP BY o.ticker
      ),
      avg_orig AS (
        SELECT o.ticker,
          SUM(o.price_original * o.quantity) / SUM(o.quantity) AS avg_price_original
        FROM operations o
        INNER JOIN open_broker_pos obp ON o.ticker = obp.ticker AND o.broker = obp.broker
        WHERE o.operation_type = 'BUY'
        GROUP BY o.ticker
      )
      SELECT p.ticker, s.name, s.asset_type, s.currency,
        SUM(p.net_qty)        AS net_qty,
        SUM(p.qty_buy)        AS total_qty_buy,
        SUM(p.cost_eur)       AS total_cost,
        SUM(p.commission_eur) AS total_commission,
        MIN(p.first_buy)      AS first_buy,
        MAX(p.last_buy)       AS last_buy,
        COALESCE(d.dividends_received, 0) AS dividends_received,
        MAX(ao.avg_price_original)        AS avg_price_original
      FROM open_broker_pos p
      LEFT JOIN symbols s ON p.ticker = s.ticker
      LEFT JOIN div_agg d ON p.ticker = d.ticker
      LEFT JOIN avg_orig ao ON ao.ticker = p.ticker
      GROUP BY p.ticker
      HAVING SUM(p.net_qty) > 0.001
      ORDER BY total_cost DESC`,
    args: [...cteArgs, ...divArgs],
  })).rows as unknown as ConsolidatedRow[];

  // --- BROKER-LEVEL BREAKDOWN ---
  const brokerBreakdown = (await db.execute({
    sql: `SELECT
        o.ticker, o.broker,
        SUM(CASE WHEN o.operation_type = 'BUY' THEN o.quantity ELSE -o.quantity END) as net_qty,
        SUM(CASE WHEN o.operation_type = 'BUY' THEN o.quantity ELSE 0 END) as total_qty_buy,
        SUM(CASE WHEN o.operation_type = 'BUY' THEN ABS(o.net_amount_eur) ELSE 0 END) as total_cost
      FROM operations o
      LEFT JOIN symbols s ON o.ticker = s.ticker
      WHERE o.operation_type IN ('BUY', 'SELL') ${whereClause}
      GROUP BY o.ticker, o.broker
      HAVING net_qty > 0.001
      ORDER BY o.ticker, total_cost DESC`,
    args,
  })).rows as unknown as BrokerRow[];

  // Group broker breakdown by ticker
  const brokerMap: Record<string, Array<{ broker: string; quantity: number; costBasis: number; avgCost: number }>> = {};
  for (const b of brokerBreakdown) {
    if (!brokerMap[b.ticker]) brokerMap[b.ticker] = [];
    const avgCost = b.total_qty_buy > 0 ? b.total_cost / b.total_qty_buy : 0;
    brokerMap[b.ticker].push({ broker: b.broker, quantity: b.net_qty, costBasis: avgCost * b.net_qty, avgCost });
  }

  let totalCostBasis = 0, totalCommission = 0, totalDividends = 0;
  const holdings = consolidated.map((pos) => {
    const avgCost = pos.total_qty_buy > 0 ? pos.total_cost / pos.total_qty_buy : 0;
    const costBasis = avgCost * pos.net_qty;
    totalCostBasis += costBasis;
    totalCommission += pos.total_commission;
    totalDividends += pos.dividends_received;
    return {
      ticker: pos.ticker,
      name: pos.name || pos.ticker,
      assetType: pos.asset_type || "Unknown",
      currency: pos.currency || "USD",
      quantity: pos.net_qty,
      costBasis,
      avgCostPerUnit: avgCost,
      avgPriceOriginal: pos.avg_price_original ?? 0,
      commission: pos.total_commission,
      firstBuy: pos.first_buy,
      lastBuy: pos.last_buy,
      dividends: pos.dividends_received,
      brokers: brokerMap[pos.ticker] || [],
    };
  });

  const brokerList = ((await db.execute(
    `SELECT DISTINCT broker FROM operations ORDER BY broker`
  )).rows as unknown as BrokerListRow[]).map((b) => b.broker);

  // --- PER-TICKER CASH FLOWS (for XIRR per position) ---
  const tickerFlows = (await db.execute({
    sql: `SELECT ticker, date,
      CASE WHEN operation_type='BUY' THEN -ABS(net_amount_eur)
           ELSE net_amount_eur END as amount
    FROM operations
    WHERE operation_type IN ('BUY','SELL','DIVIDEND')
    ORDER BY ticker, date`,
    args: [],
  })).rows as unknown as TickerFlowRow[];

  const cashFlowsByTicker: Record<string, Array<{ date: string; amount: number }>> = {};
  for (const f of tickerFlows) {
    if (!cashFlowsByTicker[f.ticker]) cashFlowsByTicker[f.ticker] = [];
    cashFlowsByTicker[f.ticker].push({ date: f.date, amount: f.amount });
  }

  return NextResponse.json({
    holdings,
    summary: { totalPositions: holdings.length, totalCostBasis, totalCommission, totalDividends },
    brokerList,
    cashFlowsByTicker,
  });
}
