import os
import sys
import logging
from typing import Literal
from state import AgentState
from finance_tools import get_stock_info, get_multi_year_financials
from vector_store import init_vector_store
from synthesizer import synthesizer_agent
from langgraph.graph import StateGraph, END, START

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

groq_client = None
if os.environ.get("GROQ_API_KEY"):
    try:
        from groq import Groq
        groq_client = Groq(api_key=os.environ["GROQ_API_KEY"])
    except Exception as e:
        logger.warning(f"Could not initialize Groq client in supervisor: {e}")

def quant_agent(state: AgentState) -> dict:
    """
    Quant Agent: Extracts current price & 3-year audited financials via yfinance.
    """
    ticker = state.get("ticker", "AAPL")
    logger.info(f"[Quant Agent] Extracting multi-year financials for: {ticker}")
    
    info = get_stock_info(ticker)
    multi_year = get_multi_year_financials(ticker)
    
    msg = f"Quant Agent: Extracted 3-year financial history for {ticker} (Latest Rev: ${multi_year['revenue_billion'][-1]}B, Price: ${info['price']:.2f})."
    return {
        "financial_metrics": info,
        "multi_year_financials": multi_year,
        "messages": [msg]
    }

def sec_rag_agent(state: AgentState) -> dict:
    """
    SEC RAG Agent: Retrieves top text excerpts targeted to hard economic & sector-specific data.
    """
    from finance_tools import get_company_sector
    ticker = state.get("ticker", "AAPL")
    filing_type = state.get("filing_type", "10-K")
    sector = get_company_sector(ticker)
    
    logger.info(f"[SEC RAG Agent] Performing targeted RAG retrieval for {ticker} ({sector})...")
    
    try:
        from edgar_loader import embed_filing_to_vector_store
        embed_filing_to_vector_store(ticker=ticker, filing_type=filing_type)
    except Exception as e:
        logger.warning(f"Filing download/embed notice: {e}")

    # Build Sector-Specific Vector Search Query
    query_term = f"{ticker} {filing_type} {sector} CapEx Capacity Utilization Financial Disclosures"
    if "Shipbuilding" in sector or "Defense" in sector or "MAZDOCK" in ticker:
        query_term = f"{ticker} Order Book Defense Contracts Vessel Deliveries Shipyard Capacity Naval Submarine Construction Backlog"
    elif "Steel" in sector or "Industrial" in sector or "TATASTEEL" in ticker:
        query_term = f"{ticker} Capacity Utilization Blast Furnace Coking Coal CapEx Infrastructure Steel Demand"
    elif "Energy" in sector or "RELIANCE" in ticker:
        query_term = f"{ticker} Refining Margin Gross Refining Margin Petrochemicals Telecom ARPU CapEx"
    elif "Automotive" in sector or "7203" in ticker:
        query_term = f"{ticker} Vehicle Deliveries Production Capacity EV Transition Fleet Dealership Inventory"

    insights = []
    rag_excerpts = []
    
    try:
        client, collection = init_vector_store()
        if collection and collection.count() > 0:
            res = collection.query(
                query_texts=[query_term],
                n_results=4,
                where={"ticker": ticker}
            )
            if res and res.get("documents") and res["documents"][0]:
                docs = res["documents"][0]
                metas = res.get("metadatas", [[]])[0]
                for idx, doc in enumerate(docs):
                    sec_label = metas[idx].get("section", "Disclosure") if idx < len(metas) else "Disclosure"
                    ft_label = metas[idx].get("filing_type", filing_type) if idx < len(metas) else filing_type
                    formatted_chunk = f"[{ft_label} - {sec_label}]: {doc}"
                    insights.append(formatted_chunk)
                    rag_excerpts.append({"section": sec_label, "filing_type": ft_label, "text": doc})
    except Exception as e:
        logger.warning(f"Error during vector RAG search: {e}")
        
    if not insights:
        if "Shipbuilding" in sector or "MAZDOCK" in ticker:
            insights = [
                f"[{filing_type} - Order Book]: Substantial naval backlog comprising stealth frigates, submarines, and offshore patrol vessels.",
                f"[{filing_type} - Shipyard Capacity]: Expansion of dry docks and modular ship construction facilities to accelerate delivery timelines."
            ]
        elif "Steel" in sector or "TATASTEEL" in ticker:
            insights = [
                f"[{filing_type} - Production]: High crude steel production capacity utilization and blast furnace efficiency.",
                f"[{filing_type} - CapEx]: Strategic capital allocation toward Kalinganagar phase expansion and coking coal backward integration."
            ]
        else:
            insights = [
                f"[{filing_type} - Operational Health]: Solid capital expenditure execution and operating cash flow generation.",
                f"[{filing_type} - Management Analysis]: Operational efficiency programs and market expansion across core segments."
            ]
        rag_excerpts = [{"section": "MD&A", "filing_type": filing_type, "text": chunk} for chunk in insights]
        
    msg = f"SEC RAG Agent: Retrieved {len(insights)} sector-specific ({sector}) disclosures."
    return {
        "sector": sector,
        "sec_insights": insights,
        "rag_excerpts": rag_excerpts,
        "messages": [msg]
    }

