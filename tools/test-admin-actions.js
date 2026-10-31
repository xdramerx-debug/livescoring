#!/usr/bin/env node
/**
 * Админка: мёртвые кнопки и запись в журнал гандикапов.
 *
 *   npm i jsdom
 *   node tools/test-admin-actions.js
 *
 * 1. Статическая проверка «нет мёртвых кнопок»: для каждой вкладки admin.html
 *    каждый data-act должен иметь обработчик в файле, который эта вкладка
 *    реально загружает (eager <script src> или ленивая группа из TAB_GROUPS).
 *    Именно этой проверки не хватало: кнопки «Удалить все данные», «Удалить
 *    все раунды», «Удалить всех игроков и раунды», «Экспорт CSV» и «Бэкап»
 *    висели в inscript-разметке, а их модули (js/admin-groups.js,
 *    js/admin-exports.js) не входили в группу вкладки — клик по ним молча
 *    ничего не делал.
 * 2. Поведенческая проверка: правка гандикапа в профиле игрока (модалка
 *    админки) пишет запись в hcpLog со старым и новым значением, а сохранение
 *    без изменения гандикапа записи не создаёт.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let checks = 0;
let failures = 0;

function check(condition, message) {
    checks++;
    if (!condition) { failures++; console.error('FAIL:', message); }
    else console.log('ok:', message);
}

/* ─────────── 1. Мёртвые кнопки ─────────── */

