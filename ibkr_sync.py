"""
IBKR Flex Query Sync Script
Descarga transacciones de Interactive Brokers y las convierte al formato unificado.
"""

import requests
import xml.etree.ElementTree as ET
import pandas as pd
import time
import os
from datetime import datetime

# Configuración - Las claves se cargan desde variables de entorno
# Crear archivo .env con: IBKR_TOKEN=xxx e IBKR_QUERY_ID=xxx
from dotenv import load_dotenv
load_dotenv()  # Carga variables desde .env si existe

IBKR_TOKEN = os.environ.get('IBKR_TOKEN')
IBKR_QUERY_ID = os.environ.get('IBKR_QUERY_ID')

def check_credentials():
    """Verifica que las credenciales estén configuradas"""
    if not IBKR_TOKEN or not IBKR_QUERY_ID:
        print("❌ Error: Credenciales no configuradas")
        print("   Crea un archivo .env con:")
        print("   IBKR_TOKEN=tu_token_aqui")
        print("   IBKR_QUERY_ID=tu_query_id_aqui")
        return False
    return True

# URLs de IBKR Flex Query
FLEX_REQUEST_URL = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest"
FLEX_DOWNLOAD_URL = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement"


def request_flex_statement(token: str, query_id: str, max_retries: int = 6) -> str:
    """
    Paso 1: Solicitar el Flex Statement y obtener el Reference Code.
    Reintenta hasta max_retries veces en errores transitorios (código 1001).
    """
    params = {
        't': token,
        'q': query_id,
        'v': '3'
    }

    for attempt in range(max_retries):
        print(f"📡 Solicitando Flex Query {query_id} (intento {attempt + 1}/{max_retries})...")
        response = requests.get(FLEX_REQUEST_URL, params=params)

        print(f"   HTTP {response.status_code} — {response.text[:300]}")

        if response.status_code != 200:
            raise Exception(f"Error HTTP {response.status_code}: {response.text}")

        root = ET.fromstring(response.text)
        status = root.find('.//Status')

        if status is not None and status.text == 'Success':
            ref_code = root.find('.//ReferenceCode')
            if ref_code is None:
                raise Exception(f"No se encontró ReferenceCode: {response.text}")
            print(f"✅ Reference Code obtenido: {ref_code.text}")
            return ref_code.text

        # Error transitorio 1001: IBKR ocupado, reintentar con backoff
        error_code_el = root.find('.//ErrorCode')
        error_msg_el  = root.find('.//ErrorMessage')
        error_code    = error_code_el.text if error_code_el is not None else 'N/A'
        error_msg     = error_msg_el.text  if error_msg_el  is not None else 'Unknown'

        if error_code == '1001' and attempt < max_retries - 1:
            wait = 10 * (attempt + 1)   # 10s, 20s, 30s, 40s, 50s
            print(f"⏳ IBKR ocupado (1001), reintentando en {wait}s...")
            time.sleep(wait)
            continue

        raise Exception(f"Error IBKR [{error_code}]: {error_msg}")

    raise Exception("Máximo de reintentos alcanzado en SendRequest")


def download_flex_statement(token: str, reference_code: str, max_retries: int = 5) -> str:
    """
    Paso 2: Descargar el statement usando el Reference Code
    IBKR puede tardar unos segundos en generar el reporte
    """
    params = {
        't': token,
        'q': reference_code,
        'v': '3'
    }

    for attempt in range(max_retries):
        print(f"📥 Descargando statement (intento {attempt + 1}/{max_retries})...")
        response = requests.get(FLEX_DOWNLOAD_URL, params=params)

        if response.status_code != 200:
            raise Exception(f"Error HTTP {response.status_code}")

        # Verificar si aún está procesando
        if '<FlexStatementResponse' in response.text:
            root = ET.fromstring(response.text)
            status = root.find('.//Status')
            if status is not None and status.text == 'Warn':
                error_msg = root.find('.//ErrorMessage')
                if error_msg is not None and 'Please try again' in error_msg.text:
                    print(f"⏳ Reporte en preparación, esperando 5 segundos...")
                    time.sleep(5)
                    continue

        print(f"✅ Statement descargado ({len(response.text)} bytes)")
        return response.text

    raise Exception("Máximo de reintentos alcanzado")


