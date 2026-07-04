💫 Skyline-Live-Weather-Dashboard
A single-page weather dashboard where the background is the weather: a living sky that shifts color, lighting, and motion to match real conditions anywhere on Earth — down to a glowing sun or moon that arcs across the screen based on the actual sunrise and sunset times for whatever city you search.

Live demo — (add your GitHub Pages link here once deployed)

Built with vanilla HTML, CSS & JavaScript — no frameworks, no build step, no API key required.

Features


🔍 City search with debounced, keyboard-navigable autocomplete (Open-Meteo geocoding API)
📍 Geolocation — one click to load the weather at your current position
☀️🌙 A real sun/moon — rendered as a glowing disc that moves across the sky in sync with the searched location's actual sunrise/sunset times, and dims automatically under cloud, rain, storm, or snow
🌥️ Volumetric clouds — soft-lit tops and shaded undersides instead of flat blurred shapes
🌧️❄️⛈️ A full animated sky — a hand-rolled <canvas> particle system renders rain, snow, fog haze, night stars, and storm lightning that match the current weather code
🌄 Horizon fade + film grain for a grounded, photographic feel rather than a flat color swatch
🎬 Splash intro — a brief animated welcome with the app's tagline on first load
🌡️ °C / °F toggle, saved between visits
📊 Full dashboard — current conditions, feels-like, humidity, wind, UV index, pressure, sunrise/sunset, a scrollable 24-hour strip, and a 5-day outlook with a temperature-range bar
💾 Persistence — last-viewed city and unit preference are remembered via localStorage
♿ Accessible — keyboard-navigable search suggestions, visible focus states, aria labeling, and full prefers-reduced-motion support
📱 Responsive down to small mobile screens
