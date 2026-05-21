# Contexto del Proyecto — Portfolio Pipeline

> **Propósito de este archivo:** transferencia total de contexto para continuar el desarrollo con cualquier LLM sin necesidad de la conversación anterior. Última actualización: 2026-05-20.

---

## 1. Qué es esto

Sistema personal de seguimiento de inversiones multi-broker de **Pablo**. Centraliza operaciones de IBKR, Degiro, Trading 212, Kraken y Fintual; las consolida en una BD SQLite que se sube a Turso (cloud); y las visualiza en un dashboard Next.js desplegado en Vercel.

- **Repo:** https://github.com/pablocarro1718/test  
- **Deploy:** https://vercel.com (auto-deploy desde `main`)  
- **BD cloud:** Turso (LibSQL)  
- **Pipeline:** GitHub Actions (4×/día en días laborables: 7, 11, 15, 19h UTC)

---

## 2. Estructura de carpetas

```
portfolio_pipeline/
├── .github/workflows/sync-portfolio.yml   # Pipeline CI/CD
├── dashboard/                              # Next.js app
│   └── src/
│       ├── app/
│       │   ├── page.tsx                   # Dashboard principal
│       │   ├── holdings/page.tsx          # Posiciones abiertas
│       │   ├── activity/page.tsx          # Historial de operaciones
│       │   ├── flows/page.tsx             # Depósitos/retiradas
│       │   ├── returns/page.tsx           # XIRR y trades cerrados
│       │   ├── allocation/page.tsx        # Breakdown por tipo/geo/broker
│       │   └── api/
│       │       ├── dashboard/route.ts
│       │       ├── holdings/route.ts
│       │       ├── activity/route.ts
│       │       ├── flows/route.ts
│       │       ├── returns/route.ts
│       │       ├── allocation/route.ts
│       │       ├── prices/route.ts        # Yahoo Finance vía yfinance
│       │       └── performance/route.ts
│       ├── components/
│       │   ├── data-table.tsx             # Tabla reutilizable con toggle de columnas
│       │   └── metric-card.tsx
│       └── lib/
│           ├── format.ts                  # Helpers de formateo numérico
│           └── db.ts                      # Cliente Turso
├── ibkr_sync.py                           # Descarga Flex Statement IBKR
├── kraken_sync.py                         # Sincroniza Kraken
├── normalizar_inversiones.py              # Unifica todos los CSVs
├── migrate_to_sqlite.py                   # CSV → SQLite
├── sync_to_turso.py                       # SQLite → Turso cloud
├── ibkr_transactions.csv                  # ⚠ DEBE estar en git (fallback)
├── ibkr_deposits.csv                      # ⚠ DEBE estar en git (fallback)
├── inversiones_unificadas.csv             # Fuente única de verdad
└── CONTEXT.md                             # Este archivo
```

---

## 3. Flujo de datos

```
IBKR Flex Query API  ─┐
Kraken API           ─┤─→ ibkr_transactions.csv / kraken_trades.csv / ...
                       │
                       ▼
              normalizar_inversiones.py
                       │
                       ▼
             inversiones_unificadas.csv   ← FUENTE ÚNICA DE VERDAD
                       │
                       ▼
              migrate_to_sqlite.py  ─── DEPOSITOS (hardcoded) + ibkr_deposits.csv
                       │
                       ▼
               portfolio.db (SQLite local)
                       │
                       ▼
              sync_to_turso.py
                       │
                       ▼
               Turso (cloud) ──→ Next.js API routes ──→ Vercel dashboard
```

**Crítico:** `migrate_to_sqlite.py` borra y recrea `portfolio.db` entero en cada ejecución (`DB_PATH.unlink()` en línea 260). No hay migraciones incrementales.

---

## 4. Regla de flujo de trabajo (obligatoria)

Siempre al terminar cualquier bloque de cambios:

