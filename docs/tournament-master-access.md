# Доступ в админку по мастер-паролю

Мастер-пароль **не** даёт права RTDB через `sessionStorage`. Админка проверяет его через Cloud Function `tournamentMasterSignIn` и входит в Firebase Auth через custom token с ограниченными правами. Привязывать личный аккаунт Firebase не нужно. Права на турниры, связанные турнирные раунды, протоколы и шаблоны задаются `database.rules.json`, ограничены 8 часами и не разрешают повышать собственную роль в `users`.

Мастер-сессия может также **удалять** данные клуба (ветки `users`, `usersPublic`, `rounds`, `tournaments`, `protocols`, `broadcasts`, `alerts` — правила разрешают мастеру только удаление, `!newData.exists()`), чтобы работали кнопки «Удалить все раунды»/«Удалить всех игроков и раунды»/«Удалить все данные» и очистка через Cloud Function `wipeAllData`. Создавать и редактировать профили игроков мастер по-прежнему не может — для этого нужен аккаунт с правами администратора (`users/$uid` `admin: true` или `role: 'admin'`).

## Мастер-пароль: fail closed (с 2026-10)

Пароль задаётся **только** секретом `TOURNAMENT_MASTER_PASSWORD_HASH`
(env-переменная функции, ставится через Firebase Secret Manager). Если секрета
нет, `tournamentMasterSignIn` отказывает с `failed-precondition` — вход
невозможен ни с каким паролем. Клиент показывает причину и что делать
(`js/admin.js`).

Раньше при отсутствующем секрете действовал зашитый в код
`DEFAULT_MASTER_PASSWORD_HASH` = SHA-256 от **55555**, и документация называла
это штатным режимом. Так делать нельзя: пароль из пяти цифр лежит в публичном
репозитории, а uid `tournament-master` по `database.rules.json` пишет в
`rounds`, `tournaments`, `protocols`, `markerAssignments`, `alerts`,
`usersPublic` и вызывает `wipeAllData` (полное удаление данных клуба).
Единственной защитой был лимит 5 попыток / 15 минут на IP.

Исключение — **Firebase Emulator** (`FUNCTIONS_EMULATOR=true`): там дефолтный
55555 продолжает работать, чтобы локальная разработка и тесты не требовали
Secret Manager. На проде функция дополнительно отвергает секрет, выставленный
в тот же общеизвестный хэш (`failed-precondition`, «must not be the well-known
default»).

> Секрет по-прежнему намеренно **не привязан** жёстко через
> `runWith({secrets: [...]})`: такая привязка требует обязательного секрета в
> Secret Manager, и без него функция не стартует, а браузер видит «Ошибка
> входа: internal» вместо внятной причины. Деплой без секрета проходит, но
> мастер-вход остаётся выключенным — это заметно сразу по сообщению в форме и
> по `logger.error` в логах функции. Чтение секрета через Secret Manager REST
> API не используется (давало `internal` при сбоях сети/прав) — только
> `process.env`.

**Первый деплой после этого изменения обязательно включает установку секрета**
(шаги 1-4 ниже), иначе мастер-вход будет выключен.

## Лимит попыток

5 попыток на 15 минут, счётчик общий для всех инстансов функции (RTDB-транзакция
в `masterLoginAttempts/<sha256(ip)>`). Ключ — `context.rawRequest.ip`, а если он
не отдан, первый хоп `x-forwarded-for` (оба регистра заголовка). До правки
2026-10 все такие запросы попадали в одно ведро `unknown`: атакующий мог
исчерпать лимит и заблокировать легитимного мастера. При недоступной базе
вход отказывает с `unavailable` (fail closed), а не пускает без лимита.

> ⚠️ Открытый вопрос (не изменено намеренно): клиентский fallback в
> `js/admin.js` при `functions/internal` открывает админ-панель по паролю 55555
> **с любого хоста** — это зафиксировано тестом
> `tools/test-tournament-master-auth.js` («Fallback по дефолтному 55555 обязан
> работать с ЛЮБОГО хоста»). При этом `docs/CODE-AUDIT-2026-09.md` (волна 2, п.2)
> утверждает, что fallback ограничен localhost/127.0.0.1/*.local. Код и тест
> говорят обратное. Серверных прав такой вход не даёт (правила RTDB требуют
> подписанного custom claim), но UI админки открывается. Требуется продуктовое
> решение: либо ограничить localhost, либо задокументировать текущее поведение
> как штатное и поправить аудит. См. docs/IMPROVEMENTS-2026-10.md, п.1.

## Смена пароля

1. Выберите **новый длинный случайный** пароль. Короткие пароли (как 55555) поддаются перебору — они допустимы только для отладочной среды.
2. Вычислите SHA-256 UTF-8 пароля **локально**, не помещайте сам пароль в публичный `/settings` RTDB. Например, в bash: `read -rsp 'Новый пароль: ' p; echo; printf '%s' "$p" | sha256sum | cut -d' ' -f1; unset p` (ввод скрыт; используйте локальную защищённую среду).
3. Сохраните полученный хэш в Firebase Secret Manager под именем `TOURNAMENT_MASTER_PASSWORD_HASH` (`firebase functions:secrets:set TOURNAMENT_MASTER_PASSWORD_HASH --project livescore-b77e4`). Без этого шага мастер-вход на проде выключен (fail closed), а хэш, равный SHA-256 от 55555, функция отвергнет.
4. Задеплойте функцию с секретом: `firebase deploy --only functions:tournamentMasterSignIn --set-secrets TOURNAMENT_MASTER_PASSWORD_HASH=TOURNAMENT_MASTER_PASSWORD_HASH:latest --project livescore-b77e4` (или `firebase deploy --only functions --project livescore-b77e4`, если секрет уже привязан). При необходимости выдайте сервис-аккаунту рантайма доступ к секрету: `gcloud secrets add-iam-policy-binding TOURNAMENT_MASTER_PASSWORD_HASH --project livescore-b77e4 --member="serviceAccount:livescore-b77e4@appspot.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"`.
5. Разверните **функции, правила БД и hosting вместе** (достаточно при первом запуске): `firebase deploy --only functions,database,hosting --project livescore-b77e4`. Для Cloud Functions и Secret Manager необходим настроенный проект Firebase с соответствующим тарифом/правами. Рантайм функций — Node.js 22 (`engines` в `functions/package.json`): nodejs18 снят с поддержки Cloud Functions, деплой с ним невозможен.
6. Старые `/settings/adminAccess/masterPassword{,Hash}` и `/settings/admin/masterPassword{,Hash}` (публичные узлы) удалены; после смены секрета нужен повторный деплой функции. Уже открытые сессии действуют до 8 часов или до выхода из админки.

Вход по мастер-паролю **не** работает клиентским обходом: браузер отправляет пароль в callable, а права выдаёт только сервер (custom token + правила RTDB). Сессия ограничена правилами `database.rules.json`; личные аккаунты администраторов по-прежнему нужны для настроек клуба и управления пользователями. Интерфейс создания турниров и публикации отдельного протокола удалён; мастер-сессия и существующие данные Firebase сохранены.
