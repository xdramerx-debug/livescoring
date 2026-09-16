# Аудит мобильной версии — Pestovo Live Scoring

Дата: 2026-09-16 · ветка `arena/01a0a8c9-livescoring` · коммит `1cf593f`

Объём проекта: 21 HTML-страница, `css/style.css` 5526 строк / 249 КБ,
`js/utils.js` 11423 строк / 613 КБ, `js/admin.js` 8189 строк, `js/start-admin.js` 5321 строк,
24 теста в `tools/`, Cloud Functions для Web Push.

> Все числовые утверждения ниже получены замером по файлам репозитория.
> Три бага из раздела «Сломано сейчас» дополнительно подтверждены реальным
> запуском кода страниц в jsdom (скрипты-пробы, вывод приведён в тексте).

---

## 0. Сломано сейчас — 3 бага (приоритет P0)

### 0.1. `setup-round.html`: поля игроков скрыты навсегда и открыть их нечем

**Симптом.** В форме группового раунда не видно ни одного поля «Имя», «Пол»,
«Ти», «Точный HCP». Ни на телефоне, ни на десктопе.

**Причина — две половины, которые не сошлись.**

1. CSS-правило верхнего уровня (вне任何媒体-запроса — проверено: вложенность = 0):

   ```css
   /* css/style.css:5517-5518 */
   .setup-player-card:not(.open) .form-row,
   .setup-player-card:not(.open) .form-group:not(.setup-player-head){display:none;}
   ```

2. Единственный код, который добавляет класс `.open` карточкам —
   `js/utils.js:2384` — находится в том же `try`-блоке, что и строка
   `js/utils.js:2376`:

   ```js
   var labels=isEn?['Параметры','Игроки','Старт']:['Settings','Players','Start'];
   ```

   Переменной `isEn` в функции `initP0MobileEnhancements()` **нет** —
   `grep '^var isEn' js/*.js` не находит ни одного объявления верхнего уровня,
   все `var isEn` локальны внутри других функций. Строка бросает
   `ReferenceError: isEn is not defined`, его глотает `catch(e){}`, и до
   `card.classList.add('open')` дело не доходит никогда.

**Проверка запуском** (реальные `setup-round.html` + `js/utils.js` + `js/live.js`,
вызваны настоящие `buildPlayerSlots()` и `initP0MobileEnhancements()`):

```
карточек игроков создано (buildPlayerSlots): 3
карточек с классом .open                  : 0
полей ввода внутри карточек               : 18
полей, попадающих под display:none        : 21
шевронов fa-chevron-down в разметке       : 0
#p0-wizard-steps                          : false
прямой доступ к isEn -> ReferenceError: isEn is not defined
```

Дополнительно: в разметке `js/live.js:176` шеврона нет вообще
(`<div class="setup-player-head"><span><i class="fas fa-user"></i> Игрок #1</span></div>`),
а обработчик клика по заголовку виснет в том же упавшем блоке. То есть
раскрыть карточку пользователю нечем даже теоретически.

**Побочно в той же строке:** тернар перепутан — при `isEn` подставляются русские
подписи, а при русском — английские. И переменная `labels` дальше не используется.

**Фикс.**
- В `initP0MobileEnhancements()` добавить `var isEn = false; try{ isEn = currentLang==='en'; }catch(e){}` (как в `buildBottomTabbar`, `js/utils.js:2287`);
- поменять местами ветви тернара;
- добавить шеврон `<i class="fas fa-chevron-down">` в `.setup-player-head` в `js/live.js:176`;
- убрать глухой `catch(e){}` или писать в него `console.error(e)` — именно он
  позволил багу доехать до прода незамеченным;
- `.setup-player-card:not(.open)…{display:none}` завернуть в `@media(max-width:768px)`,
  чтобы аккордеон был мобильным, а не глобальным.

---

### 0.2. `scorer.html`: «Сохранить» в sticky-панели вызывает `saveSc()` дважды

**Причина.** `js/utils.js:2414` клонирует кнопку:

```js
var clone = saveBtn.cloneNode(true);
clone.addEventListener('click', function(e){ e.preventDefault(); saveBtn.click(); });
```

