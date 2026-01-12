import streamlit as st
import pandas as pd
import yfinance as yf
from datetime import datetime
import plotly.express as px
import plotly.graph_objects as go
from scipy.optimize import brentq
import os

# Configuracion de pagina
st.set_page_config(
    page_title="Portfolio Dashboard",
    page_icon="📈",
    layout="wide"
)

# Ruta al archivo CSV
CSV_PATH = os.path.join(os.path.dirname(__file__), 'inversiones_unificadas.csv')

# Datos de posiciones abiertas (Kraken + Fintual)
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
}

# Flujos para calculo de TIR de posiciones abiertas
FLUJOS_ABIERTOS = [
    ('2020-05-19', -248.00), ('2021-05-19', -250.00), ('2021-05-19', -250.00),
    ('2021-12-03', -200.00), ('2022-01-25', -196.46), ('2022-01-25', -3.83),
    ('2022-01-25', -300.75), ('2022-01-25', -98.95), ('2023-02-02', -150.00),
    ('2023-02-02', -150.00), ('2023-04-23', -200.00), ('2025-12-18', -576.92),
    ('2025-12-18', -192.31), ('2025-12-18', -480.77), ('2025-12-18', -240.38),
    ('2025-12-18', -240.38), ('2025-12-18', -1255.40), ('2025-12-18', -1356.09),
    ('2025-12-18', -605.70), ('2026-01-01', -1061.24),
]

@st.cache_data
def cargar_datos():
    """Carga el CSV de inversiones unificadas"""
    df = pd.read_csv(CSV_PATH)
    df['fecha'] = pd.to_datetime(df['fecha'])
    df['año'] = df['fecha'].dt.year
    df['mes'] = df['fecha'].dt.to_period('M').astype(str)
    return df

@st.cache_data(ttl=300)
def obtener_precios():
    """Obtiene precios actuales de Yahoo Finance"""
    symbols = [p['symbol'] for p in POSICIONES.values()]
    symbols.append('EURUSD=X')

    precios = {}
    for symbol in symbols:
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period='1d')
            if not hist.empty:
                precios[symbol] = hist['Close'].iloc[-1]
            else:
                precios[symbol] = 0
        except:
            precios[symbol] = 0
    return precios

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

# ============== PESTAÑAS ==============

