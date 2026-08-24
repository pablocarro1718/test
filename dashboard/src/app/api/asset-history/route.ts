import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fetchYahooHistory } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

// UI range pill → Yahoo range param
const RANGE_MAP: Record<string, string> = { "6M": "6mo", "1A": "1y", "5A": "5y", "Todo": "max" };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");
  const rangeKey = searchParams.get("range") ?? "1A";
  const range = RANGE_MAP[rangeKey] ?? "1y";
  const db = getDb();

  // --- Ticker list (everything ever traded, open + closed) ---
  type TRow = { ticker: string; name: string | null; net_qty: number };
  const tRows = (await db.execute(`
    SELECT o.ticker, s.name,
      SUM(CASE WHEN o.operation_type='BUY' THEN o.quantity
               WHEN o.operation_type='SELL' THEN -o.quantity ELSE 0 END) as net_qty
    FROM operations o
    LEFT JOIN symbols s ON o.ticker = s.ticker
    WHERE o.operation_type IN ('BUY','SELL')
    GROUP BY o.ticker
  `)).rows as unknown as TRow[];

  const tickers = tRows
    .map((t) => ({ ticker: t.ticker, name: t.name ?? t.ticker, open: t.net_qty > 0.001 }))
    .sort((a, b) =>
      a.open !== b.open ? (a.open ? -1 : 1) : a.ticker.localeCompare(b.ticker)
    );

  if (!ticker) {
    return NextResponse.json({ tickers });
  }

  // --- Symbol + currency + name ---
  type SRow = { yfinance_symbol: string | null; currency: string | null; name: string | null };
  const sRows = (await db.execute({
    sql: `SELECT yfinance_symbol, currency, name FROM symbols WHERE ticker = ?`,
    args: [ticker],
  })).rows as unknown as SRow[];
  const symbol = sRows[0]?.yfinance_symbol || ticker;
  const currency = sRows[0]?.currency || "USD";
  const name = sRows[0]?.name || ticker;

  // --- Price history (native currency) ---
  const history = await fetchYahooHistory(symbol, range);
  const prices = history.map((h) => ({ t: h.timestamp, close: h.close }));

  // --- This ticker's operations (all brokers, for the markers) ---
  type OpRow = { date: string; broker: string; operation_type: string; quantity: number; price_original: number; net_amount_eur: number };
  const ops = (await db.execute({
    sql: `SELECT date, broker, operation_type, quantity, price_original, net_amount_eur
          FROM operations WHERE ticker = ? AND operation_type IN ('BUY','SELL') ORDER BY date`,
    args: [ticker],
  })).rows as unknown as OpRow[];

  const trades = ops.map((o) => ({
    date: o.date,
    type: o.operation_type,
    quantity: o.quantity,
    price: o.price_original,
    eur: Math.abs(o.net_amount_eur),
  }));

  // --- Avg buy price (native), consistent with Holdings: only open-broker lots ---
  const netByBroker: Record<string, number> = {};
  let netQty = 0;
  for (const o of ops) {
    const s = o.operation_type === "BUY" ? o.quantity : -o.quantity;
    netByBroker[o.broker] = (netByBroker[o.broker] ?? 0) + s;
    netQty += s;
  }
  const openBrokers = new Set(Object.entries(netByBroker).filter(([, q]) => q > 0.001).map(([b]) => b));
  let buyQty = 0, buyCostOrig = 0;         // open-broker lots
  let buyQtyAll = 0, buyCostOrigAll = 0;   // fallback for fully-closed positions
  for (const o of ops) {
    if (o.operation_type !== "BUY") continue;
    buyQtyAll += o.quantity;
    buyCostOrigAll += o.price_original * o.quantity;
    if (openBrokers.has(o.broker)) {
      buyQty += o.quantity;
      buyCostOrig += o.price_original * o.quantity;
    }
  }
  const avgBuyPrice = buyQty > 0 ? buyCostOrig / buyQty : (buyQtyAll > 0 ? buyCostOrigAll / buyQtyAll : 0);
  const lastPrice = prices.length ? prices[prices.length - 1].close : 0;
  const firstBuy = ops.find((o) => o.operation_type === "BUY")?.date ?? null;

  return NextResponse.json({
    tickers,
    ticker,
    name,
    symbol,
    currency,
    prices,
    trades,
    summary: { avgBuyPrice, netQty, firstBuy, lastPrice, open: netQty > 0.001 },
  });
}
