import streamlit as st
import pandas as pd
import yfinance as yf
from datetime import datetime
import plotly.express as px
import plotly.graph_objects as go
from scipy.optimize import brentq
import os

# ============== CONFIGURACION ==============
st.set_page_config(
    page_title="Portfolio Dashboard",
    page_icon="📊",
    layout="wide"
)

# ============== AUTENTICACION ==============
def check_password():
    """Verifica la contraseña antes de mostrar la app"""
    def password_entered():
        if st.session_state["password"] == st.secrets.get("password", "portfolio2024"):
            st.session_state["password_correct"] = True
            del st.session_state["password"]
        else:
            st.session_state["password_correct"] = False

    if "password_correct" not in st.session_state:
        st.title("🔐 Portfolio Dashboard")
        st.text_input("Contraseña", type="password", on_change=password_entered, key="password")
        st.info("Introduce la contraseña para acceder al dashboard")
        return False
    elif not st.session_state["password_correct"]:
        st.title("🔐 Portfolio Dashboard")
        st.text_input("Contraseña", type="password", on_change=password_entered, key="password")
        st.error("Contraseña incorrecta")
        return False
    return True

# ============== DATOS ==============
CSV_PATH = os.path.join(os.path.dirname(__file__), 'inversiones_unificadas.csv')

# Posiciones abiertas actuales (coste en moneda original para cálculo correcto de P&L)
POSICIONES = {
    # Kraken - Crypto (compradas en EUR)
    'BTC': {'broker': 'Kraken', 'tipo': 'Crypto', 'cantidad': 0.05678, 'coste': 1048.29, 'moneda': 'EUR', 'symbol': 'BTC-USD'},
    'ETH': {'broker': 'Kraken', 'tipo': 'Crypto', 'cantidad': 0.34793, 'coste': 700.75, 'moneda': 'EUR', 'symbol': 'ETH-USD'},
    'SOL': {'broker': 'Kraken', 'tipo': 'Crypto', 'cantidad': 2.13768, 'coste': 298.95, 'moneda': 'EUR', 'symbol': 'SOL-USD'},
    # Fintual - Stocks/ETFs (comprados en USD)
    'NU': {'broker': 'Fintual', 'tipo': 'Stock', 'cantidad': 91.449629, 'coste': 1050.00, 'moneda': 'USD', 'symbol': 'NU'},
    'AMZN': {'broker': 'Fintual', 'tipo': 'Stock', 'cantidad': 5.998302, 'coste': 1129.93, 'moneda': 'USD', 'symbol': 'AMZN'},
    'SPY': {'broker': 'Fintual', 'tipo': 'ETF', 'cantidad': 0.461054, 'coste': 250.00, 'moneda': 'USD', 'symbol': 'SPY'},
    'IEV': {'broker': 'Fintual', 'tipo': 'ETF', 'cantidad': 20.544768, 'coste': 1305.62, 'moneda': 'USD', 'symbol': 'IEV'},
    'ARGT': {'broker': 'Fintual', 'tipo': 'ETF', 'cantidad': 15.990136, 'coste': 1410.33, 'moneda': 'USD', 'symbol': 'ARGT'},
    'AAPL': {'broker': 'Fintual', 'tipo': 'Stock', 'cantidad': 4.564051, 'coste': 1241.65, 'moneda': 'USD', 'symbol': 'AAPL'},
    # IBKR
    'CSU': {'broker': 'IBKR', 'tipo': 'Stock', 'cantidad': 0.3543, 'coste': 967.78, 'moneda': 'CAD', 'symbol': 'CSU.TO'},
    'URA': {'broker': 'IBKR', 'tipo': 'ETF', 'cantidad': 10.0, 'coste': 552.10, 'moneda': 'USD', 'symbol': 'URA'},
}

