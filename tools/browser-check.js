#!/usr/bin/env node
'use strict';
/*
 * browser-check.js — живая браузерная проверка страниц (варианты classic/bundle).
 *
 * Зачем: docs/CODE-REVIEW.md п.1 — перевод страниц с классических <script>
 * на ESM-бандл (dist/livescoring-modules.js). Модульные скрипты откладываются
 * (defer), поэтому порядок выполнения меняется: бандл считается ПОСЛЕ всех
 * классических скриптов, но ДО обработчиков DOMContentLoaded. В Node этого не
 * видно — нужен реальный браузер.
 *
 * Что делает: каждую страницу грузит дважды в двух вариантах и сравнивает:
 *   classic — фундамент (course-config/format/date-range/safe-html/dom/i18n/official-alerts)
 *             отдельными классическими <script>, как было до миграции;
 *   bundle  — один <script type="module" src="dist/livescoring-modules.js">.
 * Сравниваются:
 *   — ошибки страницы (pageerror / console.error / упавшие локальные запросы);
 *   — снимок состояния: lang, классы body, заголовок, хеш разметки навигации
 *     и тела, наличие всех глобалов фундамента, рабочие пробы (t, esc,
 *     fmtScore, holePar, fmtTime, holeResName, toast, toggleLang).
 * Вариант classic восстанавливается из HTML на лету (тег модуля заменяется
 * шестью классическими тегами и наоборот), поэтому проверка работает и до,
 * и после переключения страниц.
 *
 * Окружение:
 *   — ВСЕ запросы вне локального сервера блокируются, вместо Firebase SDK
 *     подставляется заглушка (initScript) — проверка детерминирована и работает
 *     офлайн. Без этого в CI (где сеть есть) страницы грузили настоящий Firebase
 *     SDK с CDN и вели себя иначе, чем в офлайн-песочнице;
 *   — текст, который рисуют таймеры (часы, обратный отсчёт, «N минут назад»),
 *     нормализуется перед хешированием: два прогона снимают состояние в разные
 *     секунды, и без нормализации хеши разной разметки не сходились бы;
 *   — sw.js блокируется, чтобы Service Worker не кэшировал страницы;
 *   — браузер ищется в порядке: CHROMIUM_PATH → playwright (свой chromium)
 *     → @sparticuz/chromium (бандл в node_modules, скачивание не нужно).
 *     Если браузера нет — проверка пропускается (exit 0), если только не
 *     передан --require.
 *   — CHROMIUM_EXTRA_LIBS=/path — каталог с дополнительными .so (в песочнице
 *     без системных libnss3/libnspr4: tools/build-stub-libs.sh).
 *
 * Запуск:
 *   node tools/browser-check.js                        # все страницы, оба варианта
 *   node tools/browser-check.js --pages=index.html,leaderboard.html
 *   node tools/browser-check.js --variant=bundle       # только бандл
 *   node tools/browser-check.js --require              # падать, если нет браузера
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── CLI ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function argValue(name, dflt) {
    const hit = argv.find(function (a) { return a.indexOf(name + '=') === 0; });
    return hit ? hit.slice(name.length + 1) : dflt;
}
const ONLY_PAGES = argValue('--pages', '').split(',').filter(Boolean);
const VARIANT = argValue('--variant', 'both'); // both | classic | bundle
const REQUIRE_BROWSER = argv.includes('--require');

// ── Страницы и фундамент ──────────────────────────────────────────────────
const ALL_PAGES = fs.readdirSync(ROOT).filter(function (f) { return f.endsWith('.html'); }).sort();

// Фундамент: классические скрипты ↔ один ESM-бандл (src/index.js).
const FOUNDATION_FILES = [
    'js/course-config.js', 'js/format.js', 'js/date-range.js', 'js/safe-html.js',
    'js/dom.js', 'js/i18n.js', 'js/official-alerts.js'
];
const MODULE_SRC = 'dist/livescoring-modules.js';
// qr-start.html намеренно живёт без фундамента (свой мини-скрипт) — не контролируем.
const NO_FOUNDATION_PAGES = ['qr-start.html'];

// Глобалы, которые обязаны быть на window после загрузки фундамента.
const FOUNDATION_GLOBALS = [
    'CLUB', 'TOTAL_PAR', 'ADDR', 'HOLES', 'TIMINGS', 'TEES', 'TEE_ORDER', 'COURSE_RATINGS',
    'holePar', 'holeDist', 'holeHcp', 'holeTiming',
    'fmtScore', 'scoreClass', 'holeResClass', 'holeResName',
    'esc', 'html', 'setSafeHtml',
    'TOAST_DURATION_MS', 'ensureToastRoot', 'toastIconFor', 'toast', 'toastSequence',
    'isPlayerModeEnabled', 'vib', 'escapeHtml',
    'currentLang', 'I18N', 't', 'toggleLang', 'updateLangButtons', 'applyTranslations', 'updateFooterYear',
    'buildOfficialCallText', 'sendTelegramDirectAlert', 'sendTelegramSilentAlert', 'sendTelegramOfficialAlert',
    'vkSendMessageJsonp', 'vkBuildAlertText', 'sendVKDirectAlert', 'sendVKSilentAlert', 'sendVKOfficialAlert'
];

// Положительные проверки: A/B-сравнение ловит только РАЗНИЦУ между вариантами,
// поэтому для ключевых страниц дополнительно требуем, что страница реально
// отрисовалась (баг, одинаковый в обоих вариантах, иначе прошёл бы незамеченным).
const PAGE_EXPECTATIONS = {
    'index.html': 'document.querySelectorAll(".nav-link").length >= 7 && !!document.querySelector(".hero")',
    'hcp-badge-preview.html': 'document.querySelectorAll(".mock-cards .card").length >= 3 && document.querySelectorAll(".mock-profile .card").length >= 1',
    'admin.html': 'typeof openAdminPanel === "function" && typeof switchTab === "function" && document.querySelectorAll(".admin-tab").length >= 3',
    'setup-round.html': 'document.querySelectorAll("select option").length >= 18 && !!document.getElementById("player-slots")',
    'leaderboard.html': '!!document.getElementById("lb-container") && typeof loadLB === "function"',
    'stats.html': '!!document.getElementById("general-stats") && typeof loadStats === "function"',
    'tournaments.html': '!!document.getElementById("tn-public-catalog") && typeof loadTournaments === "function"',
    'scorer.html': 'typeof loadSc === "function" && !!document.getElementById("sc-err")',
    'marker.html': 'typeof loadMk === "function"',
    'players.html': '!!document.getElementById("players-list") || document.body.innerText.length > 50',
    'auth.html': '!!document.getElementById("auth-page") && document.querySelectorAll("input").length >= 2'
};

// ── Преобразование HTML в нужный вариант ──────────────────────────────────
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function scriptTagRe(file) {
    return new RegExp('<script\\s+src="' + escapeRe(file) + '(?:\\?v=[0-9a-zA-Z]+)?"\\s*(?:/>|></script>)', 'i');
}
function moduleTagRe() {
    return new RegExp('<script\\s+type="module"\\s+src="' + escapeRe(MODULE_SRC) + '(?:\\?v=[0-9a-zA-Z]+)?"\\s*(?:/>|></script>)', 'i');
}
const CLASSIC_BLOCK_RE = new RegExp(
    FOUNDATION_FILES.map(function (f) { return scriptTagRe(f).source; }).join('\\s*'), 'i');

function toVariant(html, variant) {
    if (variant === 'bundle') {
        if (CLASSIC_BLOCK_RE.test(html)) {
            const moduleTag = '<script type="module" src="' + MODULE_SRC + '"></script>';
            return { html: html.replace(CLASSIC_BLOCK_RE, moduleTag), switched: true };
        }
        return { html: html, switched: false };
    }
    const classic = FOUNDATION_FILES.map(function (f) { return '<script src="' + f + '"></script>'; }).join('\n');
    if (moduleTagRe().test(html)) return { html: html.replace(moduleTagRe(), classic), switched: true };
    return { html: html, switched: false };
}

// ── Заглушка Firebase ─────────────────────────────────────────────────────
// Страницы рассчитывают на window.firebase из CDN. В проверке CDN заблокирован,
// поэтому подставляем минимальный совместимый стаб: слушатели не срабатывают,
// чтения резолвятся пустым снимком — состояние детерминировано.
const FIREBASE_STUB = [
    '(function () {',
    '    function emptySnap(key) {',
    '        return {',
    '            key: key || null, exists: function () { return false; },',
    '            val: function () { return null; }, hasChildren: function () { return false; },',
    '            forEach: function () { return false; }, numChildren: function () { return 0; },',
    '            child: function (k) { return emptySnap(k); }, exportVal: function () { return null; }',
    '        };',
    '    }',
    '    var counter = 0;',
    '    function makeRef(db, key) {',
    '        var ref = {',
    '            key: key, ref: function () { return ref; },',
    '            child: function (k) { return makeRef(db, (key ? key + "/" : "") + k); },',
    '            on: function () { return ref; }, off: function () { return ref; },',
    '            once: function () { return Promise.resolve(emptySnap(key)); },',
    '            set: function () { return Promise.resolve(null); },',
    '            update: function () { return Promise.resolve(null); },',
    '            remove: function () { return Promise.resolve(null); },',
    '            push: function () { return makeRef(db, (key ? key + "/" : "") + "stub" + (++counter)); },',
    '            transaction: function () { return Promise.resolve({ committed: false, snapshot: emptySnap(key) }); },',
    '            orderByChild: function () { return ref; }, orderByKey: function () { return ref; },',
    '            orderByValue: function () { return ref; }, equalTo: function () { return ref; },',
    '            limitToFirst: function () { return ref; }, limitToLast: function () { return ref; },',
    '            startAt: function () { return ref; }, endAt: function () { return ref; },',
    '            goOnline: function () { return Promise.resolve(); },',
    '            goOffline: function () { return Promise.resolve(); },',
    '            keepSynced: function () { return Promise.resolve(); },',
    '            toString: function () { return "stub://" + (key || ""); }',
    '        };',
    '        return ref;',
    '    }',
    '    var db = {',
    '        ref: function (p) { return makeRef(db, String(p || "")); },',
    '        goOnline: function () { return Promise.resolve(); },',
    '        goOffline: function () { return Promise.resolve(); },',
    '        app: { options: { databaseURL: "https://stub.invalid" } }',
    '    };',
    '    var PERSISTENCE = { LOCAL: "local", SESSION: "session", NONE: "none" };',
    '    var auth = {',
    '        currentUser: null,',
    '        onAuthStateChanged: function () { return function () {}; },',
    '        signOut: function () { return Promise.resolve(); },',
    '        setPersistence: function () { return Promise.resolve(); },',
    '        sendPasswordResetEmail: function () { return Promise.resolve(); },',
    '        signInWithEmailAndPassword: function () { return Promise.reject(new Error("stub")); },',
    '        createUserWithEmailAndPassword: function () { return Promise.reject(new Error("stub")); },',
    '        signInAnonymously: function () { return Promise.reject(new Error("stub")); }',
    '    };',
    '    // js/auth.js читает firebase.auth.Auth.Persistence.LOCAL — свойство самой функции',
    '    function firebaseAuth() { return auth; }',
    '    firebaseAuth.Auth = { Persistence: PERSISTENCE };',
    '    window.firebase = {',
    '        initializeApp: function () { return { name: "stub", options: {} }; },',
    '        app: function () { return { name: "stub", options: {} }; },',
    '        database: function () { return db; },',
    '        auth: firebaseAuth,',
    '        messaging: function () { return { getToken: function () { return Promise.resolve(null); }, onMessage: function () { return function () {}; } }; }',
    '    };',
    '})();'
].join('\n');

// ── Снимок состояния страницы (выполняется в браузере) ────────────────────
function snapshotScript() {
    return function () {
        function hash(s) {
            var h = 5381, i;
            for (i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
            return ('00000000' + h.toString(16)).slice(-8);
        }
        function safe(fn) { try { return fn(); } catch (e) { return 'ERR:' + (e && e.message); } }
        // Варианты различаются только служебными переводами строк между тегами
        // скриптов — текстовые узлы из одних пробелов убираем.
        function dropBlankText(root) {
            var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            var blanks = [], n;
            while ((n = walker.nextNode())) { if (!n.nodeValue.trim()) blanks.push(n); }
            blanks.forEach(function (t) { if (t.parentNode) t.parentNode.removeChild(t); });
        }
        // Часы, обратный отсчёт и «N минут назад» рендерятся таймерами: два
        // прогона (classic и bundle) снимают состояние в разные секунды, поэтому
        // такой текст заменяем на метку — иначе хеши разной разметки не сойдутся
        // на ровном месте (в CI такое и случилось: runner быстрее/медленнее
        // песочницы, и таймер успевал/не успевал отрисоваться).
        function normalizeVolatile(root) {
            var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
            while ((n = walker.nextNode())) {
                var v = n.nodeValue;
                if (!v || v.indexOf(':') === -1 && !/назад|ago|только что|just now/i.test(v)) continue;
                var out = v
                    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, '\u23f1')
                    .replace(/\b\d{6,}\b/g, '#')
                    .replace(/\b\d+\s*(мин|минут|минуты|мин\.|час|часа|часов|день|дня|дней|сек|секунды|секунд)\s+назад/gi, '\u23f1')
                    .replace(/\b\d+\s*(minute|minutes|min|hour|hours|day|days|second|seconds)\s+ago/gi, '\u23f1')
                    .replace(/только что|just now/gi, '\u23f1');
                if (out !== v) n.nodeValue = out;
            }
        }

        var globals = {};
        var missing = [];
        (window.__FOUNDATION_GLOBALS__ || []).forEach(function (n) {
            globals[n] = typeof window[n];
            if (typeof window[n] === 'undefined') missing.push(n);
        });

        var probes = {
            t_brand: safe(function () { return window.t('brand_name'); }),
            t_missing: safe(function () { return window.t('__no_such_key__'); }),
            esc: safe(function () { return window.esc('<a href="x">&\''); }),
            fmtScore_m1: safe(function () { return window.fmtScore(-1); }),
            fmtScore_0: safe(function () { return window.fmtScore(0); }),
            scoreClass: safe(function () { return window.scoreClass(2); }),
            holePar_1: safe(function () { return window.holePar(1); }),
            holePar_18: safe(function () { return window.holePar(18); }),
            holeHcp_1: safe(function () { return window.holeHcp(1); }),
            holeDist: safe(function () { return window.holeDist(3, 'rd'); }),
            holeResName: safe(function () { return window.holeResName(1, 3); }),
            fmtTime: safe(function () { return typeof window.fmtTime === 'function' ? window.fmtTime(0) : 'n/a'; }),
            fmtDate: safe(function () { return typeof window.fmtDate === 'function' ? window.fmtDate(0) : 'n/a'; }),
            escapeHtml: safe(function () { return window.escapeHtml('<b>&"'); }),
            html_tag: safe(function () { return window.html`<b>${'<x>'}</b>`; }),
            i18n_dict: safe(function () { return Object.keys(window.I18N).sort().join(','); }),
            i18n_ru_keys: safe(function () { return Object.keys(window.I18N.ru).length; }),
            i18n_en_keys: safe(function () { return Object.keys(window.I18N.en).length; }),
            course_par: safe(function () { return window.TOTAL_PAR; }),
            official_call: safe(function () { return window.buildOfficialCallText('referee', 7, 'Иван', ['Пётр'], true).split('\n')[0]; })
        };

        // i18n применён: ни один data-i18n не остался с «сырым» ключом
        var i18nNodes = Array.prototype.slice.call(document.querySelectorAll('[data-i18n]'));
        var untranslated = i18nNodes.filter(function (el) {
            var attr = el.getAttribute('data-i18n');
            var txt = (el.textContent || '').trim();
            return txt === '' || txt === attr;
        }).length;

        // toast реально создаёт DOM-узел
        var toastWorks = safe(function () {
            var before = document.querySelectorAll('#toast-root .toast').length;
            window.toast('browser-check', 'info', { duration: 100 });
            return document.querySelectorAll('#toast-root .toast').length === before + 1;
        });

        // перевод языка работает через бандл (и возвращается обратно)
        var langToggle = safe(function () {
            var before = document.documentElement.lang;
            window.toggleLang();
            var after = document.documentElement.lang;
            var node = document.querySelector('[data-i18n="brand_name"]');
            var sample = node ? (node.textContent || '') : '';
            window.toggleLang();
            return { before: before, after: after, sample: sample };
        });

        var nav = document.getElementById('main-nav') || document.querySelector('.nav');
        // innerHTML включает и сами <script>-теги: в classic их шесть, в bundle —
        // один module-тег. Для сравнения разметки скрипты вырезаем.
        var bodyClone = document.body ? document.body.cloneNode(true) : null;
        if (bodyClone) {
            Array.prototype.slice.call(bodyClone.querySelectorAll('script')).forEach(function (el) { el.parentNode.removeChild(el); });
            dropBlankText(bodyClone);
            normalizeVolatile(bodyClone);
        }
        var navClone = nav ? nav.cloneNode(true) : null;
        if (navClone) {
            Array.prototype.slice.call(navClone.querySelectorAll('script')).forEach(function (el) { el.parentNode.removeChild(el); });
            dropBlankText(navClone);
            normalizeVolatile(navClone);
        }
        return {
            lang: document.documentElement.lang,
            bodyClass: document.body ? document.body.className : '',
            title: document.title,
            i18nNodes: i18nNodes.length,
            untranslated: untranslated,
            globals: globals,
            missing: missing,
            probes: probes,
            toastWorks: toastWorks,
            langToggle: langToggle,
            navHash: navClone ? hash(navClone.innerHTML) : null,
            bodyHash: bodyClone ? hash(bodyClone.innerHTML) : '',
            bodyTextLen: bodyClone ? bodyClone.textContent.length : 0,
            forms: document.querySelectorAll('input,select,textarea,button').length
        };
    };
}

// ── Статический сервер ────────────────────────────────────────────────────
function startServer() {
    const MIME = {
        '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
        '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
    };
    const server = http.createServer(function (req, res) {
        const url = new URL(req.url, 'http://127.0.0.1');
        let filePath = decodeURIComponent(url.pathname);
        if (filePath === '/') filePath = '/index.html';
        const variant = url.searchParams.get('__variant') || 'bundle';
        const abs = path.join(ROOT, filePath);
        if (abs.indexOf(ROOT) !== 0) { res.writeHead(403); res.end(); return; }
        fs.readFile(abs, function (err, buf) {
            if (err) { res.writeHead(404); res.end('not found'); return; }
            let body = buf;
            const type = MIME[path.extname(abs)] || 'application/octet-stream';
            if (path.extname(abs) === '.html') {
                const out = toVariant(buf.toString('utf8'), variant);
                body = out.html;
                res.setHeader('X-Pestovo-Variant', out.switched ? variant : 'none');
            }
            res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
            res.end(body);
        });
    });
    return new Promise(function (resolve) {
        server.listen(0, '127.0.0.1', function () { resolve({ server: server, port: server.address().port }); });
    });
}

// ── Поиск и запуск браузера ───────────────────────────────────────────────
async function launchBrowser(playwright, chromiumMod) {
    const extraLibs = process.env.CHROMIUM_EXTRA_LIBS;
    const env = extraLibs ? Object.assign({}, process.env, { LD_LIBRARY_PATH: extraLibs }) : undefined;
    const baseArgs = ['--no-sandbox', '--disable-dev-shm-usage'];
    if (process.env.CHROMIUM_PATH) {
        return await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: baseArgs, env: env });
    }
    try {
        return await playwright.chromium.launch({ args: baseArgs, env: env });
    } catch (e) { /* свой chromium не установлен — пробуем бандл */ }
    if (chromiumMod && typeof chromiumMod.executablePath === 'function') {
        const exec = await chromiumMod.executablePath();
        // --single-process/--no-zygote — флаги serverless-сборки: с ними браузер
        // падает при создании второго контекста, поэтому убираем.
        const args = (chromiumMod.args || [])
            .filter(function (a) { return a !== '--single-process' && a !== '--no-zygote'; })
            .concat(baseArgs);
        return await playwright.chromium.launch({ executablePath: exec, args: args, env: env });
    }
    throw new Error('playwright chromium и @sparticuz/chromium недоступны');
}

