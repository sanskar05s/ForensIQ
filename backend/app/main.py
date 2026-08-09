from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

app = FastAPI(
    title="ForensIQ API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
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
