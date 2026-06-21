from difflib import SequenceMatcher
from typing import Any
import random
import unicodedata

import httpx
from fastapi import HTTPException, status

from core.config import get_settings
from services.cache import TTLCache


IMAGE_BASE_URL = "https://image.tmdb.org/t/p"
TMDB_BASE_URL = "https://api.themoviedb.org/3"


def image_url(path: str | None, size: str = "w500") -> str | None:
    if not path:
        return None
    return f"{IMAGE_BASE_URL}/{size}{path}"


def person_image_url(path: str | None) -> str | None:
    return image_url(path, "w342")


class TMDBService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.cache = TTLCache(self.settings.cache_ttl_seconds)

    def _ensure_configured(self) -> None:
        if not self.settings.tmdb_is_configured:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="TMDB no esta configurado. Agrega TMDB_API_KEY en .env.",
            )

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self._ensure_configured()
        params = {
            "api_key": self.settings.tmdb_api_key,
            "language": self.settings.tmdb_language,
            **(params or {}),
        }
        cache_key = f"{path}:{sorted(params.items())}"

        async def fetch() -> dict[str, Any]:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.get(f"{TMDB_BASE_URL}{path}", params=params)
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="Recurso no encontrado en TMDB.")
            if response.status_code >= 400:
                raise HTTPException(status_code=response.status_code, detail=response.text)
            return response.json()

        return await self.cache.get_or_set(cache_key, fetch)

    async def search_movies(self, query: str, page: int = 1) -> dict[str, Any]:
        data = await self._get(
            "/search/movie",
            {"query": query, "page": page, "include_adult": "false", "region": self.settings.tmdb_region},
        )
        return {
            "page": data.get("page"),
            "total_results": data.get("total_results"),
            "results": [self._compact_movie(movie) for movie in data.get("results", [])],
        }

    async def search_people(self, query: str, page: int = 1) -> dict[str, Any]:
        data = await self._get("/search/person", {"query": query, "page": page, "include_adult": "false"})
        people = data.get("results", [])
        compact_people = [self._compact_person(person) for person in people]
        suggestions = self._person_suggestions(query, people) if page == 1 else []
        if page == 1 and not suggestions:
            suggestions = self._person_suggestions(query, await self._person_suggestion_pool(query))
        return {
            "page": data.get("page"),
            "total_results": data.get("total_results"),
            "results": compact_people,
            "suggestions": suggestions,
        }

    async def trending_movies(self) -> dict[str, Any]:
        data = await self._get("/trending/movie/week", {"region": self.settings.tmdb_region})
        return {"results": [self._compact_movie(movie) for movie in data.get("results", [])]}

    async def featured_movie(self) -> dict[str, Any]:
        candidates = [
            "Supergirl",
            "Toy Story 5",
            "Spider-Man: Brand New Day",
            "Avatar: Fire and Ash",
            "The Batman Part II",
            "Avengers: Doomsday",
        ]
        random.shuffle(candidates)

        fallback_match: dict[str, Any] | None = None
        for title in candidates:
            data = await self._get(
                "/search/movie",
                {"query": title, "page": 1, "include_adult": "false", "region": self.settings.tmdb_region},
            )
            matches = [
                movie for movie in data.get("results", [])
                if movie.get("backdrop_path") or movie.get("poster_path")
            ]
            if matches:
                best_match = sorted(
                    matches,
                    key=lambda movie: (
                        self._featured_title_score(title, movie.get("title") or ""),
                        float(movie.get("popularity") or 0),
                    ),
                    reverse=True,
                )[0]
                score = self._featured_title_score(title, best_match.get("title") or "")
                if score >= 0.72:
                    return await self.movie_details(best_match["id"])
                fallback_match = fallback_match or best_match

        if fallback_match:
            return await self.movie_details(fallback_match["id"])

        trending = await self.trending_movies()
        if trending["results"]:
            return await self.movie_details(trending["results"][0]["id"])
        raise HTTPException(status_code=404, detail="No se encontro pelicula destacada.")

    async def movie_details(self, movie_id: int) -> dict[str, Any]:
        movie, credits, videos = await self._parallel_movie_payload(movie_id)
        recommendations = await self.random_movies(exclude_id=movie_id)
        directors = [
            crew for crew in credits.get("crew", [])
            if crew.get("job") == "Director"
        ]
        writers = [
            crew for crew in credits.get("crew", [])
            if crew.get("job") in {"Writer", "Screenplay", "Story"}
        ][:4]
        trailer = next(
            (
                video for video in videos.get("results", [])
                if video.get("site") == "YouTube" and video.get("type") in {"Trailer", "Teaser"}
            ),
            None,
        )
        return {
            "id": movie.get("id"),
            "title": movie.get("title"),
            "original_title": movie.get("original_title"),
            "overview": movie.get("overview"),
            "release_date": movie.get("release_date"),
            "runtime": movie.get("runtime"),
            "status": movie.get("status"),
            "tagline": movie.get("tagline"),
            "vote_average": movie.get("vote_average"),
            "vote_count": movie.get("vote_count"),
            "popularity": movie.get("popularity"),
            "genres": movie.get("genres", []),
            "director": directors[0]["name"] if directors else "No disponible",
            "directors": [self._compact_person(person) for person in directors],
            "writers": [self._compact_person(person) for person in writers],
            "cast": [self._cast_member(person) for person in credits.get("cast", [])[:18]],
            "poster_url": image_url(movie.get("poster_path"), "w500"),
            "backdrop_url": image_url(movie.get("backdrop_path"), "w1280"),
            "trailer_url": f"https://www.youtube.com/watch?v={trailer['key']}" if trailer else None,
            "recommendations": recommendations,
        }

    async def random_movies(self, count: int = 12, exclude_id: int | None = None) -> list[dict[str, Any]]:
        page = random.randint(1, 20)
        data = await self._get(
            "/discover/movie",
            {
                "page": page,
                "include_adult": "false",
                "include_video": "false",
                "region": self.settings.tmdb_region,
                "sort_by": "popularity.desc",
                "primary_release_date.gte": "2024-01-01",
                "primary_release_date.lte": "2026-12-31",
                "vote_count.gte": 10,
            },
        )
        movies = [
            movie for movie in data.get("results", [])
            if movie.get("id") != exclude_id and (movie.get("poster_path") or movie.get("backdrop_path"))
        ]
        random.shuffle(movies)
        return [self._compact_movie(movie) for movie in movies[:count]]

    async def person_details(self, person_id: int) -> dict[str, Any]:
        person, credits = await self._parallel_person_payload(person_id)
        cast_credits = sorted(
            credits.get("cast", []),
            key=lambda movie: (movie.get("release_date") or "0000-00-00"),
            reverse=True,
        )
        crew_credits = sorted(
            credits.get("crew", []),
            key=lambda movie: (movie.get("release_date") or "0000-00-00"),
            reverse=True,
        )
        return {
            "id": person.get("id"),
            "name": person.get("name"),
            "biography": person.get("biography"),
            "birthday": person.get("birthday"),
            "deathday": person.get("deathday"),
            "place_of_birth": person.get("place_of_birth"),
            "known_for_department": person.get("known_for_department"),
            "popularity": person.get("popularity"),
            "profile_url": person_image_url(person.get("profile_path")),
            "movies": [self._compact_movie(movie) | {"character": movie.get("character")} for movie in cast_credits[:30]],
            "crew_movies": [self._compact_movie(movie) | {"job": movie.get("job")} for movie in crew_credits[:18]],
        }

    async def _parallel_movie_payload(self, movie_id: int) -> tuple[dict[str, Any], ...]:
        import asyncio

        return await asyncio.gather(
            self._get(f"/movie/{movie_id}"),
            self._get(f"/movie/{movie_id}/credits"),
            self._get(f"/movie/{movie_id}/videos", {"language": "en-US"}),
        )

    async def _parallel_person_payload(self, person_id: int) -> tuple[dict[str, Any], ...]:
        import asyncio

        return await asyncio.gather(
            self._get(f"/person/{person_id}"),
            self._get(f"/person/{person_id}/movie_credits"),
        )

    async def _person_suggestion_pool(self, query: str) -> list[dict[str, Any]]:
        import asyncio

        tokens = [token for token in self._normalize(query).split() if len(token) >= 3]
        prefixes = []
        if len(tokens) == 1 and len(tokens[0]) >= 5:
            prefixes = [tokens[0][:4], tokens[0][:3]]
        search_terms = list(dict.fromkeys([*tokens[:3], *prefixes]))
        lookups = [
            self._get("/search/person", {"query": term, "page": 1, "include_adult": "false"})
            for term in search_terms
        ]
        lookups.extend(
            self._get("/person/popular", {"page": page})
            for page in range(1, 6)
        )
        payloads = await asyncio.gather(*lookups, return_exceptions=True)

        people_by_id: dict[int, dict[str, Any]] = {}
        for payload in payloads:
            if isinstance(payload, Exception):
                continue
            for person in payload.get("results", []):
                person_id = person.get("id")
                if person_id:
                    people_by_id[person_id] = person
        return list(people_by_id.values())

    def _compact_movie(self, movie: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": movie.get("id"),
            "title": movie.get("title") or movie.get("name"),
            "overview": movie.get("overview"),
            "release_date": movie.get("release_date") or movie.get("first_air_date"),
            "vote_average": movie.get("vote_average"),
            "poster_url": image_url(movie.get("poster_path"), "w342"),
            "backdrop_url": image_url(movie.get("backdrop_path"), "w780"),
        }

    def _compact_person(self, person: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": person.get("id"),
            "name": person.get("name"),
            "known_for_department": person.get("known_for_department"),
            "profile_url": person_image_url(person.get("profile_path")),
            "known_for": [
                item.get("title") or item.get("name")
                for item in person.get("known_for", [])
                if item.get("title") or item.get("name")
            ][:3],
        }

    def _cast_member(self, person: dict[str, Any]) -> dict[str, Any]:
        return self._compact_person(person) | {
            "character": person.get("character"),
            "order": person.get("order"),
        }

    def _person_suggestions(self, query: str, people: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized_query = self._normalize(query)
        if len(normalized_query) < 3:
            return []

        scored: list[tuple[float, dict[str, Any]]] = []
        seen_names: set[str] = set()
        for person in people:
            name = person.get("name") or ""
            normalized_name = self._normalize(name)
            if len(normalized_name) < 2:
                continue
            if len(normalized_name) < max(3, len(normalized_query) - 2):
                continue
            if normalized_name in seen_names:
                continue
            seen_names.add(normalized_name)
            if normalized_name == normalized_query:
                return []

            score = SequenceMatcher(None, normalized_query, normalized_name).ratio()
            if normalized_query in normalized_name or normalized_name in normalized_query:
                score = max(score, 0.75)
            if score >= 0.45:
                popularity = float(person.get("popularity") or 0)
                scored.append((score + min(popularity / 1000, 0.08), person))

        scored.sort(key=lambda item: item[0], reverse=True)
        return [self._compact_person(person) | {"match_score": round(score, 3)} for score, person in scored[:5]]

    def _normalize(self, value: str) -> str:
        text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
        return " ".join(text.lower().strip().split())

    def _featured_title_score(self, expected: str, actual: str) -> float:
        normalized_expected = self._normalize(expected)
        normalized_actual = self._normalize(actual)
        if normalized_actual == normalized_expected:
            return 1
        if normalized_expected in normalized_actual or normalized_actual in normalized_expected:
            return 0.85
        return SequenceMatcher(None, normalized_expected, normalized_actual).ratio()


tmdb_service = TMDBService()
