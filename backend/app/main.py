from fastapi import FastAPI
from app.api.routes import router

app = FastAPI(
    title="ForensIQ API",
    version="1.0.0"
)

app.include_router(router)

@app.get("/")
def root():
    return {
        "message": "ForensIQ Backend Running 🚀"
    }
