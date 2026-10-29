// Дубликаты глобальных функций между js/*.js (аудит 2026-10, docs/IMPROVEMENTS-2026-10.md п.13).
//
// Все файлы js/ — обычные скрипты (sourceType: script), их функции попадают в
// один глобальный объект страницы. Два разных определения с одним именем на
// ОДНОЙ странице означают, что тихо побеждает последнее — это настоящий баг.
// Одно имя на РАЗНЫХ страницах — не баг, а риск расхождения: правка одной копии
// не попадает в другую. Именно так разъехались applyScoreKiosk() в scorer.js и
// live.js (querySelector('.page-head') против getElementById('page-head')).
//
// Тест фиксирует оба уровня:
//  1) на одной странице дублей имён быть не должно вообще;
//  2) межстраничные дубли разрешены только по явному списку с обоснованием —
//     новый дубль обязан пройти через осознанное решение, а не появиться молча.
//  3) уже устранённый дубль не должен возвращаться (score-kiosk).
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const jsDir = path.join(root, 'js');

// tools/test-bootstrap.js (подключается run-tests.js через --require) подменяет
// fs.readFileSync и для любого чтения js/utils.js возвращает КОНКАТЕНАТ
// фундаментных модулей (course-config, format, dom, i18n, official-alerts) +
// сам utils.js. Для песочниц это удобно, но здесь объявления нужны строго по
// файлам: иначе функции из i18n.js приписались бы utils.js и тест увидел бы
// несуществующие дубли. Читаем через openSync/readSync — их бутстрап не трогает.
function readRaw(file) {
    const fd = fs.openSync(file, 'r');
    try {
        const size = fs.fstatSync(fd).size;
        const buf = Buffer.alloc(size);
        fs.readSync(fd, buf, 0, size, 0);
        return buf.toString('utf8');
    } finally {
        fs.closeSync(fd);
    }
}

// ── 1. Объявления верхнего уровня в каждом файле ──
// Берём только function-объявления с нулевым отступом: вложенные/внутри-IIFE
// функции в глобальную область не попадают (js/tn-*.js, admin-*.js — IIFE).
function topLevelFunctions(file) {
    const src = readRaw(path.join(jsDir, file));
    const names = new Set();
    for (const m of src.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) names.add(m[1]);
    return names;
}
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js') && !f.startsWith('vendor'));
assert.ok(jsFiles.length >= 30, 'ожидалось не меньше 30 файлов js/, найдено ' + jsFiles.length);
const defs = new Map(jsFiles.map(f => [f, topLevelFunctions(f)]));

// ── 2. Карта страница → загружаемые скрипты ──
const htmlFiles = fs.readdirSync(root).filter(f => f.endsWith('.html'));
const pageScripts = new Map();
for (const f of htmlFiles) {
    const src = readRaw(path.join(root, f));
    // Порядок важен: при дубле имени побеждает последнее определение.
    const list = [...src.matchAll(/<script[^>]+src="js\/([^"?]+)\.js\?v=[0-9a-f]+"/g)].map(m => m[1] + '.js');
    pageScripts.set(f, list);
}
assert.ok(pageScripts.size >= 15, 'страниц не меньше 15, найдено ' + pageScripts.size);

const pageDupes = [];
for (const [page, scripts] of pageScripts) {
    const seen = new Map();
    scripts.forEach((s, i) => {
        (defs.get(s) || new Set()).forEach(name => {
            if (seen.has(name)) pageDupes.push({ page, name, first: seen.get(name), second: s + ' #' + i });
            else seen.set(name, s);
        });
    });
}
assert.deepStrictEqual(pageDupes, [],
    'на одной странице одно имя объявлено дважды (побеждает последнее, молча):\n  ' +
    pageDupes.map(d => d.page + ': ' + d.name + ' — ' + d.first + ' и ' + d.second).join('\n  '));

