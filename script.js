'use strict';

/* ============================================
   Splash intro — plays once, then fades out
   ============================================ */
(function initSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const delay = reduced ? 400 : 1900;
  setTimeout(() => {
    splash.classList.add('hide');
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
  }, delay);
})();

/* ============================================
   Constants & state
   ============================================ */
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const STORAGE_KEY_CITY = 'skyline.lastCity';
const STORAGE_KEY_UNIT = 'skyline.unit';

const state = {
  unit: localStorage.getItem(STORAGE_KEY_UNIT) || 'C',
  current: null, // last fetched weather payload (raw, in metric)
  place: null,   // { name, country, latitude, longitude, timezone }
};

// WMO weather code → { label, icon, theme }
// theme is used to pick the sky gradient / particle behavior
const WEATHER_CODES = {
  0:  { label: 'Clear sky',            icon: '☀', theme: 'clear' },
  1:  { label: 'Mostly clear',         icon: '🌤', theme: 'clear' },
  2:  { label: 'Partly cloudy',        icon: '⛅', theme: 'cloudy' },
  3:  { label: 'Overcast',             icon: '☁',  theme: 'cloudy' },
  45: { label: 'Fog',                  icon: '🌫', theme: 'fog' },
  48: { label: 'Depositing rime fog',  icon: '🌫', theme: 'fog' },
  51: { label: 'Light drizzle',        icon: '🌦', theme: 'rain' },
  53: { label: 'Drizzle',              icon: '🌦', theme: 'rain' },
  55: { label: 'Dense drizzle',        icon: '🌦', theme: 'rain' },
  56: { label: 'Freezing drizzle',     icon: '🌧', theme: 'rain' },
  57: { label: 'Dense freezing drizzle', icon: '🌧', theme: 'rain' },
  61: { label: 'Light rain',           icon: '🌧', theme: 'rain' },
  63: { label: 'Rain',                 icon: '🌧', theme: 'rain' },
  65: { label: 'Heavy rain',           icon: '🌧', theme: 'rain' },
  66: { label: 'Freezing rain',        icon: '🌧', theme: 'rain' },
  67: { label: 'Heavy freezing rain',  icon: '🌧', theme: 'rain' },
  71: { label: 'Light snow',           icon: '🌨', theme: 'snow' },
  73: { label: 'Snow',                 icon: '❄',  theme: 'snow' },
  75: { label: 'Heavy snow',           icon: '❄',  theme: 'snow' },
  77: { label: 'Snow grains',          icon: '❄',  theme: 'snow' },
  80: { label: 'Light showers',        icon: '🌦', theme: 'rain' },
  81: { label: 'Showers',              icon: '🌦', theme: 'rain' },
  82: { label: 'Violent showers',      icon: '⛈', theme: 'storm' },
  85: { label: 'Snow showers',         icon: '🌨', theme: 'snow' },
  86: { label: 'Heavy snow showers',   icon: '❄',  theme: 'snow' },
  95: { label: 'Thunderstorm',         icon: '⛈', theme: 'storm' },
  96: { label: 'Thunderstorm & hail',  icon: '⛈', theme: 'storm' },
  99: { label: 'Severe thunderstorm',  icon: '⛈', theme: 'storm' },
};

function weatherInfo(code) {
  return WEATHER_CODES[code] || { label: 'Unknown', icon: '❓', theme: 'clear' };
}

/* ============================================
   DOM references
   ============================================ */
const el = {
  searchForm: document.getElementById('search-form'),
  searchInput: document.getElementById('search-input'),
  suggestions: document.getElementById('suggestions'),
  locateBtn: document.getElementById('locate-btn'),
  unitToggle: document.getElementById('unit-toggle'),
  unitC: document.querySelector('.unit-c'),
  unitF: document.querySelector('.unit-f'),

  loadingState: document.getElementById('loading-state'),
  errorState: document.getElementById('error-state'),
  errorTitle: document.getElementById('error-title'),
  errorMessage: document.getElementById('error-message'),
  emptyState: document.getElementById('empty-state'),
  dashboard: document.getElementById('dashboard'),

  cityName: document.getElementById('city-name'),
  localTime: document.getElementById('local-time'),
  heroIcon: document.getElementById('hero-icon'),
  tempValue: document.getElementById('temp-value'),
  conditionText: document.getElementById('condition-text'),
  feelsLike: document.getElementById('feels-like'),
  hiLo: document.getElementById('hi-lo'),

  humidity: document.getElementById('detail-humidity'),
  wind: document.getElementById('detail-wind'),
  uv: document.getElementById('detail-uv'),
  pressure: document.getElementById('detail-pressure'),
  sunrise: document.getElementById('detail-sunrise'),
  sunset: document.getElementById('detail-sunset'),

  hourlyScroll: document.getElementById('hourly-scroll'),
  dailyList: document.getElementById('daily-list'),
  celestial: document.getElementById('celestial'),
};

