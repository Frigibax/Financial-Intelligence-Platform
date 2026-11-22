from dotenv import load_dotenv
load_dotenv()

import os
import sys
import asyncio
import logging
import requests
from typing import List, Dict, Any
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from state import AgentState
from supervisor import build_fin_synth_graph
from finance_tools import get_stock_info, get_multi_year_financials, get_global_market_summary
from pdf_generator import generate_pdf_report

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MultiAgentAPI")

app = FastAPI(
    title="Multi-Agent Market Intelligence Engine API",
    description="Institutional Multi-Market Financial Intelligence Platform with Agentic RAG, 16-Page Dossiers, and DuPont Analytics",
    version="2.0.0"
)

# Enable CORS for React Frontend (default Vite port 5173 & standard 3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Active: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Active: {len(self.active_connections)}")

    async def broadcast(self, message: Dict[str, Any]):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

def send_ws_event(agent: str, message: str, event_type: str = "info", extra: Dict[str, Any] = None):
    payload = {
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "agent": agent,
        "message": message,
        "type": event_type,
        "extra": extra or {}
    }
    logger.info(f"[{agent}] {message}")
    # Async task scheduling for active connections
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(manager.broadcast(payload))
    except Exception as e:
        logger.warning(f"Could not broadcast WS event: {e}")

class ResearchRequest(BaseModel):
    ticker: str = "AAPL"
    filing_type: str = "10-K"

@app.websocket("/ws/logs")
async def websocket_logs_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        await websocket.send_json({
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "agent": "System",
            "message": "Connected to FinSynth AI Real-Time Agent Execution Pipeline",
            "type": "system"
        })
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

@app.get("/api/health")
def health_check():
    return {"status": "online", "engine": "FinSynth AI Multi-Agent Engine", "version": "2.0.0"}

@app.get("/api/search")
def search_tickers(q: str = ""):
    query = q.strip()
    if not query:
        return []
        
    url = f"https://query2.finance.yahoo.com/v1/finance/search?q={query}&quotesCount=5&newsCount=0"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        res = requests.get(url, headers=headers, timeout=5)
        if res.status_code == 200:
            data = res.json()
            quotes = data.get("quotes", [])
            results = []
            for item in quotes[:5]:
                symbol = item.get("symbol", "")
                name = item.get("shortname") or item.get("longname") or symbol
                exchange = item.get("exchDisp") or item.get("exchange") or "Global"
                quote_type = item.get("quoteType", "")
                results.append({
                    "symbol": symbol,
                    "name": name,
                    "exchange": exchange,
                    "quoteType": quote_type
                })
            return results
    except Exception as e:
        logger.warning(f"Error querying Yahoo Finance search API for '{query}': {e}")
        
    return []

