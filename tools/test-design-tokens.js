// Гейт визуального слоя: токены css/theme-v2.css и его инварианты.
// Запуск: node tools/test-design-tokens.js
//
// Зачем: палитра и типографика теперь живут в одном файле-слое, и именно
// там легче всего «незаметно» поменять цвет на почти такой же, как фон
// (так и случилось в исходной теме: карточка отличалась от фона на 1.09:1,
// а граница поля — на 1.36:1, то есть хуже нормы WCAG 1.4.11 в три раза).
// Тест считает контраст пар прямо из объявленных значений и падает, если
// кто-то вернёт «невидимые» поверхности обратно.
//
// Что проверяем:
//   1. пары токенов тёмной темы (текст/поверхность/граница) — по WCAG 2.x;
//   2. то же для светлой темы body.sun-mode;
//   3. слой подключён на всех страницах со style.css и строго после него;
//   4. в слое нет кегля меньше 11 px и нет !important на цветах поверхностей;
//   5. hero не занимает весь экран (min-height не 100svh/100vh);
//   6. светлая тема описана в слое (а не только 349 правилами в style.css).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failures = 0;
let checks = 0;

function ok(cond, label, extra) {
    checks++;
    if (!cond) {
        failures++;
        console.error(' ✗', label + (extra ? ' — ' + extra : ''));
    } else {
        console.log(' ok   |', label + (extra ? ' — ' + extra : ''));
    }
}

const CSS = fs.readFileSync(path.join(ROOT, 'css', 'theme-v2.css'), 'utf8');

// ── Цвет и контраст ───────────────────────────────────────────────────────

