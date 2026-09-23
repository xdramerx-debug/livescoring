// Главная: активный турнир виден в #active-tournament-section, пока идёт.
// Запуск: node tools/test-home-active-tournament.js
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var { spawnSync } = require('child_process');

var ROOT = path.join(__dirname, '..');
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

var syntax = spawnSync(process.execPath, ['--check', path.join(ROOT, 'js', 'utils.js')], { encoding: 'utf8' });
ok(syntax.status === 0, 'js/utils.js: синтаксис');
syntax = spawnSync(process.execPath, ['--check', path.join(ROOT, 'js', 'app.js')], { encoding: 'utf8' });
ok(syntax.status === 0, 'js/app.js: синтаксис');

var utilsSrc = fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8');
var appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
var indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

ok(indexHtml.indexOf('id="active-tournament-section"') !== -1, 'index.html: секция активного турнира');
ok(indexHtml.indexOf('id="live-tournament-rounds"') !== -1, 'index.html: контейнер турнирных раундов');
ok(utilsSrc.indexOf('function isLiveTournament') !== -1, 'utils: isLiveTournament');
ok(utilsSrc.indexOf("window.isLiveTournament = isLiveTournament") !== -1, 'utils: isLiveTournament экспортирован');
ok(utilsSrc.indexOf("updates['tournaments/' + tnId + '/lifecycleStatus'] = 'active'") !== -1,
    'старт турнира пишет lifecycleStatus=active');
ok(appSrc.indexOf('isLiveTournament') !== -1, 'app: homeActiveTnList использует isLiveTournament');
ok(appSrc.indexOf('renderHomeLiveRounds(homeLastRoundsData || {})') !== -1,
    'app: турниры рисуются, даже если раунды ещё не пришли');

function fakeEl(id) {
    var el = {
        id: id, _html: '', textContent: '', value: '', className: '',
        style: { setProperty: function() {}, removeProperty: function() {} },
        classList: {
            _set: {},
            add: function(c) { this._set[c] = true; },
            remove: function(c) { delete this._set[c]; },
            toggle: function(c, on) {
                if (on === undefined) on = !this._set[c];
                if (on) this._set[c] = true; else delete this._set[c];
                return !!on;
            },
            contains: function(c) { return !!this._set[c]; }
        },
        set innerHTML(v) { this._html = String(v); },
        get innerHTML() { return this._html; },
        querySelector: function(sel) {
            if (!this._html) return null;
            if (sel === '.lwl-row' || sel.indexOf('.lwl-row') === 0) {
                return /lwl-row/.test(this._html) ? fakeEl('row') : null;
            }
            return null;
        },
        querySelectorAll: function(sel) {
            if (!this._html) return [];
            var n = 0;
            if (sel === '.lwl-row' || sel.indexOf('.lwl-row') === 0) {
                n = (this._html.match(/class="[^"]*lwl-row/g) || []).length;
            }
            var out = [];
            for (var i = 0; i < n; i++) out.push(fakeEl('q' + i));
            return out;
        },
        getAttribute: function(name) {
            if (name === 'data-tn-id') {
                var m = /data-tn-id="([^"]*)"/.exec(this._html);
                return m ? m[1] : null;
            }
            return null;
        },
        setAttribute: function() {}, appendChild: function() {}, removeChild: function() {},
        addEventListener: function() {}, removeEventListener: function() {}
    };
    return el;
}

function makeSandbox(store) {
    store = store || { rounds: {}, tournaments: {} };
    var els = {};
    function getEl(id) { if (!els[id]) els[id] = fakeEl(id); return els[id]; }
    ['live-rounds', 'live-tournament-rounds', 'active-tournament-section', 'course-holes-strip', 'course-card']
        .forEach(function(id) { els[id] = fakeEl(id); });
    els['active-tournament-section'].classList.add('hidden');

    function makeRef(p) {
        var ref = {
            _p: p || '',
            on: function(ev, cb) {
                if (ev !== 'value') return;
                var val = p === 'rounds' ? store.rounds : (p === 'tournaments' ? store.tournaments : null);
                cb({ val: function() { return val; } });
            },
            off: function() {},
            once: function() {
                var val = p === 'rounds' ? store.rounds : (p === 'tournaments' ? store.tournaments : null);
                return Promise.resolve({ val: function() { return val; } });
            },
            update: function() { return Promise.resolve(); },
            set: function() { return Promise.resolve(); },
            remove: function() { return Promise.resolve(); },
            child: function() { return makeRef(p); }
        };
        return ref;
    }

    var sandbox = {
        console: console,
        Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array,
        String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error,
        parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN, isFinite: isFinite,
        encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
        setTimeout: function() { return 0; }, clearTimeout: function() {},
        setInterval: function() { return 0; }, clearInterval: function() {},
        Promise: Promise,
        document: {
            getElementById: getEl,
            createElement: function() { return fakeEl('created'); },
            querySelector: function() { return null; },
            querySelectorAll: function() { return []; },
            addEventListener: function() {},
            removeEventListener: function() {},
            documentElement: { style: { setProperty: function() {} }, setAttribute: function() {}, classList: { add: function() {}, remove: function() {} } },
            body: { style: {}, classList: { add: function() {}, remove: function() {}, toggle: function() {}, contains: function() { return false; } }, appendChild: function() {} },
            head: { appendChild: function() {} }
        },
        localStorage: { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} },
        sessionStorage: { getItem: function() { return null; }, setItem: function() {} },
        navigator: { language: 'ru', onLine: true, vibrate: function() {} },
        location: { search: '', pathname: '/index.html', origin: 'https://club.test', href: 'https://club.test/index.html' },
        currentUser: null,
        currentUserData: null,
        toast: function() {},
        vib: function() {},
        db: { ref: function(p) { return makeRef(p); } },
        firebase: { auth: function() { return { onAuthStateChanged: function() {}, currentUser: null }; } }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.self = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(utilsSrc, sandbox, { filename: 'js/utils.js' });
    vm.runInContext(appSrc, sandbox, { filename: 'js/app.js' });
    sandbox.currentLang = 'ru';
    sandbox._els = els;
    sandbox._store = store;
    return sandbox;
}

