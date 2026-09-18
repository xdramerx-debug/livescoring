// Cloud Functions: синтаксис, CORS, аудитория пушей, устойчивость обработчиков.
// Запуск: node tools/test-functions-push.js
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var { spawnSync } = require('child_process');

var ROOT = path.join(__dirname, '..');
var SRC = path.join(ROOT, 'functions', 'index.js');
var failures = 0, checks = 0;
function ok(cond, label) {
    checks++;
    if (!cond) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}
function eq(a, b, label) {
    var as = JSON.stringify(a), es = JSON.stringify(b);
    ok(as === es, label + (as === es ? '' : ' :: actual ' + as + ' expected ' + es));
}

var syntax = spawnSync(process.execPath, ['--check', SRC], { encoding: 'utf8' });
ok(syntax.status === 0, 'functions/index.js: синтаксис (node --check)');
if (syntax.status !== 0) console.error(syntax.stderr || syntax.stdout);

var src = fs.readFileSync(SRC, 'utf8');
ok(src.indexOf('exports.vapidSetup') !== -1, 'экспорт vapidSetup');
ok(src.indexOf('exports.onBroadcastCreated') !== -1, 'экспорт onBroadcastCreated');
ok(src.indexOf('exports.onAlertCreated') !== -1, 'экспорт onAlertCreated');
ok(/req\.method === ['"]OPTIONS['"]/.test(src), 'vapidSetup отвечает на CORS preflight (OPTIONS)');
ok(src.indexOf('Access-Control-Allow-Origin') !== -1, 'CORS: Access-Control-Allow-Origin');
ok(src.indexOf('Access-Control-Allow-Methods') !== -1, 'CORS: Access-Control-Allow-Methods');
ok(src.indexOf("status(204)") !== -1 || src.indexOf('status(204)') !== -1, 'OPTIONS: 204');

var bcBlock = src.slice(src.indexOf('exports.onBroadcastCreated'), src.indexOf('exports.onAlertCreated'));
ok(bcBlock.indexOf('try {') !== -1 && bcBlock.indexOf('onBroadcastCreated failed') !== -1,
    'onBroadcastCreated: try/catch, ошибка не роняет функцию');
var alBlock = src.slice(src.indexOf('exports.onAlertCreated'));
ok(alBlock.indexOf('try {') !== -1 && alBlock.indexOf('onAlertCreated failed') !== -1,
    'onAlertCreated: try/catch, ошибка не роняет функцию');
ok(src.indexOf('err.statusCode === 404 || err.statusCode === 410') !== -1,
    'мёртвые подписки 404/410 удаляются');
ok(src.indexOf('function audienceOf') !== -1, 'audienceOf вынесен отдельно');
ok(src.indexOf("url: '/admin.html'") !== -1, 'вызов судьи/маршала ведёт в админку');

var m = src.match(/function audienceOf\(b\) \{[\s\S]*?\n\}/);
ok(!!m, 'audienceOf извлечена для юнит-теста');
var box = { console: console };
vm.createContext(box);
vm.runInContext(m[0] + '\nthis.audienceOf = audienceOf;', box);

eq(box.audienceOf({}).type, 'all', 'audience: по умолчанию all');
eq(box.audienceOf({ audience: { type: 'roster', uids: { a: true, b: false, c: 1 } } }).type, 'roster',
    'audience: roster сохраняется');
eq(box.audienceOf({ audience: { type: 'protocol' } }).type, 'protocol', 'audience: protocol');
eq(box.audienceOf({ audience: { type: 'hackers' } }).type, 'all', 'audience: неизвестный тип → all');
eq(box.audienceOf({ audience: { includePwa: true } }).includePwa, true, 'audience: includePwa');
eq(box.audienceOf({ audience: { includePwa: 'yes' } }).includePwa, false, 'audience: includePwa только строгий true');
eq(Object.keys(box.audienceOf({ audience: { type: 'roster', uids: { a: true, b: false, c: null } } }).uids).sort(),
    ['a'], 'audience: false/null uid отсекаются');

function pickTargets(aud, allSubs) {
    if (aud.type === 'all') return allSubs.filter(function(s) { return aud.includePwa || !!s.uid; });
    return allSubs.filter(function(s) { return s.uid && aud.uids[String(s.uid)]; });
}
var subs = [
    { uid: 'u1', endpoint: 'e1', keys: { p256dh: 'x', auth: 'y' } },
    { uid: '', endpoint: 'eGuest', keys: { p256dh: 'x', auth: 'y' } },
    { uid: 'u2', endpoint: 'e2', keys: { p256dh: 'x', auth: 'y' } }
];
eq(pickTargets(box.audienceOf({ audience: { type: 'all' } }), subs).map(function(s) { return s.endpoint; }),
    ['e1', 'e2'], 'all без PWA: только вошедшие');
eq(pickTargets(box.audienceOf({ audience: { type: 'all', includePwa: true } }), subs).map(function(s) { return s.endpoint; }),
    ['e1', 'eGuest', 'e2'], 'all + PWA: включая гостей');
eq(pickTargets(box.audienceOf({ audience: { type: 'roster', uids: { u2: true } } }), subs).map(function(s) { return s.endpoint; }),
    ['e2'], 'roster: только uid из снимка');

console.log('');
console.log(failures ? ('ПРОВАЛЕНО: ' + failures + ' из ' + checks) : ('ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (' + checks + ')'));
process.exit(failures ? 1 : 0);
