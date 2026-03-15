"""
Sincroniza portfolio.db (SQLite local) con Turso via turso CLI.
Requiere: turso CLI instalado y autenticado, o TURSO_DATABASE_URL + TURSO_AUTH_TOKEN en el env.

Uso:
  python3 sync_to_turso.py

Variables de entorno:
  TURSO_DATABASE_URL   — ej: libsql://portfolio-xxx.aws-us-east-2.turso.io
  TURSO_AUTH_TOKEN     — JWT token de Turso
"""

import sqlite3
import os
import sys
import subprocess
import tempfile
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

# Tablas a sincronizar (en orden)
TABLES = ["brokers", "symbols", "fx_rates", "operations", "cash_flows", "price_cache"]

BATCH_SIZE = 100  # filas por batch de SQL para no hacer el archivo demasiado grande


def quote_value(val):
    """Convierte un valor Python a su representación SQL segura."""
    if val is None:
        return "NULL"
    if isinstance(val, (int, float)):
        return str(val)
    return "'" + str(val).replace("'", "''") + "'"


def generate_sync_sql(local_conn):
    """Genera el SQL de sincronización: DELETE + INSERT para todas las tablas."""
    lines = []
    for table in TABLES:
        cursor = local_conn.execute(f"SELECT * FROM {table}")
        columns = [d[0] for d in cursor.description]
        rows = cursor.fetchall()

        lines.append(f"-- {table}: {len(rows)} filas")
        lines.append(f"DELETE FROM {table};")

        for row in rows:
            vals = ", ".join(quote_value(v) for v in row)
            cols = ", ".join(columns)
            lines.append(f"INSERT INTO {table} ({cols}) VALUES ({vals});")

    return "\n".join(lines)


def run_turso_shell(sql_content):
    """Ejecuta SQL contra Turso usando turso db shell."""
    turso_bin = os.path.expanduser("~/.turso/turso")
    if not Path(turso_bin).exists():
        turso_bin = "turso"  # fallback a PATH

    with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False, encoding="utf-8") as f:
        f.write(sql_content)
        tmp_path = f.name

    try:
        cmd = [turso_bin, "db", "shell", TURSO_URL, f".read {tmp_path}"]
        print(f"  Ejecutando turso db shell...")
        result = subprocess.run(
            cmd,
            env={**os.environ, "TURSO_AUTH_TOKEN": TURSO_TOKEN},
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            print(f"  ERROR: {result.stderr[:500]}")
            # Try alternative approach: pipe directly
            return False
        return True
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def run_turso_shell_pipe(sql_content):
    """Ejecuta SQL contra Turso usando turso db shell con pipe."""
    turso_bin = os.path.expanduser("~/.turso/turso")
    if not Path(turso_bin).exists():
        turso_bin = "turso"

    cmd = [turso_bin, "db", "shell", TURSO_URL]
    env = {**os.environ, "TURSO_AUTH_TOKEN": TURSO_TOKEN}

    result = subprocess.run(
        cmd,
        input=sql_content,
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
    )
    if result.returncode != 0:
        print(f"  stderr: {result.stderr[:500]}")
        raise Exception(f"turso shell falló con código {result.returncode}")
    return result.stdout


def main():
    if not DB_PATH.exists():
        print(f"ERROR: No se encontró {DB_PATH}")
        print("Ejecuta primero: python3 migrate_to_sqlite.py")
        sys.exit(1)

    print("=" * 50)
    print("SYNC LOCAL → TURSO")
    print(f"  Origen: {DB_PATH}")
    print(f"  Destino: {TURSO_URL}")
    print("=" * 50)

    local_conn = sqlite3.connect(DB_PATH)

    try:
        # Contar filas antes de generar SQL
        for table in TABLES:
            count = local_conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            print(f"  {table}: {count} filas")

        print("\n  Generando SQL de sincronización...")
        sql = generate_sync_sql(local_conn)
        sql_lines = sql.count("\n")
        print(f"  SQL generado: {sql_lines} líneas")

        print("  Enviando a Turso...")
        output = run_turso_shell_pipe(sql)
        if output:
            print(f"  Output: {output[:200]}")

        print("\n✓ Sincronización completada con éxito")

    except Exception as e:
        print(f"\nERROR: {e}")
        sys.exit(1)
    finally:
        local_conn.close()


if __name__ == "__main__":
    main()