`cloneNode(true)` копирует **атрибут** `onclick="saveSc()"`
(`scorer.html:76`). Клон получает и скопированный inline-обработчик, и новый
listener, который кликает оригинал. `e.preventDefault()` inline-обработчик не отменяет.

**Проверка запуском:**

```
clone.outerHTML = <button class="btn btn-g btn-block" id="p0-sticky-save" onclick="saveSc()" ...>
clone has inline onclick attr: true
saveSc() вызовов после ОДНОГО клика по sticky-кнопке: 2
```

**Последствия.** Двойная запись счёта, двойной переход на следующую лунку,
два тоста. На слабом интернете вторая запись может уйти уже после перехода —
и в базу ляжет значение не той лунки.

**Фикс.** `clone.removeAttribute('onclick')` перед навешиванием listener
(или вообще не клонировать, а переносить оригинальный узел в sticky-панель).

---

### 0.3. Кнопки ± гуляют от 72 px до 42 px — пресет «Компакт» ломает touch-таргет

Все объявления `width` для `.score-minus/.score-plus` в `css/style.css`
(специфичность посчитана по селекторам из файла):

| селектор | специфичность | `!important` | width | контекст |
|---|---|---|---|---|
| `.score-minus` (1400) | (0,1,0) | да | 52px | `@media(max-width:480px)` |
| `.scoring-compact .score-minus` (4874) | (0,2,0) | да | 48px | `@media(max-width:640px)` |
| `body.st-scoring-v2 .score-btns .score-minus` (5214) | (0,3,1) | да | 64px | верхний уровень |
| `body.st-scoring-v3 .score-minus` (5230) | (0,2,1) | да | 42px | верхний уровень |
| `.score-minus` (5486) | (0,1,0) | да | 72px | `@media(max-width:768px)` |

Итог по правилам каскада (все объявления `!important`, решает специфичность,
затем порядок в файле):

- `scorer.html`, пресет по умолчанию → **72px**;
- `scorer.html` + пресет «Крупный счёт» (v2) → **64px**;
- `scorer.html` + пресет «Компакт» (v3) → **42px**;
- `setup-round.html` (там на контейнере `scoring-compact`, `setup-round.html:331`) → **48px**;
- `setup-round.html` + пресет «Компакт» → **42px**.

42px меньше 44px, которые сам проект объявляет минимумом
(`css/style.css:2306-2312`, `@media (pointer: coarse)`). Плюс правило 5230 не
внутри медиа-запроса — оно ужимает кнопки и на десктопе, где база 64px.

Отдельно: `setup-round.html:344-345` задаёт размер кнопок **инлайн-стилем**
`style="width:44px;height:44px;…"`, который проигрывает всем `!important`
выше — то есть это мёртвый код, который только путает.

**Фикс.** Одно место правды: CSS-переменная `--score-btn-size` на `body`
(`72px` мобиль, `64px` десктоп), пресеты меняют переменную, а не переопределяют
`width !important`. Инлайн-стили из `setup-round.html:344-345` удалить.
Минимум 44px зафиксировать через `min-width/min-height: max(44px, var(--score-btn-size))`.

---

## 1. Вес и скорость (P1)

### 1.1. Service Worker предзагружает 12 МБ на каждом телефоне

Замер по списку `STATIC_ASSETS` из `sw.js` (65 файлов, реальные размеры):

```
  7608 КБ  docs/pravila-pestovo.pdf
  1107 КБ  vendor/pdfjs/pdf.worker.min.js
   613 КБ  js/utils.js
   431 КБ  js/admin.js
   368 КБ  vendor/pdfjs/pdf.min.js
   314 КБ  js/start-admin.js
   253 КБ  img/logo.png
   249 КБ  css/style.css
   ...
   files: 65   total: 11.99 МБ
```

Проблемы:
- **7.6 МБ PDF книги правил** скачивается при первой установке PWA у каждого
  игрока, даже если он ни разу не откроет «Помощника». На сотовой связи на поле
  это минуты и трафик.
- **1.5 МБ pdf.js** (`pdf.min.js` + `pdf.worker.min.js`) — там же, нужен только
  для пересборки индекса в админке.
- **745 КБ админских бандлов** (`admin.js` + `start-admin.js`) — их грузит
  только `admin.html` (проверено: `grep -l 'js/admin.js' *.html` → 1 файл),
  но кэшируются они всем.
