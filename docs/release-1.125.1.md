# Версия 1.125.1 — GitHub Pages снова полный сайт

После 1.125.0 Pages выкладывал минифицированный `public/` (корень Firebase).
Сайт на github.io живёт в `/livescoring/`, поэтому `/index.html` из манифеста
открывал `xdramerx-debug.github.io/index.html` (404), а часть скриптов
не находилась.

1. Pages снова отдаёт исходники (`html/js/css/dist/…`), не `public/`.
2. `manifest.json` — относительные `./index.html` / `./` (и Firebase, и Pages).
3. QR печатных карточек берёт каталог страницы, не `origin + '/'`.
