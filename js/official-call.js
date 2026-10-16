// js/official-call.js — вызов официального лица (судьи / маршала) на лунку.
//
// callOfficial() была продублирована трижды: live.js (групповой раунд),
// marker.js и scorer.js. Различия сводились к тому, откуда взять раунд и
// игрока (curRid/myUid, mkRid/mkPid, scRid/scPid), к префиксу привязки
// ('group' / 'mk' / 'sc') и к имени, которое уйдёт в оповещение: маркер
// подписывается «Marker (Имя)», игрок — просто именем, групповой раунд
// дополнительно передаёт состав флайта.
//
// Обработчик onSent во всех трёх копиях был одинаков: рассылка в Telegram и
// VK, тост и вибрация. Его и оставляем общим, а данные страница передаёт
// в ctx — так же, как это уже делает requestOfficialCall (там поля hole,
// playerName, flightMembers и canEdit могут быть и значением, и функцией).
//
// Модуль грузится ДО live.js на setup-round.html и ДО marker.js/scorer.js
// на marker.html и scorer.html.
'use strict';

/**
 * Вызвать официальное лицо на лунку игрока.
 *
 * @param {Object} ctx
 * @param {string} ctx.type          'marshal' | 'referee'
 * @param {string} ctx.roundId       id раунда (curRid / mkRid / scRid)
 * @param {string} ctx.playerId      id игрока (myUid / mkPid / scPid)
 * @param {string} ctx.prefix        префикс привязки кнопок ('group'/'mk'/'sc')
 * @param {*} ctx.hole               номер лунки или функция, его возвращающая
 * @param {*} ctx.playerName         имя для оповещения или функция
 * @param {*} [ctx.flightMembers]    состав флайта или функция (групповой раунд)
 * @param {*} [ctx.canEdit]          можно ли редактировать вызов
 * @returns {Promise<boolean>|undefined}
 */
function pestovoCallOfficial(ctx) {
    if (typeof requestOfficialCall !== 'function') return;
    return requestOfficialCall({
        roundId: ctx.roundId,
        playerId: ctx.playerId,
        prefix: ctx.prefix,
        type: ctx.type,
        hole: ctx.hole,
        playerName: ctx.playerName,
        flightMembers: ctx.flightMembers || [],
        canEdit: ctx.canEdit === undefined ? true : ctx.canEdit,
        onSent: function (call) {
            var pName = call.playerName || 'Player';
            var members = call.flightMembers || [];
            if (typeof sendTelegramOfficialAlert === 'function') {
                sendTelegramOfficialAlert(ctx.type, call.hole, pName, members);
            }
            if (typeof sendVKOfficialAlert === 'function') {
                sendVKOfficialAlert(ctx.type, call.hole, pName, members);
            }
            if (typeof toast === 'function' && typeof getOfficialRoleName === 'function') {
                toast('🚨 ' + getOfficialRoleName(ctx.type) +
                    ((typeof currentLang !== 'undefined' && currentLang === 'en')
                        ? ' called to hole ' : ' вызван на лунку ') + call.hole + '!', 'warn');
            }
            if (typeof vib === 'function') vib([100, 50, 100]);
        }
    });
}

if (typeof window !== 'undefined') {
    window.pestovoCallOfficial = pestovoCallOfficial;
}
