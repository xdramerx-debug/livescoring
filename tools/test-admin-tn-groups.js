// Автотесты вкладки «Турниры» (admin.js), v1.55.0:
//  — блок «Обрезка гандикапа» в карточке турнира стоит ВЫШЕ умного
//    распределения и записывает tournaments/<id>/hcpCut (как стартовый лист);
//  — «✨ Умные группы» режут по ОБРЕЗАННЫМ гандикапам;
//  — повторный запуск умного распределителя заменяет только auto-группы;
//  — инлайн-редактирование группы (название/пол/HCP от-до/ТИ);
//  — бейджи групп: название ИЛИ диапазон HCP, без дубля.
// Запуск: node tools/test-admin-tn-groups.js
'use strict';
const fs = require('fs');
const vm = require('vm');

function fakeEl(props) {
    props = props || {};
    return Object.assign({
        style: {}, value: '', textContent: '', innerHTML: '', checked: false, className: '',
        classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
        getAttribute: () => null, setAttribute(){}, removeAttribute(){},
        addEventListener(){}, removeEventListener(){}, focus(){}, blur(){}, click(){},
        querySelector: () => null, querySelectorAll: () => []
    }, props);
}

// ── Фейковая БД: снимки dbState[path] + перехват set/push/update ──
let dbState = {};
let dbWrites = [];
function makeDb() {
    function ref(path) {
        const p = path || '';
        const r = {
            once: function() {
                return Promise.resolve({ val: function() { return dbState[p]; } });
            },
            set: function(v) { dbWrites.push({ path: p, type: 'set', value: v }); dbState[p] = v; return Promise.resolve(); },
            update: function(v) { dbWrites.push({ path: p, type: 'update', value: v }); return Promise.resolve(); },
            remove: function() { dbWrites.push({ path: p, type: 'remove' }); return Promise.resolve(); },
            push: function(v) {
                const key = 'auto_' + Math.random().toString(36).slice(2, 8);
                dbWrites.push({ path: p, type: 'push', key: key, value: v });
                const parent = dbState[p];
                dbState[p] = parent && typeof parent === 'object' ? Object.assign({}, parent) : {};
                dbState[p][key] = v;
                return Promise.resolve({ key: key });
            }
        };
        // divisions/<id>.remove()
        r.child = function(sub) { return ref(p + '/' + sub); };
        return r;
    }
    return { ref: ref };
}

function makeSandbox() {
    const elements = {};
    const sandbox = {
        console, Date, Math, JSON, parseInt, parseFloat, isFinite, isNaN, String, Number,
        Array, Object, Promise, setTimeout, clearTimeout, URLSearchParams: function(q) {
            const m = {};
            String(q || '').replace(/^\?/, '').split('&').forEach(function(p) {
                const kv = p.split('=');
                if (kv[0]) m[kv[0]] = decodeURIComponent(kv[1] || '');
            });
            this.get = function(k) { return (k in m) ? m[k] : null; };
        },
        localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
        navigator: { language: 'ru' },
        location: { search: '', origin: 'https://club.example', pathname: '/admin.html', href: 'https://club.example/admin.html' },
        document: {
            getElementById: function(id) { return elements[id] || null; },
            createElement: () => fakeEl(),
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: () => {},
            documentElement: { style: {}, setAttribute(){} },
            body: { style: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } } }
        }
    };
    sandbox.window = sandbox;
    sandbox._elements = elements;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(__dirname + '/../js/utils.js', 'utf8'), sandbox);
    vm.runInContext(fs.readFileSync(__dirname + '/../js/admin.js', 'utf8'), sandbox);
    sandbox.currentLang = 'ru';
    sandbox.db = makeDb();
    sandbox.confirm = () => true;
    sandbox.toast = () => {};
    sandbox.vib = () => {};
    return sandbox;
}

let failures = 0;
function check(cond, label) { if (!cond) { failures++; console.error('FAIL', label); } else console.log('ok  -', label); }
function eq(actual, expected, label) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error('FAIL', label, '\n  actual:  ', a, '\n  expected:', e); }
    else console.log('ok  -', label);
}

