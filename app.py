import streamlit as st
import pandas as pd
import yfinance as yf
from datetime import datetime, date
import plotly.express as px
import plotly.graph_objects as go
from scipy.optimize import brentq

# Configuracion de pagina
st.set_page_config(
    page_title="Portfolio Dashboard",
    page_icon="📈",
    layout="wide"
)

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

# Flujos para calculo de TIR (todos los depositos/compras y valor actual)
FLUJOS = [
    ('2020-05-19', -248.00, 'Compra BTC'),
    ('2021-05-19', -250.00, 'Compra BTC'),
    ('2021-05-19', -250.00, 'Compra ETH'),
    ('2021-12-03', -200.00, 'Compra SOL'),
    ('2022-01-25', -196.46, 'Compra BTC'),
    ('2022-01-25', -3.83, 'Compra BTC'),
    ('2022-01-25', -300.75, 'Compra ETH'),
    ('2022-01-25', -98.95, 'Compra SOL'),
    ('2023-02-02', -150.00, 'Compra BTC'),
    ('2023-02-02', -150.00, 'Compra ETH'),
    ('2023-04-23', -200.00, 'Compra BTC'),
    ('2025-12-18', -576.92, 'Compra NU'),
    ('2025-12-18', -192.31, 'Compra NU'),
    ('2025-12-18', -480.77, 'Compra AMZN'),
    ('2025-12-18', -240.38, 'Compra SPY'),
    ('2025-12-18', -240.38, 'Compra NU'),
    ('2025-12-18', -1255.40, 'Compra IEV'),
    ('2025-12-18', -1356.09, 'Compra ARGT'),
    ('2025-12-18', -605.70, 'Compra AMZN'),
    ('2026-01-01', -1061.24, 'Compra AAPL'),
]

# Calendario de depositos por mes
CALENDARIO = [
    ('2020-05', 248.00, 0.00),
    ('2021-05', 500.00, 0.00),
    ('2021-12', 200.00, 0.00),
    ('2022-01', 599.99, 0.00),
    ('2023-02', 300.00, 0.00),
    ('2023-04', 200.00, 0.00),
    ('2025-12', 0.00, 4947.95),
    ('2026-01', 0.00, 1061.24),
]

@st.cache_data(ttl=300)  # Cache por 5 minutos
def obtener_precios():
    """Obtiene precios actuales de Yahoo Finance"""
    symbols = [p['symbol'] for p in POSICIONES.values()]
    symbols.append('EURUSD=X')  # Para conversion EUR/USD

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
    """Calcula la TIR (XIRR) del portfolio"""
    fechas = [datetime.strptime(f[0], '%Y-%m-%d') for f in flujos]
    valores = [f[1] for f in flujos]

    # Agregar valor final con fecha de hoy
    fechas.append(datetime.now())
    valores.append(valor_final)

    # Calcular dias desde primera fecha
    fecha_base = fechas[0]
    dias = [(f - fecha_base).days / 365.0 for f in fechas]

    def npv(rate):
        return sum(v / (1 + rate) ** d for v, d in zip(valores, dias))

    try:
        xirr = brentq(npv, -0.99, 10.0)
        return xirr
    except:
        return 0

