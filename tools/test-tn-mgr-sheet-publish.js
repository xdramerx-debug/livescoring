// Автотест стартового листа (запуск: node tools/test-tn-mgr-sheet-publish.js)
// ---------------------------------------------------------------------------
// 1) Во флайте не бывает меньше 3 игроков (если в листе хватает игроков):
//    11 участников по 4 → 4+4+3, а не 4+4+2+1.
// 2) Кнопка «Опубликовать на сайте»: стартовый лист админки превращается в
//    протокол protocols/tnm_<tid>_<rid> (его читают страница «Турниры» и
//    печать QR qr-start.html), отметка tournaments/<tid>/sheetPublish/<rid>;
//    «Снять с публикации» и удаление листа убирают протокол.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function ok(cond, label, extra) {
    if (!cond) { failures++; console.error('FAIL', label, extra === undefined ? '' : extra); }
    else console.log('ok  -', label);
}
function eq(actual, expected, label) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error('FAIL', label, '\n  actual:  ', a, '\n  expected:', e); }
    else console.log('ok  -', label);
}

// ── In-memory Firebase: считаем все записи, чтобы проверить адреса ──
const dbState = { data: {}, writes: [] };
let pushSeq = 0;
function split(p) { return String(p || '').split('/').filter(function (x) { return x !== ''; }); }
function dbGet(p) {
    let node = dbState.data;
    const parts = split(p);
    for (let i = 0; i < parts.length; i++) {
        if (node == null || typeof node !== 'object') return null;
        node = node[parts[i]];
    }
    return node === undefined ? null : node;
}
function dbSet(p, value) {
    const parts = split(p);
    if (!parts.length) { dbState.data = value || {}; return; }
    let node = dbState.data;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
        node = node[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (value === null || value === undefined) delete node[last];
    else node[last] = value;
}
function makeRef(p) {
    const ref = {
        _p: p || '',
        key: split(p).slice(-1)[0] || null,
        once: function () { return Promise.resolve({ val: function () { return dbGet(ref._p); }, exists: function () { return dbGet(ref._p) != null; } }); },
        set: function (v) { dbState.writes.push({ path: ref._p, value: v }); dbSet(ref._p, v); return Promise.resolve(); },
        update: function (obj) {
            dbState.writes.push({ path: ref._p, value: obj });
            Object.keys(obj || {}).forEach(function (k) { dbSet((ref._p ? ref._p + '/' : '') + k, obj[k]); });
            return Promise.resolve();
        },
        remove: function () { dbSet(ref._p, null); return Promise.resolve(); },
        push: function (v) {
            const key = 'push' + (++pushSeq);
            const child = makeRef((ref._p ? ref._p + '/' : '') + key);
            if (v !== undefined) child.set(v);
            return child;
        },
        on: function () {}, off: function () {},
        orderByChild: function () { return ref; }, equalTo: function () { return ref; },
        limitToLast: function () { return ref; }, limitToFirst: function () { return ref; },
        startAt: function () { return ref; }, endAt: function () { return ref; }, orderByKey: function () { return ref; }
    };
    return ref;
}

const sandbox = {
    console, Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite, String, Number, Boolean,
    Array, Object, Promise, RegExp, Error, setTimeout, clearTimeout, setInterval, clearInterval,
    encodeURIComponent, decodeURIComponent,
    db: { ref: makeRef },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    sessionStorage: { getItem: function () { return null; }, setItem: function () {} },
    navigator: { language: 'ru', onLine: true },
    location: { search: '', pathname: '/admin.html', origin: 'https://club.example', href: '' },
    document: {
        getElementById: function () { return null; },
        querySelector: function () { return null; }, querySelectorAll: function () { return []; },
        createElement: function () { return { style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {} }; },
        addEventListener: function () {}, removeEventListener: function () {},
        body: {
            style: {},
            dataset: {},
            appendChild: function () {}, removeChild: function () {},
            setAttribute: function () {}, getAttribute: function () { return null; },
            querySelector: function () { return null; }, querySelectorAll: function () { return []; },
            addEventListener: function () {}, removeEventListener: function () {},
            classList: {
                _set: {},
                add: function (c) { this._set[c] = true; },
                remove: function (c) { delete this._set[c]; },
                toggle: function (c, on) { if (on === undefined) on = !this._set[c]; if (on) this._set[c] = true; else delete this._set[c]; return on; },
                contains: function (c) { return !!this._set[c]; }
            }
        },
        documentElement: { style: { setProperty: function () {} }, setAttribute: function () {}, classList: { add() {}, remove() {} } },
        head: { appendChild: function () {} }
    },
    alert: function () {}, confirm: function () { return true; },
    fetch: function () { return Promise.resolve({ json: function () { return Promise.resolve({}); } }); }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.currentLang = 'ru';
sandbox.currentUser = { uid: 'organizer' };
vm.createContext(sandbox);

function load(rel) { vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel }); }
load('js/tn-mgr-core.js');
load('js/tn-mgr-data.js');

