// Pure unit tests for the tournament redesign domain layer.
'use strict';
var C = require('../js/tournament-core.js');
var failures = 0, total = 0;
function check(ok, label) { total++; if (!ok) { failures++; console.error('FAIL', label); } else console.log('ok  -', label); }
function eq(a, b, label) { check(JSON.stringify(a) === JSON.stringify(b), label + ' :: ' + JSON.stringify(a)); }

var open = { _key: 't1', name: 'Кубок', status: 'upcoming', date: '2099-09-20', registration: { openAt: '2099-01-01', closeAt: '2099-09-19', limit: 20 } };
eq(C.lifecycleStatus(open, '2099-09-01'), 'registration', 'legacy upcoming maps to registration');
check(C.isRegistrationOpen(open, '2099-09-01'), 'registration window is open');
eq(C.classify(open, '2099-09-21').status, 'closed', 'expired registration becomes closed');
check(C.classify({ lifecycleStatus: 'completed', status: 'completed' }).past, 'completed is past');
// Только что созданный турнир НЕ становится «идёт» сам по себе в день турнира:
// live-статус появляется только после явного старта (кнопкой или автостартом),
// который пишет status/lifecycleStatus в запись.
eq(C.lifecycleStatus({ status: 'upcoming', date: '2099-09-20' }, '2099-09-20T12:00:00'), 'registration', 'created tournament is not auto-live on its date');
eq(C.lifecycleStatus({ status: 'upcoming', lifecycleStatus: 'registration', date: '2099-09-20' }, '2099-09-20T12:00:00'), 'registration', 'wizard tournament is not auto-live on its date');
check(C.isRegistrationOpen({ status: 'upcoming', date: '2099-09-20' }, '2099-09-20T12:00:00'), 'registration stays open on tournament day until start');
eq(C.lifecycleStatus({ status: 'active', date: '2099-09-20' }, '2099-09-20T12:00:00'), 'active', 'explicit start still reads as active');
eq(C.lifecycleStatus({ status: 'upcoming', lifecycleStatus: 'active', date: '2099-09-20' }, '2099-09-20T12:00:00'), 'active', 'auto-start writes lifecycleStatus=active');
check(C.canTransition('registration', 'active'), 'registration → active allowed');
check(!C.canTransition('draft', 'active'), 'draft → active requires registration');
eq(C.transition({ lifecycleStatus: 'active' }, 'completed').patch.status, 'completed', 'active → completed keeps legacy status');
check(!C.transition({ lifecycleStatus: 'draft' }, 'completed').ok, 'invalid transition rejected');

eq(C.validateConfig({}), ['name_required', 'round_date_required', 'scoring_required'], 'empty config validation');
var cfg = { info: { nameRu: 'Cup' }, format: { rounds: [{ date: '2099-09-20' }], regOpen: '2099-01-01', regClose: '2099-09-19' }, scoring: { systems: ['stroke-net'], hcp: { allowancePct: 95 } }, participants: { hcpMin: 0, hcpMax: 36 } };
eq(C.validateConfig(cfg), [], 'valid config');
check(C.validateConfig({ info: { nameRu: 'Cup' }, format: { rounds: [{ date: 'not-a-date' }] }, scoring: { systems: ['stroke-net'] }, participants: { limit: 5001 } }).indexOf('round_date_invalid') !== -1, 'invalid date and participant limit are rejected');
var changes = C.diff({ format: { regOpen: '' } }, { format: { regOpen: '2099-01-01' } });
check(changes.length === 1 && changes[0].path === 'format.regOpen', 'config diff records path');
var audit = C.audit('updated', { uid: 'admin-1' }, changes, { tournamentId: 't1' });
check(audit.by === 'admin-1' && audit.event === 'updated' && audit.tournamentId === 't1', 'audit entry includes actor/event');

var source = { _key: 't1', name: 'Cup', status: 'upcoming', wizard: { format: { rounds: [{ date: '2099-09-20' }], regOpen: '2099-01-01' } }, registeredPlayers: { u1: { name: 'One' } }, waitlist: { u2: { name: 'Two' } } };
var cloned = C.cloneConfig(source, false);
check(cloned.status === 'draft' && cloned.lifecycleStatus === 'draft' && cloned.protocol.state === 'live', 'clone starts as draft');
check(!cloned.registeredPlayers && !cloned.waitlist && cloned.wizard.format.rounds[0].date === '', 'clone without participants strips roster/dates');
var clonedWithRoster = C.cloneConfig(source, true);
check(!!clonedWithRoster.registeredPlayers && clonedWithRoster.clonedFrom === 't1', 'clone with participants preserves roster and origin');

