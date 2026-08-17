import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getFxRate } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

/**
 * Geography classification for known tickers that can't be inferred from currency alone.
 * Add new entries here when buying ETFs with non-obvious geographic exposure
 * or stocks listed in USD but domiciled outside North America.
 */
const TICKER_REGION: Record<string, string> = {
  // Europe ETFs / European stocks in USD
  IEV: "Europe",
  // Latin America
  ARGT: "Latam", MELI: "Latam", NU: "Latam",
  // Asia / China
  BABA: "Asia", TCEHY: "Asia",
  // Global / thematic (no single geography)
  URA: "Global",
};

function classifyRegion(ticker: string, currency: string, assetType: string): string {
  if (TICKER_REGION[ticker]) return TICKER_REGION[ticker];
  if (assetType === "Crypto") return "Crypto";
  if (currency === "EUR" || currency === "GBP") return "Europe";
  if (currency === "CAD") return "North America";
  // Default USD stocks/ETFs → North America
  return "North America";
}

type OpenRow = {
  ticker: string; name: string | null; asset_type: string | null;
  currency: string | null; net_qty: number; total_cost: number; total_qty_buy: number;
};
type TotalsRow = { totalInvested: number; totalSold: number; totalDividends: number };
type ClosedRow = { ticker: string; qty_bought: number; qty_sold: number; cost: number; proceeds: number };
type PulseRow = { month: string; netChange: number };
type BrokerRow = { broker: string; invested: number };
type CashBalRow = { currency: string; amount: number };
type ExtPosRow = { total: number; platforms: string };

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

  // --- TIR FLOWS (money-weighted, based on securities operations — NOT deposits) ---
  // BUY = money deployed into a security (outflow); SELL/DIVIDEND = money returned (inflow).
  // Deposits/idle cash are deliberately excluded so uninvested cash never distorts the TIR.
  // `open` flags flows of positions still held today, letting the client compute two views:
  //   • TIR general: all flows (open + closed positions) → full investing track record
  //   • TIR vivo:    only open-position flows → return on what's currently held
  // The terminal flow (current market value of open holdings) is appended client-side,
  // since it depends on live prices fetched there.
  const openTickerSet = new Set(openPositions.map((p) => p.ticker));
  type OpFlowRow = { ticker: string; date: string; amount: number };
  const tirFlows = ((await db.execute(
    `SELECT ticker, date,
       CASE WHEN operation_type = 'BUY' THEN -ABS(net_amount_eur) ELSE net_amount_eur END as amount
     FROM operations
     WHERE operation_type IN ('BUY','SELL','DIVIDEND')
     ORDER BY date`
  )).rows as unknown as OpFlowRow[]).map((f) => ({
    date: f.date,
    amount: f.amount,
    open: openTickerSet.has(f.ticker),
  }));

  // --- ALLOCATION BY ASSET TYPE ---
  const allocationByType = holdings.reduce((acc, h) => {
    acc[h.assetType] = (acc[h.assetType] || 0) + h.costBasis;
    return acc;
  }, {} as Record<string, number>);

  const allocation = Object.entries(allocationByType)
    .map(([assetType, costBasis]) => ({ assetType, costBasis }))
    .sort((a, b) => b.costBasis - a.costBasis);

  // --- ALLOCATION BY GEOGRAPHY ---
  const geoMap = holdings.reduce((acc, h) => {
    const region = classifyRegion(h.ticker, h.currency, h.assetType);
    acc[region] = (acc[region] || 0) + h.costBasis;
    return acc;
  }, {} as Record<string, number>);

  const geoTotal = Object.values(geoMap).reduce((s, v) => s + v, 0);
  const byGeography = Object.entries(geoMap)
    .map(([name, value]) => ({
      name,
      value,
      percent: geoTotal > 0 ? (value / geoTotal) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

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

  // --- UNINVESTED CASH BALANCES ---
  // Cash sitting in brokers, not yet invested (e.g. IBKR reports it in its account
  // base currency, USD). Convert each row to EUR with live FX — same source as prices —
  // so the figure is always current. Table may not exist in older Turso instances → 0.
  let cashBalance = 0;
  try {
    const cashRows = (await db.execute(
      `SELECT currency, amount FROM cash_balances`
    )).rows as unknown as CashBalRow[];
    for (const r of cashRows) {
      const fx = await getFxRate(r.currency || "EUR");
      cashBalance += (r.amount ?? 0) * fx;
    }
  } catch {
    // cash_balances table not yet created in this Turso instance
  }

  // --- EXTERNAL POSITIONS (e.g. Fintual) ---
  // Manually-tracked external funds included in XIRR terminal value.
  // Table may not exist yet in older Turso instances — default to 0.
  let externalValue = 0;
  let externalPositions: Array<{ platform: string; description: string; value_eur: number }> = [];
  try {
    const extRows = (await db.execute(
      `SELECT platform, description, value_eur FROM external_positions ORDER BY value_eur DESC`
    )).rows as unknown as Array<{ platform: string; description: string; value_eur: number }>;
    externalPositions = extRows;
    externalValue = extRows.reduce((sum, r) => sum + r.value_eur, 0);
  } catch {
    // external_positions table not yet synced to this Turso instance
  }

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
    cashBalance,
    externalValue,
    externalPositions,
    positionsCount: openPositions.length,
    allTime: {
      totalInvested: totals?.totalInvested || 0,
      totalSold: totals?.totalSold || 0,
      totalDividends: totals?.totalDividends || 0,
      realizedPnl,
    },
    tirFlows,
    allocation,
    byGeography,
    topHoldings: holdings.slice(0, 5),
    monthlyPulse,
    byBroker,
  });
}
