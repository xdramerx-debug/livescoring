# «Новая версия создания турнира», «Настройки поля», «Шаблоны турниров`

Три новые суб-вкладки внутри существующей страницы **Админ-панель → «Турниры 🏆»**
(`#tab-tournaments` в `admin.html`). Существующие механизмы (старое создание
турнира, список, старт, скоринг, лидерборд) не изменены и остаются рабочим
fallback — они живут на суб-вкладке **«Классика»**.

Прямые ссылки (без перезагрузки, состояние в URL-hash):

| Hash | Вкладка |
|------|---------|
| `admin.html#new-create` | Мастер создания турнира (10 шагов) |
| `admin.html#course` | Настройки поля (единственное поле клуба) |
| `admin.html#templates` | Шаблоны турниров |

## Файлы

| Файл | Назначение |
|------|-----------|
| `js/tn-engine.js` | **Доменный слой** (без DOM/Firebase, тестируется в Node): справочник `TN_CONFIG`, `HandicapService` (WHS), `ScoringService` (стратегии подсчёта), `TieBreakService`, `PairingService`, `CutService`, `LeaderboardService`, `Exporters` (CSV/JSON/печать) |
| `js/tn-wizard.js` | **UI-слой**: суб-вкладки, wizard (10 шагов, data-driven), черновики (localStorage + Firebase автосейв каждые 20 с), поле, шаблоны, hash-роутинг |
| `css/tn-wizard.css` | Стили суб-вкладок (наследуют дизайн-систему `style.css`: CSS-переменные, тёмная тема) |
| `tools/test-tn-engine.js` | 76 автотестов движка (`node tools/test-tn-engine.js`) |
| `tools/test-tn-wizard-ui.js` | 64 UI-проверки в jsdom (`NODE_PATH=… node tools/test-tn-wizard-ui.js`) |

В `js/admin.js` добавлен один вызов `tnwOnAdminOpen()` при входе в админку;
в `js/utils.js` — `tnwOnLangChange()` при смене языка (оба вызова защищены
`typeof … === 'function'`, без новых зависимостей).

## Архитектура данных (Firebase RTDB)

```
settings/
└── course/                      ← «Настройки поля» (ОДНО поле клуба)
    ├── name, logoUrl, address, lat, lng
    ├── type: 9|18|27|36
    ├── holes: [ { num, par: 3|4|5, si: 1..N (уникальный),
    │              yards: { bk, bl, wh, ye, rd } } ]
    ├── ratings: { bk|bl|wh|ye|rd: { cr, slope } }     ← Course/Slope Rating (WHS)
    ├── localRules, difficultyNote, mapUrl
    ├── holeSponsors: { "1": "Фирма", … }              ← холь-спонсоры
    └── updatedAt, updatedBy

tnDrafts/<uid|master>/<draftId>  ← черновики мастера (автосейв 20 с)
    ├── config: { info, format, scoring, participants, flights,
    │             officials, prizes, media, publish }  ← 10 шагов
    ├── step, name, status, scheduledAt, owner, updatedAt

tnTemplates/<tplId>              ← «Шаблоны турниров»
    ├── name, type, typeId
    ├── config: <как у черновика, БЕЗ дат и участников>
    └── authorUid, authorName, createdAt, updatedAt

tournaments/<tnId>               ← публикация (ЧИТАЕТСЯ существующим кодом)
    ├── name, date, formats[], tees[], status: 'upcoming'   ← legacy-поля
    ├── nameEn, description, logo, banner, slug, isPublic
    ├── endDate, roundsMeta[], categories[], level, typeId
    ├── fromWizard: true, wizardVersion: 2
    ├── courseRef: 'settings/course'           ← поле не дублируется
    ├── wizard: <полная конфигурация 10 шагов>
    └── audit/<pushId>: { event: 'published', at, by, draftKey }
```

ER-связи:

```
settings/course ──┐ (courseRef, 1 field → N tournaments)
                  ▼
tnTemplates ──create-from──► tnDrafts ──publish──► tournaments ──► (сущ. механизмы:
   (шаблоны)                 (черновики)            │                divisions,
                                                    └── audit ◄── every publish  waitlist, groups,
                                                                                   scoring, leaderboard)
```

## Права

- Доступ к вкладкам = доступ к админ-панели (`hasAdminPanelAccess()`).
- Сохранение поля, публикация — только администратору (повторная проверка в UI;
  правила RTDB — см. ниже).
- Все значимые события пишутся в `tournaments/<id>/audit`.

Рекомендуемые правила RTDB (добавить в правила базы):

