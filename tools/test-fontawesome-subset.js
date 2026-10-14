// Проверка самодостаточного сабсета Font Awesome (аудит 2026-10, п.9).
//
// Проверяем не «файл существует», а что иконка реально нарисуется:
//   1. ни одна страница больше не тянет Font Awesome с cdnjs;
//   2. каждый класс fa-* в корпусе описан в сгенерированном CSS;
//   3. каждая кодовая точка из CSS физически присутствует в woff2, который
//      объявлен для нужного семейства (распаковываем woff2 → ttf и читаем
//      cmap) — иначе вместо иконки пустой прямоугольник, как это полгода
//      было с fa-swords/fa-users-plus/fa-users-rotate/fa-wifi-slash/
//      fa-arrow-down-to-bracket: имён нет в FA 6.5.0, они появились в FA 7;
//   4. сабсет актуален (не разошёлся с корпусом).
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FA_PKG = path.join(ROOT, 'node_modules/@fortawesome/fontawesome-free');
const CSS_REL = 'css/fontawesome-subset.css';
const CSS_PATH = path.join(ROOT, CSS_REL);
const FONTVERTER = require('fontverter'); // зависимость subset-font, тот же набор
const META = JSON.parse(fs.readFileSync(path.join(FA_PKG, 'metadata/icon-families.json'), 'utf8'));
const FA_VERSION = JSON.parse(fs.readFileSync(path.join(FA_PKG, 'package.json'), 'utf8')).version;

const FAMILIES = [
    { style: 'solid', weight: 900, slug: 'fa-solid-900' },
    { style: 'regular', weight: 400, slug: 'fa-regular-400' },
    { style: 'brands', weight: 400, slug: 'fa-brands-400' }
];

// ── 1. Внешний CDN больше не используется ─────────────────────────────────
const pagesWithCdn = [];
for (const f of fs.readdirSync(ROOT)) {
    if (!f.endsWith('.html')) continue;
    if (/cdnjs\.cloudflare\.com\/[^"']*font-awesome/.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))) {
        pagesWithCdn.push(f);
    }
}
assert.deepStrictEqual(pagesWithCdn, [],
    'страницы всё ещё грузят Font Awesome с cdnjs: ' + pagesWithCdn.join(', '));

// CSP: cdnjs остался только под xlsx (admin.html) — в стилях и шрифтах его нет.
const firebase = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
const csp = firebase.hosting.headers
    .flatMap(h => h.headers || [])
    .filter(x => x.header === 'Content-Security-Policy')
    .map(x => x.value)
    .pop();
assert.ok(csp, 'в firebase.json не найден заголовок Content-Security-Policy');
assert.ok(!/style-src[^;]*cdnjs/.test(csp), 'CSP: cdnjs в style-src больше не нужен — FA свой');
assert.ok(!/font-src[^;]*cdnjs/.test(csp), 'CSP: cdnjs в font-src больше не нужен — шрифты свои');

// ── 2. Подключение локального сабсета ─────────────────────────────────────
const cssExists = fs.existsSync(CSS_PATH);
assert.ok(cssExists, CSS_REL + ' отсутствует — выполните `npm run build:fonts`');
const css = fs.readFileSync(CSS_PATH, 'utf8');

let pages = [];
for (const f of fs.readdirSync(ROOT)) {
    if (!f.endsWith('.html')) continue;
    if (fs.readFileSync(path.join(ROOT, f), 'utf8').includes('fontawesome-subset.css')) pages.push(f);
}
assert.ok(pages.length >= 10, 'сабсет подключён только на ' + pages.length + ' страницах');
assert.ok(pages.includes('offline.html'),
    'offline.html обязан подключать иконки локально: это страница, которую показывают без сети');

// ── 3. Разбор сгенерированного CSS ────────────────────────────────────────
// Правило может описывать несколько селекторов сразу (каноническое имя и
// псевдоним), поэтому разбираем список через запятую, а не строку целиком.
const rules = new Map(); // 'fa-trophy' -> codepoint (number)
for (const line of css.split('\n')) {
    const m = /^((?:\.fa-[a-z0-9-]+::before)(?:, \.fa-[a-z0-9-]+::before)*) \{ content: "\\([0-9a-fA-F]+)"; \}$/.exec(line);
    if (!m) continue;
    for (const sel of m[1].split(', ')) rules.set(sel.slice(1, -8), parseInt(m[2], 16));
}
assert.ok(rules.size > 100, 'в сабсете всего ' + rules.size + ' иконок — что-то пошло не так');

const fontFaces = new Map(); // 'FA Subset|900' -> 'fonts/fa-solid-900-subset-<hash>.woff2'
for (const m of css.matchAll(/@font-face \{\s*font-family: "([^"]+)";\s*font-style: normal;\s*font-weight: (\d+);[^}]*?src: url\("\.\.\/([^"]+)"\)/g)) {
    fontFaces.set(m[1] + '|' + m[2], m[3]);
}
assert.strictEqual(fontFaces.size, FAMILIES.length,
    'ожидалось ' + FAMILIES.length + ' @font-face (solid/regular/brands), найдено ' + fontFaces.size);
for (const f of FAMILIES) {
    const family = f.style === 'brands' ? 'FA Subset Brands' : 'FA Subset';
    const src = fontFaces.get(family + '|' + f.weight);
    assert.ok(src, 'нет @font-face для ' + family + ' ' + f.weight);
    assert.ok(fs.existsSync(path.join(ROOT, src)), 'шрифт отсутствует на диске: ' + src);
    assert.match(path.basename(src), new RegExp('^' + f.slug + '-subset-[0-9a-f]{8}\\.woff2$'),
        'имя файла шрифта должно нести хеш содержимого: ' + src);
}
// Классы семейств ведут к нужной гарнитуре.
assert.match(css, /\.fa, \.fas, \.fa-solid \{[^}]*font-family: "FA Subset"[^}]*font-weight: 900/,
    '.fas должен вести к solid-гарнитуре');
