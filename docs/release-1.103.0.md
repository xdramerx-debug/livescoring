# Версия 1.103.0 — название клуба, RUSGOLF в раунде, уведомления, шапка, стили ввода счёта

Что вошло в релиз, какие файлы и как это проверить. Номер версии на сайте
(футеры 13 страниц + `CACHE_NAME` в `sw.js`) обновляется командой
`npm run assets` после правки `index.html`.

## 1. Название сайта → «Пестово»

Короткий бренд вместо «Гольф-клуб Пестово». Заменено системно: заголовки
`<title>`, `manifest.json` (`name`/`short_name`), i18n (`brand_name`,
`footer_club` в RU/EN), тексты Cloud Functions, JSON-LD, `sw.js` (заголовок
push-уведомления), `README`. Скрипт замены пропускал `tools/` — там остались
исторические фикстуры со старым названием, это ожидаемо.

## 2. Гандикап из RUSGOLF прямо из формы создания раунда

Раньше кнопка «RUSGOLF» была видна только у своей карточки и требовала
«своего» профиля — на телефоне игрок не мог обновить гандикап партнёра.

- Кнопка `pl-hcp-refresh-<idx>` показывается сразу, как только в карточке
  введены **имя и фамилия** (2+ слова), у любой карточки формы — и на
  телефоне тоже (`syncSetupHcpRefreshButton`, `js/round-setup.js`).
- Поиск идёт **только по ФИО** (номер карточки не нужен): `PestovoRusgolf.searchByName()`
  (`js/rusgolf-client.js`) перебирает варианты запроса и сравнивает имена
  теми же правилами, что вкладка «RUSGOLF» админки, включая «Формы имён»
  (`settings/nameMatching`, `js/name-variants.js`).
- Точные совпадения идут первыми; если точное одно — гандикап подставляется
  автоматически, если несколько — открывается окно выбора
  (`.setup-hcp-picker`, закрывается по фону и по Escape).
- Своя карточка дополнительно сохраняет гандикап в профиль
  (`users/<uid>` + `usersPublic/<uid>`), чужая — только в форму раунда;
  журнал изменений (`pestovoLogHcpChange`) различает источники
  `rusgolf-self` и `rusgolf-form`.

Тесты: `tools/test-round-setup-hcp-sync.js` (27 проверок),
`tools/test-hcp-log.js` (31 проверка).

## 3. Уведомления клуба после выключения

`settings/notifications_enabled = false` теперь не только блокирует новые
всплывающие уведомления, но и снимает уже показанные: клубные тосты
помечены классом `.toast.t-club`, а `pestovoDismissClubNotificationToasts()`
(`js/pwa.js`) закрывает их и чистит очередь троттлера; заодно закрываются
системные уведомления, показанные сервис-воркером.
Тест: `tools/test-notifications-off.js` (8 проверок). Подробности —
`docs/push-notifications.md`.

## 4. Шапка: длинное имя больше не «съедает» строку

- В шапке выводится короткое «Имя Ф.» (`navShortUserName()`, `js/utils.js`),
  а полное ФИО осталось в `title` и `aria-label` кнопки профиля.
- Блок профиля и имя ограничены по ширине (`min-width:0`, `max-width`,
  `text-overflow:ellipsis`), подпись темы скрывается только на ≤480px,
  кнопка выхода компактная, а в выезжающем меню строка переносится.
- CSS: `css/style.css` — `.nav-auth`, `.nav-user`, `.nav-profile-trigger`,
  `.nav-uname`, `.nav-logout` (+ правила в `@media(max-width:768px)`,
  `@media(max-width:480px)`, `@media(max-width:360px)`).

Проверка: `npm run check:nav` (`tools/check-nav-mobile.js`) — 6 ширин
(320…1024), длинное ФИО, RU/EN, проверка на переполнение и «чувствительность»
замера. Юнит-тест `tools/test-nav-theme-profile.js` дополнительно проверяет
короткое имя, подсказку и кнопку выхода.

## 5. Экран ввода счёта — 5 стилей и своя вкладка админки

- В админке появилась отдельная вкладка **«Ввод счёта ⛳»** (`#tab-scoreentry`);
  блок настроек переехал туда из «Отображений счётных карточек».
- Стили получили имена и описания (`SCORE_ENTRY_STYLES`,
  `js/admin-display.js`): 1 «Классика клуба», 2 «Крупный счёт»,
  3 «Компакт-сетка», 4 «Контраст-фокус», 5 «Минимализм-лайн»; под
  предпросмотром показывается подпись «Стиль N · Название — описание».
- CSS всех пяти стилей — в конце `css/style.css`, селекторы
  `.score-entry[data-entry-view="N"]` (плиты лунок, сетка, квадрат счёта,
  панели «Я / Маркируемый», кнопки ±, кнопка сохранения). Они применяются
  и к боевым экранам (`setup-round.html`, `marker.html`, `scorer.html`),
  и к предпросмотру админки.

Тесты: `tools/check-score-entry-mobile.js` (5 видов × 3 режима × 3 ширины),
`tools/check-scorecard-mobile.js`, `tools/test-admin-ui.js`.
Подробности — `docs/scorecard-display.md`.

## Проверка релиза

```bash
npm install
npm run build          # dist/livescoring-modules.js
npm run lint:syntax    # синтаксис 131 файла
npm test               # 58 тестов
npm run assets         # ?v= в HTML + CACHE_NAME в sw.js
npm run check:browser  # 15 страниц: classic == bundle
npm run check:scorecards
npm run check:nav
```
