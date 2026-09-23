// Регрессионный тест мобильной эргономики (аудит v1.68.0).
// Запуск: NODE_PATH=<путь>/node_modules node tools/test-mobile-p0.js
//
// Защищает три P0-бага, найденных аудитом docs/mobile-audit.md, и ещё
// несколько измеримых свойств мобильной версии:
//   1. setup-round.html: аккордеон карточек игроков раскрывается
//      (есть #p0-wizard-steps, ровно 1 карточка .open, у заголовков шеврон);
//   2. scorer.html: sticky-кнопка «Сохранить» вызывает saveSc() РОВНО 1 раз;
//   3. CSS: у кнопок ± есть страховочный минимум 44px;
//   4. sw.js: предкэш не тянет PDF книги правил и админ-бандлы;
//   5. версия сайта совпадает во всех футерах и в CACHE_NAME sw.js.
// Если jsdom не установлен — тест пропускается (не падает).
'use strict';
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP: jsdom не установлен (npm i jsdom) — тест пропущен'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
let failures = 0, checks = 0;
function ok(cond, label) {
    checks++;
    if (!cond) { failures++; console.error(' ✗', label); }
    else console.log(' ok   |', label);
}

// ── 1) setup-round.html: аккордеон и степпер ──
(function setupAccordion() {
    let html = fs.readFileSync(path.join(ROOT, 'setup-round.html'), 'utf8')
        .replace(/<script src="https?:[^"]*"><\/script>/g, '');
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://t.test/setup-round.html', pretendToBeVisual: true });
    const win = dom.window, doc = win.document;
    win.navigator.vibrate = () => {};
    win.currentUser = null; win.currentUserData = null;
    function makeRef(p) { const r = { _p: p || '', update() { return Promise.resolve(); }, set() { return Promise.resolve(); }, remove() { return Promise.resolve(); }, transaction(f) { return Promise.resolve({ value: f(null) }); }, once() { return Promise.resolve({ val: () => null }); }, on() {}, off() {}, orderByChild() { return r; }, equalTo() { return r; }, push() { return Promise.resolve({ key: 'x' }); } }; return r; }
    win.db = { ref: p => makeRef(p) };
    ['js/course-config.js', 'js/format.js', 'js/utils.js', 'js/live.js', 'js/solo.js', 'js/round-setup.js'].forEach(r => win.eval(fs.readFileSync(path.join(ROOT, r), 'utf8')));
    // v1.69.0: единая форма — состав задаёт кнопка «Добавить игрока»
    win.eval('addSetupPlayer();');
    win.eval('addSetupPlayer();');
    win.eval('renderSetupPlayers(true);');
    setTimeout(() => {
        win.eval('initP0MobileEnhancements();');
        ok(!!doc.getElementById('p0-wizard-steps'), 'setup-round: создан #p0-wizard-steps');
        const open = doc.querySelectorAll('.setup-player-card.open').length;
        ok(open === 1, 'setup-round: открыта ровно 1 карточка (получено ' + open + ')');
        ok(doc.querySelectorAll('.setup-player-head .fa-chevron-down').length >= 3, 'setup-round: у карточек есть шеврон');
        ok(doc.querySelectorAll('.setup-player-card:not(.open) .form-row').length > 0 &&
           doc.querySelectorAll('.setup-player-card.open .form-row').length > 0,
           'setup-round: поля открытой карточки видимы, закрытых — скрыты');
        // ── 2) scorer.html: sticky-сохранение один раз ──
        let h2 = fs.readFileSync(path.join(ROOT, 'scorer.html'), 'utf8')
            .replace(/<script src="https?:[^"]*"><\/script>/g, '');
        const dom2 = new JSDOM(h2, { runScripts: 'dangerously', url: 'https://t.test/scorer.html?round=R&as=me', pretendToBeVisual: true });
        const w2 = dom2.window, d2 = w2.document;
        w2.navigator.vibrate = () => {};
        let calls = 0; w2.saveSc = () => { calls++; };
        w2.eval(fs.readFileSync(path.join(ROOT, 'js/course-config.js'), 'utf8'));
        w2.eval(fs.readFileSync(path.join(ROOT, 'js/format.js'), 'utf8'));
        w2.eval(fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8'));
        w2.eval('initP0MobileEnhancements();');
        const clone = d2.getElementById('p0-sticky-save');
        ok(!!clone, 'scorer: создана sticky-кнопка #p0-sticky-save');
        ok(clone && !clone.hasAttribute('onclick'), 'scorer: у клона нет inline onclick (двойного вызова)');
        if (clone) clone.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
        ok(calls === 1, 'scorer: saveSc() вызван 1 раз за клик (получено ' + calls + ')');
        // ── 3/4/5) CSS + sw + версия ──
        cssSwVersion();
        // ── 6) нижний мобильный таббар полностью удалён ──
        ok(!doc.getElementById('bottom-tabbar'), 'setup-round: нижний таббар не создаётся');
        ok(typeof win.buildBottomTabbar !== 'function', 'js: buildBottomTabbar удалён');
        ok(!/\.bottom-tabbar/.test(fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8')),
            'css: правил .bottom-tabbar не осталось');
        console.log(failures ? '\nПРОВАЛЕНО: ' + failures + ' из ' + checks : '\nOK: ' + checks + ' проверок');
        process.exit(failures ? 1 : 0);
    }, 60);
})();

function cssSwVersion() {
    const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    ok(/\.score-minus,\.score-plus\{min-width:44px!important;min-height:44px!important;\}/.test(css),
        'css: страховочный минимум 44px для кнопок ±');
    ok(css.indexOf('body{--score-btn:64px;--score-btn-fs:28px;}') !== -1,
        'css: единая переменная --score-btn объявлена');
    ok(/body\.st-scoring-v3\{--score-btn:48px;--score-btn-fs:22px;\}/.test(css),
        'css: пресет «Компакт» задаёт --score-btn:48px (было 42px)');
    ok(css.indexOf('.score-minus,body.st-scoring-v3 .score-plus{width:42px') === -1 &&
       css.indexOf('body.st-scoring-v3 .score-minus,body.st-scoring-v3 .score-plus{width:42px') === -1,
        'css: у кнопок ± пресета «Компакт» нет жёстких 42px');

    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const assets = sw.match(/STATIC_ASSETS = \[([\s\S]*?)\];/)[1];
    ok(!/pravila-pestovo\.pdf/.test(assets), 'sw: PDF книги правил не в предкэше');
    ok(!/pdfjs\//.test(assets), 'sw: pdf.js не в предкэше');
    ok(!/js\/admin\.js/.test(assets) && !/js\/start-admin\.js/.test(assets), 'sw: админ-бандлы не в предкэше');

    const ver = (sw.match(/pestovo-v(\d+\.\d+\.\d+)/) || [])[1];
    ok(!!ver, 'sw: найдена версия CACHE_NAME');
    const pages = fs.readdirSync(ROOT).filter(f => /\.html$/.test(f));
    let mismatch = 0;
    pages.forEach(f => {
        const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
        if (h.indexOf('version-number') !== -1 && h.indexOf(ver) === -1) mismatch++;
    });
    ok(mismatch === 0, 'версия ' + ver + ' согласована во всех футерах (' + (pages.length) + ' страниц, несовпадений ' + mismatch + ')');
}
