from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from core.config import get_settings
from routes import movies, people


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="API REST cinematografica con FastAPI y TMDB para consultar peliculas, personas y fichas tecnicas.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(movies.router)
app.include_router(people.router)

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", include_in_schema=False)
async def home() -> FileResponse:
    return FileResponse("static/index.html")


@app.get("/health", tags=["System"])
async def health() -> dict:
    return {
        "status": "ok",
        "app": settings.app_name,
        "tmdb_configured": settings.tmdb_is_configured,
    }
