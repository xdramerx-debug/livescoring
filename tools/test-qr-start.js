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
// Группа из нескольких человек → QR открывает карточку группового формата
check(html.indexOf('setup-round.html?round=r1&amp;as=u1') !== -1 || html.indexOf('setup-round.html?round=r1&as=u1') !== -1, 'QR группы → групповая карточка (setup-round?as)');
// Группа из одного → одиночная карточка scorer.html
check(html.indexOf('scorer.html?round=r2&amp;player=u9') !== -1 || html.indexOf('scorer.html?round=r2&player=u9') !== -1, 'QR одиночки → scorer.html');
// Один QR на игрока: ни QR, ни ссылок на marker.html не должно быть
check(html.indexOf('marker.html') === -1, 'нет QR/ссылок на marker.html');
check(html.indexOf('Вы маркируете') === -1, 'удалён блок «Вы маркируете…»');
check(html.indexOf('Группа 2') !== -1, 'группа 2 на карточке');
check(html.indexOf('ГРУППА №') === -1, 'старая капслок-подпись «ГРУППА №» больше не используется');
// Состав флайта виден целиком: карточка в печати не режется (CSS), а имена
// партнёров выводятся списком в блоке members-note.
const mn = (html.match(/<div class="members-note">([\s\S]*?)<\/div>/) || [])[1] || '';
check(mn.indexOf('Состав флайта') !== -1 && mn.indexOf('Тестова Мария Ивановна') !== -1 && mn.indexOf('Смирнов Пётр') !== -1, 'состав флайта: все партнёры в карточке');
check(html.indexOf('Смирнов Пётр') !== -1, 'имя гостя на карточке');
// 4 игрока → ровно 4 QR-картинки (по одной на игрока)
check((html.match(/qrserver\.com/g) || []).length === 4, 'по одному QR на игрока (4 шт.)');
check(html.indexOf('Маркирует:') !== -1 && html.indexOf('Тестова Мария Ивановна') !== -1, 'компактный чип «Маркирует: …» на карточке u1');
check(html.indexOf('10:00') !== -1 || html.indexOf('09:00') !== -1, 'время старта');
check(html.indexOf('Полевой HCP: <b>13.0</b>') !== -1, 'полевой hcp');
// Надёжная загрузка QR: eager + цепочка провайдеров через onerror
check(html.indexOf('loading="eager"') !== -1, 'QR грузятся сразу (eager, не lazy)');
check(html.indexOf('onerror="qrImgFail(this)"') !== -1, 'QR: повтор через запасной провайдер');
check(html.indexOf('data-qr=') !== -1, 'QR: данные для повтора в data-qr');
const provs = sandbox.qrProviders('https://club.example/x', 420);
check(provs.length === 3 && provs[0].indexOf('qrserver.com') !== -1 && provs[1].indexOf('quickchart.io') !== -1, 'цепочка QR-провайдеров: qrserver → quickchart → повтор');

// Зачётная группа игрока на карточке и в таблице
sandbox.qrRender(doc, [{ id: 'd1', name: 'Девушки', gender: 'women', hcpFrom: '', hcpTo: 36 }]);
const html2 = els['qr-content'].innerHTML || '';
check(html2.indexOf('div-badge') !== -1 && html2.indexOf('Девушки') !== -1, 'бейдж зачётной группы на карточке');
check(html2.indexOf('div-inline') !== -1, 'зачётная группа в строке стартового листа');

// v1.55.0: информация НЕ дублируется — бейдж группы: ИМЯ ИЛИ диапазон HCP,
// но не «название · 0–12» (диапазон уже внутри названия).
sandbox.qrRender(doc, [{ id: 'd1', name: 'Девушки 0–36', gender: 'women', hcpFrom: 0, hcpTo: 36 }]);
const htmlDup = els['qr-content'].innerHTML || '';
check(htmlDup.indexOf('🏆 Девушки 0–36') !== -1, 'бейдж группы: только название');
check(htmlDup.indexOf('🏆 Девушки 0–36 · 0.0–36.0') === -1, 'бейдж группы: без дубля диапазона из названия');
check(htmlDup.indexOf('· Девушки 0–36') !== -1, 'строка листа: группа с названием');
check(htmlDup.indexOf('Девушки 0–36 (0.0–36.0)') === -1, 'строка листа: без дубля диапазона');
// Группа без названия — показываем диапазон (есть что показать).
sandbox.qrRender(doc, [{ id: 'd2', name: '', gender: 'women', hcpFrom: 0, hcpTo: 36 }]);
const htmlNoName = els['qr-content'].innerHTML || '';
check(htmlNoName.indexOf('HCP 0.0–36.0') !== -1, 'группа без названия: бейдж с диапазоном HCP');