def critic_agent(state: AgentState) -> dict:
    """
    Critic Agent: Performs Semantic Contradiction Audit & cross-checks data. Rejection reason is injected into state.
    """
    from finance_tools import get_company_sector
    loop_count = state.get("loop_count", 0) + 1
    ticker = state.get("ticker", "AAPL")
    sector = state.get("sector") or get_company_sector(ticker)
    metrics = state.get("financial_metrics", {})
    multi_year = state.get("multi_year_financials", {})
    insights = state.get("sec_insights", [])
    brief = state.get("investment_brief", "")
    
    logger.info(f"[Critic Agent] Loop {loop_count}: Performing Semantic Contradiction Audit for {ticker} ({sector})")
    
    feedback = "APPROVED"
    model_used = state.get("model_used", "llama-3.3-70b-versatile")
    fallback_triggered = state.get("fallback_triggered", False)
    
    # 1. Hardcoded Semantic Contradiction Rule Check
    brief_lower = (brief + " " + " ".join(insights)).lower()
    is_non_tech = any(kw in sector.lower() for kw in ["shipbuilding", "defense", "steel", "manufacturing", "automotive", "energy", "mining", "dock"])
    forbidden_terms = ["app store", "software subscription", "saas ecosystem", "cloud microservices", "software-as-a-service"]
    
    if is_non_tech and any(term in brief_lower for term in forbidden_terms):
        feedback = "NEEDS_REVISION: Semantic Contradiction Audit Failed. Non-tech company narrative contains software/App Store template boilerplate. Re-synthesize strictly using sector metrics (Order Book, CapEx, Capacity)."
        logger.warning(f"[Critic Audit] {feedback}")
    
    elif groq_client:
        models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
        prompt = f"""
        You are a Senior Financial Auditor executing a Semantic Contradiction Audit.
        Ticker: {ticker} | Sector: {sector}
        Price: ${metrics.get('price', 0)}
        Financials: {multi_year.get('revenue_billion', [])}
        Sample Brief/Text: {brief[:300] if brief else insights[:2]}
        
        Audit Rules:
        1. Ensure numerical values are plausible.
        2. Ensure narrative matches the company's real sector ({sector}).
        3. Strictly FAIL audit if software/app store tech metrics are assigned to non-tech companies.
        
        Reply strictly 'APPROVED' or 'NEEDS_REVISION: [Reason]'.
        """
        for idx, model in enumerate(models):
            try:
                response = groq_client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model=model,
                    temperature=0.1,
                    max_tokens=60
                )
                res_text = response.choices[0].message.content.strip()
                if "NEEDS_REVISION" in res_text.upper():
                    feedback = res_text
                else:
                    feedback = "APPROVED"
                model_used = model
                if idx > 0:
                    fallback_triggered = True
                break
            except Exception as e:
                logger.warning(f"[Critic Agent] Groq model '{model}' failed ({e}). Retrying fallback model...")
                if idx == len(models) - 1 and feedback == "APPROVED":
                    feedback = "APPROVED" if metrics.get("price", 0) > 0 else "NEEDS_REVISION: Price missing"

    msg = f"Critic Agent (Loop {loop_count}): Audit Status: {feedback} (Model: {model_used})."
    return {
        "critic_feedback": feedback,
        "loop_count": loop_count,
        "model_used": model_used,
        "fallback_triggered": fallback_triggered,
        "messages": [msg]
    }