function lazyGroups() {
    const src = fs.readFileSync(path.join(ROOT, 'js/admin-lazy.js'), 'utf8');
    const body = src.slice(src.indexOf('var TAB_GROUPS'), src.indexOf('function nodesFor'));
    const groups = {};
    body.replace(/(\w+):\s*\[([^\]]*)\]/g, (match, key, value) => {
        groups[key] = value.split(',').map((item) => item.trim().replace(/['"]/g, '')).filter(Boolean);
        return match;
    });
    return groups;
}

function handlerIndex() {
    const handlers = {};
    fs.readdirSync(path.join(ROOT, 'js')).filter((file) => file.endsWith('.js')).forEach((file) => {
        const rel = 'js/' + file;
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        const names = new Set();
        (src.match(/function\s+([A-Za-z_$][\w$]*)\s*\(/g) || []).forEach((item) => {
            names.add(item.replace(/function\s+/, '').replace(/\s*\($/, ''));
        });
        (src.match(/(?:window|root|global|self)\.[A-Za-z_$][\w$]*\s*=/g) || []).forEach((item) => {
            names.add(item.split('.')[1].replace(/\s*=$/, '').trim());
        });
        (src.match(/pestovoOnAction\(\s*'([^']+)'/g) || []).forEach((item) => {
            names.add(item.replace(/pestovoOnAction\(\s*'/, '').replace(/'$/, ''));
        });
        names.forEach((name) => { (handlers[name] = handlers[name] || []).push(rel); });
    });
    return handlers;
}

function adminTabSections(html) {
    const sections = {};
    const re = /<div id="tab-([a-z0-9]+)" class="admin-section[^"]*">([\s\S]*?)(?=<div id="tab-[a-z0-9]+" class="admin-section|<\/main>)/g;
    let match;
    while ((match = re.exec(html))) sections[match[1]] = match[2];
    return sections;
}

(function staticGate() {
    const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
    const groups = lazyGroups();
    const handlers = handlerIndex();

    // файл → ленивая группа; отдельно — файлы, подключённые напрямую
    const lazyFileGroup = {};
    html.replace(/<script type="text\/plain" data-admin-lazy="([^"]+)" data-admin-src="([^"]+)"/g, (match, group, src) => {
        lazyFileGroup[src.split('?')[0]] = group;
        return match;
    });
    const eagerFiles = new Set();
    html.replace(/<script[^>]*?(?<![\w-])src="(js\/[^"?]+)/g, (match, src) => { eagerFiles.add(src); return match; });

    const sections = adminTabSections(html);
    check(Object.keys(sections).length >= 15, 'admin.html: найдено ' + Object.keys(sections).length + ' вкладок');

    const dead = [];
    Object.keys(sections).forEach((tab) => {
        const actions = [...new Set((sections[tab].match(/data-act="([^"]+)"/g) || []).map((item) => item.slice(10, -1)))];
        const tabGroups = groups[tab] || [];
        actions.forEach((action) => {
            const files = handlers[action];
            if (!files) { dead.push(tab + ': ' + action + ' (обработчика нет ни в одном js/)'); return; }
            const reachable = files.some((file) => eagerFiles.has(file)) ||
                files.some((file) => lazyFileGroup[file] && tabGroups.indexOf(lazyFileGroup[file]) !== -1);
            if (!reachable) {
                dead.push(tab + ': ' + action + ' (' + files.join(', ') + '; вкладка грузит: ' + (tabGroups.join('+') || '—') + ')');
            }
        });
    });
    check(dead.length === 0, 'нет мёртвых кнопок в админке' + (dead.length ? ':\n    ' + dead.join('\n    ') : ''));

    // Кнопки удаления обязаны быть доступны на своих вкладках.
    const hasHandler = (tab, action) => {
        const files = handlers[action] || [];
        const tabGroups = groups[tab] || [];
        return files.some((file) => eagerFiles.has(file)) ||
            files.some((file) => lazyFileGroup[file] && tabGroups.indexOf(lazyFileGroup[file]) !== -1);
    };
    check(hasHandler('data', 'wipeEverything'), '«Удалить все данные» загружает свой модуль на вкладке данных');
    check(hasHandler('data', 'clearAllData'), '«Удалить всех игроков и раунды» загружает свой модуль');
    check(hasHandler('data', 'clearRounds'), '«Удалить все раунды» загружает свой модуль');
    check(hasHandler('data', 'downloadJSONBackup'), '«Скачать бэкап базы» загружает свой модуль');
    check(hasHandler('data', 'exportAllRoundsCSV'), '«Экспорт CSV» загружает свой модуль');
    check(hasHandler('hcplog', 'hcpLogLoad'), '«Журнал гандикапов» загружает свой модуль');
})();

/* ─────────── 2. Журнал при правке профиля ─────────── */

let JSDOM = null;
try { JSDOM = require('jsdom').JSDOM; } catch (e) { JSDOM = null; }

if (!JSDOM) {
    console.log('SKIP: jsdom не установлен (npm i jsdom) — поведенческая часть пропущена');
} else {
    const editorHtml = `<!doctype html><html><body>
<div id="adm-player-edit-modal">
  <form id="adm-player-edit-form" data-player-id="u1">
    <input id="adm-edit-player-name" value="Иванов Иван">
    <input id="adm-edit-player-hcp" value="HC_EDIT">
    <input id="adm-edit-player-first" value="Иван">
    <input id="adm-edit-player-last" value="Иванов">
    <input id="adm-edit-player-middle" value="">
    <input id="adm-edit-player-phone" value="">
    <input id="adm-edit-player-club" value="">
    <select id="adm-edit-player-gender"><option value="men">men</option></select>
    <select id="adm-edit-player-tee"><option value="wh">wh</option></select>
    <p id="adm-player-edit-status"></p>
    <button id="adm-player-edit-save">save</button>
  </form>
</div></body></html>`;

    var makeEditor = function (hcpValue, currentHcp) {
        const dom = new JSDOM(editorHtml.replace('HC_EDIT', String(hcpValue)), {
            runScripts: 'outside-only', url: 'https://test.local/admin.html'
        });
        const win = dom.window;
        const state = { updates: [], logged: [] };
        win.currentLang = 'ru';
        win.currentUser = { uid: 'admin-uid' };
        win.currentUserData = { role: 'admin' };
        win.toast = () => {};
        win.escapeHtml = (value) => String(value == null ? '' : value);
        win.fmtExactHcp = (value) => String(value);
        win.parseExactHcp = (value) => Number(String(value).replace(',', '.'));
        win.pestovoOnAction = () => {};
        win.pestovoLogHcpChange = (entry) => { state.logged.push(entry); return Promise.resolve(true); };
        win.renderAdmPlayersList = () => {};
        win.db = { ref: () => ({ update: (updates) => { state.updates.push(updates); return Promise.resolve(); } }) };
        win.eval(fs.readFileSync(path.join(ROOT, 'js/admin-players.js'), 'utf8'));
        win.admPlayersLastData = { u1: { name: 'Иванов Иван', handicap: currentHcp, gender: 'men', defaultTee: 'wh' } };
        return { win, state };
    };

    (async function behavioural() {
        // 2a. Гандикап изменился 15 → 12.4
        let ctx = makeEditor('12.4', 15);
        ctx.win.saveAdmPlayerEditor({ preventDefault() {} });
        await new Promise((resolve) => setTimeout(resolve, 60));
        check(ctx.state.updates.length === 1, 'правка профиля сохраняется в базу');
        check(ctx.state.logged.length === 1, 'правка гандикапа в профиле пишет запись в журнал');
        const entry = ctx.state.logged[0] || {};
        check(entry.source === 'manual-admin', 'источник записи — manual-admin');
        check(entry.playerUid === 'u1' && entry.playerName === 'Иванов Иван', 'в записи есть игрок');
        check(entry.oldHcp === 15 && entry.newHcp === 12.4, 'в записи старое и новое значение (15 → 12.4)');

        // 2b. Гандикап не менялся — записи нет (журнал не засоряется).
        ctx = makeEditor('15.0', 15);
        ctx.win.saveAdmPlayerEditor({ preventDefault() {} });
        await new Promise((resolve) => setTimeout(resolve, 60));
        check(ctx.state.updates.length === 1, 'сохранение без правок гандикапа проходит');
        check(ctx.state.logged.length === 0, 'без изменения гандикапа журнал не пополняется');

        console.log('\n' + (failures ? 'FAILED ' + failures + ' / ' + checks : 'Passed ' + checks + ' checks'));
        process.exit(failures ? 1 : 0);
    })().catch((error) => { console.error(error); process.exit(1); });
}