def parse_trades_csv(csv_content: str) -> tuple:
    """
    Parsear las operaciones (trades) y transacciones de efectivo del CSV de IBKR
    Retorna: (trades_df, cash_df)
    """
    from io import StringIO

    lines = csv_content.strip().split('\n')

    # Sección de Trades
    trades_data = []
    trades_headers = None
    in_trades_section = False

    # Sección de Cash Transactions
    cash_data = []
    cash_headers = None
    in_cash_section = False

    for line in lines:
        # Detectar inicio de sección de Trades
        if 'Symbol' in line and 'Quantity' in line and 'TradePrice' in line:
            trades_headers = line.split(',')
            in_trades_section = True
            in_cash_section = False
            continue

        # Detectar inicio de sección de Cash Transactions
        if 'CurrencyPrimary' in line and 'Description' in line and 'Type' in line:
            cash_headers = line.split(',')
            in_cash_section = True
            in_trades_section = False
            continue

        # Agregar datos a la sección correspondiente
        if in_trades_section and line.strip():
            # Parar si encontramos otra sección
            if 'CurrencyPrimary' in line:
                in_trades_section = False
                continue
            trades_data.append(line)

        if in_cash_section and line.strip():
            cash_data.append(line)

    # Crear DataFrame de Trades
    trades_df = pd.DataFrame()
    if trades_headers and trades_data:
        csv_text = '\n'.join([','.join(trades_headers)] + trades_data)
        trades_df = pd.read_csv(StringIO(csv_text))
        # Filtrar conversiones de moneda (USD.CAD, USD.MXN, etc.)
        trades_df = trades_df[~trades_df['Symbol'].str.contains(r'\.', na=False)]
        # Filtrar filas donde AssetClass sea STK (stocks reales)
        if 'AssetClass' in trades_df.columns:
            trades_df = trades_df[trades_df['AssetClass'] == 'STK']

    # Crear DataFrame de Cash Transactions
    cash_df = pd.DataFrame()
    if cash_headers and cash_data:
        csv_text = '\n'.join([','.join(cash_headers)] + cash_data)
        cash_df = pd.read_csv(StringIO(csv_text))

    return trades_df, cash_df


def convert_to_unified_format(trades_df: pd.DataFrame, cash_df: pd.DataFrame) -> tuple:
    """
    Convertir trades de IBKR al formato unificado del portfolio
    Retorna: (trades_unified_df, deposits_df)
    """
    unified_rows = []

    # Procesar Trades
    if not trades_df.empty:
        for _, row in trades_df.iterrows():
            try:
                quantity = float(row.get('Quantity', 0))
                action = 'BUY' if quantity > 0 else 'SELL'

                # Parsear fecha en formato DD/MM/YYYY;HHMMSS
                date_str = str(row.get('DateTime', ''))
                if ';' in date_str:
                    date_part = date_str.split(';')[0]
                    fecha = pd.to_datetime(date_part, format='%d/%m/%Y').strftime('%Y-%m-%d')
                else:
                    fecha = pd.to_datetime(date_str).strftime('%Y-%m-%d')

                unified_row = {
                    'Fecha': fecha,
                    'Broker': 'IBKR',
                    'Acción': action,
                    'Tipo': 'Stock' if row.get('AssetClass') == 'STK' else row.get('AssetClass', 'Stock'),
                    'Ticker': row.get('Symbol', ''),
                    'ISIN': row.get('ISIN', ''),
                    'Cantidad': abs(quantity),
                    'Precio_orig': abs(float(row.get('TradePrice', 0))),
                    'Moneda_orig': row.get('CurrencyPrimary', 'USD'),
                    'Coste_orig': abs(float(row.get('Proceeds', 0))),
                    'Coste_EUR': 0,  # Se calculará después
                    'TC_EUR': 1.0,
                    'Comisión': abs(float(row.get('IBCommission', 0))),
                    'Valor_EUR': 0,
                    'Nombre': row.get('Symbol', '')
                }
                unified_rows.append(unified_row)
            except Exception as e:
                print(f"⚠️ Error procesando trade: {e}")
                continue

    trades_unified_df = pd.DataFrame(unified_rows)

    # Procesar Cash Transactions (depósitos)
    deposits = []
    if not cash_df.empty:
        for _, row in cash_df.iterrows():
            try:
                if row.get('Type') == 'Deposits/Withdrawals':
                    date_str = str(row.get('Date/Time', ''))
                    if '/' in date_str:
                        fecha = pd.to_datetime(date_str, format='%d/%m/%Y').strftime('%Y-%m-%d')
                    else:
                        fecha = date_str

                    deposits.append({
                        'Fecha': fecha,
                        'Moneda': row.get('CurrencyPrimary', ''),
                        'Cantidad': float(row.get('Amount', 0)),
                        'Tipo': 'Deposit' if float(row.get('Amount', 0)) > 0 else 'Withdrawal',
                        'Descripción': row.get('Description', '')
                    })
            except Exception as e:
                print(f"⚠️ Error procesando cash transaction: {e}")
                continue

    deposits_df = pd.DataFrame(deposits)

    return trades_unified_df, deposits_df


# Divisa base de la cuenta IBKR (U23227441). El Cash Report devuelve el saldo
# consolidado en esta divisa bajo la fila CurrencyPrimary=BASE_SUMMARY.
# Verificado por reconciliación de depósitos (los ~29.4k del informe cuadran con
# nuestros ~26.8k EUR ≈ 28.9k USD, no con EUR). Si algún día cambias la divisa
# base en IBKR, actualiza esta constante.
BASE_CURRENCY = "USD"


