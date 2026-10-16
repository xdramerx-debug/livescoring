// Глобальный репортинг ошибок: reportError() → RTDB errorReports (аудит 2026-10, п.3).
//
// Проверяет КЛИЕНТСКИЙ конвейер (троттлинг, дедупликация, отсутствие рекурсии,
// отказоустойчивость) и согласованность трёх мест, которые легко рассинхронить:
// лимиты обрезки в js/firebase-config.js, .validate в database.rules.json и
// читатель в js/admin-score-audit.js + карточка в admin.html.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = path.join(__dirname, '..');

const source = fs.readFileSync(path.join(root, 'js/firebase-config.js'), 'utf8');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'database.rules.json'), 'utf8')).rules;
const adminAudit = fs.readFileSync(path.join(root, 'js/admin-score-audit.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const adminJs = fs.readFileSync(path.join(root, 'js/admin.js'), 'utf8');

// ── 1. Правила: узел закрыт на чтение для всех, кроме админа/мастер-сессии ──
const node = rules.errorReports;
assert.ok(node, 'database.rules.json: узел errorReports существует');
assert.strictEqual(node['.write'], 'auth != null', 'запись разрешена любому аутентифицированному (иначе анонимный игрок на курсе не отправит ошибку)');
assert.match(node['.read'], /child\('admin'\)\.val\(\) === true/, 'чтение — только админ');
assert.match(node['.read'], /role'\)\.val\(\) === 'admin'/, 'чтение — роль admin');
assert.ok(!/\bauth\.uid\b\s*!==?\s*null/.test(node['.read']), 'чтение не должно быть открыто всем аутентифицированным');
assert.ok(node['.read'].indexOf('auth != null && (') === 0, 'чтение начинается с auth != null && (');
assert.deepStrictEqual(node['.indexOn'], ['ts'], 'индекс по ts для orderByChild');

const fields = node.$id;
assert.strictEqual(fields['.validate'], "newData.hasChildren(['ts', 'page', 'msg'])", 'обязательные поля записи');
assert.strictEqual(fields.$other['.validate'], false, 'неизвестные поля запрещены — клиент не может дописать произвольный мусор');

// Клиент обрезает значения функцией pestovoErrClip(v, max): при превышении
// возвращается ровно max символов + '…', то есть max + 1. Правила должны
// пропускать именно такую длину и не больше.
function ruleMax(field) {
    const m = String(fields[field]['.validate']).match(/\.length <= (\d+)/);
    assert.ok(m, 'правило ' + field + ' ограничивает длину');
    return Number(m[1]);
}
const clientClips = {};
for (const m of source.matchAll(/pestovoErrClip\(([^,]+),\s*(\d+)\)/g)) {
    clientClips[m[1].trim()] = Number(m[2]);
}
// msg/stack обрезаются до 500/2000, правила допускают 501/2001 (клип + '…').
assert.strictEqual(ruleMax('msg'), 501, 'правила msg = 500 (клип) + 1 символ многоточия');
assert.strictEqual(ruleMax('stack'), 2001, 'правила stack = 2000 (клип) + 1 символ многоточия');
assert.strictEqual(ruleMax('page'), clientClips['location.pathname.split(\'/\').pop() + location.search'], 'лимит page в правилах совпадает с обрезкой клиента');
assert.strictEqual(ruleMax('ctx'), clientClips["context || ''"], 'лимит ctx в правилах совпадает с обрезкой клиента');
assert.strictEqual(ruleMax('ver'), clientClips['vEl && vEl.textContent'], 'лимит ver в правилах совпадает с обрезкой клиента');
assert.match(fields.ts['.validate'], /newData\.isNumber\(\)/, 'ts — число');
assert.match(fields.ts['.validate'], /now \+ 3600000/, 'ts не может быть из будущего (защита от мусорных часов)');
assert.match(fields.n['.validate'], /newData\.val\(\) >= 1/, 'n — счётчик повторов, >= 1');

// ── 2. Клиентский конвейер в песочнице ──
function makeSandbox(opts) {
    const o = opts || {};
    const pushes = [];
    const logs = [];
    let clock = o.now || 1700000000000;
    const sandbox = {
        console: {
            log: (m) => logs.push(String(m)),
            warn: (m) => logs.push('warn:' + String(m)),
            error: (...a) => logs.push('error:' + a.map(String).join(' '))
        },
        Date: Object.assign(function () { return new Date(clock); }, { now: () => clock }),
        location: { pathname: '/marker.html', search: '?round=r1' },
        navigator: { onLine: true },
        document: {
            querySelector: (sel) => (sel === '.version-number' ? { textContent: '1.115.0' } : null),
            getElementById: () => null
        },
        window: { addEventListener: (t, fn) => { sandbox.__handlers[t] = fn; } },
        __handlers: {},
        firebase: {
            initializeApp: () => ({}),
            database: () => ({
                ref: (p) => ({
                    path: p,
                    push: (payload) => {
                        pushes.push(payload);
                        return o.pushRejects ? Promise.reject(new Error('permission-denied')) : Promise.resolve({ key: 'k' + pushes.length });
                    },
                    once: () => Promise.resolve({ val: () => ({}) })
                })
            }),
            auth: () => ({ onAuthStateChanged: () => {}, currentUser: null })
        },
        currentUser: null,
        currentLang: 'ru',
        db: null
    };
    sandbox.db = sandbox.firebase.database();
    vm.runInNewContext(source, sandbox);
    sandbox.__tick = (ms) => { clock += ms; };
    sandbox.__pushes = pushes;
    sandbox.__logs = logs;
    return sandbox;
}

function flush() { return new Promise((r) => setImmediate(() => setImmediate(r))); }

(async function () {
    const s = makeSandbox();
    assert.strictEqual(typeof s.reportError, 'function', 'reportError объявлена глобально');

    // 2.1 Первый репорт уходит в errorReports с ожидаемой формой.
    s.reportError(new Error('boom'), 'marker:save');
    await flush();
    assert.strictEqual(s.__pushes.length, 1, 'первая ошибка отправлена');
    const p = s.__pushes[0];
    assert.deepStrictEqual(Object.keys(p).sort(), ['ctx', 'lang', 'msg', 'n', 'page', 'stack', 'ts', 'uid', 'ver'].sort(), 'форма записи совпадает с правилами');
    assert.strictEqual(p.msg, 'boom');
    assert.strictEqual(p.ctx, 'marker:save');
    assert.strictEqual(p.page, 'marker.html?round=r1');
    assert.strictEqual(p.ver, '1.115.0');
    assert.strictEqual(p.lang, 'ru');
    assert.strictEqual(p.uid, '');
    assert.strictEqual(p.n, 1);
    assert.ok(p.msg.length <= 501 && p.page.length <= 120 && p.ctx.length <= 200 && p.ver.length <= 20 && p.lang.length <= 2 && p.uid.length <= 64,
        'все строковые поля в пределах, заданных правилами');
    assert.ok(p.stack.length <= 2001, 'стек обрезан до предела правил');

    // 2.2 Троттлинг: вторая ошибка в том же тике не отправляется.
    s.reportError(new Error('second'), 'ctx2');
    await flush();
    assert.strictEqual(s.__pushes.length, 1, 'в пределах минимального интервала репорт не дублируется');
    s.__tick(2500);
    s.reportError(new Error('second'), 'ctx2');
    await flush();
    assert.strictEqual(s.__pushes.length, 2, 'после истечения интервала репорт уходит');

    // 2.3 Дедупликация по ключу ctx|msg: не больше PESTOVO_ERR_MAX_PER_KEY.
    assert.strictEqual(s.PESTOVO_ERR_MAX_PER_KEY, 3, 'лимит повторов одной ошибки');
    // Вызовы идут последовательно: guard inFlight намеренно отбрасывает
    // синхронный шквал (защита от флуда), поэтому между ними ждём завершения.
    for (let i = 0; i < 10; i++) { s.__tick(3000); s.reportError(new Error('dup'), 'same'); await flush(); }
    const dupCount = s.__pushes.filter((x) => x.msg === 'dup').length;
    assert.strictEqual(dupCount, 3, 'одна и та же ошибка отправлена не более ' + s.PESTOVO_ERR_MAX_PER_KEY + ' раз, было ' + dupCount);
    const ns = s.__pushes.filter((x) => x.msg === 'dup').map((x) => x.n);
    assert.deepStrictEqual(ns, [1, 2, 3], 'счётчик повторов n растёт');

    // 2.4 Потолок на сессию.
    assert.strictEqual(s.PESTOVO_ERR_MAX_PER_SESSION, 20, 'потолок сообщений за сессию');
    for (let i = 0; i < 60; i++) { s.__tick(3000); s.reportError(new Error('uniq-' + i), 'c' + i); await flush(); }
    assert.ok(s.__pushes.length <= s.PESTOVO_ERR_MAX_PER_SESSION,
        'всего отправлено не больше потолка: ' + s.__pushes.length + ' <= ' + s.PESTOVO_ERR_MAX_PER_SESSION);

    // 2.5 Длинное сообщение обрезается, а не отвергается правилами.
    const big = makeSandbox();
    big.reportError({ message: 'x'.repeat(5000), stack: 'y'.repeat(9000) }, 'z'.repeat(900));
    await flush();
    assert.strictEqual(big.__pushes.length, 1, 'длинная ошибка отправлена');
    assert.strictEqual(big.__pushes[0].msg.length, 501, 'msg обрезан до 500 + многоточие');
    assert.strictEqual(big.__pushes[0].stack.length, 2001, 'stack обрезан до 2000 + многоточие');
    assert.strictEqual(big.__pushes[0].ctx.length, 201, 'ctx обрезан до 200 + многоточие');

    // 2.6 Отказ базы (правила не задеплоены) не роняет UI и не зацикливается.
    const bad = makeSandbox({ pushRejects: true });
    bad.reportError(new Error('nope'), 'ctx');
    await flush();
    assert.ok(bad.__pushes.length === 1, 'попытка записи была');
    assert.strictEqual(bad.pestovoErrRep.inFlight, false, 'флаг inFlight сброшен после отказа');
    assert.ok(bad.__logs.some((l) => l.indexOf('upload skipped') !== -1), 'отказ записи залогирован как предупреждение');
    const before = bad.__pushes.length;
    bad.__tick(3000);
    bad.reportError(new Error('nope2'), 'ctx');
    await flush();
    assert.strictEqual(bad.__pushes.length, before + 1, 'следующая ошибка обрабатывается, рекурсии нет');

    // 2.7 Мусор на входе не роняет обработчик.
    const junk = makeSandbox();
    for (const [i, v] of [undefined, null, 0, '', 'строка', {}, [], () => {}].entries()) {
        junk.__tick(3000);
        assert.doesNotThrow(() => junk.reportError(v, 'junk' + i), 'reportError не бросает на мусоре');
        await flush();
    }
    assert.ok(junk.__pushes.every((x) => typeof x.msg === 'string' && x.msg.length > 0), 'msg всегда непустая строка (требование правил)');

    // 2.8 Без инициализированной БД — только консоль.
    const nodb = makeSandbox();
    nodb.db = undefined;
    nodb.reportError(new Error('x'), 'ctx');
    await flush();
    assert.strictEqual(nodb.__pushes.length, 0, 'без db ничего не пишется');
    assert.ok(nodb.__logs.some((l) => l.indexOf('[reportError]') !== -1), 'в консоль ошибка всё равно попала');

    // ── 3. Глобальные перехватчики подключены ──
    assert.match(source, /window\.addEventListener\('error'/, 'перехват window.onerror');
    assert.match(source, /window\.addEventListener\('unhandledrejection'/, 'перехват невыполненных промисов');
    // Отдельная песочница: в `s` к этому месту исчерпан потолок на сессию.
    const g = makeSandbox();
    const onerror = g.__handlers.error;
    const onreject = g.__handlers.unhandledrejection;
    assert.strictEqual(typeof onerror, 'function', 'обработчик error зарегистрирован');
    assert.strictEqual(typeof onreject, 'function', 'обработчик unhandledrejection зарегистрирован');
    // ErrorEvent в Node нет — обработчик читает только .error/.message, поэтому
    // достаточно объектной формы события.
    onerror({ message: 'global fail', error: new Error('global fail') });
    await flush();
    assert.strictEqual(g.__pushes.length, 1, 'неперехваченная ошибка окна отправлена в errorReports');
    assert.ok(g.__pushes[0].ctx.indexOf('window.onerror') === 0, 'контекст window.onerror: ' + g.__pushes[0].ctx);
    assert.ok(!/global fail/.test(g.__pushes[0].ctx), 'текст ошибки не дублируется в контексте (иначе группировка рассыпается)');
    assert.strictEqual(g.__pushes[0].msg, 'global fail', 'сообщение взято из event.error');
    g.__tick(3000);
    onreject({ reason: new Error('promise fail') });
    await flush();
    assert.strictEqual(g.__pushes.length, 2, 'отклонённый промис тоже репортится');
    assert.strictEqual(g.__pushes[1].ctx, 'unhandledrejection', 'контекст unhandledrejection');
    assert.strictEqual(g.__pushes[1].msg, 'promise fail', 'сообщение взято из reason');

    // ── 4. Админка читает тот же узел ──
    assert.match(adminAudit, /root\.erLoad = function/, 'erLoad объявлена');
    assert.match(adminAudit, /root\.erClear = function/, 'erClear объявлена');
    assert.match(adminAudit, /db\.ref\('errorReports'\)/, 'читатель обращается к узлу errorReports');
    assert.match(adminAudit, /orderByChild\('ts'\)/, 'выборка упорядочена по ts (нужен .indexOn)');
    assert.match(adminAudit, /limitToLast\(200\)/, 'объём выборки ограничен');
    assert.match(adminAudit, /permission/i, 'отказ правил объяснён пользователю');
    assert.match(adminHtml, /id="er-results"/, 'в admin.html есть контейнер er-results');
    // Кнопки админки переведены на data-атрибуты (делегирование, п.2 плана).
    assert.match(adminHtml, /data-act="erLoad"/, 'кнопка обновления вызывает erLoad()');
    assert.match(adminHtml, /data-act="erClear"/, 'кнопка очистки вызывает erClear()');
    assert.match(adminJs, /t === 'scoreaudit' && typeof erLoad === 'function'/, 'erLoad вызывается при открытии вкладки диагностики');

    // Экранирование: текст ошибки приходит с чужого устройства и может содержать
    // разметку — рендер обязан экранировать и msg, и stack.
    const renderBlock = adminAudit.slice(adminAudit.indexOf('function erRender'), adminAudit.indexOf('root.erLoad'));
    assert.match(renderBlock, /esc\(g\.msg\)/, 'msg экранируется при выводе');
    assert.match(renderBlock, /esc\(g\.stack\)/, 'stack экранируется при выводе');
    assert.match(renderBlock, /esc\(p\)/, 'имена страниц экранируются');

    console.log('Error reporting tests passed (' + g.__pushes.length + ' global-handler reports)');
})().catch((err) => { console.error(err); process.exitCode = 1; });
