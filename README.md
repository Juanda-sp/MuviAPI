# MuviAPI

API REST cinematografica creada con FastAPI y TMDB. Permite buscar peliculas, consultar fichas individuales, ver reparto, director, fecha de lanzamiento, calificacion de TMDB, trailers, recomendaciones, buscar actores por nombre y navegar por su filmografia.

## Tecnologías

- FastAPI como framework principal.
- TMDB como API externa de datos cinematograficos.
- HTTPX para consultas asincronas.
- HTML, CSS y JavaScript vanilla para la visual web.

## Estructura

```text
project/
├── core/
│   └── config.py
├── routes/
│   ├── movies.py
│   └── people.py
├── schemas/
│   └── tmdb_schema.py
├── services/
│   ├── cache.py
│   └── tmdb_service.py
├── static/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── main.py
├── requirements.txt
├── .env
└── README.md
```

## Instalación

```bash
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass # (Para habilitar la excepción en algunos sistemas)
python -m venv .venv 
.venv\Scripts\activate
pip install -r requirements.txt
```

El archivo `.env` debe contener:

```env
TMDB_API_KEY=aec4f2fd4ebd3aac9d8cd5b94b79cd33
TMDB_LANGUAGE=es-CO
TMDB_REGION=CO
CACHE_TTL_SECONDS=300
```

## Ejecución

```bash
uvicorn main:app --reload
```


Abrir:

- Visual web: `http://127.0.0.1:8000/`
- Documentacion Swagger: `http://127.0.0.1:8000/docs`
- Estado: `http://127.0.0.1:8000/health`

## Endpoints principales

| Metodo | Endpoint | Descripcion |
| --- | --- | --- |
| GET | `/movies/trending` | Peliculas en tendencia semanal. |
| GET | `/movies/search?query=batman` | Busca peliculas por nombre. |
| GET | `/movies/{movie_id}` | Ficha individual con fecha, calificacion de TMDB, director, reparto, trailer y recomendaciones. |
| GET | `/people/search?query=zendaya` | Busca actores o cineastas por nombre. |
| GET | `/people/{person_id}` | Ficha individual con biografia y filmografia. |
| GET | `/health` | Estado basico de la API y configuracion de TMDB. |

## Ejemplos de pruebas

### Prueba valida 1

`GET /movies/search?query=interstellar`

Respuesta esperada: lista de peliculas con `id`, `title`, `release_date`, `vote_average`, `poster_url` y `overview`.

### Prueba valida 2

`GET /movies/157336`

Respuesta esperada: ficha de `Interstellar` con datos tecnicos, reparto, trailer y recomendaciones.

### Prueba invalida

`GET /movies/search?query=`

Respuesta esperada: error de validacion `422 Unprocessable Entity` generado por FastAPI.

## Notas de seguridad

- No subir `.env` al repositorio si contiene claves reales.
- La API solo necesita la clave de TMDB.
- No usa Supabase, OpenAI ni servicios de analisis externo.

## Rendimiento y calidad

- Las consultas a TMDB usan `httpx.AsyncClient`.
- Los detalles de peliculas consultan datos, creditos, videos y recomendaciones en paralelo.
- Se usa cache TTL en memoria para reducir llamadas repetidas a TMDB.
- La visual permite abrir actores desde una pelicula y peliculas desde la filmografia de una persona.
