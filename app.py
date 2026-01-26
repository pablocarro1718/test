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

# Posiciones abiertas actuales
POSICIONES = {
    'BTC': {'broker': 'Kraken', 'tipo': 'Crypto', 'cantidad': 0.05678, 'coste_eur': 1048.29, 'symbol': 'BTC-USD'},
    'ETH': {'broker': 'Kraken', 'tipo': 'Crypto', 'cantidad': 0.34793, 'coste_eur': 700.75, 'symbol': 'ETH-USD'},
    'SOL': {'broker': 'Kraken', 'tipo': 'Crypto', 'cantidad': 2.13768, 'coste_eur': 298.95, 'symbol': 'SOL-USD'},
    'NU': {'broker': 'Fintual', 'tipo': 'Stock', 'cantidad': 91.449629, 'coste_eur': 1009.61, 'symbol': 'NU'},
    'AMZN': {'broker': 'Fintual', 'tipo': 'Stock', 'cantidad': 5.998302, 'coste_eur': 1086.47, 'symbol': 'AMZN'},
    'SPY': {'broker': 'Fintual', 'tipo': 'ETF', 'cantidad': 0.461054, 'coste_eur': 240.38, 'symbol': 'SPY'},
    'IEV': {'broker': 'Fintual', 'tipo': 'ETF', 'cantidad': 20.544768, 'coste_eur': 1255.40, 'symbol': 'IEV'},
    'ARGT': {'broker': 'Fintual', 'tipo': 'ETF', 'cantidad': 15.990136, 'coste_eur': 1356.09, 'symbol': 'ARGT'},
    'AAPL': {'broker': 'Fintual', 'tipo': 'Stock', 'cantidad': 4.564051, 'coste_eur': 1061.24, 'symbol': 'AAPL'},
    'CSU': {'broker': 'IBKR', 'tipo': 'Stock', 'cantidad': 0.3543, 'coste_eur': 596.00, 'symbol': 'CSU.TO'},
    'URA': {'broker': 'IBKR', 'tipo': 'ETF', 'cantidad': 10.0, 'coste_eur': 530.87, 'symbol': 'URA'},
}

# Historial de depósitos (fecha, broker, cantidad, moneda)
DEPOSITOS = [
    {'fecha': '2020-05-19', 'broker': 'Kraken', 'cantidad': 248.00, 'moneda': 'EUR'},
    {'fecha': '2021-03-02', 'broker': 'Kraken', 'cantidad': 500.00, 'moneda': 'EUR'},
    {'fecha': '2021-12-03', 'broker': 'Kraken', 'cantidad': 200.00, 'moneda': 'EUR'},
    {'fecha': '2022-01-25', 'broker': 'Kraken', 'cantidad': 600.00, 'moneda': 'EUR'},
    {'fecha': '2022-06-20', 'broker': 'Kraken', 'cantidad': 500.00, 'moneda': 'EUR'},
    {'fecha': '2025-03-10', 'broker': 'Fintual', 'cantidad': 1138.82, 'moneda': 'EUR'},
    {'fecha': '2025-04-03', 'broker': 'Fintual', 'cantidad': 927.31, 'moneda': 'EUR'},
    {'fecha': '2025-05-29', 'broker': 'Fintual', 'cantidad': 1207.52, 'moneda': 'EUR'},
    {'fecha': '2025-10-24', 'broker': 'Fintual', 'cantidad': 1335.43, 'moneda': 'EUR'},
    {'fecha': '2025-12-15', 'broker': 'Fintual', 'cantidad': 1372.11, 'moneda': 'EUR'},
    {'fecha': '2026-01-02', 'broker': 'IBKR', 'cantidad': 30000.00, 'moneda': 'MXN'},
    {'fecha': '2026-01-23', 'broker': 'IBKR', 'cantidad': 1000.00, 'moneda': 'EUR'},
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
    """Obtiene precios de Yahoo Finance"""
    symbols = list(set([p['symbol'] for p in POSICIONES.values()]))
    symbols.extend(['EURUSD=X', 'SPY', 'CADEUR=X'])

    precios = {}
    for symbol in symbols:
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period='1d')
            if not hist.empty:
                precios[symbol] = hist['Close'].iloc[-1]
        except:
            precios[symbol] = 0
    return precios

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

