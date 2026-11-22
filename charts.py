import plotly.graph_objects as go
from plotly.subplots import make_subplots

def create_revenue_net_income_chart(fin_data: dict) -> go.Figure:
    """
    Builds an interactive Plotly figure for 4-Year Total Revenue vs. Net Income.
    Clean institutional light mode (#FFFFFF background, dark slate text).
    """
    years = fin_data.get("years", ["FY2022", "FY2023", "FY2024", "FY2025"])
    revenue = fin_data.get("revenue_billion", [0, 0, 0, 0])
    net_income = fin_data.get("net_income_billion", [0, 0, 0, 0])
    ticker = fin_data.get("ticker", "AAPL")
    currency = fin_data.get("currency", "USD")

    fig = go.Figure()

    # Total Revenue Bar
    fig.add_trace(go.Bar(
        x=years,
        y=revenue,
        name=f"Total Revenue ({currency} B)",
        marker_color="#2563eb", # Royal Blue
        text=[f"{v:.1f}B" for v in revenue],
        textposition="auto",
        hovertemplate="%{x} Revenue: %{y:.2f} Billion<extra></extra>"
    ))

    # Net Income Line
    fig.add_trace(go.Scatter(
        x=years,
        y=net_income,
        name=f"Net Income ({currency} B)",
        mode="lines+markers+text",
        line=dict(color="#059669", width=3.5), # Emerald Green
        marker=dict(size=9, color="#059669"),
        text=[f"{v:.1f}B" for v in net_income],
        textposition="top center",
        hovertemplate="%{x} Net Income: %{y:.2f} Billion<extra></extra>"
    ))

    fig.update_layout(
        title=dict(
            text=f"{ticker} - Revenue & Net Income Multi-Year Growth ({currency} Billions)",
            font=dict(size=15, color="#0f172a", family="Inter, sans-serif")
        ),
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        font=dict(color="#334155"),
        xaxis=dict(
            title="Fiscal Period",
            showgrid=False,
            zeroline=False,
            linecolor="#cbd5e1"
        ),
        yaxis=dict(
            title=f"Amount ({currency} Billions)",
            gridcolor="#e2e8f0",
            zerolinecolor="#cbd5e1",
            linecolor="#cbd5e1"
        ),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        ),
        margin=dict(l=40, r=40, t=60, b=40)
    )

    return fig

def create_cash_flow_chart(fin_data: dict) -> go.Figure:
    """
    Builds an interactive Plotly figure for 4-Year Operating Cash Flow vs. Free Cash Flow.
    Clean institutional light mode (#FFFFFF background, dark slate text).
    """
    years = fin_data.get("years", ["FY2022", "FY2023", "FY2024", "FY2025"])
    ocf = fin_data.get("operating_cf_billion", [0, 0, 0, 0])
    fcf = fin_data.get("free_cf_billion", [0, 0, 0, 0])
    ticker = fin_data.get("ticker", "AAPL")
    currency = fin_data.get("currency", "USD")

    fig = go.Figure()

    # Operating Cash Flow Bar
    fig.add_trace(go.Bar(
        x=years,
        y=ocf,
        name=f"Operating Cash Flow ({currency} B)",
        marker_color="#1e3a8a", # Deep Navy
        text=[f"{v:.1f}B" for v in ocf],
        textposition="auto",
        hovertemplate="%{x} OCF: %{y:.2f} Billion<extra></extra>"
    ))

    # Free Cash Flow Bar
    fig.add_trace(go.Bar(
        x=years,
        y=fcf,
        name=f"Free Cash Flow ({currency} B)",
        marker_color="#10b981", # Emerald
        text=[f"{v:.1f}B" for v in fcf],
        textposition="auto",
        hovertemplate="%{x} FCF: %{y:.2f} Billion<extra></extra>"
    ))

    fig.update_layout(
        barmode="group",
        title=dict(
            text=f"{ticker} - Cash Flow Generation & Liquidity Health ({currency} Billions)",
            font=dict(size=15, color="#0f172a", family="Inter, sans-serif")
        ),
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        font=dict(color="#334155"),
        xaxis=dict(
            title="Fiscal Period",
            showgrid=False,
            zeroline=False,
            linecolor="#cbd5e1"
        ),
        yaxis=dict(
            title=f"Amount ({currency} Billions)",
            gridcolor="#e2e8f0",
            zerolinecolor="#cbd5e1",
            linecolor="#cbd5e1"
        ),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        ),
        margin=dict(l=40, r=40, t=60, b=40)
    )

    return fig

if __name__ == "__main__":
    test_data = {
        "ticker": "AAPL",
        "currency": "USD",
        "years": ["FY2022", "FY2023", "FY2024", "FY2025"],
        "revenue_billion": [394.33, 383.29, 391.04, 412.50],
        "net_income_billion": [99.80, 96.99, 93.74, 109.30],
        "operating_cf_billion": [122.15, 110.54, 118.25, 128.50],
        "free_cf_billion": [111.44, 99.58, 108.81, 118.00]
    }
    fig1 = create_revenue_net_income_chart(test_data)
    fig2 = create_cash_flow_chart(test_data)
    print("Created executive light-mode Plotly figures successfully.")