# Historial de depósitos y retiradas (fecha, broker, cantidad, moneda, tipo)
DEPOSITOS = [
    # Degiro - Depósitos
    {'fecha': '2019-12-28', 'broker': 'Degiro', 'cantidad': 1.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2020-03-03', 'broker': 'Degiro', 'cantidad': 50.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2020-03-17', 'broker': 'Degiro', 'cantidad': 300.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2020-04-07', 'broker': 'Degiro', 'cantidad': 200.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2020-04-14', 'broker': 'Degiro', 'cantidad': 1173.54, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2020-05-13', 'broker': 'Degiro', 'cantidad': 150.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2020-06-02', 'broker': 'Degiro', 'cantidad': 200.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2020-06-30', 'broker': 'Degiro', 'cantidad': 200.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    # Degiro - Retirada
    {'fecha': '2025-12-20', 'broker': 'Degiro', 'cantidad': -3454.08, 'moneda': 'EUR', 'tipo': 'retirada'},
    # Trading212 - Depósitos
    {'fecha': '2022-01-23', 'broker': 'Trading212', 'cantidad': 300.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2022-02-23', 'broker': 'Trading212', 'cantidad': 200.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2022-02-25', 'broker': 'Trading212', 'cantidad': 250.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2022-04-01', 'broker': 'Trading212', 'cantidad': 250.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2022-04-28', 'broker': 'Trading212', 'cantidad': 100.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2022-05-28', 'broker': 'Trading212', 'cantidad': 100.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2022-06-14', 'broker': 'Trading212', 'cantidad': 1000.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2022-06-28', 'broker': 'Trading212', 'cantidad': 100.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2022-07-28', 'broker': 'Trading212', 'cantidad': 100.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2024-01-17', 'broker': 'Trading212', 'cantidad': 600.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    # Trading212 - Retiradas
    {'fecha': '2024-09-27', 'broker': 'Trading212', 'cantidad': -604.20, 'moneda': 'EUR', 'tipo': 'retirada'},
    {'fecha': '2024-09-27', 'broker': 'Trading212', 'cantidad': -2402.80, 'moneda': 'EUR', 'tipo': 'retirada'},
    {'fecha': '2024-10-04', 'broker': 'Trading212', 'cantidad': -925.00, 'moneda': 'EUR', 'tipo': 'retirada'},
    # Kraken - Depósitos
    {'fecha': '2020-05-19', 'broker': 'Kraken', 'cantidad': 248.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2021-03-02', 'broker': 'Kraken', 'cantidad': 500.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2021-12-03', 'broker': 'Kraken', 'cantidad': 200.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2022-01-25', 'broker': 'Kraken', 'cantidad': 600.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2022-06-20', 'broker': 'Kraken', 'cantidad': 500.00, 'moneda': 'EUR', 'tipo': 'deposito'},
    # Fintual - Depósitos
    {'fecha': '2025-03-10', 'broker': 'Fintual', 'cantidad': 1138.82, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2025-04-03', 'broker': 'Fintual', 'cantidad': 927.31, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2025-05-29', 'broker': 'Fintual', 'cantidad': 1207.52, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2025-10-24', 'broker': 'Fintual', 'cantidad': 1335.43, 'moneda': 'EUR', 'tipo': 'deposito'},
    {'fecha': '2025-12-15', 'broker': 'Fintual', 'cantidad': 1372.11, 'moneda': 'EUR', 'tipo': 'deposito'},
    # IBKR - Depósitos
    {'fecha': '2026-01-02', 'broker': 'IBKR', 'cantidad': 30000.00, 'moneda': 'MXN', 'tipo': 'deposito'},
    {'fecha': '2026-01-23', 'broker': 'IBKR', 'cantidad': 1000.00, 'moneda': 'EUR', 'tipo': 'deposito'},
]

# Flujos para TIR
FLUJOS_ABIERTOS = [
    ('2020-05-19', -248.00), ('2021-03-02', -500.00), ('2021-12-03', -200.00),
    ('2022-01-25', -600.00), ('2022-06-20', -500.00),
    ('2025-03-10', -1138.82), ('2025-04-03', -927.31), ('2025-05-29', -1207.52),
    ('2025-10-24', -1335.43), ('2025-12-15', -1372.11),
    ('2026-01-02', -1639.00), ('2026-01-23', -1000.00),
]

# ============== FUNCIONES AUXILIARES ==============
@st.cache_data
def cargar_datos():
    """Carga el CSV de inversiones"""
    df = pd.read_csv(CSV_PATH)
    df['fecha'] = pd.to_datetime(df['fecha'])
    df['año'] = df['fecha'].dt.year
    return df

@st.cache_data(ttl=300)
def obtener_precios():
    """Obtiene precios de Yahoo Finance y tipos de cambio"""
    symbols = list(set([p['symbol'] for p in POSICIONES.values()]))
    # Añadir tipos de cambio necesarios
    symbols.extend(['EURUSD=X', 'CADUSD=X'])

    precios = {}
    for symbol in symbols:
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period='1d')
            if not hist.empty:
                precios[symbol] = hist['Close'].iloc[-1]
        except:
            precios[symbol] = 0

    # Calcular tipo de cambio EUR/USD
    eur_usd = precios.get('EURUSD=X', 1.08)
    cad_usd = precios.get('CADUSD=X', 0.70)

    precios['EUR_USD'] = eur_usd
    precios['CAD_USD'] = cad_usd
    precios['CAD_EUR'] = cad_usd / eur_usd if eur_usd > 0 else 0.65

    return precios


def calcular_valor_posicion(ticker, info, precios):
    """
    Calcula el valor actual y P&L de una posición en su moneda original.
    Retorna: precio_actual, valor_actual, pnl, pnl_pct (todo en moneda original)
    """
    precio_usd = precios.get(info['symbol'], 0)
    eur_usd = precios.get('EUR_USD', 1.08)
    cad_usd = precios.get('CAD_USD', 0.70)

    moneda = info['moneda']
    coste = info['coste']
    cantidad = info['cantidad']

    # Convertir precio USD a la moneda original de la posición
    if moneda == 'USD':
        precio_actual = precio_usd
    elif moneda == 'EUR':
        precio_actual = precio_usd / eur_usd if eur_usd > 0 else 0
    elif moneda == 'CAD':
        precio_actual = precio_usd / cad_usd if cad_usd > 0 else 0
    else:
        precio_actual = precio_usd

    # Calcular valores en moneda original
    valor_actual = cantidad * precio_actual
    pnl = valor_actual - coste
    pnl_pct = (pnl / coste * 100) if coste > 0 else 0

    return {
        'precio': precio_actual,
        'valor': valor_actual,
        'pnl': pnl,
        'pnl_pct': pnl_pct,
        'moneda': moneda
    }


def convertir_a_eur(valor, moneda, precios):
    """Convierte un valor a EUR usando tipos de cambio actuales"""
    eur_usd = precios.get('EUR_USD', 1.08)
    cad_eur = precios.get('CAD_EUR', 0.65)

    if moneda == 'EUR':
        return valor
    elif moneda == 'USD':
        return valor / eur_usd if eur_usd > 0 else valor
    elif moneda == 'CAD':
        return valor * cad_eur
    elif moneda == 'MXN':
        return valor / 18.0  # Aproximado
    return valor

@st.cache_data(ttl=3600)
def obtener_ytd_benchmark():
    """Obtiene datos YTD del S&P500"""
    try:
        spy = yf.Ticker('SPY')
        inicio_año = f"{datetime.now().year}-01-01"
        hist = spy.history(start=inicio_año)
        if not hist.empty:
            precio_inicio = hist['Close'].iloc[0]
            hist['return_pct'] = (hist['Close'] / precio_inicio - 1) * 100
            return hist[['Close', 'return_pct']]
    except:
        pass
    return pd.DataFrame()

def calcular_xirr(flujos, valor_final):
    """Calcula la TIR (XIRR)"""
    if not flujos:
        return 0

    fechas = [datetime.strptime(f[0], '%Y-%m-%d') if isinstance(f[0], str) else f[0] for f in flujos]
    valores = [f[1] for f in flujos]
    fechas.append(datetime.now())
    valores.append(valor_final)

    fecha_base = fechas[0]
    dias = [(f - fecha_base).days / 365.0 for f in fechas]

    def npv(rate):
        return sum(v / (1 + rate) ** d for v, d in zip(valores, dias))

    try:
        return brentq(npv, -0.99, 10.0)
    except:
        return 0

def calcular_metricas_globales(df, precios):
    """Calcula todas las métricas globales del portfolio"""

    # Calcular valor y coste de posiciones abiertas (todo convertido a EUR)
    valor_abiertas_eur = 0
    coste_abiertas_eur = 0
    unrealized_pnl_eur = 0

    for ticker, info in POSICIONES.items():
        pos = calcular_valor_posicion(ticker, info, precios)

        # Convertir a EUR para consolidación
        valor_eur = convertir_a_eur(pos['valor'], pos['moneda'], precios)
        coste_eur = convertir_a_eur(info['coste'], info['moneda'], precios)
        pnl_eur = convertir_a_eur(pos['pnl'], pos['moneda'], precios)

        valor_abiertas_eur += valor_eur
        coste_abiertas_eur += coste_eur
        unrealized_pnl_eur += pnl_eur

    # Operaciones cerradas (ventas) - ya están en EUR en el CSV
    ventas = df[df['tipo_operacion'] == 'SELL']['importe_neto_eur'].sum()
    dividendos = df[df['tipo_operacion'] == 'DIVIDEND']['importe_neto_eur'].sum()
    compras = abs(df[df['tipo_operacion'] == 'BUY']['importe_neto_eur'].sum())

    # Métricas
    total_invertido = compras
    desinversiones = ventas + dividendos
    valor_actual = desinversiones + valor_abiertas_eur
    realized_pnl = desinversiones - (compras - coste_abiertas_eur)
    tir = calcular_xirr(FLUJOS_ABIERTOS, valor_abiertas_eur)

    return {
        'total_invertido': total_invertido,
        'desinversiones': desinversiones,
        'valor_abiertas': valor_abiertas_eur,
        'valor_actual': valor_actual,
        'ventas_totales': ventas,
        'dividendos': dividendos,
        'realized_pnl': realized_pnl,
        'unrealized_pnl': unrealized_pnl_eur,
        'coste_abiertas': coste_abiertas_eur,
        'tir': tir
    }

# ============== TAB 1: RESUMEN ==============
def tab_resumen():
    """Dashboard principal con métricas clave"""

    with st.spinner('Cargando datos...'):
        df = cargar_datos()
        precios = obtener_precios()
        m = calcular_metricas_globales(df, precios)

    # Métricas principales - Fila 1
    st.markdown("### Métricas Principales")

    col1, col2, col3, col4 = st.columns(4)

    col1.metric("Total Invertido", f"€{m['total_invertido']:,.0f}")
    col2.metric("Desinversiones", f"€{m['desinversiones']:,.0f}")
    col3.metric("Open Positions", f"€{m['valor_abiertas']:,.0f}")
    col4.metric(
        "Desinv. + Open",
        f"€{m['valor_actual']:,.0f}",
        f"{((m['valor_actual']/m['total_invertido'])-1)*100:+.1f}%" if m['total_invertido'] > 0 else ""
    )

    # Métricas principales - Fila 2
    col5, col6, col7 = st.columns(3)

    col5.metric("Realized P&L", f"€{m['realized_pnl']:+,.0f}")
    col6.metric(
        "Unrealized P&L",
        f"€{m['unrealized_pnl']:+,.0f}",
        f"{(m['unrealized_pnl']/m['coste_abiertas'])*100:+.1f}%" if m['coste_abiertas'] > 0 else ""
    )
    col7.metric("TIR", f"{m['tir']*100:+.1f}%")

    st.markdown("---")

    # Resumen por broker
    st.markdown("### Por Broker")

    broker_data = []
    for ticker, info in POSICIONES.items():
        pos = calcular_valor_posicion(ticker, info, precios)
        valor_eur = convertir_a_eur(pos['valor'], pos['moneda'], precios)
        coste_eur = convertir_a_eur(info['coste'], info['moneda'], precios)

        broker_data.append({
            'broker': info['broker'],
            'coste': coste_eur,
            'valor': valor_eur
        })

    df_broker = pd.DataFrame(broker_data).groupby('broker').sum().reset_index()
    df_broker['pnl'] = df_broker['valor'] - df_broker['coste']
    df_broker['pnl_pct'] = (df_broker['pnl'] / df_broker['coste'] * 100)

    cols = st.columns(len(df_broker))
    for i, row in df_broker.iterrows():
        with cols[i]:
            st.markdown(f"**{row['broker']}**")
            st.metric(
                "Valor",
                f"€{row['valor']:,.0f}",
                f"{row['pnl_pct']:+.1f}%"
            )

    st.markdown("---")

    # Distribución visual
    col1, col2 = st.columns(2)

    with col1:
        st.markdown("### Distribución por Tipo")
        tipo_data = []
        for ticker, info in POSICIONES.items():
            pos = calcular_valor_posicion(ticker, info, precios)
            valor_eur = convertir_a_eur(pos['valor'], pos['moneda'], precios)
            tipo_data.append({
                'tipo': info['tipo'],
                'valor': valor_eur
            })
        df_tipo = pd.DataFrame(tipo_data).groupby('tipo')['valor'].sum().reset_index()

        fig = px.pie(df_tipo, values='valor', names='tipo',
                     color_discrete_sequence=px.colors.qualitative.Set2)
        fig.update_traces(textposition='inside', textinfo='percent+label',
                         hovertemplate='<b>%{label}</b><br>€%{value:,.0f}<extra></extra>')
        fig.update_layout(showlegend=False, margin=dict(t=0, b=0, l=0, r=0))
        st.plotly_chart(fig, use_container_width=True)

    with col2:
        st.markdown("### Distribución por Broker")
        fig = px.pie(df_broker, values='valor', names='broker',
                     color_discrete_sequence=px.colors.qualitative.Pastel)
        fig.update_traces(textposition='inside', textinfo='percent+label',
                         hovertemplate='<b>%{label}</b><br>€%{value:,.0f}<extra></extra>')
        fig.update_layout(showlegend=False, margin=dict(t=0, b=0, l=0, r=0))
        st.plotly_chart(fig, use_container_width=True)

# ============== TAB 2: YTD ==============
def tab_ytd():
    """Performance del año actual vs benchmark"""

    año_actual = datetime.now().year
    st.markdown(f"### Performance {año_actual}")

    # Obtener datos del benchmark
    spy_data = obtener_ytd_benchmark()

    if spy_data.empty:
        st.warning("No se pudieron obtener datos del benchmark")
        return

    # Calcular mi rentabilidad YTD (simplificado)
    df = cargar_datos()
    precios = obtener_precios()
    m = calcular_metricas_globales(df, precios)

    # Depósitos YTD (solo depósitos, no retiradas)
    depositos_ytd = sum(d['cantidad'] for d in DEPOSITOS
                        if d['fecha'].startswith(str(año_actual)) and d['moneda'] == 'EUR' and d['tipo'] == 'deposito')
    depositos_ytd += sum(d['cantidad'] / 18.0 for d in DEPOSITOS  # MXN a EUR aprox
                         if d['fecha'].startswith(str(año_actual)) and d['moneda'] == 'MXN' and d['tipo'] == 'deposito')

    col1, col2 = st.columns(2)

    with col1:
        st.markdown("#### Mi Portfolio YTD")

        # Métricas YTD
        mi_return_ytd = (m['unrealized_pnl'] / m['coste_abiertas'] * 100) if m['coste_abiertas'] > 0 else 0

        st.metric("Invertido este año", f"€{depositos_ytd:,.0f}")
        st.metric("Rentabilidad YTD (pos. abiertas)", f"{mi_return_ytd:+.1f}%")

    with col2:
        st.markdown("#### S&P 500 YTD")

        spy_return = spy_data['return_pct'].iloc[-1] if not spy_data.empty else 0
        st.metric("Rentabilidad S&P 500", f"{spy_return:+.1f}%")

        diff = mi_return_ytd - spy_return
        if diff > 0:
            st.success(f"Superando al mercado por {diff:+.1f}%")
        else:
            st.error(f"Por debajo del mercado por {diff:.1f}%")

    st.markdown("---")

    # Gráfico comparativo
    st.markdown("### Evolución S&P 500 YTD")

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=spy_data.index,
        y=spy_data['return_pct'],
        mode='lines',
        name='S&P 500',
        line=dict(color='#636EFA', width=2),
        hovertemplate='%{x}<br>Return: %{y:.1f}%<extra></extra>'
    ))
    fig.add_hline(y=0, line_dash="dash", line_color="gray")
    fig.update_layout(
        xaxis_title="",
        yaxis_title="Rentabilidad (%)",
        hovermode='x unified',
        height=400
    )
    st.plotly_chart(fig, use_container_width=True)