```bash
git add <archivos modificados>
git commit -m "mensaje"
# Si el remote tiene commits adelantados (auto-sync de Actions):
git fetch origin && git rebase origin/main
git push origin main
```

Vercel auto-despliega desde `main`. El servidor local tiene problemas; se verifica directamente en Vercel.

---

## 5. Stack técnico

| Capa | Tecnología |
|------|------------|
| Pipeline | Python 3.11, Pandas, SQLite |
| BD cloud | Turso (LibSQL HTTP API) |
| Frontend | Next.js 15, React 19, TypeScript |
| Estilos | Tailwind CSS 4, shadcn/ui |
| Gráficos | Recharts |
| Drag-and-drop | @dnd-kit (columnas de tabla) |
| BD client | @libsql/client |

---

## 6. Esquema de BD

### Tablas principales

| Tabla | Contenido |
|-------|-----------|
| `operations` | BUY, SELL, DIVIDEND — todas las operaciones. Columnas clave: `ticker`, `broker`, `operation_type`, `date`, `quantity`, `price_original`, `currency_original`, `amount_eur`, `net_amount_eur`, `commission_eur`, `fx_rate` |
| `cash_flows` | Depósitos y retiradas por broker. Columnas: `date`, `broker`, `flow_type` (deposit/withdrawal), `amount_eur`, `currency`, `fx_rate` |
| `symbols` | `ticker`, `name`, `asset_type` (Stock/ETF/Crypto), `currency` (USD/EUR/CAD…), `exchange`. **SIN campo `region`** — la geografía se calcula en código |
| `external_positions` | Posiciones no trackeadas en `operations` (p.ej. fondos Fintual con valor global) |
| `fx_rates` | Tipos de cambio históricos |
| `price_cache` | Caché de precios de Yahoo Finance |
| `cash_balances` | Saldo en efectivo no invertido |

### Clasificación geográfica

La geografía **no está en BD**, se calcula server-side en `/api/dashboard` y `/api/allocation`:

1. **Override estático `TICKER_REGION`**: Para activos USD con exposición no-norteamericana:  
   `IEV` → Europe, `ARGT/MELI/NU` → Latam, `BABA/TCEHY` → Asia, `URA` → Global
2. **Heurística por currency**: Crypto → "Crypto", EUR/GBP → "Europe", CAD → "North America", USD → "North America"

> Si Pablo compra un activo USD no-americano nuevo, hay que añadir su ticker a `TICKER_REGION` en **ambos** archivos: `api/dashboard/route.ts` y `api/allocation/route.ts`.

---

## 7. Archivos clave — estado actual

### `migrate_to_sqlite.py`

- **Línea 260:** `DB_PATH.unlink()` — borra toda la BD antes de recrearla.
- **Líneas 21–71:** Lista `DEPOSITOS` hardcoded con todos los depósitos/retiradas. Para IBKR en MXN se especifica `fx_rate` (EUR/MXN del día).  
  Los depósitos IBKR más recientes en la lista:
  ```python
  {'fecha': '2026-01-02', 'broker': 'IBKR', 'cantidad': 30000.00, 'moneda': 'MXN', 'tipo': 'deposit', 'fx_rate': 23.97},
  {'fecha': '2026-01-23', 'broker': 'IBKR', 'cantidad': 1000.00,  'moneda': 'EUR', 'tipo': 'deposit'},
  {'fecha': '2026-02-02', 'broker': 'IBKR', 'cantidad': 25000.00, 'moneda': 'MXN', 'tipo': 'deposit', 'fx_rate': 21.57},
  {'fecha': '2026-02-25', 'broker': 'IBKR', 'cantidad': 1000.00,  'moneda': 'EUR', 'tipo': 'deposit'},
  {'fecha': '2026-03-11', 'broker': 'IBKR', 'cantidad': 1000.00,  'moneda': 'EUR', 'tipo': 'deposit'},
  {'fecha': '2026-04-16', 'broker': 'IBKR', 'cantidad': 30000.00, 'moneda': 'MXN', 'tipo': 'deposit', 'fx_rate': 20.35},
  ```