def calcular_metricas_globales(df, precios, eur_usd):
    """Calcula todas las métricas globales del portfolio"""

    # Valor posiciones abiertas
    valor_abiertas = 0
    coste_abiertas = 0
    for ticker, info in POSICIONES.items():
        precio_usd = precios.get(info['symbol'], 0)
        if info['symbol'] == 'CSU.TO':
            cad_eur = precios.get('CADEUR=X', 0.68)
            precio_eur = precio_usd * cad_eur
        else:
            precio_eur = precio_usd / eur_usd if eur_usd > 0 else 0
        valor_abiertas += info['cantidad'] * precio_eur
        coste_abiertas += info['coste_eur']

    # Operaciones cerradas (ventas)
    ventas = df[df['tipo_operacion'] == 'SELL']['importe_neto_eur'].sum()
    dividendos = df[df['tipo_operacion'] == 'DIVIDEND']['importe_neto_eur'].sum()
    compras = abs(df[df['tipo_operacion'] == 'BUY']['importe_neto_eur'].sum())

    # Métricas
    total_invertido = compras
    valor_actual = ventas + dividendos + valor_abiertas
    realized_pnl = ventas + dividendos - (compras - coste_abiertas)
    unrealized_pnl = valor_abiertas - coste_abiertas
    tir = calcular_xirr(FLUJOS_ABIERTOS, valor_abiertas)

    return {
        'total_invertido': total_invertido,
        'valor_actual': valor_actual,
        'ventas_totales': ventas,
        'dividendos': dividendos,
        'realized_pnl': realized_pnl,
        'unrealized_pnl': unrealized_pnl,
        'valor_abiertas': valor_abiertas,
        'coste_abiertas': coste_abiertas,
        'tir': tir
    }