// v1.55.0: 3 варианта раскладки QR-карточек.
check(typeof sandbox.qrSetLayout === 'function' && typeof sandbox.qrGetLayout === 'function', 'layout: helper-ы раскладки определены');
// pair: карточка поделена на две части вертикально (2 игрока на карточку).
sandbox.qrRender(doc, [{ id: 'd1', name: 'Девушки', gender: 'women', hcpFrom: '', hcpTo: 36 }]);
sandbox.qrSetLayout('pair');
const htmlPair = els['qr-content'].innerHTML || '';
check(htmlPair.indexOf('pcard-pair') !== -1, 'pair: карточки пары');
check(htmlPair.indexOf('pcol-divider') !== -1, 'pair: вертикальный разделитель');
check(htmlPair.indexOf('pcards-pair') !== -1, 'pair: класс сетки pair');
// g1 из 3 игроков → 2 карточки (пара + одиночка), g2 из 1 → 1 карточка.
check((htmlPair.match(/class="pcard pcard-pair"/g) || []).length === 3, 'pair: 3 карточки на 4 игроков (2+1)');
check((htmlPair.match(/qrserver\.com/g) || []).length === 4, 'pair: по одному QR на игрока (4 шт.)');
// quad: 4 игрока на карточку (сетка 2×2).
sandbox.qrSetLayout('quad');
const htmlQuad = els['qr-content'].innerHTML || '';
check(htmlQuad.indexOf('pcard-quad') !== -1 && htmlQuad.indexOf('pgrid4') !== -1, 'quad: карточки 2×2');
check((htmlQuad.match(/class="pcard pcard-quad"/g) || []).length === 2, 'quad: 2 карточки на 4 игроков');
check((htmlQuad.match(/qrserver\.com/g) || []).length === 4, 'quad: по одному QR на игрока (4 шт.)');
// Парная карточка держит ВСЁ (ФИО обоих, QR, состав флайта).
check(htmlPair.indexOf('Тестов Иван Петрович') !== -1 && htmlPair.indexOf('Тестова Мария Ивановна') !== -1, 'pair: ФИО обоих игроков на карточках');
check(htmlPair.indexOf('Состав флайта') !== -1, 'pair: состав флайта на карточке');
// Возврат к одиночной раскладке.
sandbox.qrSetLayout('single');
const htmlSingle = els['qr-content'].innerHTML || '';
check(htmlSingle.indexOf('pcard-single') !== -1 && (htmlSingle.match(/class="pcard pcard-single"/g) || []).length === 4, 'single: по карточке на игрока');

check(typeof sandbox.qrSortGroups === 'function' && typeof sandbox.qrGroupLabel === 'function', 'qr: sort/label helpers');
const shotgunDoc = {
    scheme: 'all18', name: 'Шотган',
    groups: {
        g1: { groupNo: 1, roundId: 'r18', startHole: 18, startTime: 1000, players: [{ id: 'a', lastName: 'Ааа', firstName: 'А', middleName: '', gender: 'men', tee: 'wh', exactHcp: 10, fieldHcp: 10 }], markers: [] },
        g2: { groupNo: 2, roundId: 'r1b', startHole: 1, startTime: 2000, players: [{ id: 'b', lastName: 'Ббб', firstName: 'Б', middleName: '', gender: 'men', tee: 'wh', exactHcp: 10, fieldHcp: 10 }], markers: [] },
        g3: { groupNo: 3, roundId: 'r1a', startHole: 1, startTime: 1000, players: [{ id: 'c', lastName: 'Ввв', firstName: 'В', middleName: '', gender: 'men', tee: 'wh', exactHcp: 10, fieldHcp: 10 }], markers: [] }
    }
};
sandbox.qrRender(shotgunDoc);
const htmlS = els['qr-content'].innerHTML || '';
const i1a = htmlS.indexOf('Группа 1А');
const i1b = htmlS.indexOf('Группа 1Б');
const i18 = htmlS.indexOf('Группа 18');
check(i1a !== -1 && i1b !== -1 && i18 !== -1, 'shotgun labels: 1А / 1Б / 18');
check(i1a < i1b && i1b < i18, 'shotgun order: 1А, 1Б, 18 (не 18А первой)');
// Одиночная группа на лунке — без буквы: «Группа 18», а не «Группа 18А».
check(htmlS.indexOf('Группа 18А') === -1, 'shotgun: одна группа на лунке — без буквы');
check(htmlS.indexOf('ГРУППА №1') === -1, 'shotgun: нет порядкового ГРУППА №1');
const tenDoc = {
    scheme: '1-10', name: '1-10',
    groups: {
        g1: { groupNo: 1, roundId: 't10a', startHole: 10, startTime: 1000, players: [{ id: 'p1', lastName: 'П', firstName: '1', middleName: '', gender: 'men', tee: 'wh', exactHcp: 1, fieldHcp: 1 }], markers: [] },
        g2: { groupNo: 2, roundId: 't1a', startHole: 1, startTime: 1000, players: [{ id: 'p2', lastName: 'П', firstName: '2', middleName: '', gender: 'men', tee: 'wh', exactHcp: 1, fieldHcp: 1 }], markers: [] },
        g3: { groupNo: 3, roundId: 't10b', startHole: 10, startTime: 2000, players: [{ id: 'p3', lastName: 'П', firstName: '3', middleName: '', gender: 'men', tee: 'wh', exactHcp: 1, fieldHcp: 1 }], markers: [] },
        g4: { groupNo: 4, roundId: 't1b', startHole: 1, startTime: 2000, players: [{ id: 'p4', lastName: 'П', firstName: '4', middleName: '', gender: 'men', tee: 'wh', exactHcp: 1, fieldHcp: 1 }], markers: [] }
    }
};
sandbox.qrRender(tenDoc);
const htmlT = els['qr-content'].innerHTML || '';
check(htmlT.indexOf('Группа 1А') !== -1 && htmlT.indexOf('Группа 1Б') !== -1 && htmlT.indexOf('Группа 10А') !== -1 && htmlT.indexOf('Группа 10Б') !== -1, '1-10 labels: 1А,1Б,10А,10Б');
check(htmlT.indexOf('Группа 1А') < htmlT.indexOf('Группа 1Б') && htmlT.indexOf('Группа 1Б') < htmlT.indexOf('Группа 10А'), '1-10 order: 1А, 1Б, 10А…');