- Всё это тянется в фазе `install`, то есть конкурирует с первой отрисовкой.

**Фикс.** Убрать из `STATIC_ASSETS` PDF, pdf.js и админские бандлы; для них —
отдельный runtime-кэш `stale-while-revalidate` (обработчик `fetch` в `sw.js:88`
уже умеет, его просто не пускают дальше precache). Ожидаемый эффект: установка
PWA ~12 МБ → ~2.5 МБ.

### 1.2. `img/logo.png` — 1121×767 и 253 КБ, показывается размером 34–42 px

```
img/logo.png  1121x767  253 КБ   ← используется в шапке 17 страниц + hero
.nav-logo{width:40px!important;height:40px!important;…}   /* css/style.css:361 */
```

**Фикс.** Экспорт 160×160 WebP/AVIF + `srcset`, либо SVG. Экономия ~245 КБ на
каждую из 21 страницы (и 253 КБ из precache).

### 1.3. Нет минификации и сборки вообще

```
css/style.css   raw 248 КБ  gz  51 КБ
js/utils.js     raw 613 КБ  gz 153 КБ
js/admin.js     raw 430 КБ  gz  96 КБ
js/start-admin.js raw 313 КБ  gz  78 КБ
```

Корневого `package.json` нет, сборщика нет, версии держатся руками через
`?v=NN` в HTML и в `sw.js`. Сами версии, к слову, сейчас синхронны —
проверка «ассеты страниц vs precache» расхождений не нашла, это хорошо.

`js/utils.js` грузят **20 из 21** страниц, и в нём смешаны i18n-словарь,
навигация, тосты, модалки, математика WHS, печать, PNG-экспорт, GPS-дальномер
и head-to-head. 153 КБ gzip — это то, что телефон качает перед показом любой страницы.

**Фикс (по возрастанию цены):**
1. Добавить минимальный build (esbuild/terser) → `dist/`, в `sw.js` складывать минифицированное.
2. Вынести i18n-словарь (`js/utils.js:535`) в отдельный файл и грузить лениво для не-ru.
3. Разделить `utils.js` на `core` (навигация/тосты/форматтеры) и `scoring` (WHS, печать, PNG, GPS).

### 1.4. Шрифты и Font Awesome всегда с сети

`sw.js:57` пропускает мимо кэша всё чужое по origin, и отдельно `googleapis.com`:

```js
if (!isSameOrigin || requestUrl.hostname.indexOf('firebaseio.com') !== -1 ||
    requestUrl.hostname.indexOf('googleapis.com') !== -1 || …) return;
```

То есть `fonts.googleapis.com`, `fonts.gstatic.com` и
`cdnjs.cloudflare.com/.../font-awesome` не кэшируются SW никогда.
Замер: `fonts.googleapis.com` подключают **21 из 21** страниц,
Font Awesome с cdnjs — **20 из 21** (кроме `qr-start.html`).

Последствие на поле без сети: иконки Font Awesome пропадают, а нижний таббар
(`js/utils.js:2291-2295`) состоит ровно из иконок + подписей 9.5px — остаётся
мелкий текст без пиктограмм.

**Фикс.** Положить `font-awesome` локально в `vendor/` (как уже сделано для
pdf.js) и добавить его в precache; для шрифтов — `cache.put` в обработчике
`fetch` для `fonts.gstatic.com` (immutable-контент, кэшируется безопасно).

### 1.5. `loading="lazy"` не используется нигде

`grep -ro 'loading="lazy"' *.html js/*.js` → 0. Сейчас картинок мало (только
логотип), но как только появятся фото лунок в «Книге поля» — это станет
заметно. Зафиксировать как соглашение заранее.

---

## 2. Тактильность и эргономика (P1)

### 2.1. 67 правил `:hover` и ноль защит `@media (hover: hover)`

```
grep -c ':hover'        css/style.css  → 67
grep -c 'hover:hover'   css/style.css  → 0
```

На сенсорном экране hover «залипает» после тапа. Особенно заметно:

- `.btn:hover{transform:translateY(-2px)}` (`css/style.css:406`) — кнопка
  остаётся «приподнятой» после нажатия;
- `.score-minus:hover` / `.score-plus:hover` (`css/style.css:704-705`) — после
  тапа кнопки остаются подсвечены синим/красным;
