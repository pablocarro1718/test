# Contexto del Proyecto — Portfolio Pipeline

> **Propósito:** transferencia total de contexto para continuar el desarrollo con cualquier LLM sin la conversación anterior. **Este archivo es la ÚNICA fuente de verdad del proyecto** — vive en el repo, versionado con el código. La memoria de Claude (`~/.claude/.../memory`) solo apunta aquí; no dupliques contexto allí.
>
> Última actualización: 2026-08-16.

---

## 1. Qué es esto

Sistema personal de seguimiento de inversiones multi-broker de **Pablo**. Centraliza operaciones de IBKR, Degiro, Trading 212, Kraken y Fintual; las consolida en SQLite → Turso (cloud); y las visualiza en un dashboard Next.js en Vercel.

- **Repo:** https://github.com/pablocarro1718/test
- **Deploy:** Vercel (auto-deploy desde `main`)
- **BD cloud:** Turso (LibSQL)
- **Automatización:** GitHub Actions, 4×/día en días laborables (7, 11, 15, 19h UTC)

---

## 2. Estructura de carpetas

```
portfolio_pipeline/
├── .github/workflows/sync-portfolio.yml   # Pipeline CI/CD (4×/día)
├── dashboard/                              # Next.js app
│   └── src/
│       ├── app/
│       │   ├── page.tsx                    # Dashboard principal
│       │   ├── holdings/page.tsx           # Posiciones abiertas
│       │   ├── activity/page.tsx           # Historial de operaciones
│       │   ├── flows/page.tsx              # Depósitos/retiradas
│       │   ├── returns/page.tsx            # P&L realizado, trades cerrados
│       │   ├── allocation/page.tsx         # Breakdown (existe pero NO está en el menú)
│       │   └── api/
│       │       ├── dashboard/route.ts      # Resumen, TIR flows, cash, geo, movers
│       │       ├── holdings/route.ts
│       │       ├── activity/route.ts
│       │       ├── flows/route.ts
│       │       ├── returns/route.ts
│       │       ├── allocation/route.ts
│       │       ├── period-returns/route.ts # Retornos por periodo (1S/1M/YTD/1A, Modified Dietz sobre compras/ventas, cash-neutral)
│       │       └── prices/route.ts         # Precios live vía Yahoo (lib/yahoo)
│       ├── components/
│       │   ├── data-table.tsx              # Tabla reutilizable con toggle/reorden de columnas
│       │   └── sidebar.tsx                 # Nav: Dashboard, Holdings, Returns, Flows, Activity
│       └── lib/
│           ├── format.ts                   # Formateo numérico (regex, no Intl)
│           ├── xirr.ts                     # Motor XIRR (Newton-Raphson)
│           ├── yahoo.ts                    # fetchYahooQuote / getFxRate / fetchYahooHistory
│           └── db.ts                       # Cliente Turso
├── ibkr_sync.py                            # IBKR Flex Query → CSVs (trades, deposits, cash balance)
├── normalizar_inversiones.py               # Unifica todos los CSVs → EUR (paso 2)
├── migrate_to_sqlite.py                    # CSV → SQLite (paso 3)
├── sync_to_turso.py                        # SQLite → Turso (paso 4)
├── ibkr_transactions.csv                   # ⚠ DEBE estar en git (fallback)
├── ibkr_deposits.csv                       # ⚠ DEBE estar en git (fallback)
├── ibkr_cash_balance.csv                   # ⚠ DEBE estar en git (fallback) — saldo cash IBKR
├── inversiones_unificadas.csv              # Artefacto central de operaciones
├── <broker>_*.csv                          # Fuentes manuales: degiro_transactions, trading212_results,
│                                           #   trading212_dividend, kraken_trades_completo, fintual_transactions_USD,
│                                           #   t212_buy_operations_missing_date
└── CONTEXT.md                              # Este archivo
```

> **Nota:** en ago-2026 se eliminó código legacy: `app.py` (dashboard Streamlit), `crear_excel_dashboard.py`, `actualizar_fechas_t212.py`, `fix_t212_pending_dates.py`, `kraken_sync.py`, la tabla `price_cache`, la página `/performance` (estaba rota) y varios CSVs huérfanos.

---

## 3. Flujo de datos — 4 pasos EN ORDEN

```
1. ibkr_sync.py            → ibkr_transactions.csv + ibkr_deposits.csv + ibkr_cash_balance.csv
2. normalizar_inversiones.py → inversiones_unificadas.csv  (une brokers, convierte a EUR con FX histórico yfinance)
3. migrate_to_sqlite.py    → portfolio.db  (+ DEPOSITOS hardcoded, + ibkr_deposits.csv, + ibkr_cash_balance.csv)
4. sync_to_turso.py        → Turso (cloud) → Next.js API → Vercel
```

