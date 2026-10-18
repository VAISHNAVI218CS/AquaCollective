from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import create_db_and_tables
from app.routers import auth, dashboard, map_data, predictions, reports, research, validations


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.environment == "production" and (
        len(settings.secret_key) < 32
        or settings.secret_key in {
            "local-development-key-change-before-deploying",
            "replace-with-a-long-random-secret",
        }
    ):
        raise RuntimeError("Set a strong SECRET_KEY (at least 32 characters) before running AquaCollective in production.")
    create_db_and_tables()
    yield


app = FastAPI(
    title="AquaCollective API",
    description="Community-powered water observations and research data.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(reports.router)
app.include_router(validations.router)
app.include_router(map_data.router)
app.include_router(predictions.router)
app.include_router(dashboard.router)
app.include_router(research.router)


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.mount("/", StaticFiles(directory=Path(__file__).resolve().parents[2] / "frontend", html=True), name="frontend")
