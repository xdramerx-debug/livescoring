# Доступ к турнирам по мастер-паролю

Мастер-пароль **не** даёт права RTDB через `sessionStorage`. Админка проверяет его через Cloud Function `tournamentMasterSignIn` и входит в Firebase Auth через custom token с ограниченными правами. Привязывать личный аккаунт Firebase не нужно. Права на турниры, связанные турнирные раунды, протоколы и шаблоны задаются `database.rules.json`, ограничены 8 часами и не разрешают повышать собственную роль в `users`.

## Текущий мастер-пароль

По умолчанию (когда секрет не настроен) мастер-пароль администратора — **55555**. Его SHA-256 (UTF-8) зашит в функцию как `DEFAULT_MASTER_PASSWORD_HASH` (`functions/index.js`). Секрет `TOURNAMENT_MASTER_PASSWORD_HASH` (env-переменная, может быть установлена через Firebase Secret Manager) **не обязателен**: функция деплоится и работает без него. Если секрет установлен в окружении функции, он **имеет приоритет** и полностью заменяет дефолтное значение (55555 при этом перестаёт приниматься).

> Важно: секрет намеренно **не привязан** жёстко через `runWith({secrets: [...]})` в коде, чтобы деплой не падал без секрета (браузер иначе показывает «Ошибка входа: internal»). Чтение секрета через Secret Manager REST API убрано — оно давало `internal` при сбоях сети/прав. Теперь функция читает только `process.env.TOURNAMENT_MASTER_PASSWORD_HASH`; если переменная пуста — действует штатный пароль 55555. Для продакшена установите секрет и задеплойте функцию с этим env (см. шаг 3-4).

## Смена пароля

1. Выберите **новый длинный случайный** пароль. Короткие пароли (как 55555) поддаются перебору — они допустимы только для отладочной среды.
2. Вычислите SHA-256 UTF-8 пароля **локально**, не помещайте сам пароль в публичный `/settings` RTDB. Например, в bash: `read -rsp 'Новый пароль: ' p; echo; printf '%s' "$p" | sha256sum | cut -d' ' -f1; unset p` (ввод скрыт; используйте локальную защищённую среду).
3. Сохраните полученный хэш в Firebase Secret Manager под именем `TOURNAMENT_MASTER_PASSWORD_HASH` (`firebase functions:secrets:set TOURNAMENT_MASTER_PASSWORD_HASH --project livescore-b77e4`) — дефолтный пароль 55555 перестанет приниматься только после деплоя функции с этим секретом.
4. Задеплойте функцию с секретом: `firebase deploy --only functions:tournamentMasterSignIn --set-secrets TOURNAMENT_MASTER_PASSWORD_HASH=TOURNAMENT_MASTER_PASSWORD_HASH:latest --project livescore-b77e4` (или `firebase deploy --only functions --project livescore-b77e4`, если секрет уже привязан). При необходимости выдайте сервис-аккаунту рантайма доступ к секрету: `gcloud secrets add-iam-policy-binding TOURNAMENT_MASTER_PASSWORD_HASH --project livescore-b77e4 --member="serviceAccount:livescore-b77e4@appspot.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"`.
5. Разверните **функции, правила БД и hosting вместе** (достаточно при первом запуске): `firebase deploy --only functions,database,hosting --project livescore-b77e4`. Для Cloud Functions и Secret Manager необходим настроенный проект Firebase с соответствующим тарифом/правами. Рантайм функций — Node.js 22 (`engines` в `functions/package.json`): nodejs18 снят с поддержки Cloud Functions, деплой с ним невозможен.
6. Старые `/settings/adminAccess/masterPassword{,Hash}` и `/settings/admin/masterPassword{,Hash}` (публичные узлы) удалены; после смены секрета нужен повторный деплой функции. Уже открытые сессии действуют до 8 часов или до выхода из админки.

Вход по мастер-паролю **не** работает клиентским обходом: браузер всегда отправляет пароль в callable, а права выдаёт только сервер (custom token + правила RTDB). После входа редактирование турнира, составов, заявок, статуса, протокола и его раундов работает напрямую по серверным правилам. Глобальные настройки клуба (например, общее поле и аккаунты пользователей) требуют обычных прав администратора Firebase.
