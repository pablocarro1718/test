"""
Script de migración: consolida todas las fuentes de datos en portfolio.db (SQLite).
Ejecutar una sola vez después de correr normalizar_inversiones.py + actualizar_fechas_t212.py.

Para ejecutar: python migrate_to_sqlite.py
"""

import sqlite3
import csv
from pathlib import Path

DIR = Path(__file__).parent
DB_PATH = DIR / "portfolio.db"
CSV_PATH = DIR / "inversiones_unificadas.csv"

# ============================================================
# Datos hardcoded a migrar (de app.py y otros scripts)
# ============================================================

DEPOSITOS = [
    # Degiro - Depósitos
    {'fecha': '2019-12-28', 'broker': 'Degiro', 'cantidad': 1.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2020-03-03', 'broker': 'Degiro', 'cantidad': 50.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2020-03-17', 'broker': 'Degiro', 'cantidad': 300.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2020-04-07', 'broker': 'Degiro', 'cantidad': 200.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2020-04-14', 'broker': 'Degiro', 'cantidad': 1173.54, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2020-05-13', 'broker': 'Degiro', 'cantidad': 150.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2020-06-02', 'broker': 'Degiro', 'cantidad': 200.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2020-06-30', 'broker': 'Degiro', 'cantidad': 200.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    # Degiro - Retirada
    {'fecha': '2025-12-20', 'broker': 'Degiro', 'cantidad': -3454.08, 'moneda': 'EUR', 'tipo': 'withdrawal'},
    # Trading212 - Depósitos
    {'fecha': '2022-01-23', 'broker': 'Trading212', 'cantidad': 300.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2022-02-23', 'broker': 'Trading212', 'cantidad': 200.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2022-02-25', 'broker': 'Trading212', 'cantidad': 250.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2022-04-01', 'broker': 'Trading212', 'cantidad': 250.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2022-04-28', 'broker': 'Trading212', 'cantidad': 100.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2022-05-28', 'broker': 'Trading212', 'cantidad': 100.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2022-06-14', 'broker': 'Trading212', 'cantidad': 1000.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2022-06-28', 'broker': 'Trading212', 'cantidad': 100.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2022-07-28', 'broker': 'Trading212', 'cantidad': 100.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2024-01-17', 'broker': 'Trading212', 'cantidad': 600.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    # Trading212 - Retiradas
    {'fecha': '2024-09-27', 'broker': 'Trading212', 'cantidad': -604.20, 'moneda': 'EUR', 'tipo': 'withdrawal'},
    {'fecha': '2024-09-27', 'broker': 'Trading212', 'cantidad': -2402.80, 'moneda': 'EUR', 'tipo': 'withdrawal'},
    {'fecha': '2024-10-04', 'broker': 'Trading212', 'cantidad': -925.00, 'moneda': 'EUR', 'tipo': 'withdrawal'},
    # Kraken - Depósitos
    {'fecha': '2020-05-19', 'broker': 'Kraken', 'cantidad': 248.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2021-03-02', 'broker': 'Kraken', 'cantidad': 500.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2021-12-03', 'broker': 'Kraken', 'cantidad': 200.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2022-01-25', 'broker': 'Kraken', 'cantidad': 600.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2022-06-20', 'broker': 'Kraken', 'cantidad': 500.00, 'moneda': 'EUR', 'tipo': 'deposit'},
    # Fintual - Depósitos
    {'fecha': '2025-03-10', 'broker': 'Fintual', 'cantidad': 1138.82, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2025-04-03', 'broker': 'Fintual', 'cantidad': 927.31, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2025-05-29', 'broker': 'Fintual', 'cantidad': 1207.52, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2025-10-24', 'broker': 'Fintual', 'cantidad': 1335.43, 'moneda': 'EUR', 'tipo': 'deposit'},
    {'fecha': '2025-12-15', 'broker': 'Fintual', 'cantidad': 1372.11, 'moneda': 'EUR', 'tipo': 'deposit'},
    # IBKR - Depósitos
    # Nota: para MXN se puede incluir 'fx_rate' (EUR/MXN) para mayor precisión.
    # EURUSD 2026-01-02 = 1.175 × USD/MXN ~20.4 = EUR/MXN ~23.97
    {'fecha': '2026-01-02', 'broker': 'IBKR', 'cantidad': 30000.00, 'moneda': 'MXN', 'tipo': 'deposit', 'fx_rate': 23.97},
    {'fecha': '2026-01-23', 'broker': 'IBKR', 'cantidad': 1000.00, 'moneda': 'EUR', 'tipo': 'deposit'},
]

# ============================================================
# Posiciones externas (plataformas no trackeadas en operations)
# Actualizar 'value_usd' cuando cambie el valor del fondo.
# Se incluyen en el valor total del portfolio para el XIRR.
# ============================================================
EXTERNAL_POSITIONS = [
    # Añadir aquí solo plataformas cuyas posiciones NO están en la tabla operations.
    # Las posiciones de Fintual (ARGT, IEV, AAPL, AMZN, NU, SPY) SÍ están en
    # operations y se valoran a precios vivos → NO añadir Fintual aquí.
    # Usar esta lista solo para fondos opacos sin tracking individual de posiciones.
]

SYMBOL_MAP = {
    'BTC': {'yfinance': 'BTC-USD', 'asset_type': 'Crypto', 'currency': 'USD', 'name': 'Bitcoin'},
    'ETH': {'yfinance': 'ETH-USD', 'asset_type': 'Crypto', 'currency': 'USD', 'name': 'Ethereum'},
    'SOL': {'yfinance': 'SOL-USD', 'asset_type': 'Crypto', 'currency': 'USD', 'name': 'Solana'},
    'CSU': {'yfinance': 'CSU.TO', 'asset_type': 'Stock', 'currency': 'CAD', 'name': 'Constellation Software'},
    'CSPX': {'yfinance': 'CSPX.L', 'asset_type': 'ETF', 'currency': 'USD', 'name': 'iShares Core S&P 500 UCITS'},
    'AAPL': {'yfinance': 'AAPL', 'asset_type': 'Stock', 'currency': 'USD', 'name': 'Apple Inc.'},
    'META': {'yfinance': 'META', 'asset_type': 'Stock', 'currency': 'USD', 'name': 'Meta Platforms'},
    'AMZN': {'yfinance': 'AMZN', 'asset_type': 'Stock', 'currency': 'USD', 'name': 'Amazon'},
    'UBER': {'yfinance': 'UBER', 'asset_type': 'Stock', 'currency': 'USD', 'name': 'Uber Technologies'},
    'NU': {'yfinance': 'NU', 'asset_type': 'Stock', 'currency': 'USD', 'name': 'Nu Holdings'},
    'MELI': {'yfinance': 'MELI', 'asset_type': 'Stock', 'currency': 'USD', 'name': 'MercadoLibre'},
    'SHOP': {'yfinance': 'SHOP', 'asset_type': 'Stock', 'currency': 'USD', 'name': 'Shopify'},
    'BABA': {'yfinance': 'BABA', 'asset_type': 'Stock', 'currency': 'USD', 'name': 'Alibaba'},
    'TCEHY': {'yfinance': 'TCEHY', 'asset_type': 'Stock', 'currency': 'USD', 'name': 'Tencent'},
    'PLTR': {'yfinance': 'PLTR', 'asset_type': 'Stock', 'currency': 'USD', 'name': 'Palantir'},
    'SQ': {'yfinance': 'SQ', 'asset_type': 'Stock', 'currency': 'USD', 'name': 'Block Inc.'},
    'BA': {'yfinance': 'BA', 'asset_type': 'Stock', 'currency': 'USD', 'name': 'Boeing'},
    'PINS': {'yfinance': 'PINS', 'asset_type': 'Stock', 'currency': 'USD', 'name': 'Pinterest'},
    'BYND': {'yfinance': 'BYND', 'asset_type': 'Stock', 'currency': 'USD', 'name': 'Beyond Meat'},
    'DIS': {'yfinance': 'DIS', 'asset_type': 'Stock', 'currency': 'USD', 'name': 'Walt Disney'},
    'TWTR': {'yfinance': 'TWTR', 'asset_type': 'Stock', 'currency': 'USD', 'name': 'Twitter (OPA)'},
    'CLNX': {'yfinance': 'CLNX.MC', 'asset_type': 'Stock', 'currency': 'EUR', 'name': 'Cellnex Telecom'},
    'IAG': {'yfinance': 'IAG.MC', 'asset_type': 'Stock', 'currency': 'EUR', 'name': 'IAG'},
    'AIR': {'yfinance': 'AIR.PA', 'asset_type': 'Stock', 'currency': 'EUR', 'name': 'Airbus'},
    'MAS': {'yfinance': 'MAS.MC', 'asset_type': 'Stock', 'currency': 'EUR', 'name': 'Masmovil (OPA)'},
    'SPY': {'yfinance': 'SPY', 'asset_type': 'ETF', 'currency': 'USD', 'name': 'SPDR S&P 500 ETF'},
    'IEV': {'yfinance': 'IEV', 'asset_type': 'ETF', 'currency': 'USD', 'name': 'iShares Europe ETF'},
    'ARGT': {'yfinance': 'ARGT', 'asset_type': 'ETF', 'currency': 'USD', 'name': 'Global X MSCI Argentina ETF'},
    'URA': {'yfinance': 'URA', 'asset_type': 'ETF', 'currency': 'USD', 'name': 'Global X Uranium ETF'},
    'LTRX': {'yfinance': 'LTRX', 'asset_type': 'Stock', 'currency': 'USD', 'name': 'Lantronix'},
}

# ============================================================
# Saldos de efectivo no invertido por broker
# Actualizar estos valores manualmente cuando cambien.
# Se usan para calcular el valor total del portfolio en XIRR
# (el efectivo no invertido también es parte del portfolio).
# ============================================================
SALDOS_CAJA = [
    # {'broker': 'IBKR',       'currency': 'USD', 'amount': 0.0,  'amount_eur': 0.0,  'updated_at': '2026-03-16'},
    # {'broker': 'Kraken',     'currency': 'EUR', 'amount': 0.0,  'amount_eur': 0.0,  'updated_at': '2026-03-16'},
    # {'broker': 'Fintual',    'currency': 'EUR', 'amount': 0.0,  'amount_eur': 0.0,  'updated_at': '2026-03-16'},
]

BROKERS = [
    {'name': 'Degiro', 'display_name': 'Degiro', 'base_currency': 'EUR', 'sync_method': 'manual_csv', 'is_active': 0},
    {'name': 'Trading212', 'display_name': 'Trading 212', 'base_currency': 'EUR', 'sync_method': 'manual_csv', 'is_active': 0},
    {'name': 'Kraken', 'display_name': 'Kraken', 'base_currency': 'EUR', 'sync_method': 'kraken_api', 'is_active': 1},
    {'name': 'Fintual', 'display_name': 'Fintual', 'base_currency': 'USD', 'sync_method': 'manual_csv', 'is_active': 1},
    {'name': 'IBKR', 'display_name': 'Interactive Brokers', 'base_currency': 'USD', 'sync_method': 'ibkr_api', 'is_active': 1},
]


# ============================================================
# Schema
# ============================================================

SCHEMA = """
CREATE TABLE IF NOT EXISTS operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    broker TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    ticker TEXT NOT NULL,
    isin TEXT DEFAULT '',
    quantity REAL NOT NULL,
    price_original REAL NOT NULL,
    currency_original TEXT NOT NULL,
    amount_original REAL NOT NULL,
    fx_rate REAL,
    fx_pair TEXT DEFAULT '',
    amount_eur REAL NOT NULL,
    commission_eur REAL DEFAULT 0,
    net_amount_eur REAL NOT NULL,
    notes TEXT DEFAULT '',
    source TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_operations_broker ON operations(broker);
CREATE INDEX IF NOT EXISTS idx_operations_ticker ON operations(ticker);
CREATE INDEX IF NOT EXISTS idx_operations_date ON operations(date);
CREATE INDEX IF NOT EXISTS idx_operations_type ON operations(operation_type);

CREATE TABLE IF NOT EXISTS cash_flows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    broker TEXT NOT NULL,
    flow_type TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    amount_eur REAL NOT NULL,
    fx_rate REAL,
    notes TEXT DEFAULT '',
    source TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cash_flows_broker ON cash_flows(broker);
CREATE INDEX IF NOT EXISTS idx_cash_flows_date ON cash_flows(date);

CREATE TABLE IF NOT EXISTS fx_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    pair TEXT NOT NULL,
    rate REAL NOT NULL,
    source TEXT DEFAULT 'yfinance',
    fetched_at TEXT DEFAULT (datetime('now')),
    UNIQUE(date, pair)
);

CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup ON fx_rates(date, pair);

CREATE TABLE IF NOT EXISTS symbols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL UNIQUE,
    yfinance_symbol TEXT,
    isin TEXT DEFAULT '',
    name TEXT DEFAULT '',
    asset_type TEXT,
    currency TEXT,
    exchange TEXT DEFAULT '',
    notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS brokers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT,
    base_currency TEXT DEFAULT 'EUR',
    sync_method TEXT,
    is_active INTEGER DEFAULT 1,
    notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS price_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    symbol TEXT NOT NULL,
    close_price REAL NOT NULL,
    currency TEXT NOT NULL,
    fetched_at TEXT DEFAULT (datetime('now')),
    UNIQUE(date, symbol)
);

CREATE INDEX IF NOT EXISTS idx_price_cache_lookup ON price_cache(date, symbol);

CREATE TABLE IF NOT EXISTS cash_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    broker TEXT NOT NULL,
    currency TEXT NOT NULL,
    amount REAL NOT NULL,
    amount_eur REAL NOT NULL,
    updated_at TEXT NOT NULL,
    source TEXT DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS external_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    description TEXT DEFAULT '',
    value_usd REAL NOT NULL,
    value_eur REAL NOT NULL,
    updated_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
"""


def create_database():
    """Crea la base de datos y el schema."""
    if DB_PATH.exists():
        DB_PATH.unlink()
        print("  Base de datos anterior eliminada")

    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    conn.commit()
    print(f"  ✓ Base de datos creada: {DB_PATH}")
    return conn


def migrate_operations(conn):
    """Migra inversiones_unificadas.csv a la tabla operations."""
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    count = 0
    for row in rows:
        # Determinar fx_pair basado en moneda
        moneda = row["moneda_original"]
        tc = row["tipo_cambio"]
        if moneda == "USD" and tc:
            fx_pair = "EURUSD=X"
        elif moneda == "CAD" and tc:
            fx_pair = "CADUSD=X/EURUSD=X"
        else:
            fx_pair = ""

        conn.execute("""
            INSERT INTO operations (date, broker, operation_type, asset_type, ticker, isin,
                quantity, price_original, currency_original, amount_original,
                fx_rate, fx_pair, amount_eur, commission_eur, net_amount_eur,
                notes, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            row["fecha"],
            row["broker"],
            row["tipo_operacion"],
            row["tipo_activo"],
            row["ticker"],
            row["isin"],
            float(row["cantidad"]),
            float(row["precio_unitario"]),
            moneda,
            float(row["importe_bruto"]),
            float(tc) if tc else None,
            fx_pair,
            float(row["importe_eur"]),
            float(row["comisiones_eur"]),
            float(row["importe_neto_eur"]),
            row["notas"],
            f"{row['broker'].lower()}_csv",
        ))
        count += 1

    conn.commit()
    print(f"  ✓ {count} operaciones migradas")
    return count


def migrate_cash_flows(conn):
    """Migra depósitos y retiradas a la tabla cash_flows."""
    count = 0
    for dep in DEPOSITOS:
        amount = dep["cantidad"]
        moneda = dep["moneda"]

        # Convertir a EUR
        if moneda == "EUR":
            amount_eur = amount
            fx_rate = None
        elif moneda == "MXN":
            # MXN: usar tasa del depósito si se especifica, si no 18.0 como fallback
            fx_rate = dep.get("fx_rate", 18.0)
            amount_eur = amount / fx_rate
        else:
            amount_eur = amount
            fx_rate = None

        conn.execute("""
            INSERT INTO cash_flows (date, broker, flow_type, amount, currency, amount_eur, fx_rate, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            dep["fecha"],
            dep["broker"],
            dep["tipo"],
            amount,
            moneda,
            round(amount_eur, 2),
            fx_rate,
            "manual_hardcoded",
        ))
        count += 1

    conn.commit()
    print(f"  ✓ {count} cash flows migrados")
    return count


def migrate_fx_rates(conn):
    """Extrae tipos de cambio del CSV y los almacena en fx_rates."""
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rates_seen = set()
        count = 0

        for row in reader:
            tc = row["tipo_cambio"]
            if not tc:
                continue

            fecha = row["fecha"]
            moneda = row["moneda_original"]

            if moneda == "USD":
                pair = "EURUSD=X"
            elif moneda == "CAD":
                pair = "CADUSD=X"
            else:
                continue

            key = (fecha, pair)
            if key in rates_seen:
                continue
            rates_seen.add(key)

            try:
                conn.execute("""
                    INSERT OR IGNORE INTO fx_rates (date, pair, rate, source)
                    VALUES (?, ?, ?, ?)
                """, (fecha, pair, float(tc), "csv_migration"))
                count += 1
            except Exception:
                pass

    conn.commit()
    print(f"  ✓ {count} tipos de cambio almacenados")
    return count


def migrate_external_positions(conn):
    """Migra posiciones externas (e.g. Fintual) a la tabla external_positions.

    El valor en USD se convierte a EUR usando el tipo de cambio EURUSD más
    cercano disponible en la tabla fx_rates. Si no hay ningún rate disponible
    se usa 1.15 como fallback razonable para 2025-2026.
    """
    conn.execute("DELETE FROM external_positions")
    count = 0
    for pos in EXTERNAL_POSITIONS:
        # Buscar el EURUSD más cercano a updated_at
        row = conn.execute(
            """SELECT rate FROM fx_rates
               WHERE pair = 'EURUSD=X'
               ORDER BY ABS(julianday(date) - julianday(?)) LIMIT 1""",
            (pos["updated_at"],)
        ).fetchone()
        eurusd = row[0] if row else 1.15
        value_eur = round(pos["value_usd"] / eurusd, 2)

        conn.execute("""
            INSERT INTO external_positions (platform, description, value_usd, value_eur, updated_at)
            VALUES (?, ?, ?, ?, ?)
        """, (pos["platform"], pos["description"], pos["value_usd"], value_eur, pos["updated_at"]))
        count += 1
        print(f"    {pos['platform']}: ${pos['value_usd']:,.2f} USD → {value_eur:,.2f} EUR (EURUSD={eurusd})")

    conn.commit()
    if count:
        print(f"  ✓ {count} posición(es) externa(s) migrada(s)")
    else:
        print("  ℹ  No hay posiciones externas configuradas (EXTERNAL_POSITIONS vacío)")
    return count


def migrate_cash_balances(conn):
    """Migra saldos de efectivo no invertido a la tabla cash_balances."""
    count = 0
    for saldo in SALDOS_CAJA:
        conn.execute("""
            INSERT INTO cash_balances (broker, currency, amount, amount_eur, updated_at, source)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            saldo["broker"],
            saldo["currency"],
            saldo["amount"],
            saldo["amount_eur"],
            saldo["updated_at"],
            "manual",
        ))
        count += 1

    conn.commit()
    if count:
        print(f"  ✓ {count} saldos de caja migrados")
    else:
        print("  ℹ  No hay saldos de caja configurados (SALDOS_CAJA vacío)")
    return count


def migrate_symbols(conn):
    """Seedea la tabla symbols desde SYMBOL_MAP."""
    count = 0
    for ticker, info in SYMBOL_MAP.items():
        conn.execute("""
            INSERT OR IGNORE INTO symbols (ticker, yfinance_symbol, name, asset_type, currency)
            VALUES (?, ?, ?, ?, ?)
        """, (ticker, info["yfinance"], info["name"], info["asset_type"], info["currency"]))
        count += 1

    conn.commit()
    print(f"  ✓ {count} símbolos registrados")
    return count


def migrate_brokers(conn):
    """Seedea la tabla brokers."""
    count = 0
    for broker in BROKERS:
        conn.execute("""
            INSERT OR IGNORE INTO brokers (name, display_name, base_currency, sync_method, is_active)
            VALUES (?, ?, ?, ?, ?)
        """, (broker["name"], broker["display_name"], broker["base_currency"],
              broker["sync_method"], broker["is_active"]))
        count += 1

    conn.commit()
    print(f"  ✓ {count} brokers registrados")
    return count


def validate(conn):
    """Valida que los datos migrados coinciden con el CSV original."""
    print("\n  Validando integridad...")

    # Contar operaciones
    db_count = conn.execute("SELECT COUNT(*) FROM operations").fetchone()[0]
    with open(CSV_PATH) as f:
        csv_count = sum(1 for _ in csv.DictReader(f))
    assert db_count == csv_count, f"Mismatch: DB={db_count}, CSV={csv_count}"
    print(f"    ✓ Operaciones: {db_count} (coincide)")

    # Totales por tipo
    for op_type in ["BUY", "SELL", "DIVIDEND"]:
        db_total = conn.execute(
            "SELECT ROUND(SUM(net_amount_eur), 2) FROM operations WHERE operation_type = ?",
            (op_type,)
        ).fetchone()[0] or 0

        csv_total = 0
        with open(CSV_PATH) as f:
            for row in csv.DictReader(f):
                if row["tipo_operacion"] == op_type:
                    csv_total += float(row["importe_neto_eur"])
        csv_total = round(csv_total, 2)

        diff = abs(db_total - csv_total)
        status = "✓" if diff < 0.02 else "✗"
        print(f"    {status} {op_type}: DB={db_total:,.2f} CSV={csv_total:,.2f} (diff={diff:.2f})")

    # Totales por broker
    for broker in ["Degiro", "Kraken", "Trading212", "Fintual", "IBKR"]:
        db_count = conn.execute(
            "SELECT COUNT(*) FROM operations WHERE broker = ?", (broker,)
        ).fetchone()[0]
        print(f"    Broker {broker}: {db_count} ops")

    # Cash flows
    cf_count = conn.execute("SELECT COUNT(*) FROM cash_flows").fetchone()[0]
    deposits = conn.execute(
        "SELECT ROUND(SUM(amount_eur), 2) FROM cash_flows WHERE flow_type = 'deposit'"
    ).fetchone()[0] or 0
    withdrawals = conn.execute(
        "SELECT ROUND(SUM(amount_eur), 2) FROM cash_flows WHERE flow_type = 'withdrawal'"
    ).fetchone()[0] or 0
    print(f"    ✓ Cash flows: {cf_count} ({deposits:,.2f} depositos, {withdrawals:,.2f} retiradas)")


def main():
    print("=" * 60)
    print("MIGRACIÓN A SQLITE")
    print("=" * 60)

    print("\n[1/8] Creando base de datos...")
    conn = create_database()

    print("\n[2/8] Migrando operaciones desde CSV...")
    migrate_operations(conn)

    print("\n[3/8] Migrando depósitos y retiradas...")
    migrate_cash_flows(conn)

    print("\n[4/8] Almacenando tipos de cambio históricos...")
    migrate_fx_rates(conn)

    print("\n[5/8] Registrando símbolos y tickers...")
    migrate_symbols(conn)

    print("\n[6/8] Registrando brokers...")
    migrate_brokers(conn)

    print("\n[7/8] Migrando saldos de caja no invertidos...")
    migrate_cash_balances(conn)

    print("\n[8/8] Migrando posiciones externas (Fintual, etc.)...")
    migrate_external_positions(conn)

    print("\n" + "=" * 60)
    print("VALIDACIÓN")
    print("=" * 60)
    validate(conn)

    conn.close()

    print(f"\n✓ Migración completada: {DB_PATH}")
    print(f"  Tamaño: {DB_PATH.stat().st_size / 1024:.1f} KB")
    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
