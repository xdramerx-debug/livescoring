// Проверка прав на завершение счётной карточки участником (database.rules.json).
// Раньше закрыть карточку мог только создатель раунда (правило rounds/$rid.Write
// = createdBy === auth.uid), поэтому остальные участники получали отказ
// «Не удалось завершить раунд». Теперь карточка пишется отдельным узлом
// finishedPlayers/<uid> (её вправе сдать любой игрок раунда), а статус раунда —
// отдельной записью и только когда сдали все. Тест фиксирует обе части: и
// новые разрешения, и то, что корневой грант создателя не ослаблен.
// Запуск: node tools/test-round-finish-rules.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules;
const rid = rules.rounds['$rid'];
let failures = 0;
function check(cond, label) {
    if (cond) console.log('ok  -', label);
    else { failures++; console.error('FAIL', label); }
}

const roundWrite = rid['.write'] || '';
check(roundWrite.indexOf("newData.child('createdBy').val() === auth.uid") !== -1,
    'закрытие раунда в целом по-прежнему требует быть создателем (грант не ослаблен)');
check(roundWrite.indexOf("admin") !== -1, 'судья/админ сохраняет доступ к раунду');

// ── Своя карточка: любой игрок раунда, но только за себя ──────────────────
const own = rid.finishedPlayers && rid.finishedPlayers['$pid'] || {};
const ownWrite = own['.write'] || '';
check(!!ownWrite, 'finishedPlayers/$pid имеет собственное правило записи');
check(ownWrite.indexOf('auth.uid == $pid') !== -1, 'карточку сдаёт её владелец (auth.uid == $pid)');
check(ownWrite.indexOf("child('players').child($pid).exists()") !== -1, 'сдавать карточку может только игрок этого раунда');
check(ownWrite.indexOf('createdBy') === -1, 'права на карточку НЕ зависят от того, кто создал раунд');
check((own['.validate'] || '').indexOf("hasChild('at')") !== -1, 'карточка хранит отметку времени (at)');

// ── Статус раунда: отдельная запись и только когда сдали все ──────────────
const statusWrite = (rid.status && rid.status['.write']) || '';
check(!!statusWrite, 'status имеет собственное правило записи');
check(statusWrite.indexOf("numChildren() === root.child('rounds').child($rid).child('players').numChildren()") !== -1,
    'раунд закрывается только когда отметок в finishedPlayers столько же, сколько игроков');
check(statusWrite.indexOf("newData.val() === 'completed'") !== -1, 'участник может поставить только status=completed');
check(statusWrite.indexOf("child('players').child(auth.uid).exists()") !== -1, 'закрывать раунд может только его участник');

const completedBy = (rid.completedBy && rid.completedBy['.write']) || '';
check(completedBy.indexOf('newData.val() === auth.uid') !== -1, 'completedBy — только собственный uid');
const completedAt = (rid.completedAt && rid.completedAt['.write']) || '';
check(completedAt.indexOf("child('players').child(auth.uid).exists()") !== -1, 'completedAt пишет участник раунда');
const completedByName = (rid.completedByName && rid.completedByName['.write']) || '';
check(completedByName.indexOf('isString()') !== -1 && completedByName.indexOf('length <= 120') !== -1,
    'completedByName — строка ограниченной длины');
const historyRecorded = (rid.historyRecorded && rid.historyRecorded['.write']) || '';
check(historyRecorded.indexOf("numChildren() === root") !== -1, 'historyRecorded пишется только при полном завершении');

// ── Частичное/досрочное завершение ────────────────────────────────────────
const partial = (rid.partialFinish && rid.partialFinish['.write']) || '';
check(partial.indexOf('newData.val() === true') !== -1, 'partialFinish — только true и только игроком раунда');
const forced = (rid.forcedFinish && rid.forcedFinish['.write']) || '';
check(forced.indexOf('newData.val() === true') !== -1, 'forcedFinish — только true и только игроком раунда');
const forcedReason = (rid.forcedReason && rid.forcedReason['.write']) || '';
check(forcedReason.indexOf('length <= 200') !== -1, 'forcedReason — строка ограниченной длины');
const autoCompleted = (rid.autoCompleted && rid.autoCompleted['.write']) || '';
check(autoCompleted.indexOf('newData.val() === false') !== -1, 'участник не может выдать автозакрытие за своё (autoCompleted=true закрыт)');

// ── Серверная операция для гостевых карточек ──────────────────────────────
const fn = fs.readFileSync(path.join(ROOT, 'functions/score-audit.js'), 'utf8');
check(fn.indexOf('roundFinishCard') !== -1, 'есть серверная операция roundFinishCard (карточки guest_*)');
check(/roundFinishCard\s*\}/.test(fn) || fn.indexOf('roundFinishCard, onScoreAuditOutbox') !== -1 ||
    fn.indexOf('roundFinishCard,') !== -1, 'roundFinishCard экспортируется из functions/score-audit.js');

// ── Клиент: два шага, своя карточка пишется раньше статуса ────────────────
const live = fs.readFileSync(path.join(ROOT, 'js/live.js'), 'utf8');
const stepOwn = live.indexOf("'/finishedPlayers/' + finisherUid");
check(stepOwn !== -1, 'клиент пишет свою карточку отдельным узлом finishedPlayers/<uid>');
const stepClose = live.indexOf('update(closeUpdate)');
check(stepClose !== -1 && stepOwn < stepClose, 'своя карточка уходит ДО записи статуса (иначе правило базы откажет)');
check(live.indexOf('roundFinishCard') !== -1, 'клиент зовёт серверную операцию завершения карточки');
check(/finisherName/.test(live) && live.indexOf('completedByName = finisherName') !== -1,
    'имя завершившего сохраняется в completedByName');

if (failures) { console.error('\n' + failures + ' проверок не прошло'); process.exit(1); }
console.log('\nВсе проверки прав на завершение карточки пройдены');
