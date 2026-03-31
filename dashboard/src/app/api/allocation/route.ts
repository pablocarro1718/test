import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type OpenRow = {
  ticker: string; name: string | null; asset_type: string | null;
  currency: string | null; net_qty: number; total_cost: number; total_qty_buy: number;
};
type BrokerRow = { broker: string; ticker: string; total_cost: number; total_qty_buy: number; net_qty: number };

/**
 * Geography classification: currency-based heuristic + ticker-level overrides.
 * Add entries to TICKER_REGION for USD-denominated assets that are NOT North American
 * (e.g. ETFs tracking a specific region, or foreign companies listed in USD).
 */
const TICKER_REGION: Record<string, string> = {
  IEV: "Europe",
  ARGT: "Latam", MELI: "Latam", NU: "Latam",
  BABA: "Asia", TCEHY: "Asia",
  URA: "Global",
};

function classifyRegion(ticker: string, currency: string, assetType: string): string {
  if (TICKER_REGION[ticker]) return TICKER_REGION[ticker];
  if (assetType === "Crypto") return "Crypto";
  if (currency === "EUR" || currency === "GBP") return "Europe";
  if (currency === "CAD") return "North America";
  return "North America";
}

export async function GET() {
  const db = getDb();

  // Open positions with symbol metadata
  const openRows = (await db.execute(`
    SELECT o.ticker, s.name, s.asset_type, s.currency,
           SUM(CASE WHEN o.operation_type = 'BUY' THEN o.quantity ELSE -o.quantity END) as net_qty,
           SUM(CASE WHEN o.operation_type = 'BUY' THEN ABS(o.net_amount_eur) ELSE 0 END) as total_cost,
           SUM(CASE WHEN o.operation_type = 'BUY' THEN o.quantity ELSE 0 END) as total_qty_buy
    FROM operations o
    LEFT JOIN symbols s ON o.ticker = s.ticker
    WHERE o.operation_type IN ('BUY', 'SELL')
    GROUP BY o.ticker
    HAVING net_qty > 0.001
  `)).rows as unknown as OpenRow[];

  const positions = openRows.map((pos) => {
    const avgCost = pos.total_cost / pos.total_qty_buy;
    const costBasis = avgCost * pos.net_qty;
    return {
      ticker: pos.ticker,
      assetType: pos.asset_type || "Unknown",
      currency: pos.currency || "USD",
      costBasis,
    };
  });

  const totalValue = positions.reduce((s, p) => s + p.costBasis, 0);

  // Helper: build AllocationEntry array from a Record<string, number>
  function toEntries(map: Record<string, number>) {
    return Object.entries(map)
      .map(([name, value]) => ({
        name,
        value,
        percent: totalValue > 0 ? (value / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }

  // By asset type
  const typeMap: Record<string, number> = {};
  for (const p of positions) {
    typeMap[p.assetType] = (typeMap[p.assetType] || 0) + p.costBasis;
  }

  // By currency
  const currencyMap: Record<string, number> = {};
  for (const p of positions) {
    currencyMap[p.currency] = (currencyMap[p.currency] || 0) + p.costBasis;
  }

  // By geography
  const geoMap: Record<string, number> = {};
  for (const p of positions) {
    const region = classifyRegion(p.ticker, p.currency, p.assetType);
    geoMap[region] = (geoMap[region] || 0) + p.costBasis;
  }

  // By broker
  const brokerRows = (await db.execute(`
    SELECT broker, ticker,
           SUM(CASE WHEN operation_type = 'BUY' THEN ABS(net_amount_eur) ELSE 0 END) as total_cost,
           SUM(CASE WHEN operation_type = 'BUY' THEN quantity ELSE 0 END) as total_qty_buy,
           SUM(CASE WHEN operation_type = 'BUY' THEN quantity ELSE -quantity END) as net_qty
    FROM operations
    WHERE operation_type IN ('BUY', 'SELL')
    GROUP BY broker, ticker
    HAVING net_qty > 0.001
  `)).rows as unknown as BrokerRow[];

  const brokerMap: Record<string, number> = {};
  for (const row of brokerRows) {
    const avgCost = row.total_cost / row.total_qty_buy;
    const costBasis = avgCost * row.net_qty;
    brokerMap[row.broker] = (brokerMap[row.broker] || 0) + costBasis;
  }

  // Top concentration
  const topConcentration = positions.length > 0
    ? positions.reduce((max, p) => p.costBasis > max.costBasis ? p : max, positions[0])
    : null;

  return NextResponse.json({
    totalValue,
    byAssetType: toEntries(typeMap),
    byCurrency: toEntries(currencyMap),
    byGeography: toEntries(geoMap),
    byBroker: toEntries(brokerMap),
    uniqueCurrencies: Object.keys(currencyMap).length,
    uniqueBrokers: Object.keys(brokerMap).length,
    topConcentration: topConcentration
      ? { ticker: topConcentration.ticker, costBasis: topConcentration.costBasis }
      : null,
  });
}
