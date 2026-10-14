'use strict';
/*
 * tools/test-firebase-config.js — страховка конфигурации Firebase Hosting.
 *
 * Два класса проблем, которые тест закрывает:
 *
 * 1. Состав деплоя. Каталог деплоя — public/ (собирается tools/build-public.js
 *    через hosting.predeploy). До аудита 2026-10 hosting.public был "." и
 *    список ignore не закрывал database.rules.json, src/, package.json,
 *    vite.config.js и *.md — на прод публично отдавалась полная карта правил
 *    авторизации (15 КБ, включая схему tournament-master и custom claims) и
 *    исходники ESM-фундамента. Содержимое самого public/ проверяет
 *    tools/test-build-public.js; здесь — контракт конфигурации.
 *
 * 2. Кэш. Все URL статики несут ?v=<sha1-8 содержимого> (tools/rev-assets.js),
 *    то есть неизменяемы по построению, но Cache-Control не задавался вовсе, и
 *    каждый повторный визит на поле перекачивал ассеты. Теперь статика →
 *    max-age=31536000 immutable, а HTML/sw.js/manifest.json → no-cache: в них
 *    живут ?v= и precache-манифест, долгий кэш оставил бы пользователя без
 *    новых версий и без нового Service Worker.
 *
 * Проверки заголовков идут по представительному набору путей, а не по дереву
 * файлов: тест не должен зависеть от того, собран ли public/ в данный момент.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function ok(cond, msg, extra) {
    if (cond) { console.log('ok  - ' + msg); }
    else { failures++; console.error('FAIL - ' + msg + (extra ? '\n       ' + extra : '')); }
}

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
const hosting = cfg.hosting;
ok(!!hosting, 'firebase.json: секция hosting есть');

// ── 1. Каталог деплоя и predeploy ─────────────────────────────────────────
ok(hosting.public === 'public', 'hosting.public = "public" (артефакт сборки, а не корень репозитория)',
    'фактически: ' + JSON.stringify(hosting.public));
const predeploy = [].concat(hosting.predeploy || []);
ok(predeploy.some(function (c) { return /build:public/.test(c); }),
    'hosting.predeploy собирает public/ перед деплоем', predeploy.join('; ') || '(пусто)');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
ok(!!(pkg.scripts && pkg.scripts['build:public']), 'в package.json есть скрипт build:public');
ok(/(^|\n)public\/($|\n)/.test(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')),
    'public/ в .gitignore (артефакт не коммитится)');

// Точка входа сборки существует и сама проверяется отдельным тестом.
ok(fs.existsSync(path.join(__dirname, 'build-public.js')), 'tools/build-public.js на месте');
ok(fs.existsSync(path.join(__dirname, 'test-build-public.js')), 'tools/test-build-public.js на месте');

// ignore остаётся защитным слоем: dot-файлы и node_modules не должны уехать
// на прод, даже если сборка когда-нибудь положит их в public/.
const ignore = hosting.ignore || [];
['firebase.json', '**/.*', '**/node_modules/**'].forEach(function (g) {
    ok(ignore.indexOf(g) !== -1, 'hosting.ignore содержит ' + g);
});

// ── 2. Cache-Control по представительным путям ────────────────────────────
// Glob-семантика Firebase Hosting: `**/` — любое число ведущих сегментов,
// `**` — всё что угодно, `*` — один сегмент без `/`.
function globToRe(glob) {
    let out = '';
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === '*') {
            if (glob[i + 1] === '*') {
                if (glob[i + 2] === '/') { out += '(?:.*/)?'; i += 2; }
                else { out += '.*'; i += 1; }
            } else { out += '[^/]*'; }
        } else if ('.+?^${}()|[]\\'.indexOf(c) !== -1) { out += '\\' + c; }
        else out += c;
    }
    return new RegExp('^' + out + '$');
}
const rules = hosting.headers || [];
ok(rules.length > 0, 'hosting.headers заданы (' + rules.length + ' правил)');

// Firebase применяет правила по порядку; для одного заголовка побеждает
// последнее совпавшее правило.
function headerFor(file, name) {
    let value = null;
    for (const r of rules) {
        if (![].concat(r.source).some(function (g) { return globToRe(g).test(file); })) continue;
        for (const h of r.headers || []) if (h.header.toLowerCase() === name.toLowerCase()) value = h.value;
    }
    return value;
}

const IMMUTABLE = 'public, max-age=31536000, immutable';
// Репрезентативные пути: по одному на каждый класс + реальные файлы сборки.
const HASHED = ['js/utils.js', 'js/vendor/qrcode-generator-1.4.4.js', 'css/style.css',
    'css/tn-manager.css', 'css/fontawesome-subset.css',
    'dist/livescoring-modules.js', 'img/logo.png', 'img/icon-512.png'];
const REVALIDATED = ['index.html', 'admin.html', 'offline.html', 'tournaments.html', 'sw.js', 'manifest.json'];

// Сабсет Font Awesome: имя файла несёт хеш содержимого (tools/build-fontawesome.js),
// поэтому список берём с диска, а не константой — иначе тест ломался бы при
// каждой пересборке подмножества.
const fontDir = path.join(ROOT, 'fonts');
const fontFiles = fs.existsSync(fontDir)
    ? fs.readdirSync(fontDir).filter(function (f) { return f.endsWith('.woff2'); }).sort()
    : [];
fontFiles.forEach(function (f) { HASHED.push('fonts/' + f); });
ok(fontFiles.length > 0, 'сабсет Font Awesome собран (fonts/*.woff2)', 'выполните npm run build:fonts');

HASHED.forEach(function (f) {
    ok(headerFor(f, 'Cache-Control') === IMMUTABLE,
        f + ' → max-age=31536000, immutable (URL несёт ?v=<hash содержимого>)',
        'фактически: ' + headerFor(f, 'Cache-Control'));
});
REVALIDATED.forEach(function (f) {
    ok(headerFor(f, 'Cache-Control') === 'no-cache',
        f + ' → no-cache (иначе ?v= и новый Service Worker не доедут)',
        'фактически: ' + headerFor(f, 'Cache-Control'));
});

// Все пути из HASHED/REVALIDATED должны реально существовать в репозитории —
// иначе тест проверял бы выдуманные имена и опечатка в glob осталась бы незамеченной.
const absent = HASHED.concat(REVALIDATED).filter(function (f) { return !fs.existsSync(path.join(ROOT, f)); });
ok(absent.length === 0, 'все проверяемые пути существуют в репозитории', absent.join(', '));

// Каждое правило заголовков должно матчить хотя бы один из проверяемых путей
// (ловит glob-опечатку вида `js/*` вместо `js/**`).
const unusedRules = rules.filter(function (r) {
    const globs = [].concat(r.source);
    return !HASHED.concat(REVALIDATED).some(function (f) {
        return globs.some(function (g) { return globToRe(g).test(f); });
    });
});
ok(unusedRules.length === 0, 'каждое правило headers покрывает реальные пути',
    unusedRules.map(function (r) { return [].concat(r.source).join(','); }).join(' | '));

// ── 3. CSP и security-заголовки ───────────────────────────────────────────
const cspHeader = (function () {
    for (const r of rules) {
        for (const h of r.headers || []) if (h.header === 'Content-Security-Policy') return { rule: r, value: h.value };
    }
    return null;
})();
ok(!!cspHeader, 'CSP задан заголовком (source=' + (cspHeader ? cspHeader.rule.source : '?') + ')');
if (cspHeader) {
    const csp = cspHeader.value;
    ok(csp.indexOf("'unsafe-eval'") === -1,
        "CSP не содержит 'unsafe-eval' — eval/new Function на проде заблокированы");
    ok(/default-src 'self'/.test(csp), "CSP: default-src 'self'");
    ok(/object-src 'none'/.test(csp), "CSP: object-src 'none'");
    ok(/frame-ancestors 'none'/.test(csp), "CSP: frame-ancestors 'none'");
    ok(/base-uri 'self'/.test(csp), "CSP: base-uri 'self'");
    ok(/form-action 'self'/.test(csp), "CSP: form-action 'self'");
    // Домены, которые приложение реально использует: Firebase CDN (SDK),
    // Google Fonts, cdnjs (Font Awesome), RTDB/WebSocket, RUSGOLF.
    ['https://www.gstatic.com', 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'].forEach(function (d) {
        ok(csp.indexOf(d) !== -1, 'CSP разрешает ' + d);
    });
    ok(/connect-src 'self' https: wss:/.test(csp), 'CSP: connect-src разрешает https и wss (RTDB realtime)');
}

const secRule = rules.filter(function (r) {
    return (r.headers || []).some(function (h) { return h.header === 'X-Content-Type-Options'; });
})[0];
ok(!!secRule, 'security-заголовки заданы для ' + (secRule ? secRule.source : '?'));
if (secRule) {
    const names = secRule.headers.map(function (h) { return h.header; });
    ['Content-Security-Policy', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy'].forEach(function (h) {
        ok(names.indexOf(h) !== -1, 'присутствует заголовок ' + h);
    });
    // Правило с security-заголовками обязано покрывать всё, включая статику.
    ok(globToRe([].concat(secRule.source)[0]).test('js/utils.js'),
        'security-заголовки применяются и к статике (js/utils.js)');
}

if (failures) { console.error('\nПровалено проверок: ' + failures); process.exit(1); }
console.log('Конфигурация Firebase Hosting в порядке ✔');