// ── 1. Блок обрезки: рендер + порядок в панели ──
const sb = makeSandbox();
const cutOn = sb.tnCutBoxHtml('t1', { hcpCut: { enabled: true, percent: 90, maxEnabled: true, maxMen: 28, maxWomen: null } });
check(cutOn.indexOf('tn-cut-enabled-t1') !== -1 && cutOn.indexOf('checked') !== -1, 'обрезка: чекбокс «процент» при включённой обрезке');
check(cutOn.indexOf('tn-cut-max-enabled-t1') !== -1, 'обрезка: чекбокс «максимум по полу»');
check(cutOn.indexOf('value="90"') !== -1, 'обрезка: процент подставлен из настроек');
check(cutOn.indexOf('value="28"') !== -1, 'обрезка: макс. муж подставлен');
check(cutOn.indexOf('Обрезка включена') !== -1, 'обрезка: подпись «включена»');
const cutOff = sb.tnCutBoxHtml('t1', {});
check(cutOff.indexOf('tn-cut-enabled-t1') !== -1, 'обрезка: блок есть и без настроек');
check(cutOff.indexOf('checked') === -1, 'обрезка: без настроек чекбоксы сняты');

const panelHtml = sb.tnDivisionsEditorHtml('t1', [], { hcpCut: null, registeredPlayers: {} });
const idxCut = panelHtml.indexOf('fa-scissors');
const idxSmart = panelHtml.indexOf('tnAutoDivisions');
check(idxCut !== -1 && idxSmart !== -1, 'панель: есть блок обрезки и умное распределение');
check(idxCut < idxSmart, 'панель: обрезка ВЫШЕ умного распределения');
const idxDivHeader = panelHtml.indexOf('Группы участников по гандикапу');
check(idxCut < idxDivHeader, 'панель: обрезка ВЫШЕ списка групп');

// ── 2. Бейджи: название ИЛИ диапазон, без дубля ──
const divs = [
    { id: 'd1', name: 'Мужчины 0–12', gender: 'men', hcpFrom: 0, hcpTo: 12, tee: 'bl' },
    { id: 'd2', name: '', gender: 'women', hcpFrom: 0, hcpTo: 36, tee: 'rd' }
];
const panelDivs = sb.tnDivisionsEditorHtml('t1', divs, {});
check(panelDivs.indexOf('Мужчины 0–12') !== -1, 'строка группы: название');
// у группы с названием — в мета только ТИ (без дубля «Мужчины · HCP 0–12»)
const row1Html = (panelDivs.match(/<div class="tn-div-row">[\s\S]*?Мужчины 0–12[\s\S]*?<\/div>/) || [''])[0];
check(row1Html.indexOf('HCP 0–12') === -1, 'строка группы: с названием — без дубля диапазона HCP');
check(row1Html.indexOf('Синий') !== -1, 'строка группы: с названием — показан ТИ');
check(panelDivs.indexOf('fa-pen') !== -1, 'строка группы: кнопка редактирования');
// без названия — показываем HCP диапазон (есть что показать)
const row2Html = (panelDivs.match(/<div class="tn-div-row">[\s\S]*?<span class="tn-div-name">—<\/span>[\s\S]*?<\/div>/) || [''])[0];
check(row2Html.indexOf('HCP 0.0–36.0') !== -1, 'строка группы: без названия — диапазон HCP в мета');

