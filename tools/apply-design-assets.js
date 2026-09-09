#!/usr/bin/env node
/**
 * Служебный скрипт: подключает систему шаблонов оформления ко всем страницам
 * и поднимает версию сайта.
 *
 *   node tools/apply-design-assets.js
 *
 * Что делает (идемпотентно, повторный запуск ничего не дублирует):
 *   1. после css/style.css добавляет css/design-presets.css и js/design-system.js;
 *   2. поднимает cache-bust версии изменённых файлов (utils.js, admin.js);
 *   3. обновляет номер версии сайта в .version-number.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var NEW_VERSION = '1.35.0';
var OLD_VERSION = '1.34.0';

var BUMPS = [
    ['js/utils.js?v=39', 'js/utils.js?v=40'],
    ['js/admin.js?v=25', 'js/admin.js?v=26']
];

var INJECT = '    <link rel="stylesheet" href="css/design-presets.css?v=1">\n' +
             '    <script src="js/design-system.js?v=1"></script>\n';

var files = fs.readdirSync(ROOT).filter(function(f) { return /\.html$/.test(f); }).sort();
var report = [];

files.forEach(function(file) {
    var full = path.join(ROOT, file);
    var src = fs.readFileSync(full, 'utf8');
    var out = src;
    var notes = [];

    if (out.indexOf('css/design-presets.css') === -1) {
        var lines = out.split('\n');
        var idx = -1;
        for (var i = 0; i < lines.length; i++) {
            if (lines[i].indexOf('css/style.css') !== -1) { idx = i; break; }
        }
        if (idx === -1) {
            report.push(file + ': ПРОПУЩЕНА (нет css/style.css)');
            return;
        }
        lines.splice(idx + 1, 0, INJECT.replace(/\n$/, ''));
        out = lines.join('\n');
        notes.push('+design assets');
    }

    BUMPS.forEach(function(pair) {
        if (out.indexOf(pair[0]) !== -1) {
            out = out.split(pair[0]).join(pair[1]);
            notes.push(pair[0].split('?')[0] + ' bumped');
        }
    });

    if (out.indexOf(OLD_VERSION) !== -1) {
        out = out.split(OLD_VERSION).join(NEW_VERSION);
        notes.push('version → ' + NEW_VERSION);
    }

    if (out !== src) {
        fs.writeFileSync(full, out);
        report.push(file + ': ' + (notes.join(', ') || 'без изменений'));
    } else {
        report.push(file + ': уже обновлена');
    }
});

console.log(report.join('\n'));
console.log('\nФайлов обработано: ' + files.length);
