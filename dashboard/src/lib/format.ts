/** Adds "." as thousands separator to an integer string, e.g. "1983" → "1.983" */
function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Formats a currency value in Spanish notation: 1.983,45 €
 * Uses explicit regex grouping — does NOT rely on Intl.NumberFormat locale ICU data,
 * which can silently omit thousands separators on some Node/Vercel builds.
 */
export function formatCurrency(value: number, decimals = 2): string {
  const abs = Math.abs(value);
  const [int, dec] = abs.toFixed(decimals).split(".");
  const body = decimals > 0 ? `${groupThousands(int)},${dec}` : groupThousands(int);
  return `${value < 0 ? "-" : ""}${body} €`;
}

/**
 * Formats a percentage with sign prefix: +12,34% / -5,50%
 * Uses explicit regex grouping for the same reliability reasons as formatCurrency.
 */
export function formatPercent(value: number, decimals = 2): string {
  const sign = value > 0 ? "+" : "";
  const abs = Math.abs(value);
  const [int, dec] = abs.toFixed(decimals).split(".");
  const body = decimals > 0 ? `${groupThousands(int)},${dec}` : groupThousands(int);
  return `${sign}${value < 0 ? "-" : ""}${body}%`;
}

/**
 * Formats a plain number in Spanish notation: 1.983,45
 */
export function formatNumber(value: number, decimals = 2): string {
  const abs = Math.abs(value);
  const [int, dec] = abs.toFixed(decimals).split(".");
  const body = decimals > 0 ? `${groupThousands(int)},${dec}` : groupThousands(int);
  return `${value < 0 ? "-" : ""}${body}`;
}
