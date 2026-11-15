#!/usr/bin/env node
// Поиск АГР: прокси опрашиваются параллельно, побеждает первый валидный ответ.
// Зависший прокси не должен задерживать результат, а все упавшие — дать ошибку.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', url: 'https://test.local/' });
const win = dom.window;
win.eval(fs.readFileSync(path.join(ROOT, 'js/rusgolf-client.js'), 'utf8'));
const client = win.PestovoRusgolf;
assert(client && typeof client.fetchViaProxy === 'function', 'клиент АГР загружен');

const TABLE = '<html><body><table><tr><th>Номер</th><th>Фамилия Имя Отчество</th><th>Пол</th><th>HI</th></tr>' +
    '<tr><td>RG 123456</td><td>Иванов Иван Иванович</td><td>Мужской</td><td>14.2</td></tr></table></body></html>';

// Прокси: «зависает» до таймаута (abort), либо отдаёт таблицу, либо отвечает 500.
function fakeFetch(behaviour) {
    return function (url, opts) {
        const kind = behaviour(url);
        return new Promise((resolve, reject) => {
            if (kind === 'hang') {
                if (opts && opts.signal) opts.signal.addEventListener('abort', () => reject(new Error('AbortError')));
                return;
            }
            if (kind === 'ok') return resolve({ ok: true, status: 200, text: () => Promise.resolve(TABLE) });
            return resolve({ ok: false, status: 500, text: () => Promise.resolve('') });
        });
    };
}

(async function run() {
    let failures = 0;
    const check = (cond, msg) => { if (cond) console.log('ok:', msg); else { failures++; console.error('FAIL:', msg); } };

    // 1) Первый прокси висит, второй отвечает — результат приходит сразу, без ожидания таймаута.
    win.fetch = fakeFetch(url => (url.includes('r.jina.ai') ? 'hang' : 'ok'));
    let started = Date.now();
    const r1 = await client.fetchViaProxy('Иванов Иван', 0, { timeoutMs: 8000 });
    const elapsed1 = Date.now() - started;
    check(r1.rows.length === 1 && r1.rows[0].number === 'RG123456', 'результат получен от работающего прокси');
    check(elapsed1 < 2000, 'зависший прокси не задерживает ответ (' + elapsed1 + ' мс)');

    // 2) Все прокси упали — ошибка, а не зависание.
    win.fetch = fakeFetch(() => 'fail');
    let rejected = null;
    try { await client.fetchViaProxy('Иванов Иван', 0, { timeoutMs: 8000 }); } catch (e) { rejected = e; }
    check(!!rejected, 'если все прокси недоступны — ошибка');

    // 3) Прокси из настроек администратора (localStorage) идёт первым в списке.
    win.localStorage.setItem('pestovo_rg_proxy', 'https://proxy.test/?u={url}');
    const seen = [];
    win.fetch = fakeFetch(url => { seen.push(url); return url.startsWith('https://proxy.test/') ? 'ok' : 'fail'; });
    await client.fetchViaProxy('Иванов Иван', 0, { timeoutMs: 8000 });
    check(seen.some(u => u.startsWith('https://proxy.test/')), 'пользовательский прокси из настроек запрашивается');

    if (failures) { console.error('FAILED ' + failures); process.exit(1); }
    console.log('Passed all checks');
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