- **Líneas 320–348:** Función `_ibkr_deposits_from_csv()` lee `ibkr_deposits.csv` y añade los depósitos que no estén ya en `DEPOSITOS` (deduplicación por fecha+broker+cantidad+moneda).
- **Depósitos nuevos IBKR:** Hay que añadirlos en **dos sitios**: (1) en `DEPOSITOS` con el `fx_rate` correcto, y (2) en `ibkr_deposits.csv`. Para el fx_rate, consultar en yfinance el tipo EUR/MXN (`EURMXN=X`) del día.

### `ibkr_sync.py`

- Implementa la API de dos pasos de IBKR Flex Query: `SendRequest` → `GetStatement`.
- **Error 1001** (`Statement could not be generated at this time`): transitorio. Implementado con reintento hasta 6 veces con backoff lineal (10s, 20s, 30s…) en `request_flex_statement()`.
- El paso `SendRequest` y el paso `GetStatement` tienen sus propios loops de reintento.

### `ibkr_transactions.csv` y `ibkr_deposits.csv`

- **Crítico:** Deben permanecer **en git** (no están en `.gitignore`).  
  El runner de GitHub Actions hace un checkout limpio en cada ejecución. Si `ibkr_sync.py` falla (error 1001, token expirado…), el normalizer usa estos ficheros como fallback. Si no están en el repo, `normalizar_inversiones.py` salta IBKR y las posiciones desaparecen de Vercel.
- `ibkr_deposits.csv` tiene columnas: `Fecha,Moneda,Cantidad,Tipo,Descripción`
- `ibkr_transactions.csv` tiene las 56 operaciones IBKR reconstruidas de `inversiones_unificadas.csv`.

### `.github/workflows/sync-portfolio.yml`

- Pasos: checkout → install deps → Sync IBKR (`continue-on-error: true`) → Sync Kraken (`continue-on-error: true`) → normalize → migrate → sync Turso → commit + push.
- `continue-on-error: true` en IBKR y Kraken: si el broker API falla, el pipeline continúa con los datos en git.

---

## 8. Sistema de formateo — `dashboard/src/lib/format.ts`

Usa regex explícita (NO `Intl.NumberFormat`) porque algunas builds de Node/Vercel con ICU limitado no añaden separador de miles.

| Función | Resultado | Uso |
|---------|-----------|-----|
| `formatCurrency(value, decimals=2)` | `1.983,45 €` | Importes en EUR |
| `formatPercent(value, decimals=2)` | `+12,34%` | Porcentajes con signo |
| `formatNumber(value, decimals=2)` | `1.983,45` | Números genéricos |
| `formatDate(dateStr)` | `23/01/2026` | Fechas YYYY-MM-DD → DD/MM/YYYY |
| `formatPriceOriginal(value, currency)` | `$204,95` / `CA$2.433,10` / `€1.234,56` | Precio unitario en moneda nativa |

`formatPriceOriginal` usa este mapa de símbolos:
```typescript
{ USD: "$", CAD: "CA$", EUR: "€", GBP: "£", MXN: "MX$" }
// Fallback para monedas no conocidas: "XYZ 1.234,56"
```

**Convenciones de decimales:**
- KPIs grandes (portfolio total, P&L total): 0 decimales  
- Tablas de detalle: 2 decimales  
- Porcentajes de peso/allocation: 1 decimal  
- Precios unitarios: 2 decimales fijos (vía `formatPriceOriginal`)

---

## 9. DataTable — sistema de columnas

Componente en `dashboard/src/components/data-table.tsx`. Tres tipos de columna:

| Prop | Comportamiento | Visible por defecto | Aparece en toggler |
|------|----------------|--------------------|--------------------|
| ninguno (primaria) | Siempre visible, bloqueada | ✅ | ❌ |
| `secondary: true` | Oculta por defecto, usuario activa | ❌ | ✅ |
| `removable: true` | Visible por defecto, usuario puede ocultar | ✅ | ✅ |

