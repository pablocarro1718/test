"""
Script para normalizar datos de inversiones de múltiples brokers.
Convierte CSVs de Degiro, Trading212 y Kraken a un formato unificado.

Para ejecutar: python normalizar_inversiones.py
"""

import csv
from datetime import datetime
from pathlib import Path

# Directorio de trabajo
DIR = Path(__file__).parent

# Precios de OPAs (ventas forzadas)
OPAS = {
    "US90184L1026": {"precio": 54.20, "moneda": "USD", "nombre": "Twitter"},  # Twitter - Elon Musk
    "ES0184696104": {"precio": 22.50, "moneda": "EUR", "nombre": "Masmovil"},  # Masmovil
}

# Mapeo de códigos Trading212 a tickers limpios
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

# Resultado unificado
todas_operaciones = []


def parse_numero_es(texto):
    """Convierte número en formato español (1.234,56) a float."""
    if not texto or texto.strip() == "":
        return 0.0
    texto = texto.replace(".", "").replace(",", ".")
    return float(texto)


def parse_fecha_degiro(fecha_str):
    """Convierte DD-MM-YYYY a YYYY-MM-DD."""
    try:
        dt = datetime.strptime(fecha_str, "%d-%m-%Y")
        return dt.strftime("%Y-%m-%d")
    except:
        return fecha_str


def clasificar_activo_degiro(producto, isin):
    """Determina si es Stock, ETF o Crypto basado en el nombre/ISIN."""
    producto_lower = producto.lower()
    if "ishares" in producto_lower or "etf" in producto_lower:
        return "ETF"
    return "Stock"


