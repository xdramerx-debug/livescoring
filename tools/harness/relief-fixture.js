'use strict';
// Serve real markup/assets under a Pages-like subpath, with no live data or writes.
const fs = require('fs');
const path = require('path');
const { FIREBASE_STUB } = require('../browser-check');

const ROOT = path.join(__dirname, '../..');
const BASE = 'http://relief.test/livescoring/';

async function attachFixture(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(FIREBASE_STUB);
    await page.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith('https://api.open-meteo.com/')) {
            return route.fulfill({ json: { current: { temperature_2m: 16, weather_code: 1, wind_speed_10m: 3, wind_direction_10m: 90 } } });
        }
        if (!url.startsWith(BASE)) return route.abort();
        const relative = new URL(url).pathname.slice('/livescoring/'.length);
        if (/^js\/vendor\/firebase-[^/]+\.js$/.test(relative)) {
            return route.fulfill({ body: '/* offline Firebase fixture */', contentType: 'application/javascript' });
        }
        const file = path.join(ROOT, relative);
        if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            errors.push('Missing asset: ' + url);
            return route.abort();
        }
        return route.fulfill({ path: file });
    });
    return errors;
}

module.exports = { attachFixture, BASE };
