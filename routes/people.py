from fastapi import APIRouter, Query

from services.tmdb_service import tmdb_service


router = APIRouter(prefix="/people", tags=["People"])


@router.get("/search")
async def search_people(
    query: str = Query(..., min_length=1, max_length=120),
    page: int = Query(default=1, ge=1, le=20),
) -> dict:
    return await tmdb_service.search_people(query, page)


@router.get("/{person_id}")
async def get_person(person_id: int) -> dict:
    return await tmdb_service.person_details(person_id)
