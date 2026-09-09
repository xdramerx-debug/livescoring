// Регрессии: QR → ввод счёта, баннер турнира, блок «Активный турнир» на главной.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(cond, label) {
    if (!cond) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}

const utils = fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const live = fs.readFileSync(path.join(ROOT, 'js', 'live.js'), 'utf8');
const scorer = fs.readFileSync(path.join(ROOT, 'js', 'scorer.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const setupHtml = fs.readFileSync(path.join(ROOT, 'setup-round.html'), 'utf8');
const scorerHtml = fs.readFileSync(path.join(ROOT, 'scorer.html'), 'utf8');
const qr = fs.readFileSync(path.join(ROOT, 'js', 'qr-start.js'), 'utf8');
const startAdmin = fs.readFileSync(path.join(ROOT, 'js', 'start-admin.js'), 'utf8');
const auth = fs.readFileSync(path.join(ROOT, 'js', 'auth.js'), 'utf8');
const admin = fs.readFileSync(path.join(ROOT, 'js', 'admin.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');

check(utils.indexOf("sec_active_tournament: 'Активный турнир'") !== -1, 'i18n ru: sec_active_tournament');
check(utils.indexOf("sec_active_tournament: 'Active tournament'") !== -1, 'i18n en: sec_active_tournament');
check(utils.indexOf('function roundTournamentName') !== -1, 'utils: roundTournamentName');
check(utils.indexOf('function isTournamentRound') !== -1, 'utils: isTournamentRound');
check(utils.indexOf('function updateRoundEventBanner') !== -1, 'utils: updateRoundEventBanner');

check(indexHtml.indexOf('id="active-tournament-section"') !== -1, 'index: секция активного турнира');
check(indexHtml.indexOf('id="live-tournament-rounds"') !== -1, 'index: контейнер турнирных раундов');
check(app.indexOf('live-tournament-rounds') !== -1, 'app: заполняет live-tournament-rounds');
check(app.indexOf('isTournamentRound') !== -1, 'app: делит live/tournament');
check(app.indexOf('roundTournamentName') !== -1, 'app: строка группы = название турнира');
check(app.indexOf('setup-round.html?round=') !== -1, 'app: редирект с ?round= на setup-round');

check(live.indexOf('updateRoundEventBanner') !== -1, 'live: баннер турнира на групповой карточке');
check(live.indexOf(".get('as')") !== -1, 'live: читает as из URL');
check(scorer.indexOf('roundTournamentName') !== -1, 'scorer: заголовок = название турнира');
check(setupHtml.indexOf('id="round-event-banner"') !== -1, 'setup-round: баннер в разметке');
check(scorerHtml.indexOf('id="round-event-banner"') !== -1, 'scorer: баннер в разметке');

check(qr.indexOf('setup-round.html') !== -1 && qr.indexOf('as=') !== -1, 'QR группы → setup-round?as');
check(qr.indexOf('scorer.html') !== -1 && qr.indexOf('player=') !== -1, 'QR соло → scorer.html?player');
check(startAdmin.indexOf('tournamentName: proto.tournamentName') !== -1, 'start-admin: tournamentName в roundData');
check(startAdmin.indexOf("sets['rounds/' + rid + '/tournamentName']") !== -1, 'start-admin: tournamentName при сохранении правок');
check(startAdmin.indexOf('psAttachPlayerAutofill') !== -1, 'start-admin: автоподбор ФИО');
check(auth.indexOf("searchInputId: 'reg-name'") !== -1, 'auth: автоподбор #reg-name');
check(admin.indexOf("searchInputId: 'adm-new-name'") !== -1, 'admin: автоподбор #adm-new-name');

const m = utils.match(/function roundTournamentName[\s\S]*?\nfunction isTournamentRound[\s\S]*?\nfunction updateRoundEventBanner[\s\S]*?\n\}/);
check(!!m, 'utils: функции турнира извлечены');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(m[0] + '\nthis.roundTournamentName = roundTournamentName;\nthis.isTournamentRound = isTournamentRound;', sandbox);

check(sandbox.roundTournamentName({ tournamentName: 'Кубок Пестово' }) === 'Кубок Пестово', 'roundTournamentName: явное имя');
check(sandbox.roundTournamentName({ protocolName: 'Кубок Пестово · старт' }) === 'Кубок Пестово', 'roundTournamentName: суффикс «старт» срезается');
check(sandbox.roundTournamentName({ protocolName: 'Open · start' }) === 'Open', 'roundTournamentName: суффикс start');
check(sandbox.isTournamentRound({ tournamentId: 't1' }) === true, 'isTournamentRound: tournamentId');
check(sandbox.isTournamentRound({ protocolId: 'pr1' }) === true, 'isTournamentRound: protocolId');
check(sandbox.isTournamentRound({ mode: 'group' }) === false, 'isTournamentRound: обычная группа');

check(setupHtml.indexOf('score-kiosk') !== -1, 'setup-round: ранний класс score-kiosk');
check(scorerHtml.indexOf('score-kiosk') !== -1, 'scorer: ранний класс score-kiosk');
check(css.indexOf('html.score-kiosk') !== -1, 'css: kiosk прячет шапку/меню');
check(live.indexOf('function applyScoreKiosk') !== -1 && scorer.indexOf('function applyScoreKiosk') !== -1, 'live/scorer: applyScoreKiosk');
check(live.indexOf('if (p.isCreator) return true') !== -1, 'join: isCreator');
check(live.indexOf('creatorPlayerId') !== -1 && live.indexOf('p.joined === true') !== -1, 'join: creatorPlayerId / joined');
check(live.indexOf('participantsList[0]') === -1 || live.indexOf('НЕ считаются') !== -1, 'join: participantsList[0] не даёт «В игре»');
const scBody = scorerHtml.slice(scorerHtml.indexOf('id="sc-body"'));
check(scBody.indexOf('hole-display') < scBody.indexOf('call_referee'), 'scorer: блок счёта выше вызова судьи');

const joinStart = live.indexOf('function isPlayerEnteredRound');
const joinEnd = live.indexOf('\nfunction countJoinedPlayers');
check(joinStart !== -1 && joinEnd > joinStart, 'live: isPlayerEnteredRound извлечена');
const joinBox = { console };
vm.createContext(joinBox);
vm.runInContext(live.slice(joinStart, joinEnd) + '\nthis.isPlayerEnteredRound = isPlayerEnteredRound;', joinBox);
check(joinBox.isPlayerEnteredRound({ isCreator: true }, 'p1', {}) === true, 'join: создатель ручной группы — в игре');
check(joinBox.isPlayerEnteredRound({}, 'p0', { creatorPlayerId: 'p0' }) === true, 'join: creatorPlayerId — в игре');
check(joinBox.isPlayerEnteredRound({ joined: true }, 'p2', {}) === true, 'join: joined после QR');
check(joinBox.isPlayerEnteredRound({}, 'p0', { createdBy: 'admin', participantsList: ['p0'] }) === false, 'join: админ/первый в протоколе без QR — не в игре');
check(joinBox.isPlayerEnteredRound({}, 'p3', { createdBy: 'admin' }) === false, 'join: createdBy админа не считается входом');

console.log(failures ? '\n' + failures + ' FAILURES' : '\nAll tournament/live tests passed ✔');
process.exit(failures ? 1 : 0);