def main():
    st.title("📊 Portfolio - Posiciones Abiertas")
    st.caption(f"Ultima actualizacion: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Obtener precios
    with st.spinner('Obteniendo precios en tiempo real...'):
        precios = obtener_precios()

    eur_usd = precios.get('EURUSD=X', 1.0)

    # Calcular valores actuales
    datos_posiciones = []
    for ticker, info in POSICIONES.items():
        precio_usd = precios.get(info['symbol'], 0)

        # Convertir a EUR (USD -> EUR = dividir por EUR/USD)
        if info['tipo'] == 'Crypto':
            precio_eur = precio_usd / eur_usd if eur_usd > 0 else 0
        else:
            precio_eur = precio_usd / eur_usd if eur_usd > 0 else 0

        valor_actual = info['cantidad'] * precio_eur
        pnl = valor_actual - info['coste_eur']
        pnl_pct = (pnl / info['coste_eur'] * 100) if info['coste_eur'] > 0 else 0

        datos_posiciones.append({
            'Ticker': ticker,
            'Broker': info['broker'],
            'Tipo': info['tipo'],
            'Cantidad': info['cantidad'],
            'Coste (€)': info['coste_eur'],
            'Precio (€)': precio_eur,
            'Valor (€)': valor_actual,
            'P&L (€)': pnl,
            'P&L (%)': pnl_pct
        })

    df = pd.DataFrame(datos_posiciones)

    # Metricas principales
    coste_total = df['Coste (€)'].sum()
    valor_total = df['Valor (€)'].sum()
    pnl_total = df['P&L (€)'].sum()
    pnl_pct_total = (pnl_total / coste_total * 100) if coste_total > 0 else 0
    tir = calcular_xirr(FLUJOS, valor_total)

    # Mostrar metricas
    st.markdown("---")
    col1, col2, col3, col4, col5 = st.columns(5)

    with col1:
        st.metric("Coste Total", f"€{coste_total:,.2f}")
    with col2:
        st.metric("Valor Actual", f"€{valor_total:,.2f}")
    with col3:
        st.metric("P&L", f"€{pnl_total:,.2f}", f"{pnl_pct_total:+.2f}%")
    with col4:
        st.metric("Rentabilidad", f"{pnl_pct_total:+.2f}%")
    with col5:
        st.metric("TIR Anualizada", f"{tir*100:+.2f}%")

    st.markdown("---")

    # Graficos de composicion
    col_chart1, col_chart2 = st.columns(2)

    with col_chart1:
        st.subheader("Composicion por Tipo de Activo")
        df_tipo = df.groupby('Tipo')['Valor (€)'].sum().reset_index()
        fig_tipo = px.pie(df_tipo, values='Valor (€)', names='Tipo',
                         color_discrete_sequence=px.colors.qualitative.Set2)
        fig_tipo.update_traces(textposition='inside', textinfo='percent+label')
        st.plotly_chart(fig_tipo, use_container_width=True)

    with col_chart2:
        st.subheader("Composicion por Broker")
        df_broker = df.groupby('Broker')['Valor (€)'].sum().reset_index()
        fig_broker = px.pie(df_broker, values='Valor (€)', names='Broker',
                           color_discrete_sequence=px.colors.qualitative.Pastel)
        fig_broker.update_traces(textposition='inside', textinfo='percent+label')
        st.plotly_chart(fig_broker, use_container_width=True)

    # Grafico de rentabilidad por posicion
    st.subheader("Rentabilidad por Posicion")
    df_sorted = df.sort_values('P&L (%)', ascending=True)
    colors = ['green' if x >= 0 else 'red' for x in df_sorted['P&L (%)']]

    fig_pnl = go.Figure(go.Bar(
        x=df_sorted['P&L (%)'],
        y=df_sorted['Ticker'],
        orientation='h',
        marker_color=colors,
        text=[f"{x:+.1f}%" for x in df_sorted['P&L (%)']],
        textposition='outside'
    ))
    fig_pnl.update_layout(
        xaxis_title="P&L (%)",
        yaxis_title="",
        height=400
    )
    st.plotly_chart(fig_pnl, use_container_width=True)

    # Tabla de posiciones
    st.subheader("Detalle de Posiciones")

    # Formatear DataFrame para mostrar
    df_display = df.copy()
    df_display['Cantidad'] = df_display['Cantidad'].apply(lambda x: f"{x:,.6f}" if x < 1 else f"{x:,.2f}")
    df_display['Coste (€)'] = df_display['Coste (€)'].apply(lambda x: f"€{x:,.2f}")
    df_display['Precio (€)'] = df_display['Precio (€)'].apply(lambda x: f"€{x:,.2f}")
    df_display['Valor (€)'] = df_display['Valor (€)'].apply(lambda x: f"€{x:,.2f}")
    df_display['P&L (€)'] = df_display['P&L (€)'].apply(lambda x: f"€{x:+,.2f}")
    df_display['P&L (%)'] = df_display['P&L (%)'].apply(lambda x: f"{x:+.2f}%")

    st.dataframe(df_display, use_container_width=True, hide_index=True)

    # Totales
    st.markdown(f"""
    | **TOTAL** | | | | **€{coste_total:,.2f}** | | **€{valor_total:,.2f}** | **€{pnl_total:+,.2f}** | **{pnl_pct_total:+.2f}%** |
    |---|---|---|---|---|---|---|---|---|
    """)

    # Calendario de depositos
    st.markdown("---")
    st.subheader("Calendario de Depositos")

    df_calendario = pd.DataFrame(CALENDARIO, columns=['Mes', 'Kraken (€)', 'Fintual (€)'])
    df_calendario['Total (€)'] = df_calendario['Kraken (€)'] + df_calendario['Fintual (€)']

    fig_cal = go.Figure()
    fig_cal.add_trace(go.Bar(name='Kraken', x=df_calendario['Mes'], y=df_calendario['Kraken (€)'], marker_color='#636EFA'))
    fig_cal.add_trace(go.Bar(name='Fintual', x=df_calendario['Mes'], y=df_calendario['Fintual (€)'], marker_color='#EF553B'))
    fig_cal.update_layout(barmode='stack', xaxis_title='Mes', yaxis_title='Depositos (€)')
    st.plotly_chart(fig_cal, use_container_width=True)

    # Metricas por tipo de activo
    st.markdown("---")
    st.subheader("Metricas por Tipo de Activo")

    col_crypto, col_stock, col_etf = st.columns(3)

    for col, tipo in [(col_crypto, 'Crypto'), (col_stock, 'Stock'), (col_etf, 'ETF')]:
        df_tipo = df[df['Tipo'] == tipo]
        if not df_tipo.empty:
            with col:
                st.markdown(f"### {tipo}")
                coste_t = df_tipo['Coste (€)'].sum()
                valor_t = df_tipo['Valor (€)'].sum()
                pnl_t = df_tipo['P&L (€)'].sum()
                pnl_pct_t = (pnl_t / coste_t * 100) if coste_t > 0 else 0

                st.metric("Coste", f"€{coste_t:,.2f}")
                st.metric("Valor", f"€{valor_t:,.2f}")
                st.metric("P&L", f"€{pnl_t:+,.2f}", f"{pnl_pct_t:+.2f}%")

    # Footer
    st.markdown("---")
    st.caption(f"EUR/USD: {eur_usd:.4f} | Precios actualizados cada 5 minutos")

if __name__ == "__main__":
    main()