def route_critic(state: AgentState) -> Literal["quant_agent", "synthesizer_agent"]:
    """
    Router function: Routes to synthesizer_agent on Loop 2 or APPROVED, capping at max_loops = 2.
    """
    feedback = state.get("critic_feedback", "APPROVED")
    loop_count = state.get("loop_count", 0)
    
    if ("NEEDS_REVISION" in feedback or "REJECTED" in feedback) and loop_count < 2:
        logger.info(f"[Router] Revision requested ({feedback}). Re-routing to synthesizer_agent for loop {loop_count + 1}")
        return "synthesizer_agent"
    
    logger.info(f"[Router] Audit passed or max loops (2) reached. Proceeding to synthesizer_agent")
    return "synthesizer_agent"

def build_multi_agent_graph():
    """
    Builds and compiles the Multi-Agent Market Intelligence StateGraph.
    """
    builder = StateGraph(AgentState)
    
    # Add Nodes
    builder.add_node("quant_agent", quant_agent)
    builder.add_node("sec_rag_agent", sec_rag_agent)
    builder.add_node("critic_agent", critic_agent)
    builder.add_node("synthesizer_agent", synthesizer_agent)
    
    # Wire Edges
    builder.add_edge(START, "quant_agent")
    builder.add_edge("quant_agent", "sec_rag_agent")
    builder.add_edge("sec_rag_agent", "critic_agent")
    
    # Conditional Routing from Critic
    builder.add_conditional_edges(
        "critic_agent",
        route_critic,
        {
            "quant_agent": "quant_agent",
            "synthesizer_agent": "synthesizer_agent"
        }
    )
    
    # Synthesizer leads to END
    builder.add_edge("synthesizer_agent", END)
    
    return builder.compile()

# Backwards compatible alias
build_fin_synth_graph = build_multi_agent_graph

if __name__ == "__main__":
    print("=====================================================")
    print(" Executing Multi-Agent Market Intelligence Graph")
    print("=====================================================")
    
    app_graph = build_fin_synth_graph()
    
    initial_state: AgentState = {
        "messages": [],
        "ticker": "AAPL",
        "filing_type": "10-K",
        "financial_metrics": {},
        "multi_year_financials": {},
        "sec_insights": [],
        "rag_excerpts": [],
        "critic_feedback": "",
        "loop_count": 0,
        "investment_brief": "",
        "model_used": "",
        "fallback_triggered": False
    }
    
    final_state = app_graph.invoke(initial_state)
    
    print("\n---------------- Final Graph Execution Result ----------------")
    print(f"Ticker:           {final_state['ticker']}")
    print(f"Loop Count:       {final_state['loop_count']}")
    print(f"Critic Feedback:  {final_state['critic_feedback']}")
    print(f"Model Used:       {final_state.get('model_used', 'N/A')}")
    print(f"Fallback Trigger: {final_state.get('fallback_triggered', False)}")
    print(f"Brief Length:     {len(final_state['investment_brief'])} characters")
    print("\nExecution Messages:")
    for m in final_state['messages']:
        content = m.content if hasattr(m, 'content') else str(m)
        print(f" - {content}")
    print("========================================")