# ============== TAB 3: LIBRO MAYOR ==============
def tab_libro_mayor():
    """Tabla de todas las operaciones con filtros"""

    df = cargar_datos()
    precios = obtener_precios()
    eur_usd = precios.get('EURUSD=X', 1.08)

    # Filtros en columnas
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        brokers = ['Todos'] + sorted(df['broker'].unique().tolist())
        broker_sel = st.selectbox("Broker", brokers)

    with col2:
        tipos = ['Todos'] + sorted(df['tipo_activo'].unique().tolist())
        tipo_sel = st.selectbox("Tipo", tipos)

    with col3:
        estados = ['Todos', 'BUY', 'SELL', 'DIVIDEND']
        estado_sel = st.selectbox("Operación", estados)

    with col4:
        ticker_buscar = st.text_input("🔍 Buscar ticker", "").upper()

    # Aplicar filtros
    df_filtrado = df.copy()
    if broker_sel != 'Todos':
        df_filtrado = df_filtrado[df_filtrado['broker'] == broker_sel]
    if tipo_sel != 'Todos':
        df_filtrado = df_filtrado[df_filtrado['tipo_activo'] == tipo_sel]
    if estado_sel != 'Todos':
        df_filtrado = df_filtrado[df_filtrado['tipo_operacion'] == estado_sel]
    if ticker_buscar:
        df_filtrado = df_filtrado[df_filtrado['ticker'].str.contains(ticker_buscar, na=False)]

    st.markdown("---")

    # Preparar tabla
    df_tabla = df_filtrado[['fecha', 'broker', 'tipo_operacion', 'tipo_activo', 'ticker',
                            'cantidad', 'importe_neto_eur']].copy()
    df_tabla['fecha'] = df_tabla['fecha'].dt.strftime('%Y-%m-%d')
    df_tabla = df_tabla.sort_values('fecha', ascending=False)
    df_tabla.columns = ['Fecha', 'Broker', 'Operación', 'Tipo', 'Ticker', 'Cantidad', 'Importe €']

    # Formatear
    df_display = df_tabla.copy()
    df_display['Cantidad'] = df_display['Cantidad'].apply(lambda x: f"{x:,.4f}" if abs(x) < 1 else f"{x:,.2f}")
    df_display['Importe €'] = df_display['Importe €'].apply(lambda x: f"€{x:+,.2f}")

    # Mostrar tabla con ordenamiento
    st.dataframe(
        df_display,
        use_container_width=True,
        hide_index=True,
        height=500
    )

    # Resumen
    st.markdown("---")
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Operaciones", len(df_filtrado))
    col2.metric("Compras", f"€{abs(df_filtrado[df_filtrado['tipo_operacion']=='BUY']['importe_neto_eur'].sum()):,.0f}")
    col3.metric("Ventas", f"€{df_filtrado[df_filtrado['tipo_operacion']=='SELL']['importe_neto_eur'].sum():,.0f}")
    col4.metric("Dividendos", f"€{df_filtrado[df_filtrado['tipo_operacion']=='DIVIDEND']['importe_neto_eur'].sum():,.0f}")

    # Descargar
    csv = df_filtrado.to_csv(index=False)
    st.download_button("📥 Descargar CSV", csv, "operaciones.csv", "text/csv")