// ── 3. Умные группы С УЧЁТОМ обрезки ──
dbState = {
    'tournaments/t1': {
        hcpCut: { enabled: false, percent: 100, maxEnabled: true, maxMen: 28, maxWomen: 20 },
        registeredPlayers: {
            // 6 мужчин: 2 сильных (обрезаются максимумом 28), 4 слабых (тоже ≤28)
            u1: { name: 'Александров Александр', handicap: 10, gender: 'men' },
            u2: { name: 'Борисов Борис', handicap: 18, gender: 'men' },
            u3: { name: 'Васильев Василий', handicap: 30, gender: 'men' },   // → 28 (макс)
            u4: { name: 'Григорьев Григорий', handicap: 36, gender: 'men' }, // → 28 (макс)
            u5: { name: 'Дмитриев Дмитрий', handicap: 40, gender: 'men' },   // → 28 (макс)
            u6: { name: 'Егоров Егор', handicap: 50, gender: 'men' },        // → 28 (макс)
            w1: { name: 'Иванова Ирина', handicap: 35, gender: 'women' },    // → 20 (макс)
            w2: { name: 'Козлова Ксения', handicap: 45, gender: 'women' },   // → 20 (макс)
            w3: { name: 'Лебедева Лена', handicap: 25, gender: 'women' }     // → 20 (макс)
        }
    }
};
dbWrites = [];
sb.tnAutoDivisions('t1');
setTimeout(function() {
    const pushes = dbWrites.filter(function(w) { return w.type === 'push' && w.path === 'tournaments/t1/divisions'; });
    check(pushes.length > 0, 'умные группы: созданы группы');
    const menPlans = pushes.filter(function(w) { return w.value.gender === 'men'; });
    const womenPlans = pushes.filter(function(w) { return w.value.gender === 'women'; });
    eq(menPlans.length, 3, 'умные группы: 3 мужские группы');
    eq(womenPlans.length, 3, 'умные группы: 3 женские группы');
    // Мужчины после обрезки: 10, 18, 28, 28, 28, 28 → полосы 10–18 / 18.1–28 / 28–28.
    // Без обрезки (30, 36, 40, 50) верхняя полоса ушла бы в «36.1–50».
    const menBounds = menPlans.map(function(w) { return w.value.hcpFrom + '–' + w.value.hcpTo; }).sort();
    eq(menBounds, ['10–18', '18.1–28', '28–28'], 'умные группы: мужские границы по ОБРЕЗАННЫМ HCP (без обрезки было бы 30–50)');
    // Девушки: 20, 20, 20 → одна группа 20–20 (не 25–45 как без обрезки).
    const wBounds = womenPlans.map(function(w) { return w.value.hcpFrom + '–' + w.value.hcpTo; });
    check(wBounds.every(function(b) { return b.indexOf('20') !== -1; }), 'умные группы: женские границы по обрезанному HCP (20)');
    check(pushes.every(function(w) { return w.value.auto === true; }), 'умные группы: флаг auto на группах');

    // ── 4. Повторный запуск: auto-группы заменяются, ручные не трогаются ──
    dbState['tournaments/t1'].divisions = {
        a1: pushes[0].value, a2: pushes[1].value, a3: pushes[2].value,
        manual1: { id: 'manual1', name: 'Ручная группа', gender: 'men', hcpFrom: 0, hcpTo: 50, tee: 'bk', auto: false }
    };
    dbWrites = [];
    sb.tnAutoDivisions('t1');
    setTimeout(function() {
        const removes = dbWrites.filter(function(w) { return w.type === 'remove'; });
        eq(removes.length, 3, 'повтор: удалено только auto-групп (3)');
        check(removes.every(function(w) { return w.path.indexOf('manual1') === -1; }), 'повтор: ручная группа не тронута');
        const pushes2 = dbWrites.filter(function(w) { return w.type === 'push'; });
        eq(pushes2.length, 6, 'повтор: созданы новые умные группы (3+3)');

        // ── 5. «Применить обрезку» записывает hcpCut в формате стартового листа ──
        const elements = sb._elements;
        elements['tn-cut-enabled-t1'] = fakeEl({ checked: true });
        elements['tn-cut-max-enabled-t1'] = fakeEl({ checked: true });
        elements['tn-cut-percent-t1'] = fakeEl({ value: '90' });
        elements['tn-cut-maxmen-t1'] = fakeEl({ value: '28' });
        elements['tn-cut-maxwomen-t1'] = fakeEl({ value: '20' });
        dbWrites = [];
        sb.tnApplyCutBox('t1');
        setTimeout(function() {
            const setCut = dbWrites.filter(function(w) { return w.path === 'tournaments/t1/hcpCut' && w.type === 'set'; });
            eq(setCut.length, 1, 'применить обрезку: запись hcpCut');
            eq(setCut[0].value, { enabled: true, maxEnabled: true, percent: 90, maxMen: 28, maxWomen: 20 },
                'применить обрезку: формат как у стартового листа (psCutObject)');

            // ── 6. Инлайн-редактирование группы ──
            elements['tn-div-t1'] = fakeEl();
            sb.tnDivEditing = {};
            sb.tnTnVals = { t1: dbState['tournaments/t1'] };
            sb.tnEditDivision('t1', 'manual1');
            eq(sb.tnDivEditing.t1, 'manual1', 'редактирование: режим правки включён');
            const editHtml = elements['tn-div-t1'].innerHTML;
            check(editHtml.indexOf('tnde-name-t1-manual1') !== -1 && editHtml.indexOf('value="Ручная группа"') !== -1,
                'редактирование: форма с названием подставленным');
            check(editHtml.indexOf('tnde-tee-t1-manual1') !== -1, 'редактирование: поле ТИ');
            // Сохранение
            elements['tnde-name-t1-manual1'] = fakeEl({ value: 'Ручная группа 2' });
            elements['tnde-gender-t1-manual1'] = fakeEl({ value: 'men' });
            elements['tnde-from-t1-manual1'] = fakeEl({ value: '0,5' });
            elements['tnde-to-t1-manual1'] = fakeEl({ value: '40' });
            elements['tnde-tee-t1-manual1'] = fakeEl({ value: 'bl' });
            dbWrites = [];
            sb.tnSaveDivision('t1', 'manual1');
            setTimeout(function() {
                const upd = dbWrites.filter(function(w) { return w.path === 'tournaments/t1/divisions/manual1' && w.type === 'update'; });
                eq(upd.length, 1, 'сохранение группы: update по id');
                eq(upd[0].value, { name: 'Ручная группа 2', gender: 'men', hcpFrom: 0.5, hcpTo: 40, tee: 'bl', format: '' },
                    'сохранение группы: новые значения (включая запятую в HCP)');
                check(!sb.tnDivEditing.t1, 'сохранение группы: режим правки закрыт');

                // Отмена
                sb.tnEditDivision('t1', 'manual1');
                sb.tnCancelEditDiv('t1');
                check(!sb.tnDivEditing.t1, 'редактирование: отмена закрывает форму');

                // Валидация: от > до → ошибка, запись не идёт
                elements['tnde-name-t1-manual1'] = fakeEl({ value: 'x' });
                elements['tnde-from-t1-manual1'] = fakeEl({ value: '50' });
                elements['tnde-to-t1-manual1'] = fakeEl({ value: '10' });
                elements['tnde-gender-t1-manual1'] = fakeEl({ value: 'men' });
                elements['tnde-tee-t1-manual1'] = fakeEl({ value: '' });
                dbWrites = [];
                sb.tnSaveDivision('t1', 'manual1');
                setTimeout(function finish() {
                    check(dbWrites.length === 0, 'редактирование: некорректный диапазон HCP — без записи');

                    // ── 7. Синхронизация ТИ/формата групп обратно в список участников ──
                    dbState['tournaments/t2'] = {
                        divisions: {
                            d1: { id: 'd1', name: 'Мужчины 0–12', gender: 'men', hcpFrom: 0, hcpTo: 12, tee: 'bl', format: 'Stableford',
                                  members: { u1: 'иванов иван' } },
                            d2: { id: 'd2', name: 'Девушки', gender: 'women', hcpFrom: 0, hcpTo: 36, tee: 'rd', format: '' }
                        },
                        registeredPlayers: {
                            u1: { name: 'Иванов Иван', handicap: 5, gender: 'men', tee: 'wh' },
                            w1: { name: 'Петрова Анна', handicap: 20, gender: 'women', tee: 'wh' }
                        },
                        hcpCut: null
                    };
                    dbWrites = [];
                    sb.tnSyncDivisionsToRoster('t2');
                    setTimeout(function finishSync() {
                        const syncUpd = dbWrites.filter(function(w) { return w.path === '' && w.type === 'update'; })[0];
                        check(!!syncUpd, 'синхронизация: root update выполнен');
                        eq(syncUpd && syncUpd.value['tournaments/t2/registeredPlayers/u1/tee'], 'bl', 'синхронизация: ТИ мужчины → синие');
                        eq(syncUpd && syncUpd.value['tournaments/t2/registeredPlayers/u1/format'], 'Stableford', 'синхронизация: формат группы → в список');
                        eq(syncUpd && syncUpd.value['tournaments/t2/registeredPlayers/w1/tee'], 'rd', 'синхронизация: ТИ девушки → красные');
                        check(syncUpd && syncUpd.value['tournaments/t2/registeredPlayers/w1/format'] === undefined, 'синхронизация: без формата группы формат не пишется');
                        const fmtOpts = sb.tnFormatOptionsHtml({ formats: ['Stroke Play', 'Stableford'] }, 'Stableford');
                        check(fmtOpts.indexOf('Stableford') !== -1 && fmtOpts.indexOf('selected') !== -1, 'формат: селектор содержит форматы турнира');
                        if (failures) {
                            console.log('\n✗ Провалено: ' + failures);
                            process.exit(1);
                        }
                        console.log('\nAll admin tournament-groups tests passed ✔');
                    }, 20);
                }, 20);
            }, 20);
        }, 20);
    }, 20);
}, 20);
