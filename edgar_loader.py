import os
import re
import datetime
from bs4 import BeautifulSoup
from sec_edgar_downloader import Downloader
from vector_store import init_vector_store
from finance_tools import get_stock_info, get_global_market_summary
from search_tools import get_recent_news

def download_filing(
    ticker: str = "AAPL",
    filing_type: str = "10-K",
    company_name: str = "StudentName",
    email: str = "student@university.edu",
    download_dir: str = "./data/cache_filings"
) -> str:
    """
    Downloads the latest 10-K, 10-Q, or 20-F filing for a given ticker using sec-edgar-downloader.
    """
    os.makedirs(download_dir, exist_ok=True)
    dl = Downloader(company_name, email, download_dir)
    dl.get(filing_type, ticker, limit=1)
    target_path = os.path.abspath(os.path.join(download_dir, "sec-edgar-filings", ticker, filing_type))
    return target_path

def parse_filing_sections(file_path: str, filing_type: str = "10-K") -> dict:
    """
    Parses key sections from a 10-K or 10-Q filing file using BeautifulSoup.
    """
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        raw_content = f.read()

    soup = BeautifulSoup(raw_content, "html.parser")
    text = soup.get_text(separator="\n")

    sections = {}

    if filing_type.upper() == "10-Q":
        sections = {"Part I Item 2 (MD&A)": "", "Part II Item 1A (Risk Factors)": ""}
        mda_match = re.search(
            r"(Item\s+2\.?\s+Management.*?s\s+Discussion)(.*?)(Item\s+3\.?|Item\s+4\.?|Part\s+II|$)",
            text,
            re.DOTALL | re.IGNORECASE
        )
        if mda_match:
            sections["Part I Item 2 (MD&A)"] = mda_match.group(2).strip()

        rf_match = re.search(
            r"(Item\s+1A\.?\s+Risk\s+Factors)(.*?)(Item\s+1B\.?|Item\s+2\.?|Item\s+6\.?|$)",
            text,
            re.DOTALL | re.IGNORECASE
        )
        if rf_match:
            sections["Part II Item 1A (Risk Factors)"] = rf_match.group(2).strip()
    else:
        sections = {"Item 1A": "", "Item 7": ""}
        rf_match = re.search(
            r"(Item\s+1A\.?\s+Risk\s+Factors)(.*?)(Item\s+1B\.?|Item\s+2\.?|$)",
            text,
            re.DOTALL | re.IGNORECASE
        )
        if rf_match:
            sections["Item 1A"] = rf_match.group(2).strip()

        mda_match = re.search(
            r"(Item\s+7\.?\s+Management.*?s\s+Discussion)(.*?)(Item\s+7A\.?|Item\s+8\.?|$)",
            text,
            re.DOTALL | re.IGNORECASE
        )
        if mda_match:
            sections["Item 7"] = mda_match.group(2).strip()

    empty_keys = [k for k, v in sections.items() if not v]
    if len(empty_keys) == len(sections):
        lines = [line.strip() for line in text.splitlines() if len(line.strip()) > 60]
        keys = list(sections.keys())
        sections[keys[0]] = "\n".join(lines[:100])
        sections[keys[1]] = "\n".join(lines[100:200])

    return sections

def chunk_text(text: str, chunk_size: int = 800, overlap: int = 100) -> list:
    """
    Splits text into overlapping chunks.
    """
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += (chunk_size - overlap)
    return chunks

