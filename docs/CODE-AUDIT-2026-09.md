# Итоговый отчёт аудита кодовой базы (2026-09)

Полный ручной аудит: логика, функционал, дубликаты, XSS, мёртвый код, правила БД.
Существующие тесты не использовались как критерий (по требованию) — код читался напрямую.
Все исправления разделены на 4 коммита; тесты (`npm test`, 51) и `check:bundle` зелёные на каждом шаге.

## Коммиты

| Коммит | Содержание |
|---|---|
| `4afbe86` | Логика: дубль-записи admin-alerts, дубли i18n-ключей, live.js:1165, makeFlights в tn-engine, audienceOf в functions, текст score-audit |
| `744eccf` | Rules: alerts/markers/markerAssignments; pwa.js — потеря отклонённых permission-запросов; clamp в admin-scoreedit; COURSE_RATINGS; тест score-queue |
| `0570c1b` | Явные тосты об ошибках при завершении раунда (live.js, solo.js) + docs/SECURITY-RULES.md |
| `b2277e8` | Безопасность: tnJsStr (XSS в onclick), экранирование имени маркера (app.js, live.js), лимиты рассылок 200/1000 + .catch, rollback Auth-аккаунта при провале записи профиля, admCsvCell (CSV-инъекция), рабочий backup (per-node reads), encodeURIComponent для data-URI |

## Исправленные баги (ключевые)

1. **XSS в onclick (tournaments.js)** — `escapeHtml` внутри JS-строки в атрибуте `onclick` небезопасен: HTML-сущности декодируются ДО компиляции JS, `&#39;` → `'` снова открывает строку. Вектор реален: `normalizeSearchText` сохраняет `'`/`"` в fioKey. Заменено на `tnJsStr()` (JS-экранирование) в 10 местах.
2. **XSS через имя маркера (app.js:519, live.js:2073)** — `markerNote` вставлял `privacyDisplayName(...)` без экранирования в HTML. Соседние строки экранировали, эти — нет.
3. **CSV-инъекция + битый экспорт (admin-exports.js)** — поля Excel/CSV не экранировались (`=cmd|...` формула-инъекция); `encodeURI` обрезал data-URI на `#` в ФИО; запятые в EN-датах сдвигали колонки. Добавлен `admCsvCell()`, BOM + `encodeURIComponent`.
4. **Кнопка «JSON backup» была мертва** — `db.ref().once('value')` всегда `permission_denied` (root `.read: false`). Переписана на последовательные чтения 14 узлов со сбором ошибок.
5. **Регистрация без профиля (auth.js)** — при провале записи профиля аккаунт Auth оставался навсегда без имени/HCP; добавлен откат `c.user.delete()` + локализованная ошибка.
6. **Рассылки (admin-broadcasts.js)** — клиентская валидация title ≤200 / body ≤1000 (зеркало `.validate` правил), `.catch` с тостами на оба пути `push()`.
7. **Тихие отказы завершения раунда** — `.catch(() => {})` заменены на явные тосты об ошибке.
8. Прочее по batch 1–2: двойные записи алертов, 5 дублей i18n-ключей, отсутствие клампа счёта, офлайн-очередь PWA, правила markers/alerts.

## Проверено и признано корректным (без изменений)

- WHS-математика и таблицы HCP (utils.js), серверная модель score-write/score-audit, sw.js кэш, leaderboard.js, сортировки protocol.js, firebase.json CSP, manifest.json, самодостаточность qr-start.js, арифметика дедлайнов лунок (полуночи безопасны), admin-agr (внешние данные AGR экранируются), tn-scorecard (18× esc), app.js — имена повсюду через escapeHtml, scorer.js 400-440 (числа/классы), tn-wizard.js (полный проход: tnwEsc, валидация, publish-цепочка, scheduled-самоопубликование при открытии админки), live.js 1600–2295 (сигнатурные кэши уже включают currentLang).
- **tn-engine LeaderboardService**: знаки сортировки верны для обоих направлений (low/high), тай-брейки (countback/last-hole/stroke-index) согласованы с направлением, разделение мест (1,2,2,4) корректно. В UI пока не используется (жив только Exporters/cfgLabel/deepClone).

## Находки без исправления (решение за владельцем)

- **Приватность**: `users/.read: auth != null` — любой залогиненный читает **email** всех пользователей. Нужна схема `users/$uid/public` без email (миграция).
- Мастер-пароль по умолчанию `55555` (start-admin).
- Аллокация ударов (stroke allocation) реализована в 4 местах — риск расхождения.
- tn-engine: жёсткий лимит ESC 10; `LeaderboardService` даёт `value=0` игроку без лунок (1-е место в stroke-net) — важно до подключения к UI.
- scorer.js ↔ marker.js: 6 копипастных функций уже разошлись деталями.
- `tnwPublishConfig`: при успехе `push()`, но отказе `audit.push()` турнир уже создан, а catch показывает ошибку — повторная попытка создаст дубликат (вероятность низкая, правила однородны).
- `tnwCheckScheduled`: `.catch(() => {})` — самоопубликование повторяется при следующем сохранении (само-заживление), но без уведомления.

## Мёртвый код — финальный вердикт (46 функций)

Проверено улучшенным паттерном `(?<![\w$.])` по всем js/, html/, sw.js, functions/, dist/, src/ (HTML onclick учтён: 66 кандидатов оказались живыми обработчиками). Динамический диспатч исключён (обёртки display-variant заменены универсальной `applyPageDisplayVariant`).

Полный список: applyAllRoundsDisplayVariant, applyHomeDisplayVariant, applyPlayersDisplayVariant, applyStatsDisplayVariant, attachPlayerNameAutocomplete, createTournament, dbSetWithOfflineQueue, dbUpdateWithOfflineQueue, downloadOfficialScorecardPDF, drawHoleGridRow, fmtRoundTeesText, fmtScoreBadge, getHandicapDisplayVariant, getHomeDisplayVariant, getTournamentsDisplayVariant, handlePlayerSelect, hasPendingScoreActions, hcpKey1, invalidateRoundViewCache, liveWhoKey, loadAllRegisteredUsers, normalizeAllRoundsDisplayVariant, normalizeHomeDisplayVariant, normalizePlayersDisplayVariant, normalizeStatsDisplayVariant, onSoloGenderChange, onTournamentSelect, pestovoSkipClearAck, pestovoTeamRoundStats, psAll18Schedule, psResolvedFormat, psSwitchTo, queueOfflineScoreAction, renderHoleProgressBar, rgAddAsNewFromResults, rgUpdateFromResults, saveOfflineScore, savePageDisplayVariant, seClearHole, sharePNGNative, showGroupSkippedHolesWarning, showSkippedHolesWarning, showVerificationIssueToast, testTelegramAlert (живы testTelegramGroupAlert/ChannelAlert), tnScTee, tnTournamentFieldHcp, toastSequence.

Примечание: «потерянных вызовов» не найдено — язык-переключение кэшей live.js покрывается сигнатурой (там есть currentLang), PDF-экспорт и автокомплит — брошенные фичи (FEATURE 3 и пр.), не сломанный UI.

## Верификация

- `npm test` — 51/51 ✔ (после каждого коммита)
- `check:bundle` — dist соответствует src/ ✔
- `rev-assets` — CACHE обновляется, precache 51 ✔
- Node-тесты экранировщиков: tnJsStr (vm roundtrip 8/8, включая `иван'); alert(1)//`), admCsvCell 6/6
