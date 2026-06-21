from fastapi import APIRouter, Query

from services.tmdb_service import tmdb_service


router = APIRouter(prefix="/movies", tags=["Movies"])


@router.get("/trending")
async def get_trending_movies() -> dict:
    return await tmdb_service.trending_movies()


@router.get("/featured")
async def get_featured_movie() -> dict:
    return await tmdb_service.featured_movie()


@router.get("/search")
async def search_movies(
    query: str = Query(..., min_length=1, max_length=120),
    page: int = Query(default=1, ge=1, le=20),
) -> dict:
    return await tmdb_service.search_movies(query, page)


@router.get("/{movie_id}")
async def get_movie(movie_id: int) -> dict:
    return await tmdb_service.movie_details(movie_id)