- `.stat:hover{transform:translateY(-4px)}` (`css/style.css:451`).

**Фикс.** Обернуть все декоративные hover-эффекты в `@media (hover: hover) and (pointer: fine)`.
Это одна механическая правка, она ничего не ломает на десктопе.

### 2.2. Touch-таргеты меньше 44px

Значения взяты прямо из объявлений в `css/style.css`:

| элемент | объявление | строка | ≈высота |
|---|---|---|---|
| `.modal-close` | `font-size:24px;line-height:1`, padding нет | 881 | ~24px |
| `.mobile-drawer-close` | `padding:4px 8px;font-size:28px` | 1152 | ~36px |
| `.admin-tab` (14 вкладок) | `padding:10px 18px;font-size:12px` | 866 | ~38px |
| `.tn-tab` на ≤520px | `padding:5px 9px;font-size:11.5px` | 4894 | ~27px |
| `.shb-hole-btn` (пропущенные лунки) | `min-height:36px` | 5207 | 36px |
| `.pe-table input/select` | `min-height:36px` | 5406 | 36px |
| `.sun-mode-btn, .lang-btn` на ≤360px | `padding:2px 4px;font-size:9px` | 1423 | ~17px |
| `body.st-scoring-v3 .score-minus` | `42px !important` | 5230 | 42px |

Кнопки переключения «Солнце» и «RU/EN» на узких экранах — самые мелкие
интерактивные элементы в приложении, и при этом «Солнце» критично именно на
поле при ярком свете.

**Фикс.** Для `.btn`, `.admin-tab`, `.tn-tab`, `.modal-close`,
`.mobile-drawer-close`, `.sun-mode-btn`, `.lang-btn` в блоке
`@media (pointer: coarse)` задать `min-height:44px; min-width:44px`, а размер
картинки/текста уменьшать отдельно от размера области нажатия.

### 2.3. Мелкий текст

`137` объявлений `font-size` в `css/style.css` меньше 11px (из 647):
`9px — 35`, `9.5px — 13`, `10px — 58`, `10.5px — 22`. Примеры критичных мест:
подписи нижнего таббара 9.5px (`css/style.css:5459`), `.tn-group-kind` 9.5px
на ≤640px (`4906`), погода в шапке 9px на ≤360px (`1422`).

На солнце это не читается. Есть режим `body.large-ui` (`css/style.css:2513-2522`,
переключается игроком), но по умолчанию текст мелкий.

**Фикс.** Ввести пол `--fs-min: 11px` и запретить в мобильных медиа-запросах
значения меньше него; «Солнечный режим» дополнительно поднимать до 13px.

### 2.4. Админка: 14 вкладок стопкой и без закрепления

`admin.html:88-101` — 14 кнопок `.admin-tab`. Контейнер:

```css
.admin-tabs{display:flex;gap:4px;margin-bottom:20px;flex-wrap:wrap;overflow-x:auto;}
```

`flex-wrap:wrap` + `white-space:nowrap` на кнопках → на 375px это 4–5 рядов
по ~38px, то есть ~180px экрана занято только переключателем. При этом
`position:sticky` у `.admin-tabs` нет (проверено: в `css/style.css` всего два
`position:sticky` — строки 1644 и 5404, оба к админ-вкладкам отношения не имеют).
Прокрутил страницу — чтобы сменить вкладку, надо листать обратно наверх.

**Фикс.** На ≤768px: `flex-wrap:nowrap` + горизонтальный скролл со snap,
`position:sticky; top:var(--nav-h)`, активную вкладку автопрокручивать в центр.
Либо заменить на `<select>`/bottom-sheet со списком разделов.

### 2.5. `hole-nav` — гибрид сетки и flex-полосы

```css
.hole-nav{display:grid;grid-template-columns:repeat(9,1fr);gap:5px;margin:14px 0;}   /* 677 */
@media(max-width:768px){ .hole-nav{grid-template-columns:repeat(6,1fr);} }            /* 1258 */
@media(max-width:360px){ .hole-nav{grid-template-columns:repeat(9,1fr)!important;} }  /* 1424 */
@media(max-width:768px){ .hole-nav{overflow-x:auto;scroll-snap-type:x mandatory;…} }  /* 5483 */
@media(max-width:768px){ .hole-nav .hole-btn{flex:0 0 auto;min-width:48px;…} }        /* 5485 */
```

