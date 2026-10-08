#!/usr/bin/env node
'use strict';
// Шапка сайта для вошедшего игрока на узких экранах (v1.103.0).
//
// Что защищаем: длинное «Имя Фамилия» справа в шапке раньше растягивало
// строку и выдавливало нужные элементы (тема/язык, QR, выход). Теперь в
// шапке короткое имя «Имя Ф.», полное — в подсказке, а сам блок ограничен
// по ширине и обрезается многоточием. Проверка измеряет реальную геометрию
// (реальный CSS + браузер), а не разметку.
//
// Запуск: CHROMIUM_EXTRA_LIBS=<libs> node tools/check-nav-mobile.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const binary = require('@sparticuz/chromium');
const root = path.join(__dirname, '..');

const LONG_NAME = 'Александра Владимировна Смирнова-Кузнецова';

(async () => {
    const browser = await chromium.launch({
        executablePath: await binary.executablePath(), args: binary.args, headless: true,
        env: process.env.CHROMIUM_EXTRA_LIBS ? { ...process.env, LD_LIBRARY_PATH: process.env.CHROMIUM_EXTRA_LIBS } : undefined
    });
    try {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
        await page.goto('http://nav.test/index.html');
        await page.evaluate(html => {
            const parsed = new DOMParser().parseFromString(html, 'text/html');
            parsed.querySelectorAll('script').forEach(el => el.remove());
            document.body.innerHTML = parsed.body.innerHTML;
        }, fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
        await page.addStyleTag({ path: path.join(root, 'css/style.css') });
        // Меряем геометрию, а не анимацию: выезжающее меню живёт за краем
        // экрана и «доезжает» за 0.3s — с транзишенами замеры плавали бы.
        await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;}' });
        for (const script of ['course-config', 'date-range', 'dom', 'format', 'i18n', 'utils']) {
            await page.addScriptTag({ path: path.join(root, 'js', script + '.js') });
        }
        await page.evaluate(longName => {
            currentLang = 'ru';
            localStorage.clear();
            window.db = null;
            currentUser = { uid: 'u-test', email: 'player@test.local' };
            currentUserData = {
                name: longName, firstName: 'Александра', lastName: 'Смирнова-Кузнецова',
                handicap: 14.2, gender: 'women'
            };
            navAuth(currentUser, currentUserData);
            applyNavHeight();
        }, LONG_NAME);

        const report = await page.evaluate(() => {
            const nav = document.getElementById('main-nav');
            const trigger = document.querySelector('.nav-profile-trigger');
            const uname = document.querySelector('.nav-uname');
            const logout = document.querySelector('.nav-logout');
            const sun = document.querySelector('.sun-text');
            const meta = {
                title: (trigger && trigger.getAttribute('title')) || '',
                aria: (trigger && trigger.getAttribute('aria-label')) || '',
                text: (uname && uname.textContent) || ''
            };
            const rect = el => {
                if (!el) return null;
                const r = el.getBoundingClientRect();
                const style = getComputedStyle(el);
                return { w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' };
            };
            return {
                meta,
                nav: rect(nav),
                trigger: rect(trigger),
                uname: uname ? Object.assign(rect(uname), { clipped: uname.scrollWidth > uname.clientWidth + 1 }) : null,
                logout: rect(logout),
                sun: rect(sun),
                viewport: innerWidth,
                overflow: document.documentElement.scrollWidth > innerWidth
            };
        });

        // Полное имя сохраняется, но показывается коротко.
        assert.strictEqual(report.meta.text, 'Александра С.', 'short name "Имя Ф." in the header, got: ' + report.meta.text);
        assert.strictEqual(report.meta.title, LONG_NAME, 'full name stays available as a tooltip');
        assert(report.meta.aria.indexOf(LONG_NAME) !== -1, 'full name stays available for screen readers, got: ' + report.meta.aria);

        for (const width of [320, 360, 390, 430, 768, 1024]) {
            await page.setViewportSize({ width, height: 844 });
            // На телефоне блок пользователя живёт в выезжающем меню — открываем
            // его так же, как это делает бургер, иначе измерять нечего.
            await page.evaluate(() => {
                window.scrollTo({ top: 0, behavior: 'instant' });
                applyNavHeight();
                const menu = document.getElementById('nav-menu');
                // Ровно на 768px CSS ещё показывает бургер (max-width:768px) —
                // значит блок пользователя живёт в меню.
                menu.classList.toggle('open', innerWidth <= 768);
            });
            await page.waitForTimeout(320);
            const geometry = await page.evaluate(() => {
                const nav = document.getElementById('main-nav').getBoundingClientRect();
                const tr = document.querySelector('.nav-profile-trigger').getBoundingClientRect();
                const trigger = { w: tr.width, left: tr.left, right: tr.right };
                const uname = document.querySelector('.nav-uname');
                const visible = el => !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none';
                // Элементы самой строки (без выезжающего меню #nav-menu, которое
                // стоит за краем экрана и «переполняет» прокрутку намеренно).
                const drawerOpen = document.getElementById('nav-menu').classList.contains('open');
                const scope = drawerOpen ? document.getElementById('nav-menu') : document;
                const controls = [scope.querySelector('.nav-profile-trigger'), scope.querySelector('.nav-logout'),
                    scope.querySelector('.sun-mode-btn'), scope.querySelector('.lang-btn'), scope.querySelector('.nav-profile-trigger'),
                    document.getElementById('nav-toggle'), document.querySelector('.nav-brand')].filter(visible);
                const outside = controls.filter(el => {
                    const r = el.getBoundingClientRect();
                    return r.right > innerWidth + 0.5 || r.left < -0.5;
                }).map(el => (el.id || el.className || el.tagName) + ':' + Math.round(el.getBoundingClientRect().right));
                return {
                    navHeight: nav.height,
                    trigger, uname: { w: uname.getBoundingClientRect().width, clipped: uname.scrollWidth > uname.clientWidth + 1 },
                    sun: visible(document.querySelector('.sun-text')),
                    logout: visible(document.querySelector('.nav-logout')),
                    qr: visible(document.getElementById('nav-qr') || document.querySelector('.nav-qr')),
                    switch: visible(document.getElementById('nav-toggle')),
                    outside,
                    overflow: document.documentElement.scrollWidth > innerWidth
                };
            });
            const where = ' @' + width + 'px' + (width <= 768 ? ' (drawer)' : '');
            assert(!geometry.overflow, 'no horizontal page overflow' + where);
            assert.strictEqual(geometry.outside.length, 0, 'header controls stay inside the viewport' + where + ': ' + geometry.outside.join(', '));
            assert(geometry.navHeight > 0 && geometry.navHeight < 80, 'compact single-row header, height=' + geometry.navHeight + where);
            // Блок профиля не забирает больше половины строки и не выходит за экран.
            assert(geometry.trigger.right <= width + 0.5, 'profile block stays inside the viewport' + where);
            const budget = width <= 768 ? 250 - 60 : width * 0.5; // в меню — 290px минус отступы и выход
            assert(geometry.trigger.w <= budget, 'profile block takes <= ' + Math.round(budget) + 'px, got ' + Math.round(geometry.trigger.w) + where);
            if (width <= 768) {
                assert(geometry.switch, 'burger menu stays visible' + where);
                assert(geometry.logout, 'logout stays visible' + where);
                // Текстовую подпись темы прячем только на очень узких экранах.
                if (width > 480) assert(geometry.sun, 'theme label stays visible above 480px' + where);
            } else {
                assert(geometry.uname.w > 0, 'name is rendered in the desktop header' + where);
            }
        }

        // Английский интерфейс: подпись темы и имя не должны ломать строку.
        await page.setViewportSize({ width: 320, height: 844 });
        await page.evaluate(() => {
            currentLang = 'en';
            updateSunModeButtons();
            navAuth(currentUser, currentUserData);
            document.getElementById('nav-menu').classList.add('open');
        });
        const en = await page.evaluate(() => {
            const trigger = document.querySelector('.nav-profile-trigger').getBoundingClientRect();
            return {
                text: document.querySelector('.nav-uname').textContent,
                fits: trigger.right <= innerWidth + 0.5,
                overflow: document.documentElement.scrollWidth > innerWidth
            };
        });
        assert(!!en.text, 'name is still rendered in English UI');
        assert(en.fits && !en.overflow, 'English header fits at 320px');

        // Чувствительность проверки: если в шапку подставить полное имя, блок
        // обязан выйти за отведённую половину строки — иначе измерения выше
        // ничего не проверяют.
        const sensitive = await page.evaluate(() => {
            document.querySelector('.nav-uname').textContent = 'Александра Владимировна Смирнова-Кузнецова';
            const trigger = document.querySelector('.nav-profile-trigger').getBoundingClientRect();
            return { w: trigger.width, limit: innerWidth * 0.5 };
        });
        assert(sensitive.w > sensitive.limit, 'check is sensitive: full name would exceed the header budget (' +
            Math.round(sensitive.w) + ' > ' + Math.round(sensitive.limit) + ')');

        assert.strictEqual(errors.length, 0, 'no page errors: ' + errors.join(' | '));
        console.log('PASS: nav header (6 widths, long name, RU/EN) — short name, tooltip, no overflow');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error('FAIL: ' + (error && error.message ? error.message : error));
    process.exit(1);
});
