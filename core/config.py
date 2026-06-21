from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "MuviAPI"
    app_version: str = "1.0.0"
    environment: str = "development"

    tmdb_api_key: str = Field(default="", alias="TMDB_API_KEY")
    tmdb_language: str = Field(default="es-CO", alias="TMDB_LANGUAGE")
    tmdb_region: str = Field(default="CO", alias="TMDB_REGION")

    cache_ttl_seconds: int = Field(default=300, alias="CACHE_TTL_SECONDS")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @property
    def tmdb_is_configured(self) -> bool:
        return bool(self.tmdb_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
