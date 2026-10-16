'use strict';
/*
 * tools/test-check-pages-deps.js — целостность наборов скриптов.
 *
 * Почему отдельный тест: страницы и браузерные проверки собирают окружение
 * СПИСКОМ файлов (HTML — тегами <script>, tools/check-*.js — массивом для
 * addScriptTag, tools/harness/*.html — своей страницей-стендом). Список легко
 * устаревает: функцию выносят в общий модуль, а список остаётся прежним.
 *
 * Чем это кончается. Общий модуль просто не загружен → вызывается
 * несуществующая глобальная функция. На странице это падение в рантайме на
 * ровно одном экране (юнит-тесты его не видят: они грузят файл напрямую), а в
 * браузерной проверке — таймаут ожидания элемента, по которому непонятно даже,
 * какой модуль виноват. Так уже было дважды:
 *   • tools/check-*-mobile.js не грузили js/ui-events.js после перевода
 *     inline-обработчиков на делегирование — кнопки молча ничего не делали,
 *     а фичевые модули падали на pestovoOnAction при загрузке;
 *   • tools/harness/printcards.html не грузил js/qr-url.js после дедупликации
 *     построителя QR — вкладка печатных карточек падала на ReferenceError.
 *
 * Что проверяем: если подключённый файл вызывает функцию, которую экспортирует
 * один из общих модулей, сам модуль обязан быть в том же списке. Для страниц и
 * стендов rule полное (любой вызов: страница — это целое приложение, вызов
 * может случиться по любому маршруту), для браузерных проверок — вызовы на
 * уровне загрузки модуля плюс прямые вызовы самого сценария (проверка гонит
 * один сценарий, и требовать все транзитивные модули значило бы тащить за
 * utils.js половину js/).
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

// Модули, появившиеся при дедупликации: общее живёт в файле, страницы и
// проверки подключают его явно. Список намеренно явный — он же документация
// того, что обязательно тащить за собой.
const SHARED_MODULES = [
    'ui-events',      // делегирование вместо inline-обработчиков
    'score-display',  // лента лунок, шапка лунки, сверка счёта
    'score-kiosk',    // режим киоска (урлы и применение)
    'official-call',  // вызов судьи и маршала
    'qr-url'          // построитель URL картинки QR
];

function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

// Имена подключённых модулей: из `js/<name>.js` в тексте страницы.
function scriptModules(text) {
    const out = [];
    const re = /js\/([A-Za-z0-9_-]+)\.js/g;
    let m;
    while ((m = re.exec(text))) out.push(m[1]);
    return out;
}

function withoutComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

// Позиция закрывающей фигурной скобки для открывающей в start (или −1).
function matchBrace(src, start) {
    let depth = 0;
    let inStr = null;
    for (let i = start; i < src.length; i++) {
        const c = src[i];
        if (inStr) {
            if (c === '\\') { i++; continue; }
            if (c === inStr) inStr = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

// Исходник без тел функций: остаются только те вызовы, которые выполняются в
// момент загрузки модуля. Регулярка намеренно грубая (не разбирает методы в
// объектных литералах) — нам важно не пропустить вызов при загрузке, а
// ложное срабатывание лишь добавит лишнее требование к списку.
function topLevelSource(src) {
    let out = src;
    const re = /(function\s*[\w$]*\s*\([\s\S]*?\)|\)\s*=>|\b[\w$]+\s*=>)\s*\{/g;
    let guard = 0;
    let m;
    while ((m = re.exec(out)) && guard++ < 5000) {
        const brace = m.index + m[0].length - 1;
        const end = matchBrace(out, brace);
        if (end === -1) break;
        out = out.slice(0, brace + 1) + new Array(end - brace).join(' ') + out.slice(end);
        re.lastIndex = end;
    }
    return out;
}

function calls(src, name) {
    return new RegExp('(?<![\\w$.])' + name.replace(/\$/g, '\\$') + '\\s*\\(').test(src);
}

// ── Что экспортирует каждый общий модуль ──────────────────────────────────
const exportsByModule = new Map();
for (const mod of SHARED_MODULES) {
    const file = 'js/' + mod + '.js';
    assert.ok(fs.existsSync(path.join(ROOT, file)), 'нет файла ' + file + ' (список SHARED_MODULES устарел)');
    const src = withoutComments(read(file));
    const names = new Set();
    // Явный экспорт в window — так сделано во всех общих модулях, кроме
    // score-kiosk.js, где функции просто глобальные.
    (src.match(/window\.([A-Za-z_$][\w$]*)\s*=/g) || []).forEach(function (m) {
        names.add(m.replace(/^window\./, '').replace(/\s*=$/, ''));
    });
    (src.match(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm) || []).forEach(function (m) {
        names.add(m.replace(/^function\s+/, '').replace(/\s*\($/, ''));
    });
    assert.ok(names.size > 0, file + ': не нашёл ни одного экспорта — проверь формат модуля');
    exportsByModule.set(mod, names);
}

// ── Наборы скриптов, которые надо проверить ───────────────────────────────
const sets = [];

// 1. Страницы сайта.
fs.readdirSync(ROOT).filter(function (f) { return f.endsWith('.html'); }).forEach(function (page) {
    sets.push({ where: page, modules: scriptModules(read(page)) });
});

// 2. Служебные страницы-стенды для браузерных проверок.
const harnessDir = path.join(ROOT, 'tools', 'harness');
if (fs.existsSync(harnessDir)) {
    fs.readdirSync(harnessDir).filter(function (f) { return f.endsWith('.html'); }).forEach(function (f) {
        sets.push({ where: 'tools/harness/' + f, modules: scriptModules(read('tools/harness/' + f)) });
    });
}

// 3. Массивы модулей в tools/check-*.js (их отдают addScriptTag или
//    встраивают в HTML-фикстуру). Ищем массивы, где есть известный модуль:
//    это и есть список «что подключаем»; в этом же файле лежит сам сценарий.
const KNOWN = new Set(['ui-events', 'course-config', 'date-range', 'dom', 'format', 'i18n', 'utils',
    'score-display', 'score-kiosk', 'official-call', 'qr-url', 'pwa', 'live', 'scorer', 'admin-display']);
fs.readdirSync(path.join(ROOT, 'tools')).filter(function (f) {
    return /^check-.*\.js$/.test(f);
}).forEach(function (tool) {
    const src = read('tools/' + tool);
    const arrays = src.match(/\[[^\][]*'(?:ui-events|course-config|utils|format|dom|i18n)'[^\][]*\]/g) || [];
    arrays.forEach(function (raw, i) {
        const names = (raw.match(/'([A-Za-z0-9_-]+)'/g) || []).map(function (s) { return s.slice(1, -1); });
        const modules = names.filter(function (n) {
            return KNOWN.has(n) || fs.existsSync(path.join(ROOT, 'js', n + '.js'));
        });
        if (modules.length >= 2) {
            sets.push({ where: 'tools/' + tool + ' #' + (i + 1), modules: modules, source: src, check: true });
        }
    });
});

assert.ok(sets.length >= 18, 'наборов скриптов должно быть не меньше 18, найдено ' + sets.length);

// ── Проверка ──────────────────────────────────────────────────────────────
const problems = [];
const cache = new Map();
const cacheTop = new Map();
function moduleSource(name) {
    if (!cache.has(name)) cache.set(name, withoutComments(read('js/' + name + '.js')));
    return cache.get(name);
}
function moduleTopLevel(name) {
    if (!cacheTop.has(name)) cacheTop.set(name, topLevelSource(moduleSource(name)));
    return cacheTop.get(name);
}

for (const set of sets) {
    const loaded = new Set(set.modules);
    const probes = [];
    if (set.check) {
        // Проверка гонит один сценарий: требуем модули, без которых загрузка
        // не пройдёт, плюс те, чьи функции зовёт сам сценарий (в том числе
        // внутри page.evaluate — они лежат в этом же файле строками).
        Array.from(loaded).forEach(function (n) {
            if (fs.existsSync(path.join(ROOT, 'js', n + '.js'))) {
                probes.push({ name: n + '.js (при загрузке)', src: moduleTopLevel(n) });
            }
        });
        probes.push({ name: 'сценарий проверки', src: withoutComments(set.source) });
    } else {
        // Страница и стенд: приложение целиком, считаем любой вызов.
        Array.from(loaded).forEach(function (n) {
            if (fs.existsSync(path.join(ROOT, 'js', n + '.js'))) {
                probes.push({ name: n + '.js', src: moduleSource(n) });
            }
        });
    }
    for (const probe of probes) {
        for (const mod of SHARED_MODULES) {
            if (loaded.has(mod)) continue;
            for (const exported of exportsByModule.get(mod)) {
                if (calls(probe.src, exported)) {
                    problems.push(set.where + ': ' + probe.name + ' вызывает ' + exported +
                        '() из js/' + mod + '.js, а модуль не подключён');
                }
            }
        }
    }
}

assert.deepStrictEqual(problems, [],
    'набор скриптов вызывает функцию общего модуля, которого в наборе нет ' +
    '(на странице — падение в рантайме, в браузерной проверке — таймаут):\n  ' +
    problems.join('\n  '));

const pages = sets.filter(function (s) { return /\.html$/.test(s.where) && s.where.indexOf('/') === -1; }).length;
console.log('Page deps: наборов скриптов ' + sets.length + ' (страниц ' + pages +
    ', стендов и проверок ' + (sets.length - pages) + '); общих модулей ' + SHARED_MODULES.length +
    ' — ни один набор не ссылается на неподключённый модуль');
