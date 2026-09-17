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
check(C.canTransition('registration', 'active'), 'registration → active allowed');
check(!C.canTransition('draft', 'active'), 'draft → active requires registration');
eq(C.transition({ lifecycleStatus: 'active' }, 'completed').patch.status, 'completed', 'active → completed keeps legacy status');
check(!C.transition({ lifecycleStatus: 'draft' }, 'completed').ok, 'invalid transition rejected');

eq(C.validateConfig({}), ['name_required', 'round_date_required', 'scoring_required'], 'empty config validation');
var cfg = { info: { nameRu: 'Cup' }, format: { rounds: [{ date: '2099-09-20' }], regOpen: '2099-01-01', regClose: '2099-09-19' }, scoring: { systems: ['stroke-net'], hcp: { allowancePct: 95 } }, participants: { hcpMin: 0, hcpMax: 36 } };
eq(C.validateConfig(cfg), [], 'valid config');
var changes = C.diff({ format: { regOpen: '' } }, { format: { regOpen: '2099-01-01' } });
check(changes.length === 1 && changes[0].path === 'format.regOpen', 'config diff records path');
var audit = C.audit('updated', { uid: 'admin-1' }, changes, { tournamentId: 't1' });
check(audit.by === 'admin-1' && audit.event === 'updated' && audit.tournamentId === 't1', 'audit entry includes actor/event');

var source = { _key: 't1', name: 'Cup', status: 'upcoming', wizard: { format: { rounds: [{ date: '2099-09-20' }], regOpen: '2099-01-01' } }, registeredPlayers: { u1: { name: 'One' } }, waitlist: { u2: { name: 'Two' } } };
var cloned = C.cloneConfig(source, false);
check(cloned.status === 'draft' && cloned.lifecycleStatus === 'draft', 'clone starts as draft');
check(!cloned.registeredPlayers && !cloned.waitlist && cloned.wizard.format.rounds[0].date === '', 'clone without participants strips roster/dates');
var clonedWithRoster = C.cloneConfig(source, true);
check(!!clonedWithRoster.registeredPlayers && clonedWithRoster.clonedFrom === 't1', 'clone with participants preserves roster and origin');

var players = { u1: { uid: 'u1', name: 'Иванов Иван', fieldHcp: 0, handicap: 4, scores: { 1: 3, 2: 4 } }, u2: { uid: 'u2', name: 'Петров Пётр', fieldHcp: 0, handicap: 10, scores: { 1: 5, 2: 5 } } };
var rounds = { r1: { tournamentId: 't1', players: players } };
var board = C.buildLeaderboard({ _key: 't1', formats: ['Stroke Play (Net)'] }, rounds, { holes: [{ num: 1, par: 4, si: 1 }, { num: 2, par: 4, si: 2 }] });
check(board[0].name === 'Иванов Иван' && board[0].holes === 2, 'leaderboard computes net and thru');
check(board[0].position === 1 && board[1].position === 2, 'leaderboard assigns positions');
var rows = C.protocolRows({ _key: 't1', formats: ['Stableford'] }, rounds, { holes: [{ num: 1, par: 4, si: 1 }, { num: 2, par: 4, si: 2 }] });
check(rows[0].stableford != null && Array.isArray(rows[0].holes), 'protocol row has totals and hole breakdown');
check(C.csv(rows).indexOf('\ufeffposition;name;') === 0 && C.csv(rows).indexOf('Иванов') !== -1, 'CSV has Excel BOM and player');

console.log('\n' + total + ' checks, failures: ' + failures);
process.exit(failures ? 1 : 0);
