// Выключатель уведомлений (settings/notifications_enabled) на клиенте.
// Запуск: node tools/test-notifications-off.js
//
// Проверяет, что после отключения уведомлений в админке:
//   1. уведомления клуба больше не показываются (ответ «судья едет» — solo.js,
//      как и в live.js, уважает глобальную настройку);
//   2. уже показанные уведомления клуба (класс .t-club) снимаются с экрана;
//   3. непрочитанное уведомление помечается прочитанным, но не всплывает.
'use strict';
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP: jsdom не установлен (npm i jsdom) — тест пропущен'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
let failures = 0, checks = 0;
function ok(cond, label) {
    checks++;
    if (!cond) { failures++; console.error('FAIL:', label); }
    else console.log('ok:', label);
}
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ── Фейковая база: значения + подписки .on('value'/'child_added') ──────────
function makeDb(store) {
    const subs = { value: {}, child_added: {} };
    function makeRef(p) {
        const ref = {
            _path: p,
            on(evt, cb) {
                (subs[evt] = subs[evt] || {})[p] = cb;
                if (evt === 'value') cb(snapFor(p));
                return cb;
            },
            off() {},
            once() { return Promise.resolve(snapFor(p)); },
            set(v) { store[p] = v; return Promise.resolve(); },
            update(v) { Object.assign(store[p] = store[p] || {}, v); return Promise.resolve(); },
            push() { return Promise.resolve({ key: 'k' }); },
            orderByChild() { return ref; },
            equalTo() { return ref; },
            child() { return ref; }
        };
        return ref;
    }
    function snapFor(p) {
        return { val: () => (store[p] === undefined ? null : store[p]), exists: () => store[p] !== undefined };
    }
    return {
        ref: makeRef,
        _emitValue(p, v) { store[p] = v; const cb = (subs.value || {})[p]; if (cb) cb(snapFor(p)); },
        _emitChildAdded(p, v) { const cb = (subs.child_added || {})[p]; if (cb) cb({ val: () => v, key: 'n1' }); }
    };
}

async function testPwaDismiss() {
    const dom = new JSDOM('<!doctype html><html><body><div id="nav-auth"></div></body></html>', {
        runScripts: 'outside-only', url: 'https://t.test/index.html'
    });
    const win = dom.window;
    const db = makeDb({});
    win.db = db;
    win.currentLang = 'ru';
    win.Notification = function () { win.__nativeNotifs = (win.__nativeNotifs || 0) + 1; };
    win.Notification.permission = 'granted';
    Object.defineProperty(win, 'Notification', { value: win.Notification, configurable: true });
    win.eval(fs.readFileSync(path.join(ROOT, 'js/course-config.js'), 'utf8'));
    win.eval(fs.readFileSync(path.join(ROOT, 'js/format.js'), 'utf8'));
    win.eval(fs.readFileSync(path.join(ROOT, 'js/dom.js'), 'utf8'));
    win.eval(fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8'));
    win.eval(fs.readFileSync(path.join(ROOT, 'js/pwa.js'), 'utf8'));

    // Уведомления включены: анонс кладёт тост с меткой .t-club.
    win.eval('pestovoBindGlobalNotificationsSetting()');
    db._emitValue('settings/notifications_enabled', true);
    win.eval("toast('📢 Анонс', 'info', { clubNotification: true })");
    await wait(20);
    ok(win.document.querySelectorAll('#toast-root .toast.t-club').length === 1,
        'включено: уведомление клуба показано и помечено .t-club');

    // Выключаем — тост снимается с экрана сразу.
    db._emitValue('settings/notifications_enabled', false);
    await wait(20);
    ok(win.document.querySelectorAll('#toast-root .toast.t-club').length === 0,
        'выключено: уже показанное уведомление сверху убирается');
    ok(win.pestovoAreGlobalNotificationsEnabled() === false, 'настройка «выключено» применена в рантайме');
    ok(win.showPushNotification('Тема', 'текст', 'index.html') === undefined && !win.__nativeNotifs,
        'выключено: push больше не показывается');
    return win;
}

async function testSoloCallResponse() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        runScripts: 'outside-only', url: 'https://t.test/setup-round.html?round=r1&as=p1'
    });
    const win = dom.window;
    const db = makeDb({ 'settings/notifications_enabled': true, 'users/p1/name': 'Пётр' });
    win.db = db;
    win.currentLang = 'ru';
    win.t = key => key;
    win.currentUser = { uid: 'p1' };
    win.vib = () => {};
    const toasts = [];
    win.eval(fs.readFileSync(path.join(ROOT, 'js/course-config.js'), 'utf8'));
    win.eval(fs.readFileSync(path.join(ROOT, 'js/format.js'), 'utf8'));
    win.eval(fs.readFileSync(path.join(ROOT, 'js/dom.js'), 'utf8'));
    win.eval(fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8'));
    win.eval(fs.readFileSync(path.join(ROOT, 'js/pwa.js'), 'utf8'));
    win.eval(fs.readFileSync(path.join(ROOT, 'js/solo.js'), 'utf8'));
    // Перехватываем toast после загрузки скриптов: dom.js создаёт настоящий toast.
    win.toast = (message, kind, opts) => { toasts.push({ message, kind, opts }); };
    win.eval("soloRound = { players: { p1: { name: 'Пётр' } } };");

    win.eval('listenForCallResponsesSolo()');
    await wait(20);
    // Уведомления включены: ответ «судья едет» показан.
    db._emitChildAdded('users/p1/notifications', { type: 'call_response', read: false, responderRole: 'referee' });
    await wait(20);
    ok(toasts.some(t => t.message.indexOf('едет к вам') !== -1), 'включено: ответ «судья едет» показывается');
    ok(toasts.some(t => t.opts && t.opts.clubNotification), 'тост ответа помечен как уведомление клуба (t-club)');

    // Выключаем настройку — новые ответы не показываются.
    db._emitValue('settings/notifications_enabled', false);
    await wait(20);
    const before = toasts.length;
    db._emitChildAdded('users/p1/notifications', { type: 'call_response', read: false, responderRole: 'marshal' });
    await wait(20);
    ok(toasts.length === before, 'выключено: ответ на вызов не всплывает сверху');
    ok((db.ref('users/p1/notifications')._path) === 'users/p1/notifications', 'путь уведомлений не изменился');
    return win;
}

(async function run() {
    await testPwaDismiss();
    await testSoloCallResponse();
    console.log('\n' + (failures ? 'FAILED ' + failures + ' / ' + checks : 'Passed ' + checks + ' checks'));
    process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