var players = { u1: { uid: 'u1', name: 'Иванов Иван', fieldHcp: 0, handicap: 4, scores: { 1: 3, 2: 4 } }, u2: { uid: 'u2', name: 'Петров Пётр', fieldHcp: 0, handicap: 10, scores: { 1: 5, 2: 5 } } };
var rounds = { r1: { tournamentId: 't1', players: players } };
var board = C.buildLeaderboard({ _key: 't1', formats: ['Stroke Play (Net)'] }, rounds, { holes: [{ num: 1, par: 4, si: 1 }, { num: 2, par: 4, si: 2 }] });
check(board[0].name === 'Иванов Иван' && board[0].holes === 2, 'leaderboard computes net and thru');
check(board[0].position === 1 && board[1].position === 2, 'leaderboard assigns positions');
var grossBoard = C.buildLeaderboard({ _key: 't1', formats: ['Stroke Play (Gross)'] }, rounds, { holes: [{ num: 1, par: 4, si: 1 }, { num: 2, par: 4, si: 2 }] });
check(grossBoard[0].name === 'Иванов Иван' && grossBoard[0].metric === grossBoard[0].gross, 'gross format ranks by gross, not net');
var rows = C.protocolRows({ _key: 't1', formats: ['Stableford'] }, rounds, { holes: [{ num: 1, par: 4, si: 1 }, { num: 2, par: 4, si: 2 }] });
check(rows[0].stableford != null && Array.isArray(rows[0].holes), 'protocol row has totals and hole breakdown');
check(C.applyHcpCut(18.4, 'men', { enabled: true, percent: 80, maxEnabled: true, maxMen: 12 }).effective === 12, 'handicap cut applies percent then maximum');
var tieRounds = { r1: { tournamentId: 'tie', players: {
    x: { uid: 'x', name: 'X', fieldHcp: 0, scores: { 1: 4, 2: 4, 3: 3 } },
    y: { uid: 'y', name: 'Y', fieldHcp: 0, scores: { 1: 3, 2: 4, 3: 4 } }
} } };
var tieBoard = C.buildLeaderboard({ _key: 'tie', formats: ['Stroke Play (Net)'], wizard: { scoring: { tieBreaks: ['countback'] } } }, tieRounds, { holes: [{ num: 1, par: 4, si: 1 }, { num: 2, par: 4, si: 2 }, { num: 3, par: 4, si: 3 }] });
check(tieBoard[0].name === 'X' && tieBoard[0].position === 1 && tieBoard[1].position === 2, 'countback resolves equal totals');
var statusBoard = C.buildLeaderboard({ _key: 'status', formats: ['Stroke Play (Net)'], registeredPlayers: { dns: { uid: 'dns', name: 'DNS Player', status: 'DNS' } } }, { r1: { tournamentId: 'status', players: {} } }, { holes: [{ num: 1, par: 4, si: 1 }] });
check(statusBoard.length === 1 && statusBoard[0].status === 'DNS' && statusBoard[0].position === null, 'protocol retains DNS status without score');
check(C.csv(rows).indexOf('\ufeffposition;name;') === 0 && C.csv(rows).indexOf('Иванов') !== -1, 'CSV has Excel BOM and player');
var protocolFixed = C.protocolSnapshot({ protocol: { version: 2, state: 'live' } }, rows, { uid: 'admin-1' });
check(protocolFixed.version === 3 && protocolFixed.state === 'fixed' && protocolFixed.rows.length === rows.length, 'protocol snapshot increments version');
check(C.protocolTransition({ protocol: protocolFixed }, 'published', { uid: 'admin-1' }).ok, 'fixed protocol can be published');
check(!C.protocolTransition({ protocol: { state: 'live' } }, 'published', { uid: 'admin-1' }).ok, 'live protocol cannot skip fixation');
var nominations = C.buildNominations(rows, ['best-net']);
check(nominations.length === 1 && nominations[0].winners.length > 0 && nominations[0].winners[0].name === 'Иванов Иван', 'protocol nominations select top net players');

console.log('\n' + total + ' checks, failures: ' + failures);
process.exit(failures ? 1 : 0);