def run_universal_disclosure_pipeline(ticker: str, persist_directory: str = "./data/vector_db") -> int:
    """
    Universal Disclosure Pipeline for non-SEC global tickers (e.g. RELIANCE.NS, 7203.T, MC.PA).
    Fetches business profile, audited summary, and scrapes top IR/regulatory releases into ChromaDB.
    """
    info = get_global_market_summary(ticker)
    news_items = get_recent_news(ticker, max_results=5)
    extracted_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    documents = []
    metadatas = []
    ids = []

    # 1. Company Profile & Overview
    profile_text = (
        f"Corporate Disclosure for {info['name']} ({ticker}) [{info['exchange']}]. "
        f"Trading Price: {info['currency']} {info['price']:.2f}. Market Capitalization: {info['market_cap_formatted']}. "
        f"Trailing P/E: {info['trailing_pe_formatted']}. Daily Shift: {info['daily_change']} ({info['daily_pct']}%)."
    )
    documents.append(profile_text)
    metadatas.append({
        "ticker": ticker,
        "filing_type": "Universal Disclosure / IR",
        "section": "Corporate Profile & Overview",
        "extracted_at": extracted_at
    })
    ids.append(f"{ticker}_Universal_Profile_0")

    # 2. Regulatory & IR News Releases
    for idx, item in enumerate(news_items, 1):
        news_text = f"Regulatory & IR Release ({item['date']}) - {item['title']}: {item['body']}"
        chunks = chunk_text(news_text, chunk_size=800, overlap=100)
        for c_idx, chunk in enumerate(chunks):
            documents.append(chunk)
            metadatas.append({
                "ticker": ticker,
                "filing_type": "Universal Disclosure / IR",
                "section": f"IR News Release {idx}",
                "extracted_at": extracted_at
            })
            ids.append(f"{ticker}_Universal_IR_{idx}_{c_idx}")

    client, collection = init_vector_store(persist_directory=persist_directory)
    if documents:
        collection.add(documents=documents, metadatas=metadatas, ids=ids)

    return len(documents)

def embed_filing_to_vector_store(
    ticker: str = "AAPL",
    filing_type: str = "10-K",
    download_dir: str = "./data/cache_filings",
    persist_directory: str = "./data/vector_db"
) -> int:
    """
    Smart Filing Ingestion: Attempts SEC EDGAR lookup first; falls back gracefully to Universal Disclosure Pipeline if non-SEC ticker.
    """
    ticker = ticker.upper()
    is_non_sec = any(suffix in ticker for suffix in [".NS", ".T", ".PA", ".TW", ".L", ".HK", ".DE"])
    
    if is_non_sec:
        print(f"Non-SEC international ticker detected ({ticker}). Triggering Universal Disclosure Pipeline...")
        return run_universal_disclosure_pipeline(ticker, persist_directory=persist_directory)

    try:
        filing_dir = download_filing(ticker=ticker, filing_type=filing_type, download_dir=download_dir)
        target_file = None
        for root, dirs, files in os.walk(filing_dir):
            for file in files:
                if file.endswith(".txt") or file.endswith(".html"):
                    target_file = os.path.join(root, file)
                    break
            if target_file:
                break

        if not target_file:
            raise FileNotFoundError(f"No filing text file found in {filing_dir}")

        sections = parse_filing_sections(target_file, filing_type=filing_type)
        extracted_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

        documents = []
        metadatas = []
        ids = []
        
        clean_ft = filing_type.replace("-", "")
        for section_name, section_text in sections.items():
            if not section_text:
                continue
            chunks = chunk_text(section_text, chunk_size=800, overlap=100)
            clean_sec = re.sub(r'[^a-zA-Z0-9]', '_', section_name)
            for i, chunk in enumerate(chunks):
                documents.append(chunk)
                metadatas.append({
                    "ticker": ticker,
                    "filing_type": filing_type,
                    "section": section_name,
                    "extracted_at": extracted_at
                })
                ids.append(f"{ticker}_{clean_ft}_{clean_sec}_{i}")

        client, collection = init_vector_store(persist_directory=persist_directory)
        if documents:
            collection.add(documents=documents, metadatas=metadatas, ids=ids)
            
        return len(documents)

    except Exception as e:
        print(f"SEC EDGAR lookup for {ticker} encountered exception: {e}. Falling back to Universal Disclosure Pipeline...")
        return run_universal_disclosure_pipeline(ticker, persist_directory=persist_directory)

if __name__ == "__main__":
    for t in ["AAPL", "RELIANCE.NS"]:
        print(f"Testing filing ingestion for {t}...")
        count = embed_filing_to_vector_store(ticker=t, filing_type="10-K")
        print(f"Successfully embedded {count} chunks for {t} into ChromaDB.")
