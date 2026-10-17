'use strict';
// functions/paging.js — постраничный обход детей узла Realtime Database.
//
// Зачем. Полное `db.ref('rounds').once('value')` грузит всё дерево (раунды со
// всеми игроками и счетами) в память одного экземпляра Cloud Function. При
// 256 МБ по умолчанию это вопрос времени, а платим мы за это на каждом
// ежедневном прогоне (docs/CODE-AUDIT-2026-10-2.md, находка 8). Страницы
// держат пиковое потребление памяти постоянным; суммарный объём чтения
// остаётся прежним — RTDB не умеет «только ключи».
//
// Вынесено в отдельный модуль, чтобы обход можно было покрыть тестом
// (tools/test-score-audit.js инжектит его в createScoreAudit).

/**
 * @param {{ref: function(string=): Object}} db объект с методом ref()
 * @returns {function(string, number, function(string, *): (Promise|void)): Promise<void>}
 *          (path, pageSize, handler) — вызывает handler(key, value) для каждого
 *          ребёнка, постранично по ключу.
 */
function createChildPager(db) {
    return async function forEachChildPage(path, pageSize, handler) {
        const size = Math.max(1, pageSize || 100);
        let after = null;
        for (;;) {
            const query = after === null
                ? db.ref(path).orderByKey().limitToFirst(size)
                : db.ref(path).orderByKey().startAfter(after).limitToFirst(size);
            const value = (await query.get()).val() || {};
            const keys = Object.keys(value);
            if (!keys.length) return;
            for (const key of keys) await handler(key, value[key]);
            if (keys.length < size) return;
            after = keys[keys.length - 1];
        }
    };
}

module.exports = { createChildPager };
