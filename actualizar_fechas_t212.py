"""
Script para actualizar el CSV con las fechas reales de Trading212.
Reemplaza las entradas PENDIENTE con los datos correctos de los correos del broker.
"""

import csv
from pathlib import Path
from datetime import datetime

DIR = Path(__file__).parent

# Compras reales de Trading212 (datos de los correos del broker)
COMPRAS_T212 = [
    # SQ (2 compras)
    {"fecha": "2022-03-09", "ticker": "SQ", "isin": "US8522341036", "cantidad": 0.6170955, "precio": 101.135, "importe": 62.41, "moneda": "EUR", "comision": 0.09},
    {"fecha": "2022-04-07", "ticker": "SQ", "isin": "US8522341036", "cantidad": 0.5529805, "precio": 112.8609, "importe": 62.41, "moneda": "EUR", "comision": 0.09},

    # BABA (3 compras)
    {"fecha": "2022-01-24", "ticker": "BABA", "isin": "US01609W1027", "cantidad": 1.454166, "precio": 102.9937, "importe": 149.77, "moneda": "EUR", "comision": 0.22},
    {"fecha": "2022-04-29", "ticker": "BABA", "isin": "US01609W1027", "cantidad": 0.5261781, "precio": 94.8727, "importe": 49.92, "moneda": "EUR", "comision": 0.07},
    {"fecha": "2022-06-21", "ticker": "BABA", "isin": "US01609W1027", "cantidad": 1.992254, "precio": 100.2381, "importe": 199.70, "moneda": "EUR", "comision": 0.30},

    # NU (1 compra - puede que falten más)
    {"fecha": "2024-08-12", "ticker": "NU", "isin": "KYG6683N1034", "cantidad": 53.818329, "precio": 12.57, "importe": 676.50, "moneda": "USD", "comision": 0},

    # SHOP (2 compras PRE-SPLIT - hubo split 10:1 en junio 2022)
    # Ajustamos cantidad x10 y precio /10 para que cuadre con ventas post-split
    {"fecha": "2022-01-24", "ticker": "SHOP", "isin": "CA82509L1076", "cantidad": 2.119315, "precio": 70.67374, "importe": 149.78, "moneda": "EUR", "comision": 0.22, "notas": "Pre-split (ajustado x10)"},
    {"fecha": "2022-02-25", "ticker": "SHOP", "isin": "CA82509L1076", "cantidad": 3.305386, "precio": 60.41954, "importe": 199.71, "moneda": "EUR", "comision": 0.30, "notas": "Pre-split (ajustado x10)"},

    # BA (1 compra)
    {"fecha": "2024-01-17", "ticker": "BA", "isin": "US0970231058", "cantidad": 3.298344, "precio": 202.48, "importe": 667.85, "moneda": "USD", "comision": 0},

    # MELI (3 compras)
    {"fecha": "2022-03-09", "ticker": "MELI", "isin": "US58733R1023", "cantidad": 0.0696789, "precio": 895.6773, "importe": 62.41, "moneda": "EUR", "comision": 0.09},
    {"fecha": "2022-04-07", "ticker": "MELI", "isin": "US58733R1023", "cantidad": 0.05825315, "precio": 1071.357, "importe": 62.41, "moneda": "EUR", "comision": 0.09},
    {"fecha": "2022-06-10", "ticker": "MELI", "isin": "US58733R1023", "cantidad": 0.151542, "precio": 658.9589, "importe": 99.86, "moneda": "EUR", "comision": 0.15},

    # META (2 compras)
    {"fecha": "2022-03-09", "ticker": "META", "isin": "US30303M1027", "cantidad": 0.3473973, "precio": 179.6501, "importe": 62.41, "moneda": "EUR", "comision": 0.09},
    {"fecha": "2022-04-07", "ticker": "META", "isin": "US30303M1027", "cantidad": 0.3082766, "precio": 202.4477, "importe": 62.41, "moneda": "EUR", "comision": 0.09},

    # TCEHY (3 compras)
    {"fecha": "2022-03-09", "ticker": "TCEHY", "isin": "US88032Q1094", "cantidad": 1.368878, "precio": 45.592, "importe": 62.41, "moneda": "EUR", "comision": 0.09},
    {"fecha": "2022-04-07", "ticker": "TCEHY", "isin": "US88032Q1094", "cantidad": 1.450717, "precio": 43.02, "importe": 62.41, "moneda": "EUR", "comision": 0.09},
    {"fecha": "2022-04-29", "ticker": "TCEHY", "isin": "US88032Q1094", "cantidad": 1.114632, "precio": 44.7949, "importe": 49.93, "moneda": "EUR", "comision": 0.07},

    # PLTR (1 compra)
    {"fecha": "2024-01-16", "ticker": "PLTR", "isin": "US69608A1088", "cantidad": 32.751651, "precio": 16.59, "importe": 543.35, "moneda": "USD", "comision": 0},
]