// ── Одна загрузка страницы ────────────────────────────────────────────────
async function loadPage(launch, base, page, variant) {
    const browser = await launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pageObj = await context.newPage();
    const errors = [];
    const blocked = [];

    await pageObj.addInitScript(function (data) {
        window.__FOUNDATION_GLOBALS__ = data.globals;
        try { (new Function(data.stub))(); } catch (e) { /* стаб не критичен */ }
    }, { globals: FOUNDATION_GLOBALS, stub: FIREBASE_STUB });

    pageObj.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); });
    pageObj.on('console', function (m) {
        if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 200));
    });
    pageObj.on('requestfailed', function (r) {
        const u = r.url();
        if (u.indexOf('http://127.0.0.1') === 0) {
            errors.push('local request failed: ' + u + ' — ' + (r.failure() || {}).errorText);
        } else {
            blocked.push(u);
        }
    });
    // Внешние запросы рвём: проверка должна быть офлайн- и детерминирована
    // (в CI сеть есть, и без этого страницы грузили бы реальный Firebase SDK).
    await pageObj.route('**', function (route) {
        const u = route.request().url();
        if (u.indexOf('http://127.0.0.1') === 0 || u.indexOf('http://localhost') === 0) return route.continue();
        return route.abort();
    });
    // Service Worker не должен участвовать в проверке. Регистрируется ПОСЛЕ
    // общего правила: в playwright приоритет у более позднего обработчика.
    await pageObj.route(/sw\.js(\?|$)/, function (route) { route.abort(); });

    const target = base + '/' + page + '?__variant=' + variant;
    try {
        await pageObj.goto(target, { waitUntil: 'load', timeout: 30000 });
    } catch (e) {
        errors.push('goto: ' + String(e.message).split('\n')[0]);
    }
    // Даём странице доиграть отложенные таймеры и микротаски
    await pageObj.waitForTimeout(1200);

    let snap = null;
    try {
        snap = await pageObj.evaluate(snapshotScript());
    } catch (e) {
        errors.push('snapshot: ' + e.message);
    }
    if (snap) {
        const checks = (PAGE_EXPECTATIONS[page] || '').split('&&').map(function (x) { return x.trim(); }).filter(Boolean);
        if (checks.length) {
            try {
                snap.expectations = await pageObj.evaluate(function (srcs) {
                    return srcs.map(function (src) {
                        try { return !!(new Function('return (' + src + ')')()); }
                        catch (e) { return 'ERR:' + (e && e.message); }
                    });
                }, checks);
            } catch (e) {
                errors.push('expectations: ' + e.message);
            }
        }
    }
    const finalUrl = pageObj.url();
    await context.close();
    await browser.close();
    return { errors: errors, blocked: blocked, snap: snap, finalUrl: finalUrl };
}

