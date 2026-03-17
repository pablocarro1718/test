"""
Sincroniza portfolio.db (SQLite local) con Turso via HTTP API.
No requiere CLI de turso instalado.

Uso:
  python3 sync_to_turso.py

Variables de entorno:
  TURSO_DATABASE_URL   — ej: libsql://portfolio-xxx.aws-us-east-2.turso.io
  TURSO_AUTH_TOKEN     — JWT token de Turso
"""

import sqlite3
import os
import sys
import requests
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
_env_local = Path(__file__).parent / "dashboard" / ".env.local"
load_dotenv(_env_local)

DIR = Path(__file__).parent
DB_PATH = DIR / "portfolio.db"

TURSO_URL = os.environ.get("TURSO_DATABASE_URL", "")
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "")

if not TURSO_URL or not TURSO_TOKEN:
    print("ERROR: TURSO_DATABASE_URL y TURSO_AUTH_TOKEN deben estar definidos")
    sys.exit(1)

# libsql:// → https:// para la HTTP API
HTTP_BASE = TURSO_URL.replace("libsql://", "https://")
API_URL = f"{HTTP_BASE}/v2/pipeline"

# Tablas a sincronizar (en orden)
TABLES = ["brokers", "symbols", "fx_rates", "operations", "cash_flows", "price_cache", "cash_balances"]

# DDL para tablas que pueden no existir aún en Turso
ENSURE_TABLES_SQL = [
    """CREATE TABLE IF NOT EXISTS cash_balances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        broker TEXT NOT NULL,
        currency TEXT NOT NULL,
        amount REAL NOT NULL,
        amount_eur REAL NOT NULL,
        updated_at TEXT NOT NULL,
        source TEXT DEFAULT 'manual'
    )""",
]

BATCH_SIZE = 50  # sentencias por request HTTP


def quote_value(val):
    """Convierte un valor Python a su representación SQL segura."""
    if val is None:
        return "NULL"
    if isinstance(val, (int, float)):
        return str(val)
    return "'" + str(val).replace("'", "''") + "'"


def build_statements(local_conn):
    """Genera la lista de sentencias SQL: DELETE + INSERT para todas las tablas."""
    stmts = []
    for table in TABLES:
        cursor = local_conn.execute(f"SELECT * FROM {table}")
        columns = [d[0] for d in cursor.description]
        rows = cursor.fetchall()

        stmts.append(f"DELETE FROM {table}")
        for row in rows:
            vals = ", ".join(quote_value(v) for v in row)
            cols = ", ".join(columns)
            stmts.append(f"INSERT INTO {table} ({cols}) VALUES ({vals})")

    return stmts


def send_batch(stmts, batch_num, total_batches):
    """Envía un batch de sentencias a Turso via HTTP API."""
    headers = {
        "Authorization": f"Bearer {TURSO_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "requests": [
            {"type": "execute", "stmt": {"sql": s}} for s in stmts
        ] + [{"type": "close"}]
    }

    resp = requests.post(API_URL, headers=headers, json=payload, timeout=60)

    if not resp.ok:
        raise Exception(
            f"HTTP {resp.status_code} en batch {batch_num}/{total_batches}: {resp.text[:500]}"
        )

    # Comprobar si hay errores en las respuestas individuales
    data = resp.json()
    for i, result in enumerate(data.get("results", [])):
        if result.get("type") == "error":
            raise Exception(
                f"Error en sentencia {i} del batch {batch_num}: {result.get('error', {}).get('message', 'unknown')}"
            )


def main():
    if not DB_PATH.exists():
        print(f"ERROR: No se encontró {DB_PATH}")
        print("Ejecuta primero: python3 migrate_to_sqlite.py")
        sys.exit(1)

    print("=" * 50)
    print("SYNC LOCAL → TURSO (HTTP API)")
    print(f"  Origen:  {DB_PATH}")
    print(f"  Destino: {API_URL}")
    print("=" * 50)

    local_conn = sqlite3.connect(DB_PATH)

    try:
        # Asegurar que todas las tablas existen en Turso antes de sincronizar
        if ENSURE_TABLES_SQL:
            print("\n  Asegurando schema remoto...")
            send_batch(ENSURE_TABLES_SQL, 0, 0)
            print(f"  ✓ Schema remoto verificado")

        for table in TABLES:
            count = local_conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            print(f"  {table}: {count} filas")

        print("\n  Generando sentencias SQL...")
        stmts = build_statements(local_conn)
        print(f"  Total sentencias: {len(stmts)}")

        # Enviar en batches
        total_batches = (len(stmts) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"  Enviando en {total_batches} batch(es) de {BATCH_SIZE}...")

        for i in range(0, len(stmts), BATCH_SIZE):
            batch = stmts[i : i + BATCH_SIZE]
            batch_num = i // BATCH_SIZE + 1
            send_batch(batch, batch_num, total_batches)
            print(f"  ✓ Batch {batch_num}/{total_batches} ({len(batch)} sentencias)")

        print("\n✓ Sincronización completada con éxito")

    except Exception as e:
        print(f"\nERROR: {e}")
        sys.exit(1)
    finally:
        local_conn.close()


if __name__ == "__main__":
    main()
