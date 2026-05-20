from groq import AsyncGroq
from ..config import get_settings
from ..crawler.embeddings import EmbeddingService
from .vector_store import VectorStore

settings = get_settings()

SYSTEM_PROMPT = """You are a helpful AI assistant for {company_name}.
Answer questions using ONLY the provided context from the company's website.
If the context doesn't contain enough information, say so honestly.
Be concise, friendly, and accurate."""


class RAGPipeline:
    def __init__(self):
        self.groq = AsyncGroq(api_key=settings.groq_api_key)
        self.embedder = EmbeddingService()
        self.vector_store = VectorStore()

    async def query(
        self,
        client_id: str,
        question: str,
        session_id: str,
        conversation_history: list[dict] | None = None,
        company_name: str = "the company",
    ) -> dict:
        # 1. Embed question
        query_vector = await self.embedder.embed_query(question)

        # 2. Retrieve relevant chunks from Qdrant
        chunks = await self.vector_store.search(client_id, query_vector, top_k=5)

        # 3. Build context
        context = "\n\n---\n\n".join(
            f"[Source: {c['url']}]\n{c['text']}" for c in chunks
        )

        # 4. Build messages
        messages = [
            {
                "role": "system",
                "content": SYSTEM_PROMPT.format(company_name=company_name) + f"\n\nContext:\n{context}",
            }
        ]
        if conversation_history:
            messages.extend(conversation_history[-6:])  # last 3 turns
        messages.append({"role": "user", "content": question})

        # 5. Call Groq
        response = await self.groq.chat.completions.create(
            model=settings.groq_model,
            messages=messages,
            max_tokens=512,
            temperature=0.3,
        )

        answer = response.choices[0].message.content
        sources = list({c["url"] for c in chunks})

        return {"answer": answer, "sources": sources}