def parse_cash_report(csv_content: str):
    """
    Extrae el saldo de efectivo del Cash Report (Informe de efectivo).
    IBKR lo devuelve como una fila resumen en divisa base
    (CurrencyPrimary=BASE_SUMMARY) con la columna EndingCash.
    Devuelve {'as_of', 'currency', 'ending_cash'} o None si no se encuentra.
    """
    import csv as _csv
    lines = csv_content.strip().split('\n')
    header = None
    data_start = 0
    for i, line in enumerate(lines):
        if 'EndingCash' in line and 'StartingCash' in line and 'CurrencyPrimary' in line:
            header = next(_csv.reader([line]))
            data_start = i + 1
            break
    if header is None:
        return None

    ncol = len(header)
    for line in lines[data_start:]:
        if not line.strip():
            break
        row = next(_csv.reader([line]))
        if len(row) != ncol:
            break  # empieza otra sección
        d = dict(zip(header, row))
        if d.get('CurrencyPrimary') == 'BASE_SUMMARY':
            try:
                return {
                    'as_of': d.get('ToDate', ''),
                    'currency': BASE_CURRENCY,
                    'ending_cash': float(d.get('EndingCash', 0)),
                }
            except ValueError:
                return None
    return None


def sync_ibkr_transactions(output_path: str = 'inversiones_unificadas.csv'):
    """
    Función principal: sincronizar transacciones de IBKR
    """
    print("=" * 50)
    print("🏦 IBKR Flex Query Sync")
    print("=" * 50)

    # Verificar credenciales
    if not check_credentials():
        return None, None

    try:
        # Paso 1: Solicitar statement
        ref_code = request_flex_statement(IBKR_TOKEN, IBKR_QUERY_ID)

        # Paso 2: Descargar statement
        time.sleep(2)  # Dar tiempo a IBKR para preparar el reporte
        statement = download_flex_statement(IBKR_TOKEN, ref_code)

        # Guardar respuesta raw para debug
        with open('ibkr_raw_response.txt', 'w') as f:
            f.write(statement)
        print(f"💾 Respuesta raw guardada en ibkr_raw_response.txt")

        # Paso 2b: Saldo de efectivo (Cash Report) en divisa base
        cash_bal = parse_cash_report(statement)
        if cash_bal:
            import csv as _csv
            with open('ibkr_cash_balance.csv', 'w', newline='') as f:
                w = _csv.writer(f)
                w.writerow(['as_of', 'currency', 'ending_cash'])
                w.writerow([cash_bal['as_of'], cash_bal['currency'], cash_bal['ending_cash']])
            print(f"💰 Saldo de efectivo: {cash_bal['ending_cash']:,.2f} {cash_bal['currency']} "
                  f"(guardado en ibkr_cash_balance.csv)")

        # Paso 3: Parsear trades y cash transactions
        trades_df, cash_df = parse_trades_csv(statement)
        print(f"\n📊 Trades encontrados: {len(trades_df)}")
        print(f"💰 Cash transactions encontradas: {len(cash_df)}")

        if not trades_df.empty:
            print("\n--- TRADES ---")
            print(trades_df.to_string())

        if not cash_df.empty:
            print("\n--- CASH TRANSACTIONS ---")
            print(cash_df.to_string())

        # Paso 4: Convertir a formato unificado
        unified_df, deposits_df = convert_to_unified_format(trades_df, cash_df)

        if not unified_df.empty:
            print(f"\n📋 Transacciones en formato unificado:")
            print(unified_df.to_string())
            unified_df.to_csv('ibkr_transactions.csv', index=False)
            print(f"\n💾 Trades guardados en ibkr_transactions.csv")

        if not deposits_df.empty:
            print(f"\n💵 Depósitos/Retiros:")
            print(deposits_df.to_string())
            deposits_df.to_csv('ibkr_deposits.csv', index=False)
            print(f"💾 Depósitos guardados en ibkr_deposits.csv")

        return unified_df, deposits_df

    except Exception as e:
        print(f"❌ Error: {e}")
        raise


if __name__ == '__main__':
    import sys
    try:
        sync_ibkr_transactions()
    except Exception as e:
        msg = str(e)
        # Token/auth errors (1015) are PERSISTENT: they need a human to refresh the
        # IBKR Flex token. Exit non-zero so CI's alert step fires an email.
        if "1015" in msg or "Token is invalid" in msg:
            print("❌ Token de IBKR inválido o caducado — hay que refrescarlo (Flex Web Service).")
            sys.exit(1)
        # Transient errors (1001 = servidor ocupado, 1025 = lockout temporal, red):
        # el pipeline sigue con el último ibkr_transactions.csv comiteado y la próxima
        # ejecución programada reintenta. No es accionable → no disparamos alerta.
        print(f"⚠️  Fallo transitorio de IBKR ({msg}). Se usará el último CSV conocido; "
              f"se reintentará en la próxima ejecución programada.")
        sys.exit(0)