Контейнер — grid, поэтому `flex:0 0 auto` у дочерних `.hole-btn` (строка 5485)
не делает ничего. Горизонтальный скролл получается «случайно»: `min-width:48px`
расталкивает колонки `1fr` шире экрана. Количество колонок задаётся в трёх
местах, и на 481–768px их 6 (три ряда по 18 лунок), а на ≤360px — 9.

**Фикс.** Выбрать одну модель. Для телефона логичнее flex-полоса:
`display:flex; overflow-x:auto; scroll-snap-type:x mandatory`, колонки из grid
убрать совсем, активную лунку центрировать (код прокрутки уже есть —
`js/utils.js:2329-2340`).

---

## 3. Клавиатура и ввод (P2)

### 3.1. `inputmode` почти не используется

```
grep -ro 'inputmode' *.html js/*.js  → 2 вхождения на весь проект
grep -ro 'enterkeyhint' …            → 0
```

При этом поля гандикапа — текстовые, телефон открывает полную QWERTY:

| место | поле |
|---|---|
| `js/live.js:186` | `pl-hcp-N`, `placeholder="+2.4 / 12.4"` |
| `js/utils.js:5371` | `edit-hcp` |
| `js/start-admin.js:1401` | `ps-m-hcp` |
| `js/start-admin.js:3663` | `ps-ga-hcp-N` |
| `admin.html:458` | `adm-new-hcp` |
| `handicap.html:71` | `calc-hcp` |
| `setup-round.html:209` | `s-exact-hcp` |
| `js/utils.js:5379` | `edit-phone`, `placeholder="+7 (999) 000-00-00"` |

И только в двух местах сделано правильно: `js/tournaments.js:1458`
(`inputmode="decimal"`) и `js/utils.js:5798` (`type="tel" inputmode="numeric"`).

**Фикс.** Гандикапы → `inputmode="decimal"`, телефоны → `type="tel" inputmode="tel"`,
номера лунок и счёт → `inputmode="numeric" enterkeyhint="next"`.
Важно именно `inputmode`, а не `type="number"`: `type="number"` на iOS не даёт
ввести «+2.4» (нет «+»), а для полей с отрицательным гандикапом это критично.

### 3.2. `autocomplete` расставлен выборочно

`auth.html` оформлен хорошо (`username email`, `current-password`,
`new-password`, `name`). В `admin.html` на 54 поля `<input>` приходится ровно
три атрибута `autocomplete`: один `current-password` (`admin.html:70`) и два
`autocomplete="off"`. Поле `adm-new-email` (`admin.html:452`) — без
`autocomplete="email"`, `adm-new-name` (`admin.html:448`) — без
`autocomplete="name"`.

---

## 4. Диалоги и копирование (P2)

### 4.1. 37 нативных `confirm()` и 6 `prompt()`

```
js/admin.js:19   js/start-admin.js:14   js/utils.js:2
js/tournaments.js:1  js/solo.js:1  js/pwa.js:1  js/pe-edit.js:1  js/live.js:1  js/auth.js:1
итого: confirm( × 37, prompt( × 6, alert( × 0
```

Нативные диалоги в standalone-PWA на iOS выглядят чужеродно, не локализованы
по стилю, не дают кнопки «Отмена / Удалить» с понятными подписями, и их нельзя
ни стилизовать, ни привязать к safe-area. Есть места с двойным `confirm()`
подряд (`js/admin.js:985`, `js/admin.js:1021`) — на телефоне это два модальных
окна подряд.

При этом свой визуальный язык модалок в проекте уже есть
(`openFinishConfirmModal`, `pestovoShowSkipChoiceModal`,
`openPlayerProfileModal` и ещё ~7 пар `open*/close*` в `js/utils.js`),
но **общего примитива нет** — `grep 'function openModal\|function showModal' js/*.js`
не находит ничего. Каждая модалка написана заново, и мобильное поведение
(scroll-lock, safe-area, поведение при открытой клавиатуре) у каждой своё.

**Фикс.** Один `uiConfirm({title, text, confirmLabel, danger})` →
bottom-sheet на телефоне / центрированная модалка на десктопе. Заменить 37
вызовов механически.

