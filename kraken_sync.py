"""
Kraken API Sync Script
Descarga transacciones de Kraken y las convierte al formato unificado.
"""

import requests
import urllib.parse
import hashlib
import hmac
import base64
import time
import os
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

KRAKEN_API_KEY = os.environ.get('KRAKEN_API_KEY')
KRAKEN_PRIVATE_KEY = os.environ.get('KRAKEN_PRIVATE_KEY')

# URL base de Kraken
KRAKEN_API_URL = "https://api.kraken.com"


def check_credentials():
    """Verifica que las credenciales estén configuradas"""
    if not KRAKEN_API_KEY or not KRAKEN_PRIVATE_KEY:
        print("❌ Error: Credenciales de Kraken no configuradas")
        print("   Añade a tu archivo .env:")
        print("   KRAKEN_API_KEY=tu_api_key")
        print("   KRAKEN_PRIVATE_KEY=tu_private_key")
        return False
    return True


def get_kraken_signature(urlpath: str, data: dict, secret: str) -> str:
    """
    Genera la firma para autenticar requests a Kraken
    """
    postdata = urllib.parse.urlencode(data)
    encoded = (str(data['nonce']) + postdata).encode()
    message = urlpath.encode() + hashlib.sha256(encoded).digest()

    mac = hmac.new(base64.b64decode(secret), message, hashlib.sha512)
    sigdigest = base64.b64encode(mac.digest())
    return sigdigest.decode()


def kraken_request(uri_path: str, data: dict = None) -> dict:
    """
    Realiza una request autenticada a la API privada de Kraken
    """
    if data is None:
        data = {}

    data['nonce'] = str(int(time.time() * 1000))

    headers = {
        'API-Key': KRAKEN_API_KEY,
        'API-Sign': get_kraken_signature(uri_path, data, KRAKEN_PRIVATE_KEY)
    }

    response = requests.post(
        KRAKEN_API_URL + uri_path,
        headers=headers,
        data=data
    )

    return response.json()


def get_trades_history() -> pd.DataFrame:
    """
    Obtiene el historial de trades de Kraken
    """
    print("📡 Obteniendo historial de trades...")

    all_trades = []
    offset = 0

    while True:
        result = kraken_request('/0/private/TradesHistory', {'ofs': offset})

        if result.get('error'):
            print(f"❌ Error: {result['error']}")
            break

        trades = result.get('result', {}).get('trades', {})

        if not trades:
            break

        for trade_id, trade in trades.items():
            trade['trade_id'] = trade_id
            all_trades.append(trade)

        count = result.get('result', {}).get('count', 0)
        offset += len(trades)

        print(f"   Procesados {offset}/{count} trades...")

        if offset >= count:
            break

        time.sleep(1)  # Rate limiting

    if all_trades:
        df = pd.DataFrame(all_trades)
        return df

    return pd.DataFrame()


def get_ledger() -> pd.DataFrame:
    """
    Obtiene el ledger (depósitos, retiros, etc.) de Kraken
    """
    print("📡 Obteniendo ledger (depósitos/retiros)...")

    all_entries = []
    offset = 0

    while True:
        result = kraken_request('/0/private/Ledgers', {'ofs': offset})

        if result.get('error'):
            print(f"❌ Error: {result['error']}")
            break

        ledger = result.get('result', {}).get('ledger', {})

        if not ledger:
            break

        for entry_id, entry in ledger.items():
            entry['entry_id'] = entry_id
            all_entries.append(entry)

        count = result.get('result', {}).get('count', 0)
        offset += len(ledger)

        print(f"   Procesados {offset}/{count} entradas...")

        if offset >= count:
            break

        time.sleep(1)  # Rate limiting

    if all_entries:
        df = pd.DataFrame(all_entries)
        return df

    return pd.DataFrame()