# ============== TAB 4: POSICIONES ABIERTAS ==============
def tab_posiciones():
    """Posiciones abiertas con precios en tiempo real"""

    with st.spinner('Obteniendo precios...'):
        precios = obtener_precios()

    eur_usd = precios.get('EUR_USD', 1.08)
    cad_eur = precios.get('CAD_EUR', 0.65)

    # Calcular valores usando nueva estructura (coste en moneda original)
    datos = []
    for ticker, info in POSICIONES.items():
        # Usar helper que calcula P&L en moneda original
        pos = calcular_valor_posicion(ticker, info, precios)

        # Convertir a EUR para mostrar
        coste_eur = convertir_a_eur(info['coste'], info['moneda'], precios)
        valor_eur = convertir_a_eur(pos['valor'], pos['moneda'], precios)
        pnl_eur = convertir_a_eur(pos['pnl'], pos['moneda'], precios)

        datos.append({
            'Ticker': ticker,
            'Broker': info['broker'],
            'Tipo': info['tipo'],
            'Moneda': info['moneda'],
            'Cantidad': info['cantidad'],
            'Coste': info['coste'],
            'Coste €': coste_eur,
            'Valor €': valor_eur,
            'P&L €': pnl_eur,
            'P&L %': pos['pnl_pct']  # % calculado en moneda original (correcto)
        })

    df = pd.DataFrame(datos)

    # Métricas
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Coste Total", f"€{df['Coste €'].sum():,.0f}")
    col2.metric("Valor Actual", f"€{df['Valor €'].sum():,.0f}")
    col3.metric("P&L Total", f"€{df['P&L €'].sum():+,.0f}")
    col4.metric("Rentabilidad", f"{(df['P&L €'].sum()/df['Coste €'].sum()*100):+.1f}%")

    st.markdown("---")

    # Gráfico de barras P&L (% en moneda original - correcto)
    st.markdown("### Rentabilidad por Posición")
    df_sorted = df.sort_values('P&L %', ascending=True)
    colors = ['#2ecc71' if x >= 0 else '#e74c3c' for x in df_sorted['P&L %']]

    fig = go.Figure(go.Bar(
        x=df_sorted['P&L %'],
        y=df_sorted['Ticker'],
        orientation='h',
        marker_color=colors,
        text=[f"{x:+.1f}%" for x in df_sorted['P&L %']],
        textposition='outside',
        hovertemplate='<b>%{y}</b><br>P&L: %{x:+.1f}%<extra></extra>'
    ))
    fig.update_layout(height=400, xaxis_title="P&L (%)", yaxis_title="")
    st.plotly_chart(fig, use_container_width=True)

    # Tabla
    st.markdown("### Detalle")
    df_display = df[['Ticker', 'Broker', 'Tipo', 'Moneda', 'Cantidad', 'Coste', 'Coste €', 'Valor €', 'P&L €', 'P&L %']].copy()
    df_display['Cantidad'] = df_display['Cantidad'].apply(lambda x: f"{x:,.6f}" if x < 1 else f"{x:,.2f}")
    df_display['Coste'] = df_display.apply(lambda r: f"{r['Coste']:,.2f} {df.loc[df['Ticker']==r['Ticker'], 'Moneda'].iloc[0]}", axis=1)
    for col in ['Coste €', 'Valor €']:
        df_display[col] = df_display[col].apply(lambda x: f"€{x:,.2f}")
    df_display['P&L €'] = df_display['P&L €'].apply(lambda x: f"€{x:+,.2f}")
    df_display['P&L %'] = df_display['P&L %'].apply(lambda x: f"{x:+.1f}%")
    df_display = df_display.drop(columns=['Moneda'])

    st.dataframe(df_display, use_container_width=True, hide_index=True)

    st.caption(f"EUR/USD: {eur_usd:.4f} | CAD/EUR: {cad_eur:.4f} | Última actualización: {datetime.now().strftime('%H:%M:%S')}")