- **TRAMPA #1:** correr a mano y saltarse el **paso 2** (`normalizar_inversiones.py`). `ibkr_sync.py` escribe `ibkr_transactions.csv` (crudo), pero migrate lee `inversiones_unificadas.csv`. Sin normalizar, las compras nuevas no llegan a la BD. Los depósitos SÍ llegan directos (migrate lee `ibkr_deposits.csv`).
- **Crítico:** `migrate_to_sqlite.py` **borra y recrea** `portfolio.db` entero cada vez (`DB_PATH.unlink()`). No hay migraciones incrementales; la fuente de verdad son los CSVs.
- Kraken ya **no se sincroniza** (script eliminado), pero sus holdings históricos (BTC/ETH/SOL, abiertos) se conservan vía `kraken_trades_completo.csv` que `normalizar` sigue leyendo.

---

## 4. Automatización (GitHub Actions) y tokens

`.github/workflows/sync-portfolio.yml` corre los 4 pasos + commit/push, 4×/día en días laborables. **Es el sistema "seamless"**; correr scripts a mano es el fallback.

**Gotchas:**
- **GitHub desactiva el workflow por inactividad** (`disabled_inactivity`) tras 60 días si los únicos commits son del bot (los auto-commits no cuentan). Reactivar: `gh workflow enable sync-portfolio.yml`. Los commits reales resetean el contador.
- **Fallo de IBKR no silencioso:** el paso IBKR tiene `continue-on-error`, pero `ibkr_sync.py` clasifica por exit code — token caducado (error 1015) → exit 1 → un paso final falla el job → GitHub manda email; error transitorio (1001 ocupado, 1025 lockout, red) → exit 0 → sigue con el último CSV y reintenta en la próxima ejecución.

**Tokens (caducan; los GitHub Secrets están separados del `.env` local — actualizar AMBOS):**
- **IBKR Flex** (`IBKR_TOKEN`, en `.env`): portal IBKR → Performance & Reports → Flex Queries → Flex Web Service → Generate New Token (1 año). El Query ID `1384190` NO cambia.
- **Turso** (`TURSO_AUTH_TOKEN`, en `dashboard/.env.local`): app.turso.tech → BD `portfolio-pablocarro1718` → Create Token (Never / Read & Write). Síntoma de caducado: `auth role not found`.
- Actualizar Secrets por CLI:
  ```bash
  gh secret set IBKR_TOKEN --body="$(grep '^IBKR_TOKEN=' .env | cut -d= -f2-)"
  gh secret set TURSO_AUTH_TOKEN --body="$(grep '^TURSO_AUTH_TOKEN=' dashboard/.env.local | cut -d= -f2-)"
  ```
- **Errores IBKR:** `1015`=token inválido (refrescar); `1001`=servidor ocupado (transitorio, peor en horario de mercado NY); `1025`=lockout por demasiados intentos (PARAR ~20 min sin NINGUNA llamada — cada intento reinicia el contador).

---

## 5. Regla de flujo de trabajo (obligatoria)

```bash
git add <archivos>
git commit -m "mensaje"          # terminar con: Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
git fetch origin && git rebase origin/main   # el remote suele tener auto-commits del bot
git push origin main
```
Vercel auto-despliega desde `main`. El servidor local da problemas; verificar en Vercel (o `npm run dev` en `dashboard/` con `.env.local` apuntando a Turso).

---

## 6. Stack técnico

| Capa | Tecnología |
|------|------------|
| Pipeline | Python 3.11, Pandas, yfinance, requests |
| BD cloud | Turso (LibSQL HTTP API) |
| Frontend | Next.js 16, React 19, TypeScript |
| Estilos | Tailwind CSS 4, shadcn/ui |
| Gráficos | Recharts · Drag-and-drop columnas: @dnd-kit |

---

## 7. Esquema de BD

| Tabla | Contenido |
|-------|-----------|
| `operations` | BUY/SELL/DIVIDEND. Claves: `ticker`, `broker`, `operation_type`, `date`, `quantity`, `price_original`, `currency_original`, `amount_eur`, `net_amount_eur`, `commission_eur`, `fx_rate` |
| `cash_flows` | Depósitos/retiradas. `date`, `broker`, `flow_type` (deposit/withdrawal), `amount`, `currency`, `amount_eur` (**ya firmado**: retiradas negativas), `fx_rate` |
| `symbols` | `ticker`, `yfinance_symbol`, `name`, `asset_type` (Stock/ETF/Crypto), `currency`. Sin `region` (geo en código) |
| `external_positions` | Posiciones no trackeadas en `operations` (fondos Fintual con valor global) |
| `cash_balances` | Efectivo sin invertir. Poblado desde `ibkr_cash_balance.csv`. Guarda nativo (`currency`, `amount`); la conversión a EUR se hace en `api/dashboard` con FX live |
| `fx_rates` | Tipos de cambio históricos |

