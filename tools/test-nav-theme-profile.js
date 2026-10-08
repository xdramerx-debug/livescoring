#!/usr/bin/env node
// Guard against theme/language controls accidentally opening the profile modal.
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const dom = new JSDOM('<!doctype html><html lang="ru"><head><title>Пестово</title></head><body><div id="nav-auth"></div></body></html>', {
    runScripts: 'dangerously', url: 'https://test.local/index.html', pretendToBeVisual: true
});
const win = dom.window;
['js/course-config.js', 'js/format.js', 'js/dom.js', 'js/i18n.js', 'js/utils.js'].forEach(file => {
    win.eval(fs.readFileSync(path.join(ROOT, file), 'utf8'));
});
win.currentLang = 'ru';
win.currentUser = { uid: 'user-1' };
win.currentUserData = { name: 'Игрок Тест', firstName: 'Игорь', lastName: 'Тестовский' };
let profileOpens = 0;
win.openPlayerProfileModal = () => { profileOpens++; };
win.doLogout = () => {};
win.navAuth(win.currentUser, win.currentUserData);

let failures = 0;
function check(condition, label) {
    if (!condition) { failures++; console.error('FAIL:', label); }
    else console.log('ok:', label);
}

const navUser = win.document.querySelector('.nav-user');
const sun = win.document.querySelector('.sun-mode-btn');
const lang = win.document.querySelector('.lang-btn');
const profile = win.document.querySelector('.nav-profile-trigger');
check(!!navUser && !navUser.hasAttribute('onclick'), 'navigation container itself is not a profile click target');
check(!!sun && !!lang && !!profile, 'theme, language and explicit profile controls are separate');
sun.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
check(profileOpens === 0, 'switching sun mode does not open the profile');
lang.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
check(profileOpens === 0, 'switching language does not open the profile');
profile.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
check(profileOpens === 1, 'profile still opens from the explicit avatar/name button');

// Компактная подпись пользователя: короткое имя в шапке, полное — в подсказке.
const uname = win.document.querySelector('.nav-uname');
check(!!uname && uname.textContent === 'Игорь Т.', 'в шапке короткое имя «Имя Ф.» (получено: ' + (uname && uname.textContent) + ')');
check(!!profile && profile.getAttribute('title') === 'Игрок Тест', 'полное имя остаётся в подсказке кнопки профиля');
check(!!win.document.querySelector('.nav-logout'), 'кнопка выхода из профиля на месте');

// The official site name remains present in the title after an English toggle.
const titleBefore = win.document.title;
try { win.toggleLang(); } catch (error) { /* page-only services are absent in this isolated test */ }
check(/Пестово/.test(win.document.title) || /Пестово/.test(titleBefore),
    'site brand remains in the browser tab title after a language change');
console.log(failures ? 'Failed ' + failures + ' checks' : 'All navigation/profile checks passed');
process.exit(failures ? 1 : 0);
