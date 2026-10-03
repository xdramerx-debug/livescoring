# Менеджер турниров (вкладка «Турниры 🏆»)

Полный цикл работы организатора с турниром прямо в админ-панели: создание
турнира, раунды, группы, участники, стартовый лист с QR-кодами, счёт по
лункам, результаты и карточка игрока. Система переиспользует существующую
инфраструктуру клуба — публичный каталог `tournaments.html`, страницы
ввода счёта (`setup-round.html` / `scorer.html`) и общие правила Firebase.

```
admin.html → вкладка «Турниры 🏆» (#tab-tnmanager → #tnm-root)
  js/tn-mgr.js        точка входа TnMgr (open/boot, права доступа)
  js/tn-mgr-ui.js     маршрутизация, список, форма, карточка, модалки
  js/tn-mgr-sheet.js  вкладка «Стартовый лист»: генерация, QR, колонки, PDF
  js/tn-mgr-round.js  экран раунда (Счёт/Результаты) и карточка игрока
  js/tn-mgr-data.js   слой данных Firebase RTDB
  js/tn-mgr-io.js     печать PDF (окно печати), Excel (SheetJS/CSV), импорт
  js/tn-mgr-core.js   чистое ядро: форматы, поиск RU/EN, WHS, лист, результаты
```

## 1. Как пользоваться

1. **Турниры** — таблица «Название / Дата», кнопка «Создать турнир».
2. **Новый турнир** — название\*, дата начала\*, время старта\*, формат
   (мультивыбор из пополняемого справочника: 20 встроенных форматов + свои),
   клуб, поле, примечание. Кнопки «Добавить» / «Назад». Черновик формы
   автоматически сохраняется в `tnDrafts/<uid>` и в localStorage
   (`pestovo_tn_mgr_draft`).
3. **Карточка турнира** — «Назад», название + дата, «Изменить» и вкладки:
   - **Раунды** — «Добавить», таблица с датой (правится на месте), «Удалить»,
     клик по строке открывает экран счёта.
   - **Группы** — «Добавить группу», таблица «Название / HCP», «Удалить»;
     форма группы: название\*, гандикап от/до, пол, ТИ, формат.
   - **Участники** («Гольфисты») — поиск с автодополнением по фамилии на
     русском и английском, ручное добавление, импорт Excel/CSV, вставка
     таблицы, справочник игроков клуба, счётчики «Всего / мужчин / женщин»,
     удаление, экспорт в PDF.
   - **Стартовый лист** — генерация из участников, групп, ТИ, формата и
     раундов; инлайн-правка любого поля; колонки настраиваются; QR-коды
     маркеров; PDF с QR; Excel.
4. **Экран раунда** — шапка (турнир, клуб, поле, дата), «Экспорт PDF»,
   «Экспорт Excel», «Стартовый лист», вкладки **Счёт** и **Результаты**,
   информационная строка с ТИ и форматом игрока (например, «Стэйблфорд
   (игра на очки)»), фильтры по группам/полу/«Без группы», таблица лунок
   1–18 со строками «Длина / Пар / Индекс» и редактируемыми ударами.
5. **Результаты** — игрок, счёт, нетто, очки стэйблфорда; сортировка по
   клику на заголовок; призёры 1/2/3 подсвечены (в интерфейсе и в PDF);
   экспорт PDF/Excel; ручные правки счёта и очков.
6. **Карточка игрока** — ФИО, HI, CH, пар поля, таблица
   «Длина / Пар / Индекс / Фора / Удары / Очки гросс / Очки нетто»,
   экспорт в PDF, ручное редактирование HI, CH, форы и ударов.

## 2. Сущности (ТЗ §7)

Данные хранятся в существующем дереве `tournaments/<tid>` — публичные
страницы, live-счёт и правила Firebase продолжают работать.

