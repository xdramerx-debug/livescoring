'use strict';
/*
 * tools/test-functions-deps.js — страховка серверных зависимостей functions/.
 *
 * Почему отдельный тест: Cloud Functions не покрыты CI (там ставится только
 * корневой package-lock.json), а живут на firebase-admin и firebase-functions.
 * Ошибка в этой паре не ловится ни одним браузерным прогоном: функция просто
 * не задеплоится или молча начнёт работать по-другому. Проверяем то, что
 * видно по файлам в репозитории.
 *
 * Что ловит:
 *
 * 1. Смену мажора Admin SDK без правки кода. В firebase-admin 14 убраны
 *    пространства имён: `admin.database()` и `admin.auth()` больше не
 *    существуют, вместо них `getDatabase()` / `getAuth()` из подпутей
 *    firebase-admin/database и firebase-admin/auth. Тест сверяет мажорную
 *    версию из functions/package-lock.json со стилем вызовов в
 *    functions/index.js — так слепое обновление не пройдёт мимо.
 *
 * 2. Неверный импорт firebase-functions. С 6-й версии корневой экспорт
 *    (`require('firebase-functions')`) — это v2 API с другим синтаксисом
 *    триггеров; v1 живёт в подпути firebase-functions/v1. Переход на корневой
 *    импорт не падает на этапе установки, а меняет семантику онлайн-вызовов.
 *
 * 3. Рассинхрон package.json и package-lock.json: правила репозитория требуют
 *    `npm ci` (детерминированную установку), а он падает, если манифест и
 *    локфайл разошлись.
 *
 * 4. Несовместимость с рантаймом: у firebase-admin есть engines.node, а
 *    версия рантайма при деплое берётся из functions/package.json
 *    (engines.node). Обновление, которое требует Node свежее объявленного,
 *    должно упасть здесь, а не на `firebase deploy`.
 *
 * 5. Загрузка модуля целиком — если functions/node_modules установлен
 *    (локально; в CI каталога нет и проверка пропускается). Это ловит именно
 *    то, что ловит прод: initializeApp, все require, регистрация триггеров.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FN = path.join(ROOT, 'functions');
const INDEX = path.join(FN, 'index.js');
const MANIFEST = path.join(FN, 'package.json');
const LOCK = path.join(FN, 'package-lock.json');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
const indexSrc = fs.readFileSync(INDEX, 'utf8');

function lockedVersion(name) {
    const pkg = lock.packages && lock.packages['node_modules/' + name];
    assert.ok(pkg, 'functions/package-lock.json: нет пакета ' + name);
    assert.ok(/^\d+\.\d+\.\d+/.test(pkg.version), name + ': не semver — ' + pkg.version);
    return pkg.version;
}
const major = (v) => Number(v.split('.')[0]);

const adminVersion = lockedVersion('firebase-admin');
const fnVersion = lockedVersion('firebase-functions');

// ── 1. Мажор Admin SDK ↔ стиль вызовов в functions/index.js ───────────────
const usesNamespaces = /admin\.(database|auth)\s*\(/.test(indexSrc);
const usesNamed = /require\('firebase-admin\/database'\)/.test(indexSrc) &&
    /require\('firebase-admin\/auth'\)/.test(indexSrc);
const adminMajor = major(adminVersion);

if (adminMajor >= 14) {
    assert.deepStrictEqual(usesNamespaces, false,
        'firebase-admin ' + adminVersion + ': admin.database()/admin.auth() удалены в 14.x — ' +
        'нужны getDatabase()/getAuth() из firebase-admin/database и firebase-admin/auth');
    assert.ok(usesNamed,
        'firebase-admin ' + adminVersion + ': в functions/index.js нет именованных импортов ' +
        'getDatabase/getAuth — модуль упадёт на require при деплое');
} else {
    assert.ok(usesNamespaces,
        'firebase-admin ' + adminVersion + ': в functions/index.js нет вызовов admin.database()/admin.auth() — ' +
        'проверь, что база и авторизация действительно подключены');
    assert.deepStrictEqual(usesNamed, false,
        'firebase-admin ' + adminVersion + ': именованные импорты firebase-admin/database и ' +
        'firebase-admin/auth появились только в 14.x');
}
assert.ok(/admin\.initializeApp\s*\(/.test(indexSrc),
    'functions/index.js: нет admin.initializeApp() — Admin SDK не инициализирован');

// ── 2. Импорт firebase-functions строго из подпути v1 ─────────────────────
assert.ok(/require\('firebase-functions\/v1'\)/.test(indexSrc),
    'functions/index.js: firebase-functions должен подключаться как firebase-functions/v1 — ' +
    'корневой экспорт с 6.x это v2 API с другой формой триггеров');
assert.strictEqual(
    /require\('firebase-functions'\)/.test(indexSrc), false,
    'functions/index.js: импорт firebase-functions без /v1 молча переключает триггеры на v2 API');
assert.ok(/functions\.(https|database|runWith|logger)/.test(indexSrc),
    'functions/index.js: firebase-functions подключён, но ни один API не используется');

// ── 3. Манифест и локфайл не разошлись ────────────────────────────────────
assert.deepStrictEqual(
    (lock.packages && lock.packages[''] && lock.packages[''].dependencies) || {},
    manifest.dependencies || {},
    'functions/package.json разошёлся с functions/package-lock.json — npm ci упадёт');
{
    // Диапазон из манифеста должен покрывать залоченную версию (без semver:
    // диапазоны в этом файле только каретные).
    const bad = [];
    Object.keys(manifest.dependencies).forEach((name) => {
        const range = manifest.dependencies[name];
        const m = /^\^(\d+)\.\d+\.\d+/.exec(range);
        assert.ok(m, name + ': диапазон в functions/package.json должен быть каретным, а не ' + range);
        if (major(lockedVersion(name)) !== Number(m[1])) bad.push(name + ': ' + range + ' ≠ ' + lockedVersion(name));
    });
    assert.deepStrictEqual(bad, [], 'functions/package.json не покрывает залоченные версии:\n  ' + bad.join('\n  '));
}

// ── 4. Рантайм: engines.node манифеста не старше требований пакетов ───────
{
    const declared = String((manifest.engines && manifest.engines.node) || '').replace(/\D+/g, '');
    assert.ok(declared, 'functions/package.json: не указан engines.node — версия рантайма при деплое будет взята по умолчанию');
    const need = [];
    ['firebase-admin', 'firebase-functions'].forEach((name) => {
        const pkg = lock.packages['node_modules/' + name];
        const want = String((pkg.engines && pkg.engines.node) || '').replace(/[^0-9.]/g, '');
        const min = Math.max.apply(null, want.split('.').map(Number).concat(0));
        if (min && Number(declared) < min) {
            need.push(name + '@' + pkg.version + ' требует Node >=' + min + ', а объявлен Node ' + declared);
        }
    });
    assert.deepStrictEqual(need, [], 'functions деплоятся на Node ' + declared + ', этого мало:\n  ' + need.join('\n  '));
}

// ── 5. Загрузка модуля (только если зависимости установлены) ──────────────
const requiredExports = [
    'tournamentMasterSignIn', 'wipeAllData', 'vapidSetup', 'onBroadcastCreated', 'onAlertCreated'
];
let loaded = 'пропущено (functions/node_modules не установлен)';
if (fs.existsSync(path.join(FN, 'node_modules', 'firebase-admin'))) {
    // Поддельный service account: инициализация Admin SDK не ходит в сеть, а
    // credential читается из файла. Ключ одноразовый, в репозиторий не попадает.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pestovo-fn-'));
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' }
    });
    const saFile = path.join(dir, 'service-account.json');
    fs.writeFileSync(saFile, JSON.stringify({
        type: 'service_account',
        project_id: 'pestovo-functions-test',
        private_key_id: 'test',
        private_key: privateKey,
        client_email: 'test@pestovo-functions-test.iam.gserviceaccount.com',
        client_id: '0',
        token_uri: 'https://oauth2.googleapis.com/token'
    }));

    const probe = 'var m = require(' + JSON.stringify(INDEX) + ');' +
        'var miss = ' + JSON.stringify(requiredExports) + '.filter(function (n) { return !m[n]; });' +
        'if (miss.length) { console.error("FAIL", miss.join(",")); process.exit(1); }' +
        'console.log(Object.keys(m).length);';
    const res = spawnSync(process.execPath, ['-e', probe], {
        cwd: ROOT,
        encoding: 'utf8',
        env: Object.assign({}, process.env, {
            FUNCTIONS_EMULATOR: 'false',
            GOOGLE_APPLICATION_CREDENTIALS: saFile,
            FIREBASE_CONFIG: JSON.stringify({
                projectId: 'pestovo-functions-test',
                databaseURL: 'https://pestovo-functions-test-default-rtdb.europe-west1.firebasedatabase.app'
            })
        })
    });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.strictEqual(res.status, 0,
        'functions/index.js не загружается с firebase-admin ' + adminVersion + ':\n' +
        String(res.stdout || '') + String(res.stderr || ''));
    loaded = 'модуль загружен, экспортов: ' + String(res.stdout || '').trim();
}

console.log('Functions deps: firebase-admin ' + adminVersion +
    ' (мажор ' + adminMajor + ', API ' + (adminMajor >= 14 ? 'модульный' : 'namespace') + '), ' +
    'firebase-functions ' + fnVersion + ' (v1), web-push ' + lockedVersion('web-push') +
    ', Node ' + manifest.engines.node + '; ' + loaded);