# ============== TAB 5: DEPOSITOS ==============
def tab_depositos():
    """Timeline vertical de depósitos y retiradas"""

    df_dep = pd.DataFrame(DEPOSITOS)
    df_dep['fecha'] = pd.to_datetime(df_dep['fecha'])
    df_dep = df_dep.sort_values('fecha', ascending=False)

    # Convertir MXN a EUR aproximado para totales
    df_dep['cantidad_eur'] = df_dep.apply(
        lambda r: r['cantidad'] if r['moneda'] == 'EUR' else r['cantidad'] / 18.0,  # MXN aprox
        axis=1
    )

    # Separar depósitos y retiradas
    depositos = df_dep[df_dep['tipo'] == 'deposito']
    retiradas = df_dep[df_dep['tipo'] == 'retirada']

    total_depositos = depositos['cantidad_eur'].sum()
    total_retiradas = abs(retiradas['cantidad_eur'].sum())
    flujo_neto = total_depositos - total_retiradas

    # Métricas
    col1, col2, col3 = st.columns(3)
    col1.metric("Total Depósitos", f"€{total_depositos:,.0f}")
    col2.metric("Total Retiradas", f"€{total_retiradas:,.0f}")
    col3.metric("Flujo Neto", f"€{flujo_neto:,.0f}")

    st.markdown("---")
    st.markdown("### Timeline de Movimientos")

    # Emoji por broker
    broker_emoji = {'Kraken': '🔵', 'Fintual': '🔴', 'IBKR': '🟢', 'Degiro': '🟠', 'Trading212': '🟣'}

    # Timeline vertical
    for i, row in df_dep.iterrows():
        emoji = broker_emoji.get(row['broker'], '⚪')
        es_retirada = row['tipo'] == 'retirada'

        # Formatear cantidad
        if row['moneda'] == 'EUR':
            cantidad_str = f"€{abs(row['cantidad']):,.0f}"
        else:
            cantidad_str = f"${row['cantidad']:,.0f} MXN"

        # Color según tipo
        color = '#e74c3c' if es_retirada else '#2ecc71'
        signo = '-' if es_retirada else '+'
        tipo_label = 'Retirada' if es_retirada else 'Depósito'

        fecha_str = row['fecha'].strftime('%d %b %Y')

        st.markdown(f"""
        <div style="display: flex; align-items: center; padding: 10px 0; border-left: 3px solid {color}; margin-left: 20px; padding-left: 20px;">
            <div style="position: absolute; left: 10px; font-size: 20px;">{emoji}</div>
            <div>
                <strong>{fecha_str}</strong> — {row['broker']} ({tipo_label})<br>
                <span style="font-size: 1.2em; color: {color};">{signo}{cantidad_str}</span>
            </div>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("---")

    # Gráfico acumulado (flujo neto)
    st.markdown("### Flujo Neto Acumulado")
    df_sorted = df_dep.sort_values('fecha').copy()
    df_sorted['acumulado'] = df_sorted['cantidad_eur'].cumsum()

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=df_sorted['fecha'],
        y=df_sorted['acumulado'],
        mode='lines+markers',
        line=dict(color='#3498db', width=3),
        marker=dict(size=8),
        hovertemplate='%{x}<br>Acumulado: €%{y:,.0f}<extra></extra>'
    ))
    fig.add_hline(y=0, line_dash="dash", line_color="gray")
    fig.update_layout(
        xaxis_title="",
        yaxis_title="Flujo Neto (€)",
        height=300
    )
    st.plotly_chart(fig, use_container_width=True)

    # Tabla resumen por broker
    st.markdown("### Por Broker")
    resumen_dep = depositos.groupby('broker')['cantidad_eur'].sum().reset_index()
    resumen_dep.columns = ['Broker', 'Depósitos']
    resumen_ret = retiradas.groupby('broker')['cantidad_eur'].sum().abs().reset_index()
    resumen_ret.columns = ['Broker', 'Retiradas']

    resumen = resumen_dep.merge(resumen_ret, on='Broker', how='outer').fillna(0)
    resumen['Neto'] = resumen['Depósitos'] - resumen['Retiradas']
    resumen['Depósitos'] = resumen['Depósitos'].apply(lambda x: f"€{x:,.0f}")
    resumen['Retiradas'] = resumen['Retiradas'].apply(lambda x: f"€{x:,.0f}")
    resumen['Neto'] = resumen['Neto'].apply(lambda x: f"€{x:,.0f}")
    st.dataframe(resumen, use_container_width=True, hide_index=True)

# ============== MAIN ==============
def main():
    if not check_password():
        return

    st.title("📊 Portfolio Dashboard")

    tab1, tab2, tab3, tab4, tab5 = st.tabs([
        "📊 Resumen",
        "📈 YTD",
        "📖 Libro Mayor",
        "💼 Posiciones",
        "💰 Depósitos"
    ])

    with tab1:
        tab_resumen()

    with tab2:
        tab_ytd()

    with tab3:
        tab_libro_mayor()

    with tab4:
        tab_posiciones()

    with tab5:
        tab_depositos()

if __name__ == "__main__":
    main()