// ── main ──────────────────────────────────────────────────────────────────
(async function main() {
    let playwright = null, chromiumMod = null;
    try { playwright = require('playwright'); } catch (e) { /* не установлен */ }
    try { chromiumMod = require('@sparticuz/chromium'); } catch (e) { /* не установлен */ }

    if (!playwright) {
        const msg = 'browser-check: не найден playwright (npm i -D playwright) — проверка пропущена.';
        if (REQUIRE_BROWSER) { console.error(msg); process.exit(2); }
        console.log(msg);
        process.exit(0);
    }

    let launch;
    try {
        launch = function () { return launchBrowser(playwright, chromiumMod); };
        const probe = await launch(); // проверяем, что браузер вообще поднимается
        await probe.close();
    } catch (e) {
        const msg = 'browser-check: браузер недоступен (' + e.message + '). ' +
            'Установите: npx playwright install chromium. Проверка пропущена.';
        if (REQUIRE_BROWSER) { console.error(msg); process.exit(2); }
        console.log(msg);
        process.exit(0);
    }

    const started = await startServer();
    const base = 'http://127.0.0.1:' + started.port;
    const pages = ONLY_PAGES.length ? ONLY_PAGES : ALL_PAGES;
    const variants = VARIANT === 'both' ? ['classic', 'bundle'] : [VARIANT];

    console.log('browser-check: страниц ' + pages.length + ', варианты ' + variants.join(' + ') + ', ' + base);

    let failed = 0;
    for (const page of pages) {
        const skipFoundation = NO_FOUNDATION_PAGES.indexOf(page) !== -1;
        const runs = {};
        for (const variant of variants) {
            runs[variant] = await loadPage(launch, base, page, variant);
        }
        const problems = [];

        for (const variant of variants) {
            const r = runs[variant];
            const localErrors = r.errors.filter(function (e) {
                return !/^console\.error: Failed to load resource/.test(e);
            });
            // Ошибка, которая есть и в classic, — предсуществующая (не регрессия
            // перехода на бандл): показываем предупреждением, а не провалом.
            const other = variant === 'classic' ? runs.bundle : runs.classic;
            const preExisting = other ? other.errors : [];
            const fresh = localErrors.filter(function (e) {
                return preExisting.indexOf(e) === -1;
            });
            if (fresh.length) problems.push(variant + ': ошибки страницы — ' + fresh.slice(0, 6).join(' | '));
            const stale = localErrors.filter(function (e) { return preExisting.indexOf(e) !== -1; });
            if (stale.length) {
                console.log('         (предсуществующие ошибки ' + variant + ': ' + stale.slice(0, 4).join(' | '));
                console.log('          url: ' + r.finalUrl + '  [page=' + page + ' variant=' + variant + ' errs=' + r.errors.length + ']');
            }
            if (!skipFoundation) {
                if (r.snap && r.snap.missing && r.snap.missing.length) {
                    problems.push(variant + ': нет глобалов фундамента — ' + r.snap.missing.join(', '));
                }
                if (r.snap && r.snap.untranslated > 0) {
                    problems.push(variant + ': непереведённых data-i18n: ' + r.snap.untranslated + ' из ' + r.snap.i18nNodes);
                }
                if (r.snap && r.snap.toastWorks !== true) problems.push(variant + ': toast не создаёт узел');
                if (r.snap && r.snap.langToggle && r.snap.langToggle.before === r.snap.langToggle.after) {
                    problems.push(variant + ': toggleLang не меняет язык');
                }
                if (r.snap && r.snap.expectations) {
                    const bad = r.snap.expectations.filter(function (v) { return v !== true; });
                    if (bad.length) problems.push(variant + ': страница не отрисовалась как ожидается — ' + bad.join(' | '));
                }
            }
        }

        if (variants.length === 2) {
            const a = runs.classic.snap, b = runs.bundle.snap;
            if (a && b) {
                const diffs = [];
                ['lang', 'bodyClass', 'title', 'i18nNodes', 'untranslated', 'navHash', 'bodyHash',
                    'bodyTextLen', 'forms', 'toastWorks', 'expectations'].forEach(function (k) {
                        if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
                            diffs.push(k + ': ' + JSON.stringify(a[k]) + ' ≠ ' + JSON.stringify(b[k]));
                        }
                    });
                Object.keys(a.probes || {}).forEach(function (k) {
                    if (JSON.stringify(a.probes[k]) !== JSON.stringify(b.probes[k])) {
                        diffs.push('probe.' + k + ': ' + JSON.stringify(a.probes[k]) + ' ≠ ' + JSON.stringify(b.probes[k]));
                    }
                });
                Object.keys(a.globals || {}).forEach(function (k) {
                    if (a.globals[k] !== b.globals[k]) diffs.push('global.' + k + ': ' + a.globals[k] + ' ≠ ' + b.globals[k]);
                });
                if (diffs.length) problems.push('classic ≠ bundle — ' + diffs.slice(0, 8).join(' | '));
            } else {
                problems.push('не удалось снять состояние (' + (!a ? 'classic' : 'bundle') + ')');
            }
        }

        const ok = problems.length === 0;
        if (!ok) failed++;
        const first = runs[variants[0]];
        const snap = first ? first.snap : null;
        console.log((ok ? '  ok   ' : '  FAIL ') + page +
            (snap ? '  [' + snap.i18nNodes + ' i18n-узлов, ' + snap.forms + ' контролов]' : '') +
            (problems.length ? '\n         ' + problems.join('\n         ') : ''));
    }

    started.server.close();

    console.log('');
    if (failed) {
        console.error('browser-check: провалено страниц — ' + failed + ' из ' + pages.length);
        process.exit(1);
    }
    console.log('browser-check: варианты classic и bundle идентичны на всех страницах ✔');
})().catch(function (e) {
    console.error('browser-check: неожиданная ошибка — ' + ((e && e.stack) || e));
    process.exit(1);
});
