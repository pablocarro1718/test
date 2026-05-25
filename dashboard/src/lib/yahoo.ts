/**
 * Shared Yahoo Finance fetching utilities.
 * Used by api/prices and api/period-returns.
 */

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

export interface YahooQuoteResult {
  regularMarketPrice?: number;
  currency?: string;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  symbol?: string;
}

export async function fetchYahooQuote(symbol: string): Promise<YahooQuoteResult | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice ?? 0;
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price;
    const change = price - prevClose;
    return {
      regularMarketPrice: price,
      currency: meta.currency || "USD",
      regularMarketChange: change,
      regularMarketChangePercent: prevClose > 0 ? (change / prevClose) * 100 : 0,
      symbol: meta.symbol,
    };
  } catch (err) {
    console.error(`Yahoo quote error for ${symbol}:`, err);
    return null;
  }
}

const fxCache: Record<string, { rate: number; timestamp: number }> = {};
const FX_CACHE_TTL = 5 * 60 * 1000;

export async function getFxRate(currency: string): Promise<number> {
  if (currency === "EUR") return 1;
  const pair = `${currency}EUR=X`;
  const cached = fxCache[pair];
  if (cached && Date.now() - cached.timestamp < FX_CACHE_TTL) return cached.rate;
  const quote = await fetchYahooQuote(pair);
  if (quote?.regularMarketPrice) {
    fxCache[pair] = { rate: quote.regularMarketPrice, timestamp: Date.now() };
    return quote.regularMarketPrice;
  }
  const inverseQuote = await fetchYahooQuote(`EUR${currency}=X`);
  if (inverseQuote?.regularMarketPrice) {
    const rate = 1 / inverseQuote.regularMarketPrice;
    fxCache[pair] = { rate, timestamp: Date.now() };
    return rate;
  }
  return 1;
}

/**
 * Fetch historical daily closes for a symbol.
 * range: '5d' | '1mo' | 'ytd' | '1y'
 * Returns prices sorted oldest-first, filtered for valid (non-null, > 0) closes.
 *
 * Note: FX conversion uses current rates (not historical) — introduces a small error
 * for long periods (1Y) if exchange rates have moved significantly, but is a reasonable
 * approximation for a portfolio summary view.
 */
export async function fetchYahooHistory(
  symbol: string,
  range: string
): Promise<Array<{ timestamp: number; close: number }>> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return [];
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];
    const timestamps: number[] = result.timestamp || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
    return timestamps
      .map((t: number, i: number) => ({ timestamp: t * 1000, close: closes[i] }))
      .filter((p): p is { timestamp: number; close: number } =>
        p.close != null && p.close > 0
      );
  } catch (err) {
    console.error(`Yahoo history error for ${symbol}:`, err);
    return [];
  }
}
