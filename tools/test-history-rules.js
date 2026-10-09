// Проверка правил записи истории раунда (database.rules.json).
// История игрока пишется клиентом того, кто завершил раунд. Раньше правила
// пускали писать users/<uid>/history только самому владельцу, поэтому раунды,
// завершённые другим участником (гость, импорт, игрок, добавленный позже),
// не попадали в профиль. Тест фиксирует: писать историю игрока может участник
// раунда (или создатель раунда), а цель записи обязана быть игроком раунда.
// Запуск: node tools/test-history-rules.js
'use strict';
const fs = require('fs');
const path = require('path');

const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8'));
const usersSelf = rules.rules.users['$uid'];
let failures = 0;
function check(cond, label) {
    if (cond) console.log('ok  -', label);
    else { failures++; console.error('FAIL', label); }
}

const hist = usersSelf.history && usersSelf.history['$hid'];
const w = (hist && hist['.write']) || '';
check(!!w, 'users/$uid/history/$hid имеет правило записи');
check(w.indexOf("players').child($uid).exists()") !== -1, 'цель записи обязана быть игроком раунда');
check(w.indexOf("players').child(auth.uid).exists()") !== -1, 'писать может участник раунда');
check(w.indexOf("createdBy').val() === auth.uid") !== -1, 'писать может создатель раунда');
check(w.indexOf("auth.uid != 'tournament-master'") !== -1, 'tournament-master исключён');

['roundsPlayed', 'bestGross', 'bestStableford'].forEach(function (f) {
    const node = usersSelf[f] || {};
    check((node['.write'] || '').indexOf("$uid.beginsWith('guest_')") !== -1,
        f + ': запись для чужого игрока — только у гостевых записей');
});

if (failures) { console.error('\n' + failures + ' проверок не прошло'); process.exit(1); }
console.log('\nВсе проверки правил истории пройдены');