El estado de visibilidad se persiste en `localStorage` con clave `dt-cols-{storageKey}`.  
El orden de columnas se persiste en `dt-cols-order-{storageKey}`.  
Se puede reordenar arrastrando con @dnd-kit.

---

## 10. Páginas del dashboard — estado actual

### Dashboard principal (`/`)

- Hero card: valor total del portfolio, cambio diario, P&L no realizado, XIRR.
- **Today's Movers:** gainers/losers con precio en **moneda original** (`formatPriceOriginal`). Datos de `/api/prices` (yfinance).
- Allocation: stacked bar + pie chart por ticker + tabla geo.

### Holdings (`/holdings`)

Columnas primarias (todas `removable: true`, visibles por defecto pero quitables):
- `costBasis` (Cost Basis, EUR), `marketValue` (Mkt Value, EUR), `unrealizedPnl` (P&L, EUR), `unrealizedPct` (P&L %), `weight` (Weight %)

Solo `ticker` está bloqueado (siempre visible).

Columnas secundarias (ocultas por defecto, activables):
- `tir`, `quantity`, `currentPrice` (precio hoy en moneda original), `avgPriceOriginal` (precio medio compra en moneda original), `firstBuy`, `lastBuy`, `dividends`, `currency`

**Nota:** La antigua columna "Avg Cost" (EUR) fue eliminada. Reemplazada por "Avg Price" (moneda original).

API route `api/holdings/route.ts`: CTE `avg_orig` calcula precio medio ponderado en moneda original:
```sql
avg_orig AS (
  SELECT ticker,
    SUM(price_original * quantity) / SUM(quantity) AS avg_price_original
  FROM operations WHERE operation_type = 'BUY'
  GROUP BY ticker
)
```

### Activity (`/activity`)

- Tabla paginada de operaciones con filtros (tipo, broker, ticker).
- Columna "Price (orig)": usa `formatPriceOriginal(r.price_original, r.currency_original)`.
- Agrupación de partial fills (expansión de filas).

### Flows (`/flows`)

- KPIs: Total Deposited, Total Withdrawn, Net Deployed.
- Gráfico mensual (barras depósitos/retiradas + línea cumulativa).
- Tabla detalle con fechas en `DD/MM/YYYY`.

### Returns (`/returns`)

- XIRR del portfolio, P&L realizado, trades cerrados.
- Fechas en `DD/MM/YYYY`.

---

## 11. API `/api/prices`

- Llama a yfinance para obtener precios en tiempo real.
- Responde con objeto `prices: Record<ticker, { price, priceEur, currency, change, changePercent }>`.
- `price` = precio en moneda original del activo.
- `priceEur` = precio convertido a EUR (para cálculos de valor de portfolio).
- `currency` = moneda nativa (USD, CAD, EUR…).

---

## 12. Variables de entorno

| Variable | Uso |
|----------|-----|
| `IBKR_TOKEN` | Token API IBKR |
| `IBKR_QUERY_ID` | ID Flex Query IBKR |
| `KRAKEN_API_KEY` / `KRAKEN_PRIVATE_KEY` | Credenciales Kraken |
| `TURSO_DATABASE_URL` | URL BD Turso |
| `TURSO_AUTH_TOKEN` | Token Turso |

---

## 13. Historial de cambios relevantes (commits recientes)

| Commit | Descripción |
|--------|-------------|
| `97ebb4e` | feat: precios en moneda original (formatPriceOriginal, removable columns, Price/Avg Price en holdings) |
| `8b96bfe` | Feat: formato DD/MM/YYYY en Flows |
| `5810ee7` | Feat: formato DD/MM/YYYY en todo el dashboard |
| `2da5e09` | Fix: añadir depósito IBKR 30k MXN del 16/04/2026 |
| `d7d55a6` | Fix: restaurar posiciones IBKR + persistir ibkr_transactions.csv en repo |
| `d95ff5e` | Fix: retry IBKR SendRequest en error 1001 |
| `6ceedee` | Fix: IBKR/Kraken continue-on-error + logging de errores IBKR |

