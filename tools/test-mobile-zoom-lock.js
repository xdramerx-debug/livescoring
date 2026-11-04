// Запрет масштабирования страницы в мобильной версии (v1.130.7).
// Задача: на телефоне случайный пинч или двойной тап не должен увеличивать
// страницу — иначе карточка лунки и кнопки ввода счёта уезжают за экран.
// Десктоп не затрагивается: правила работают только на жестах касания.
// Три уровня защиты проверяются вместе, потому что каждый закрывает свою
// платформу: meta viewport — Chrome/Android, CSS touch-action — двойной тап,
// gesture*-события — пинч в iOS Safari (там user-scalable=no игнорируется).
// Запуск: node tools/test-mobile-zoom-lock.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(cond, label) {
    if (cond) console.log('ok  -', label);
    else { failures++; console.error('FAIL', label); }
}

const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();
check(pages.length >= 15, 'найдены все HTML-страницы (' + pages.length + ')');

pages.forEach(function (page) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const m = /<meta\s+name="viewport"\s+content="([^"]*)"/i.exec(html);
    const content = m ? m[1] : '';
    check(/user-scalable\s*=\s*no/i.test(content), page + ': viewport запрещает масштабирование (user-scalable=no)');
    check(/maximum-scale\s*=\s*1(\.0)?\b/i.test(content), page + ': viewport ограничивает максимум масштаба (maximum-scale=1)');
    check(/width\s*=\s*device-width/i.test(content), page + ': ширина страницы равна ширине экрана');
    check(/js\/ui-events\.js/.test(html), page + ': подключён общий скрипт жестов (js/ui-events.js)');
});

const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
check(/html\s*\{[^}]*touch-action\s*:\s*manipulation/i.test(css),
    'css/style.css: html получает touch-action:manipulation (двойной тап не зумит)');

const js = fs.readFileSync(path.join(ROOT, 'js/ui-events.js'), 'utf8');
['gesturestart', 'gesturechange', 'gestureend'].forEach(function (name) {
    check(js.indexOf("'" + name + "'") !== -1, 'js/ui-events.js: гасит событие ' + name + ' (пинч в iOS Safari)');
});
check(/preventDefault/.test(js), 'js/ui-events.js: жест действительно отменяется через preventDefault');
check(/passive:\s*false/.test(js), 'js/ui-events.js: слушатель не passive (иначе preventDefault запрещён)');
// Прокрутка и одиночные тапы не должны блокироваться: глобального
// preventDefault на touchstart/touchmove/touchend быть не должно.
check(!/addEventListener\(\s*'touch(start|move|end)'\s*,\s*stopZoom/.test(js),
    'js/ui-events.js: тапы и прокрутка не перехватываются');

if (failures) { console.error('\n' + failures + ' проверок не прошло'); process.exit(1); }
console.log('\nЗапрет масштабирования в мобильной версии настроен');