/* ============================================
   View state management
   ============================================ */
function showState(name) {
  el.loadingState.hidden = name !== 'loading';
  el.errorState.hidden = name !== 'error';
  el.emptyState.hidden = name !== 'empty';
  el.dashboard.hidden = name !== 'dashboard';
}

function showError(title, message) {
  el.errorTitle.textContent = title;
  el.errorMessage.textContent = message;
  showState('error');
}

/* ============================================
   Unit helpers
   ============================================ */
function cToF(c) { return (c * 9) / 5 + 32; }

function formatTemp(celsius) {
  const val = state.unit === 'C' ? celsius : cToF(celsius);
  return Math.round(val);
}

function applyUnitUI() {
  el.unitC.classList.toggle('active', state.unit === 'C');
  el.unitF.classList.toggle('active', state.unit === 'F');
}

el.unitToggle.addEventListener('click', () => {
  state.unit = state.unit === 'C' ? 'F' : 'C';
  localStorage.setItem(STORAGE_KEY_UNIT, state.unit);
  applyUnitUI();
  if (state.current) renderDashboard(state.current, state.place);
});

applyUnitUI();

/* ============================================
   Geocoding search with debounce + suggestions
   ============================================ */
let debounceTimer = null;
let activeSuggestionIndex = -1;
let currentSuggestions = [];

el.searchInput.addEventListener('input', () => {
  const query = el.searchInput.value.trim();
  clearTimeout(debounceTimer);
  if (query.length < 2) {
    hideSuggestions();
    return;
  }
  debounceTimer = setTimeout(() => fetchSuggestions(query), 300);
});

el.searchInput.addEventListener('keydown', (e) => {
  if (el.suggestions.hidden) return;
  const items = [...el.suggestions.querySelectorAll('li')];
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, items.length - 1);
    highlightSuggestion(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
    highlightSuggestion(items);
  } else if (e.key === 'Enter') {
    if (activeSuggestionIndex >= 0 && currentSuggestions[activeSuggestionIndex]) {
      e.preventDefault();
      selectPlace(currentSuggestions[activeSuggestionIndex]);
    }
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
});

function highlightSuggestion(items) {
  items.forEach((li, i) => li.classList.toggle('active', i === activeSuggestionIndex));
  const active = items[activeSuggestionIndex];
  if (active) active.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('click', (e) => {
  if (!el.searchForm.contains(e.target)) hideSuggestions();
});

el.searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (currentSuggestions[0]) selectPlace(currentSuggestions[0]);
});

function hideSuggestions() {
  el.suggestions.hidden = true;
  el.suggestions.innerHTML = '';
  activeSuggestionIndex = -1;
  currentSuggestions = [];
  el.searchInput.setAttribute('aria-expanded', 'false');
}

