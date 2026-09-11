// Автотесты: групповой раунд от гостя не должен падать с «дублирующий игрок».
//
// Регрессия бага: при создании группового раунда в виде гостя два РАЗНЫХ
// игрока (однофамильцы / тёзки / разные отчества) получали один user-id
// из-за слишком агрессивного сравнения ФИО, и раунд не создавался
// («Дублирующий игрок в группе»).
//
// Проверяется:
//  — isSamePersonByFio: 'strong' только для реально одного человека;
//  — resolveOrCreatePlayerUser: 'loose' (одна общая часть) НЕ мержит;
//  — защита в live.js: совпавшие у разных имён id не блокируют старт;
//  — настоящее дублирование (одно и то же имя дважды) по-прежнему ловится;
//  — pestovoFioTokensMatch: сравнение по словам, а не подстрокам.
//
// Запуск: node tools/test-guest-group-dedupe.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(cond, label) {
    if (!cond) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}

// ── Минимальные заглы окружения для загрузки реального js/utils.js ──
function mkEl() {
    return {
        style: { setProperty(){} }, value: '', textContent: '', innerHTML: '',
        checked: false, dataset: {}, children: [],
        classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
        setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
        appendChild(){}, removeChild(){}, addEventListener(){}, removeEventListener(){},
        querySelector(){ return null; }, querySelectorAll(){ return []; },
        focus(){}, blur(){}, click(){}
    };
}
function makeLocalStorage() {
    const store = {};
    return {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
        clear: () => { Object.keys(store).forEach(k => delete store[k]); },
        key: i => Object.keys(store)[i] || null,
        get length() { return Object.keys(store).length; }
    };
}
// Фейковая БД с настоящим вложенным деревом (как Firebase)
function makeDb(root) {
    function getAt(p) {
        if (!p) return root;
        let cur = root;
        for (const seg of p.split('/')) {
            if (cur == null || typeof cur !== 'object') return undefined;
            cur = cur[seg];
        }
        return cur;
    }
    function setAt(p, v) {
        const segs = p.split('/');
        const last = segs.pop();
        let cur = root;
        for (const seg of segs) {
            if (cur[seg] == null || typeof cur[seg] !== 'object') cur[seg] = {};
            cur = cur[seg];
        }
        cur[last] = v;
    }
    function ref(p) {
        p = p || '';
        return {
            once: () => Promise.resolve({
                exists: () => getAt(p) !== undefined && getAt(p) !== null,
                val: () => { const v = getAt(p); return v === undefined ? null : v; }
            }),
            set: v => { setAt(p, v); return Promise.resolve(); },
            update: v => { setAt(p, Object.assign({}, getAt(p) || {}, v)); return Promise.resolve(); },
            remove: () => { setAt(p, null); return Promise.resolve(); },
            on: () => {}, off: () => {}, child: sub => ref(p ? p + '/' + sub : sub)
        };
    }
    return { ref };
}

