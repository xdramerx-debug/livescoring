// Аудит RTDB-слушателей: каждая подписка внутри функции обязана быть
// защищена от повторного вызова (аудит 2026-10, docs/IMPROVEMENTS-2026-10.md п.10).
//
// Зачем. `db.ref(...).on('value', cb)` живёт до конца страницы. Если функция с
// подпиской вызывается второй раз (смена авторизации, смена раунда, повторное
// открытие вкладки), слушатель дублируется: данные начинают читаться дважды,
// колбэки срабатывают по два раза, трафик и стоимость RTDB растут, а в консоли
// при этом чисто. Найти это глазами в 10 000 строк utils.js нереально.
//
// Подписка на верхнем уровне файла выполняется один раз за загрузку страницы —
// это нормальный паттерн, он не проверяется.
//
// Защищенной считается подписка, если выполняется ЛЮБОЕ условие:
//   1. в том же файле есть `.off(` — снятие подписки присутствует;
//   2. в теле функции есть guard-флаг: ранний `if (...) return;` плюс
//      присваивание `<флаг> = true` с тем же именем (mkLoadStarted,
//      bgAlertsListenerAttached, window._pestovoCallResponsesListening);
//   3. в теле есть проверка реестра (`if (!registry[key])` / `if (registry[key]) return`);
//   4. тело делегирует подписку в bindRealtimeValue() — общий реестр из utils.js.
//
// Запуск: node tools/check-rtdb-listeners.js [--json] [--quiet]
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS_DIR = path.join(ROOT, 'js');
const JSON_OUT = process.argv.includes('--json');
const QUIET = process.argv.includes('--quiet');

const RTDB_ON = /\.on\(\s*['"](value|child_added|child_changed|child_removed|child_moved)['"]/;
const NAMED_DECL = /^(?:function\s+([A-Za-z_$][\w$]*)\s*\(|(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b)/;

function readRaw(file) {
    // tools/test-bootstrap.js подменяет fs.readFileSync для js/utils.js;
    // здесь нужен ровно тот файл, который лежит на диске.
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

// Обходит файл, отслеживая вложенность именованных функций, и возвращает
// список подписок с указанием области видимости.
function findSubscriptions(src) {
    const lines = src.split('\n');
    const stack = [];   // [{ name, depth }]
    let depth = 0;
    const found = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const decl = NAMED_DECL.exec(trimmed);
        if (decl && line.includes('{')) stack.push({ name: decl[1] || decl[2], depth });
        if (RTDB_ON.test(line)) {
            found.push({
                line: i + 1,
                scope: stack.length ? stack[stack.length - 1].name : null,
                text: trimmed.slice(0, 110)
            });
        }
        depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        while (stack.length && depth <= stack[stack.length - 1].depth) stack.pop();
    }
    return found;
}

function functionBody(src, name) {
    const re = new RegExp('(?:^|\\n)\\s*function\\s+' + name.replace(/\$/g, '\\$') + '\\s*\\(');
    const m = re.exec(src);
    if (!m) return '';
    const start = src.indexOf('{', m.index + m[0].length - 1);
    if (start === -1) return '';
    let d = 0;
    for (let i = start; i < src.length; i++) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
    }
    return '';
}

function guardFlags(body) {
    // Присваивания вида `flag = true` / `window.flag = true`.
    const flags = new Set();
    for (const m of body.matchAll(/([A-Za-z_$][\w$]*)\s*=\s*true\s*;/g)) flags.add(m[1]);
    return flags;
}

function earlyReturns(body) {
    const out = [];
    for (const m of body.matchAll(/if\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*return\b/g)) out.push(m[1]);
    return out;
}

function isProtected(fileSrc, site) {
    // 1) В файле есть снятие подписки.
    if (/\.off\(/.test(fileSrc)) return 'есть .off() в файле';

    const body = functionBody(fileSrc, site.scope);
    if (!body) return null;

    // 4) Делегирование в общий реестр bindRealtimeValue.
    if (/bindRealtimeValue\s*\(/.test(body)) return 'делегирует в bindRealtimeValue()';

    // 2) Guard-флаг: присваивание `X = true` и ранний return, упоминающий X.
    const flags = guardFlags(body);
    const returns = earlyReturns(body);
    for (const flag of flags) {
        if (returns.some(cond => new RegExp('\\b' + flag.replace(/\$/g, '\\$') + '\\b').test(cond))) {
            return 'guard-флаг ' + flag;
        }
        // Вариант «if (flag) return;» без отрицания тоже попадает в returns.
    }

    // 3) Реестр подписок по ключу. Признак — запись в именованную коллекцию
    //    внутри подписывающей функции: `registry[key] = {...}`. Проверка может
    //    стоять как в самом if (`if (!officialCallBindings[key])`), так и через
    //    локальную переменную (`var binding = bindings[key]; if (!binding)`) —
    //    так устроен bindRealtimeValue() в utils.js, поэтому по тексту if
    //    искать нельзя.
    if (/[\w$]+\s*\[[^\]]+\]\s*=/.test(body)) return 'реестр подписок по ключу';

    return null;
}

// ── Сканирование каталога js/ (только при прямом запуске) ──
function scanDir(dir) {
    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.js') && !f.startsWith('vendor'))
        .sort();
    const problems = [];
    const stats = { files: 0, total: 0, topLevel: 0, inFunction: 0, protected: 0 };
    for (const f of files) {
        const src = readRaw(path.join(dir, f));
        const sites = findSubscriptions(src);
        if (!sites.length) continue;
        stats.files++;
        for (const site of sites) {
            stats.total++;
            if (!site.scope) { stats.topLevel++; continue; }
            stats.inFunction++;
            const why = isProtected(src, site);
            if (why) { stats.protected++; continue; }
            problems.push({ file: path.basename(path.dirname(dir)) + '/' + f, line: site.line, fn: site.scope, text: site.text });
        }
    }
    return { stats, problems };
}

module.exports = { findSubscriptions, isProtected, functionBody, readRaw, scanDir };

if (require.main !== module) return;

const { stats, problems } = scanDir(JS_DIR);

if (JSON_OUT) {
    process.stdout.write(JSON.stringify({ stats, problems }, null, 2) + '\n');
} else if (!QUIET) {
    console.log('RTDB-подписки: всего ' + stats.total + ' в ' + stats.files + ' файлах — ' +
        'на верхнем уровне ' + stats.topLevel + ' (однократно), внутри функций ' + stats.inFunction +
        ', из них защищено ' + stats.protected);
}

if (problems.length) {
    if (JSON_OUT) { console.error(JSON.stringify({ stats, problems }, null, 2)); process.exit(1); }
    console.error('\nНезащищённые подписки (повторный вызов функции удвоит слушателя):');
    problems.forEach(p => console.error('  ' + p.file + ':' + p.line + ' в ' + p.fn + '() — ' + p.text));
    console.error('\nДобавьте guard-флаг, реестр по ключу, .off() при переподключении ' +
        'или делегируйте в bindRealtimeValue() (js/utils.js).');
    process.exitCode = 1;
} else if (!QUIET && !JSON_OUT) {
    console.log('Все подписки внутри функций защищены от повторного вызова ✔');
}
