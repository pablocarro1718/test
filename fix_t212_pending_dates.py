"""
Script para corregir las fechas PENDIENTE en inversiones_unificadas.csv
usando t212_buy_operations_missing_date.csv (timestamps de fees de conversion).

Ejecutar una sola vez:  python fix_t212_pending_dates.py
Luego re-ejecutar:       python migrate_to_sqlite.py
"""

import csv
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict

DIR = Path(__file__).parent

# Mismo mapeo que normalizar_inversiones.py
TRADING212_TICKERS = {
    "SQ_US_EQ": "SQ",
    "BABA_US_EQ": "BABA",
    "NU_US_EQ": "NU",
    "SHOP_US_EQ": "SHOP",
    "BA_US_EQ": "BA",
    "MELI_US_EQ": "MELI",
    "FB_US_EQ": "META",
    "TCEHY_US_EQ": "TCEHY",
    "PLTR_US_EQ": "PLTR",
}


def normalize_code(code):
    """SQ_US_EQ → SQ, FB_US_EQ → META, etc."""
    return TRADING212_TICKERS.get(code, code.replace("_US_EQ", "").replace("_EQ", ""))


def get_price_at_date(ticker, date_str):
    """Obtiene el precio de cierre de un ticker en una fecha dada (via yfinance)."""
    try:
        import yfinance as yf
        end = (datetime.strptime(date_str, "%Y-%m-%d") + timedelta(days=5)).strftime("%Y-%m-%d")
        hist = yf.Ticker(ticker).history(start=date_str, end=end)
        if not hist.empty:
            return float(hist["Close"].iloc[0])
    except Exception as e:
        print(f"    ⚠️ No se pudo obtener precio de {ticker} en {date_str}: {e}")
    return None


def build_date_lookup():
    """
    Lee t212_buy_operations_missing_date.csv y construye:
    {(ticker, round(qty, 4)): [date_str, ...]}  (lista ordenada de fechas)
    """
    archivo = DIR / "t212_buy_operations_missing_date.csv"
    lookup = defaultdict(list)

    with open(archivo, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            ticker = normalize_code(row["code"])
            qty = round(float(row["quantity"]), 4)
            date_str = row["time"].split(" ")[0]  # "2024-09-26 16:33:21" → "2024-09-26"
            key = (ticker, qty)
            if date_str not in lookup[key]:
                lookup[key].append(date_str)

    # Ordenar fechas ascendentemente para cada clave
    for key in lookup:
        lookup[key].sort()

    return dict(lookup)


def pick_best_date(ticker, qty, candidate_dates, precio_unitario_usd):
    """
    Si hay múltiples fechas candidatas, elige la que tiene el precio de mercado
    más cercano al precio_unitario_usd conocido de la operación.
    """
    if len(candidate_dates) == 1:
        return candidate_dates[0]

    print(f"    → Múltiples fechas para {ticker} qty={qty}: {candidate_dates}")
    print(f"      Precio unitario conocido: ${precio_unitario_usd:.4f} USD")

    best_date = candidate_dates[0]
    best_diff = float("inf")

    for date_str in candidate_dates:
        market_price = get_price_at_date(ticker, date_str)
        if market_price is not None:
            diff = abs(market_price - precio_unitario_usd)
            print(f"      {date_str}: precio mercado = ${market_price:.2f}, diff = ${diff:.2f}")
            if diff < best_diff:
                best_diff = diff
                best_date = date_str
        else:
            print(f"      {date_str}: precio mercado no disponible")

    print(f"      → Seleccionada: {best_date}")
    return best_date


def fix_pending_dates():
    archivo = DIR / "inversiones_unificadas.csv"

    # Leer CSV completo
    with open(archivo, "r", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
        fieldnames = list(rows[0].keys()) if rows else []

    # Construir lookup de fechas
    date_lookup = build_date_lookup()
    print(f"✓ Lookup construido: {len(date_lookup)} combinaciones (ticker, qty)")

    # Procesar filas PENDIENTE
    fixes = 0
    not_found = []

    for row in rows:
        if row["fecha"] != "PENDIENTE":
            continue

        ticker = row["ticker"]
        qty = round(float(row["cantidad"]), 4)
        precio_usd = float(row["precio_unitario"])
        key = (ticker, qty)

        if key in date_lookup:
            candidates = date_lookup[key]
            chosen_date = pick_best_date(ticker, qty, candidates, precio_usd)
            row["fecha"] = chosen_date
            # Limpiar nota de PENDIENTE
            if row.get("notas") == "Fecha de compra pendiente de confirmar":
                row["notas"] = ""
            fixes += 1
            print(f"  ✓ {ticker} qty={qty} → {chosen_date}")
        else:
            not_found.append(f"{ticker} qty={qty}")
            print(f"  ✗ Sin match para {ticker} qty={qty}")

    # Re-ordenar por fecha (ya no hay PENDIENTE)
    rows_sorted = sorted(rows, key=lambda x: (x["fecha"] == "PENDIENTE", x["fecha"]))

    # Guardar CSV actualizado
    with open(archivo, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows_sorted)

    print(f"\n{'=' * 50}")
    print(f"RESUMEN: {fixes} fechas corregidas")
    if not_found:
        print(f"SIN MATCH ({len(not_found)}): {', '.join(not_found)}")
    remaining = sum(1 for r in rows_sorted if r["fecha"] == "PENDIENTE")
    if remaining == 0:
        print("✓ No quedan operaciones PENDIENTE")
    else:
        print(f"⚠️  Quedan {remaining} operaciones PENDIENTE")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    fix_pending_dates()
