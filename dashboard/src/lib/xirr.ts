/**
 * XIRR (Extended Internal Rate of Return) calculation using Newton-Raphson method.
 * Returns annualized return rate or null if calculation doesn't converge.
 */
export function xirr(
  cashflows: Array<{ date: Date; amount: number }>
): number | null {
  if (cashflows.length < 2) return null;

  const sorted = [...cashflows].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  const d0 = sorted[0].date;

  function npv(rate: number): number {
    return sorted.reduce((sum, cf) => {
      const years =
        (cf.date.getTime() - d0.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return sum + cf.amount / Math.pow(1 + rate, years);
    }, 0);
  }

  function dnpv(rate: number): number {
    return sorted.reduce((sum, cf) => {
      const years =
        (cf.date.getTime() - d0.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return sum + (-years * cf.amount) / Math.pow(1 + rate, years + 1);
    }, 0);
  }

  let guess = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(guess);
    const df = dnpv(guess);
    if (Math.abs(df) < 1e-12) break;
    const newGuess = guess - f / df;
    if (Math.abs(newGuess - guess) < 1e-7) return newGuess;
    guess = newGuess;
    if (guess < -0.99) guess = -0.5;
    if (guess > 10) guess = 5;
  }

  return Math.abs(npv(guess)) < 1 ? guess : null;
}
