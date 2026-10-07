// Автотесты АГР-синхронизации: при смене точного гандикапа игрока его данные
// в турнирных раундах пересчитываются С УЧЁТОМ обрезки турнира, а в заявке
// турнира обновляется исходный HCP (страница турнира сама применяет обрезку).
// Запуск: node tools/test-admin-agr-cut.js
'use strict';
const fs = require('fs');
const vm = require('vm');

function extractFunction(src, name) {
    const start = src.indexOf('function ' + name + '(');
    if (start === -1) return null;
    let i = src.indexOf('{', start);
    let depth = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    }
    return null;
}

const adminSrc = fs.readFileSync(__dirname + '/../js/admin-agr.js', 'utf8'); // функции переехали из admin.js
const rgCutForRound = extractFunction(adminSrc, 'rgCutForRound');
const rgAgrNameSiteOrder = extractFunction(adminSrc, 'rgAgrNameSiteOrder');
const rgPropagate = extractFunction(adminSrc, 'rgPropagateHcpEverywhere');
if (!rgCutForRound || !rgAgrNameSiteOrder || !rgPropagate) {
    console.error('Не удалось извлечь функции из admin.js');
    process.exit(2);
}

const sandbox = { console, Date, Math, JSON, parseInt, parseFloat, isFinite, isNaN, String, Number, Array, Object, Promise, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    navigator: { language: 'ru' },
    document: { getElementById: () => null, createElement: () => ({}), querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, documentElement: { style: {}, setAttribute(){} },
        body: { style: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } } } } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/utils.js', 'utf8'), sandbox);
vm.runInContext(rgCutForRound + '\n' + rgAgrNameSiteOrder + '\n' + rgPropagate, sandbox);

let failures = 0;
function eq(actual, expected, label) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error('FAIL', label, '\n  actual:  ', a, '\n  expected:', e); }
    else console.log('ok  -', label);
}

// ── Фейковая БД: снимок + перехват update ──
// Записей теперь может быть несколько (AGR-раскатка + синхронизация гандикапа
// с составом турниров), поэтому update'ы накапливаем в один объект.
let dbState = {};
let lastUpdates = null;
function makeDb() {
    return {
        ref: function(path) {
            const p = path || '';
            return {
                once: function() { return Promise.resolve({ val: function() { return p ? dbState[p] : dbState; } }); },
                update: function(obj) { lastUpdates = Object.assign({}, lastUpdates || {}, obj); return Promise.resolve(); },
                set: function() { return Promise.resolve(); }
            };
        }
    };
}

function run(hcp, done) {
    lastUpdates = null;
    return sandbox.rgPropagateHcpEverywhere('u1', {
        hcp: hcp, gender: 'men', firstName: 'Михаил', middleName: 'Валерьевич', lastName: 'Прудовский'
    }, { gender: 'men' }).then(done);
}

