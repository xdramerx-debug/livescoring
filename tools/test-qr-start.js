// Тест рендера qr-start.js без браузера (минимальный DOM-стаб)
'use strict';
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync(__dirname + '/../js/qr-start.js', 'utf8');

function fakeEl(id) {
    return {
        _id: id,
        _html: '',
        classList: {
            _set: {},
            add: function(c) { this._set[c] = true; },
            remove: function(c) { delete this._set[c]; }
        },
        set innerHTML(v) { this._html = v; },
        get innerHTML() { return this._html; }
    };
}
const els = {};
function fakeDocGet(id) { if (!els[id]) els[id] = fakeEl(id); return els[id]; }

const windowStub = {
    location: { origin: 'https://club.example', pathname: '/livescoring/qr-start.html' },
    print: () => {}
};
const sandbox = {
    console,
    document: {
        getElementById: fakeDocGet,
        body: { classList: { add() {}, remove() {} } },
        addEventListener: () => {},
        querySelectorAll: () => []
    },
    window: windowStub,
    URLSearchParams: function(q) { const m = {}; String(q || '').replace(/^\?/, '').split('&').forEach(p => { const [k, v] = p.split('='); if (k) m[k] = decodeURIComponent(v || ''); }); this.get = k => (k in m ? m[k] : null); }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

let failures = 0;
function check(cond, label) { if (!cond) { failures++; console.error('FAIL', label); } else console.log('ok  -', label); }

// --- данные протокола как после psSaveProtocol ---
const doc = {
    name: 'Кубок Пестово · старт', tournamentName: 'Кубок Пестово', date: '2026-09-12', format: 'Stroke Play',
    groups: {
        g1: {
            groupNo: 1, roundId: 'r1',
            startHole: 1, startTime: new Date('2026-09-12T09:00:00').getTime(),
            format: 'Stroke Play',
            players: [
                { id: 'u1', lastName: 'Тестов', firstName: 'Иван', middleName: 'Петрович', gender: 'men', tee: 'wh', exactHcp: 12, fieldHcp: 13 },
                { id: 'u2', lastName: 'Тестова', firstName: 'Мария', middleName: 'Ивановна', gender: 'women', tee: 'rd', exactHcp: 20, fieldHcp: 22 },
                { id: 'gst_x', lastName: 'Смирнов', firstName: 'Пётр', middleName: '', gender: 'men', tee: 'bl', exactHcp: 4.2, fieldHcp: 5 }
            ],
            markers: [
                { markerId: 'u1', markerName: 'Иван Петрович Тестов', targetId: 'u2', targetName: 'Мария Ивановна Тестова' },
                { markerId: 'u2', markerName: 'Мария Ивановна Тестова', targetId: 'gst_x', targetName: 'Пётр Смирнов' },
                { markerId: 'gst_x', markerName: 'Пётр Смирнов', targetId: 'u1', targetName: 'Иван Петрович Тестов' }
            ]
        },
        g2: {
            groupNo: 2, roundId: 'r2',
            startHole: 10, startTime: new Date('2026-09-12T09:10:00').getTime(),
            format: 'Stroke Play',
            players: [
                { id: 'u9', lastName: 'Соло', firstName: 'Один', middleName: '', gender: 'men', tee: 'wh', exactHcp: 30, fieldHcp: 33 }
            ],
            markers: []
        }
    }
};

sandbox.qrRender(doc);
const content = els['qr-content'];
check(!!content, 'qr-content создан');
const html = content.innerHTML || '';
check(html.indexOf('Тестов Иван Петрович') !== -1, 'ФИО на карточке');
check(html.indexOf('scorer.html?round=r1&amp;player=u1') !== -1 || html.indexOf('scorer.html?round=r1&player=u1') !== -1, 'ссылка игрока на scorer');
check(html.indexOf('marker.html?round=r1&amp;player=u2') !== -1 || html.indexOf('marker.html?round=r1&player=u2') !== -1, 'ссылка маркера (u1→u2)');
check(html.indexOf('ГРУППА №2') !== -1, 'группа 2 на карточке');
check(html.indexOf('Смирнов Пётр') !== -1, 'имя гостя на карточке');
check((html.match(/qrserver\.com/g) || []).length >= 7, 'QR изображения для всех карточек');
check(html.indexOf('Тестова Мария Ивановна') !== -1, 'маркер-инфо на карточке u1');
check(html.indexOf('Группа из одного') !== -1, 'solo без маркера');
check(html.indexOf('10:00') !== -1 || html.indexOf('09:00') !== -1, 'время старта');
check(html.indexOf('13</b>') !== -1 || html.indexOf('Полевой HCP: <b>13') !== -1, 'полевой hcp');

console.log(failures ? '\n' + failures + ' FAILURES' : '\nqr-start render tests passed ✔');
process.exit(failures ? 1 : 0);
