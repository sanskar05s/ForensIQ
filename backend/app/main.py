from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import os
import time
from uuid import uuid4

from app.api.routes import router as api_router
from app.routers.cases import router as cases_router
from app.routers.evidence import router as evidence_router
from app.routers.visual import router as visual_router
from app.routers.blockchain import router as blockchain_router
from app.routers.doc_metadata import router as doc_metadata_router
from app.routers.witness_nlp import router as witness_nlp_router
from app.routers import contradiction
from app.routers import timeline_graph
from app.routers.activity_log import router as activity_log_router

from app.routers import assistant, activity_log

from app.routers import report

from app.routers import leads, hypotheses, provenance, claim_links, identification


app = FastAPI(
    title="ForensIQ API",
    version="0.1.0",
)

logger = logging.getLogger("uvicorn.error")
logger.setLevel(logging.INFO)


@app.middleware("http")
async def log_request_duration(request, call_next):
    """Log request lifecycle timing, including CORS preflight requests."""
    started_at = time.perf_counter()
    request_id = uuid4().hex[:12]
    logger.info(
        "request_started id=%s method=%s path=%s",
        request_id,
        request.method,
        request.url.path,
    )
    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        logger.exception(
            "request_failed id=%s method=%s path=%s elapsed_ms=%.1f",
            request_id,
            request.method,
            request.url.path,
            elapsed_ms,
        )
        raise

    elapsed_ms = (time.perf_counter() - started_at) * 1000
    logger.info(
        "request_complete id=%s method=%s path=%s status=%s elapsed_ms=%.1f",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    response.headers["X-Request-ID"] = request_id
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    # Keep CPU inference from consuming every core and starving API responses.
    try:
        import torch

        torch.set_num_threads(min(2, max(1, os.cpu_count() or 1)))
        try:
            torch.set_num_interop_threads(1)
        except RuntimeError:
            # PyTorch only allows this before its first parallel operation.
            pass
    except ImportError:
        pass
    print("ForensIQ API started. All AI modules pending.")


app.include_router(api_router)
app.include_router(cases_router, prefix="/api")
app.include_router(evidence_router, prefix="/api")
app.include_router(visual_router, prefix="/api")
app.include_router(blockchain_router, prefix="/api")
app.include_router(doc_metadata_router, prefix="/api")
app.include_router(witness_nlp_router, prefix="/api")
app.include_router(contradiction.router, prefix="/api")
app.include_router(
    timeline_graph.timeline_router,
    prefix="/api"
)

app.include_router(
    timeline_graph.graph_router,
    prefix="/api"
)

app.include_router(activity_log_router, prefix="/api")
app.include_router(assistant.router, prefix="/api")
app.include_router(activity_log.router, prefix="/api")

app.include_router(report.router, prefix="/api")

app.include_router(leads.router, prefix="/api")
app.include_router(hypotheses.router, prefix="/api")
app.include_router(provenance.router, prefix="/api")
app.include_router(claim_links.router, prefix="/api")
app.include_router(identification.router, prefix="/api")

@app.get("/")
def root():
    return {"message": "ForensIQ Backend Running"}


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "ForensIQ API",
        "version": "0.1.0",
    }
