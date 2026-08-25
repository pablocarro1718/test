"""
Reconstruye el valor diario de la cartera (solo securities) en EUR → tabla nav_history.
Paso del pipeline: ejecutar DESPUÉS de migrate_to_sqlite.py (lee operations + symbols).

Para cada día de mercado desde la primera operación hasta hoy:
  value_eur(día)    = Σ qty(día) × precio_nativo(día) × FX_nativo→EUR(día)
  net_flow_eur(día) = Σ (compras − ventas) de securities ese día (para TWR / item 1)

Divisas: precios nativos de Yahoo (USD/CAD/EUR); FX histórico de EURUSD=X / EURCAD=X.
La cripto ya usa pares -EUR (currency=EUR) → sin conversión.
Deslistados / sin histórico Yahoo: se valoran a su precio medio de compra (proxy plano).
"""

import sqlite3
import bisect
from datetime import date, timedelta
from pathlib import Path
import yfinance as yf

DIR = Path(__file__).parent
DB_PATH = DIR / "portfolio.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS nav_history (
    date TEXT PRIMARY KEY,
    value_eur REAL NOT NULL,
    net_flow_eur REAL NOT NULL DEFAULT 0
);
"""


def fetch_close_series(symbol, start):
    """Devuelve (dates[], closes[]) diarios desde `start`, o ([],[]) si no hay datos."""
    try:
        h = yf.Ticker(symbol).history(start=start, auto_adjust=True)
        if h.empty:
            return [], []
        dates = [d.strftime("%Y-%m-%d") for d in h.index]
        closes = [float(c) for c in h["Close"].tolist()]
        pairs = sorted(zip(dates, closes), key=lambda x: x[0])
        return [p[0] for p in pairs], [p[1] for p in pairs]
    except Exception as e:
        print(f"  ⚠️  sin histórico para {symbol}: {e}")
        return [], []


def make_lookup(dates, values):
    """Devuelve fn(D) → último valor con fecha <= D (forward-fill), o None si D < primera fecha."""
    def lookup(d):
        i = bisect.bisect_right(dates, d)
        return values[i - 1] if i > 0 else None
    return lookup


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    cur = conn.cursor()

    # Símbolos: ticker → (yfinance_symbol, currency)
    sym = {}
    for ticker, ysym, currency in cur.execute("SELECT ticker, yfinance_symbol, currency FROM symbols"):
        sym[ticker] = (ysym or ticker, currency or "USD")

    # Operaciones BUY/SELL ordenadas
    ops = cur.execute(
        "SELECT date, ticker, operation_type, quantity, net_amount_eur, price_original "
        "FROM operations WHERE operation_type IN ('BUY','SELL') ORDER BY date"
    ).fetchall()
    if not ops:
        print("  (sin operaciones; nav_history queda vacía)")
        conn.execute("DELETE FROM nav_history")
        conn.commit()
        return

    start_date = ops[0][0]
    today = date.today().isoformat()
    fetch_start = (date.fromisoformat(start_date) - timedelta(days=7)).isoformat()

    tickers = sorted({o[1] for o in ops})
    currencies = {sym.get(t, (t, "USD"))[1] for t in tickers}

    # Precios por ticker + proxy de coste (precio medio de compra nativo) por si no hay histórico
    print(f"  Descargando históricos de {len(tickers)} tickers...")
    price_lookup = {}
    cost_proxy = {}
    for t in tickers:
        ysym, _ = sym.get(t, (t, "USD"))
        d, c = fetch_close_series(ysym, fetch_start)
        price_lookup[t] = make_lookup(d, c) if d else (lambda _d: None)
        buys = [(o[3], o[5]) for o in ops if o[1] == t and o[2] == "BUY" and o[5] > 0]
        qty = sum(q for q, _ in buys)
        cost_proxy[t] = (sum(q * p for q, p in buys) / qty) if qty > 0 else 0.0

    # FX nativo→EUR por divisa (EUR = 1). Usamos EUR{ccy}=X invertido (par mayor, histórico completo).
    fx_lookup = {"EUR": (lambda _d: 1.0)}
    for ccy in currencies:
        if ccy == "EUR":
            continue
        d, c = fetch_close_series(f"EUR{ccy}=X", fetch_start)  # EUR→ccy (ej. EURUSD ~1.08)
        if d:
            inv = [1.0 / r if r else None for r in c]
            fx_lookup[ccy] = make_lookup(d, inv)  # ccy→EUR
        else:
            fx_lookup[ccy] = (lambda _d: None)

    # Eje temporal: días naturales desde la primera operación hasta hoy.
    # Cada día toma el último precio disponible (forward-fill), así que fines de semana
    # y festivos heredan el cierre anterior — NAV diario continuo y robusto.
    d0 = date.fromisoformat(start_date)
    d1 = date.today()
    axis = [(d0 + timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]

    # Flujos por día
    running = {t: 0.0 for t in tickers}
    op_idx = 0
    rows = []
    for D in axis:
        day_flow = 0.0
        while op_idx < len(ops) and ops[op_idx][0] <= D:
            _, t, otype, q, net_eur, _ = ops[op_idx]
            running[t] += q if otype == "BUY" else -q
            day_flow += -(net_eur or 0.0)  # BUY(neg)→+, SELL(pos)→−
            op_idx += 1
        value = 0.0
        for t, q in running.items():
            if q <= 0.0001:
                continue
            _, ccy = sym.get(t, (t, "USD"))
            price = price_lookup[t](D)
            if price is None:
                price = cost_proxy[t]  # proxy plano para deslistados / antes del primer dato
            fx = fx_lookup.get(ccy, (lambda _d: None))(D)
            if fx is None:
                fx = 1.0
            value += q * price * fx
        rows.append((D, round(value, 2), round(day_flow, 2)))

    cur.execute("DELETE FROM nav_history")
    cur.executemany("INSERT INTO nav_history (date, value_eur, net_flow_eur) VALUES (?, ?, ?)", rows)
    conn.commit()

    nonzero = [r for r in rows if r[1] > 0]
    print(f"  ✓ nav_history: {len(rows)} días ({rows[0][0]} → {rows[-1][0]})")
    if nonzero:
        print(f"    Valor primer día con posiciones: {nonzero[0][1]:,.0f} € ({nonzero[0][0]})")
        print(f"    Valor último día: {rows[-1][1]:,.0f} € ({rows[-1][0]})")
    conn.close()


if __name__ == "__main__":
    print("=" * 50)
    print("BUILD NAV HISTORY")
    print("=" * 50)
    main()