def tab_posiciones_abiertas():
    """Pestaña 1: Posiciones Abiertas con precios en tiempo real"""
    st.header("Posiciones Abiertas")
    st.caption(f"Ultima actualizacion: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    with st.spinner('Obteniendo precios en tiempo real...'):
        precios = obtener_precios()

    eur_usd = precios.get('EURUSD=X', 1.0)

    # Calcular valores
    datos = []
    for ticker, info in POSICIONES.items():
        precio_usd = precios.get(info['symbol'], 0)
        precio_eur = precio_usd / eur_usd if eur_usd > 0 else 0
        valor = info['cantidad'] * precio_eur
        pnl = valor - info['coste_eur']
        pnl_pct = (pnl / info['coste_eur'] * 100) if info['coste_eur'] > 0 else 0

        datos.append({
            'Ticker': ticker, 'Broker': info['broker'], 'Tipo': info['tipo'],
            'Cantidad': info['cantidad'], 'Coste (€)': info['coste_eur'],
            'Precio (€)': precio_eur, 'Valor (€)': valor,
            'P&L (€)': pnl, 'P&L (%)': pnl_pct
        })

    df = pd.DataFrame(datos)

    # Metricas principales
    coste_total = df['Coste (€)'].sum()
    valor_total = df['Valor (€)'].sum()
    pnl_total = df['P&L (€)'].sum()
    pnl_pct_total = (pnl_total / coste_total * 100) if coste_total > 0 else 0
    tir = calcular_xirr(FLUJOS_ABIERTOS, valor_total)

    col1, col2, col3, col4, col5 = st.columns(5)
    col1.metric("Coste Total", f"€{coste_total:,.2f}")
    col2.metric("Valor Actual", f"€{valor_total:,.2f}")
    col3.metric("P&L", f"€{pnl_total:,.2f}", f"{pnl_pct_total:+.2f}%")
    col4.metric("Rentabilidad", f"{pnl_pct_total:+.2f}%")
    col5.metric("TIR Anualizada", f"{tir*100:+.2f}%")

    st.markdown("---")

    # Graficos
    col_chart1, col_chart2 = st.columns(2)

    with col_chart1:
        st.subheader("Por Tipo de Activo")
        df_tipo = df.groupby('Tipo')['Valor (€)'].sum().reset_index()
        fig = px.pie(df_tipo, values='Valor (€)', names='Tipo', color_discrete_sequence=px.colors.qualitative.Set2)
        fig.update_traces(textposition='inside', textinfo='percent+label')
        st.plotly_chart(fig, use_container_width=True)

    with col_chart2:
        st.subheader("Por Broker")
        df_broker = df.groupby('Broker')['Valor (€)'].sum().reset_index()
        fig = px.pie(df_broker, values='Valor (€)', names='Broker', color_discrete_sequence=px.colors.qualitative.Pastel)
        fig.update_traces(textposition='inside', textinfo='percent+label')
        st.plotly_chart(fig, use_container_width=True)

    # Grafico de barras P&L
    st.subheader("Rentabilidad por Posicion")
    df_sorted = df.sort_values('P&L (%)', ascending=True)
    colors = ['green' if x >= 0 else 'red' for x in df_sorted['P&L (%)']]

    fig = go.Figure(go.Bar(
        x=df_sorted['P&L (%)'], y=df_sorted['Ticker'], orientation='h',
        marker_color=colors, text=[f"{x:+.1f}%" for x in df_sorted['P&L (%)']],
        textposition='outside'
    ))
    fig.update_layout(height=400, xaxis_title="P&L (%)", yaxis_title="")
    st.plotly_chart(fig, use_container_width=True)

    # Tabla detalle
    st.subheader("Detalle de Posiciones")
    df_display = df.copy()
    df_display['Cantidad'] = df_display['Cantidad'].apply(lambda x: f"{x:,.6f}" if x < 1 else f"{x:,.2f}")
    for col in ['Coste (€)', 'Precio (€)', 'Valor (€)']:
        df_display[col] = df_display[col].apply(lambda x: f"€{x:,.2f}")
    df_display['P&L (€)'] = df_display['P&L (€)'].apply(lambda x: f"€{x:+,.2f}")
    df_display['P&L (%)'] = df_display['P&L (%)'].apply(lambda x: f"{x:+.2f}%")

    st.dataframe(df_display, use_container_width=True, hide_index=True)

    # Metricas por tipo
    st.markdown("---")
    st.subheader("Desglose por Tipo")
    cols = st.columns(3)
    for i, tipo in enumerate(['Crypto', 'Stock', 'ETF']):
        df_t = df[df['Tipo'] == tipo]
        if not df_t.empty:
            with cols[i]:
                c = df_t['Coste (€)'].sum()
                v = df_t['Valor (€)'].sum()
                p = v - c
                pp = (p / c * 100) if c > 0 else 0
                st.markdown(f"### {tipo}")
                st.metric("Coste", f"€{c:,.2f}")
                st.metric("Valor", f"€{v:,.2f}")
                st.metric("P&L", f"€{p:+,.2f}", f"{pp:+.2f}%")

    st.caption(f"EUR/USD: {eur_usd:.4f}")


def tab_historial():
    """Pestaña 2: Historial completo con filtros"""
    st.header("Historial de Operaciones")

    df = cargar_datos()

    # Sidebar de filtros
    st.sidebar.header("Filtros")

    # Filtro broker
    brokers = ['Todos'] + sorted(df['broker'].unique().tolist())
    broker_sel = st.sidebar.selectbox("Broker", brokers)

    # Filtro tipo activo
    tipos = ['Todos'] + sorted(df['tipo_activo'].unique().tolist())
    tipo_sel = st.sidebar.selectbox("Tipo de Activo", tipos)

    # Filtro operacion
    operaciones = ['Todas'] + sorted(df['tipo_operacion'].unique().tolist())
    op_sel = st.sidebar.selectbox("Tipo Operacion", operaciones)

    # Filtro año
    años = ['Todos'] + sorted(df['año'].unique().tolist(), reverse=True)
    año_sel = st.sidebar.selectbox("Año", años)

    # Buscador ticker
    ticker_buscar = st.sidebar.text_input("Buscar Ticker", "").upper()

    # Aplicar filtros
    df_filtrado = df.copy()
    if broker_sel != 'Todos':
        df_filtrado = df_filtrado[df_filtrado['broker'] == broker_sel]
    if tipo_sel != 'Todos':
        df_filtrado = df_filtrado[df_filtrado['tipo_activo'] == tipo_sel]
    if op_sel != 'Todas':
        df_filtrado = df_filtrado[df_filtrado['tipo_operacion'] == op_sel]
    if año_sel != 'Todos':
        df_filtrado = df_filtrado[df_filtrado['año'] == año_sel]
    if ticker_buscar:
        df_filtrado = df_filtrado[df_filtrado['ticker'].str.contains(ticker_buscar, na=False)]

    # Metricas resumen
    total_ops = len(df_filtrado)
    compras = df_filtrado[df_filtrado['tipo_operacion'] == 'BUY']['importe_neto_eur'].sum()
    ventas = df_filtrado[df_filtrado['tipo_operacion'] == 'SELL']['importe_neto_eur'].sum()
    dividendos = df_filtrado[df_filtrado['tipo_operacion'] == 'DIVIDEND']['importe_neto_eur'].sum()

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Operaciones", f"{total_ops}")
    col2.metric("Compras", f"€{abs(compras):,.2f}")
    col3.metric("Ventas", f"€{ventas:,.2f}")
    col4.metric("Dividendos", f"€{dividendos:,.2f}")

    st.markdown("---")

    # Tabla de operaciones
    cols_mostrar = ['fecha', 'broker', 'tipo_operacion', 'tipo_activo', 'ticker',
                    'cantidad', 'precio_unitario', 'moneda_original', 'importe_eur',
                    'comisiones_eur', 'importe_neto_eur', 'notas']

    df_mostrar = df_filtrado[cols_mostrar].copy()
    df_mostrar['fecha'] = df_mostrar['fecha'].dt.strftime('%Y-%m-%d')
    df_mostrar = df_mostrar.sort_values('fecha', ascending=False)

    # Renombrar columnas para mejor lectura
    df_mostrar.columns = ['Fecha', 'Broker', 'Operacion', 'Tipo', 'Ticker',
                          'Cantidad', 'Precio', 'Moneda', 'Importe €',
                          'Comision €', 'Neto €', 'Notas']

    st.dataframe(df_mostrar, use_container_width=True, hide_index=True, height=500)

    # Boton descargar
    csv = df_filtrado.to_csv(index=False)
    st.download_button("Descargar CSV filtrado", csv, "operaciones_filtradas.csv", "text/csv")

    # Grafico operaciones por mes
    st.markdown("---")
    st.subheader("Operaciones por Mes")

    df_mes = df_filtrado.groupby(['mes', 'tipo_operacion']).size().reset_index(name='count')
    fig = px.bar(df_mes, x='mes', y='count', color='tipo_operacion',
                 barmode='group', color_discrete_map={'BUY': 'blue', 'SELL': 'green', 'DIVIDEND': 'orange'})
    fig.update_layout(xaxis_title="Mes", yaxis_title="Numero de operaciones")
    st.plotly_chart(fig, use_container_width=True)


def tab_analisis():
    """Pestaña 3: Análisis de operaciones cerradas"""
    st.header("Analisis de Rentabilidad")

    df = cargar_datos()

    # Calcular P&L por operacion cerrada
    # Agrupar compras y ventas por ticker
    compras = df[df['tipo_operacion'] == 'BUY'].groupby('ticker').agg({
        'cantidad': 'sum',
        'importe_neto_eur': 'sum'
    }).rename(columns={'cantidad': 'cant_comprada', 'importe_neto_eur': 'coste_total'})
    compras['coste_total'] = compras['coste_total'].abs()

    ventas = df[df['tipo_operacion'] == 'SELL'].groupby('ticker').agg({
        'cantidad': 'sum',
        'importe_neto_eur': 'sum'
    }).rename(columns={'cantidad': 'cant_vendida', 'importe_neto_eur': 'ingreso_total'})

    # Unir
    analisis = compras.join(ventas, how='outer').fillna(0)

    # Filtrar solo posiciones cerradas (donde se vendio algo)
    cerradas = analisis[analisis['cant_vendida'] > 0].copy()

    # Calcular coste proporcional de lo vendido
    cerradas['coste_vendido'] = cerradas.apply(
        lambda r: r['coste_total'] * min(r['cant_vendida'] / r['cant_comprada'], 1) if r['cant_comprada'] > 0 else 0,
        axis=1
    )
    cerradas['pnl'] = cerradas['ingreso_total'] - cerradas['coste_vendido']
    cerradas['pnl_pct'] = (cerradas['pnl'] / cerradas['coste_vendido'] * 100).replace([float('inf'), -float('inf')], 0)

    cerradas = cerradas.reset_index()

    # Metricas globales
    total_invertido = cerradas['coste_vendido'].sum()
    total_recuperado = cerradas['ingreso_total'].sum()
    pnl_total = cerradas['pnl'].sum()
    pnl_pct_total = (pnl_total / total_invertido * 100) if total_invertido > 0 else 0

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Invertido (cerradas)", f"€{total_invertido:,.2f}")
    col2.metric("Total Recuperado", f"€{total_recuperado:,.2f}")
    col3.metric("P&L Total", f"€{pnl_total:,.2f}", f"{pnl_pct_total:+.2f}%")
    col4.metric("Operaciones Cerradas", len(cerradas))

    st.markdown("---")

    # Top 10 mejores y peores
    col_best, col_worst = st.columns(2)

    with col_best:
        st.subheader("Top 10 Mejores Operaciones")
        top_best = cerradas.nlargest(10, 'pnl_pct')[['ticker', 'coste_vendido', 'ingreso_total', 'pnl', 'pnl_pct']]
        top_best.columns = ['Ticker', 'Coste €', 'Ingreso €', 'P&L €', 'P&L %']
        top_best['Coste €'] = top_best['Coste €'].apply(lambda x: f"€{x:,.2f}")
        top_best['Ingreso €'] = top_best['Ingreso €'].apply(lambda x: f"€{x:,.2f}")
        top_best['P&L €'] = top_best['P&L €'].apply(lambda x: f"€{x:+,.2f}")
        top_best['P&L %'] = top_best['P&L %'].apply(lambda x: f"{x:+.1f}%")
        st.dataframe(top_best, use_container_width=True, hide_index=True)

    with col_worst:
        st.subheader("Top 10 Peores Operaciones")
        top_worst = cerradas.nsmallest(10, 'pnl_pct')[['ticker', 'coste_vendido', 'ingreso_total', 'pnl', 'pnl_pct']]
        top_worst.columns = ['Ticker', 'Coste €', 'Ingreso €', 'P&L €', 'P&L %']
        top_worst['Coste €'] = top_worst['Coste €'].apply(lambda x: f"€{x:,.2f}")
        top_worst['Ingreso €'] = top_worst['Ingreso €'].apply(lambda x: f"€{x:,.2f}")
        top_worst['P&L €'] = top_worst['P&L €'].apply(lambda x: f"€{x:+,.2f}")
        top_worst['P&L %'] = top_worst['P&L %'].apply(lambda x: f"{x:+.1f}%")
        st.dataframe(top_worst, use_container_width=True, hide_index=True)

    # Grafico de barras
    st.markdown("---")
    st.subheader("P&L por Ticker (Operaciones Cerradas)")

    cerradas_sorted = cerradas.sort_values('pnl', ascending=True)
    colors = ['green' if x >= 0 else 'red' for x in cerradas_sorted['pnl']]

    fig = go.Figure(go.Bar(
        x=cerradas_sorted['pnl'],
        y=cerradas_sorted['ticker'],
        orientation='h',
        marker_color=colors,
        text=[f"€{x:+,.0f}" for x in cerradas_sorted['pnl']],
        textposition='outside'
    ))
    fig.update_layout(height=max(400, len(cerradas) * 25), xaxis_title="P&L (€)", yaxis_title="")
    st.plotly_chart(fig, use_container_width=True)

    # Rentabilidad por año
    st.markdown("---")
    st.subheader("Rentabilidad por Año")

    # Calcular ventas por año
    ventas_año = df[df['tipo_operacion'] == 'SELL'].groupby('año')['importe_neto_eur'].sum()

    # Para calcular P&L necesitamos asociar ventas con compras - simplificamos mostrando ingresos
    fig = px.bar(x=ventas_año.index, y=ventas_año.values,
                 labels={'x': 'Año', 'y': 'Ingresos por Ventas (€)'},
                 color_discrete_sequence=['#2ecc71'])
    st.plotly_chart(fig, use_container_width=True)

    # Evolucion de inversiones
    st.markdown("---")
    st.subheader("Evolucion de Inversiones")

    df_sorted = df.sort_values('fecha')
    df_sorted['flujo_acumulado'] = df_sorted['importe_neto_eur'].cumsum()

    fig = px.line(df_sorted, x='fecha', y='flujo_acumulado',
                  labels={'fecha': 'Fecha', 'flujo_acumulado': 'Flujo Neto Acumulado (€)'})
    fig.add_hline(y=0, line_dash="dash", line_color="gray")
    st.plotly_chart(fig, use_container_width=True)


def tab_dividendos():
    """Pestaña 4: Dividendos"""
    st.header("Dividendos Recibidos")

    df = cargar_datos()
    dividendos = df[df['tipo_operacion'] == 'DIVIDEND'].copy()

    if dividendos.empty:
        st.info("No hay dividendos registrados")
        return

    # Total
    total_div = dividendos['importe_neto_eur'].sum()
    num_div = len(dividendos)

    col1, col2 = st.columns(2)
    col1.metric("Total Dividendos", f"€{total_div:,.2f}")
    col2.metric("Numero de pagos", num_div)

    st.markdown("---")

    # Por ticker
    st.subheader("Dividendos por Ticker")
    div_ticker = dividendos.groupby('ticker')['importe_neto_eur'].sum().sort_values(ascending=False)

    fig = px.bar(x=div_ticker.index, y=div_ticker.values,
                 labels={'x': 'Ticker', 'y': 'Total Dividendos (€)'},
                 color_discrete_sequence=['#f39c12'])
    st.plotly_chart(fig, use_container_width=True)

    # Por año
    st.subheader("Dividendos por Año")
    div_año = dividendos.groupby('año')['importe_neto_eur'].sum()

    fig = px.bar(x=div_año.index, y=div_año.values,
                 labels={'x': 'Año', 'y': 'Total Dividendos (€)'},
                 color_discrete_sequence=['#e67e22'])
    st.plotly_chart(fig, use_container_width=True)

    # Tabla detalle
    st.markdown("---")
    st.subheader("Detalle de Dividendos")

    div_mostrar = dividendos[['fecha', 'broker', 'ticker', 'importe_neto_eur']].copy()
    div_mostrar['fecha'] = div_mostrar['fecha'].dt.strftime('%Y-%m-%d')
    div_mostrar.columns = ['Fecha', 'Broker', 'Ticker', 'Importe €']
    div_mostrar = div_mostrar.sort_values('Fecha', ascending=False)
    div_mostrar['Importe €'] = div_mostrar['Importe €'].apply(lambda x: f"€{x:,.2f}")

    st.dataframe(div_mostrar, use_container_width=True, hide_index=True)


# ============== MAIN ==============

def main():
    st.title("📊 Mi Portfolio de Inversiones")

    # Pestañas
    tab1, tab2, tab3, tab4 = st.tabs([
        "📈 Posiciones Abiertas",
        "📋 Historial",
        "📊 Analisis",
        "💰 Dividendos"
    ])

    with tab1:
        tab_posiciones_abiertas()

    with tab2:
        tab_historial()

    with tab3:
        tab_analisis()

    with tab4:
        tab_dividendos()

if __name__ == "__main__":
    main()