// ── isLiveTournament: unit ──
var liveBox = makeSandbox();
ok(typeof liveBox.isLiveTournament === 'function', 'isLiveTournament доступен');
ok(liveBox.isLiveTournament({ status: 'active' }) === true, 'live: legacy status=active');
ok(liveBox.isLiveTournament({ status: 'upcoming', lifecycleStatus: 'active' }) === true,
    'live: v2 lifecycleStatus=active при status=upcoming');
ok(liveBox.isLiveTournament({ startedAt: 1 }) === true, 'live: startedAt без finishedAt');
ok(liveBox.isLiveTournament({ status: 'upcoming' }) === false, 'не live: upcoming');
ok(liveBox.isLiveTournament({ lifecycleStatus: 'registration' }) === false, 'не live: registration');
ok(liveBox.isLiveTournament({ lifecycleStatus: 'draft' }) === false, 'не live: draft');
ok(liveBox.isLiveTournament({ status: 'completed', lifecycleStatus: 'active' }) === false,
    'не live: completed перекрывает active');
ok(liveBox.isLiveTournament({ lifecycleStatus: 'cancelled' }) === false, 'не live: cancelled');
ok(liveBox.isLiveTournament({ startedAt: 1, finishedAt: 2 }) === false, 'не live: finishedAt');
ok(liveBox.isLiveTournament(null) === false, 'не live: null');

// ── UI: lifecycleStatus=active, раундов нет ──
var NOW = Date.now();
var s1 = makeSandbox({
    tournaments: {
        tn_v2: { name: 'Кубок Пестово', status: 'upcoming', lifecycleStatus: 'active', startedAt: NOW },
        tn_done: { name: 'Старый кубок', status: 'completed', lifecycleStatus: 'completed' },
        tn_soon: { name: 'Осень', status: 'upcoming', lifecycleStatus: 'registration' }
    },
    rounds: {}
});
s1.loadLiveRounds();
var sec1 = s1._els['active-tournament-section'];
var tn1 = s1._els['live-tournament-rounds'];
ok(sec1.classList.contains('hidden') === false, 'UI: секция видна при lifecycleStatus=active без раундов');
ok(tn1.innerHTML.indexOf('Кубок Пестово') !== -1, 'UI: название активного турнира на главной');
ok(tn1.innerHTML.indexOf('Турнир идёт') !== -1, 'UI: бейдж «Турнир идёт»');
ok(tn1.innerHTML.indexOf('Старый кубок') === -1, 'UI: завершённый турнир скрыт');
ok(tn1.innerHTML.indexOf('Осень') === -1, 'UI: upcoming/registration скрыт');
ok(tn1.innerHTML.indexOf('tournaments.html?id=tn_v2') !== -1, 'UI: ссылка ведёт на турнир');
ok(s1.homeActiveTnList().length === 1 && s1.homeActiveTnList()[0][0] === 'tn_v2',
    'homeActiveTnList: только live-турнир');

// ── UI: активный раунд без счетов ──
var s2 = makeSandbox({
    tournaments: {
        tn_live: { name: 'Open Пестово', status: 'active', lifecycleStatus: 'active', startedAt: NOW }
    },
    rounds: {
        r1: {
            status: 'active', tournamentId: 'tn_live', tournamentName: 'Open Пестово',
            mode: 'group', createdAt: NOW, startTime: NOW, startHole: 1, format: 'Stroke Play',
            players: { u1: { name: 'Иванов Иван', fieldHcp: 10, exactHcp: 10.2, tee: 'wh', scores: {} } }
        }
    }
});
s2.loadLiveRounds();
var sec2 = s2._els['active-tournament-section'];
var tn2 = s2._els['live-tournament-rounds'];
ok(sec2.classList.contains('hidden') === false, 'UI: секция видна при раундах без счетов');
ok(tn2.innerHTML.indexOf('Open Пестово') !== -1, 'UI: турнир без счетов не пустой');
ok(tn2.innerHTML.length > 40, 'UI: блок не пустая строка при holesPlayed=0');