(La tabla `price_cache` se eliminó — nunca se poblaba ni se leía.)

### Clasificación geográfica
No está en BD; se calcula en `/api/dashboard` y `/api/allocation` con override estático `TICKER_REGION` (IEV→Europe, ARGT/MELI/NU→Latam, BABA/TCEHY→Asia, URA→Global) + heurística por divisa. **Si compras un activo USD no-norteamericano, añade su ticker a `TICKER_REGION` en LOS DOS archivos.**

---

## 8. TIR (rentabilidad) — las dos métricas del dashboard

Motor: `dashboard/src/lib/xirr.ts` (XIRR / money-weighted, Newton-Raphson, anualizado, base 365,25). Ambas TIR se calculan sobre **operaciones de valores** (BUY=salida, SELL/DIVIDEND=entrada) + valor de mercado actual como flujo terminal. **NUNCA sobre depósitos** → el efectivo ocioso no las contamina.

- **TIR general:** todas las operaciones (abiertas + cerradas) → track record completo.
- **TIR vivo:** solo posiciones abiertas → rentabilidad de lo que se tiene ahora.

`api/dashboard` emite `tirFlows` (una fila por operación, con flag `open`); `page.tsx` calcula ambas con el valor de mercado live. Holdings muestra la "vivo" (por posición y agregada).

- **Por qué la XIRR vieja (basada en depósitos) daba N/A:** el depósito de €17.500 (jul-2026) mayormente sin invertir dejaba el valor terminal muy por debajo del capital aportado → tasa tan negativa que el solver no convergía.
- **30% acumulado vs ~18% anual no se contradicen:** el 30% es total, el 18% es por año; encajan porque la antigüedad media del capital (ponderada por importe) es ~1,8 años (el 65% entró en 2025-2026).

---

## 9. Cash en broker

Efectivo sin invertir en IBKR, mostrado aparte en el hero card, **fuera de la TIR y del valor de cartera**. Fuente: sección **Cash Report** de la Flex Query → `ibkr_sync.py::parse_cash_report()` lee `EndingCash` de la fila `BASE_SUMMARY` → `ibkr_cash_balance.csv` → `cash_balances`.

- **La divisa base de la cuenta IBKR (U23227441) es USD** (verificado por reconciliación de depósitos). Constante `BASE_CURRENCY="USD"` en `ibkr_sync.py`.
- La conversión USD→EUR se hace en `api/dashboard` con FX **en vivo** (`getFxRate`, misma fuente que los precios), no con un valor guardado.

---

## 10. IBKR Flex Query — configuración

Query `1384190`, formato **CSV** (no XML), 3 secciones: **Trades**, **Cash Transactions**, **Cash Report**. El parser de `ibkr_sync.py` es frágil (detecta secciones por palabras clave en la cabecera): Trades = `Symbol`+`Quantity`+`TradePrice`; Cash Transactions = `CurrencyPrimary`+`Description`+`Type`; Cash Report = `StartingCash`+`EndingCash`+`CurrencyPrimary`. **No quitar columnas requeridas de esas secciones.** Columnas usadas por el código:
- Trades: `Symbol, ISIN, DateTime, AssetClass, Quantity, TradePrice, CurrencyPrimary, Proceeds, IBCommission`
- Cash Transactions: `Type` (filtra `Deposits/Withdrawals`), `Date/Time, CurrencyPrimary, Amount, Description`
- Cash Report: `CurrencyPrimary` (fila BASE_SUMMARY), `EndingCash`, `ToDate`

---

## 11. Depósitos IBKR — fuente doble

Un depósito IBKR debe estar en: (1) `ibkr_deposits.csv` (lo genera el sync), y si es MXN/otra divisa, en la lista `DEPOSITOS` hardcoded de `migrate_to_sqlite.py` con `fx_rate` exacto (EUR/MXN del día vía `EURMXN=X`). Los EUR entran solos. Dedup por (fecha, broker, cantidad, moneda) en `migrate_cash_flows`.

---

## 12. Formateo — `dashboard/src/lib/format.ts`

Regex explícita (no `Intl.NumberFormat`, por ICU limitado en Vercel).

| Función | Resultado |
|---------|-----------|
| `formatCurrency(v, dec=2)` | `1.983,45 €` |
| `formatPercent(v, dec=2)` | `+12,34%` |
| `formatNumber(v, dec=2)` | `1.983,45` |
| `formatDate(str)` | `23/01/2026` |
| `formatPriceOriginal(v, currency)` | `$204,95` / `CA$2.433,10` / `€1.234,56` (mapa: USD `$`, CAD `CA$`, EUR `€`, GBP `£`, MXN `MX$`) |

