// PWA-конфигурация: manifest.json + sw.js (аудит 2026-10, п.18 и п.19).
//
// Манифест и сервис-воркер — то, что нельзя «пощупать» в обычном тесте: ошибка
// здесь всплывает на устройстве пользователя (иконка обрезана, приложение не
// ставится, кэш растёт без предела). Поэтому проверяем структурно и по байтам.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');
const root = path.join(__dirname, '..');

const manifestPath = path.join(root, 'manifest.json');
const raw = fs.readFileSync(manifestPath, 'utf8');
const m = JSON.parse(raw);
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const cfg = fs.readFileSync(path.join(root, 'js/firebase-config.js'), 'utf8');

// ── 1. Манифест: относительные URL (Firebase в корне и GitHub Pages в /livescoring/) ──
// Абсолютные "/index.html" на github.io уезжают на xdramerx-debug.github.io/index.html
// (404) — половина ярлыков PWA и «Открыть» ломаются. "./" резолвится от
// расположения manifest.json: на web.app это корень, на Pages — /livescoring/.
assert.strictEqual(m.id, './', 'id относительный к каталогу сайта');
assert.strictEqual(m.start_url, './index.html', 'start_url относительный');
assert.strictEqual(m.scope, './', 'scope относительный');
assert.ok(m.start_url.startsWith(m.scope), 'start_url обязан лежать внутри scope');
assert.strictEqual(m.display, 'standalone');
assert.deepStrictEqual(m.display_override, ['standalone', 'browser']);
assert.strictEqual(m.lang, 'ru', 'язык приложения — русский');
['name', 'short_name', 'description'].forEach(k => {
    assert.ok(typeof m[k] === 'string' && m[k].length > 0, k + ' заполнен');
    assert.ok(m[k].length <= 60, k + ' не длиннее 60 символов (иначе обрезается в UI)');
});
assert.match(m.background_color, /^#[0-9a-f]{6}$/i, 'background_color — шестизначный hex');
assert.match(m.theme_color, /^#[0-9a-f]{6}$/i, 'theme_color — шестизначный hex');
assert.strictEqual(m.background_color, m.theme_color,
    'цвета совпадают: иначе при запуске виден скачок цвета splash → UI');

// orientation — осознанное решение, а не забывчивость.
// "portrait" оставлен намеренно: ландшафтных стилей в проекте нет
// (grep по css/*.css и *.html не находит @media (orientation: landscape)),
// а страницы ввода счёта сверстаны под узкий экран. Смена на "any" улучшила бы
// планшеты, но открыла бы непроверенные раскладки — это продуктовое решение,
// требующее прогона на устройстве. Значение фиксируем, чтобы смена была явной.
assert.strictEqual(m.orientation, 'portrait',
    'orientation изменён: это продуктовое решение, см. комментарий в tools/test-pwa-config.js');

// ── 2. Иконки: файлы существуют, размеры совпадают с заявленными ──
function pngSize(file) {
    const b = fs.readFileSync(file);
    assert.deepStrictEqual([...b.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        file + ' — не PNG');
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b };
}
function pngDecode(file) {
    const b = fs.readFileSync(file);
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    const depth = b[24], ctype = b[25], interlace = b[28];
    assert.strictEqual(depth, 8, file + ': ожидается 8 бит на канал');
    assert.strictEqual(ctype, 6, file + ': ожидается RGBA (color type 6)');
    assert.strictEqual(interlace, 0, file + ': interlace не поддерживается декодером теста');
    let idat = Buffer.alloc(0);
    for (let i = 8; i < b.length;) {
        const len = b.readUInt32BE(i);
        const type = b.slice(i + 4, i + 8).toString('latin1');
        if (type === 'IDAT') idat = Buffer.concat([idat, b.slice(i + 8, i + 8 + len)]);
        i += 12 + len;
    }
    const rawBuf = zlib.inflateSync(idat);
    const bpp = 4, stride = w * bpp;
    const out = Buffer.alloc(h * stride);
    const prev = Buffer.alloc(stride);
    let pos = 0;
    for (let y = 0; y < h; y++) {
        const ft = rawBuf[pos++];
        const line = Buffer.from(rawBuf.slice(pos, pos + stride)); pos += stride;
        for (let x = 0; x < stride; x++) {
            const a = x >= bpp ? line[x - bpp] : 0;
            const bb = prev[x];
            const c = x >= bpp ? prev[x - bpp] : 0;
            let v = line[x];
            if (ft === 1) v += a;
            else if (ft === 2) v += bb;
            else if (ft === 3) v += (a + bb) >> 1;
            else if (ft === 4) {
                const p = a + bb - c;
                const pa = Math.abs(p - a), pb = Math.abs(p - bb), pc = Math.abs(p - c);
                v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c);
            }
            line[x] = v & 255;
        }
        line.copy(out, y * stride);
        line.copy(prev, 0);
    }
    return { w, h, px: out };
}

const sizes = new Set();
const purposes = new Set();
for (const icon of m.icons) {
    const file = path.join(root, icon.src);
    assert.ok(fs.existsSync(file), 'иконка существует: ' + icon.src);
    const { w, h } = pngSize(file);
    assert.strictEqual(icon.sizes, w + 'x' + h,
        icon.src + ': в манифесте заявлено ' + icon.sizes + ', в файле ' + w + 'x' + h);
    assert.strictEqual(icon.type, 'image/png');
    assert.ok(['any', 'maskable', 'any maskable'].includes(icon.purpose),
        icon.src + ': неизвестное purpose ' + icon.purpose);
    sizes.add(w);
    purposes.add(icon.purpose);
}
assert.ok(sizes.has(192), 'есть иконка 192×192 (минимум для установки на Android)');
assert.ok(sizes.has(512), 'есть иконка 512×512 (splash и магазин)');
assert.ok(purposes.has('maskable'), 'есть maskable-иконка (адаптивная на Android)');

// ── 3. Safe-zone для maskable: измеряем по пикселям ──
// Аудит предполагал, что один и тот же PNG без отступа обрежется под маской.
// Замер это опроверг: артикул занимает 79.7% стороны, а внешнее кольцо в 10%
// идеально однородно — то есть иконка УЖЕ соответствует safe-zone (центральный
// круг диаметром 80%). Проверяем, чтобы замена арта это не сломала.
for (const icon of m.icons.filter(i => i.purpose.includes('maskable'))) {
    const { w, h, px } = pngDecode(path.join(root, icon.src));
    const bg = [px[0], px[1], px[2], px[3]];
    const differs = (x, y, thr) => {
        const o = (y * w + x) * 4;
        for (let i = 0; i < 4; i++) if (Math.abs(px[o + i] - bg[i]) > thr) return true;
        return false;
    };
    let minx = w, miny = h, maxx = -1, maxy = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (differs(x, y, 24)) {
                if (x < minx) minx = x;
                if (x > maxx) maxx = x;
                if (y < miny) miny = y;
                if (y > maxy) maxy = y;
            }
        }
    }
    assert.ok(maxx >= 0, icon.src + ': в иконке есть видимый контент');
    const contentSide = Math.max(maxx - minx + 1, maxy - miny + 1);
    const share = contentSide / w;
    assert.ok(share <= 0.80 + 1e-9,
        icon.src + ': контент занимает ' + (share * 100).toFixed(1) + '% стороны — больше safe-zone 80%, маска обрежет края');
    // Внешнее кольцо в 10% должно быть однородным фоном: иначе под круглой
    // маской появятся рваные края.
    const ring = Math.round(w * 0.1);
    let ringDiff = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (x < ring || x >= w - ring || y < ring || y >= h - ring) {
                if (differs(x, y, 6)) ringDiff++;
            }
        }
    }
    assert.strictEqual(ringDiff, 0,
        icon.src + ': внешнее кольцо ' + ring + 'px неоднородно (' + ringDiff + ' пикселей) — маска даст рваный край');
    console.log('  ' + icon.src + ': контент ' + (share * 100).toFixed(1) + '% стороны, кольцо чистое — safe-zone соблюдена');
}