// ── 3. Межстраничные дубли — только по явному списку ──
// Обоснование обязательно: это осознанно НЕ объединённые копии.
const KNOWN_CROSS_PAGE_DUPES = {
    // Общее обоснование для всех «страничных» пар: marker.js грузится
    // только на marker.html, scorer.js — только на scorer.html, live.js —
    // только на setup-round.html. Столкновения в рантайме нет (это
    // отдельно проверяет п.2), но копии работают с РАЗНЫМИ моделями данных:
    // маркер держит локальные карты mkPScores/mkScores и префикс mk*, скорер
    // читает scRound.players[scPid].scores и префикс sc*. Механическое
    // объединение изменило бы поведение одной из страниц, а проверить это можно
    // только на устройстве в реальном раунде — поэтому вынесено в отдельную
    // задачу, а не сделано «по ходу» аудита.
    updDisp: {
        files: ['marker.js', 'scorer.js'],
        // Реализация вынесена в js/score-display.js (updScoreDisplay): раньше
        // копии совпадали побайтово (823 байта) и расходились только префиксом
        // (mkRound/mkGet/mkHole против scRound/scGet/scHole). Имя updDisp
        // осталось в обеих страницах как тонкий адаптер глобалов — расходиться
        // внутри него нечему, а 9 вызовов не пришлось трогать.
        // Делегирование проверяется ниже: вернуть копию логики не даст тест.
        delegatesTo: 'pestovoUpdScoreDisplay',
        why: 'общая реализация в js/score-display.js (pestovoUpdScoreDisplay); в marker.js и scorer.js остались адаптеры, подставляющие mk*/sc*-глобалы своей страницы.'
    },
    renderHole: {
        files: ['marker.js', 'scorer.js'],
        // Копии различались составом шапки, а не только префиксом: у скорера
        // есть дальность до лунки (нужна чашка игрока) и дедлайн с учётом
        // пауз, у маркера — только номер и пар. Поэтому общая функция
        // принимает ids.dist/ids.dl как необязательные, а расхождение в
        // поведении «без игрока в раунде» (маркер показывал par, скорер
        // ничего) закрыто флагом strict.
        delegatesTo: 'pestovoRenderHole',
        why: 'общая шапка лунки в js/score-display.js (pestovoRenderHole); в marker.js и scorer.js остались адаптеры со своими id и чашкой.'
    },
    buildHoles: {
        // v1.126.0: копия из js/solo.js удалена вместе с отдельным одиночным
        // экраном — соло и группа используют одну ленту лунок в live.js.
        files: ['marker.js', 'scorer.js'],
        // Разошлись не переименованиями, а тем, ЧЕЙ счёт считается введённым:
        // у маркера его собственный (он подтверждающий), у игрока его
        // собственный (ждёт подтверждения). Разметка кнопки была одинаковой,
        // поэтому она общая, а состояния считает страница.
        delegatesTo: 'pestovoBuildHoles',
        why: 'общая разметка ленты в js/score-display.js (pestovoBuildHoles); страницы передают контейнер, порядок лунок, гандикап поля, имя обработчика перехода и stateClass со своей логикой состояний.'
    },
    callOfficial: {
        files: ['live.js', 'marker.js', 'scorer.js'],
        // Различались только тем, откуда взять раунд и игрока и как подписать
        // оповещение: маркер уходит как «Marker (Имя)», игрок — своим именем,
        // групповой раунд дополнительно передаёт состав флайта и читает имя
        // функцией (данные к моменту вызова успевают обновиться).
        // Обработчик onSent — рассылка, тост, вибрация — был одинаковым.
        delegatesTo: 'pestovoCallOfficial',
        why: 'общая реализация в js/official-call.js (pestovoCallOfficial): requestOfficialCall + общий onSent; страницы передают свои roundId/playerId/prefix и имя для оповещения.'
    },
    checkVerify: {
        files: ['marker.js', 'scorer.js'],
        // Разошлись не переименованиями, а смыслом: маркер показывает третье
        // состояние («игрок ввёл, ждём подтверждения»), скорер — нет (там
        // уведомление на 3 секунды при сохранении). Поэтому общими сделаны
        // состояния сверки, а подписи и видимость «ожидания» задаёт страница.
        delegatesTo: 'pestovoCheckVerify',
        why: 'общая реализация в js/score-display.js (pestovoCheckVerify); страницы передают свои подписи, маркер дополнительно передаёт waiting — отсюда и было расхождение текстов («Matched:» против «Confirmed by marker:»).'
    },
    qrUrl: {
        files: ['qr-start.js', 'utils.js'],
        // Было самое опасное расхождение в списке — разная СИГНАТУРА: utils.js
        // объявлял qrUrl(data) с откатом на api.qrserver.com, qr-start.js —
        // qrUrl(data, size) с откатом на qrProviders(). Подключи кто-нибудь
        // utils.js на qr-start.html — второй аргумент молча потерялся бы.
        // Теперь обе (вместе с qrImageUrl из tn-mgr-core.js) строят URL через
        // общий pestovoQrImageUrl() в js/qr-url.js, а размер и поле —
        // настройка места вызова (200 / 420+4 / 320+2), как и было.
        delegatesTo: 'pestovoQrImageUrl',
        why: 'общая реализация в js/qr-url.js (pestovoQrImageUrl); qr-start.js и utils.js остались адаптерами со своими размерами по умолчанию (420/поле 4 и 200/без поля).'
    }
};
const cross = new Map();
for (const [file, names] of defs) {
    names.forEach(name => {
        if (!cross.has(name)) cross.set(name, []);
        cross.get(name).push(file);
    });
}
const dupes = [...cross.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([name, files]) => ({ name, files: files.sort() }));

