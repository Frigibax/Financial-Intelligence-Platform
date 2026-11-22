from typing import TypedDict, List, Dict, Any, Annotated
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    """
    State definition for the FinSynth AI multi-agent graph.
    """
    messages: Annotated[list, add_messages]
    ticker: str
    filing_type: str  # '10-K', '10-Q', 'Universal IR'
    financial_metrics: Dict[str, Any]
    multi_year_financials: Dict[str, Any]
    sec_insights: List[str]
    rag_excerpts: List[Dict[str, str]]
    critic_feedback: str
    loop_count: int
    investment_brief: str
    model_used: str
    fallback_triggered: bool