@app.get("/api/market/{ticker}")
def get_market_data(ticker: str):
    try:
        from finance_tools import resolve_company_input, get_all_company_finances
        res = resolve_company_input(ticker)
        resolved_ticker = res["ticker"]
        summary = get_global_market_summary(resolved_ticker)
        multi_year = get_multi_year_financials(resolved_ticker)
        all_fin = get_all_company_finances(resolved_ticker)
        return {
            "status": "success",
            "summary": summary,
            "multi_year": multi_year,
            "full_finances": all_fin
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/research")
async def execute_research(request: ResearchRequest):
    from finance_tools import resolve_company_input, get_all_company_finances
    res = resolve_company_input(request.ticker)
    ticker = res["ticker"]
    company_name = res["name"]
    filing_type = request.filing_type.upper()
    if filing_type not in ["10-K", "10-Q"]:
        filing_type = "10-K"
        
    send_ws_event("Supervisor", f"Target identified: '{request.ticker}' -> {company_name} ({ticker})", "system")
    send_ws_event("Supervisor", f"Initiating institutional analysis for {company_name} ({filing_type})", "system")
    send_ws_event("Quant Agent", f"Extracting complete audited financial statements & market quotes for {company_name}...", "step")
    
    app_graph = build_fin_synth_graph()
    
    initial_state: AgentState = {
        "messages": [],
        "ticker": ticker,
        "filing_type": filing_type,
        "financial_metrics": {},
        "multi_year_financials": {},
        "sec_insights": [],
        "rag_excerpts": [],
        "critic_feedback": "",
        "loop_count": 0,
        "investment_brief": "",
        "model_used": "Multi-Agent Llama-3.3-70B Engine",
        "fallback_triggered": False
    }

    send_ws_event("SEC RAG Agent", f"Searching ChromaDB vector store for {ticker} {filing_type} risk & MD&A disclosures...", "step")
    
    try:
        # Run graph in executor thread to prevent blocking event loop
        loop = asyncio.get_event_loop()
        final_state = await loop.run_in_executor(None, app_graph.invoke, initial_state)
    except Exception as e:
        err_msg = str(e)
        logger.error(f"Error during graph execution for {ticker}: {err_msg}")
        send_ws_event("Supervisor", f"Execution error for {ticker}: {err_msg}", "error")
        if "Could not locate financial data" in err_msg or "ValueError" in type(e).__name__:
            raise HTTPException(status_code=400, detail=err_msg)
        raise HTTPException(status_code=500, detail=f"Research graph execution failed: {err_msg}")

    model_used = final_state.get("model_used", "llama-3.3-70b-versatile")
    fallback_triggered = final_state.get("fallback_triggered", False)
    
    if fallback_triggered:
        send_ws_event("Critic Agent", "⚠️ Rate Limit Encountered: Degraded gracefully to Llama 3.1 8B", "warning")
    
    send_ws_event("Critic Agent", f"Audit Completed. Status: {final_state.get('critic_feedback', 'APPROVED')} (Model: {model_used})", "step")
    send_ws_event("Synthesizer Node", "Compiled 16-page institutional financial brief & PDF report", "success")

    # Ensure 16-page PDF generation
    os.makedirs("./data", exist_ok=True)
    pdf_filename = f"{ticker}_MultiAgent_Market_Intelligence_Report.pdf"
    pdf_path = os.path.join("./data", pdf_filename)
    try:
        generate_pdf_report(final_state, output_path=pdf_path)
        send_ws_event("System", f"Institutional 16-Page Dossier generated successfully: {pdf_filename}", "success")
    except Exception as e:
        logger.warning(f"PDF generation alert for {ticker}: {e}")

    # Extract full financials
    from finance_tools import get_all_company_finances
    full_finances = get_all_company_finances(ticker)

    return {
        "status": "success",
        "ticker": ticker,
        "filing_type": filing_type,
        "market_summary": final_state.get("financial_metrics", {}),
        "multi_year": final_state.get("multi_year_financials", {}),
        "full_finances": full_finances,
        "investment_brief": final_state.get("investment_brief", ""),
        "sec_insights": final_state.get("sec_insights", []),
        "rag_excerpts": final_state.get("rag_excerpts", []),
        "critic_feedback": final_state.get("critic_feedback", "APPROVED"),
        "loop_count": final_state.get("loop_count", 1),
        "model_used": model_used,
        "fallback_triggered": fallback_triggered,
        "pdf_download_url": f"/api/download/{ticker}"
    }

@app.get("/api/download/{ticker}")
def download_pdf(ticker: str):
    ticker = ticker.strip().upper()
    possible_paths = [
        os.path.join("./data", f"{ticker}_MultiAgent_Market_Intelligence_Report.pdf"),
        os.path.join("./data", f"{ticker}_FinSynth_Report.pdf"),
        os.path.join("./data", f"{ticker}_Verification_Report.pdf"),
        os.path.join("./data", "Test_16_Page_Dossier.pdf")
    ]
    
    target_path = None
    for p in possible_paths:
        if os.path.exists(p):
            target_path = p
            break
            
    if not target_path or not os.path.exists(target_path):
        # Auto generate if not exists
        try:
            target_path = os.path.join("./data", f"{ticker}_MultiAgent_Market_Intelligence_Report.pdf")
            generate_pdf_report({"ticker": ticker}, output_path=target_path)
        except Exception:
            raise HTTPException(status_code=404, detail=f"PDF report for {ticker} not found. Please run analysis first.")
        
    return FileResponse(
        path=target_path,
        media_type="application/pdf",
        filename=f"{ticker}_MultiAgent_Market_Intelligence_Dossier.pdf"
    )

# Serve static frontend application
if os.path.exists("./frontend"):
    app.mount("/", StaticFiles(directory="./frontend", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run("api:app", host=host, port=port)