// Для каждого учтённого дубля фиксируем точный набор файлов: если состав
// изменится (копию добавят в третий файл или, наоборот, объединят), список
// придётся пересмотреть осознанно, а не «само заработает».
for (const d of dupes) {
    const known = KNOWN_CROSS_PAGE_DUPES[d.name];
    if (!known) continue;
    assert.deepStrictEqual(d.files, [...known.files].sort(),
        d.name + ': состав файлов изменился — обновите KNOWN_CROSS_PAGE_DUPES (было ' +
        known.files.join(', ') + ', стало ' + d.files.join(', ') + ')');
    assert.ok(known.why && known.why.length > 40, d.name + ': обоснование обязательно');

    // Если для пары указана общая реализация, обе копии обязаны делегировать ей.
    // Иначе запись в списке превращается в индульгенцию: расхождение копий
    // снова станет возможным, но тест этого не заметит.
    if (known.delegatesTo) {
        for (const f of known.files) {
            const src = readRaw(path.join(jsDir, f));
            const i = src.indexOf('function ' + d.name + '(');
            assert.ok(i !== -1, f + ': не найдена function ' + d.name);
            let depth = 0, end = -1;
            for (let j = src.indexOf('{', i); j < src.length; j++) {
                if (src[j] === '{') depth++;
                else if (src[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
            }
            assert.ok(end > i, f + ': не удалось выделить тело ' + d.name);
            const body = src.slice(i, end);
            assert.ok(body.indexOf(known.delegatesTo + '(') !== -1,
                f + ': ' + d.name + ' должна вызывать общую ' + known.delegatesTo +
                '() из общего модуля, а не держать свою копию логики');
            // Адаптер — это подстановка аргументов, а не пересчёт: держать в нём
            // разметку или вычисления нельзя, иначе дубль вернулся бы под другим именем.
            assert.ok(!/innerHTML|\.textContent\s*=/.test(body),
                f + ': ' + d.name + ' не должен сам трогать DOM — вся логика в ' + known.delegatesTo + '()');
        }
    }
}
// Ни одна страница не должна грузить два файла из одной группы дублей.
for (const d of dupes) {
    for (const [page, scripts] of pageScripts) {
        const hit = d.files.filter(f => scripts.includes(f));
        assert.ok(hit.length < 2,
            page + ' грузит одновременно ' + hit.join(' и ') + ' — оба объявляют ' + d.name + ', побеждает последнее');
    }
}

const unexpected = dupes.filter(d => !(d.name in KNOWN_CROSS_PAGE_DUPES));
assert.deepStrictEqual(unexpected.map(d => d.name + ' → ' + d.files.join(', ')), [],
    'найдены неучтённые дубли имён между файлами js/ (расхождение версий — будущий баг).\n' +
    'Объедините их в общий модуль (как js/score-kiosk.js) либо внесите в KNOWN_CROSS_PAGE_DUPES с обоснованием:\n  ' +
    unexpected.map(d => d.name + ' → ' + d.files.join(', ')).join('\n  '));
// Обратная сторона: запись в списке должна соответствовать реальности.
const stale = Object.keys(KNOWN_CROSS_PAGE_DUPES).filter(n => !dupes.some(d => d.name === n));
assert.deepStrictEqual(stale, [], 'в KNOWN_CROSS_PAGE_DUPES остались уже устранённые имена: ' + stale.join(', '));

// ── 4. Киоск-режим вынесен и подключён правильно ──
const kiosk = 'score-kiosk.js';
assert.ok(defs.get(kiosk), 'js/score-kiosk.js существует');
['isScoreKioskUrl', 'applyScoreKiosk'].forEach(fn => {
    const owners = [...defs.entries()].filter(([, s]) => s.has(fn)).map(([f]) => f);
    assert.deepStrictEqual(owners, [kiosk],
        fn + ' должна быть объявлена ровно один раз — в js/score-kiosk.js, найдено: ' + owners.join(', '));
});
// Подключение строго ДО потребителей, иначе вызов на инициализации упадёт.
const consumers = [['scorer.html', 'scorer.js'], ['setup-round.html', 'live.js']];
for (const [page, consumer] of consumers) {
    const scripts = pageScripts.get(page);
    assert.ok(scripts, page + ' найдена');
    const ki = scripts.indexOf(kiosk);
    const ci = scripts.indexOf(consumer);
    assert.ok(ki !== -1, page + ' не грузит js/score-kiosk.js');
    assert.ok(ci !== -1, page + ' не грузит js/' + consumer);
    assert.ok(ki < ci, page + ': score-kiosk.js должен подключаться ДО ' + consumer + ' (позиции ' + ki + ' и ' + ci + ')');
}
// Точки вызова на месте — вынос не должен был их потерять.
for (const consumer of ['scorer.js', 'live.js']) {
    const src = readRaw(path.join(jsDir, consumer));
    assert.ok((src.match(/applyScoreKiosk\(\)/g) || []).length >= 2,
        'js/' + consumer + ' по-прежнему вызывает applyScoreKiosk() минимум дважды (инициализация и смена раунда)');
    assert.ok(!/^function applyScoreKiosk/m.test(src), 'js/' + consumer + ' не объявляет applyScoreKiosk повторно');
}
// Общая версия должна работать с обеими разметками: id есть только в setup-round.html.
const kioskSrc = readRaw(path.join(jsDir, kiosk));
assert.match(kioskSrc, /getElementById\('page-head'\)\s*\|\|\s*document\.querySelector\('\.page-head'\)/,
    'applyScoreKiosk проверяет и id, и класс шапки — иначе на scorer.html (только класс) она не найдётся');
const scorerHtml = readRaw(path.join(root, 'scorer.html'));
assert.ok(/class="[^"]*page-head/.test(scorerHtml), 'в scorer.html шапка отмечена классом page-head');
const setupHtml = readRaw(path.join(root, 'setup-round.html'));
assert.ok(/id="page-head"/.test(setupHtml), 'в setup-round.html у шапки есть id page-head');

console.log('Scoring duplicates tests passed (' + jsFiles.length + ' файлов, ' +
    pageScripts.size + ' страниц, учтённых межстраничных дублей: ' + dupes.length + ')');