def procesar_degiro():
    """Procesa el archivo de transacciones de Degiro."""
    archivo = DIR / "degiro_transactions.csv"

    with open(archivo, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            # Extraer campos básicos
            fecha = parse_fecha_degiro(row["Fecha"])
            producto = row["Producto"]
            isin = row["ISIN"]
            cantidad = parse_numero_es(row["Número"])
            precio = parse_numero_es(row["Precio"])
            total_eur = parse_numero_es(row["Total EUR"])

            # Detectar moneda original
            # Buscar la columna de valor local (después de Precio)
            valor_local = parse_numero_es(row.get("Valor local", "0"))

            # Determinar moneda - si hay tipo de cambio, es USD
            tipo_cambio_str = row.get("Tipo de cambio", "")
            if tipo_cambio_str and tipo_cambio_str.strip():
                tipo_cambio = parse_numero_es(tipo_cambio_str)
                moneda = "USD"
            else:
                tipo_cambio = 1.0
                moneda = "EUR"

            # Ignorar operaciones con cantidad y precio 0 (derechos, splits, etc.)
            # EXCEPTO las OPAs que tienen precio 0 pero debemos registrar
            if cantidad == 0 and precio == 0:
                continue

            # Ignorar operaciones con importe 0 (derechos de suscripción sin valor)
            # EXCEPTO las OPAs que procesamos aparte
            if precio == 0 and isin not in OPAS:
                continue

            # Determinar tipo de operación
            if cantidad < 0:
                tipo_op = "SELL"
                cantidad = abs(cantidad)
            else:
                tipo_op = "BUY"

            # Caso especial: OPAs (Twitter, Masmovil)
            # Se detectan porque aparecen con precio 0 pero cantidad != 0
            if precio == 0 and isin in OPAS and tipo_op == "SELL":
                opa_info = OPAS[isin]
                precio = opa_info["precio"]
                moneda = opa_info["moneda"]
                importe_bruto = precio * cantidad
                # Calcular EUR si es USD
                if moneda == "USD":
                    # Usar tipo de cambio aproximado de la época
                    if "Twitter" in opa_info["nombre"]:
                        tipo_cambio = 0.9722  # Oct 2022
                    importe_eur = importe_bruto / tipo_cambio
                else:
                    importe_eur = importe_bruto
                notas = f"OPA {opa_info['nombre']}"
            else:
                importe_bruto = abs(valor_local) if valor_local else precio * cantidad
                importe_eur = abs(total_eur)
                notas = ""

            # Comisiones
            comision_autofx = abs(parse_numero_es(row.get("Comisión AutoFX", "0")))
            costes_ext = abs(parse_numero_es(row.get("Costes de transacción y/o externos EUR", "0")))
            comisiones = comision_autofx + costes_ext

            # Crear ticker limpio desde el producto
            ticker = producto.split(" ")[0].upper()
            if "APPLE" in producto.upper():
                ticker = "AAPL"
            elif "META" in producto.upper():
                ticker = "META"
            elif "UBER" in producto.upper():
                ticker = "UBER"
            elif "PINTEREST" in producto.upper():
                ticker = "PINS"
            elif "BEYOND" in producto.upper():
                ticker = "BYND"
            elif "WALT DISNEY" in producto.upper():
                ticker = "DIS"
            elif "TWITTER" in producto.upper():
                ticker = "TWTR"
            elif "CELLNEX" in producto.upper():
                ticker = "CLNX"
            elif "INT.AIRL" in producto.upper() or "INTL CONSOLIDATED" in producto.upper():
                ticker = "IAG"
            elif "AIRBUS" in producto.upper():
                ticker = "AIR"
            elif "MASMOVIL" in producto.upper():
                ticker = "MAS"
            elif "ISHARES" in producto.upper() and "S&P 500" in producto.upper():
                ticker = "CSPX"

            tipo_activo = clasificar_activo_degiro(producto, isin)

            # Calcular importe neto
            if tipo_op == "BUY":
                importe_neto = -abs(importe_eur)  # Compra = sale dinero
            else:
                importe_neto = abs(importe_eur) - comisiones  # Venta = entra dinero menos comisiones

            todas_operaciones.append({
                "fecha": fecha,
                "broker": "Degiro",
                "tipo_operacion": tipo_op,
                "tipo_activo": tipo_activo,
                "ticker": ticker,
                "isin": isin,
                "cantidad": round(cantidad, 6),
                "precio_unitario": round(precio, 4),
                "moneda_original": moneda,
                "importe_bruto": round(importe_bruto, 2),
                "importe_eur": round(abs(importe_eur), 2),
                "tipo_cambio": round(tipo_cambio, 4) if tipo_cambio != 1.0 else "",
                "comisiones_eur": round(comisiones, 2),
                "importe_neto_eur": round(importe_neto, 2),
                "notas": notas,
            })


def procesar_kraken():
    """Procesa el archivo de trades de Kraken."""
    archivo = DIR / "kraken_trades_completo.csv"

    with open(archivo, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            fecha = row["datetime"]
            asset = row["asset"].upper()
            side = row["side"].upper()
            cantidad = float(row["amount_crypto"])
            importe_eur = float(row["amount_eur"])
            precio_eur = float(row["price_eur"])

            # Todas las operaciones de Kraken son en EUR
            if side == "BUY":
                importe_neto = -importe_eur  # Sale dinero
            else:
                importe_neto = importe_eur  # Entra dinero

            todas_operaciones.append({
                "fecha": fecha,
                "broker": "Kraken",
                "tipo_operacion": side,
                "tipo_activo": "Crypto",
                "ticker": asset,
                "isin": "",
                "cantidad": round(cantidad, 8),
                "precio_unitario": round(precio_eur, 2),
                "moneda_original": "EUR",
                "importe_bruto": round(importe_eur, 2),
                "importe_eur": round(importe_eur, 2),
                "tipo_cambio": "",
                "comisiones_eur": 0,
                "importe_neto_eur": round(importe_neto, 2),
                "notas": row.get("nota", ""),
            })


def procesar_trading212_results():
    """Procesa el archivo de resultados (operaciones cerradas) de Trading212."""
    archivo = DIR / "trading212_results.csv"

    with open(archivo, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            code = row["code"]
            ticker = TRADING212_TICKERS.get(code, code.replace("_US_EQ", ""))
            cantidad = float(row["quantity"])

            # Precio de compra (en USD y convertido a EUR)
            precio_compra_usd = float(row["price"])
            precio_compra_eur = float(row["priceConverted"])

            # Precio de venta
            precio_venta_usd = float(row["closePrice"])
            precio_venta_eur = float(row["closePriceConverted"])

            # Fecha de venta (la única que tenemos)
            fecha_venta = row["time"].split("T")[0]

            # Calcular tipo de cambio implícito
            tc_compra = precio_compra_usd / precio_compra_eur if precio_compra_eur else 1
            tc_venta = precio_venta_usd / precio_venta_eur if precio_venta_eur else 1

            # Importes
            importe_compra_eur = cantidad * precio_compra_eur
            importe_venta_eur = cantidad * precio_venta_eur

            # Registrar COMPRA (fecha desconocida por ahora)
            todas_operaciones.append({
                "fecha": "PENDIENTE",  # Se actualizará cuando tengamos las fechas
                "broker": "Trading212",
                "tipo_operacion": "BUY",
                "tipo_activo": "Stock",
                "ticker": ticker,
                "isin": "",
                "cantidad": round(cantidad, 6),
                "precio_unitario": round(precio_compra_usd, 4),
                "moneda_original": "USD",
                "importe_bruto": round(cantidad * precio_compra_usd, 2),
                "importe_eur": round(importe_compra_eur, 2),
                "tipo_cambio": round(tc_compra, 4),
                "comisiones_eur": 0,
                "importe_neto_eur": round(-importe_compra_eur, 2),
                "notas": "Fecha de compra pendiente de confirmar",
            })

            # Registrar VENTA
            todas_operaciones.append({
                "fecha": fecha_venta,
                "broker": "Trading212",
                "tipo_operacion": "SELL",
                "tipo_activo": "Stock",
                "ticker": ticker,
                "isin": "",
                "cantidad": round(cantidad, 6),
                "precio_unitario": round(precio_venta_usd, 4),
                "moneda_original": "USD",
                "importe_bruto": round(cantidad * precio_venta_usd, 2),
                "importe_eur": round(importe_venta_eur, 2),
                "tipo_cambio": round(tc_venta, 4),
                "comisiones_eur": 0,
                "importe_neto_eur": round(importe_venta_eur, 2),
                "notas": "",
            })


def procesar_trading212_dividends():
    """Procesa el archivo de dividendos de Trading212."""
    archivo = DIR / "trading212_dividend.csv"

    with open(archivo, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            code = row["code"]
            ticker = TRADING212_TICKERS.get(code, code.replace("_US_EQ", ""))
            cantidad_acciones = float(row["quantity"])
            dividendo = float(row["dividend"])
            fecha = row["timePaid"].split("T")[0]

            todas_operaciones.append({
                "fecha": fecha,
                "broker": "Trading212",
                "tipo_operacion": "DIVIDEND",
                "tipo_activo": "Stock",
                "ticker": ticker,
                "isin": "",
                "cantidad": round(cantidad_acciones, 6),
                "precio_unitario": 0,
                "moneda_original": "USD",
                "importe_bruto": round(dividendo, 2),
                "importe_eur": round(dividendo, 2),  # Aproximado, T212 ya lo da neto
                "tipo_cambio": "",
                "comisiones_eur": 0,
                "importe_neto_eur": round(dividendo, 2),
                "notas": "Dividendo",
            })


def procesar_ibkr():
    """Procesa el archivo de transacciones de IBKR (generado por ibkr_sync.py)."""
    archivo = DIR / "ibkr_transactions.csv"

    if not archivo.exists():
        print("    (archivo ibkr_transactions.csv no encontrado, omitiendo)")
        return

    with open(archivo, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            try:
                fecha = row["Fecha"]
                ticker = row["Ticker"]
                accion = row.get("Acción", row.get("Accion", "BUY"))
                tipo_activo = row.get("Tipo", "Stock")
                cantidad = float(row.get("Cantidad", 0))
                precio = float(row.get("Precio_orig", 0))
                moneda = row.get("Moneda_orig", "USD")
                importe_bruto = float(row.get("Coste_orig", 0))
                importe_eur = float(row.get("Coste_EUR", 0)) or importe_bruto
                tc = row.get("TC_EUR", "")
                comision = float(row.get("Comisión", row.get("Comision", 0)))
                isin = row.get("ISIN", "")

                # Calcular importe neto
                if accion == "BUY":
                    importe_neto = -abs(importe_eur) - comision
                else:
                    importe_neto = abs(importe_eur) - comision

                todas_operaciones.append({
                    "fecha": fecha,
                    "broker": "IBKR",
                    "tipo_operacion": accion,
                    "tipo_activo": tipo_activo,
                    "ticker": ticker,
                    "isin": isin,
                    "cantidad": round(cantidad, 8),
                    "precio_unitario": round(precio, 4),
                    "moneda_original": moneda,
                    "importe_bruto": round(importe_bruto, 2),
                    "importe_eur": round(abs(importe_eur), 2),
                    "tipo_cambio": tc if tc else "",
                    "comisiones_eur": round(comision, 2),
                    "importe_neto_eur": round(importe_neto, 2),
                    "notas": "",
                })
            except Exception as e:
                print(f"    ⚠️ Error procesando fila IBKR: {e}")
                continue


def procesar_fintual():
    """Procesa el archivo de transacciones de Fintual (compras y dividendos)."""
    archivo = DIR / "fintual_transactions_USD.csv"

    if not archivo.exists():
        print("    (archivo fintual_transactions_USD.csv no encontrado, omitiendo)")
        return

    with open(archivo, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            ticker = row["Ticker Symbol"].strip()
            tipo_op = row["Type"].strip().upper()
            fecha = row["Created At"].strip()

            # Parsear importe: "1241.65 USD" → 1241.65
            importe_str = row["Requested Amount"].replace("USD", "").strip()
            importe_usd = float(importe_str)

            # Clasificar tipo de activo
            if ticker in ("SPY", "IEV", "ARGT"):
                tipo_activo = "ETF"
            else:
                tipo_activo = "Stock"

            if tipo_op == "BUY":
                cantidad = float(row["Filled Shares"])
                precio = importe_usd / cantidad if cantidad else 0

                todas_operaciones.append({
                    "fecha": fecha,
                    "broker": "Fintual",
                    "tipo_operacion": "BUY",
                    "tipo_activo": tipo_activo,
                    "ticker": ticker,
                    "isin": "",
                    "cantidad": round(cantidad, 8),
                    "precio_unitario": round(precio, 4),
                    "moneda_original": "USD",
                    "importe_bruto": round(importe_usd, 2),
                    "importe_eur": round(importe_usd, 2),
                    "tipo_cambio": "",
                    "comisiones_eur": 0,
                    "importe_neto_eur": round(-importe_usd, 2),
                    "notas": "",
                })

            elif tipo_op == "DIVIDEND":
                todas_operaciones.append({
                    "fecha": fecha,
                    "broker": "Fintual",
                    "tipo_operacion": "DIVIDEND",
                    "tipo_activo": tipo_activo,
                    "ticker": ticker,
                    "isin": "",
                    "cantidad": 0,
                    "precio_unitario": 0,
                    "moneda_original": "USD",
                    "importe_bruto": round(importe_usd, 2),
                    "importe_eur": round(importe_usd, 2),
                    "tipo_cambio": "",
                    "comisiones_eur": 0,
                    "importe_neto_eur": round(importe_usd, 2),
                    "notas": "Dividendo",
                })


def guardar_csv_unificado():
    """Guarda todas las operaciones en un CSV unificado."""
    # Ordenar por fecha (las "PENDIENTE" irán al final)
    operaciones_ordenadas = sorted(
        todas_operaciones,
        key=lambda x: (x["fecha"] == "PENDIENTE", x["fecha"])
    )

    archivo_salida = DIR / "inversiones_unificadas.csv"

    campos = [
        "fecha", "broker", "tipo_operacion", "tipo_activo", "ticker", "isin",
        "cantidad", "precio_unitario", "moneda_original", "importe_bruto",
        "importe_eur", "tipo_cambio", "comisiones_eur", "importe_neto_eur", "notas"
    ]

    with open(archivo_salida, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=campos)
        writer.writeheader()
        writer.writerows(operaciones_ordenadas)

    print(f"✓ Archivo generado: {archivo_salida}")
    print(f"  Total de operaciones: {len(operaciones_ordenadas)}")

    # Resumen por broker
    por_broker = {}
    for op in operaciones_ordenadas:
        broker = op["broker"]
        por_broker[broker] = por_broker.get(broker, 0) + 1

    print("\n  Desglose por broker:")
    for broker, count in por_broker.items():
        print(f"    - {broker}: {count} operaciones")

    # Operaciones pendientes de fecha
    pendientes = [op for op in operaciones_ordenadas if op["fecha"] == "PENDIENTE"]
    if pendientes:
        print(f"\n  ⚠ {len(pendientes)} operaciones con fecha PENDIENTE (Trading212 compras)")


def main():
    print("=" * 60)
    print("NORMALIZADOR DE INVERSIONES")
    print("=" * 60)

    print("\n[1/6] Procesando Degiro...")
    procesar_degiro()

    print("[2/6] Procesando Kraken...")
    procesar_kraken()

    print("[3/6] Procesando Trading212 (operaciones)...")
    procesar_trading212_results()

    print("[4/6] Procesando Trading212 (dividendos)...")
    procesar_trading212_dividends()

    print("[5/6] Procesando IBKR...")
    procesar_ibkr()

    print("[6/6] Procesando Fintual...")
    procesar_fintual()

    print("\nGenerando archivo unificado...")
    guardar_csv_unificado()

    print("\n" + "=" * 60)
    print("PROCESO COMPLETADO")
    print("=" * 60)


if __name__ == "__main__":
    main()
