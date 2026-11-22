import logging
from duckduckgo_search import DDGS
import yfinance as yf

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_recent_news(ticker: str = "AAPL", max_results: int = 5):
    """
    Search for recent stock news related to a specific ticker using DuckDuckGo Search (DDGS),
    with a fallback to yfinance news if rate-limited.
    
    Args:
        ticker (str): Stock ticker symbol (e.g., 'AAPL', 'MSFT', 'TSLA').
        max_results (int): Maximum number of news items to retrieve.
        
    Returns:
        list of dict: Each dict contains 'title', 'url', 'source', 'date', and 'body'.
    """
    query = f"{ticker} stock news"
    news_items = []
    
    # Primary: DuckDuckGo Search
    try:
        with DDGS() as ddgs:
            results = list(ddgs.news(query, max_results=max_results))
            if results:
                for item in results:
                    news_items.append({
                        "title": item.get("title", ""),
                        "url": item.get("url", ""),
                        "source": item.get("source", ""),
                        "date": item.get("date", ""),
                        "body": item.get("body", item.get("snippet", ""))
                    })
    except Exception as e:
        logger.warning(f"DuckDuckGo search encountered an issue for '{ticker}' ({e}). Falling back to Yahoo Finance news.")

    # Fallback to yfinance if DDGS did not return items
    if not news_items:
        try:
            t = yf.Ticker(ticker)
            raw_news = t.news
            if raw_news:
                for item in raw_news[:max_results]:
                    content = item.get("content", {})
                    title = content.get("title", item.get("title", ""))
                    provider = content.get("provider", {}).get("displayName", item.get("publisher", "Yahoo Finance"))
                    pub_date = content.get("pubDate", item.get("providerPublishTime", ""))
                    summary = content.get("summary", content.get("description", ""))
                    canonical_url = content.get("canonicalUrl", {}).get("url", item.get("link", ""))
                    
                    news_items.append({
                        "title": title,
                        "url": canonical_url,
                        "source": provider,
                        "date": str(pub_date),
                        "body": summary
                    })
        except Exception as e:
            logger.error(f"Fallback yfinance news fetch failed for '{ticker}': {e}")
            
    return news_items

if __name__ == '__main__':
    print(f"========================================")
    print(f" Top Recent News Headlines for AAPL")
    print(f"========================================")
    headlines = get_recent_news("AAPL", max_results=5)
    if headlines:
        for idx, item in enumerate(headlines, 1):
            print(f"\n[{idx}] {item['title']}")
            print(f"    Source: {item['source']} | Date: {item['date']}")
            print(f"    URL: {item['url']}")
            print(f"    Snippet: {item['body'][:150]}...")
    else:
        print("No news headlines found.")