// Новый парный шотган (1-10-shot): пары стартуют одновременно, порядок — лунка, волна.
const shotPairDoc = {
    scheme: '1-10-shot', name: 'Шотган 1 и 10',
    groups: {
        g1: { groupNo: 1, roundId: 's1', startHole: 1, startTime: 1000, players: [{ id: 'q1', lastName: 'К', firstName: '1', middleName: '', gender: 'men', tee: 'wh', exactHcp: 5, fieldHcp: 5 }], markers: [] },
        g2: { groupNo: 2, roundId: 's2', startHole: 10, startTime: 1000, players: [{ id: 'q2', lastName: 'К', firstName: '2', middleName: '', gender: 'men', tee: 'wh', exactHcp: 5, fieldHcp: 5 }], markers: [] },
        g3: { groupNo: 3, roundId: 's3', startHole: 1, startTime: 2000, players: [{ id: 'q3', lastName: 'К', firstName: '3', middleName: '', gender: 'men', tee: 'wh', exactHcp: 5, fieldHcp: 5 }], markers: [] }
    }
};
sandbox.qrRender(shotPairDoc);
const htmlP = els['qr-content'].innerHTML || '';
check(htmlP.indexOf('Группа 1А') !== -1 && htmlP.indexOf('Группа 1Б') !== -1, '1-10-shot: буквы на лунке 1 (две группы)');
check(htmlP.indexOf('Группа 10') !== -1 && htmlP.indexOf('Группа 10А') === -1, '1-10-shot: одна группа с 10-й — без буквы');
check(htmlP.indexOf('Группа 1А') < htmlP.indexOf('Группа 1Б') && htmlP.indexOf('Группа 1Б') < htmlP.indexOf('Группа 10'), '1-10-shot: порядок 1А, 1Б, 10');

// Старт только с 10-й лунки: обычные порядковые номера групп, без букв.
const onlyTenDoc = {
    scheme: '10', name: 'Старт с 10-й',
    groups: {
        g1: { groupNo: 1, roundId: 'o1', startHole: 10, startTime: 1000, players: [{ id: 'z1', lastName: 'О', firstName: '1', middleName: '', gender: 'men', tee: 'wh', exactHcp: 5, fieldHcp: 5 }], markers: [] },
        g2: { groupNo: 2, roundId: 'o2', startHole: 10, startTime: 2000, players: [{ id: 'z2', lastName: 'О', firstName: '2', middleName: '', gender: 'men', tee: 'wh', exactHcp: 5, fieldHcp: 5 }], markers: [] }
    }
};
sandbox.qrRender(onlyTenDoc);
const htmlO = els['qr-content'].innerHTML || '';
check(htmlO.indexOf('Группа 1') !== -1 && htmlO.indexOf('Группа 2') !== -1, 'scheme 10: «Группа 1», «Группа 2»');
check(htmlO.indexOf('10А') === -1, 'scheme 10: без буквенных волн');
check(htmlO.indexOf('Лунка 10') !== -1, 'scheme 10: в шапке флайта указана лунка 10');

console.log(failures ? '\n' + failures + ' FAILURES' : '\nqr-start render tests passed ✔');
process.exit(failures ? 1 : 0);