def main():
    print("=" * 60)
    print("ACTUALIZANDO CSV CON FECHAS DE TRADING212")
    print("=" * 60)

    # Leer CSV actual
    csv_path = DIR / "inversiones_unificadas.csv"

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        filas = list(reader)
        campos = reader.fieldnames

    # Filtrar filas que NO son PENDIENTE
    filas_validas = [f for f in filas if f['fecha'] != 'PENDIENTE']
    print(f"\nFilas con fecha válida: {len(filas_validas)}")
    print(f"Filas PENDIENTE eliminadas: {len(filas) - len(filas_validas)}")

    # Añadir las compras reales de Trading212
    for compra in COMPRAS_T212:
        nueva_fila = {
            'fecha': compra['fecha'],
            'broker': 'Trading212',
            'tipo_operacion': 'BUY',
            'tipo_activo': 'Stock',
            'ticker': compra['ticker'],
            'isin': compra['isin'],
            'cantidad': round(compra['cantidad'], 6),
            'precio_unitario': round(compra['precio'], 4),
            'moneda_original': compra['moneda'],
            'importe_bruto': round(compra['importe'], 2),
            'importe_eur': round(compra['importe'], 2),  # Ya está en EUR (o USD~EUR para simplificar)
            'tipo_cambio': '',
            'comisiones_eur': round(compra['comision'], 2),
            'importe_neto_eur': round(-(compra['importe'] + compra['comision']), 2),
            'notas': compra.get('notas', ''),
        }
        filas_validas.append(nueva_fila)

    print(f"Compras T212 añadidas: {len(COMPRAS_T212)}")

    # Ordenar por fecha
    def fecha_sort_key(fila):
        try:
            return datetime.strptime(fila['fecha'], '%Y-%m-%d')
        except:
            return datetime.max

    filas_ordenadas = sorted(filas_validas, key=fecha_sort_key)

    # Guardar CSV actualizado
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=campos)
        writer.writeheader()
        writer.writerows(filas_ordenadas)

    print(f"\n✓ CSV actualizado: {csv_path}")
    print(f"  Total de operaciones: {len(filas_ordenadas)}")

    # Verificar totales por ticker de T212
    print("\n" + "=" * 60)
    print("VERIFICACIÓN DE CANTIDADES (Trading212)")
    print("=" * 60)

    t212_compras = {}
    t212_ventas = {}

    for fila in filas_ordenadas:
        if fila['broker'] == 'Trading212':
            ticker = fila['ticker']
            cantidad = float(fila['cantidad'])
            if fila['tipo_operacion'] == 'BUY':
                t212_compras[ticker] = t212_compras.get(ticker, 0) + cantidad
            elif fila['tipo_operacion'] == 'SELL':
                t212_ventas[ticker] = t212_ventas.get(ticker, 0) + cantidad

    print(f"\n{'Ticker':<10} {'Comprado':<15} {'Vendido':<15} {'Diferencia':<15}")
    print("-" * 55)

    todos_tickers = set(t212_compras.keys()) | set(t212_ventas.keys())
    for ticker in sorted(todos_tickers):
        comprado = t212_compras.get(ticker, 0)
        vendido = t212_ventas.get(ticker, 0)
        diff = comprado - vendido
        status = "✓" if abs(diff) < 0.001 else "⚠️"
        print(f"{ticker:<10} {comprado:<15.6f} {vendido:<15.6f} {diff:<15.6f} {status}")

    print("\n⚠️  NU tiene discrepancia - puede que falten compras en los correos")


if __name__ == "__main__":
    main()