```json
{
  "rules": {
    "settings": { "course": { ".read": true,  ".write": "root.child('users/'+auth.uid+'/role').val() === 'admin'" } },
    "tnTemplates": { ".read": "auth != null", ".write": "root.child('users/'+auth.uid+'/role').val() === 'admin'" },
    "tnDrafts":  { "$uid": { ".read": "auth != null", ".write": "auth != null" } }
  }
}
```

## Мастер: как устроен

10 шагов описаны **декларативно** в `tnwSteps()` (`js/tn-wizard.js`): шаг =
список групп, группа = список полей. Типы полей: `text/textarea/date/time/
datetime/number/url/select/multi/bool/list/pointsTable/tieOrder/notifyTemplates`.
Рендер, двусторонняя привязка (`data-tnw-path` → `draft`, делегированный
`input/change`), динамические списки и drag&drop — общие для всех шагов.

Автосохранение: `localStorage` — мгновенно на каждый ввод; Firebase
(`tnDrafts/<owner>/<key>`) — каждые 20 с при наличии изменений и по `Ctrl+S`.
Черновик можно закрыть и продолжить с лендинга мастера (список черновиков).
**Отложенная публикация**: черновик со статусом `scheduled` и прошедшим
`scheduledAt` автоматически публикуется, когда админ открывает панель
(`tnwCheckScheduled`).

Горячие клавиши: `Ctrl/Cmd+S` — сохранить черновик на сервере.

## Движок (`js/tn-engine.js`)

- **WHS**: `CH = HI × (Slope/113) + (CR − Par)`, `PH = CH × Allowance%`,
  cap применяется к индексу; удары форы — по stroke index (плюсовые гандикапы
  отдают удары с лунок с наибольшим SI); командный гандикап скрембла —
  взвешенный (25/20/15/10%).
- **Stableford/Modified** — редактируемые таблицы очков (0–5+ / −3…+8),
  ключи: `lte-4, -3, -2, -1, 0, +1, gte+2`.
- **Net Double Bogey** — потолок на лунке: `par + 2 + удары форы`.
- **Match Play** (учёт «X&Y»), **Skins** с carry-over, **Best Ball**, **Scramble**.
- **Тай-брейки**: countback (9/6/3/1), по последней лунке, по stroke index,
  sudden death (маркер плей-офф); порядок методов = приоритет.
- **Флайты**: по гандикапу/рейтингу/возрасту/полу/случайно (детерминированный
  ГПСЧ по seed); группы по 2/3/4; расписания shotgun / tee times / two-tee;
  re-pairing по лидерборду (лидеры — последней группой).
- **Cut**: top-N с учётом ties или строго.
- **Лидерборд**: позиции с делёжем мест, R1–R4, Total, Thru, Today, Gross/Net/
  очки, проекция; цветовые классы eagle/birdie/par/bogey/double.
- **Печать** (брендированная, кнопка «Печать»): scorecard (пар, SI, ярдажи по
  ти, точки форы, подписи маркера/игрока), tee times, лидерборд, дипломы
  (массово). **Экспорт**: CSV (BOM, экранирование) и JSON.

## Как расширять

### Добавить систему подсчёта
1. В `TN_CONFIG.scoringSystems` добавьте `{ id: 'my-system', nameRu, nameEn }`.
2. В `ScoringService.STRATEGIES` — объект `{ direction: 'low'|'high', unit, aggregate(holes) }`.
3. При необходимости — маппинг в legacy-формат в `tnwLegacyFormats()`.
4. Тест в `tools/test-tn-engine.js`. Всё: система появится в шаге 3, сводке и сортировках автоматически.

### Добавить шаг/поле в мастер
Поле — это запись в `tnwSteps()` (группа + дескриптор). Новый шаг — новый
объект в массиве + условие «шаг выполнен» в `tnwStepDone()` + строка в сводке
`tnwSummaryHtml()`. Привязка к черновику, автосейв и валидация уже работают.

### Добавить тай-брейк
Запись в `TN_CONFIG.tieBreaks` + функция `(aScores, bScores) → -1/0/1` в
`TieBreakService.METHODS`. Дальше доступен в шаге 3 с сортировкой приоритета.

### Добавить номинацию
Запись в `TN_CONFIG.nominations` (`needsHoles: true`, если номинация привязана
к лунке — тогда она доступна и в таблице лунок-номинаций шага 7).

### Добавить печатный шаблон
Метод в `Exporters` (`js/tn-engine.js`), собирающий body и возвращающий
`Exporters._printShell(title, brand, body)`; вывод — `tnwPrintHtml(html)`.

## Проверка

```bash
node tools/test-tn-engine.js                                     # движок (76)
NODE_PATH=$(pwd)/../nmtest/node_modules node tools/test-tn-wizard-ui.js   # UI (64)
```

Демо-поле «Пестово» (18 лунок, пар 72): вкладка «Настройки поля» →
«Заполнить демо» → «Сохранить поле».