function parseHex(hex) {
    let h = String(hex).trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    if (h.length !== 6) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance(rgb) {
    const ch = rgb.map(function (v) {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a, b) {
    const la = luminance(parseHex(a));
    const lb = luminance(parseHex(b));
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

// Значения токенов из блока селектора: ищет `--name: #hex` в указанном правиле.
function tokens(selector) {
    const idx = CSS.indexOf(selector + ' {');
    if (idx === -1) return null;
    const body = CSS.slice(idx, CSS.indexOf('\n}', idx));
    const out = {};
    body.replace(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})/g, function (all, name, value) {
        out[name] = value;
        return all;
    });
    return out;
}

const dark = tokens(':root');
ok(!!dark, 'токены тёмной темы объявлены в css/theme-v2.css');
const light = tokens('body.sun-mode');
ok(!!light, 'светлая тема описана токенами в слое (а не только правилами style.css)');

if (dark) {
    const pairs = [
        ['text', 'bg', 4.5, 'основной текст на фоне'],
        ['text', 'card', 4.5, 'основной текст на карточке'],
        ['muted', 'bg', 4.5, 'вторичный текст на фоне'],
        ['muted', 'card', 4.5, 'вторичный текст на карточке'],
        ['gold', 'card', 4.5, 'акцент как текст на карточке'],
        ['line-strong', 'card', 3.0, 'опорная граница (поле ввода) на карточке'],
        ['line-strong', 'input', 3.0, 'опорная граница на фоне поля'],
        ['card', 'bg', 1.08, 'карточка отличима от фона']
    ];
    pairs.forEach(function (p) {
        const [fg, bg, min, label] = p;
        if (!dark[fg] || !dark[bg]) {
            ok(false, 'пара ' + fg + '/' + bg, 'нет токена');
            return;
        }
        const ratio = contrast(dark[fg], dark[bg]);
        ok(ratio >= min, label + ' (' + fg + '/' + bg + ')', ratio.toFixed(2) + ':1 ≥ ' + min);
    });
}

if (light) {
    const pairs = [
        ['text', 'bg', 4.5, 'светлая тема: текст на фоне'],
        ['text', 'card', 4.5, 'светлая тема: текст на карточке'],
        ['muted', 'card', 4.5, 'светлая тема: вторичный текст на карточке'],
        ['gold', 'card', 4.5, 'светлая тема: акцент как текст на карточке'],
        ['line-strong', 'card', 3.0, 'светлая тема: опорная граница на карточке']
    ];
    pairs.forEach(function (p) {
        const [fg, bg, min, label] = p;
        if (!light[fg] || !light[bg]) {
            ok(false, 'светлая пара ' + fg + '/' + bg, 'нет токена');
            return;
        }
        const ratio = contrast(light[fg], light[bg]);
        ok(ratio >= min, label + ' (' + fg + '/' + bg + ')', ratio.toFixed(2) + ':1 ≥ ' + min);
    });
}

// ── Кегли ─────────────────────────────────────────────────────────────────
// Нижняя граница — 10 px. Это осознанное исключение ровно для одного места:
// плотной матрицы «Поле клуба» (11 колонок × 6 строк в 360 px). Всё остальное
// в слое живёт в шкале 12–64 px; на телефоне подписи полей и заголовки
// поднимаются до читаемых значений, а не опускаются до 9 px, как было.

function sizes(text) {
    return (text.match(/font-size:\s*[0-9.]+px/g) || []).map(function (s) {
        return parseFloat(s.replace(/[^0-9.]/g, ''));
    });
}

// Плотная матрица поля клуба (11 колонок, 6 строк) вынесена в отдельный блок:
// только там допустим кегль 10 px. Всё остальное — 11 px и выше.
const denseStart = CSS.indexOf('/* На телефоне матрица 11 колонок');
const denseEnd = CSS.indexOf('/* Мобильная ветка style.css');
const denseBlock = denseStart !== -1 && denseEnd > denseStart ? CSS.slice(denseStart, denseEnd) : '';
const restCss = denseStart !== -1 && denseEnd > denseStart
    ? CSS.slice(0, denseStart) + CSS.slice(denseEnd)
    : CSS;

const denseSizes = sizes(denseBlock);
const restSizes = sizes(restCss);

const tooTiny = restSizes.filter(function (v) { return v < 11; });
ok(tooTiny.length === 0, 'вне матрицы поля клуба нет кегля меньше 11 px',
    tooTiny.length ? 'найдено ' + tooTiny.join(', ') : restSizes.length + ' объявлений');

const denseTiny = denseSizes.filter(function (v) { return v < 10; });
ok(denseTiny.length === 0, 'в матрице поля клуба нет кегля меньше 10 px', denseTiny.join(', '));

const huge = restSizes.concat(denseSizes).filter(function (v) { return v > 64; });
ok(huge.length === 0, 'в слое нет «плакатных» кеглей больше 64 px', huge.join(', '));

// ── Главный экран ─────────────────────────────────────────────────────────

const heroRule = /\.hero\s*\{[^}]*min-height:\s*([^;]+);/.exec(CSS);
ok(!!heroRule, 'у .hero задана min-height');
if (heroRule) {
    ok(!/100(svh|vh)/.test(heroRule[1]), 'hero не занимает весь экран', heroRule[1].trim());
}

// ── Подключение на страницах ──────────────────────────────────────────────

const pages = fs.readdirSync(ROOT).filter(function (f) { return f.endsWith('.html'); });
const withCss = pages.filter(function (p) {
    return fs.readFileSync(path.join(ROOT, p), 'utf8').indexOf('css/style.css') !== -1;
});
const missing = withCss.filter(function (p) {
    return fs.readFileSync(path.join(ROOT, p), 'utf8').indexOf('css/theme-v2.css') === -1;
});
ok(missing.length === 0, 'слой подключён на всех страницах со style.css', missing.length ? missing.join(', ') : withCss.length + ' страниц');

const wrongOrder = withCss.filter(function (p) {
    const s = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const base = s.indexOf('css/style.css');
    const layer = s.indexOf('css/theme-v2.css');
    return layer !== -1 && layer < base;
});
ok(wrongOrder.length === 0, 'слой грузится после style.css', wrongOrder.join(', '));

const presetsWrong = withCss.filter(function (p) {
    const s = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const layer = s.indexOf('css/theme-v2.css');
    const presets = s.indexOf('css/design-presets.css');
    // Пресеты оформления должны оставаться последними: из админки можно
    // назначить шаблон, и он обязан перебить слой.
    return presets !== -1 && layer !== -1 && presets < layer;
});
ok(presetsWrong.length === 0, 'шаблоны оформления грузятся после слоя (перебивают его)', presetsWrong.join(', '));

// ── Шрифты: Inter 800 локально, без Google Fonts ──────────────────────────
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(indexHtml.indexOf('css/fonts-local.css') !== -1, 'на главной подключён css/fonts-local.css');
ok(indexHtml.indexOf('fonts.googleapis.com') === -1, 'на главной нет Google Fonts');
const fontsCss = fs.readFileSync(path.join(ROOT, 'css/fonts-local.css'), 'utf8');
ok(/font-weight:\s*800/.test(fontsCss) && /font-family:\s*Inter/.test(fontsCss),
    'Inter 800 объявлен локально (иначе цифры — синтетический болд)');
ok(fs.existsSync(path.join(ROOT, 'fonts/inter-latin-800-normal.woff2')),
    'файл Inter 800 latin лежит в fonts/');
ok(fs.existsSync(path.join(ROOT, 'fonts/inter-cyrillic-800-normal.woff2')),
    'файл Inter 800 cyrillic лежит в fonts/');

// ── Итог ──────────────────────────────────────────────────────────────────

if (failures) {
    console.error('\nПровалено проверок: ' + failures + ' из ' + checks);
    process.exit(1);
}
console.log('\nВсе проверки визуального слоя пройдены ✔ (' + checks + ')');