// ── 4. Shortcuts ──
assert.ok(Array.isArray(m.shortcuts) && m.shortcuts.length >= 2, 'shortcuts заданы');
for (const sc of m.shortcuts) {
    assert.ok(sc.name && sc.name.length <= 40, 'shortcut name заполнен и ≤ 40 символов');
    assert.ok(sc.short_name && sc.short_name.length <= 12,
        'short_name ≤ 12 символов (иначе обрезается в меню): ' + sc.short_name);
    assert.ok(sc.url.startsWith('./'), 'url шортката относительный: ' + sc.url);
    assert.ok(sc.url.startsWith(m.scope), 'url шортката внутри scope');
    const target = path.join(root, sc.url.replace(/^\.\//, ''));
    assert.ok(fs.existsSync(target), 'страница шортката существует: ' + sc.url);
    if (sc.icons) {
        for (const ic of sc.icons) {
            assert.ok(fs.existsSync(path.join(root, ic.src)), 'иконка шортката существует: ' + ic.src);
        }
    }
}
const urls = m.shortcuts.map(s => s.url);
assert.strictEqual(new Set(urls).size, urls.length, 'шорткаты не дублируются');

// ── 5. sw.js: LRU-подрезка CDN-кэша (п.19) ──
assert.match(sw, /const CDN_CACHE_LIMIT = (\d+);/, 'задан предел CDN-кэша');
const limit = Number(/const CDN_CACHE_LIMIT = (\d+);/.exec(sw)[1]);
assert.ok(limit >= 20 && limit <= 200, 'предел разумен: ' + limit);
assert.match(sw, /function trimCache\(cache, limit\)/, 'есть функция подрезки');
assert.match(sw, /keys\.slice\(0, keys\.length - limit\)/,
    'подрезка удаляет СТАРЕЙШИЕ записи (Cache Storage отдаёт ключи в порядке добавления)');
assert.match(sw, /if \(keys\.length <= limit\) return null;/, 'подрезка ничего не делает в пределах лимита');
assert.match(sw, /cacheName === CDN_CACHE \? trimCache\(cache, CDN_CACHE_LIMIT\) : null/,
    'в SWR подрезается только CDN-кэш, основной precache не трогается');
assert.match(sw, /cache\.put\(request, response\.clone\(\)\)\.then\(/,
    'подрезка идёт после put, а не вместо него');
assert.match(sw, /caches\.has\(CDN_CACHE\)/,
    'activate() не создаёт пустой CDN-кэш у новой установки');
assert.match(sw, /return name !== CACHE_NAME && name !== CDN_CACHE;/,
    'activate() по-прежнему сохраняет оба рабочих кэша');
// Основной precache чистится сменой CACHE_NAME, а не LRU — проверим, что
// подрезка к нему не применяется.
assert.ok(!/trimCache\(cache, CDN_CACHE_LIMIT\);\s*\}\s*\)\s*;?\s*\/\/ precache/.test(sw));

// ── 6. VAPID-URL не должен разъезжаться с firebase-config.js ──
const dbUrl = /databaseURL:\s*"([^"]+)"/.exec(cfg);
assert.ok(dbUrl, 'в js/firebase-config.js есть databaseURL');
const swUrl = /(https:\/\/[^'"\s]+\/settings\/vapid_public_key\.json)/.exec(sw);
assert.ok(swUrl, 'в sw.js есть URL публичного VAPID-ключа');
assert.strictEqual(swUrl[1], dbUrl[1] + '/settings/vapid_public_key.json',
    'sw.js хардкодит URL базы, который должен совпадать с databaseURL из js/firebase-config.js. ' +
    'Классический воркер не может импортировать конфиг, поэтому совпадение держит этот тест: ' +
    'при смене проекта править нужно оба файла.');
// Ключ читается без кэша — иначе после ротации воркер подпишется старым ключом.
assert.match(sw, /cache: 'no-store'/, 'VAPID-ключ запрашивается без кэша');
assert.match(sw, /urlBase64ToUint8Array/, 'applicationServerKey приводится к Uint8Array');

console.log('PWA config tests passed (иконок: ' + m.icons.length + ', шорткатов: ' +
    m.shortcuts.length + ', предел CDN-кэша: ' + limit + ')');