assert.match(css, /\.far, \.fa-regular \{[^}]*font-family: "FA Subset"[^}]*font-weight: 400/,
    '.far должен вести к regular-гарнитуре');
assert.match(css, /\.fab, \.fa-brands \{[^}]*font-family: "FA Subset Brands"/,
    '.fab должен вести к brands-гарнитуре');

// ── 4. Каждый используемый класс описан в CSS ─────────────────────────────
const KNOWN_NON_ICONS = new Set(['fa-spin', 'fa-solid', 'fa-regular', 'fa-brands',
    'fa-light', 'fa-thin', 'fa-duotone', 'fa-sharp']);
const aliasTo = new Map();
for (const [name, e] of Object.entries(META)) {
    for (const a of (e.aliases && e.aliases.names) || []) aliasTo.set(a, name);
}

const corpus = [];
for (const f of fs.readdirSync(ROOT)) if (f.endsWith('.html')) corpus.push(f);
for (const dir of ['js', 'css', 'src']) {
    const walk = (d) => {
        if (!fs.existsSync(path.join(ROOT, d))) return;
        for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
            const rel = d + '/' + e.name;
            if (e.isDirectory()) walk(rel);
            else if (/\.(js|css|html)$/.test(e.name)) corpus.push(rel);
        }
    };
    walk(dir);
}

const usedTokens = new Map(); // 'fa-trophy' -> [{file,line}]
for (const file of corpus.filter(f => f !== CSS_REL)) {
    const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
        for (const m of line.matchAll(/\bfa-[a-z0-9-]+/g)) {
            if (!usedTokens.has(m[0])) usedTokens.set(m[0], []);
            usedTokens.get(m[0]).push(file + ':' + (i + 1));
        }
    });
}

const undocumented = [];
for (const tok of usedTokens.keys()) {
    if (KNOWN_NON_ICONS.has(tok)) continue;
    if (tok.endsWith('-')) continue; // динамический префикс ('fa-chevron-' + up|down)
    if (!rules.has(tok)) undocumented.push(tok + ' (' + usedTokens.get(tok).slice(0, 3).join(', ') + ')');
}
assert.deepStrictEqual(undocumented, [],
    'классы есть в разметке, но не описаны в сабсете: ' + undocumented.join('; '));

// Ни один используемый класс не должен быть «пустым» именем из будущих версий FA.
for (const tok of usedTokens.keys()) {
    if (KNOWN_NON_ICONS.has(tok) || tok.endsWith('-')) continue;
    const name = tok.slice(3);
    assert.ok(META[name] || aliasTo.has(name),
        tok + ' отсутствует в Font Awesome ' + FA_VERSION + ' — иконка нарисуется пустой');
}