---

## 14. Trampas conocidas / patrones a recordar

1. **Posiciones IBKR desaparecen de Vercel:** Causa más probable = `ibkr_transactions.csv` no está en git o fue eliminado. Verificar con `git ls-files ibkr_transactions.csv`.

2. **Depósito IBKR no aparece en Flows:** Los depósitos IBKR tienen fuente doble — `ibkr_deposits.csv` (se lee automáticamente desde el CSV que genera el sync) + lista `DEPOSITOS` hardcoded en `migrate_to_sqlite.py`. Para depósitos en MXN hay que añadir el `fx_rate` del día. Sin él, se usa el fallback de 18.0 EUR/MXN (inexacto). Usar yfinance para consultar `EURMXN=X` histórico.

3. **Push rechazado (`fetch first`):** Los runners de Actions hacen auto-commits. Siempre `git fetch origin && git rebase origin/main` antes del push.

4. **Error IBKR 1001:** "Statement could not be generated at this time" — transitorio, el servidor IBKR está ocupado. Esperar y reintentar. El script ya tiene 6 reintentos con backoff lineal.

5. **`migrate_to_sqlite.py` borra la BD:** Línea 260 hace `DB_PATH.unlink()`. Nunca depender de datos que estén solo en la BD local; la fuente de verdad es siempre `inversiones_unificadas.csv` + los CSVs crudos.

6. **localStorage en DataTable:** Si el usuario ha guardado una configuración de columnas previa y se añaden columnas nuevas, puede no verlas en el toggler hasta que limpie el localStorage. La lógica de merge en `columnOrder` ya lo maneja, pero el estado `visibleSecondary` no hace merge — usa el stored set tal cual.

7. **Clasificación geográfica nueva:** Si se añade un activo USD que NO sea norteamericano (p.ej. un ETF europeo), hay que actualizar `TICKER_REGION` en `/api/dashboard/route.ts` Y en `/api/allocation/route.ts`.

---

## 15. Tareas pendientes / ideas anotadas

- **Ninguna tarea técnica urgente pendiente** a fecha de última actualización (2026-05-20).
- Ideas futuras no comprometidas:
  - Añadir soporte de precio histórico para calcular TIR con cotización real en la fecha de venta
  - Página de dividendos dedicada con calendario de pagos
  - Alertas por email cuando una posición suba/baje X%

---

## 16. Cómo añadir un depósito IBKR nuevo

1. Añadir fila a `ibkr_deposits.csv` con formato `YYYY-MM-DD,EUR/MXN,cantidad,Deposit,CASH RECEIPTS / ELECTRONIC FUND TRANSFERS`.
2. Añadir entrada a la lista `DEPOSITOS` en `migrate_to_sqlite.py` (línea ~65). Para MXN, consultar el tipo EUR/MXN del día en yfinance:
   ```python
   import yfinance as yf
   df = yf.download("EURMXN=X", start="YYYY-MM-DD", end="YYYY-MM-DD")
   ```
3. Commit + push ambos archivos.

---

## 17. Cómo añadir un activo nuevo al portfolio

1. Comprar en el broker.
2. En el próximo sync automático (o forzando `workflow_dispatch`), el trade aparecerá en `ibkr_transactions.csv` / etc. y se integrará en `inversiones_unificadas.csv`.
3. Si el activo es un ETF USD con exposición no-norteamericana: actualizar `TICKER_REGION` en las dos rutas API mencionadas en §13.
4. Si el activo tiene una moneda que no está en el mapa de `formatPriceOriginal` (USD, CAD, EUR, GBP, MXN): añadir el símbolo en `dashboard/src/lib/format.ts`.
