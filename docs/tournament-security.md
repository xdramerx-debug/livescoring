# Безопасность турниров v2

Документ фиксирует границы безопасности для текущего статического Firebase-приложения и целевой PostgreSQL/RLS-модели. Клиентская валидация в `js/tournament-core.js` и `js/tournament-public.js` улучшает UX, но не является контролем доступа.

## Источник истины и права

Сейчас приложение использует Firebase Realtime Database, поэтому в релизе остаются следующие узлы:

- `settings/course` — единственное поле и единственный источник лунок, par, SI и рейтингов;
- `users/<uid>` — существующая сущность игрока и роль `admin`;
- `tournaments/<id>` — совместимая конфигурация и публичное резюме;
- `tournaments/<id>/applications` — входящие заявки;
- `tournaments/<id>/registeredPlayers` и `waitlist` — существующий состав и лист ожидания;
- `tournaments/<id>/roles` и `audit` — назначения и журнал;
- `tournaments/<id>/protocol` — версия снимка финального протокола;
- `rounds` и `protocols` — существующие скоринговые и стартовые данные.

`js/tournament-admin.js` разрешает операции записи только Firebase-пользователю с `users/<uid>/role == admin`. Сессионный мастер-пароль старой админки может открыть интерфейс, но не должен считаться серверным разрешением на новые записи. Это намеренное ограничение: хэш мастер-пароля, проверенный в браузере, нельзя использовать как RLS.

## RTDB invariants

При публикации rules необходимо сохранить следующие инварианты. Фрагмент ниже является точной политикой для tournament-узлов и должен быть объединён с действующими rules проекта без замены правил `users`, `rounds`, `scores` и других функций.

```json
{
  "tournaments": {
    "$tid": {
      ".read": "data.child('lifecycleStatus').val() != 'draft' || (auth != null && root.child('users').child(auth.uid).child('role').val() == 'admin')",
      ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() == 'admin'",
      "applications": {
        "$aid": {
          ".write": "auth != null && (root.child('users').child(auth.uid).child('role').val() == 'admin' || (!data.exists() && newData.child('uid').val() == auth.uid))",
          ".validate": "newData.hasChildren(['name','status','createdAt']) && newData.child('name').isString() && newData.child('name').val().length >= 3 && newData.child('name').val().length <= 120 && newData.child('status').val() == 'pending'"
        }
      },
      "registeredPlayers": {
        "$uid": {
          ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() == 'admin'",
          ".validate": "newData.hasChildren(['name']) && newData.child('name').isString() && newData.child('name').val().length <= 120"
        }
      },
      "waitlist": {
        "$key": {
          ".write": "auth != null && (root.child('users').child(auth.uid).child('role').val() == 'admin' || (!data.exists() && (newData.child('uid').val() == auth.uid || newData.child('uid').val() == null)))",
          ".validate": "newData.child('name').isString() && newData.child('name').val().length >= 3 && newData.child('name').val().length <= 120"
        }
      },
      "audit": {
        "$event": {
          ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() == 'admin'",
          ".validate": "newData.hasChildren(['event','at','by']) && newData.child('event').isString() && newData.child('by').isString()"
        }
      },
      "roles": {
        "$roleId": {
          ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() == 'admin'",
          ".validate": "newData.child('role').val() in ['judge','secretary','marshal','observer'] && newData.child('name').isString()"
        }
      },
      "protocol": {
        ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() == 'admin'",
        ".validate": "newData.child('version').isNumber() && newData.child('state').val() in ['live','fixed','published']"
      }
    }
  }
}
```

Ограничение лимита участников нельзя надёжно реализовать только клиентским `count + update`: два одновременных запроса могут пройти проверку. Для турниров с `registration.approval == auto` серверная транзакция/Cloud Function должна атомарно резервировать место. В новой конфигурации по умолчанию используется ручная модерация; администратор подтверждает заявку через multi-location update.

Публичный каталог дополнительно фильтрует `draft`, но это не заменяет rules. До подключения rules чтение всего узла `tournaments` в старом Firebase-проекте считается legacy-совместимостью, а не доказательством приватности черновиков.

## Ввод и экспорт

- Все значения перед HTML проходят `escapeHtml`; URL для `banner`, `protocol.pdfUrl` и внешних ссылок пропускаются через allowlist `http(s)`, относительных и корневых URL.
- Excel/CSV импорт ограничен размером 5 МБ и 500 строками. Принимаются только имя, числовой HCP в диапазоне `-10..54`, пол и известный tee. Неизвестные строки пропускаются с итоговым счётчиком.
- `TournamentCore.csv` добавляет BOM для Excel, экранирует разделитель/кавычки/переводы строк и префиксует формульные значения (`=`, `+`, `@`), чтобы имя игрока не стало Excel-формулой.
- Имена, контакты и HCP не вставляются в SQL: в текущем RTDB SQL отсутствует; в целевом API используются параметризованные запросы.
- CSRF для браузерного API обеспечивается Firebase Auth ID token и серверными rules; отдельная cookie-сессия для tournament v2 не создаётся.

## Целевая PostgreSQL/RLS-модель

При переносе без дублирования сущностей схема должна ссылаться на существующие таблицы клуба:

```text
courses(id)                         -- существующий курс
course_holes(course_id, hole_no)    -- существующие лунки
players(id)                         -- существующие игроки
users(id, player_id, role)
tournaments(id, course_id, lifecycle_status, config jsonb, version)
tournament_registrations(id, tournament_id, player_id, status)
tournament_rounds(id, tournament_id, round_no, date)
tournament_scores(round_id, player_id, hole_no, gross, status)
tournament_protocol_versions(id, tournament_id, version, state, snapshot jsonb, fixed_by, published_at)
tournament_audit(id, tournament_id, actor_id, event, changes jsonb, created_at)
```

RLS-политика должна быть следующей:

1. `SELECT` опубликованных турниров, публичного состава и опубликованного протокола — всем; draft/private — только `admin` и назначенным tournament roles.
2. `INSERT` заявки — только authenticated user для собственного `player_id`; гостевая заявка допускается только через отдельный rate-limited server endpoint с honeypot/anti-abuse проверкой.
3. `UPDATE` конфигурации, состава, ролей, фиксации и публикации — `admin` либо назначенный судья/секретарь с конкретным `tournament_id`; участник изменяет только разрешённую score-карточку текущего раунда.
4. `DELETE` протокола, audit и score не выдаётся клиенту; исправление создаёт новую версию и audit event.
5. `tournament_protocol_versions.state = published` неизменяем в пределах версии; новая публикация получает следующий `version`.

## Проверки релиза

Минимальный локальный набор:

```bash
node --check js/tournament-core.js
node --check js/tournament-public.js
node --check js/tournament-admin.js
node tools/test-tournament-core.js
node tools/test-tn-engine.js
node tools/test-tournament-integration.js
```

После изменения Firebase rules нужно отдельно проверить anonymous/user/admin сценарии в Firebase Emulator Suite или staging-проекте. Продакшен rules нельзя считать установленными только потому, что клиентский экран показывает loading/error или кнопку администратора.
