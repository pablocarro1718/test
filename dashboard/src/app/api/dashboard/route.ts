import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type OpenRow = {
  ticker: string; name: string | null; asset_type: string | null;
  currency: string | null; net_qty: number; total_cost: number; total_qty_buy: number;
};
type TotalsRow = { totalInvested: number; totalSold: number; totalDividends: number };
type ClosedRow = { ticker: string; qty_bought: number; qty_sold: number; cost: number; proceeds: number };
type CfRow = { date: string; flow_type: string; amount_eur: number };
type PulseRow = { month: string; netChange: number };
type BrokerRow = { broker: string; invested: number };

export async function GET() {
  const db = getDb();

  // --- OPEN POSITIONS ---
  const openPositions = (await db.execute(`
    SELECT o.ticker, s.name, s.asset_type, s.currency,
           SUM(CASE WHEN o.operation_type = 'BUY' THEN o.quantity ELSE -o.quantity END) as net_qty,
           SUM(CASE WHEN o.operation_type = 'BUY' THEN ABS(o.net_amount_eur) ELSE 0 END) as total_cost,
           SUM(CASE WHEN o.operation_type = 'BUY' THEN o.quantity ELSE 0 END) as total_qty_buy
    FROM operations o
    LEFT JOIN symbols s ON o.ticker = s.ticker
    WHERE o.operation_type IN ('BUY', 'SELL')
    GROUP BY o.ticker
    HAVING net_qty > 0.001
    ORDER BY total_cost DESC
  `)).rows as unknown as OpenRow[];

  const holdings = openPositions.map((pos) => {
    const avgCost = pos.total_cost / pos.total_qty_buy;
    const costBasis = avgCost * pos.net_qty;
    return {
      ticker: pos.ticker,
      name: pos.name || pos.ticker,
      assetType: pos.asset_type || "Unknown",
      currency: pos.currency || "USD",
      quantity: pos.net_qty,
      costBasis,
    };
  });

  const openCostBasis = holdings.reduce((sum, h) => sum + h.costBasis, 0);

  // --- ALL TIME TOTALS ---
  const totals = (await db.execute(`
    SELECT
      SUM(CASE WHEN operation_type = 'BUY' THEN ABS(net_amount_eur) ELSE 0 END) as totalInvested,
      SUM(CASE WHEN operation_type = 'SELL' THEN net_amount_eur ELSE 0 END) as totalSold,
      SUM(CASE WHEN operation_type = 'DIVIDEND' THEN net_amount_eur ELSE 0 END) as totalDividends
    FROM operations
  `)).rows[0] as unknown as TotalsRow;

  // Realized P&L
  const closedPositions = (await db.execute(`
    SELECT ticker,
           SUM(CASE WHEN operation_type = 'BUY' THEN quantity ELSE 0 END) as qty_bought,
           SUM(CASE WHEN operation_type = 'SELL' THEN quantity ELSE 0 END) as qty_sold,
           SUM(CASE WHEN operation_type = 'BUY' THEN ABS(net_amount_eur) ELSE 0 END) as cost,
           SUM(CASE WHEN operation_type = 'SELL' THEN net_amount_eur ELSE 0 END) as proceeds
    FROM operations
    WHERE operation_type IN ('BUY', 'SELL')
    GROUP BY ticker
    HAVING qty_sold > 0.001
  `)).rows as unknown as ClosedRow[];

  let realizedPnl = 0;
  for (const pos of closedPositions) {
    const costPerUnit = pos.cost / pos.qty_bought;
    realizedPnl += pos.proceeds - costPerUnit * pos.qty_sold;
  }

  // --- XIRR FLOWS ---
  const xirrFlows = ((await db.execute(
    `SELECT date, flow_type, amount_eur FROM cash_flows ORDER BY date`
  )).rows as unknown as CfRow[]).map((cf) => ({
    date: cf.date,
    amount: -cf.amount_eur, // deposits positive in DB → negate = outflow; withdrawals negative in DB → negate = inflow
  }));

  // --- ALLOCATION BY ASSET TYPE ---
  const allocationByType = holdings.reduce((acc, h) => {
    acc[h.assetType] = (acc[h.assetType] || 0) + h.costBasis;
    return acc;
  }, {} as Record<string, number>);

  const allocation = Object.entries(allocationByType)
    .map(([assetType, costBasis]) => ({ assetType, costBasis }))
    .sort((a, b) => b.costBasis - a.costBasis);

  // --- MONTHLY PULSE (last 6 months) ---
  const monthlyPulse = (await db.execute(`
    SELECT strftime('%Y-%m', date) as month,
           SUM(CASE WHEN operation_type = 'BUY' THEN -ABS(net_amount_eur)
                    WHEN operation_type = 'SELL' THEN net_amount_eur
                    WHEN operation_type = 'DIVIDEND' THEN net_amount_eur
                    ELSE 0 END) as netChange
    FROM operations
    WHERE date >= date('now', '-6 months', 'start of month')
    GROUP BY month
    ORDER BY month
  `)).rows as unknown as PulseRow[];

  // --- BROKER DISTRIBUTION ---
  const byBroker = (await db.execute(`
    SELECT broker,
           SUM(CASE WHEN operation_type = 'BUY' THEN ABS(net_amount_eur) ELSE 0 END) as invested
    FROM operations
    WHERE operation_type IN ('BUY', 'SELL')
    GROUP BY broker
    ORDER BY invested DESC
  `)).rows as unknown as BrokerRow[];

  return NextResponse.json({
    holdings,
    openCostBasis,
    positionsCount: openPositions.length,
    allTime: {
      totalInvested: totals?.totalInvested || 0,
      totalSold: totals?.totalSold || 0,
      totalDividends: totals?.totalDividends || 0,
      realizedPnl,
    },
    xirrFlows,
    allocation,
    topHoldings: holdings.slice(0, 5),
    monthlyPulse,
    byBroker,
  });
}
