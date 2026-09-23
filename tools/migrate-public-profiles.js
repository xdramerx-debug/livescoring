#!/usr/bin/env node
/**
 * Одноразовая миграция: users/<uid> → usersPublic/<uid>.
 *
 * Создаёт публичное зеркало профилей (без email, phone, history, role, admin).
 * Нужно выполнить ОДИН раз до деплоя новых database.rules.json, чтобы страницы
 * игроков (ростер, автокомплит, статистика) сразу видели usersPublic.
 *
 * Запуск (firebase-admin берётся из functions/node_modules):
 *   cd functions && npm install
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     DATABASE_URL="https://<proj>-default-rtdb.firebaseio.com" \
 *     node ../tools/migrate-public-profiles.js
 *
 * Скрипт идемпотентный: существующие usersPublic/<uid> обновляются теми же
 * публичными полями; записи с пустым именем пропускаются.
 */
'use strict';

const path = require('path');
const fs = require('fs');

function requireAdmin() {
    try {
        return require('firebase-admin');
    } catch (e) {
        const p = path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin');
        if (fs.existsSync(p)) return require(p);
        console.error('firebase-admin не найден. Выполните: cd functions && npm install');
        process.exit(1);
    }
}

const PUB_FIELDS = ['name', 'firstName', 'lastName', 'middleName', 'gender', 'handicap', 'exactHcp',
    'defaultTee', 'isGuest', 'deleted', 'deletedAt', 'createdAt', 'roundsPlayed',
    'bestGross', 'bestStableford', 'hcpUpdatedAt', 'hcpSource'];

function pubFromUser(u) {
    const out = {};
    PUB_FIELDS.forEach((f) => { if (u && u[f] !== undefined) out[f] = u[f]; });
    const digits = String((u && u.phone) || '').replace(/\D/g, '');
    if (digits.length >= 4) out.phoneLast4 = digits.slice(-4);
    return out;
}

async function main() {
    const admin = requireAdmin();
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error('Укажите DATABASE_URL (https://<proj>-default-rtdb.firebaseio.com)');
        process.exit(1);
    }
    admin.initializeApp({ credential: admin.credential.applicationDefault(), databaseURL: url });
    const db = admin.database();

    const [usersSn, pubSn] = await Promise.all([
        db.ref('users').once('value'),
        db.ref('usersPublic').once('value'),
    ]);
    const users = usersSn.val() || {};
    const cur = pubSn.val() || {};

    const updates = {};
    let mirrored = 0, skipped = 0;
    Object.keys(users).forEach((uid) => {
        const u = users[uid];
        if (!u || typeof u !== 'object' || !u.name) { skipped++; return; }
        const pub = pubFromUser(u);
        const old = cur[uid];
        const changed = !old || Object.keys(pub).some((f) => JSON.stringify(old[f]) !== JSON.stringify(pub[f]));
        if (changed) { updates['usersPublic/' + uid] = pub; mirrored++; }
    });
    // Профили, исчезнувшие из users, из зеркала удаляем.
    Object.keys(cur).forEach((uid) => {
        if (!users[uid] || !users[uid].name) updates['usersPublic/' + uid] = null;
    });

    const keys = Object.keys(updates);
    console.log(`users: ${Object.keys(users).length}, к записи: ${keys.length} (зеркалится ${mirrored}, без имени пропущено ${skipped})`);
    for (let i = 0; i < keys.length; i += 200) {
        const chunk = {};
        keys.slice(i, i + 200).forEach((k) => { chunk[k] = updates[k]; });
        await db.ref().update(chunk);
        console.log(`  записано ${Math.min(i + 200, keys.length)}/${keys.length}`);
    }
    console.log('Готово. Теперь можно деплоить новые rules (users только owner/admin/master).');
    process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