### 4.2. Копирование ссылки через `prompt()`

`js/start-admin.js:5019,5022,5025`:

```js
window.prompt(psL('Скопируйте ссылку:', 'Copy the link:'), url);
```

На телефоне длинный URL в `prompt` — это неудобно. Причём `navigator.clipboard`
в проекте уже используется (`js/start-admin.js:5015`), а `navigator.share` —
в `js/utils.js:7787,7873,7959`.

**Фикс.** «Поделиться» → `navigator.share({url})` с фолбэком на
`clipboard.writeText` + тост «Ссылка скопирована».

---

## 5. Архитектура: почему мобильные правки ломаются (P1)

### 5.1. Один CSS-файл, 802 `!important`, 15+ брейкпоинтов

```
grep -o '!important' css/style.css | wc -l   → 802 вхождения на 639 строках
grep -c '{'          css/style.css           → 2070 правил
grep -c '@media'     css/style.css           → 52
```

Используемые брейкпоинты: 360, 380, 480, 520, 560, 600, 640, 680, 700, 720,
760, 768, 900 (плюс `min-width` 600/601/720/769). Одинаковые значения записаны
по-разному — `max-width:768px` (8 раз) и `max-width: 768px` (1 раз),
`max-width:480px` (3) и `max-width: 480px` (7).

Именно это породило баг 0.3 (пять конкурирующих `!important` на одну кнопку)
и делает невозможным предсказать результат правки. Плюс форма ввода описана
тремя конфликтующими `!important`-блоками: `height:38px` на ≤480px
(`css/style.css:1267`), `height:44px` на ≤768px (`css/style.css:2266`) и
`min-height:48px` у `.rg-search-row .form-input` (`css/style.css:2223`).

**Фикс.**
1. Зафиксировать 4 брейкпоинта: `≤380`, `≤600`, `≤900`, `≥901`.
2. Свести размеры к CSS-переменным (`--tap: 44px`, `--tap-lg: 56px`,
   `--fs-sm/base/lg`, `--gap-*`) и запрещать `!important` вне слоёв пресетов.
3. Добавить линтер (stylelint `declaration-no-important` + `media-feature-name-allowed-list`).
4. Свести три системы темизации в одну — см. 5.2.

### 5.2. Три параллельные системы оформления — и одна из них уже правильная

Замер по файлам:

| файл | правил | `!important` | CSS-переменных |
|---|---|---|---|
| `css/design-presets.css` | 272 | **3** | **67** |
| `css/style.css` | 2070 | 802 | 28 |

`design-presets.css` написан образцово: атрибуты `[data-dsp="1..5"]`,
`[data-dspb-<блок>]`, а специфичность поднимается намеренным удвоением
`[data-dsp-mode][data-dsp-mode]` до (0,4,0) — **вместо `!important`**
(это прямо описано в шапке файла, строки 19-21). Ставит атрибуты `js/design-system.js`.

Рядом с ним живут ещё две системы на классах `<body>`, обе в `style.css`
и обе на `!important`:

```js
js/utils.js:6857  document.body.classList.toggle('pd-' + page + '-v' + v, cur === v);
js/utils.js:7182  document.body.classList.toggle('st-' + name + '-v' + v, cur === v);
```

`body.pd-*` — 119 правил, `body.st-*` — 71 правило. Именно они дают
баг 0.3: пресет перебивает мобильную адаптацию через `!important`.

**Фикс.** Мигрировать `pd-*`/`st-*` на механизм `[data-dspb-*]` из
`design-presets.css`, где специфичность управляемая, а размеры берутся из
переменных. Это устраняет целый класс регрессий «пресет сломал мобильную вёрстку».

### 5.3. Навигация ведётся в трёх местах и дублируется в 16 файлах

- десктоп-меню `.nav-menu` — 12 ссылок, разметка скопирована в 16 HTML-файлов
  (сверка нормализованных блоков `<nav>`: различается только класс `active`);
- мобильный drawer — те же 12 ссылок строками в `js/utils.js:2546-2565`;
- нижний таббар — 5 пунктов, `js/utils.js:2291-2295`.

Сейчас списки совпадают, но любое добавление страницы надо делать в трёх
местах + в 16 файлах. Ровно так и появляются расхождения.