# ============== TAB 1: RESUMEN ==============
def tab_resumen():
    """Dashboard principal con métricas clave"""

    with st.spinner('Cargando datos...'):
        df = cargar_datos()
        precios = obtener_precios()
        eur_usd = precios.get('EURUSD=X', 1.08)
        m = calcular_metricas_globales(df, precios, eur_usd)

    # Métricas principales en una fila
    st.markdown("### Métricas Principales")

    col1, col2, col3, col4, col5 = st.columns(5)

    col1.metric(
        "Total Invertido",
        f"€{m['total_invertido']:,.0f}"
    )
    col2.metric(
        "Valor Actual",
        f"€{m['valor_actual']:,.0f}",
        f"{((m['valor_actual']/m['total_invertido'])-1)*100:+.1f}%" if m['total_invertido'] > 0 else ""
    )
    col3.metric(
        "Realized P&L",
        f"€{m['realized_pnl']:+,.0f}"
    )
    col4.metric(
        "Unrealized P&L",
        f"€{m['unrealized_pnl']:+,.0f}",
        f"{(m['unrealized_pnl']/m['coste_abiertas'])*100:+.1f}%" if m['coste_abiertas'] > 0 else ""
    )
    col5.metric(
        "TIR",
        f"{m['tir']*100:+.1f}%"
    )

    st.markdown("---")

    # Resumen por broker
    st.markdown("### Por Broker")

    broker_data = []
    for ticker, info in POSICIONES.items():
        precio_usd = precios.get(info['symbol'], 0)
        if info['symbol'] == 'CSU.TO':
            cad_eur = precios.get('CADEUR=X', 0.68)
            precio_eur = precio_usd * cad_eur
        else:
            precio_eur = precio_usd / eur_usd if eur_usd > 0 else 0
        valor = info['cantidad'] * precio_eur
        broker_data.append({
            'broker': info['broker'],
            'coste': info['coste_eur'],
            'valor': valor
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
            precio_usd = precios.get(info['symbol'], 0)
            if info['symbol'] == 'CSU.TO':
                cad_eur = precios.get('CADEUR=X', 0.68)
                precio_eur = precio_usd * cad_eur
            else:
                precio_eur = precio_usd / eur_usd if eur_usd > 0 else 0
            tipo_data.append({
                'tipo': info['tipo'],
                'valor': info['cantidad'] * precio_eur
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
    eur_usd = precios.get('EURUSD=X', 1.08)
    m = calcular_metricas_globales(df, precios, eur_usd)

    # Depósitos YTD
    depositos_ytd = sum(d['cantidad'] for d in DEPOSITOS
                        if d['fecha'].startswith(str(año_actual)) and d['moneda'] == 'EUR')
    depositos_ytd += sum(d['cantidad'] / 18.0 for d in DEPOSITOS  # MXN a EUR aprox
                         if d['fecha'].startswith(str(año_actual)) and d['moneda'] == 'MXN')

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

    eur_usd = precios.get('EURUSD=X', 1.08)
    cad_eur = precios.get('CADEUR=X', 0.68)

    # Calcular valores
    datos = []
    for ticker, info in POSICIONES.items():
        precio_usd = precios.get(info['symbol'], 0)
        if info['symbol'] == 'CSU.TO':
            precio_eur = precio_usd * cad_eur
        else:
            precio_eur = precio_usd / eur_usd if eur_usd > 0 else 0

        valor = info['cantidad'] * precio_eur
        pnl = valor - info['coste_eur']
        pnl_pct = (pnl / info['coste_eur'] * 100) if info['coste_eur'] > 0 else 0

        datos.append({
            'Ticker': ticker,
            'Broker': info['broker'],
            'Tipo': info['tipo'],
            'Cantidad': info['cantidad'],
            'Coste €': info['coste_eur'],
            'Precio €': precio_eur,
            'Valor €': valor,
            'P&L €': pnl,
            'P&L %': pnl_pct
        })

    df = pd.DataFrame(datos)

    # Métricas
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Coste Total", f"€{df['Coste €'].sum():,.0f}")
    col2.metric("Valor Actual", f"€{df['Valor €'].sum():,.0f}")
    col3.metric("P&L Total", f"€{df['P&L €'].sum():+,.0f}")
    col4.metric("Rentabilidad", f"{(df['P&L €'].sum()/df['Coste €'].sum()*100):+.1f}%")

    st.markdown("---")

    # Gráfico de barras P&L
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
    df_display = df.copy()
    df_display['Cantidad'] = df_display['Cantidad'].apply(lambda x: f"{x:,.6f}" if x < 1 else f"{x:,.2f}")
    for col in ['Coste €', 'Precio €', 'Valor €']:
        df_display[col] = df_display[col].apply(lambda x: f"€{x:,.2f}")
    df_display['P&L €'] = df_display['P&L €'].apply(lambda x: f"€{x:+,.2f}")
    df_display['P&L %'] = df_display['P&L %'].apply(lambda x: f"{x:+.1f}%")

    st.dataframe(df_display, use_container_width=True, hide_index=True)

    st.caption(f"EUR/USD: {eur_usd:.4f} | CAD/EUR: {cad_eur:.4f} | Última actualización: {datetime.now().strftime('%H:%M:%S')}")

# ============== TAB 5: DEPOSITOS ==============
def tab_depositos():
    """Timeline vertical de depósitos"""

    df_dep = pd.DataFrame(DEPOSITOS)
    df_dep['fecha'] = pd.to_datetime(df_dep['fecha'])
    df_dep = df_dep.sort_values('fecha', ascending=False)

    # Convertir MXN a EUR aproximado para totales
    df_dep['cantidad_eur'] = df_dep.apply(
        lambda r: r['cantidad'] if r['moneda'] == 'EUR' else r['cantidad'] / 18.0,  # MXN aprox
        axis=1
    )

    # Métricas
    total_eur = df_dep[df_dep['moneda'] == 'EUR']['cantidad'].sum()
    total_mxn = df_dep[df_dep['moneda'] == 'MXN']['cantidad'].sum()
    total_equiv = df_dep['cantidad_eur'].sum()

    col1, col2, col3 = st.columns(3)
    col1.metric("Total EUR", f"€{total_eur:,.0f}")
    col2.metric("Total MXN", f"${total_mxn:,.0f}")
    col3.metric("Total (equiv. EUR)", f"€{total_equiv:,.0f}")

    st.markdown("---")
    st.markdown("### Timeline de Depósitos")

    # Timeline vertical usando markdown y contenedores
    for i, row in df_dep.iterrows():
        año = row['fecha'].year

        # Color por broker
        color_map = {'Kraken': '🔵', 'Fintual': '🔴', 'IBKR': '🟢'}
        emoji = color_map.get(row['broker'], '⚪')

        # Formatear cantidad
        if row['moneda'] == 'EUR':
            cantidad_str = f"€{row['cantidad']:,.0f}"
        else:
            cantidad_str = f"${row['cantidad']:,.0f} MXN"

        fecha_str = row['fecha'].strftime('%d %b %Y')

        st.markdown(f"""
        <div style="display: flex; align-items: center; padding: 10px 0; border-left: 3px solid #ddd; margin-left: 20px; padding-left: 20px;">
            <div style="position: absolute; left: 10px; font-size: 20px;">{emoji}</div>
            <div>
                <strong>{fecha_str}</strong> — {row['broker']}<br>
                <span style="font-size: 1.2em; color: #2ecc71;">{cantidad_str}</span>
            </div>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("---")

    # Gráfico acumulado
    st.markdown("### Depósitos Acumulados")
    df_dep_sorted = df_dep.sort_values('fecha')
    df_dep_sorted['acumulado'] = df_dep_sorted['cantidad_eur'].cumsum()

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=df_dep_sorted['fecha'],
        y=df_dep_sorted['acumulado'],
        mode='lines+markers',
        line=dict(color='#2ecc71', width=3),
        marker=dict(size=10),
        hovertemplate='%{x}<br>Acumulado: €%{y:,.0f}<extra></extra>'
    ))
    fig.update_layout(
        xaxis_title="",
        yaxis_title="Total Depositado (€)",
        height=300
    )
    st.plotly_chart(fig, use_container_width=True)

    # Tabla resumen por broker
    st.markdown("### Por Broker")
    resumen = df_dep.groupby('broker')['cantidad_eur'].sum().reset_index()
    resumen.columns = ['Broker', 'Total €']
    resumen['Total €'] = resumen['Total €'].apply(lambda x: f"€{x:,.0f}")
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