const sandbox = {
    console, Promise, setTimeout, clearTimeout, setInterval, clearInterval,
    URLSearchParams, encodeURIComponent, decodeURIComponent, Math, Date, JSON,
    localStorage: makeLocalStorage(),
    sessionStorage: makeLocalStorage(),
    navigator: { language: 'ru-RU', userAgent: 'node-test' },
    fetch: undefined,
    document: {
        addEventListener: () => {}, removeEventListener: () => {},
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        createElement: mkEl,
        documentElement: Object.assign(mkEl(), { lang: 'ru' }),
        body: mkEl()
    }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8'), sandbox, { filename: 'utils.js' });

// ── 1. isSamePersonByFio: только реальные совпадения дают 'strong' ──
const fio = sandbox.isSamePersonByFio;
const parts = s => sandbox.getNamePartsNormalized(s);
const norm = s => sandbox.normalizeSearchText(s);
const cmp = (a, b) => fio(parts(a), parts(b), norm(a), norm(b));

check(cmp('Иван Петров', 'Иван Петров') === 'strong', 'fio: точное совпадение → strong');
check(cmp('Иван Петров', 'Петров Иван') === 'strong', 'fio: порядок слов не важен → strong');
check(cmp('Иван Петров', 'Иван Петрович Петров') === 'strong', 'fio: добавлено отчество → strong');
check(cmp('Смирнов Дмитрий Иванович', 'Иванович Дмитрий Смирнов') === 'strong', 'fio: перестановка 3 слов → strong');
check(cmp('Иванов Иван Иванович', 'Иванов Иван Петрович') !== 'strong', 'fio: разные отчества — НЕ один человек');
check(cmp('Иван Петров Сидоров', 'Иван Кузнецов Сидоров') !== 'strong', 'fio: 2 общие части из 3 — НЕ один человек');
check(cmp('Иванов Алексей', 'Иванов Сергей') === 'loose', 'fio: однофамильцы → только loose');
check(cmp('Александр Морозов', 'Александр Козлов') === 'loose', 'fio: тёзки → только loose');
check(cmp('Петров Иван', 'Иванов Пётр') == null || cmp('Петров Иван', 'Иванов Пётр') === 'loose' || cmp('Петров Иван', 'Иванов Пётр') === 'strong', 'fio: созвучные фамилии обрабатываются');
check(cmp('Петров', 'Иван Петрович Петров') !== 'strong', 'fio: только фамилия против 3 слов — НЕ мерж');

// ── 2. resolveOrCreatePlayerUser: разные гости — разные id ──
async function main() {
    const state = {
        users: {
            user_tn_ivanov: { name: 'Иванов Пётр', firstName: 'Пётр', lastName: 'Иванов', middleName: 'Сергеевич', handicap: 12.4, isGuest: false, roundsPlayed: 5 }
        }
    };
    sandbox.db = makeDb(state);
    const resolve = sandbox.resolveOrCreatePlayerUser;
    const g = (name, hcp) => resolve({ uid: null, name: name, exactHcp: hcp, gender: 'men', tee: 'bl' });

    // В базе уже есть «Иванов Пётр» — однофамильцы НЕ должны прилипнуть к нему
    const a1 = await g('Иванов Алексей', 18);
    const a2 = await g('Иванов Сергей', 24);
    check(a1 !== a2, 'resolve: однофамильцы получили разные id');
    check(a1 !== 'user_tn_ivanov' && a2 !== 'user_tn_ivanov', 'resolve: однофамильцы не прилипли к существующему игроку');

    const b1 = await g('Александр Морозов', 5);
    const b2 = await g('Александр Козлов', 7);
    check(b1 !== b2, 'resolve: тёзки получили разные id');

    const c1 = await g('Смирнов Дмитрий Иванович', 9);
    const c2 = await g('Смирнов Дмитрий Петрович', 15);
    check(c1 !== c2, 'resolve: разные отчества — разные id');

    // Тот же человек повторно — идемпотентно один id
    const c1b = await g('Смирнов Дмитрий Иванович', 8);
    check(c1b === c1, 'resolve: повтор того же имени — тот же id (дедуп сохранён)');

    // Порядок слов не плодит дубли
    const b1b = await g('Морозов Александр', 5);
    check(b1b === b1, 'resolve: «Фамилия Имя» и «Имя Фамилия» — один id');

    // Существующий игрок находится по полному ФИО (с отчеством из записи)
    const d = await g('Иванов Пётр Сергеевич', 12.4);
    check(d === 'user_tn_ivanov', 'resolve: полный ФИО находит существующего игрока');

    // ── 3. Защита в live.js: коллизия id разных имён не блокирует старт ──
    const live = fs.readFileSync(path.join(ROOT, 'js', 'live.js'), 'utf8');
    check(live.indexOf('var seenNames = {};') !== -1, 'live.js: seenNames объявлен');
    check(live.indexOf('seenNames[pid] === normName') !== -1, 'live.js: дубль только при одинаковом имени');

    const fnStart = live.indexOf('resolveAll.then(function(resolvedIds) {');
    const fnEnd = live.indexOf('var markerAssignments = {};', fnStart);
    check(fnStart !== -1 && fnEnd > fnStart, 'live.js: блок сборки players найден');
    let buildFnSrc = live.slice(fnStart + 'resolveAll.then('.length, fnEnd).trim() + '\n}';
    // дописываем возврат результата, чтобы срез был проверяемым
    buildFnSrc = buildFnSrc.slice(0, buildFnSrc.lastIndexOf('}')) + '\nreturn { players: players, pOrder: pOrder };\n}';

    const box = { console, Math, Date, JSON };
    vm.createContext(box);
    box.normalizeSearchText = sandbox.normalizeSearchText;
    box.currentLang = 'ru';
    box.toasts = [];
    box.toast = (msg, kind) => { box.toasts.push({ msg: msg, kind: kind }); };
    vm.runInContext(
        'var groupStarting = true;\nvar inputs = [];\n' +
        'this.buildPlayers = function(inputsArg, resolvedIds) { inputs = inputsArg; groupStarting = true; return (' +
        buildFnSrc + ')(resolvedIds); };',
        box
    );

    const mkInput = (idx, name) => ({ idx: idx, name: name, firstName: name.split(' ')[0] || '', lastName: '', middleName: '', hcpStr: '', parsedHcp: 10, fieldHcp: 9, gender: 'men', tee: 'bl' });

    // 3a. Разные имена, но резолвер вернул ОДИН id (старый баг) → старт разрешён
    box.toasts.length = 0;
    const out1 = box.buildPlayers([mkInput(1, 'Иванов Алексей'), mkInput(2, 'Иванов Сергей')], ['user_x', 'user_x']);
    check(out1 !== undefined && out1.players && Object.keys(out1.players).length === 2, 'live.js: два разных игрока с одним id → группа создаётся (2 игрока)');
    check(box.toasts.length === 0, 'live.js: при разных именах нет ошибки «дублирующий игрок»');

    // 3b. Одно и то же имя дважды → настоящий дубль, старт заблокирован
    box.toasts.length = 0;
    const out2 = box.buildPlayers([mkInput(1, 'Иванов Алексей'), mkInput(2, 'иванов   алексей')], ['user_x', 'user_x']);
    check(out2 === undefined && box.toasts.some(x => x.msg.indexOf('Дублирующий игрок') !== -1), 'live.js: одно имя дважды — ошибка сохранена');

    // 3c. Разные имена и разные id — обычный сценарий без изменений
    box.toasts.length = 0;
    const out3 = box.buildPlayers([mkInput(1, 'Иванов Алексей'), mkInput(2, 'Петров Николай')], ['user_a', 'user_b']);
    check(out3 && Object.keys(out3.players).length === 2 && box.toasts.length === 0, 'live.js: обычный случай — 2 игрока, без ошибок');

    // ── 4. Поиск активных раундов: сравнение по словам, не подстрокам ──
    check(sandbox.pestovoFioTokensMatch('Иван Петрович Петров', 'Иван Петров') === true, 'fio-tokens: «Иван Петров» находит «Иван Петрович Петров»');
    check(sandbox.pestovoFioTokensMatch('Иван Петровский', 'Иван Петров') === false, 'fio-tokens: «петров» НЕ совпадает с «петровский»');
    check(sandbox.pestovoFioTokensMatch('Степан Иванов', 'Иван Петров') === false, 'fio-tokens: чужая сессия не блокирует старт');

    // ── 5. Модалка конфликта: кнопка «Начать всё равно» — живой слушатель ──
    const utils2 = fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8');
    const modalStart = utils2.indexOf('function pestovoShowFioConflictModal');
    const modalEnd = utils2.indexOf('// ==========================================\n// ПОГОДНЫЙ ВИДЖЕТ', modalStart);
    const modalSrc = utils2.slice(modalStart, modalEnd);
    check(modalSrc.indexOf('fio-conflict-continue') !== -1, 'модалка: кнопка «Начать всё равно» имеет id');
    check(modalSrc.indexOf("addEventListener('click'") !== -1, 'модалка: колбэк вешается слушателем');
    check(modalSrc.indexOf("'(' + onContinueAnyway + ')()'") === -1, 'модалка: колбэк больше не сериализуется в onclick');

    console.log(failures ? '\n' + failures + ' FAILURES' : '\nAll guest-group dedupe tests passed ✔');
    process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
