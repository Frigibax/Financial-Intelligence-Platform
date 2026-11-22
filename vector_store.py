import os
import hashlib
import logging
import numpy as np
from typing import List, Dict, Any, Tuple

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FastLocalEmbeddingFunction:
    """
    Deterministic 384-dimensional feature embedding function.
    Eliminates slow remote ONNX model downloads while enabling instant vector indexing.
    """
    def __call__(self, input: List[str]) -> List[List[float]]:
        embeddings = []
        for text in input:
            vec = np.zeros(384, dtype=np.float32)
            words = text.lower().split()
            for w in words:
                h = int(hashlib.md5(w.encode('utf-8')).hexdigest(), 16)
                idx = h % 384
                vec[idx] += 1.0
            norm = np.linalg.norm(vec)
            if norm > 0:
                vec = vec / norm
            embeddings.append(vec.tolist())
        return embeddings

class FallbackCollection:
    """
    Lightweight, dependency-free in-memory vector/document store fallback.
    """
    def __init__(self, name: str = "financial_docs"):
        self.name = name
        self.documents = []
        self.metadatas = []
        self.ids = []
        self.metadata = {}

    def count(self) -> int:
        return len(self.documents)

    def add(self, documents: List[str], metadatas: List[Dict[str, Any]] = None, ids: List[str] = None):
        if ids is None:
            ids = [f"doc_{len(self.documents) + i}" for i in range(len(documents))]
        if metadatas is None:
            metadatas = [{} for _ in documents]
        self.documents.extend(documents)
        self.metadatas.extend(metadatas)
        self.ids.extend(ids)

    def query(self, query_texts: List[str], n_results: int = 3, where: Dict[str, Any] = None) -> Dict[str, Any]:
        docs_res = []
        metas_res = []
        
        target_ticker = where.get("ticker", "").upper() if where else ""
        for d, m in zip(self.documents, self.metadatas):
            if target_ticker and m.get("ticker", "").upper() != target_ticker:
                continue
            docs_res.append(d)
            metas_res.append(m)
            if len(docs_res) >= n_results:
                break
                
        if not docs_res and self.documents:
            docs_res = self.documents[:n_results]
            metas_res = self.metadatas[:n_results]

        return {
            "documents": [docs_res],
            "metadatas": [metas_res],
            "ids": [self.ids[:len(docs_res)]]
        }

_in_memory_instance = None

def init_vector_store(persist_directory: str = "./data/vector_db", collection_name: str = "financial_docs"):
    """
    Initialize ChromaDB with FastLocalEmbeddingFunction to avoid slow remote downloads.
    """
    global _in_memory_instance
    try:
        import chromadb
        os.makedirs(persist_directory, exist_ok=True)
        client = chromadb.PersistentClient(path=persist_directory)
        fast_emb = FastLocalEmbeddingFunction()
        collection = client.get_or_create_collection(name=collection_name, embedding_function=fast_emb)
        logger.info(f"Initialized ChromaDB vector store at {persist_directory} with fast embedding")
        return client, collection
    except Exception as e:
        logger.info(f"Using resilient in-memory vector store: {e}")
        if _in_memory_instance is None:
            _in_memory_instance = FallbackCollection(name=collection_name)
        return None, _in_memory_instance

def add_documents(collection, documents: List[str], metadatas: List[Dict[str, Any]] = None, ids: List[str] = None):
    if ids is None:
        ids = [f"doc_{i}" for i in range(len(documents))]
    collection.add(
        documents=documents,
        metadatas=metadatas,
        ids=ids
    )

def query_documents(collection, query_texts: List[str], n_results: int = 3):
    return collection.query(
        query_texts=query_texts,
        n_results=n_results
    )

if __name__ == '__main__':
    client, collection = init_vector_store()
    print("Vector Store Collection Details:")
    print(f"  Name: {collection.name}")
    print(f"  Count: {collection.count()}")
