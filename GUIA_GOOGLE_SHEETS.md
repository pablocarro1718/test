# Guía: Dashboard de Inversiones en Google Sheets

## Paso 1: Crear el Google Sheet e importar datos

1. Ve a [Google Sheets](https://sheets.google.com) y crea un nuevo documento
2. Renómbralo como "Mi Portfolio de Inversiones"
3. Descarga el archivo `inversiones_unificadas.csv` de tu repositorio GitHub
4. En Google Sheets: **Archivo → Importar → Subir → Selecciona el CSV**
5. Opciones de importación:
   - Ubicación: "Reemplazar hoja actual"
   - Tipo de separador: "Coma"
   - Convertir texto a números: "Sí"
6. Renombra esta hoja como **"Datos"**

---

## Paso 2: Estructura de hojas

Crea estas hojas adicionales (clic en el `+` abajo a la izquierda):

| Hoja | Propósito |
|------|-----------|
| Datos | CSV importado (ya lo tienes) |
| Dashboard | Métricas principales |
| Por_Activo | Análisis por ticker |
| Posiciones_Abiertas | Crypto de Kraken |

---

## Paso 3: Hoja "Dashboard"

### 3.1 Métricas principales

Copia esta estructura en la hoja Dashboard:

```
Celda A1: DASHBOARD DE INVERSIONES
Celda A3: Métrica
Celda B3: Valor
Celda C3: Notas

Celda A4: Total Invertido (€)
Celda A5: Total Recuperado (€)
Celda A6: Dividendos Recibidos (€)
Celda A7: Resultado Neto (€)
Celda A8: Rentabilidad (%)
Celda A9: Comisiones Pagadas (€)
```

### 3.2 Fórmulas para las métricas

En la columna B, pega estas fórmulas:

**B4 - Total Invertido:**
```
=ABS(SUMIFS(Datos!$N:$N, Datos!$C:$C, "BUY", Datos!$A:$A, "<>PENDIENTE"))
```

**B5 - Total Recuperado:**
```
=SUMIFS(Datos!$N:$N, Datos!$C:$C, "SELL")
```

**B6 - Dividendos:**
```
=SUMIFS(Datos!$N:$N, Datos!$C:$C, "DIVIDEND")
```

**B7 - Resultado Neto:**
```
=B5+B6-B4
```

**B8 - Rentabilidad %:**
```
=B7/B4*100
```

**B9 - Comisiones:**
```
=SUMIF(Datos!$M:$M, ">0", Datos!$M:$M)
```

---

## Paso 4: Hoja "Por_Activo"

### 4.1 Crear tabla dinámica (Pivot Table)

1. Ve a la hoja "Datos"
2. Selecciona todo (Ctrl+A)
3. Menú: **Insertar → Tabla dinámica**
4. Ubicación: "Hoja nueva" (renómbrala como "Por_Activo")

### 4.2 Configurar la tabla dinámica

En el panel derecho:
- **Filas:** Añadir "ticker"
- **Valores:**
  - Añadir "importe_neto_eur" → Resumir por: SUMA
  - Añadir "cantidad" → Resumir por: SUMA
- **Filtros:** Añadir "tipo_operacion" (para filtrar BUY/SELL/DIVIDEND)

---

## Paso 5: Hoja "Posiciones_Abiertas" (Crypto Kraken)

Esta hoja calcula el valor actual de tu crypto.

### 5.1 Estructura

```
Celda A1: POSICIONES ABIERTAS (CRYPTO)

Celda A3: Ticker
Celda B3: Cantidad
Celda C3: Coste Total (€)
Celda D3: Precio Actual (€)
Celda E3: Valor Actual (€)
Celda F3: P&L (€)
Celda G3: P&L (%)

Celda A4: BTC
Celda A5: ETH
Celda A6: SOL
Celda A8: TOTAL
```

### 5.2 Fórmulas

**B4 - Cantidad BTC:**
```
=SUMIFS(Datos!$G:$G, Datos!$E:$E, "BTC", Datos!$C:$C, "BUY")
```

**B5 - Cantidad ETH:**
```
=SUMIFS(Datos!$G:$G, Datos!$E:$E, "ETH", Datos!$C:$C, "BUY")
```

**B6 - Cantidad SOL:**
```
=SUMIFS(Datos!$G:$G, Datos!$E:$E, "SOL", Datos!$C:$C, "BUY")
```

**C4 - Coste BTC:**
```
=ABS(SUMIFS(Datos!$N:$N, Datos!$E:$E, "BTC", Datos!$C:$C, "BUY"))
```
(Repite para ETH en C5 y SOL en C6)

**D4, D5, D6 - Precios actuales:**
Aquí debes poner el precio actual manualmente o usar una API.
Para actualizar manualmente, busca en Google "BTC EUR price" y pon el valor.

**E4 - Valor Actual BTC:**
```
=B4*D4
```
(Repite para ETH y SOL)

**F4 - P&L BTC:**
```
=E4-C4
```

**G4 - P&L % BTC:**
```
=F4/C4*100
```

**Fila TOTAL (fila 8):**
```
B8: =SUM(B4:B6)  (no tiene sentido sumar cantidades de distintas crypto)
C8: =SUM(C4:C6)
E8: =SUM(E4:E6)
F8: =SUM(F4:F6)
G8: =F8/C8*100
```

---

## Paso 6: Calcular TIR (XIRR) - Avanzado

La TIR money-weighted requiere la función XIRR.

### 6.1 Preparar datos para XIRR

En una nueva hoja "TIR_Calc", necesitas dos columnas:
- **Fechas** (solo operaciones con fecha válida)
- **Flujos** (negativos = inversión, positivos = recuperación)

**Columna A - Fechas:**
Copia las fechas de la hoja Datos (excluyendo "PENDIENTE")

**Columna B - Flujos:**
Usa la columna "importe_neto_eur" (ya está con el signo correcto)

### 6.2 Fórmula XIRR

Al final de tus datos, añade una fila con:
- Fecha: HOY
- Flujo: Valor actual de posiciones abiertas (de la hoja Posiciones_Abiertas, celda E8)

Luego calcula:
```
=XIRR(B:B, A:A) * 100
```

Esto te da la TIR anualizada en %.

---

## Paso 7: Gráficos recomendados

### 7.1 Evolución del portfolio
1. Crea una columna auxiliar en "Datos" con el acumulado de importe_neto_eur
2. Inserta gráfico de líneas con fecha en X y acumulado en Y

### 7.2 Distribución por broker
1. Tabla dinámica con broker en filas, suma de importe_eur en valores
2. Gráfico circular

### 7.3 Distribución por tipo de activo
1. Tabla dinámica con tipo_activo en filas
2. Gráfico circular

---

## Notas importantes

1. **Trading212 fechas pendientes:** Cuando tengas las fechas de compra, actualízalas directamente en la hoja "Datos", cambiando "PENDIENTE" por la fecha real en formato YYYY-MM-DD

2. **Añadir nuevas operaciones:** Simplemente añade filas nuevas al final de la hoja "Datos" siguiendo el mismo formato

3. **Actualizar precios crypto:** Puedes usar Google Finance para precios automáticos:
   ```
   =GOOGLEFINANCE("BTCEUR")
   =GOOGLEFINANCE("ETHEUR")
   ```
   (Nota: puede no funcionar para todas las crypto)

4. **Broker de México:** Cuando lo añadas, simplemente añade las operaciones a la hoja "Datos" con broker="NuevoBroker"

---

## Resumen de columnas del CSV

| Columna | Letra | Descripción |
|---------|-------|-------------|
| fecha | A | YYYY-MM-DD |
| broker | B | Degiro/Trading212/Kraken |
| tipo_operacion | C | BUY/SELL/DIVIDEND |
| tipo_activo | D | Stock/ETF/Crypto |
| ticker | E | Símbolo |
| isin | F | Código ISIN |
| cantidad | G | Unidades |
| precio_unitario | H | Precio por unidad |
| moneda_original | I | EUR/USD |
| importe_bruto | J | Cantidad × Precio |
| importe_eur | K | En euros |
| tipo_cambio | L | USD/EUR |
| comisiones_eur | M | Costes |
| importe_neto_eur | N | Flujo final (- = sale, + = entra) |
| notas | O | Comentarios |