async function checkGlyphs() {
// ── 5. Глифы физически присутствуют в шрифтах ─────────────────────────────
function readCmap(ttfBuf) {
    const buf = Buffer.from(ttfBuf);
    const numTables = buf.readUInt16BE(4);
    let cmapOff = null;
    for (let i = 0; i < numTables; i++) {
        const off = 12 + i * 16;
        if (buf.slice(off, off + 4).toString('latin1') === 'cmap') { cmapOff = buf.readUInt32BE(off + 8); break; }
    }
    assert.ok(cmapOff !== null, 'нет таблицы cmap');
    const n = buf.readUInt16BE(cmapOff + 2);
    let sub = null;
    for (let i = 0; i < n; i++) {
        const rec = cmapOff + 4 + i * 8;
        const plat = buf.readUInt16BE(rec), enc = buf.readUInt16BE(rec + 2);
        if ((plat === 3 && enc === 1) || (plat === 0 && enc === 3)) { sub = cmapOff + buf.readUInt32BE(rec + 4); break; }
    }
    assert.ok(sub !== null, 'нет unicode-подтаблицы cmap');
    const fmt = buf.readUInt16BE(sub);
    assert.strictEqual(fmt, 4, 'cmap формат ' + fmt + ' — проверку нужно расширить');
    const segX2 = buf.readUInt16BE(sub + 6);
    const seg = segX2 / 2;
    const endO = sub + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
    return function has(cp) {
        for (let i = 0; i < seg; i++) {
            const end = buf.readUInt16BE(endO + i * 2);
            if (cp > end) continue;
            const start = buf.readUInt16BE(startO + i * 2);
            if (cp < start) return false;
            const delta = buf.readInt16BE(deltaO + i * 2);
            const ro = buf.readUInt16BE(rangeO + i * 2);
            if (ro === 0) return ((cp + delta) & 0xffff) !== 0;
            const gi = buf.readUInt16BE(rangeO + i * 2 + ro + (cp - start) * 2);
            return gi === 0 ? false : ((gi + delta) & 0xffff) !== 0;
        }
        return false;
    };
}

const cmaps = {};
for (const f of FAMILIES) {
    const src = fontFaces.get((f.style === 'brands' ? 'FA Subset Brands' : 'FA Subset') + '|' + f.weight);
    // fontverter.convert() асинхронный, woff2 → ttf: читаем cmap распакованного шрифта.
    const ttf = await FONTVERTER.convert(fs.readFileSync(path.join(ROOT, src)), 'truetype');
    cmaps[f.style] = { has: readCmap(ttf), src };
}

// Для каждой иконки из CSS проверяем: во всех ли семействах, где она есть в
// бесплатной лицензии, присутствует её кодовая точка.
const missing = [];
for (const [cls, cp] of rules) {
    const name = cls.slice(3);
    const canonical = META[name] ? name : aliasTo.get(name);
    const styles = ((META[canonical].familyStylesByLicense || {}).free || []).map(s => s.style)
        .filter(s => FAMILIES.some(f => f.style === s));
    for (const st of styles) {
        if (!cmaps[st].has(cp)) missing.push(cls + ' (U+' + cp.toString(16) + ') в ' + st);
    }
}
assert.deepStrictEqual(missing, [],
    'кодовые точки из CSS отсутствуют в сабсете: ' + missing.join('; '));

// Обратная сторона: сабсет не должен раздуваться лишними глифами.
for (const f of FAMILIES) {
    const bytes = fs.statSync(path.join(ROOT, cmaps[f.style].src)).size;
    assert.ok(bytes < 60000, f.slug + ' весит ' + bytes + ' байт — сабсет не сузился');
}

// ── 6. Сабсет актуален ────────────────────────────────────────────────────
execFileSync(process.execPath, [path.join(__dirname, 'build-fontawesome.js'), '--check', '--quiet'],
    { cwd: ROOT, stdio: 'pipe' });

console.log('Font Awesome subset tests passed (FA ' + FA_VERSION + ': ' + rules.size + ' иконок, ' +
    FAMILIES.map(f => f.style + ' ' + fs.statSync(path.join(ROOT, cmaps[f.style].src)).size + ' б').join(', ') +
    ', страниц с локальными иконками: ' + pages.length + ')');
}

checkGlyphs().catch(function (e) {
    console.error('сабсет Font Awesome: ' + (e && e.message ? e.message : e));
    process.exit(1);
});