**Фикс.** Один массив `PESTOVO_NAV` в `js/utils.js`, из него рендерятся все
три представления; в HTML остаётся только `<div id="nav-mount">`.

### 5.4. Мёртвый CSS

Классы, у которых есть стили, но нет ни одного использования в HTML/JS:

| класс | правил в CSS | использований в HTML/JS |
|---|---|---|
| `.score-par-btn` | 6 | **0** |

И «полуживой»: `.p0-wizard-steps` (7 правил) — разметка не создаётся из-за
бага 0.1.

Мёртвые правила — не только лишний вес: `.score-par-btn` получает
`!important`-переопределения в мобильном блоке (`css/style.css:1402`,
`css/style.css:2277`), которые невозможно проверить, потому что элемента нет.

### 5.5. Long-press навешивается один раз и только на статичную разметку

`js/utils.js:2347-2365` делает `document.querySelectorAll('.score-minus')`
один раз при инициализации. На `scorer.html` кнопки статичные — работает.
Но блоки, дорисованные позже (`js/live.js`, `js/solo.js` после загрузки данных),
long-press и вибрацию не получат. Плюс обработчики не делегированы: 2 слушателя
на каждую кнопку × 2 кнопки × N игроков.

**Фикс.** Один делегированный обработчик на `document` по селектору
`.score-minus, .score-plus` с `touchstart/touchend/touchcancel`.

### 5.6. Глухие `catch(e){}`

`initP0MobileEnhancements()` целиком обёрнут в `try{…}catch(e){}`
(и вызывается так же — `js/utils.js:1625, 11419, 11421`). Именно поэтому
`ReferenceError` из бага 0.1 не виден ни в консоли, ни в тестах.
Замер: `grep -ro 'catch(e){}\|catch (e) {}' js/*.js` → **303** пустых
перехвата на весь `js/`, из них **96** в `js/utils.js`.

**Фикс.** Минимум `catch(e){ console.warn('[init]', e); }` — это стоит ноль
строк и уже поймало бы все три бага из раздела 0.

---

## 6. Что уже сделано хорошо (не трогать)

Чтобы аудит не выглядел односторонним — эти вещи на уровне:

- `viewport` c `viewport-fit=cover` на 20 из 21 страниц (исключение —
  `qr-start.html:5`, там без `viewport-fit`).
- `env(safe-area-inset-*)` применён системно: 20+ мест, включая нижний таббар,
  drawer, модалки, toast, `.p0-sticky-actions`.
- Динамическая высота шапки через CSS-переменную `--nav-h` и `visualViewport`
  (`js/utils.js:2466-2468`, `applyNavHeight`) — редкая и правильная практика.
- `100dvh/svh` с фолбэком на `100vh` (`css/style.css:826-827, 1128-1129, 396`).
- `@media (prefers-reduced-motion)` (`css/style.css:2324`).
- `-webkit-text-size-adjust:100%`, `overflow-x:clip` на `html,body`,
  `overscroll-behavior:contain` в модалках (`css/style.css:2296-2302`).
- `font-size:16px !important` на инпутах для защиты от автозума iOS
  (`css/style.css:1267`).
- Экран не гаснет во время раунда: Screen Wake Lock + уважение к режиму
  экономии батареи (`js/utils.js:acquireWakeLockIfAllowed`, `isBatterySaverEnabled`).
- Полноценный офлайн: очередь записей в `localStorage` с дедупликацией по
  ключу `roundId|playerId|hole`, бейдж очереди, автосинхронизация по `online`
  и по таймеру (`js/pwa.js:86-265`).
- `stale-while-revalidate` для статики и network-first для документов (`sw.js:69-104`).
- Версии `?v=NN` в HTML и в `sw.js` синхронны — рассинхрона нет.
- Режимы «Солнце», «Крупный интерфейс», «Высокий контраст», «Экономия батареи»
  переключаются игроком (`js/utils.js:2077-2125`).
- `touch-action:manipulation` на кнопках — нет задержки 300ms и двойного тапа.
- `:focus-visible` стили есть, в том числе для солнечного режима
  (`css/style.css:3821-3829`).
- Таблица лидерборда превращается в карточки на мобильных (`.lb-cards`,
  `css/style.css:3778`).
- Все 24 теста `tools/test-*.js` проходят (проверено: установлены зависимости,
  `NODE_PATH=… node tools/test-*.js` → 24 PASS, 0 SKIP).

