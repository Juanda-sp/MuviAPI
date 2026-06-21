const state = {
  selectedId: null,
  selectedMovie: null,
  searchMovies: [],
  searchPeople: [],
  searchSuggestions: [],
  currentFilter: "all",
};

const els = {
  searchInput: document.querySelector("#searchInput"),
  searchButton: document.querySelector("#searchButton"),
  resultsTitle: document.querySelector("#resultsTitle"),
  resultCount: document.querySelector("#resultCount"),
  results: document.querySelector("#results"),
  detailPanel: document.querySelector("#detailPanel"),
  hero: document.querySelector("#hero"),
  heroKicker: document.querySelector("#heroKicker"),
  heroTitle: document.querySelector("#heroTitle"),
  heroText: document.querySelector("#heroText"),
  filterChips: document.querySelectorAll("[data-filter]"),
};

const fallbackPoster = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%23272a31'/%3E%3Ctext x='150' y='230' fill='%23a8afbd' font-family='Arial' font-size='20' text-anchor='middle'%3ESin imagen%3C/text%3E%3C/svg%3E";

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    let message = "Error inesperado";
    try {
      const payload = await response.json();
      message = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail);
    } catch {
      message = await response.text();
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

function setLoading(message = "Cargando") {
  els.detailPanel.innerHTML = renderDetailSkeleton(message);
}

function setHomeLoading() {
  els.hero.classList.add("hero-loading");
  els.heroKicker.textContent = "Cargando";
  els.heroTitle.textContent = "Preparando tu portada";
  els.heroText.textContent = "Estamos consultando titulos destacados y tendencias.";
  els.resultsTitle.textContent = "Tendencias";
  els.resultCount.textContent = "";
  els.results.innerHTML = renderResultSkeletons(8);
  els.detailPanel.innerHTML = renderDetailSkeleton("Cargando portada");
}

function renderResultSkeletons(count = 6) {
  return Array.from({ length: count }, () => `
    <div class="result-item skeleton-result">
      <span class="skeleton thumb"></span>
      <span>
        <span class="skeleton skeleton-line wide"></span>
        <span class="skeleton skeleton-line"></span>
      </span>
    </div>
  `).join("");
}

function renderDetailSkeleton(message = "Cargando") {
  return `
    <div class="detail-skeleton">
      <div class="skeleton skeleton-poster"></div>
      <div class="skeleton-copy">
        <p class="eyebrow">${escapeHtml(message)}</p>
        <span class="skeleton skeleton-title"></span>
        <span class="skeleton skeleton-line wide"></span>
        <span class="skeleton skeleton-line wide"></span>
        <span class="skeleton skeleton-line"></span>
      </div>
    </div>
  `;
}

function setError(error) {
  els.detailPanel.innerHTML = `<div class="error-state"><h3>No se pudo completar la consulta</h3><p>${escapeHtml(error.message)}</p></div>`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateHero(item, type) {
  els.hero.classList.remove("hero-loading");
  const backdrop = item.backdrop_url || item.poster_url || item.profile_url;
  if (backdrop) {
    els.hero.style.backgroundImage = `linear-gradient(90deg, rgba(4,11,22,.96), rgba(7,17,31,.58) 55%, rgba(7,17,31,.18)), url("${backdrop}")`;
  }
  els.heroKicker.textContent = type === "person" ? "Ficha de actor" : "Ficha de pelicula";
  els.heroTitle.textContent = item.title || item.name;
  els.heroText.textContent = item.overview || item.biography || "Informacion esencial disponible desde TMDB.";
}

function renderResults(items, type, suggestions = []) {
  els.resultCount.textContent = String(items.length);
  const suggestionMarkup = type === "person" && suggestions.length
    ? renderSuggestionBox(suggestions)
    : "";
  const resultMarkup = items.map((item) => renderResultItem(item, type)).join("");
  els.results.innerHTML = suggestionMarkup + (resultMarkup || `<p class="muted">Sin resultados para esta busqueda.</p>`);
}

async function search() {
  const query = els.searchInput.value.trim();
  if (!query) return;
  setLoading("Buscando");
  try {
    const [movieData, personData] = await Promise.all([
      api(`/movies/search?query=${encodeURIComponent(query)}`),
      api(`/people/search?query=${encodeURIComponent(query)}`),
    ]);
    const movies = movieData.results || [];
    const people = personData.results || [];
    state.searchMovies = movies;
    state.searchPeople = people;
    state.searchSuggestions = personData.suggestions || [];
    setFilter("all");
    if (movies[0]) {
      await openDetail(movies[0].id, "movie");
    } else if (people[0]) {
      await openDetail(people[0].id, "person");
    } else {
      els.heroKicker.textContent = "Sin resultados";
      els.heroTitle.textContent = query;
      els.heroText.textContent = "Prueba con otro titulo, actor o una de las sugerencias disponibles.";
    }
  } catch (error) {
    setError(error);
  }
}

function renderSearchResults(movies, people, suggestions = []) {
  const filteredMovies = filterMovies(movies, state.currentFilter);
  const filteredPeople = state.currentFilter === "all" || state.currentFilter === "person" || state.currentFilter === "popular"
    ? people
    : [];
  const total = filteredMovies.length + filteredPeople.length;
  els.resultsTitle.textContent = "Resultados";
  els.resultCount.textContent = String(total);
  els.results.innerHTML = `
    ${suggestions.length && (state.currentFilter === "all" || state.currentFilter === "person") ? renderSuggestionBox(suggestions) : ""}
    ${renderResultGroup("Peliculas", filteredMovies, "movie")}
    ${renderResultGroup("Actores", filteredPeople, "person")}
    ${total ? "" : `<p class="muted">Sin resultados para este filtro.</p>`}
  `;
}

function filterMovies(movies, filter) {
  if (filter === "person") return [];
  if (filter === "popular") {
    return [...movies].sort((a, b) => Number(b.vote_average || 0) - Number(a.vote_average || 0));
  }
  if (filter === "upcoming") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return movies.filter((movie) => {
      if (!movie.release_date) return false;
      return new Date(`${movie.release_date}T00:00:00`) >= today;
    });
  }
  return movies;
}

function setFilter(filter) {
  state.currentFilter = filter;
  els.filterChips.forEach((chip) => chip.classList.toggle("active", chip.dataset.filter === filter));
  if (state.searchMovies.length || state.searchPeople.length || state.searchSuggestions.length) {
    renderSearchResults(state.searchMovies, state.searchPeople, state.searchSuggestions);
  }
}

function renderSuggestionBox(suggestions) {
  return `
    <div class="suggestion-box">
      <span>Quizas buscas</span>
      <div class="suggestion-list">
        ${suggestions.map((person) => `
          <button class="suggestion-chip" type="button" data-open-person="${person.id}">
            ${escapeHtml(person.name)}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderResultGroup(title, items, type) {
  if (!items.length) return "";
  return `
    <div class="result-group">
      <h4>${title}</h4>
      ${items.map((item) => renderResultItem(item, type)).join("")}
    </div>
  `;
}

function renderResultItem(item, type) {
  const title = item.title || item.name;
  const image = item.poster_url || item.profile_url || fallbackPoster;
  const sub = type === "person"
    ? [item.known_for_department || "Persona", ...(item.known_for || [])].filter(Boolean).join(" | ")
    : [item.release_date?.slice(0, 4), item.vote_average ? `TMDB ${Number(item.vote_average).toFixed(1)}` : null].filter(Boolean).join(" | ");
  return `
    <button class="result-item" type="button" data-id="${item.id}" data-type="${type}">
      <img class="thumb" src="${image}" alt="${escapeHtml(title)}" loading="lazy">
      <span>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(sub || "Sin datos adicionales")}</small>
      </span>
    </button>
  `;
}

async function loadTrending() {
  setHomeLoading();
  try {
    const [featured, data] = await Promise.all([
      api("/movies/featured"),
      api("/movies/trending"),
    ]);
    const items = data.results || [];
    renderResults(items, "movie");
    els.resultsTitle.textContent = "Tendencias";
    if (featured?.id) {
      state.selectedMovie = featured;
      updateHero(featured, "movie");
      els.heroKicker.textContent = "Estreno destacado";
      renderMovie(featured);
    } else if (items[0]) {
      await openDetail(items[0].id, "movie");
    }
  } catch (error) {
    setError(error);
  }
}

async function openDetail(id, type) {
  state.selectedId = id;
  setLoading(type === "movie" ? "Cargando pelicula" : "Cargando persona");
  try {
    const data = await api(type === "movie" ? `/movies/${id}` : `/people/${id}`);
    document.querySelectorAll(".result-item").forEach((node) => {
      node.classList.toggle("active", Number(node.dataset.id) === Number(id) && node.dataset.type === type);
    });
    updateHero(data, type);
    if (type === "movie") {
      state.selectedMovie = data;
      renderMovie(data);
    } else {
      renderPerson(data);
    }
  } catch (error) {
    setError(error);
  }
}

function renderMovie(movie) {
  const genres = (movie.genres || []).map((genre) => genre.name).join(" | ");
  els.detailPanel.innerHTML = `
    <article>
      <div class="detail-hero" style="background-image: linear-gradient(90deg, rgba(4,11,22,.95), rgba(7,17,31,.54)), url('${movie.backdrop_url || movie.poster_url || ""}')">
        <img class="poster" src="${movie.poster_url || fallbackPoster}" alt="${escapeHtml(movie.title)}">
        <div class="detail-copy">
          <p class="eyebrow">${escapeHtml(genres || "Pelicula")}</p>
          <h2>${escapeHtml(movie.title)}</h2>
          <div class="meta-row">
            <span class="pill">${escapeHtml(movie.release_date || "Sin fecha")}</span>
            <span class="pill">${movie.runtime || "N/D"} min</span>
            <span class="pill rating-pill">TMDB ${Number(movie.vote_average || 0).toFixed(1)}</span>
            <span class="pill">Director: ${escapeHtml(movie.director || "No disponible")}</span>
          </div>
          <p>${escapeHtml(movie.overview || "Sin sinopsis disponible.")}</p>
          ${movie.trailer_url ? `<a class="link-button" href="${movie.trailer_url}" target="_blank" rel="noreferrer">Ver trailer</a>` : ""}
        </div>
      </div>
      <div class="detail-body">
        <section>
          <div class="section-heading"><h3>Reparto principal</h3><span>Clic para abrir actor</span></div>
          ${renderCarousel(renderPersonCards(movie.cast || []))}
        </section>
        <section>
          <div class="section-heading"><h3>Peliculas aleatorias recientes</h3><span>Clic para abrir pelicula</span></div>
          ${renderCarousel(renderMovieCards(movie.recommendations || []))}
        </section>
      </div>
    </article>
  `;
}

function renderPerson(person) {
  const biography = escapeHtml(person.biography || "Sin biografia disponible en TMDB para el idioma configurado.");
  els.detailPanel.innerHTML = `
    <article>
      <div class="detail-hero" style="background-image: linear-gradient(90deg, rgba(4,11,22,.95), rgba(7,17,31,.54)), url('${person.profile_url || ""}')">
        <img class="poster" src="${person.profile_url || fallbackPoster}" alt="${escapeHtml(person.name)}">
        <div class="detail-copy">
          <p class="eyebrow">${escapeHtml(person.known_for_department || "Persona")}</p>
          <h2>${escapeHtml(person.name)}</h2>
          <div class="meta-row">
            <span class="pill">${escapeHtml(person.birthday || "Nacimiento N/D")}</span>
            <span class="pill">${escapeHtml(person.place_of_birth || "Lugar N/D")}</span>
            <span class="pill">Popularidad ${Number(person.popularity || 0).toFixed(1)}</span>
          </div>
          <p class="bio-text is-collapsed" id="personBio">${biography}</p>
          <button class="read-more-button" type="button" data-toggle-bio>Leer mas</button>
        </div>
      </div>
      <div class="detail-body">
        <section>
          <div class="section-heading"><h3>Peliculas como actor</h3><span>Clic para abrir pelicula</span></div>
          ${renderCarousel(renderMovieCards(person.movies || []))}
        </section>
        <section>
          <div class="section-heading"><h3>Trabajo tecnico o creativo</h3><span>Direccion, guion y equipo</span></div>
          ${renderCarousel(renderMovieCards(person.crew_movies || []))}
        </section>
      </div>
    </article>
  `;
}

function renderPersonCards(items) {
  if (!items.length) return `<p class="muted">Sin informacion de reparto.</p>`;
  return items.map((person) => `
    <button class="media-card" type="button" data-open-person="${person.id}">
      <img src="${person.profile_url || fallbackPoster}" alt="${escapeHtml(person.name)}" loading="lazy">
      <strong>${escapeHtml(person.name)}</strong>
      <small>${escapeHtml(person.character || person.known_for_department || "")}</small>
    </button>
  `).join("");
}

function renderMovieCards(items) {
  if (!items.length) return `<p class="muted">Sin peliculas disponibles.</p>`;
  return items.map((movie) => `
    <button class="media-card" type="button" data-open-movie="${movie.id}">
      <img src="${movie.poster_url || fallbackPoster}" alt="${escapeHtml(movie.title)}" loading="lazy">
      <strong>${escapeHtml(movie.title)}</strong>
      <small>${escapeHtml(movie.character || movie.job || movie.release_date || "")}</small>
    </button>
  `).join("");
}

function renderCarousel(content) {
  return `
    <div class="carousel-shell">
      <button class="carousel-nav prev" type="button" onclick="moveCarousel(this, -1)" aria-label="Anterior">&lsaquo;</button>
      <div class="carousel">${content}</div>
      <button class="carousel-nav next" type="button" onclick="moveCarousel(this, 1)" aria-label="Siguiente">&rsaquo;</button>
    </div>
  `;
}

function moveCarousel(button, direction) {
  const carousel = button.closest(".carousel-shell")?.querySelector(".carousel");
  if (!carousel) return;

  const distance = Math.max(300, Math.floor(carousel.getBoundingClientRect().width * 0.82));
  carousel.scrollLeft = carousel.scrollLeft + (direction * distance);
}

els.searchButton.addEventListener("click", search);
els.searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") search();
});

els.filterChips.forEach((chip) => {
  chip.addEventListener("click", () => setFilter(chip.dataset.filter));
});

document.addEventListener("click", (event) => {
  const bioButton = event.target.closest("[data-toggle-bio]");
  if (bioButton) {
    const bio = document.querySelector("#personBio");
    if (!bio) return;
    const expanded = bio.classList.toggle("is-expanded");
    bio.classList.toggle("is-collapsed", !expanded);
    bioButton.textContent = expanded ? "Leer menos" : "Leer mas";
    return;
  }

  const result = event.target.closest("[data-id]");
  const movie = event.target.closest("[data-open-movie]");
  const person = event.target.closest("[data-open-person]");
  if (result) openDetail(result.dataset.id, result.dataset.type);
  if (movie) openDetail(movie.dataset.openMovie, "movie");
  if (person) openDetail(person.dataset.openPerson, "person");
});

loadTrending();