Decimales: KPIs grandes 0 · tablas 2 · pesos/allocation 1.

---

## 13. DataTable — `dashboard/src/components/data-table.tsx`

| Prop | Visible por defecto | En toggler |
|------|:---:|:---:|
| (primaria) | ✅ bloqueada | ❌ |
| `secondary: true` | ❌ | ✅ |
| `removable: true` | ✅ | ✅ |

Visibilidad y orden se persisten en `localStorage` (`dt-cols-{key}`, `dt-cols-order-{key}`); reordenable con @dnd-kit.

---

## 14. Páginas del dashboard

- **Dashboard (`/`):** hero con valor de cartera, selector de periodo (1D/1S/1M/YTD/1A/TODO), y fila de metadatos: Cost Basis · **TIR general** · **TIR vivo** · nº posiciones · **Cash en broker**. Debajo: Today's Movers (precio en moneda original) + Allocation (barra/pie/geo).
- **Holdings (`/holdings`):** primarias removable (Cost Basis, Mkt Value, P&L, P&L %, Weight); bloqueada: Ticker; secundarias: TIR, Qty, Price, Avg Price (moneda original), First/Last Buy, Dividends, Currency. El CTE `avg_orig` calcula el precio medio **solo de posiciones-broker abiertas** (join con `open_broker_pos`), para no contaminar con lotes ya vendidos. El desglose por broker (fila expandida) muestra "Avg Price" en **divisa nativa** (no €), comparable con la cotización.

**Retornos por periodo (`period-returns`):** Modified Dietz con V_start/V_end = valor de mercado de las acciones y flujos = **compras/ventas** del periodo (NO depósitos). Así el retorno mide el rendimiento de la inversión y el cash ocioso de depósitos recientes no lo contamina (bug corregido: 1M daba −41% por el depósito de €17.5k).
- **Activity (`/activity`):** operaciones paginadas con filtros; fills agrupados; "Price (orig)" con `formatPriceOriginal`.
- **Flows (`/flows`):** KPIs depósitos/retiradas + gráfico mensual + detalle.
- **Returns (`/returns`):** P&L realizado, trades cerrados, dividendos por trimestre.
- **Allocation (`/allocation`):** funciona pero NO está enlazada en el menú.

---

## 15. Variables de entorno

`IBKR_TOKEN`, `IBKR_QUERY_ID` → `.env` (raíz). `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` → `dashboard/.env.local`. Los mismos en GitHub Secrets para CI. (Kraken ya no se usa.)

---

## 16. Trampas conocidas

1. **Compras nuevas no aparecen:** casi siempre faltó correr `normalizar_inversiones.py` (paso 2).
2. **Posiciones IBKR desaparecen de Vercel:** `ibkr_transactions.csv` no está en git. Verificar `git ls-files ibkr_transactions.csv`.
3. **Push rechazado (`fetch first`):** los runners hacen auto-commits; siempre `git fetch && git rebase origin/main` antes del push.
4. **Error IBKR 1001:** transitorio; `ibkr_sync.py` lo trata como no-accionable (exit 0). `1015`=token caducado; `1025`=lockout (parar ~20 min).
5. **`migrate_to_sqlite.py` borra la BD:** normal, la recrea cada vez.
6. **`cash_flows.amount_eur` ya viene firmado** (retiradas negativas). No volver a negar retiradas al calcular flujos.
7. **Geo de activo nuevo:** actualizar `TICKER_REGION` en `/api/dashboard` Y `/api/allocation`.

---

## 17. Cómo hacer cosas

**Añadir depósito IBKR:** normalmente lo recoge el sync solo (`ibkr_deposits.csv`). Si es MXN, además añadir a `DEPOSITOS` en `migrate_to_sqlite.py` con `fx_rate` (consultar `EURMXN=X` del día). Commit+push.

**Añadir activo nuevo:** comprarlo en el broker → el sync automático lo integra. Registrar el símbolo en el dict `SYMBOLS` de `migrate_to_sqlite.py` (yfinance_symbol, asset_type, currency, name). Si es USD no-norteamericano, actualizar `TICKER_REGION` (§7). Si su divisa no está en el mapa de `formatPriceOriginal`, añadir el símbolo.

**Actualización manual completa (fallback):** `python3 ibkr_sync.py && python3 normalizar_inversiones.py && python3 migrate_to_sqlite.py && python3 sync_to_turso.py`.

**Cripto:** BTC/ETH/SOL usan pares `-EUR` de Yahoo con `currency=EUR` (se compraron en EUR en Kraken).