---

## 7. Порядок работ

**Сегодня (часы):**
1. Баг 0.1 — `isEn` + шеврон + `display:none` под медиа-запрос. *Ломает ввод раунда.*
2. Баг 0.2 — `removeAttribute('onclick')` у клона. *Двойная запись счёта.*
3. Баг 0.3 — переменная `--score-btn-size`, удалить инлайн-стили из `setup-round.html:344`.
4. Убрать из `STATIC_ASSETS` PDF, pdf.js, `admin.js`, `start-admin.js` → 12 МБ ⇒ ~2.5 МБ.
5. Заменить `img/logo.png` на 160px-версию.

**На этой неделе (дни):**
6. `inputmode`/`enterkeyhint` на всех числовых полях (8 мест из таблицы 3.1).
7. `@media (hover: hover)` вокруг декоративных hover-эффектов.
8. `min-height:44px` для таргетов из таблицы 2.2.
9. `uiConfirm()` bottom-sheet и замена 37 `confirm()`.
10. Админ-вкладки: sticky + горизонтальный скролл.
11. `console.warn` во все пустые `catch(e){}` в `js/utils.js`.

**Дальше (недели):**
12. Разделить `js/utils.js`, добавить минификацию.
13. Единый `PESTOVO_NAV` вместо трёх списков.
14. Четыре брейкпоинта + CSS-переменные + stylelint.
15. Мигрировать `body.pd-*`/`body.st-*` на механизм `[data-dspb-*]` из
    `css/design-presets.css` (см. 5.2).
16. `hole-nav` перевести на flex-полосу.

---

## 8. Статус исправлений — v1.68.0

Выполнено и покрыто регрессионным тестом `tools/test-mobile-p0.js`:

- **0.1** `isEn` объявлен, тернар исправлен, шеврон добавлен (`js/live.js:176`),
  аккордеон обёрнут в `@media(max-width:768px)`, глухой `catch` логирует.
- **0.2** `clone.removeAttribute('onclick')` → `saveSc()` один раз за тап.
- **0.3** единая переменная `--score-btn` + страховка `min:44px!important`;
  пресет «Компакт» 42px → 48px; мёртвые инлайн-стили из `setup-round.html` убраны.
- **1.1** предкэш 12.0 → 2.1 МБ (PDF, pdf.js, admin/start-admin/pe-edit/qr-start
  исключены); CDN-шрифты и Font Awesome кэшируются stale-while-revalidate.
- **1.2** `img/logo.png` 1121×767/253 КБ → 560×383/40 КБ (256 цветов, без потерь для плоского лого).
- **2.1** hover-сдвиги отключены на `(hover:none)/(pointer:coarse)`.
- **2.2** touch-таргеты ≥44px для `.tn-tab`, `.admin-tab`, модалок, «Солнце/RU».
- **2.4** админ-вкладки: липкая горизонтальная полоса + автоскролл активной.
- **2.5** `hole-nav` на телефоне — flex-полоса со snap (убраны мёртвые grid-колонки).
- **3.1** `inputmode="decimal"`/`tel` на всех полях гандикапа и телефона.
- **3.2** `autocomplete` для имени/email/телефона в админке.
- **4.2** копирование ссылки: `navigator.share` → clipboard → (фолбэк prompt).
- **5.4** удалён мёртвый `.score-par-btn` (6 правил).
- **5.5** long-press делегирован на `document` (работает для дорисованных кнопок).
- **5.6** 395 глухих `catch(e){}` теперь пишут `console.warn`.
- Добавлен примитив `uiConfirm()` (bottom-sheet) для будущих диалогов.
- Версия сайта: **1.68.0** во всех футерах и в `CACHE_NAME`.

Осознанно отложено (требует отдельного PR / инфраструктуры, не ломающие правки):

- **1.3** минификация и сборка — нужен build-шаг в пайплайне деплоя.
- **4.1** миграция 37 нативных `confirm()` на `uiConfirm()` — асинхронная
  перестройка всех обработчиков админки, высокий риск регрессий.
- **5.2** полный перенос `body.pd-*`/`body.st-*` на `[data-dspb-*]`.
- **5.3** единый источник навигации вместо дублей в 16 HTML.
