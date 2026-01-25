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

# Configuración - En producción usar variables de entorno o secrets
IBKR_TOKEN = os.environ.get('IBKR_TOKEN', '217289636331680501112352')
IBKR_QUERY_ID = os.environ.get('IBKR_QUERY_ID', '1384190')

# URLs de IBKR Flex Query
FLEX_REQUEST_URL = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest"
FLEX_DOWNLOAD_URL = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement"


def request_flex_statement(token: str, query_id: str) -> str:
    """
    Paso 1: Solicitar el Flex Statement y obtener el Reference Code
    """
    params = {
        't': token,
        'q': query_id,
        'v': '3'
    }

    print(f"📡 Solicitando Flex Query {query_id}...")
    response = requests.get(FLEX_REQUEST_URL, params=params)

    if response.status_code != 200:
        raise Exception(f"Error HTTP {response.status_code}: {response.text}")

    # Parsear respuesta XML
    root = ET.fromstring(response.text)

    # Verificar si hay error
    status = root.find('.//Status')
    if status is not None and status.text != 'Success':
        error_code = root.find('.//ErrorCode')
        error_msg = root.find('.//ErrorMessage')
        raise Exception(f"Error IBKR [{error_code.text if error_code is not None else 'N/A'}]: {error_msg.text if error_msg is not None else 'Unknown'}")

    # Obtener Reference Code
    ref_code = root.find('.//ReferenceCode')
    if ref_code is None:
        raise Exception(f"No se encontró ReferenceCode en la respuesta: {response.text}")

    print(f"✅ Reference Code obtenido: {ref_code.text}")
    return ref_code.text


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


def parse_trades_csv(csv_content: str) -> pd.DataFrame:
    """
    Parsear las operaciones (trades) del CSV de IBKR
    """
    from io import StringIO

    # El CSV de IBKR puede tener múltiples secciones
    lines = csv_content.strip().split('\n')

    # Encontrar la sección de Trades
    trades_data = []
    in_trades_section = False
    headers = None

    for line in lines:
        if 'Symbol' in line and 'Quantity' in line and 'TradePrice' in line:
            headers = line.split(',')
            in_trades_section = True
            continue

        if in_trades_section and line.strip():
            if line.startswith('Cash') or line.startswith('Total'):
                in_trades_section = False
                continue
            trades_data.append(line)

    if not headers or not trades_data:
        print("⚠️ No se encontraron trades en el reporte")
        return pd.DataFrame()

    # Crear DataFrame
    csv_text = '\n'.join([','.join(headers)] + trades_data)
    df = pd.read_csv(StringIO(csv_text))

    return df


def convert_to_unified_format(ibkr_df: pd.DataFrame) -> pd.DataFrame:
    """
    Convertir trades de IBKR al formato unificado del portfolio
    """
    if ibkr_df.empty:
        return pd.DataFrame()

    unified_rows = []

    for _, row in ibkr_df.iterrows():
        # Determinar tipo de operación
        quantity = float(row.get('Quantity', 0))
        action = 'BUY' if quantity > 0 else 'SELL'

        # Mapear campos
        unified_row = {
            'Fecha': pd.to_datetime(row.get('DateTime', row.get('TradeDate', ''))).strftime('%Y-%m-%d'),
            'Broker': 'IBKR',
            'Acción': action,
            'Tipo': row.get('AssetCategory', 'Stock'),
            'Ticker': row.get('Symbol', ''),
            'ISIN': row.get('ISIN', ''),
            'Cantidad': abs(quantity),
            'Precio_orig': abs(float(row.get('TradePrice', 0))),
            'Moneda_orig': row.get('Currency', 'USD'),
            'Coste_orig': abs(float(row.get('Proceeds', 0))) if 'Proceeds' in row else abs(quantity * float(row.get('TradePrice', 0))),
            'Coste_EUR': 0,  # Se calculará después con tipo de cambio
            'TC_EUR': 1.0,   # Tipo de cambio - actualizar manualmente o con API
            'Comisión': abs(float(row.get('IBCommission', row.get('Commission', 0)))),
            'Valor_EUR': 0,  # Para ventas
            'Nombre': row.get('Description', row.get('Symbol', ''))
        }

        unified_rows.append(unified_row)

    return pd.DataFrame(unified_rows)


def sync_ibkr_transactions(output_path: str = 'inversiones_unificadas.csv'):
    """
    Función principal: sincronizar transacciones de IBKR
    """
    print("=" * 50)
    print("🏦 IBKR Flex Query Sync")
    print("=" * 50)

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

        # Paso 3: Parsear trades
        trades_df = parse_trades_csv(statement)
        print(f"📊 Trades encontrados: {len(trades_df)}")

        if not trades_df.empty:
            print(trades_df.to_string())

        # Paso 4: Convertir a formato unificado
        unified_df = convert_to_unified_format(trades_df)

        if not unified_df.empty:
            print(f"\n📋 Transacciones en formato unificado:")
            print(unified_df.to_string())

            # Guardar
            unified_df.to_csv('ibkr_transactions.csv', index=False)
            print(f"\n💾 Guardado en ibkr_transactions.csv")

        return unified_df

    except Exception as e:
        print(f"❌ Error: {e}")
        raise


if __name__ == '__main__':
    sync_ibkr_transactions()