// ── Сценарий 1: обрезка на турнире (макс. 28), HCP сменился на 12.0 ──
dbState = {
    'rounds': { r1: { tournamentId: 't1', players: { u1: { exactHcp: 28, exactHcpRaw: 36, fieldHcp: 33, tee: 'wh', gender: 'men', name: 'Прудовский М. В.' } } } },
    'tournaments': { t1: { hcpCut: { enabled: false, percent: 100, maxEnabled: true, maxMen: 28, maxWomen: null }, registeredPlayers: { u1: { handicap: 36, gender: 'men' } }, players: {
            p1: { uid: 'u1', fio: 'Прудовский М. В.', hi: 36, ch: 0, tee: 'wh', gender: 'men' },
            p2: { uid: 'u1', fio: 'Прудовский М. В.', hi: 36, ch: 5, tee: 'wh', gender: 'men' }
        } } },
    'protocols': {},
    'users/u1/history': {}
};
sandbox.db = makeDb();
// У p1 игровой гандикап автоматический (совпадает с расчётом от старого HI) —
// синхронизация обязана его пересчитать. У p2 CH выставлен организатором
// вручную (5) — его перезаписывать нельзя, обновляется только HI.
dbState.tournaments.t1.players.p1.ch = sandbox.getFieldHcp(36, 'wh', 'men');
run(12.0, function() {
    eq(lastUpdates['rounds/r1/players/u1/exactHcp'], 12, 'AGR: exactHcp = 12 (без обрезки, ниже макс.)');
    eq(lastUpdates['rounds/r1/players/u1/exactHcpRaw'], 12, 'AGR: exactHcpRaw обновлён на 12 (не остался 36)');
    eq(lastUpdates['rounds/r1/players/u1/fieldHcp'], sandbox.getFieldHcp(12, 'wh', 'men'), 'AGR: fieldHcp от 12');
    eq(lastUpdates['tournaments/t1/registeredPlayers/u1/handicap'], 12, 'AGR: заявка турнира обновлена на 12');
    eq(lastUpdates['users/u1/handicap'], 12, 'AGR: users.handicap = 12');
    eq(lastUpdates['tournaments/t1/players/p1/hi'], 12, 'AGR: гандикап уехал и в состав турнира (players/<pid>.hi)');
    eq(lastUpdates['tournaments/t1/players/p1/ch'], sandbox.getFieldHcp(12, 'wh', 'men'), 'AGR: CH участника пересчитан');
    eq(lastUpdates['tournaments/t1/players/p2/hi'], 12, 'AGR: HI обновлён и у записи с ручным CH');
    eq(lastUpdates['tournaments/t1/players/p2/ch'], undefined, 'AGR: ручной CH участника не перезаписан');

    // ── Сценарий 2: HCP 36 с обрезкой макс. 28 → exactHcp = 28 ──
    dbState['rounds'].r1.players.u1 = { exactHcp: 12, exactHcpRaw: 12, fieldHcp: 13, tee: 'wh', gender: 'men' };
    run(36.0, function() {
        eq(lastUpdates['rounds/r1/players/u1/exactHcp'], 28, 'AGR: exactHcp = 28 (обрезка макс. 28)');
        eq(lastUpdates['rounds/r1/players/u1/exactHcpRaw'], 36, 'AGR: exactHcpRaw = 36 (сырое значение)');
        eq(lastUpdates['rounds/r1/players/u1/fieldHcp'], sandbox.getFieldHcp(28, 'wh', 'men'), 'AGR: fieldHcp от обрезанного 28');
        eq(lastUpdates['tournaments/t1/registeredPlayers/u1/handicap'], 36, 'AGR: заявка хранит сырое 36 (страница применит обрезку)');

        // ── Сценарий 3: legacy — обрезка только в протоколе ──
        dbState = {
            'rounds': { r2: { protocolId: 'p1', players: { u1: { exactHcp: 28, exactHcpRaw: 36, fieldHcp: 33, tee: 'wh', gender: 'men' } } } },
            'tournaments': { t1: { registeredPlayers: { u1: { handicap: 36, gender: 'men' } } } },
            'protocols': { p1: { hcpCut: { enabled: false, percent: 100, maxEnabled: true, maxMen: 28, maxWomen: null } } },
            'users/u1/history': {}
        };
        run(36.0, function() {
            eq(lastUpdates['rounds/r2/players/u1/exactHcp'], 28, 'AGR legacy: exactHcp = 28 из protocols/<pid>/hcpCut');
            eq(lastUpdates['rounds/r2/players/u1/exactHcpRaw'], 36, 'AGR legacy: exactHcpRaw = 36');

            // ── Сценарий 4: обычный (не турнирный) раунд — обрезка не применяется ──
            dbState = {
                'rounds': { r3: { mode: 'group', players: { u1: { exactHcp: 20, fieldHcp: 22, tee: 'wh', gender: 'men' } } } },
                'tournaments': { t1: { hcpCut: { enabled: false, maxEnabled: true, maxMen: 28, maxWomen: null } } },
                'protocols': {},
                'users/u1/history': {}
            };
            run(36.0, function() {
                eq(lastUpdates['rounds/r3/players/u1/exactHcp'], 36, 'AGR обычный раунд: exactHcp = 36 (без обрезки)');
                eq(lastUpdates['rounds/r3/players/u1/exactHcpRaw'], undefined, 'AGR обычный раунд: exactHcpRaw не создаётся');

                console.log(failures ? '\n' + failures + ' FAILURES' : '\nAll AGR cut tests passed ✔');
                process.exit(failures ? 1 : 0);
            });
        });
    });
});
