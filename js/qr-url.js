// js/qr-url.js — построение URL картинки QR.
//
// Реализация была продублирована четырежды и разошлась только значениями
// по умолчанию:
//   js/utils.js       qrUrl(data)              — размер 200, без поля;
//   js/qr-start.js    qrUrl(data, size)        — размер 420, поле 4 (+ список
//                                                провайдеров для подмены при
//                                                ошибке загрузки);
//   js/tn-mgr-core.js qrImageUrl(payload,size) — размер 320, поле 2;
//   js/tn-mgr-io.js   qrUrl(payload, size)     — поверх предыдущей.
//
// Логика во всех копиях одна: сначала локальный генератор (PestovoQr.dataUrl —
// работает офлайн и без внешнего запроса), иначе удалённый сервис. Общей
// делаем её, а размер и поле оставляем на стороне вызывающего: это не
// расхождение в логике, а настройки места вызова (карточка печати, QR старта,
// приглашение в раунд).
//
// Модуль грузится ДО utils.js / qr-start.js / tn-mgr-*.js на страницах
// qr-start.html, admin.html и setup-round.html.
'use strict';

/**
 * Список удалённых провайдеров QR, в порядке опробования.
 * Нужен странице старта: если картинка не загрузилась, она берёт следующий URL.
 *
 * @param {string} data содержимое QR
 * @param {number} [size] сторона картинки в пикселях (по умолчанию 420)
 * @returns {string[]}
 */
function pestovoQrProviders(data, size) {
    var px = parseInt(size, 10) || 420;
    var e = encodeURIComponent(data);
    return [
        'https://api.qrserver.com/v1/create-qr-code/?size=' + px + 'x' + px + '&margin=4&data=' + e,
        'https://quickchart.io/qr?size=' + px + '&margin=1&text=' + e,
        'https://api.qrserver.com/v1/create-qr-code/?size=' + px + 'x' + px + '&margin=2&color=111111&bgcolor=ffffff&data=' + e
    ];
}

/**
 * Картинка QR, сгенерированная на месте (без обращения к сети).
 *
 * @param {string} data содержимое QR
 * @param {number} size сторона картинки в пикселях
 * @returns {string} data-URL либо '' — если локального генератора нет
 */
function pestovoQrLocalDataUrl(data, size) {
    // Обращение только под проверкой: страница без QR-стека (js/qr-code.js
    // подключён на четырёх страницах из шестнадцати) должна деградировать до
    // внешнего генератора, а не падать — это проверяет test-qr-vendor-scope.
    var qr = (typeof window !== 'undefined' && window.PestovoQr && typeof window.PestovoQr.dataUrl === 'function')
        ? window.PestovoQr
        : (typeof PestovoQr !== 'undefined' && PestovoQr && typeof PestovoQr.dataUrl === 'function' ? PestovoQr : null);
    if (!qr) return '';
    var local = qr.dataUrl(data, size);
    return local || '';
}

/**
 * URL картинки QR: локальная генерация либо удалённый сервис.
 *
 * @param {string} data   содержимое QR
 * @param {number} [size]   сторона картинки в пикселях (по умолчанию 420)
 * @param {number} [margin] поле вокруг кода; если не задано — параметр
 *                          в URL не уходит (так было в js/utils.js)
 * @returns {string}
 */
function pestovoQrImageUrl(data, size, margin) {
    var px = parseInt(size, 10) || 420;
    var local = pestovoQrLocalDataUrl(data, px);
    if (local) return local;
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + px + 'x' + px +
        (margin == null ? '' : '&margin=' + margin) +
        '&data=' + encodeURIComponent(data);
}

if (typeof window !== 'undefined') {
    window.pestovoQrProviders = pestovoQrProviders;
    window.pestovoQrLocalDataUrl = pestovoQrLocalDataUrl;
    window.pestovoQrImageUrl = pestovoQrImageUrl;
}
