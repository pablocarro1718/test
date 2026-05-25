import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fetchYahooQuote, getFxRate } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

const priceCache: Record<string, { price: number; currency: string; change: number; changePercent: number; timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000;

export async function GET() {
  const db = getDb();

  type TickerRow = { ticker: string; yfinance_symbol: string | null; currency: string | null };
  const openTickers = (await db.execute(`
    SELECT DISTINCT o.ticker, s.yfinance_symbol, s.currency
    FROM operations o
    LEFT JOIN symbols s ON o.ticker = s.ticker
    WHERE o.operation_type IN ('BUY', 'SELL')
    GROUP BY o.ticker
    HAVING SUM(CASE WHEN o.operation_type = 'BUY' THEN o.quantity ELSE -o.quantity END) > 0.001
  `)).rows as unknown as TickerRow[];

  const results: Record<string, { price: number; priceEur: number; currency: string; change: number; changePercent: number }> = {};
  const toFetch: Array<{ ticker: string; symbol: string; currency: string }> = [];

  for (const t of openTickers) {
    const symbol = t.yfinance_symbol || t.ticker;
    const cached = priceCache[symbol];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      const fxRate = await getFxRate(cached.currency);
      results[t.ticker] = { price: cached.price, priceEur: cached.price * fxRate,
                            currency: cached.currency, change: cached.change, changePercent: cached.changePercent };
    } else {
      toFetch.push({ ticker: t.ticker, symbol, currency: t.currency || "USD" });
    }
  }

  if (toFetch.length > 0) {
    const quotes = await Promise.allSettled(toFetch.map((t) => fetchYahooQuote(t.symbol)));
    for (let i = 0; i < toFetch.length; i++) {
      const result = quotes[i];
      if (result.status === "fulfilled" && result.value) {
        const q = result.value;
        const price = q.regularMarketPrice || 0;
        const currency = q.currency || toFetch[i].currency;
        const change = q.regularMarketChange || 0;
        const changePercent = q.regularMarketChangePercent || 0;
        priceCache[toFetch[i].symbol] = { price, currency, change, changePercent, timestamp: Date.now() };
        const fxRate = await getFxRate(currency);
        results[toFetch[i].ticker] = { price, priceEur: price * fxRate, currency, change, changePercent };
      } else {
        results[toFetch[i].ticker] = { price: 0, priceEur: 0, currency: toFetch[i].currency, change: 0, changePercent: 0 };
      }
    }
  }

  return NextResponse.json({ prices: results, timestamp: Date.now() });
}
