// E2E-тест сценария из багрепорта: ГОСТЬ создаёт групповой раунд.
// Поднимает настоящий setup-round.html?mode=group в jsdom, заполняет
// форму двумя РАЗНЫМИ игроками (однофамильцы / тёзки / разные отчества)
// и вызывает «Начать раунд». Раунд обязан создаться, игроки — получить
// РАЗНЫЕ id, ошибки «дублирующий игрок» быть не должно. Полные тёзки
// по-прежнему блокируются (настоящий дубль).
//
// Запуск: node tools/test-guest-group-e2e.js   (нужен jsdom: npm i jsdom)
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

let JSDOM, VirtualConsole, requestInterceptor;
try { ({ JSDOM, VirtualConsole, requestInterceptor } = require('jsdom')); }
catch (e) { console.log('SKIP: jsdom не установлен (npm i jsdom) — E2E-тест пропущен'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
let failures = 0;
function check(cond, label) {
    if (!cond) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}

function startServer() {
    return new Promise(resolve => {
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split('?')[0]);
            const fp = path.join(ROOT, u === '/' ? 'index.html' : u);
            fs.readFile(fp, (err, data) => {
                if (err) { res.statusCode = 404; res.end('nf'); return; }
                res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
                res.end(data);
            });
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

// Фейковая БД живёт ВНУТРИ страницы (доступна до firebase-config.js)
const STUB = `<script>
(function(){
  var state = { users: {}, rounds: {} };
  // Уже есть турнирный игрок Иванов Пётр — раньше к нему «прилипали» однофамильцы
  state.users['user_tn_ivanov'] = { name: 'Иванов Пётр', firstName: 'Пётр', lastName: 'Иванов', middleName: 'Сергеевич', handicap: 12.4, isGuest: false, roundsPlayed: 5 };
  window.__state = state;
  window.__dbLog = [];
  function getAt(p) {
    if (!p) return state;
    var cur = state;
    var segs = p.split('/');
    for (var i = 0; i < segs.length; i++) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[segs[i]];
    }
    return cur;
  }
  function setAt(p, v) {
    var segs = p.split('/');
    var last = segs.pop();
    var cur = state;
    for (var i = 0; i < segs.length; i++) {
      if (cur[segs[i]] == null || typeof cur[segs[i]] !== 'object') cur[segs[i]] = {};
      cur = cur[segs[i]];
    }
    cur[last] = v;
  }
  function makeRef(p) {
    var ref = {
      key: (p || '').split('/').pop(),
      on: function(ev, cb) { if (ev === 'value' && cb) { setTimeout(function(){ try { cb({ val: function(){ return null; }, exists: function(){ return false; } }); } catch(e){} }, 0); } return cb; },
      off: function(){},
      once: function(){ return Promise.resolve({ exists: function(){ return getAt(p) != null; }, val: function(){ var v = getAt(p); return v === undefined ? null : v; } }); },
      set: function(v){ window.__dbLog.push({ path: p, op: 'set' }); setAt(p, v); return Promise.resolve(); },
      update: function(v){ window.__dbLog.push({ path: p, op: 'update' }); setAt(p, Object.assign({}, getAt(p) || {}, v)); return Promise.resolve(); },
      remove: function(){ return Promise.resolve(); },
      push: function(v){
        var key = 'R' + Math.random().toString(36).slice(2, 9);
        window.__dbLog.push({ path: p, op: 'push', key: key });
        var full = p ? p + '/' + key : key;
        if (v !== undefined) setAt(full, v);
        return { key: key, set: function(val){ window.__dbLog.push({ path: full, op: 'set' }); setAt(full, val); return Promise.resolve(); }, update: function(){ return Promise.resolve(); } };
      },
      child: function(sub){ return makeRef(p ? p + '/' + sub : sub); },
      orderByChild: function(){ return ref; }, equalTo: function(){ return ref; }, limitToLast: function(){ return ref; },
      transaction: function(fn){ return Promise.resolve({ committed: true, snapshot: { val: function(){ return fn(null); } } }); }
    };
    return ref;
  }
  window.firebase = {
    initializeApp: function(){ return {}; },
    database: function(){ return { ref: makeRef, goOnline: function(){}, goOffline: function(){} }; },
    auth: function(){ return {
      onAuthStateChanged: function(cb){ setTimeout(function(){ try { cb(null); } catch(e){} }, 0); return function(){}; },
      signInAnonymously: function(){ return Promise.resolve({ user: { uid: 'anon' } }); },
      signOut: function(){ return Promise.resolve(); },
      currentUser: null
    }; }
  };
  if (typeof window.fetch !== 'function') {
    window.fetch = function(){ return Promise.resolve({ ok: false, status: 404, json: function(){ return Promise.reject(new Error('stub')); }, text: function(){ return Promise.resolve(''); } }); };
  }
})();
</script>`;

async function runScenario(expectSuccess, label, players) {
    let html = fs.readFileSync(path.join(ROOT, 'setup-round.html'), 'utf8');
    html = html.replace(/<script src="https?:[^"]*"><\/script>/g, '');
    html = html.replace(/<head([^>]*)>/i, '<head$1>' + STUB);
    const vc = new VirtualConsole();
    const bootErrors = [];
    vc.on('jsdomError', e => {
        const msg = String(e && e.message || e);
        if (/Could not load|Not implemented/i.test(msg)) return;
        bootErrors.push(msg);
    });
    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        resources: { interceptors: [requestInterceptor(req => {
            if (String(req.url).startsWith(BASE)) return;
            return new Response('', { status: 200, headers: { 'Content-Type': 'text/plain' } });
        })] },
        url: BASE + '/setup-round.html?mode=group',
        pretendToBeVisual: true,
        virtualConsole: vc
    });
    const win = dom.window;
    const doc = win.document;
    await new Promise(r => setTimeout(r, 1500)); // скрипты + buildPlayerSlots
    check(typeof win.startGroup === 'function', label + ': live.js загружен (startGroup доступна)');

    const toasts = [];
    win.toast = (msg, kind) => { toasts.push({ msg: String(msg), kind }); return { close(){} }; };

    players.forEach((pl, i) => {
        const n = i + 1;
        const set = (id, v) => { const el = doc.getElementById(id); if (el) el.value = v; };
        set('pl-name-' + n, pl.name);
        set('pl-mid-' + n, pl.mid || '');
        set('pl-hcp-' + n, pl.hcp || '');
        set('pl-gender-' + n, pl.gender || 'men');
        set('pl-tee-' + n, pl.tee || 'bl');
    });
    const timeEl = doc.getElementById('grp-time');
    if (timeEl) timeEl.value = '12:00';

    win.__dbLog.length = 0;
    win.startGroup();
    await new Promise(r => setTimeout(r, 500)); // резолверы + push

    const roundIds = Object.keys(win.__state.rounds || {});
    const dupToasts = toasts.filter(x => /дублир|duplicate/i.test(x.msg));
    const round = roundIds.length ? win.__state.rounds[roundIds[roundIds.length - 1]] : null;

    if (expectSuccess) {
        check(roundIds.length === 1, label + ': раунд создан');
        check(dupToasts.length === 0, label + ': нет ошибки «дублирующий игрок»');
        if (round) {
            const pids = Object.keys(round.players || {});
            check(pids.length === players.length, label + ': в раунде ' + players.length + ' игрока (получилось ' + pids.length + ')');
            check(new Set(pids).size === pids.length, label + ': id игроков уникальны');
            const names = pids.map(k => round.players[k].name).sort();
            const expectedNames = players.map(p => {
                if (!p.mid) return p.name;
                const parts = p.name.split(' ');
                return parts.length >= 2
                    ? (parts[0] + ' ' + p.mid + ' ' + parts.slice(1).join(' '))
                    : (p.name + ' ' + p.mid);
            }).sort();
            check(JSON.stringify(names) === JSON.stringify(expectedNames), label + ': имена сохранены (с отчеством)');
            check(round.mode === 'group' && round.accessKey, label + ': данные раунда корректны');
        }
    } else {
        check(roundIds.length === 0, label + ': раунд НЕ создан (дубль заблокирован)');
        check(dupToasts.length === 1, label + ': показана ошибка «дублирующий игрок»');
    }
    check(bootErrors.length === 0, label + ': страница без ошибок загрузки' + (bootErrors.length ? ' → ' + bootErrors[0] : ''));
    try { win.close(); } catch (e) {}
}

let BASE = null;
(async function () {
    const server = await startServer();
    BASE = 'http://127.0.0.1:' + server.address().port;

    await runScenario(true, 'однофамильцы', [
        { name: 'Иванов Алексей', hcp: '18.0' },
        { name: 'Иванов Сергей', hcp: '24.0' }
    ]);
    await runScenario(true, 'тёзки', [
        { name: 'Александр Морозов', hcp: '5.0' },
        { name: 'Александр Козлов', hcp: '7.0' }
    ]);
    await runScenario(true, 'разные отчества', [
        { name: 'Смирнов Дмитрий', mid: 'Иванович', hcp: '9.0' },
        { name: 'Смирнов Дмитрий', mid: 'Петрович', hcp: '15.0' }
    ]);
    await runScenario(false, 'полные тёзки (настоящий дубль)', [
        { name: 'Кузнецов Андрей', hcp: '10.0' },
        { name: 'кузнецов андрей', hcp: '11.0' }
    ]);

    server.close();
    console.log(failures ? '\n' + failures + ' FAILURES' : '\nAll guest-group E2E tests passed ✔');
    process.exit(failures ? 1 : 0);
})();