const Core = sandbox.TnMgrCore;
const Data = sandbox.TnMgrData;

// ══════════════════════════════════════════════════════════
// 1. МИНИМУМ 3 ИГРОКА ВО ФЛАЙТЕ
// ══════════════════════════════════════════════════════════
const expectSizes = { 3: [3], 5: [5], 4: [4], 6: [3, 3], 7: [4, 3], 8: [4, 4], 9: [3, 3, 3], 10: [4, 3, 3], 11: [4, 4, 3], 13: [4, 3, 3, 3], 14: [4, 4, 3, 3] };
Object.keys(expectSizes).forEach(function (n) {
    eq(Array.from(Core.startGroupSizes(Number(n), 4, 3)), expectSizes[n], n + ' игроков по 4 → ' + expectSizes[n].join('+'));
});
for (let n = 3; n <= 40; n++) {
    const sizes = Array.from(Core.startGroupSizes(n, 4, 3));
    const sum = sizes.reduce(function (a, b) { return a + b; }, 0);
    // 5 игроков по 4 не делятся на флайты ≥3 — тогда один флайт из 5.
    if (sum !== n || sizes.some(function (s) { return s < 3 || s > (n === 5 ? 5 : 4); })) {
        ok(false, 'разбиение ' + n + ' игроков', sizes.join('+'));
    }
}
ok(true, 'для 3…40 игроков все флайты 3–4 человека (5 — один флайт) и сумма сходится');

