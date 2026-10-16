// Реестр хуков готовности авторизации (аудит 2026-10, docs/IMPROVEMENTS-2026-10.md п.13).
//
// Страницы больше не переопределяют глобальную onAuthReady (это работало только
// благодаря порядку <script> в HTML), а регистрируют хук через
// pestovoOnAuthReady(). Тест проверяет сам реестр в песочнице и то, что все
// потребители перешли на него.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = path.join(__dirname, '..');
const jsDir = path.join(root, 'js');

// ── 1. Реестр в песочнице ──
const utils = fs.readFileSync(path.join(jsDir, 'utils.js'), 'utf8');
const start = utils.indexOf('var pestovoAuthReadyHooks = []');
assert.ok(start > 0, 'реестр хуков найден в js/utils.js');
const endMarker = utils.indexOf('function doLogout', start);
assert.ok(endMarker > start, 'блок реестра ограничен следующим объявлением');
const registry = utils.slice(start, endMarker);
assert.match(registry, /function onAuthReady\(/, 'onAuthReady объявлена внутри извлечённого блока');

function makeSandbox() {
    const navCalls = [];
    const reported = [];
    const sandbox = {
        console: { error: (...a) => reported.push('console:' + a.map(String).join(' ')), warn: () => {}, log: () => {} },
        navAuth: (u, d) => navCalls.push([u, d]),
        reportError: (e, ctx) => reported.push('reportError:' + ctx + ':' + (e && e.message))
    };
    vm.runInNewContext(registry, sandbox);
    sandbox.__nav = navCalls;
    sandbox.__reported = reported;
    return sandbox;
}

const s = makeSandbox();
assert.strictEqual(typeof s.pestovoOnAuthReady, 'function', 'pestovoOnAuthReady доступна глобально');

// 1.1 navAuth вызывается ровно один раз, хуки — после него и в порядке регистрации.
const order = [];
s.pestovoOnAuthReady(() => { order.push('first'); assert.strictEqual(s.__nav.length, 1, 'navAuth уже вызван к моменту первого хука'); });
s.pestovoOnAuthReady(() => order.push('second'));
s.onAuthReady({ uid: 'u1' }, { name: 'Игрок' });
assert.deepStrictEqual(s.__nav, [[{ uid: 'u1' }, { name: 'Игрок' }]], 'navAuth вызван один раз с теми же аргументами');
assert.deepStrictEqual(order, ['first', 'second'], 'хуки выполнены в порядке регистрации');

// 1.2 Повторный вызов (смена пользователя / выход) снова дёргает navAuth и все хуки.
order.length = 0;
s.onAuthReady(null, null);
assert.strictEqual(s.__nav.length, 2, 'navAuth вызван и на втором событии авторизации');
assert.deepStrictEqual(order, ['first', 'second'], 'хуки не теряются после первого вызова');

// 1.3 Ошибка одного хука не отменяет остальные и уходит в репортинг.
const s2 = makeSandbox();
const seen = [];
s2.pestovoOnAuthReady(() => { throw new Error('hook boom'); });
s2.pestovoOnAuthReady(() => seen.push('survivor'));
assert.doesNotThrow(() => s2.onAuthReady({ uid: 'u' }, null), 'падающий хук не роняет onAuthReady');
assert.deepStrictEqual(seen, ['survivor'], 'следующий хук выполнен несмотря на падение предыдущего');
assert.ok(s2.__reported.some(r => r.indexOf('reportError:onAuthReady:0') === 0 && r.indexOf('hook boom') !== -1),
    'ошибка хука отправлена в reportError с позицией: ' + JSON.stringify(s2.__reported));

// 1.4 Поздняя регистрация (скрипт догружен после onAuthStateChanged) выполняется сразу.
const s3 = makeSandbox();
s3.onAuthReady({ uid: 'late' }, { role: 'admin' });
let lateArgs = null;
s3.pestovoOnAuthReady((u, d) => { lateArgs = [u, d]; });
assert.deepStrictEqual(lateArgs, [{ uid: 'late' }, { role: 'admin' }],
    'поздний хук вызван сразу с последними аргументами авторизации');

// 1.5 Мусор на входе игнорируется, а не роняет реестр.
const s4 = makeSandbox();
[undefined, null, 0, '', {}, 'строка'].forEach(v => assert.doesNotThrow(() => s4.pestovoOnAuthReady(v)));
assert.strictEqual(s4.pestovoAuthReadyHooks.length, 0, 'не-функции не попадают в реестр');
assert.doesNotThrow(() => s4.onAuthReady(null, null));
assert.strictEqual(s4.__nav.length, 1, 'navAuth отработал и без хуков');

// ── 2. Все потребители перешли на реестр ──
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js') && !f.startsWith('vendor'));
const declarers = [];
const registrants = [];
for (const f of jsFiles) {
    const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
    if (/^function onAuthReady\s*\(/m.test(src)) declarers.push(f);
    if (/pestovoOnAuthReady\s*\(/.test(src) && f !== 'utils.js') registrants.push(f);
    // Перезапись глобала присваиванием — тот же антипаттерн, что и объявление.
    assert.ok(!/(root|window|globalThis)\.onAuthReady\s*=/.test(src),
        'js/' + f + ' перезаписывает глобальную onAuthReady присваиванием — используйте pestovoOnAuthReady()');
}
assert.deepStrictEqual(declarers, ['utils.js'],
    'onAuthReady должна быть объявлена только в js/utils.js, найдено: ' + declarers.join(', '));
const expected = ['admin.js', 'live.js', 'marker.js', 'scorer.js', 'tournament-public.js'];
assert.deepStrictEqual(registrants.sort(), expected,
    'набор зарегистрировавшихся страниц изменился: ' + registrants.sort().join(', '));

// Хуки не должны сами звать navAuth — иначе навигация отрисуется дважды.
for (const f of registrants) {
    const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
    const i = src.indexOf('pestovoOnAuthReady(');
    const block = src.slice(i, i + 1200);
    assert.ok(!/\bnavAuth\s*\(/.test(block),
        'js/' + f + ': хук вызывает navAuth — его уже вызывает базовая onAuthReady в utils.js');
}

// firebase-config.js по-прежнему дёргает единую точку входа (и только её).
const cfg = fs.readFileSync(path.join(jsDir, 'firebase-config.js'), 'utf8');
const cfgCalls = (cfg.match(/onAuthReady\(/g) || []).length;
assert.strictEqual(cfgCalls, 3, 'js/firebase-config.js вызывает onAuthReady в трёх ветках (user+data, user без data, не авторизован)');
assert.match(cfg, /typeof onAuthReady === 'function'/, 'вызов защищён проверкой доступности');
assert.ok(!/pestovoOnAuthReady/.test(cfg), 'firebase-config.js не работает с реестром напрямую — только через onAuthReady');

// Порядок подключения: utils.js обязан грузиться раньше всех потребителей,
// иначе pestovoOnAuthReady не существует на момент регистрации.
const htmlFiles = fs.readdirSync(root).filter(f => f.endsWith('.html'));
for (const f of htmlFiles) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    const scripts = [...src.matchAll(/<script[^>]+src="js\/([^"?]+)\.js\?v=[0-9a-f]+"/g)].map(m => m[1] + '.js');
    if (!scripts.includes('utils.js')) continue;
    const ui = scripts.indexOf('utils.js');
    for (const consumer of expected) {
        const ci = scripts.indexOf(consumer);
        if (ci === -1) continue;
        assert.ok(ui < ci, f + ': utils.js (' + ui + ') должен подключаться раньше ' + consumer + ' (' + ci + ')');
    }
}

console.log('Auth-ready hooks tests passed (регистраторов: ' + registrants.length + ')');