async function fetchSuggestions(query) {
  try {
    const url = `${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Geocoding request failed');
    const data = await res.json();
    currentSuggestions = data.results || [];
    renderSuggestions(currentSuggestions);
  } catch (err) {
    hideSuggestions();
  }
}

function renderSuggestions(results) {
  if (!results.length) {
    hideSuggestions();
    return;
  }
  el.suggestions.innerHTML = results.map((r, i) => {
    const region = [r.admin1, r.country].filter(Boolean).join(', ');
    return `<li role="option" data-index="${i}">${escapeHtml(r.name)}<span class="suggestion-sub">${escapeHtml(region)}</span></li>`;
  }).join('');
  el.suggestions.hidden = false;
  el.searchInput.setAttribute('aria-expanded', 'true');
  activeSuggestionIndex = -1;

  [...el.suggestions.querySelectorAll('li')].forEach((li) => {
    li.addEventListener('click', () => {
      const idx = Number(li.dataset.index);
      selectPlace(currentSuggestions[idx]);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function selectPlace(place) {
  hideSuggestions();
  el.searchInput.value = `${place.name}${place.country ? ', ' + place.country : ''}`;
  loadWeatherForPlace({
    name: place.name,
    country: place.country || '',
    latitude: place.latitude,
    longitude: place.longitude,
    timezone: place.timezone,
  });
}

/* ============================================
   Geolocation
   ============================================ */
el.locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showError('Location unavailable', 'Your browser does not support geolocation.');
    return;
  }
  showState('loading');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const place = await reverseGeocode(latitude, longitude);
        loadWeatherForPlace(place);
      } catch {
        loadWeatherForPlace({ name: 'Your location', country: '', latitude, longitude });
      }
    },
    () => {
      showError('Location blocked', 'We could not access your location. Please allow location access or search for a city instead.');
    },
    { timeout: 10000 }
  );
});

async function reverseGeocode(lat, lon) {
  // Open-Meteo's geocoding API doesn't support reverse lookup directly,
  // so we fall back to a generic label and let the forecast call supply the timezone.
  return { name: 'Your location', country: '', latitude: lat, longitude: lon };
}

/* ============================================
   Forecast fetch + render
   ============================================ */
async function loadWeatherForPlace(place) {
  showState('loading');
  try {
    const params = new URLSearchParams({
      latitude: place.latitude,
      longitude: place.longitude,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,surface_pressure',
      hourly: 'temperature_2m,weather_code,precipitation_probability',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max',
      timezone: 'auto',
      forecast_days: '6',
    });
    const res = await fetch(`${FORECAST_URL}?${params.toString()}`);
    if (!res.ok) throw new Error('Forecast request failed');
    const data = await res.json();

    state.current = data;
    state.place = { ...place, timezone: data.timezone };
    localStorage.setItem(STORAGE_KEY_CITY, JSON.stringify(state.place));

    renderDashboard(data, state.place);
    showState('dashboard');
  } catch (err) {
    showError('Could not load weather', 'Something went wrong reaching the forecast service. Please try again.');
  }
}

function renderDashboard(data, place) {
  const { current, daily, hourly } = data;
  const info = weatherInfo(current.weather_code);
  const isDay = current.is_day === 1;

  // Update sky theme
  document.body.className = `weather-${info.theme} ${isDay ? 'is-day' : 'is-night'}`;
  setParticleMode(info.theme, isDay);
  updateCelestial(data, isDay, info.theme);

  // Hero
  el.cityName.textContent = place.country ? `${place.name}, ${place.country}` : place.name;
  el.localTime.textContent = formatLocalTime(data.timezone);
  el.heroIcon.textContent = info.icon;
  el.tempValue.textContent = formatTemp(current.temperature_2m);
  el.conditionText.textContent = info.label;
  el.feelsLike.textContent = `Feels like ${formatTemp(current.apparent_temperature)}°`;
  el.hiLo.textContent = `H: ${formatTemp(daily.temperature_2m_max[0])}°  L: ${formatTemp(daily.temperature_2m_min[0])}°`;

  // Details
  el.humidity.textContent = `${Math.round(current.relative_humidity_2m)}%`;
  el.wind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
  el.uv.textContent = daily.uv_index_max[0] != null ? daily.uv_index_max[0].toFixed(1) : '--';
  el.pressure.textContent = `${Math.round(current.surface_pressure)} hPa`;
  el.sunrise.textContent = formatTime(daily.sunrise[0]);
  el.sunset.textContent = formatTime(daily.sunset[0]);

  renderHourly(hourly, data.timezone);
  renderDaily(daily);
}

/* ============================================
   Celestial arc — positions a glowing sun/moon
   using real sunrise/sunset times for the place
   ============================================ */
function timeStringToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function isoTimeToMinutes(iso) {
  return timeStringToMinutes(iso.split('T')[1]);
}

function nowMinutesInTZ(timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === 'hour').value);
    const m = Number(parts.find((p) => p.type === 'minute').value);
    return h * 60 + m;
  } catch {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }
}

// Themes where cloud cover should dim or hide the celestial glow
const CELESTIAL_DIM = { cloudy: 0.4, fog: 0.3, rain: 0.18, storm: 0.08, snow: 0.35 };

function updateCelestial(data, isDay, theme) {
  if (!el.celestial) return;
  const { daily, timezone } = data;

  const sunriseMin = isoTimeToMinutes(daily.sunrise[0]);
  const sunsetMin = isoTimeToMinutes(daily.sunset[0]);
  const nextSunriseMin = daily.sunrise[1] ? isoTimeToMinutes(daily.sunrise[1]) + 1440 : sunriseMin + 1440;
  const nowMin = nowMinutesInTZ(timezone);

  let frac;
  if (isDay) {
    frac = (nowMin - sunriseMin) / Math.max(sunsetMin - sunriseMin, 1);
  } else {
    let n = nowMin < sunsetMin ? nowMin + 1440 : nowMin;
    frac = (n - sunsetMin) / Math.max(nextSunriseMin - sunsetMin, 1);
  }
  frac = Math.min(Math.max(frac, 0), 1);

  const xPct = 8 + frac * 84;               // travels left → right across the viewport
  const arc = Math.sin(frac * Math.PI);      // 0 at horizon, 1 at zenith
  const yPct = 80 - arc * 58;                // low near sunrise/sunset, high at midday/midnight

  el.celestial.style.setProperty('--cx', xPct + '%');
  el.celestial.style.setProperty('--cy', yPct + '%');
  el.celestial.classList.toggle('is-moon', !isDay);
  el.celestial.style.opacity = theme in CELESTIAL_DIM ? CELESTIAL_DIM[theme] : 1;

  // Keep the arc creeping forward in real time between searches
  state.celestialContext = { data, isDay, theme };
}

setInterval(() => {
  if (state.celestialContext) {
    const { data, isDay, theme } = state.celestialContext;
    updateCelestial(data, isDay, theme);
  }
}, 60000);

function formatLocalTime(timezone) {
  try {
    return new Date().toLocaleString('en-US', {
      timeZone: timezone,
      weekday: 'long',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatTime(isoString) {
  if (!isoString) return '--:--';
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function renderHourly(hourly, timezone) {
  const now = new Date();
  // Find the index closest to "now" in the hourly.time array
  let startIdx = hourly.time.findIndex((t) => new Date(t) >= now);
  if (startIdx === -1) startIdx = 0;

  const slice = hourly.time.slice(startIdx, startIdx + 24);
  el.hourlyScroll.innerHTML = slice.map((t, i) => {
    const idx = startIdx + i;
    const info = weatherInfo(hourly.weather_code[idx]);
    const hourLabel = new Date(t).toLocaleTimeString('en-US', { hour: 'numeric' });
    const temp = formatTemp(hourly.temperature_2m[idx]);
    return `
      <div class="hour-card">
        <span class="hour-time">${i === 0 ? 'Now' : hourLabel}</span>
        <span class="hour-icon" aria-hidden="true">${info.icon}</span>
        <span class="hour-temp">${temp}°</span>
      </div>`;
  }).join('');
}

function renderDaily(daily) {
  const globalMax = Math.max(...daily.temperature_2m_max);
  const globalMin = Math.min(...daily.temperature_2m_min);
  const range = Math.max(globalMax - globalMin, 1);

  el.dailyList.innerHTML = daily.time.slice(0, 5).map((t, i) => {
    const info = weatherInfo(daily.weather_code[i]);
    const dayLabel = i === 0 ? 'Today' : new Date(t).toLocaleDateString('en-US', { weekday: 'short' });
    const hi = formatTemp(daily.temperature_2m_max[i]);
    const lo = formatTemp(daily.temperature_2m_min[i]);
    const precip = daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : null;

    const leftPct = ((daily.temperature_2m_min[i] - globalMin) / range) * 100;
    const widthPct = ((daily.temperature_2m_max[i] - daily.temperature_2m_min[i]) / range) * 100;

    return `
      <div class="day-row">
        <span class="day-name">${dayLabel}</span>
        <span class="day-icon" aria-hidden="true">${info.icon} <span class="visually-hidden">${info.label}</span></span>
        <span class="day-precip">${precip != null ? precip + '% rain' : ''}</span>
        <span class="day-range">
          <span class="lo">${lo}°</span>
          <span class="bar" style="margin-left:${leftPct}%; width:${Math.max(widthPct, 8)}%;"></span>
          <span class="hi">${hi}°</span>
        </span>
      </div>`;
  }).join('');
}

/* ============================================
   Canvas particle system (sky signature element)
   ============================================ */
const canvas = document.getElementById('sky-canvas');
const ctx = canvas.getContext('2d');
let particles = [];
let animationFrame = null;
let currentMode = 'clear';
let currentIsDay = true;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function resizeCanvas() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function makeParticles(mode) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const arr = [];

  if (mode === 'rain' || mode === 'storm') {
    const count = mode === 'storm' ? 140 : 100;
    for (let i = 0; i < count; i++) {
      arr.push({
        x: Math.random() * w,
        y: Math.random() * h,
        len: 12 + Math.random() * 14,
        speed: 8 + Math.random() * 6,
        opacity: 0.25 + Math.random() * 0.35,
      });
    }
  } else if (mode === 'snow') {
    const count = 90;
    for (let i = 0; i < count; i++) {
      arr.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1.5 + Math.random() * 2.5,
        speed: 0.6 + Math.random() * 1.2,
        drift: Math.random() * 1 - 0.5,
        opacity: 0.4 + Math.random() * 0.5,
      });
    }
  } else if (mode === 'cloudy' || mode === 'fog') {
    const count = 6;
    for (let i = 0; i < count; i++) {
      arr.push({
        x: Math.random() * w,
        y: h * 0.1 + Math.random() * h * 0.5,
        r: 60 + Math.random() * 90,
        speed: 0.15 + Math.random() * 0.2,
        opacity: 0.08 + Math.random() * 0.1,
      });
    }
  } else if (mode === 'clear') {
    const count = 24;
    for (let i = 0; i < count; i++) {
      arr.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 1.4,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
  }
  return arr;
}

function setParticleMode(mode, isDay) {
  currentMode = mode;
  currentIsDay = isDay;
  particles = prefersReducedMotion ? [] : makeParticles(mode === 'clear' && isDay ? 'clear-day' : mode);
  if (!animationFrame) animate();
}

let lightningTimer = 0;
let lightningAlpha = 0;

function animate() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);

  if (currentMode === 'rain' || currentMode === 'storm') {
    ctx.strokeStyle = 'rgba(210, 226, 255, 0.6)';
    ctx.lineWidth = 1.4;
    particles.forEach((p) => {
      ctx.globalAlpha = p.opacity;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 2, p.y + p.len);
      ctx.stroke();
      p.y += p.speed;
      p.x -= 0.6;
      if (p.y > h) { p.y = -p.len; p.x = Math.random() * w; }
    });
    ctx.globalAlpha = 1;

    if (currentMode === 'storm') {
      lightningTimer++;
      if (lightningTimer > 130 + Math.random() * 150) {
        lightningTimer = 0;
        lightningAlpha = 0.55;
      }
      if (lightningAlpha > 0) {
        ctx.fillStyle = `rgba(255,255,255,${lightningAlpha})`;
        ctx.fillRect(0, 0, w, h);
        lightningAlpha -= 0.08;
      }
    }
  } else if (currentMode === 'snow') {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    particles.forEach((p) => {
      ctx.globalAlpha = p.opacity;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      p.y += p.speed;
      p.x += p.drift;
      if (p.y > h) { p.y = -4; p.x = Math.random() * w; }
    });
    ctx.globalAlpha = 1;
  } else if (currentMode === 'cloudy' || currentMode === 'fog') {
    particles.forEach((p) => {
      // Soft shadowed underside first, for a sense of volume
      const shadow = ctx.createRadialGradient(p.x, p.y + p.r * 0.35, 0, p.x, p.y + p.r * 0.35, p.r * 0.9);
      shadow.addColorStop(0, `rgba(10, 18, 40, ${p.opacity * 0.9})`);
      shadow.addColorStop(1, 'rgba(10, 18, 40, 0)');
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(p.x, p.y + p.r * 0.35, p.r * 0.9, 0, Math.PI * 2);
      ctx.fill();

      // Bright lit top
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      grad.addColorStop(0, `rgba(255,255,255,${p.opacity * 2.2})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      p.x += p.speed;
      if (p.x - p.r > w) p.x = -p.r;
    });
  } else if (currentMode === 'clear' && !currentIsDay) {
    ctx.fillStyle = '#fff';
    particles.forEach((p) => {
      p.twinkle += 0.02;
      ctx.globalAlpha = 0.5 + Math.sin(p.twinkle) * 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  animationFrame = requestAnimationFrame(animate);
}

/* ============================================
   Init
   ============================================ */
(function init() {
  setParticleMode('clear', true);

  const saved = localStorage.getItem(STORAGE_KEY_CITY);
  if (saved) {
    try {
      const place = JSON.parse(saved);
      el.searchInput.value = place.country ? `${place.name}, ${place.country}` : place.name;
      loadWeatherForPlace(place);
      return;
    } catch { /* fall through to empty state */ }
  }
  showState('empty');
})();