function makePlayers(n, groupOf) {
    const list = [];
    for (let i = 0; i < n; i++) {
        list.push({ id: 'p' + i, lastName: 'Игроков' + i, firstName: 'Игрок', hi: 5 + i, tee: 'wh', gender: 'men',
            groupId: groupOf ? groupOf(i) : '' });
    }
    return list;
}
function flightSizes(entries) {
    const by = {};
    entries.forEach(function (e) {
        const key = e.startGroupId || (e.flight + '|' + e.startTime + '|' + e.startHole);
        by[key] = (by[key] || 0) + 1;
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort();
}

[5, 6, 9, 10, 11, 13, 17].forEach(function (n) {
    const built = Core.buildSheet({ players: makePlayers(n), groups: [], groupSize: 4, firstTeeTime: '09:00', startInterval: 8 });
    const sizes = flightSizes(built.entries);
    ok(built.entries.length === n, n + ' игроков: все в листе', built.entries.length);
    ok(sizes.every(function (s) { return s >= 3; }), n + ' игроков: нет флайтов меньше 3', sizes.join(','));
});
// Две зачётные группы по 5 человек: 5 не делится на флайты ≥3 по 4, поэтому
// группы сливаются при разбиении, но каждый игрок остаётся в своей группе.
(function () {
    const groups = [{ id: 'gA', name: 'A', order: 1 }, { id: 'gB', name: 'B', order: 2 }];
    const players = makePlayers(10, function (i) { return i < 5 ? 'gA' : 'gB'; });
    const built = Core.buildSheet({ players: players, groups: groups, groupSize: 4, firstTeeTime: '09:00', startInterval: 8 });
    const sizes = flightSizes(built.entries);
    ok(sizes.every(function (s) { return s >= 3; }), 'группы 5+5: нет флайтов меньше 3', sizes.join(','));
    const wrong = built.entries.filter(function (e) {
        const idx = Number(String(e.playerId).slice(1));
        return e.groupId && e.groupId !== (idx < 5 ? 'gA' : 'gB');
    });
    ok(!wrong.length, 'группы 5+5: зачётная группа игрока не меняется', wrong.map(function (e) { return e.playerId + ':' + e.groupId; }).join(','));
})();
// Маленький лист (2 игрока) — один флайт из двух, без ошибок.
(function () {
    const built = Core.buildSheet({ players: makePlayers(2), groups: [], groupSize: 4, firstTeeTime: '09:00' });
    eq(flightSizes(built.entries), [2], '2 игрока — один флайт из двух');
})();

// ══════════════════════════════════════════════════════════
// 2. ПУБЛИКАЦИЯ СТАРТОВОГО ЛИСТА НА САЙТЕ
// ══════════════════════════════════════════════════════════
const players = {};
makePlayers(7).forEach(function (p) { players[p.id] = p; });
const tournament = {
    name: 'Кубок клуба', startDate: '2026-09-01', startTime: '09:00', formats: ['stroke'],
    rounds: { r1: { id: 'r1', name: 'Раунд 1', date: '2026-09-01' } },
    players: players
};
dbState.data = { tournaments: { tnA: JSON.parse(JSON.stringify(tournament)) } };

Promise.resolve()
    .then(function () { return Data.generateSheet('tnA', 'r1', { groupSize: 4, firstTeeTime: '09:00' }, tournament); })
    .then(function () {
        const sheet = dbGet('tournaments/tnA/sheets/r1');
        ok(!!sheet && Data.sheetOrder(sheet).length === 7, 'стартовый лист создан (7 игроков)');
        eq(flightSizes(Data.sheetOrder(sheet)), [3, 4], 'лист из 7 игроков: флайты 4+3');
        eq(Array.from(new Set(Data.sheetOrder(sheet).map(e => e.flight))), ['1', '2'], 'сохранены два отдельных флайта');
        Data.sheetOrder(sheet).forEach(function (entry) {
            const url = new URL(entry.qr, 'https://club.example/');
            eq(url.searchParams.get('as'), entry.playerId, 'персональный QR выбирает игрока карточки как Я');
            eq(url.searchParams.get('round'), entry.groupRoundId, 'QR использует реальный раунд группы');
            eq(dbGet('rounds/' + entry.groupRoundId + '/players/' + entry.playerId).name, entry.playerName, 'ФИО карточки совпадает с ФИО в раунде');
            eq(dbGet('rounds/' + entry.groupRoundId + '/markerAssignments/' + entry.markerPlayerId).targetId, entry.playerId, 'назначение маркера не изменилось');
            const markerUrl = new URL(sheet.markers[entry.markerPlayerId].qr, 'https://club.example/');
            eq(markerUrl.searchParams.get('as'), entry.markerPlayerId, 'отдельная ссылка маркера соответствует маркеру');
        });
        ok(dbGet('protocols/' + Data.sheetProtocolId('tnA', 'r1')) == null, 'до публикации протокола на сайте нет');
        const fresh = dbGet('tournaments/tnA');
        return Data.publishSheet('tnA', 'r1', fresh);
    })
    .then(function (res) {
        const pid = Data.sheetProtocolId('tnA', 'r1');
        eq(pid, 'tnm_tnA_r1', 'ключ протокола детерминированный');
        eq(res && res.protocolId, pid, 'publishSheet вернул id протокола');
        const proto = dbGet('protocols/' + pid) || {};
        eq(proto.source, 'tn-manager', 'протокол помечен source=tn-manager');
        eq(proto.tournamentId, 'tnA', 'протокол привязан к турниру');
        eq(proto.tournamentRoundId, 'r1', 'протокол привязан к раунду');
        eq(proto.date, '2026-09-01', 'дата протокола = дата раунда');
        eq(proto.scheme, 'single1', 'схема старта: с 1-й лунки');
        const groups = Object.keys(proto.groups || {}).sort().map(function (k) { return proto.groups[k]; });
        eq(groups.length, 2, 'в протоколе 2 стартовые группы');
        eq(groups.map(function (g) { return (g.players || []).length; }).sort(), [3, 4], 'составы групп 4+3');
        const p0 = groups[0].players[0];
        ok(typeof p0.exactHcp === 'number', 'у игрока точный HCP', p0.exactHcp);
        ok(typeof p0.fieldHcp === 'number', 'у игрока полевой HCP', p0.fieldHcp);
        ok(!!p0.name, 'у игрока ФИО', p0.name);
        ok(groups.every(function (g) { return g.startTimeText; }), 'у групп время старта');
        ok(groups.every(function (g) { return Number(g.startHole) === 1; }), 'у групп стартовая лунка');
        const mark = dbGet('tournaments/tnA/sheetPublish/r1') || {};
        eq(mark.protocolId, pid, 'отметка публикации в турнире');
        eq(mark.players, 7, 'в отметке число игроков');
        ok(!!Data.sheetPublication(dbGet('tournaments/tnA'), 'r1'), 'sheetPublication видит публикацию');
        // Повторная публикация обновляет ту же запись, createdAt сохраняется.
        const created = proto.createdAt;
        return Data.publishSheet('tnA', 'r1', dbGet('tournaments/tnA')).then(function () {
            const again = dbGet('protocols/' + pid) || {};
            eq(again.createdAt, created, 'повторная публикация не меняет createdAt');
            eq(Object.keys(dbGet('protocols') || {}).length, 1, 'повторная публикация не плодит протоколы');
        });
    })
    .then(function () { return Data.unpublishSheet('tnA', 'r1'); })
    .then(function () {
        ok(dbGet('protocols/tnm_tnA_r1') == null, '«Снять с публикации» удаляет протокол');
        ok(dbGet('tournaments/tnA/sheetPublish/r1') == null, '«Снять с публикации» удаляет отметку');
        ok(!Data.sheetPublication(dbGet('tournaments/tnA'), 'r1'), 'sheetPublication: не опубликован');
        return Data.publishSheet('tnA', 'r1', dbGet('tournaments/tnA'));
    })
    .then(function () {
        ok(dbGet('protocols/tnm_tnA_r1') != null, 'публикация снова');
        return Data.deleteSheet('tnA', 'r1', dbGet('tournaments/tnA'));
    })
    .then(function () {
        ok(dbGet('protocols/tnm_tnA_r1') == null, 'удаление листа снимает его с сайта');
        ok(dbGet('tournaments/tnA/sheetPublish/r1') == null, 'удаление листа удаляет отметку публикации');
        // Пустой лист опубликовать нельзя.
        return Data.publishSheet('tnA', 'r1', dbGet('tournaments/tnA')).then(function () {
            ok(false, 'пустой лист не публикуется');
        }, function (err) {
            ok(/пуст/i.test(String(err && err.message)), 'пустой лист не публикуется (понятная ошибка)', err && err.message);
        });
    })
    .then(function () {
        console.log(failures ? '\n' + failures + ' FAIL' : '\nВсе проверки пройдены');
        process.exit(failures ? 1 : 0);
    })
    .catch(function (err) {
        console.error('ОШИБКА СЦЕНАРИЯ:', err && err.stack || err);
        process.exit(1);
    });
