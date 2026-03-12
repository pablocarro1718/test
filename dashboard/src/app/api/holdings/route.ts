import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type ConsolidatedRow = {
  ticker: string; name: string | null; asset_type: string | null; currency: string | null;
  net_qty: number; total_qty_buy: number; total_cost: number; total_commission: number;
  first_buy: string; last_buy: string; dividends_received: number;
};
type BrokerRow = { ticker: string; broker: string; net_qty: number; total_qty_buy: number; total_cost: number };
type BrokerListRow = { broker: string };

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

  // --- CONSOLIDATED BY TICKER ---
  const consolidated = (await db.execute({
    sql: `SELECT
        o.ticker, s.name, s.asset_type, s.currency,
        SUM(CASE WHEN o.operation_type = 'BUY' THEN o.quantity ELSE -o.quantity END) as net_qty,
        SUM(CASE WHEN o.operation_type = 'BUY' THEN o.quantity ELSE 0 END) as total_qty_buy,
        SUM(CASE WHEN o.operation_type = 'BUY' THEN ABS(o.net_amount_eur) ELSE 0 END) as total_cost,
        SUM(CASE WHEN o.operation_type = 'BUY' THEN o.commission_eur ELSE 0 END) as total_commission,
        MIN(CASE WHEN o.operation_type = 'BUY' THEN o.date END) as first_buy,
        MAX(CASE WHEN o.operation_type = 'BUY' THEN o.date END) as last_buy,
        SUM(CASE WHEN o.operation_type = 'DIVIDEND' THEN o.net_amount_eur ELSE 0 END) as dividends_received
      FROM operations o
      LEFT JOIN symbols s ON o.ticker = s.ticker
      WHERE o.operation_type IN ('BUY', 'SELL', 'DIVIDEND') ${whereClause}
      GROUP BY o.ticker
      HAVING net_qty > 0.001
      ORDER BY total_cost DESC`,
    args,
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

  return NextResponse.json({
    holdings,
    summary: { totalPositions: holdings.length, totalCostBasis, totalCommission, totalDividends },
    brokerList,
  });
}