| Сущность | Путь | Поля |
|---|---|---|
| Tournament | `tournaments/<tid>` | `name`, `date`/`startDate`, `startTime`, `formats[]`, `formatsDict`, `club`, `course`, `note`, `status` (`draft`→`upcoming`→`active`→`completed`), `source`, `createdBy`, `createdAt`, `updatedAt` |
| Round | `tournaments/<tid>/rounds/<rid>` | `id`, `date`, `startTime`, `club`, `course`, `name`, `sheetAt`, `groupRounds{index:gid}`, `groupRoundId`, `createdAt` |
| Group | `tournaments/<tid>/groups/<gid>` (дубль в `divisions/<gid>`) | `id`, `name`, `hcpFrom`, `hcpTo`, `gender`, `tee`, `format`, `members{}`, `createdAt` |
| Player (участник турнира) | `tournaments/<tid>/players/<pid>` | `id`, `fio`/`name`, `firstName`, `middleName`, `lastName`, `hi`, `ch`, `gender`, `tee`, `groupId`, `fores{}`, `source`, `uid`, `addedBy`, `createdAt` |
| TournamentPlayer (регистрация) | `tournaments/<tid>/registeredPlayers/<pid>` | `name`, `handicap`, `hi`, `ch`, `gender`, `tee`, `groupId`, `source`, `uid`, `status`, `addedAt` |
| StartingSheet | `tournaments/<tid>/sheets/<rid>` | `roundId`, `tournamentId`, `options{}`, `entries{}`, `markers{}`, `columns[]`, `qr{payload}`, `createdAt`, `updatedAt` |
| StartingSheetEntry | `.../sheets/<rid>/entries/<pid>` | `playerId`, `playerName`, `firstName`, `middleName`, `lastName`, `gender`, `hi`, `ch`, `tee`, `format`, `groupId`, `groupName`, `flight`, `position`, `order`, `startTime`, `markerPlayerId`, `markerName`, `qr`, `scoreUrl` |
| MarkerAssignment | `.../sheets/<rid>/markers/<pid>` | `playerId`, `groupId`, `groupName`, `flight`, `position`, `qr`, `targets{}`, `generatedAt`; в раунде группы — `rounds/<gid>/markerAssignments` + кольцо `players/<pid>/markedBy` |
| Score | `tournaments/<tid>/scores/<rid>/<pid>/<hole>`, страницы счёта `rounds/<gid>/players/<pid>/scores/<hole>` | 1–20 (проверяется правилами) |
| Result | `tournaments/<tid>/results/<rid>/<pid>` | `playerName`, `gross`, `net`, `points`, `place`, `holesPlayed`, `manual`, `updatedAt` |
| QRCode | `.../sheets/<rid>/entries/<pid>/qr` и `.../markers/<pid>/qr` | ссылка `setup-round.html?round=<gid>&as=<pid>` (группа) или `scorer.html?round=<gid>&player=<pid>` (одиночка) |

## 3. Стартовый лист и QR

- Лист собирается ядром `buildSheet()`: игроки сортируются по гандикапу,
  распределяются по группам (`groupSize`, по умолчанию 4), флайты A/B/C
  (`groupsPerFlight`), старты с интервалом (по умолчанию 8 минут от первого
  времени), маркеры назначаются по кольцу внутри группы.
- QR-код маркера ведёт на существующую страницу ввода счёта, то есть
  переиспользует live-счёт, публичные таблицы и offline-очередь (`js/pwa.js`).
- Раунды групп создаются в `rounds/<gid>` (`mode:'group'`, `tournamentId`,
  `tournamentRoundId`, `accessKey`, `createdBy`). `createdBy` — uid маркера,
  если он зарегистрирован в клубе (тогда маркер может вносить счёт партнёров
  по правилам `rounds/$rid/players/$pid`), иначе uid организатора.
- PDF листа: название турнира, дата, раунд, поле; флайты и группы с порядком
  и временем старта; по игроку — имя, ТИ, формат, группа, маркер; QR маркера
  рядом с группой; опционально QR турнира в шапке (галочка «QR турнира в
  шапке PDF»).

## 4. Синхронизация

Правки инлайна в стартовом листе синхронизируются с участниками
(`players/<pid>`, `registeredPlayers/<pid>`) и пересобирают карту маркеров;
правки в карточке игрока (HI/CH/фора/ТИ) и в таблице участников обновляют
лист. Удары, введённые на экране счёта, пишутся и в `rounds/<gid>` (страницы
ввода счёта), и в зеркало `tournaments/<tid>/scores/<rid>`; ручные правки
результатов сохраняются в `results/<rid>` и не затираются пересчётом
(`saveResults` без `force`).

## 5. Права

Раздел виден администраторам клуба (`users/<uid>/role === 'admin'`) и
мастер-сессии турнира (UID `tournament-master` с claim). Кнопка вкладки
скрывается для остальных (`TnMgr.syncTabVisibility`), данные пишутся в
существующие узлы, поэтому действующие правила `database.rules.json` не
менялись.

## 6. Тесты

```
node tools/test-tn-mgr-core.js   # 127 проверок: форматы, поиск RU/EN, WHS,
                                 # лист, результаты, импорт, PDF/Excel, QR
node tools/test-tn-mgr-ui.js     # 135 проверок в jsdom: полный сценарий
                                 # организатора на in-memory Firebase
```

Полный набор — `npm test` (оба теста подхватываются `tools/run-tests.js`).
UI-тест требует `jsdom` (`npm install --no-save jsdom`) и пропускается,
если его нет.