def convert_trades_to_unified(trades_df: pd.DataFrame) -> pd.DataFrame:
    """
    Convierte trades de Kraken al formato unificado
    """
    if trades_df.empty:
        return pd.DataFrame()

    unified_rows = []

    for _, row in trades_df.iterrows():
        try:
            # Parsear el par (ej: XXBTZEUR -> BTC/EUR)
            pair = row.get('pair', '')

            # Determinar ticker y moneda
            # Kraken usa prefijos X para crypto y Z para fiat
            ticker = pair.replace('XXBT', 'BTC').replace('XETH', 'ETH').replace('ZEUR', '')
            ticker = ticker.replace('EUR', '').replace('USD', '')

            # Tipo de operación
            action = 'BUY' if row.get('type') == 'buy' else 'SELL'

            # Fecha
            timestamp = float(row.get('time', 0))
            fecha = datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d')

            unified_row = {
                'Fecha': fecha,
                'Broker': 'Kraken',
                'Acción': action,
                'Tipo': 'Crypto',
                'Ticker': ticker,
                'ISIN': '',
                'Cantidad': abs(float(row.get('vol', 0))),
                'Precio_orig': float(row.get('price', 0)),
                'Moneda_orig': 'EUR',
                'Coste_orig': abs(float(row.get('cost', 0))),
                'Coste_EUR': abs(float(row.get('cost', 0))),
                'TC_EUR': 1.0,
                'Comisión': float(row.get('fee', 0)),
                'Valor_EUR': 0,
                'Nombre': pair
            }
            unified_rows.append(unified_row)

        except Exception as e:
            print(f"⚠️ Error procesando trade: {e}")
            continue

    return pd.DataFrame(unified_rows)


def convert_ledger_to_deposits(ledger_df: pd.DataFrame) -> pd.DataFrame:
    """
    Extrae depósitos y retiros del ledger
    """
    if ledger_df.empty:
        return pd.DataFrame()

    deposits = []

    # Filtrar solo depósitos y retiros
    deposit_types = ['deposit', 'withdrawal']

    for _, row in ledger_df.iterrows():
        try:
            entry_type = row.get('type', '')

            if entry_type in deposit_types:
                timestamp = float(row.get('time', 0))
                fecha = datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d')

                asset = row.get('asset', '')
                # Normalizar nombre del asset
                asset = asset.replace('ZEUR', 'EUR').replace('XXBT', 'BTC').replace('XETH', 'ETH')

                deposits.append({
                    'Fecha': fecha,
                    'Moneda': asset,
                    'Cantidad': float(row.get('amount', 0)),
                    'Tipo': 'Deposit' if entry_type == 'deposit' else 'Withdrawal',
                    'Descripción': f"Kraken {entry_type}"
                })

        except Exception as e:
            print(f"⚠️ Error procesando ledger entry: {e}")
            continue

    return pd.DataFrame(deposits)


def sync_kraken_transactions():
    """
    Función principal: sincronizar transacciones de Kraken
    """
    print("=" * 50)
    print("🦑 Kraken API Sync")
    print("=" * 50)

    # Verificar credenciales
    if not check_credentials():
        return None, None

    try:
        # Obtener trades
        trades_df = get_trades_history()
        print(f"\n📊 Trades encontrados: {len(trades_df)}")

        if not trades_df.empty:
            print("\n--- TRADES RAW ---")
            print(trades_df.head().to_string())

        # Obtener ledger
        ledger_df = get_ledger()
        print(f"\n💰 Entradas de ledger: {len(ledger_df)}")

        # Convertir a formato unificado
        unified_df = convert_trades_to_unified(trades_df)
        deposits_df = convert_ledger_to_deposits(ledger_df)

        if not unified_df.empty:
            print(f"\n📋 Transacciones en formato unificado:")
            print(unified_df.to_string())
            unified_df.to_csv('kraken_transactions.csv', index=False)
            print(f"\n💾 Trades guardados en kraken_transactions.csv")

        if not deposits_df.empty:
            print(f"\n💵 Depósitos/Retiros:")
            print(deposits_df.to_string())
            deposits_df.to_csv('kraken_deposits.csv', index=False)
            print(f"💾 Depósitos guardados en kraken_deposits.csv")

        return unified_df, deposits_df

    except Exception as e:
        print(f"❌ Error: {e}")
        raise


if __name__ == '__main__':
    sync_kraken_transactions()