// ── UI: есть счета — топ-3 ──
var s3 = makeSandbox({
    tournaments: {
        tn_live: { name: 'Open Пестово', status: 'active', startedAt: NOW }
    },
    rounds: {
        r1: {
            status: 'active', tournamentId: 'tn_live', tournamentName: 'Open Пестово',
            mode: 'group', createdAt: NOW, startTime: NOW, startHole: 1, format: 'Stroke Play',
            players: { u1: { name: 'Иванов Иван', fieldHcp: 10, exactHcp: 10.2, tee: 'wh', scores: { 1: 4, 2: 5 } } }
        }
    }
});
s3.loadLiveRounds();
var tn3 = s3._els['live-tournament-rounds'];
ok(tn3.innerHTML.indexOf('Open Пестово') !== -1, 'UI: турнир со счетами показан');
ok(tn3.innerHTML.indexOf('htv-block') !== -1, 'UI: сводка htv-block');
ok(s3._els['active-tournament-section'].classList.contains('hidden') === false, 'UI: секция видна со счетами');

// ── UI: только legacy status=active ──
var s4 = makeSandbox({
    tournaments: { tn_old: { name: 'Классика', status: 'active', startedAt: NOW } },
    rounds: {}
});
s4.loadLiveRounds();
ok(s4._els['active-tournament-section'].classList.contains('hidden') === false,
    'UI: legacy status=active без lifecycleStatus тоже виден');
ok(s4._els['live-tournament-rounds'].innerHTML.indexOf('Классика') !== -1, 'UI: имя legacy-турнира');

// ── Видимость как в каталоге: publicAccess=false перекрывает active ──
var hidden = makeSandbox({
    tournaments: {
        secret: { name: 'Закрытый кубок', status: 'active', publicAccess: false },
        open: { name: 'Открытый кубок', status: 'active' }
    },
    rounds: {
        hiddenRound: { status: 'active', tournamentId: 'secret', tournamentName: 'Закрытый кубок', players: {} },
        visibleRound: { status: 'active', tournamentId: 'open', tournamentName: 'Открытый кубок', players: {} }
    }
});
hidden.loadLiveRounds();
ok(hidden.homeActiveTnList().length === 1 && hidden.homeActiveTnList()[0][0] === 'open', 'скрытый active отсутствует в списке главной');
ok(hidden._els['live-tournament-rounds'].innerHTML.indexOf('Закрытый кубок') === -1, 'скрытый раунд не выводится');
ok(hidden._els['live-tournament-rounds'].innerHTML.indexOf('Открытый кубок') !== -1, 'публичный раунд выводится');
ok(hidden.homeRoundIsPublic({ protocolId: 'secret' }) === false, 'связь через protocolId скрывается');
ok(hidden.homeRoundIsPublic({ protocolId: 'other-protocol', tournamentName: 'Закрытый кубок' }) === false, 'legacy протокол связывается по названию');
ok(hidden.homeRoundIsPublic({ tournamentName: 'Закрытый кубок' }) === false, 'старый раунд с названием скрывается');
ok(hidden.homeRoundIsPublic({ status: 'active' }) === true, 'обычная игра не скрывается');
hidden.buildRecentRowHTML = function(id) { return id; };
hidden.homeLastRecentData = {
    oldSecret: { status: 'completed', tournamentId: 'secret' },
    oldOpen: { status: 'completed', tournamentId: 'open' }
};
hidden.renderHomeRecentResults(hidden.homeLastRecentData);
ok(hidden._els['recent-results'].innerHTML.indexOf('oldSecret') === -1 &&
   hidden._els['recent-results'].innerHTML.indexOf('oldOpen') !== -1, 'история скрытого турнира не выводится');
hidden.homeActiveTournaments.open.publicAccess = false;
hidden.renderHomeLiveRounds(hidden.homeLastRoundsData);
ok(hidden._els['active-tournament-section'].classList.contains('hidden'), 'секция исчезает после скрытия турнира');
ok(hidden._els['live-tournament-rounds'].innerHTML.indexOf('Открытый кубок') === -1, 'раунд исчезает после скрытия турнира');
hidden.homeActiveTournaments.open.publicAccess = true;
hidden.renderHomeLiveRounds(hidden.homeLastRoundsData);
ok(!hidden._els['active-tournament-section'].classList.contains('hidden'), 'после публикации секция возвращается');

console.log('');
console.log(failures ? ('ПРОВАЛЕНО: ' + failures + ' из ' + checks) : ('ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (' + checks + ')'));
process.exit(failures ? 1 : 0);
