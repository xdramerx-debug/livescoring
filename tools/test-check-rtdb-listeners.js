// Самопроверка tools/check-rtdb-listeners.js (аудит 2026-10, п.10).
//
// Гейт бесполезен, если он не ловит нарушение или ловит его не там. Проверяем
// анализатор на синтетических фрагментах: один незащищённый и четыре защищённых
// паттерна (guard-флаг, реестр по ключу, .off() в файле, делегирование в
// bindRealtimeValue), а затем — что реальный каталог js/ проходит чисто.
'use strict';
const path = require('path');
const assert = require('assert');
const checker = require('./check-rtdb-listeners.js');

const { findSubscriptions, isProtected, functionBody } = checker;

function analyse(src) {
    const sites = findSubscriptions(src);
    return sites.map(site => ({ site, why: site.scope ? isProtected(src, site) : 'top-level' }));
}

// ── 1. Области видимости ──
const scopes = analyse([
    "db.ref('settings/a').on('value', cb);",              // верхний уровень
    "function loadOnce() {",
    "    db.ref('rounds/' + rid).on('value', cb);",        // внутри функции
    "    function inner() {",
    "        db.ref('x').on('child_added', cb);",          // вложенная именованная
    "    }",
    "}",
    "db.ref('settings/b').on('child_changed', cb);"        // верхний уровень
].join('\n'));
assert.strictEqual(scopes.length, 4, 'найдены все 4 подписки, получено ' + scopes.length);
assert.strictEqual(scopes[0].site.scope, null, 'первая — верхний уровень');
assert.strictEqual(scopes[0].why, 'top-level');
assert.strictEqual(scopes[1].site.scope, 'loadOnce', 'вторая — внутри loadOnce');
assert.strictEqual(scopes[2].site.scope, 'inner', 'вложенная именованная функция определяется как область');
assert.strictEqual(scopes[3].site.scope, null, 'подписка после закрытия функции снова верхнеуровневая');
assert.strictEqual(scopes[1].site.line, 3, 'номер строки совпадает с исходником');

// `.on()` без RTDB-события (jQuery-подобные шины tn-mgr-printcards.js) не учитываются.
assert.strictEqual(findSubscriptions("el.on('click', fn);\nbus.on('tnpc-row-reset', fn);").length, 0,
    'DOM/шинные .on() не считаются RTDB-подписками');

// ── 2. Незащищённая подписка ──
const naked = [
    "function refresh() {",
    "    var ref = db.ref('rounds/' + rid);",
    "    ref.on('value', function (sn) { render(sn.val()); });",
    "}"
].join('\n');
assert.strictEqual(isProtected(naked, findSubscriptions(naked)[0]), null,
    'подписка без guard/реестра/.off/делегирования обязана считаться незащищённой');

// ── 3. Паттерн «guard-флаг» ──
const guarded = [
    "var loadStarted = false;",
    "function loadMk() {",
    "    if (loadStarted) return;",
    "    loadStarted = true;",
    "    db.ref('rounds/' + rid).on('value', cb);",
    "}"
].join('\n');
const guardedWhy = isProtected(guarded, findSubscriptions(guarded)[0]);
assert.match(String(guardedWhy), /guard-флаг loadStarted/, 'guard-флаг распознан: ' + guardedWhy);

// Флаг на window и составное условие — тоже guard.
const winGuarded = [
    "function listen() {",
    "    if (typeof db === 'undefined' || !myUid) return;",
    "    if (window._listening) return;",
    "    window._listening = true;",
    "    db.ref('users/' + myUid).on('child_added', cb);",
    "}"
].join('\n');
assert.match(String(isProtected(winGuarded, findSubscriptions(winGuarded)[0])), /guard-флаг _listening/,
    'флаг window._listening распознан');

// ── 4. Паттерн «реестр по ключу» ──
const registry = [
    "var bindings = {};",
    "function bindRealtimeValue(key, ref, render) {",
    "    var binding = bindings[key];",
    "    if (!binding) {",
    "        binding = bindings[key] = { render: render };",
    "        ref.on('value', function (sn) { binding.render(sn); });",
    "    }",
    "}"
].join('\n');
assert.match(String(isProtected(registry, findSubscriptions(registry)[0])), /реестр подписок по ключу/,
    'реестр с проверкой через локальную переменную распознан (паттерн bindRealtimeValue)');

// ── 5. Паттерн «делегирование в bindRealtimeValue» ──
const delegated = [
    "function initSettings() {",
    "    var ref = db.ref('settings/x');",
    "    var receive = function (sn) { apply(sn.val()); };",
    "    if (typeof bindRealtimeValue === 'function') bindRealtimeValue('settings-x', ref, receive);",
    "    else ref.on('value', receive);",
    "}"
].join('\n');
assert.match(String(isProtected(delegated, findSubscriptions(delegated)[0])), /bindRealtimeValue/,
    'делегирование в общий реестр распознано');

// ── 6. Паттерн «.off() в файле» ──
const withOff = [
    "function initRoundView() {",
    "    db.ref('rounds/' + curRid).on('value', handler);",
    "}",
    "function stopRoundView() {",
    "    db.ref('rounds/' + curRid).off('value', handler);",
    "}"
].join('\n');
assert.match(String(isProtected(withOff, findSubscriptions(withOff)[0])), /\.off\(\)/,
    'наличие снятия подписки в файле распознано');

// ── 7. functionBody извлекает тело по имени ──
assert.match(functionBody(guarded, 'loadMk'), /loadStarted = true/, 'functionBody находит тело loadMk');
assert.strictEqual(functionBody(guarded, 'нетТакой'), '', 'для неизвестного имени — пустая строка');

// ── 8. Реальный каталог js/ проходит гейт ──
const { stats, problems } = checker.scanDir(path.join(__dirname, '..', 'js'));
assert.deepStrictEqual(problems.map(p => p.file + ':' + p.line + ' ' + p.fn), [],
    'в js/ остались незащищённые RTDB-подписки');
assert.ok(stats.total >= 30, 'анализатор видит подписки: ' + stats.total);
assert.strictEqual(stats.inFunction, stats.protected,
    'все подписки внутри функций защищены (' + stats.protected + '/' + stats.inFunction + ')');
assert.ok(stats.topLevel >= 10, 'подписки верхнего уровня учитываются отдельно: ' + stats.topLevel);

// ── 9. Конкретные исправления этой волны зафиксированы ──
const readRaw = checker.readRaw;
const solo = readRaw(path.join(__dirname, '..', 'js/solo.js'));
assert.match(solo, /_pestovoCallResponsesRef\.off\('child_added'\)/,
    'solo.js снимает прежнюю подписку при смене игрока');
assert.match(solo, /window\._pestovoCallResponsesRef = callResponsesRef/,
    'solo.js запоминает ref, чтобы его можно было снять');
const utils = readRaw(path.join(__dirname, '..', 'js/utils.js'));
assert.match(utils, /var pestovoPrivacySettingsBound = false;/,
    'utils.js: guard-флаг для initPrivacySettings объявлен');
assert.match(utils, /if \(pestovoPrivacySettingsBound\) return;/,
    'utils.js: initPrivacySettings не подписывается дважды');

console.log('RTDB listeners checker tests passed (всего ' + stats.total +
    ': верхний уровень ' + stats.topLevel + ', в функциях ' + stats.inFunction + ')');
