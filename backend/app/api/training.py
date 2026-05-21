import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from supabase import Client
from ..database import get_supabase
from ..auth.dependencies import get_current_user
from ..models import TrainingJobCreate, TrainingJobResponse, TokenPayload

router = APIRouter(prefix="/training", tags=["training"])


@router.post("/jobs", response_model=TrainingJobResponse)
async def start_training(
    payload: TrainingJobCreate,
    background_tasks: BackgroundTasks,
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    client = db.table("clients").select("id").eq("owner_user_id", user.sub).single().execute()
    client_id = client.data["id"]

    job = db.table("training_jobs").insert({
        "client_id": client_id,
        "website_url": str(payload.website_url),
        "max_pages": payload.max_pages,
        "status": "pending",
        "pages_crawled": 0,
        "pages_total": 0,
    }).execute()

    job_id = job.data[0]["id"]
    background_tasks.add_task(_run_training_job, job_id, client_id, str(payload.website_url), payload.max_pages)

    return job.data[0]


@router.get("/jobs", response_model=list[TrainingJobResponse])
async def list_jobs(
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    client = db.table("clients").select("id").eq("owner_user_id", user.sub).single().execute()
    result = db.table("training_jobs").select("*").eq("client_id", client.data["id"]).order("created_at", desc=True).execute()
    return result.data


@router.get("/jobs/{job_id}", response_model=TrainingJobResponse)
async def get_job(
    job_id: str,
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    client = db.table("clients").select("id").eq("owner_user_id", user.sub).single().execute()
    result = db.table("training_jobs").select("*").eq("id", job_id).eq("client_id", client.data["id"]).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")
    return result.data


@router.delete("/data")
async def clear_training_data(
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Delete all indexed vectors from Qdrant for this client (clean slate for retraining)."""
    from ..rag.vector_store import VectorStore
    client = db.table("clients").select("id").eq("owner_user_id", user.sub).single().execute()
    client_id = str(client.data["id"])
    try:
        vs = VectorStore()
        await vs.delete_collection(client_id)
    except Exception:
        pass  # collection may not exist yet — that's fine
    return {"message": "Knowledge base cleared"}


@router.delete("/jobs/{job_id}")
async def delete_job(
    job_id: str,
    user: TokenPayload = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Delete a training job record. Does not remove already-indexed vectors from Qdrant."""
    client = db.table("clients").select("id").eq("owner_user_id", user.sub).single().execute()
    result = (
        db.table("training_jobs")
        .delete()
        .eq("id", job_id)
        .eq("client_id", client.data["id"])
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"message": "Training job deleted"}


async def _run_training_job(job_id: str, client_id: str, website_url: str, max_pages: int):
    from ..crawler.crawler import WebCrawler
    from ..crawler.embeddings import EmbeddingService
    from ..rag.vector_store import VectorStore
    from ..database import get_supabase

    db = get_supabase()

    try:
        db.table("training_jobs").update({"status": "running"}).eq("id", job_id).execute()

        crawler = WebCrawler()
        pages = await crawler.crawl(website_url, max_pages=max_pages)

        db.table("training_jobs").update({"pages_total": len(pages)}).eq("id", job_id).execute()

        embedder = EmbeddingService()
        vector_store = VectorStore()
        await vector_store.ensure_collection(client_id)

        for i, page in enumerate(pages):
            chunks = embedder.chunk_text(page["content"])
            vectors = await embedder.embed_chunks(chunks)
            await vector_store.upsert(client_id, [
                {"text": chunk, "url": page["url"], "title": page["title"], "vector": vec}
                for chunk, vec in zip(chunks, vectors)
            ])
            db.table("training_jobs").update({"pages_crawled": i + 1}).eq("id", job_id).execute()

        db.table("training_jobs").update({
            "status": "completed",
            "completed_at": "now()",
        }).eq("id", job_id).execute()

    except Exception as e:
        db.table("training_jobs").update({
            "status": "failed",
            "error_message": str(e),
            "completed_at": "now()",
        }).eq("id", job_id).execute()
