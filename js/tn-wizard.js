// ============================================================
// «НОВАЯ ВЕРСИЯ СОЗДАНИЯ ТУРНИРА» + «НАСТРОЙКИ ПОЛЯ» + «ШАБЛОНЫ»
// ------------------------------------------------------------
// Суб-вкладки внутри существующей вкладки «Турниры» админ-панели
// (#tab-tournaments в admin.html). Существующие механизмы (старое
// создание турнира, список, старт) не меняются и остаются fallback —
// они живут в суб-вкладке «Классика».
//
//   #new-create — мастер создания турнира (10 шагов, черновики,
//                 автосохранение localStorage + Firebase каждые 20 c)
//   #course     — настройки единственного гольф-поля (settings/course)
//   #templates  — шаблоны турниров (tnTemplates)
//
// Доменная логика (WHS, Stableford, тай-брейки, флайты, печать) —
// в js/tn-engine.js (window.TnEngine / window.TN_CONFIG).
// ============================================================

// ------------------------------------------------------------
// СОСТОЯНИЕ
// ------------------------------------------------------------
var tnWiz = {
    step: 0,
    draft: null,          // объект конфигурации текущего черновика
    draftKey: null,       // ключ черновика (localStorage + Firebase)
    dirty: false,
    lastServerSave: 0,
    saveMsg: '',
    subTab: null,         // 'classic' | 'new-create' | 'course' | 'templates'
    drafts: {},           // кэш черновиков (Firebase)
    templates: {},        // кэш шаблонов (Firebase)
    course: null,         // кэш настроек поля
    courseLoaded: false,
    templatesBound: false,
    draftsBound: false,
    courseBound: false,
    previewTab: 'preview' // шаг 10: предпросмотр
};

var TNW_AUTOSAVE_MS = 20000; // серверный автосейв черновика каждые 20 сек

function tnL(ru, en) {
    return (typeof currentLang !== 'undefined' && currentLang === 'en') ? en : ru;
}
function tnwEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
}
function tnwCfgLabel(list, id) {
    return (typeof TnEngine !== 'undefined') ? TnEngine.cfgLabel(list, id, (typeof currentLang !== 'undefined' ? currentLang : 'ru')) : String(id);
}
function tnwToDict(list) { // конфиг-список → {id: локализованный ярлык}
    var d = {};
    (list || []).forEach(function (x) { d[x.id] = tnwCfgLabel(list, x.id); });
    return d;
}

// Чтение/запись по пути 'a.b.c'
function tnwGet(obj, path) {
    return String(path).split('.').reduce(function (o, k) {
        return (o == null) ? undefined : o[k];
    }, obj);
}
function tnwSet(obj, path, value) {
    var keys = String(path).split('.');
    var o = obj;
    for (var i = 0; i < keys.length - 1; i++) {
        if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
        o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
}

function tnwOwnerKey() {
    return (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) ? currentUser.uid : 'master';
}
function tnwAuthorName() {
    if (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.name) return currentUserData.name;
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.email) return currentUser.email;
    return tnL('Мастер-пароль', 'Master password');
}
function tnwDb() {
    return (typeof db !== 'undefined' && db) ? db : null;
}

// ------------------------------------------------------------
// СПРАВОЧНИК ШАГОВ МАСТЕРА (данные → UI; новый шаг/поле = новая запись)
// ------------------------------------------------------------
function tnwSteps() {
    var C = TN_CONFIG;
    return [
        { id: 'info', icon: 'fa-info-circle', titleRu: 'Основная информация', titleEn: 'Basic info', groups: [
            { titleRu: 'Название и описание', titleEn: 'Name & description', fields: [
                { key: 'info.nameRu', type: 'text', labelRu: 'Название (RU) *', labelEn: 'Name (RU) *', required: true },
                { key: 'info.nameEn', type: 'text', labelRu: 'Название (EN)', labelEn: 'Name (EN)' },
                { key: 'info.description', type: 'textarea', labelRu: 'Описание', labelEn: 'Description' },
                { key: 'info.logo', type: 'url', labelRu: 'Логотип (URL)', labelEn: 'Logo (URL)' },
                { key: 'info.banner', type: 'url', labelRu: 'Баннер (URL)', labelEn: 'Banner (URL)' }
            ]},
            { titleRu: 'Классификация', titleEn: 'Classification', fields: [
                { key: 'info.typeId', type: 'select', labelRu: 'Тип турнира', labelEn: 'Tournament type', options: tnwToDict(C.tournamentTypes) },
                { key: 'info.categories', type: 'multi', labelRu: 'Категории', labelEn: 'Categories', options: tnwToDict(C.categories) },
                { key: 'info.level', type: 'select', labelRu: 'Уровень', labelEn: 'Level', options: tnwToDict(C.levels) }
            ]},
            { titleRu: 'Организатор и контакты', titleEn: 'Organizer & contacts', fields: [
                { key: 'info.organizer', type: 'text', labelRu: 'Организатор', labelEn: 'Organizer' },
                { key: 'info.contacts', type: 'list', labelRu: 'Контактные лица', labelEn: 'Contact persons', listFields: [
                    { key: 'name', type: 'text', labelRu: 'ФИО', labelEn: 'Name', width: 2 },
                    { key: 'role', type: 'text', labelRu: 'Роль', labelEn: 'Role' },
                    { key: 'phone', type: 'text', labelRu: 'Телефон', labelEn: 'Phone' },
                    { key: 'email', type: 'text', labelRu: 'Email', labelEn: 'Email' },
                    { key: 'telegram', type: 'text', labelRu: 'Telegram', labelEn: 'Telegram' }
                ] }
            ]},
            { titleRu: 'Регламент клуба', titleEn: 'Club regulations', fields: [
                { key: 'info.dressCode', type: 'text', labelRu: 'Dress code', labelEn: 'Dress code' },
                { key: 'info.paceOfPlay', type: 'text', labelRu: 'Pace of play', labelEn: 'Pace of play' },
                { key: 'info.sanitary', type: 'textarea', labelRu: 'Санитарные требования', labelEn: 'Sanitary requirements' }
            ]}
        ]},
        { id: 'format', icon: 'fa-calendar-alt', titleRu: 'Даты и формат', titleEn: 'Dates & format', groups: [
            { titleRu: 'Раунды (1–4+)', titleEn: 'Rounds (1–4+)', fields: [
                { key: 'format.rounds', type: 'list', labelRu: 'Раунды', labelEn: 'Rounds', required: true, listFields: [
                    { key: 'date', type: 'date', labelRu: 'Дата *', labelEn: 'Date *' },
                    { key: 'title', type: 'text', labelRu: 'Название', labelEn: 'Title', placeholder: 'R1' },
                    { key: 'startTime', type: 'time', labelRu: 'Время старта', labelEn: 'Start time' },
                    { key: 'startType', type: 'select', labelRu: 'Способ старта', labelEn: 'Start type', options: tnwToDict(C.startTypes) }
                ] }
            ]},
            { titleRu: 'Чек-ин и регистрация', titleEn: 'Check-in & registration', fields: [
                { key: 'format.checkIn', type: 'time', labelRu: 'Чек-ин', labelEn: 'Check-in' },
                { key: 'format.regOpen', type: 'date', labelRu: 'Открытие регистрации', labelEn: 'Registration opens' },
                { key: 'format.regClose', type: 'date', labelRu: 'Закрытие регистрации', labelEn: 'Registration closes' }
            ]},
            { titleRu: 'Отсечка (cut)', titleEn: 'Cut rules', fields: [
                { key: 'format.cut.enabled', type: 'bool', labelRu: 'Включить cut', labelEn: 'Enable cut' },
                { key: 'format.cut.afterRound', type: 'number', labelRu: 'После раунда №', labelEn: 'After round #', min: 1, max: 3 },
                { key: 'format.cut.topN', type: 'number', labelRu: 'Топ-N', labelEn: 'Top N', min: 1 },
                { key: 'format.cut.includeTies', type: 'bool', labelRu: 'С учётом ties', labelEn: 'Include ties' }
            ]},
            { titleRu: 'Ти-боксы категорий', titleEn: 'Tee boxes per category', fields: [
                { key: 'format.teeMap', type: 'list', labelRu: 'Соответствие категория → ти', labelEn: 'Category → tee mapping', listFields: [
                    { key: 'category', type: 'text', labelRu: 'Категория/дивизион', labelEn: 'Category/division', width: 2 },
                    { key: 'tee', type: 'select', labelRu: 'Ти-бокс', labelEn: 'Tee box', options: tnwToDict(C.teeBoxes) }
                ], hintRu: 'Само поле настраивается во вкладке «Настройки поля»', hintEn: 'The course itself is managed in the “Course settings” tab' }
            ]},
            { titleRu: 'Local Rules', titleEn: 'Local Rules', fields: [
                { key: 'format.localRules', type: 'textarea', labelRu: 'Местные правила', labelEn: 'Local rules' }
            ]}
        ]},
        { id: 'scoring', icon: 'fa-calculator', titleRu: 'Подсчёт и правила', titleEn: 'Scoring & rules', groups: [
            { titleRu: 'Результат', titleEn: 'Result', fields: [
                { key: 'scoring.resultMode', type: 'select', labelRu: 'Зачёт', labelEn: 'Result mode', options: { gross: tnL('Gross', 'Gross'), net: tnL('Net', 'Net'), both: tnL('Gross + Net', 'Gross + Net') } },
                { key: 'scoring.systems', type: 'multi', labelRu: 'Системы подсчёта *', labelEn: 'Scoring systems *', options: tnwToDict(C.scoringSystems), required: true }
            ]},
            { titleRu: 'Таблицы очков (редактируемые)', titleEn: 'Points tables (editable)', fields: [
                { key: 'scoring.stablefordTable', type: 'pointsTable', labelRu: 'Stableford (0–5+)', labelEn: 'Stableford (0–5+)' },
                { key: 'scoring.modifiedTable', type: 'pointsTable', labelRu: 'Modified Stableford', labelEn: 'Modified Stableford' }
            ]},
            { titleRu: 'Гандикап', titleEn: 'Handicap', fields: [
                { key: 'scoring.hcp.system', type: 'select', labelRu: 'Система', labelEn: 'System', options: tnwToDict(C.handicapSystems) },
                { key: 'scoring.hcp.allowancePct', type: 'number', labelRu: 'Allowance %', labelEn: 'Allowance %', min: 0, max: 100, hintRu: 'Подсказки: 100 / 95 / 85', hintEn: 'Presets: 100 / 95 / 85' },
                { key: 'scoring.hcp.capMax', type: 'number', labelRu: 'Cap (макс. индекс)', labelEn: 'Cap (max index)' },
                { key: 'scoring.hcp.teamWeights', type: 'text', labelRu: 'Team handicap (веса %)', labelEn: 'Team handicap (weights %)', placeholder: '25,20,15,10', hintRu: 'Для scramble / four-ball: от низшего к высшему', hintEn: 'For scramble / four-ball: lowest to highest' },
                { key: 'scoring.hcp.customFormula', type: 'text', labelRu: 'Кастомная формула', labelEn: 'Custom formula', placeholder: 'HI * slope/113 + (CR - par)' }
            ]},
            { titleRu: 'Тай-брейки и ограничения', titleEn: 'Tie-breaks & limits', fields: [
                { key: 'scoring.tieBreaks', type: 'tieOrder', labelRu: 'Приоритет тай-брейков (порядок = приоритет)', labelEn: 'Tie-break priority (order = priority)', options: tnwToDict(C.tieBreaks) },
                { key: 'scoring.maxScoreMode', type: 'select', labelRu: 'Максимум на лунке', labelEn: 'Max score per hole', options: tnwToDict(C.maxScoreModes) },
                { key: 'scoring.pacePenalty', type: 'text', labelRu: 'Штрафы за темп', labelEn: 'Pace of play penalties' },
                { key: 'scoring.dqRules', type: 'textarea', labelRu: 'Правила DQ', labelEn: 'DQ rules' }
            ]}
        ]},
        { id: 'participants', icon: 'fa-users', titleRu: 'Участники', titleEn: 'Participants', groups: [
            { titleRu: 'Регистрация', titleEn: 'Registration', fields: [
                { key: 'participants.methods', type: 'multi', labelRu: 'Способы регистрации', labelEn: 'Registration methods', options: tnwToDict(C.registrationMethods) },
                { key: 'participants.fieldsRequired', type: 'multi', labelRu: 'Обязательные поля заявки', labelEn: 'Required entry fields', options: tnwToDict(C.formFieldCatalog) },
                { key: 'participants.hcpMin', type: 'number', labelRu: 'Гандикап от', labelEn: 'Handicap from' },
                { key: 'participants.hcpMax', type: 'number', labelRu: 'Гандикап до', labelEn: 'Handicap to' },
                { key: 'participants.limit', type: 'number', labelRu: 'Лимит участников (0 = без лимита)', labelEn: 'Participant limit (0 = unlimited)', min: 0, max: 5000 }
            ]},
            { titleRu: 'Модерация и оплата', titleEn: 'Moderation & payment', fields: [
                { key: 'participants.moderation', type: 'select', labelRu: 'Модерация заявок', labelEn: 'Entry moderation', options: { auto: tnL('Автоматически', 'Automatic'), manual: tnL('Вручную', 'Manual') } },
                { key: 'participants.entryFee', type: 'number', labelRu: 'Взнос', labelEn: 'Entry fee' },
                { key: 'participants.paymentInfo', type: 'text', labelRu: 'Реквизиты / платёжная ссылка', labelEn: 'Payment details / link' },
                { key: 'participants.waitlist', type: 'bool', labelRu: 'Waitlist (лист ожидания)', labelEn: 'Waitlist' },
                { key: 'participants.allowTransfers', type: 'bool', labelRu: 'Замены и трансферы (WD/DQ/DNS)', labelEn: 'Substitutions & transfers (WD/DQ/DNS)' }
            ]},
            { titleRu: 'Квоты', titleEn: 'Quotas', fields: [
                { key: 'participants.quotas', type: 'list', labelRu: 'Квоты', labelEn: 'Quotas', listFields: [
                    { key: 'type', type: 'select', labelRu: 'Тип', labelEn: 'Type', options: { club: tnL('Клуб', 'Club'), region: tnL('Регион', 'Region'), category: tnL('Категория', 'Category') } },
                    { key: 'value', type: 'text', labelRu: 'Значение', labelEn: 'Value', width: 2 },
                    { key: 'count', type: 'number', labelRu: 'Макс. мест', labelEn: 'Max places' }
                ] }
            ]}
        ]},
        { id: 'flights', icon: 'fa-layer-group', titleRu: 'Флайты и tee times', titleEn: 'Flights & tee times', groups: [
            { titleRu: 'Формирование', titleEn: 'Formation', fields: [
                { key: 'flights.auto', type: 'bool', labelRu: 'Авто-формирование флайтов', labelEn: 'Auto-generate flights' },
                { key: 'flights.by', type: 'select', labelRu: 'Критерий', labelEn: 'Criterion', options: tnwToDict(C.flightCriteria) },
                { key: 'flights.flightSize', type: 'number', labelRu: 'Игроков во флайте', labelEn: 'Players per flight', min: 2 },
                { key: 'flights.groupSize', type: 'select', labelRu: 'Группы по', labelEn: 'Group size', options: { '2': '2', '3': '3', '4': '4' } },
                { key: 'flights.rePairing', type: 'bool', labelRu: 'Re-pairing после каждого раунда (по лидерборду)', labelEn: 'Re-pairing after each round (by leaderboard)' }
            ]},
            { titleRu: 'Расписание', titleEn: 'Schedule', fields: [
                { key: 'flights.scheduleType', type: 'select', labelRu: 'Способ старта', labelEn: 'Start type', options: tnwToDict(C.startTypes) },
                { key: 'flights.firstTeeTime', type: 'time', labelRu: 'Первый старт', labelEn: 'First tee time' },
                { key: 'flights.intervalMin', type: 'number', labelRu: 'Интервал, мин', labelEn: 'Interval, min', min: 4, max: 20, hintRu: 'Учитывается pace of play поля', hintEn: 'Aligned with course pace of play' }
            ]}
        ]},
        { id: 'officials', icon: 'fa-whistle', titleRu: 'Судейство', titleEn: 'Officiating', groups: [
            { titleRu: 'Судейская команда', titleEn: 'Officials', fields: [
                { key: 'officials.list', type: 'list', labelRu: 'Судьи и персонал', labelEn: 'Officials & staff', listFields: [
                    { key: 'name', type: 'text', labelRu: 'ФИО', labelEn: 'Name', width: 2 },
                    { key: 'role', type: 'select', labelRu: 'Роль', labelEn: 'Role', options: tnwToDict(C.officialRoles) },
                    { key: 'assign', type: 'text', labelRu: 'Назначение (группы/лунки)', labelEn: 'Assignment (groups/holes)', width: 2 }
                ] }
            ]},
            { titleRu: 'Электронный скоринг', titleEn: 'Electronic scoring', fields: [
                { key: 'officials.eScoring', type: 'bool', labelRu: 'Электронное судейство (планшет/телефон)', labelEn: 'Electronic officiating (tablet/phone)' },
                { key: 'officials.selfScoring', type: 'bool', labelRu: 'Self-scoring игроками', labelEn: 'Player self-scoring' },
                { key: 'officials.markerConfirm', type: 'bool', labelRu: 'Подтверждение маркером', labelEn: 'Marker confirmation' }
            ]}
        ]},
        { id: 'prizes', icon: 'fa-medal', titleRu: 'Призы и финансы', titleEn: 'Prizes & finance', groups: [
            { titleRu: 'Призовой фонд', titleEn: 'Prize fund', fields: [
                { key: 'prizes.fund', type: 'number', labelRu: 'Призовой фонд', labelEn: 'Prize fund' },
                { key: 'prizes.distribution', type: 'list', labelRu: 'Распределение по местам', labelEn: 'Prize distribution', listFields: [
                    { key: 'place', type: 'number', labelRu: 'Место', labelEn: 'Place', min: 1 },
                    { key: 'pct', type: 'number', labelRu: '% фонда', labelEn: '% of fund', min: 0, max: 100 }
                ] },
                { key: 'prizes.nominations', type: 'multi', labelRu: 'Номинации', labelEn: 'Nominations', options: tnwToDict(C.nominations) },
                { key: 'prizes.nominationHoles', type: 'list', labelRu: 'Лунки номинаций (LD / CtP / HIO)', labelEn: 'Nomination holes (LD / CtP / HIO)', listFields: [
                    { key: 'nomination', type: 'select', labelRu: 'Номинация', labelEn: 'Nomination', options: { 'longest-drive': 'Longest Drive', 'closest-to-pin': 'Closest to Pin', 'hole-in-one': 'Hole-in-One' } },
                    { key: 'hole', type: 'number', labelRu: 'Лунка №', labelEn: 'Hole #', min: 1, max: 18 }
                ] },
                { key: 'prizes.awards', type: 'multi', labelRu: 'Награды', labelEn: 'Awards', options: tnwToDict(C.awardTypes) }
            ]},
            { titleRu: 'Бюджет', titleEn: 'Budget', fields: [
                { key: 'prizes.budget', type: 'list', labelRu: 'Доходы и расходы (green fees, cart, catering, призы)', labelEn: 'Income & expenses (green fees, cart, catering, prizes)', listFields: [
                    { key: 'kind', type: 'select', labelRu: 'Тип', labelEn: 'Kind', options: { income: tnL('Доход', 'Income'), expense: tnL('Расход', 'Expense') } },
                    { key: 'item', type: 'text', labelRu: 'Статья', labelEn: 'Item', width: 2 },
                    { key: 'amount', type: 'number', labelRu: 'Сумма', labelEn: 'Amount' }
                ] }
            ]},
            { titleRu: 'Спонсоры', titleEn: 'Sponsors', fields: [
                { key: 'prizes.sponsors', type: 'list', labelRu: 'Спонсоры и холь-спонсоры', labelEn: 'Sponsors & hole sponsors', listFields: [
                    { key: 'name', type: 'text', labelRu: 'Название', labelEn: 'Name' },
                    { key: 'logoUrl', type: 'url', labelRu: 'Логотип (URL)', labelEn: 'Logo (URL)' },
                    { key: 'link', type: 'url', labelRu: 'Ссылка', labelEn: 'Link' },
                    { key: 'level', type: 'select', labelRu: 'Уровень', labelEn: 'Level', options: tnwToDict(C.sponsorLevels) },
                    { key: 'hole', type: 'number', labelRu: 'Лунка №', labelEn: 'Hole #', min: 1, max: 18 }
                ] }
            ]},
            { titleRu: 'Взносы и промокоды', titleEn: 'Fees & promo codes', fields: [
                { key: 'prizes.fees', type: 'list', labelRu: 'Взносы / скидки', labelEn: 'Fees / discounts', listFields: [
                    { key: 'title', type: 'text', labelRu: 'Название', labelEn: 'Title', width: 2 },
                    { key: 'amount', type: 'number', labelRu: 'Сумма', labelEn: 'Amount' }
                ] },
                { key: 'prizes.promoCodes', type: 'list', labelRu: 'Промокоды', labelEn: 'Promo codes', listFields: [
                    { key: 'code', type: 'text', labelRu: 'Код', labelEn: 'Code' },
                    { key: 'discountPct', type: 'number', labelRu: 'Скидка %', labelEn: 'Discount %', min: 0, max: 100 }
                ] }
            ]}
        ]},
        { id: 'media', icon: 'fa-broadcast-tower', titleRu: 'Трансляции и медиа', titleEn: 'Broadcast & media', groups: [
            { titleRu: 'Публичный лидерборд', titleEn: 'Public leaderboard', fields: [
                { key: 'media.slug', type: 'text', labelRu: 'Slug (URL)', labelEn: 'Slug (URL)', placeholder: 'pestovo-open-2026' },
                { key: 'media.isPublic', type: 'bool', labelRu: 'Открытый доступ live-лидерборда', labelEn: 'Public live leaderboard access' }
            ]},
            { titleRu: 'Трансляции', titleEn: 'Streams', fields: [
                { key: 'media.streams', type: 'list', labelRu: 'Ссылки на трансляции', labelEn: 'Stream links', listFields: [
                    { key: 'title', type: 'text', labelRu: 'Название', labelEn: 'Title', width: 2 },
                    { key: 'url', type: 'url', labelRu: 'URL', labelEn: 'URL', width: 2 },
                    { key: 'groupName', type: 'text', labelRu: 'Группа (если не общая)', labelEn: 'Group (if not general)' }
                ] }
            ]},
            { titleRu: 'Медиа и соцсети', titleEn: 'Media & social', fields: [
                { key: 'media.galleryUrl', type: 'url', labelRu: 'Фотогалерея (URL)', labelEn: 'Photo gallery (URL)' },
                { key: 'media.videoUrl', type: 'url', labelRu: 'Видео (URL)', labelEn: 'Video (URL)' },
                { key: 'media.social', type: 'multi', labelRu: 'Автопостинг в соцсети', labelEn: 'Social auto-posting', options: tnwToDict(C.socialNetworks) }
            ]}
        ]},
        { id: 'publish', icon: 'fa-paper-plane', titleRu: 'Публикация и уведомления', titleEn: 'Publish & notifications', groups: [
            { titleRu: 'Статус', titleEn: 'Status', fields: [
                { key: 'publish.status', type: 'select', labelRu: 'Статус турнира', labelEn: 'Tournament status', options: { draft: tnL('Черновик', 'Draft'), published: tnL('Опубликовано', 'Published'), scheduled: tnL('Отложенная публикация', 'Scheduled') } },
                { key: 'publish.scheduledAt', type: 'datetime', labelRu: 'Дата/время публикации', labelEn: 'Publish date/time' }
            ]},
            { titleRu: 'Уведомления', titleEn: 'Notifications', fields: [
                { key: 'publish.channels', type: 'multi', labelRu: 'Каналы', labelEn: 'Channels', options: tnwToDict(C.notifyChannels) },
                { key: 'publish.templates', type: 'notifyTemplates', labelRu: 'Шаблоны уведомлений', labelEn: 'Notification templates' },
                { key: 'publish.remindHours', type: 'number', labelRu: 'Автонапоминание за N часов до старта', labelEn: 'Auto-reminder N hours before start', min: 1 }
            ]}
        ]},
        { id: 'preview', icon: 'fa-flag-checkered', titleRu: 'Предпросмотр', titleEn: 'Preview', groups: [] }
    ];
}

// ------------------------------------------------------------
// ЧЕРНОВИК: значения по умолчанию
// ------------------------------------------------------------
function tnwDefaultDraft() {
    return {
        info: { nameRu: '', nameEn: '', description: '', logo: '', banner: '', typeId: 'stroke', categories: ['amateur'], level: 'club', organizer: '', contacts: [], dressCode: '', paceOfPlay: '', sanitary: '' },
        format: { rounds: [{ date: '', title: 'R1', startTime: '09:00', startType: 'shotgun' }], checkIn: '08:30', regOpen: '', regClose: '',
            cut: { enabled: false, afterRound: 2, topN: 65, includeTies: true },
            teeMap: [{ category: tnL('Мужчины', 'Men'), tee: 'wh' }, { category: tnL('Женщины', 'Women'), tee: 'rd' }],
            localRules: '' },
        scoring: { resultMode: 'both', systems: ['stroke-net'],
            stablefordTable: TnEngine.utils.deepClone(TN_CONFIG.defaultStablefordTable),
            modifiedTable: TnEngine.utils.deepClone(TN_CONFIG.defaultModifiedStablefordTable),
            hcp: { system: 'whs', allowancePct: 95, capMax: '', teamWeights: '25,20,15,10', customFormula: '' },
            tieBreaks: ['countback', 'last-hole'], maxScoreMode: 'netdb', pacePenalty: '', dqRules: '' },
        participants: { methods: ['public-form', 'manual'], fieldsRequired: ['fullName', 'gender', 'handicap'], hcpMin: '', hcpMax: '', limit: 0, moderation: 'manual', entryFee: '', paymentInfo: '', waitlist: true, allowTransfers: true, quotas: [] },
        flights: { auto: true, by: 'handicap', flightSize: 12, groupSize: '4', rePairing: true, scheduleType: 'shotgun', firstTeeTime: '09:00', intervalMin: 10 },
        officials: { list: [], eScoring: true, selfScoring: false, markerConfirm: true },
        prizes: { fund: '', distribution: [{ place: 1, pct: 40 }, { place: 2, pct: 25 }, { place: 3, pct: 15 }], nominations: ['best-gross', 'best-net'], nominationHoles: [], awards: ['trophy', 'medal', 'diploma'], budget: [], sponsors: [], fees: [], promoCodes: [] },
        media: { slug: '', isPublic: true, streams: [], galleryUrl: '', videoUrl: '', social: [] },
        publish: { status: 'draft', scheduledAt: '', channels: ['email', 'push'], templates: {}, remindHours: 24 }
    };
}

function tnwNewDraftKey() {
    return 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

// ------------------------------------------------------------
// АВТОСОХРАНЕНИЕ (localStorage — мгновенно, Firebase — раз в 20 сек)
// ------------------------------------------------------------
function tnwLocalKey(key) { return 'pestovo_tn_wiz_draft_' + key; }

function tnwSaveLocal() {
    if (!tnWiz.draft || !tnWiz.draftKey) return;
    try {
        localStorage.setItem(tnwLocalKey(tnWiz.draftKey), JSON.stringify({
            config: tnWiz.draft, step: tnWiz.step, updatedAt: Date.now()
        }));
    } catch (e) { console.warn('[silent]', e); }
}

function tnwSaveServer(force) {
    if (!tnWiz.draft || !tnWiz.draftKey) return Promise.resolve(false);
    // Режим редактирования существующего турнира: правки уходят в турнир
    // кнопкой «Сохранить», а не в черновики (не плодим tnDrafts/edit_*).
    if (tnWiz.editTournamentId) return Promise.resolve(false);
    if (!tnWiz.dirty && !force) return Promise.resolve(false);
    var database = tnwDb();
    if (!database) { tnWiz.saveMsg = tnL('нет подключения к базе', 'no database'); return Promise.resolve(false); }
    var payload = {
        config: tnWiz.draft,
        step: tnWiz.step,
        name: (tnWiz.draft.info && tnWiz.draft.info.nameRu) || '',
        status: (tnWiz.draft.publish && tnWiz.draft.publish.status) || 'draft',
        scheduledAt: (tnWiz.draft.publish && tnWiz.draft.publish.scheduledAt) || '',
        owner: tnwOwnerKey(),
        updatedAt: (typeof firebase !== 'undefined' && firebase.database && firebase.database.ServerValue) ? firebase.database.ServerValue.TIMESTAMP : Date.now()
    };
    return database.ref('tnDrafts/' + tnwOwnerKey() + '/' + tnWiz.draftKey).set(payload).then(function () {
        tnWiz.dirty = false;
        tnWiz.lastServerSave = Date.now();
        tnWiz.saveMsg = '';
        tnwUpdateSaveStatus();
        tnwCheckScheduled(); // вдруг этот черновик — отложенная публикация и время пришло
        return true;
    }).catch(function (err) {
        tnWiz.saveMsg = tnL('ошибка сохранения: ', 'save error: ') + (err && err.message ? err.message : err);
        tnwUpdateSaveStatus();
        return false;
    });
}

function tnwMarkDirty() {
    tnWiz.dirty = true;
    tnwSaveLocal();
    tnwUpdateSaveStatus();
}

function tnwUpdateSaveStatus() {
    var el = document.getElementById('tnw-save-status');
    if (!el) return;
    var html;
    if (tnWiz.saveMsg) html = '<span class="tnw-dot error"></span>' + tnwEsc(tnWiz.saveMsg);
    else if (tnWiz.dirty) html = '<span class="tnw-dot dirty"></span>' + tnL('есть несохранённые изменения…', 'unsaved changes…');
    else if (tnWiz.lastServerSave) {
        var d = new Date(tnWiz.lastServerSave);
        html = '<span class="tnw-dot saved"></span>' + tnL('сохранено ', 'saved ') + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
    } else html = '<span class="tnw-dot saved"></span>' + tnL('локальная копия', 'local copy');
    el.innerHTML = html;
}

// ------------------------------------------------------------
// ЗАГРУЗКА / ВОССТАНОВЛЕНИЕ ЧЕРНОВИКОВ
// ------------------------------------------------------------
function tnwBindDrafts() {
    if (tnWiz.draftsBound) return;
    var database = tnwDb();
    if (!database) return;
    tnWiz.draftsBound = true;
    database.ref('tnDrafts/' + tnwOwnerKey()).on('value', function (sn) {
        tnWiz.drafts = sn.val() || {};
        if (tnWiz.subTab === 'new-create' && !tnWiz.draft) tnwRenderWizard();
        tnwCheckScheduled();
    });
}

function tnwLocalDrafts() {
    var out = {};
    try {
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf('pestovo_tn_wiz_draft_') === 0) {
                var v = JSON.parse(localStorage.getItem(k) || 'null');
                if (v && v.config) out[k.replace('pestovo_tn_wiz_draft_', '')] = v;
            }
        }
    } catch (e) { console.warn('[silent]', e); }
    return out;
}

function tnwStartNewDraft(presetConfig, presetKey) {
    tnWiz.draft = TnEngine.utils.deepClone(presetConfig || tnwDefaultDraft());
    tnWiz.draftKey = presetKey || tnwNewDraftKey();
    tnWiz.step = 0;
    tnWiz.dirty = true;
    tnwSaveLocal();
    tnwSaveServer(true);
    tnwRenderWizard();
}

function tnwOpenDraft(key, fromServer) {
    var rec = fromServer ? (tnWiz.drafts || {})[key] : tnwLocalDrafts()[key];
    if (!rec || !rec.config) {
        // попробовать другой источник
        rec = fromServer ? tnwLocalDrafts()[key] : (tnWiz.drafts || {})[key];
    }
    if (!rec || !rec.config) { if (typeof toast === 'function') toast(tnL('Черновик не найден', 'Draft not found'), 'error'); return; }
    tnWiz.draft = TnEngine.utils.deepClone(rec.config);
    tnWiz.draftKey = key;
    tnWiz.step = Math.min(rec.step || 0, tnwSteps().length - 1);
    tnWiz.dirty = false;
    tnwRenderWizard();
}

function tnwDeleteDraft(key) {
    if (!confirm(tnL('Удалить черновик безвозвратно?', 'Delete draft permanently?'))) return;
    try { localStorage.removeItem(tnwLocalKey(key)); } catch (e) { console.warn('[silent]', e); }
    var database = tnwDb();
    if (database) database.ref('tnDrafts/' + tnwOwnerKey() + '/' + key).remove();
    if (tnWiz.draftKey === key) { tnWiz.draft = null; tnWiz.draftKey = null; }
    tnwRenderWizard();
}

// Отложенная публикация: если у черновика статус scheduled и время пришло — публикуем.
function tnwCheckScheduled() {
    var database = tnwDb();
    if (!database) return;
    var now = Date.now();
    Object.keys(tnwWizAllServerDrafts()).forEach(function (key) {
        var d = tnWiz.drafts[key];
        if (!d || !d.config || !d.config.publish) return;
        if (d.config.publish.status !== 'scheduled') return;
        var at = Date.parse(d.config.publish.scheduledAt || '');
        if (!isFinite(at) || at > now) return;
        tnwPublishConfig(d.config, key).then(function () {
            return database.ref('tnDrafts/' + tnwOwnerKey() + '/' + key).remove();
        }).then(function () {
            try { localStorage.removeItem(tnwLocalKey(key)); } catch (e) { console.warn('[silent]', e); }
            if (typeof toast === 'function') toast('⏰ ' + tnL('Отложенный турнир опубликован', 'Scheduled tournament published'));
        }).catch(function () {});
    });
}
function tnwWizAllServerDrafts() { return tnWiz.drafts || {}; }

// ------------------------------------------------------------
// РЕНДЕР МАСТЕРА
// ------------------------------------------------------------
function tnwRenderWizard() {
    var root = document.getElementById('tn-wizard-root');
    if (!root) return;
    tnwBindDrafts();
    if (!tnWiz.draft) { root.innerHTML = tnwDraftLandingHtml(); return; }

    var steps = tnwSteps();
    var s = steps[tnWiz.step];
    var html = '';
    // прогресс
    html += '<div class="tnw-progress" role="tablist" aria-label="' + tnL('Шаги мастера', 'Wizard steps') + '">';
    steps.forEach(function (st, i) {
        html += '<button type="button" class="tnw-step-chip ' + (i === tnWiz.step ? 'current' : (tnwStepDone(i) ? 'done' : '')) + '" onclick="tnwGoStep(' + i + ')" role="tab" aria-selected="' + (i === tnWiz.step) + '">' +
            '<span class="tnw-step-num">' + (i + 1) + '</span>' + tnwEsc(tnL(st.titleRu, st.titleEn)) + '</button>';
    });
    html += '</div>';

    // тело шага
    html += '<div id="tnw-step-body">' + (s.id === 'preview' ? tnwSummaryHtml() : tnwGroupsHtml(s)) + '</div>';

    // навигация
    html += '<div class="tnw-nav-bar">' +
        '<button type="button" class="btn btn-og btn-sm" onclick="tnwCloseDraft()"><i class="fas fa-times"></i> ' + tnL('К списку черновиков', 'Draft list') + '</button>' +
        (tnWiz.step > 0 ? '<button type="button" class="btn btn-og" onclick="tnwGoStep(' + (tnWiz.step - 1) + ')"><i class="fas fa-arrow-left"></i> ' + tnL('Назад', 'Back') + '</button>' : '') +
        '<span class="tnw-spacer"></span>' +
        '<span class="tnw-status-line" id="tnw-save-status"></span>' +
        (tnWiz.step < steps.length - 1
            ? '<button type="button" class="btn btn-g" onclick="tnwGoStep(' + (tnWiz.step + 1) + ')">' + tnL('Далее', 'Next') + ' <i class="fas fa-arrow-right"></i></button>'
            : '') +
        '</div>';
    root.innerHTML = html;
    tnwUpdateSaveStatus();
    tnwBindDelegated();
}

function tnwStepDone(i) {
    var st = tnwSteps()[i];
    var d = tnWiz.draft;
    if (!d) return false;
    switch (st.id) {
        case 'info': return !!(d.info && d.info.nameRu);
        case 'format': return !!(d.format && d.format.rounds && d.format.rounds.length && d.format.rounds[0].date);
        case 'scoring': return !!(d.scoring && d.scoring.systems && d.scoring.systems.length);
        case 'participants': return !!(d.participants && (d.participants.methods || []).length);
        case 'flights': return !!(d.flights && (d.flights.flightSize || d.flights.auto));
        case 'officials': return !!(d.officials && (d.officials.list || []).length);
        case 'prizes': return !!(d.prizes && (String(d.prizes.fund || '') !== '' || (d.prizes.nominations || []).length));
        case 'media': return !!(d.media && (d.media.slug || (d.media.streams || []).length || d.media.isPublic));
        case 'publish': return !!(d.publish && d.publish.status);
        default: return false;
    }
}

function tnwDraftLandingHtml() {
    var server = tnWiz.drafts || {};
    var local = tnwLocalDrafts();
    var keys = {};
    Object.keys(server).forEach(function (k) { keys[k] = true; });
    Object.keys(local).forEach(function (k) { keys[k] = true; });
    var list = Object.keys(keys).map(function (k) {
        var rec = server[k] || local[k] || {};
        rec._key = k;
        rec._where = server[k] ? (local[k] ? 'both' : 'server') : 'local';
        return rec;
    }).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });

    var html = '<div class="tnw-card"><h3><i class="fas fa-wand-magic-sparkles"></i> ' + tnL('Новая версия создания турнира', 'New tournament creation') + '</h3>' +
        '<div class="tnw-sub">' + tnL('Пошаговый мастер: 10 шагов, автосохранение черновика каждые 20 секунд, публикация в общем списке турниров. Поле подтягивается из вкладки «Настройки поля».', 'Step-by-step wizard: 10 steps, draft autosave every 20 seconds, publishing to the common tournament list. The course comes from the “Course settings” tab.') + '</div>' +
        '<button type="button" class="btn btn-g" onclick="tnwStartNewDraft()"><i class="fas fa-plus"></i> ' + tnL('Начать новый турнир', 'Start new tournament') + '</button></div>';

    html += '<div class="tnw-card"><h3><i class="fas fa-file-pen"></i> ' + tnL('Черновики', 'Drafts') + '</h3>';
    if (!list.length) {
        html += '<div class="tnw-empty">' + tnL('Пока нет черновиков. Начните новый турнир — черновик сохранится автоматически.', 'No drafts yet. Start a new tournament — the draft will be saved automatically.') + '</div>';
    } else {
        html += '<div class="tnw-list">' + list.map(function (rec) {
            var cfg = rec.config || {};
            var name = (cfg.info && cfg.info.nameRu) || rec.name || tnL('Без названия', 'Untitled');
            var dt = rec.updatedAt ? new Date(rec.updatedAt).toLocaleString(tnL('ru-RU', 'en-GB')) : '—';
            var st = cfg.publish && cfg.publish.status !== 'draft' ? '<span class="tnw-chip">' + tnwEsc(cfg.publish.status) + '</span>' : '';
            var where = rec._where === 'local' ? '<span class="tnw-chip" style="border-color:rgba(233,200,60,.5);color:#e9c83c;">local</span>' : '';
            return '<div class="tnw-row" style="grid-template-columns:1fr auto;align-items:center;">' +
                '<div><div style="font-weight:700;color:var(--white);">' + tnwEsc(name) + ' ' + st + ' ' + where + '</div>' +
                '<div style="font-size:11.5px;color:var(--muted);">' + tnL('обновлён', 'updated') + ': ' + tnwEsc(dt) + '</div></div>' +
                '<div style="display:flex;gap:6px;">' +
                '<button type="button" class="btn btn-g btn-sm" onclick="tnwOpenDraft(\'' + tnwEsc(rec._key) + '\', ' + (rec._where !== 'local') + ')"><i class="fas fa-play"></i> ' + tnL('Продолжить', 'Resume') + '</button>' +
                '<button type="button" class="tnw-row-del" onclick="tnwDeleteDraft(\'' + tnwEsc(rec._key) + '\')"><i class="fas fa-trash"></i></button>' +
                '</div></div>';
        }).join('') + '</div>';
    }
    return html + '</div>';
}

// ------------------------------------------------------------
// РЕНДЕР ПОЛЕЙ
// ------------------------------------------------------------
function tnwGroupsHtml(step) {
    return step.groups.map(function (g) {
        var inner = g.fields.map(function (f) { return tnwFieldHtml(f); }).join('');
        return '<div class="tnw-card"><h3>' + tnwEsc(tnL(g.titleRu, g.titleEn)) + '</h3>' +
            (g.subRu ? '<div class="tnw-sub">' + tnwEsc(tnL(g.subRu, g.subEn)) + '</div>' : '') +
            '<div class="tnw-grid">' + inner + '</div></div>';
    }).join('');
}

function tnwFieldHtml(f) {
    var v = tnwGet(tnWiz.draft || {}, f.key);
    var label = tnwEsc(tnL(f.labelRu, f.labelEn));
    var hint = f.hintRu ? '<div class="tnw-hint">' + tnwEsc(tnL(f.hintRu, f.hintEn)) + '</div>' : '';
    var span = f.type === 'textarea' || f.type === 'list' || f.type === 'multi' || f.type === 'pointsTable' || f.type === 'tieOrder' || f.type === 'notifyTemplates' ? ' style="grid-column:1/-1;"' : '';
    var ctrl = '';
    var path = f.key;
    switch (f.type) {
        case 'text': case 'url':
            ctrl = '<input type="text" data-tnw-path="' + path + '" value="' + tnwEsc(v) + '"' + (f.placeholder ? ' placeholder="' + tnwEsc(f.placeholder) + '"' : '') + '>';
            break;
        case 'number':
            ctrl = '<input type="number" data-tnw-path="' + path + '" value="' + tnwEsc(v) + '"' + (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') + ' step="any">';
            break;
        case 'date':
            ctrl = '<input type="date" data-tnw-path="' + path + '" value="' + tnwEsc(v) + '">';
            break;
        case 'time':
            ctrl = '<input type="time" data-tnw-path="' + path + '" value="' + tnwEsc(v) + '">';
            break;
        case 'datetime':
            ctrl = '<input type="datetime-local" data-tnw-path="' + path + '" value="' + tnwEsc(v) + '">';
            break;
        case 'textarea':
            ctrl = '<textarea data-tnw-path="' + path + '">' + tnwEsc(v) + '</textarea>';
            break;
        case 'bool':
            ctrl = '<label class="tnw-check" style="align-self:end;"><input type="checkbox" data-tnw-path="' + path + '"' + (v ? ' checked' : '') + '> ' + label + '</label>';
            return '<div class="tnw-field">' + ctrl + hint + '</div>';
        case 'select': {
            var opts = '<option value="">—</option>';
            Object.keys(f.options || {}).forEach(function (k) {
                opts += '<option value="' + tnwEsc(k) + '"' + (String(v) === k ? ' selected' : '') + '>' + tnwEsc(f.options[k]) + '</option>';
            });
            ctrl = '<select data-tnw-path="' + path + '">' + opts + '</select>';
            break;
        }
        case 'multi': {
            var arr = Array.isArray(v) ? v : [];
            ctrl = '<div class="tnw-checks">' + Object.keys(f.options || {}).map(function (k) {
                var locked = k === 'fullName' && f.key === 'participants.fieldsRequired';
                var on = locked ? true : arr.indexOf(k) >= 0;
                return '<label class="tnw-check"><input type="checkbox" data-tnw-multi="' + path + '" value="' + tnwEsc(k) + '"' + (on ? ' checked' : '') + (locked ? ' disabled' : '') + '> ' + tnwEsc(f.options[k]) + '</label>';
            }).join('') + '</div>';
            break;
        }
        case 'list':
            ctrl = tnwListHtml(f);
            break;
        case 'pointsTable':
            ctrl = tnwPointsTableHtml(f, v);
            break;
        case 'tieOrder':
            ctrl = tnwTieOrderHtml(f, v);
            break;
        case 'notifyTemplates':
            ctrl = tnwNotifyTemplatesHtml(f, v);
            break;
        default:
            ctrl = '<input type="text" data-tnw-path="' + path + '" value="' + tnwEsc(v) + '">';
    }
    var showLabel = f.type !== 'bool';
    return '<div class="tnw-field"' + span + '>' + (showLabel ? '<label>' + label + '</label>' : '') + ctrl + hint + '</div>';
}

function tnwListHtml(f) {
    var arr = tnwGet(tnWiz.draft || {}, f.key);
    if (!Array.isArray(arr)) arr = [];
    var cols = Math.max.apply(null, f.listFields.map(function (sf) { return sf.width || 1; }).concat([1]));
    var rows = arr.map(function (row, idx) {
        var cells = f.listFields.map(function (sf) {
            var val = row ? row[sf.key] : '';
            var p = f.key + '.' + idx + '.' + sf.key;
            var style = sf.width ? ' style="grid-column:span ' + sf.width + ';"' : '';
            var inputHtml;
            if (sf.type === 'select') {
                var opts = '<option value="">—</option>';
                Object.keys(sf.options || {}).forEach(function (k) {
                    opts += '<option value="' + tnwEsc(k) + '"' + (String(val) === k ? ' selected' : '') + '>' + tnwEsc(sf.options[k]) + '</option>';
                });
                inputHtml = '<select data-tnw-path="' + p + '">' + opts + '</select>';
            } else if (sf.type === 'number') {
                inputHtml = '<input type="number" data-tnw-path="' + p + '" value="' + tnwEsc(val) + '"' + (sf.min != null ? ' min="' + sf.min + '"' : '') + (sf.max != null ? ' max="' + sf.max + '"' : '') + ' step="any">';
            } else if (sf.type === 'date') {
                inputHtml = '<input type="date" data-tnw-path="' + p + '" value="' + tnwEsc(val) + '">';
            } else if (sf.type === 'time') {
                inputHtml = '<input type="time" data-tnw-path="' + p + '" value="' + tnwEsc(val) + '">';
            } else {
                inputHtml = '<input type="text" data-tnw-path="' + p + '" value="' + tnwEsc(val) + '"' + (sf.placeholder ? ' placeholder="' + tnwEsc(sf.placeholder) + '"' : '') + '>';
            }
            return '<div class="tnw-field"' + style + '><label>' + tnwEsc(tnL(sf.labelRu, sf.labelEn)) + '</label>' + inputHtml + '</div>';
        }).join('');
        var spans = f.listFields.reduce(function (s, sf) { return s + (sf.width || 1); }, 0) + 1;
        return '<div class="tnw-row" style="grid-template-columns:repeat(' + Math.min(spans, cols + 4) + ', 1fr);grid-auto-flow:row dense;">' + cells +
            '<button type="button" class="tnw-row-del" title="' + tnL('Удалить', 'Delete') + '" onclick="tnwListDel(\'' + f.key + '\',' + idx + ')"><i class="fas fa-trash"></i></button></div>';
    }).join('');
    return '<div class="tnw-list">' + rows + '<button type="button" class="tnw-add-btn" onclick="tnwListAdd(\'' + f.key + '\')"><i class="fas fa-plus"></i> ' + tnL('Добавить', 'Add') + '</button></div>';
}

// Таблица очков Stableford / Modified (редактируемая)
function tnwPointsTableHtml(f, v) {
    var table = (v && typeof v === 'object') ? v : {};
    var defs = [
        ['lte-4', tnL('Двойной игл и лучше (≤−4)', 'Double eagle or better (≤−4)')],
        ['-3', tnL('Альбатрос (−3)', 'Albatross (−3)')],
        ['-2', tnL('Игл (−2)', 'Eagle (−2)')],
        ['-1', tnL('Бёрди (−1)', 'Birdie (−1)')],
        ['0', tnL('Пар (0)', 'Par (0)')],
        ['+1', tnL('Боги (+1)', 'Bogey (+1)')],
        ['gte+2', tnL('Дабл-боги и хуже (≥+2)', 'Double bogey or worse (≥+2)')]
    ];
    return '<div class="tnw-checks">' + defs.map(function (d) {
        return '<label class="tnw-check" style="border-radius:10px;">' + tnwEsc(d[1]) + ': <input type="number" step="1" style="width:64px;margin-left:6px;" data-tnw-path="' + f.key + '.' + d[0].replace('+', '_plus_') + '" data-tnw-mapped-key="' + d[0] + '" value="' + tnwEsc(table[d[0]]) + '"></label>';
    }).join('') + '</div>';
}

// Упорядоченный список тай-брейков (приоритет) — стрелки + drag&drop
function tnwTieOrderHtml(f, v) {
    var arr = Array.isArray(v) ? v : [];
    var options = f.options || {};
    var items = arr.map(function (id, i) {
        return '<div class="tnw-order-item" draggable="true" data-tnw-tie-idx="' + i + '">' +
            '<span class="tnw-order-prio">' + (i + 1) + '</span>' +
            '<i class="fas fa-grip-vertical" style="color:var(--muted);"></i>' +
            '<span>' + tnwEsc(options[id] || id) + '</span>' +
            '<span class="tnw-order-btns">' +
            '<button type="button" onclick="tnwTieMove(\'' + f.key + '\',' + i + ',-1)" aria-label="up"><i class="fas fa-arrow-up"></i></button>' +
            '<button type="button" onclick="tnwTieMove(\'' + f.key + '\',' + i + ',1)" aria-label="down"><i class="fas fa-arrow-down"></i></button>' +
            '<button type="button" onclick="tnwTieRemove(\'' + f.key + '\',' + i + ')" aria-label="remove"><i class="fas fa-times"></i></button>' +
            '</span></div>';
    }).join('');
    var available = Object.keys(options).filter(function (k) { return arr.indexOf(k) < 0; });
    var add = available.length
        ? '<select onchange="tnwTieAdd(\'' + f.key + '\', this.value); this.selectedIndex=0;">' +
          '<option value="">+ ' + tnL('Добавить тай-брейк…', 'Add tie-break…') + '</option>' +
          available.map(function (k) { return '<option value="' + tnwEsc(k) + '">' + tnwEsc(options[k]) + '</option>'; }).join('') + '</select>'
        : '';
    return '<div>' + items + add + '</div>';
}

function tnwNotifyTemplatesHtml(f, v) {
    var obj = (v && typeof v === 'object') ? v : {};
    return TN_CONFIG.notifyTemplates.map(function (nt) {
        var defSubj = { registration: tnL('Вы зарегистрированы на турнир {tournament}', 'You are registered for {tournament}'),
            'tee-times': tnL('Опубликованы стартовые время и группа на {tournament}', 'Your tee time and group for {tournament} are published'),
            'round-start': tnL('Раунд {round} турнира {tournament} начинается', 'Round {round} of {tournament} is starting'),
            results: tnL('Опубликованы итоги турнира {tournament}', 'Final results of {tournament} are published') }[nt.id];
        return '<div class="tnw-field" style="margin-bottom:10px;"><label>' + tnwEsc(tnwCfgLabel(TN_CONFIG.notifyTemplates, nt.id)) + '</label>' +
            '<textarea data-tnw-path="' + f.key + '.' + nt.id + '" placeholder="' + tnwEsc(defSubj) + '">' + tnwEsc(obj[nt.id] || '') + '</textarea></div>';
    }).join('');
}

// ------------------------------------------------------------
// ДЕЛЕГИРОВАННАЯ ОБРАБОТКА ВВОДА (один слушатель на корень)
// ------------------------------------------------------------
var tnwDelegatedBound = false;
function tnwBindDelegated() {
    var root = document.getElementById('tn-wizard-root');
    if (!root || tnwDelegatedBound) return;
    tnwDelegatedBound = true;

    root.addEventListener('input', tnwOnFieldEvent);
    root.addEventListener('change', tnwOnFieldEvent);

    // drag&drop приоритетов тай-брейков
    var dragFrom = null;
    root.addEventListener('dragstart', function (e) {
        var it = e.target.closest && e.target.closest('.tnw-order-item');
        if (!it) return;
        dragFrom = parseInt(it.getAttribute('data-tnw-tie-idx'), 10);
        it.classList.add('dragging');
    });
    root.addEventListener('dragend', function (e) {
        var it = e.target.closest && e.target.closest('.tnw-order-item');
        if (it) it.classList.remove('dragging');
    });
    root.addEventListener('dragover', function (e) {
        if (e.target.closest && e.target.closest('.tnw-order-item')) e.preventDefault();
    });
    root.addEventListener('drop', function (e) {
        var it = e.target.closest && e.target.closest('.tnw-order-item');
        if (!it || dragFrom == null) return;
        e.preventDefault();
        var to = parseInt(it.getAttribute('data-tnw-tie-idx'), 10);
        if (isFinite(to) && to !== dragFrom) tnwTieReorder('scoring.tieBreaks', dragFrom, to);
        dragFrom = null;
    });
}

function tnwOnFieldEvent(e) {
    var el = e.target;
    if (!el || !tnWiz.draft) return;
    var path = el.getAttribute('data-tnw-path');
    if (path) {
        var v = el.type === 'checkbox' ? el.checked : el.value;
        if (el.type === 'number') v = el.value === '' ? '' : parseFloat(el.value);
        // data-tnw-mapped-key: реальный ключ таблицы очков ('gte+2' и т.п.)
        var mapped = el.getAttribute('data-tnw-mapped-key');
        if (mapped) {
            path = path.split('.').slice(0, -1).join('.') + '.' + mapped;
        }
        tnwSet(tnWiz.draft, path, v);
        tnwMarkDirty();
        return;
    }
    var multi = el.getAttribute('data-tnw-multi');
    if (multi) {
        var arr = tnwGet(tnWiz.draft, multi);
        if (!Array.isArray(arr)) arr = [];
        var val = el.value;
        if (el.checked && arr.indexOf(val) < 0) arr.push(val);
        if (!el.checked) arr = arr.filter(function (x) { return x !== val; });
        tnwSet(tnWiz.draft, multi, arr);
        tnwMarkDirty();
    }
}

// ------------------------------------------------------------
// ДЕЙСТВИЯ СО СПИСКАМИ / ТАЙ-БРЕЙКАМИ (глобальные для onclick)
// ------------------------------------------------------------
function tnwListAdd(path) {
    var arr = tnwGet(tnWiz.draft, path);
    if (!Array.isArray(arr)) arr = [];
    arr.push({});
    tnwSet(tnWiz.draft, path, arr);
    tnwMarkDirty();
    tnwRenderWizard();
}
function tnwListDel(path, idx) {
    var arr = tnwGet(tnWiz.draft, path);
    if (!Array.isArray(arr)) return;
    arr.splice(idx, 1);
    tnwSet(tnWiz.draft, path, arr);
    tnwMarkDirty();
    tnwRenderWizard();
}
function tnwTieMove(path, idx, dir) {
    var arr = tnwGet(tnWiz.draft, path) || [];
    var j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    var tmp = arr[idx]; arr[idx] = arr[j]; arr[j] = tmp;
    tnwMarkDirty();
    tnwRenderWizard();
}
function tnwTieRemove(path, idx) {
    var arr = tnwGet(tnWiz.draft, path) || [];
    arr.splice(idx, 1);
    tnwMarkDirty();
    tnwRenderWizard();
}
function tnwTieAdd(path, id) {
    if (!id) return;
    var arr = tnwGet(tnWiz.draft, path);
    if (!Array.isArray(arr)) arr = [];
    if (arr.indexOf(id) < 0) arr.push(id);
    tnwSet(tnWiz.draft, path, arr);
    tnwMarkDirty();
    tnwRenderWizard();
}
function tnwTieReorder(path, from, to) {
    var arr = tnwGet(tnWiz.draft, path) || [];
    if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return;
    var item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
    tnwMarkDirty();
    tnwRenderWizard();
}

function tnwGoStep(i) {
    tnWiz.step = Math.max(0, Math.min(tnwSteps().length - 1, i));
    tnwSaveLocal();
    tnwRenderWizard();
    var root = document.getElementById('tn-wizard-root');
    if (root && root.scrollIntoView) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function tnwCloseDraft() {
    tnwSaveServer(true);
    tnWiz.draft = null;
    tnWiz.draftKey = null;
    // Единая вкладка: выход из режима редактирования турнира.
    if (typeof window !== 'undefined' && typeof window.tnsWizardClosed === 'function') window.tnsWizardClosed();
    tnwRenderWizard();
}

// ------------------------------------------------------------
// ШАГ 10: СВОДКА + ПУБЛИКАЦИЯ
// ------------------------------------------------------------
function tnwSummaryHtml() {
    var d = tnWiz.draft || {};
    var C = TN_CONFIG;
    function row(k, v) { return (v != null && String(v) !== '') ? '<tr><td>' + tnwEsc(k) + '</td><td>' + v + '</td></tr>' : ''; }
    function listNames(cfg, ids) { return (ids || []).map(function (id) { return tnwEsc(tnwCfgLabel(cfg, id)); }).join(', '); }
    function arrLen(a) { return (Array.isArray(a) ? a.length : 0); }

    var info = d.info || {}, format = d.format || {}, scoring = d.scoring || {}, part = d.participants || {},
        fl = d.flights || {}, off = d.officials || {}, pr = d.prizes || {}, media = d.media || {}, pub = d.publish || {};

    var roundsTxt = (format.rounds || []).map(function (r, i) {
        return tnwEsc(r.date || '—') + ' · ' + tnwEsc(r.title || ('R' + (i + 1))) + ' ' + tnwEsc(r.startTime || '') + ' · ' + tnwEsc(tnwCfgLabel(C.startTypes, r.startType));
    }).join('<br>');

    var teeMapTxt = (format.teeMap || []).map(function (m) {
        return tnwEsc(m.category || '?') + ' → ' + tnwEsc(tnwCfgLabel(C.teeBoxes, m.tee));
    }).join(', ');

    var html = '';
    html += '<div class="tnw-card"><h3><i class="fas fa-eye"></i> ' + tnL('Сводка настроек', 'Settings summary') + '</h3>' +
        '<div class="tnw-sub">' + tnL('Проверьте все секции перед публикацией. Клик по подзаголовку ведёт на нужный шаг.', 'Review all sections before publishing.') + '</div>';

    html += '<div class="tnw-summary-sec"><h4 style="cursor:pointer;" onclick="tnwGoStep(0)">1. ' + tnL('Основная информация', 'Basic info') + '</h4><table>' +
        row(tnL('Название', 'Name'), tnwEsc(info.nameRu) + (info.nameEn ? ' / ' + tnwEsc(info.nameEn) : '')) +
        row(tnL('Тип', 'Type'), tnwEsc(tnwCfgLabel(C.tournamentTypes, info.typeId))) +
        row(tnL('Категории', 'Categories'), listNames(C.categories, info.categories)) +
        row(tnL('Уровень', 'Level'), tnwEsc(tnwCfgLabel(C.levels, info.level))) +
        row(tnL('Организатор', 'Organizer'), tnwEsc(info.organizer)) +
        row(tnL('Контакты', 'Contacts'), arrLen(info.contacts)) +
        '</table></div>';

    html += '<div class="tnw-summary-sec"><h4 style="cursor:pointer;" onclick="tnwGoStep(1)">2. ' + tnL('Даты и формат', 'Dates & format') + '</h4><table>' +
        row(tnL('Раунды', 'Rounds'), roundsTxt) +
        row(tnL('Регистрация', 'Registration'), tnwEsc(format.regOpen || '—') + ' … ' + tnwEsc(format.regClose || '—')) +
        row('Cut', format.cut && format.cut.enabled ? (tnL('после раунда ', 'after round ') + tnwEsc(format.cut.afterRound) + ', топ-' + tnwEsc(format.cut.topN) + (format.cut.includeTies ? ' + ties' : '')) : tnL('нет', 'none')) +
        row(tnL('Ти-боксы', 'Tee boxes'), teeMapTxt) +
        '</table></div>';

    html += '<div class="tnw-summary-sec"><h4 style="cursor:pointer;" onclick="tnwGoStep(2)">3. ' + tnL('Подсчёт и правила', 'Scoring & rules') + '</h4><table>' +
        row(tnL('Зачёт', 'Result'), tnwEsc({ gross: 'Gross', net: 'Net', both: 'Gross + Net' }[scoring.resultMode] || '')) +
        row(tnL('Системы', 'Systems'), listNames(C.scoringSystems, scoring.systems)) +
        row(tnL('Гандикап', 'Handicap'), tnwEsc(tnwCfgLabel(C.handicapSystems, scoring.hcp && scoring.hcp.system)) + ' · ' + tnL('allowance', 'allowance') + ' ' + tnwEsc(scoring.hcp && scoring.hcp.allowancePct) + '%' + (scoring.hcp && scoring.hcp.capMax ? ' · cap ' + tnwEsc(scoring.hcp.capMax) : '')) +
        row(tnL('Тай-брейки', 'Tie-breaks'), listNames(C.tieBreaks, scoring.tieBreaks)) +
        row(tnL('Максимум на лунке', 'Max per hole'), tnwEsc(tnwCfgLabel(C.maxScoreModes, scoring.maxScoreMode))) +
        '</table></div>';

    html += '<div class="tnw-summary-sec"><h4 style="cursor:pointer;" onclick="tnwGoStep(3)">4. ' + tnL('Участники', 'Participants') + '</h4><table>' +
        row(tnL('Способы регистрации', 'Registration'), listNames(C.registrationMethods, part.methods)) +
        row(tnL('Обязательные поля', 'Required fields'), (part.fieldsRequired || []).length) +
        row(tnL('Гандикап', 'Handicap'), tnwEsc(part.hcpMin || '…') + ' – ' + tnwEsc(part.hcpMax || '…')) +
        row(tnL('Модерация', 'Moderation'), tnwEsc(part.moderation === 'manual' ? tnL('Вручную', 'Manual') : tnL('Авто', 'Auto'))) +
        row(tnL('Взнос', 'Entry fee'), tnwEsc(part.entryFee)) +
        row(tnL('Квоты', 'Quotas'), arrLen(part.quotas)) +
        '</table></div>';

    html += '<div class="tnw-summary-sec"><h4 style="cursor:pointer;" onclick="tnwGoStep(4)">5. ' + tnL('Флайты и tee times', 'Flights & tee times') + '</h4><table>' +
        row(tnL('Критерий флайтов', 'Flight criterion'), tnwEsc(tnwCfgLabel(C.flightCriteria, fl.by))) +
        row(tnL('Группы по', 'Group size'), tnwEsc(fl.groupSize)) +
        row(tnL('Старт', 'Start'), tnwEsc(tnwCfgLabel(C.startTypes, fl.scheduleType)) + ' · ' + tnwEsc(fl.firstTeeTime) + ' · ' + tnwEsc(fl.intervalMin) + ' ' + tnL('мин', 'min')) +
        row('Re-pairing', fl.rePairing ? '✓' : '—') +
        '</table></div>';

    html += '<div class="tnw-summary-sec"><h4 style="cursor:pointer;" onclick="tnwGoStep(5)">6. ' + tnL('Судейство', 'Officiating') + '</h4><table>' +
        row(tnL('Судьи', 'Officials'), (off.list || []).map(function (o) { return tnwEsc(o.name || '?') + ' (' + tnwEsc(tnwCfgLabel(C.officialRoles, o.role)) + ')'; }).join(', ')) +
        row(tnL('Электронный скоринг', 'E-scoring'), off.eScoring ? '✓' : '—') +
        row('Self-scoring + ' + tnL('маркер', 'marker'), (off.selfScoring ? '✓' : '—') + ' / ' + (off.markerConfirm ? '✓' : '—')) +
        '</table></div>';

    var budgetTotal = (pr.budget || []).reduce(function (acc, b) { return acc + (b.kind === 'expense' ? -(parseFloat(b.amount) || 0) : (parseFloat(b.amount) || 0)); }, 0);
    html += '<div class="tnw-summary-sec"><h4 style="cursor:pointer;" onclick="tnwGoStep(6)">7. ' + tnL('Призы и финансы', 'Prizes & finance') + '</h4><table>' +
        row(tnL('Призовой фонд', 'Prize fund'), tnwEsc(pr.fund)) +
        row(tnL('Мест в деньгах', 'Paid places'), arrLen(pr.distribution)) +
        row(tnL('Номинации', 'Nominations'), listNames(C.nominations, pr.nominations)) +
        row(tnL('Спонсоры', 'Sponsors'), arrLen(pr.sponsors)) +
        row(tnL('Баланс бюджета', 'Budget balance'), String(budgetTotal)) +
        '</table></div>';

    html += '<div class="tnw-summary-sec"><h4 style="cursor:pointer;" onclick="tnwGoStep(7)">8. ' + tnL('Трансляции и медиа', 'Broadcast & media') + '</h4><table>' +
        row('Slug', tnwEsc(media.slug)) +
        row(tnL('Публичный лидерборд', 'Public leaderboard'), media.isPublic ? '✓' : '—') +
        row(tnL('Трансляции', 'Streams'), arrLen(media.streams)) +
        row(tnL('Соцсети', 'Social'), listNames(C.socialNetworks, media.social)) +
        '</table></div>';

    html += '<div class="tnw-summary-sec"><h4 style="cursor:pointer;" onclick="tnwGoStep(8)">9. ' + tnL('Публикация и уведомления', 'Publish & notifications') + '</h4><table>' +
        row(tnL('Статус', 'Status'), tnwEsc(pub.status)) +
        row(tnL('Запланировано', 'Scheduled'), tnwEsc(pub.scheduledAt ? pub.scheduledAt.replace('T', ' ') : '')) +
        row(tnL('Каналы', 'Channels'), listNames(C.notifyChannels, pub.channels)) +
        row(tnL('Напоминание, ч', 'Reminder, h'), tnwEsc(pub.remindHours)) +
        '</table></div>';

    // ошибки валидации
    var errors = tnwValidate();
    if (errors.length) {
        html += '<div class="tnw-summary-sec" style="border-left-color:#d64545;"><h4 style="color:#ff8f8f;"><i class="fas fa-triangle-exclamation"></i> ' + tnL('Заполните обязательное', 'Required fields missing') + '</h4>' +
            errors.map(function (e2) { return '<div class="tnw-err">• ' + tnwEsc(e2) + '</div>'; }).join('') + '</div>';
    }

    html += '</div>';

    // кнопки действий
    html += '<div class="tnw-card" style="border-color:rgba(201,168,76,.45);"><h3><i class="fas fa-rocket"></i> ' + tnL('Финал', 'Finish') + '</h3>' +
        '<div class="tnw-nav-bar" style="margin-top:4px;">' +
        '<button type="button" class="btn btn-og" onclick="tnwSaveDraftNow()"><i class="fas fa-save"></i> ' + tnL('Сохранить как черновик', 'Save as draft') + ' <span style="opacity:.55;font-size:10px;">Ctrl+S</span></button>' +
        '<button type="button" class="btn btn-og" onclick="tnwSaveAsTemplate()"><i class="fas fa-layer-group"></i> ' + tnL('Сохранить как шаблон', 'Save as template') + '</button>' +
        '<span class="tnw-spacer"></span>' +
        '<button type="button" class="btn btn-g" ' + (errors.length ? 'disabled style="opacity:.5;"' : '') + ' onclick="tnwPublish()"><i class="fas fa-bullhorn"></i> ' + (pub.status === 'scheduled' ? tnL('Запланировать публикацию', 'Schedule publishing') : tnL('Опубликовать', 'Publish')) + '</button>' +
        '</div>' +
        '<div class="tnw-hint" style="margin-top:8px;font-size:11.5px;color:var(--muted);">' + tnL('После публикации турнир появляется в общем списке «Все турниры» и дальше работает через существующие механизмы (группы, скоринг, лидерборд).', 'After publishing the tournament appears in the common “All tournaments” list and runs through the existing mechanisms (groups, scoring, leaderboard).') + '</div>' +
        '</div>';
    return html;
}

function tnwValidate() {
    var d = tnWiz.draft || {};
    var errors = [];
    if (!d.info || !d.info.nameRu || !String(d.info.nameRu).trim()) errors.push(tnL('Шаг 1: название турнира (RU)', 'Step 1: tournament name (RU)'));
    var rounds = (d.format && d.format.rounds) || [];
    if (!rounds.length || !rounds.some(function (r) { return r && r.date; })) errors.push(tnL('Шаг 2: хотя бы одна дата раунда', 'Step 2: at least one round date'));
    if (!d.scoring || !Array.isArray(d.scoring.systems) || !d.scoring.systems.length) errors.push(tnL('Шаг 3: хотя бы одна система подсчёта', 'Step 3: at least one scoring system'));
    // Сумма % распределения призового фонда не должна превышать 100
    var dist = (d.prizes && d.prizes.distribution) || [];
    var pctSum = dist.reduce(function (s, x) { return s + (parseFloat(x.pct) || 0); }, 0);
    if (pctSum > 100.001) errors.push(tnL('Шаг 7: распределение фонда > 100%', 'Step 7: prize distribution > 100%'));
    return errors;
}

// ------------------------------------------------------------
// ПУБЛИКАЦИЯ (совместимость со старым списком турниров)
// ------------------------------------------------------------
function tnwLegacyFormats(systems) {
    var map = {
        'stroke-gross': 'Stroke Play (Gross)',
        'stroke-net': 'Stroke Play (Net)',
        'stableford': 'Stableford',
        'modified-stableford': 'Stableford',
        'match-play': 'Match Play 1v1',
        'best-ball': 'Match Play 2v2',
        'scramble': 'Scramble'
    };
    var out = [];
    (systems || []).forEach(function (s) {
        var f = map[s] || null;
        if (f && out.indexOf(f) < 0) out.push(f);
    });
    if (!out.length) out.push('Stroke Play (Net)');
    return out;
}

function tnwBuildTournamentPayload(cfg) {
    var C = TN_CONFIG;
    var rounds = (cfg.format.rounds || []).filter(function (r) { return r && r.date; });
    rounds.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var tees = [];
    (cfg.format.teeMap || []).forEach(function (m) { if (m.tee && tees.indexOf(m.tee) < 0) tees.push(m.tee); });
    if (!tees.length) tees = ['wh'];
    var name = String(cfg.info.nameRu || '').trim();
    return {
        // поля, которые читает существующий код (список, старт, скоринг)
        name: name,
        date: rounds.length ? rounds[0].date : '',
        formats: tnwLegacyFormats(cfg.scoring.systems),
        tees: tees,
        status: 'upcoming',
        createdAt: Date.now(),
        // расширенные данные новой версии
        nameEn: cfg.info.nameEn || '',
        description: cfg.info.description || '',
        logo: cfg.info.logo || '',
        banner: cfg.info.banner || '',
        slug: cfg.media.slug || '',
        isPublic: cfg.media.isPublic !== false,
        endDate: rounds.length ? rounds[rounds.length - 1].date : '',
        roundsMeta: rounds,
        categories: cfg.info.categories || [],
        level: cfg.info.level || '',
        typeId: cfg.info.typeId || '',
        fromWizard: true,
        wizardVersion: 2,
        courseRef: 'settings/course', // поле — единственное, живёт в настройках
        lifecycleStatus: (cfg.publish && cfg.publish.status === 'scheduled') ? 'draft' : 'registration',
        registration: {
            enabled: true,
            openAt: cfg.format.regOpen || '',
            closeAt: cfg.format.regClose || '',
            limit: Math.max(0, parseInt(cfg.participants && cfg.participants.limit, 10) || 0),
            waitlist: cfg.participants ? cfg.participants.waitlist !== false : true,
            approval: cfg.participants && cfg.participants.moderation || 'manual'
        },
        protocol: { version: 0, state: 'live', published: false, fixed: false },
        roles: {},
        wizard: cfg // полная конфигурация мастера (все 10 шагов)
    };
}

function tnwPublishConfig(cfg, draftKey) {
    var database = tnwDb();
    if (!database) return Promise.reject(new Error('no db'));
    var payload = tnwBuildTournamentPayload(cfg);
    return database.ref('tournaments').push(payload).then(function (ref) {
        // аудит публикации
        var audit = {
            event: 'published',
            at: Date.now(),
            by: tnwAuthorName(),
            owner: tnwOwnerKey(),
            draftKey: draftKey || null
        };
        return database.ref('tournaments/' + ref.key + '/audit').push(audit).then(function () { return ref.key; });
    });
}

function tnwPublish() {
    var errors = tnwValidate();
    if (errors.length) { if (typeof toast === 'function') toast(errors[0], 'error'); return; }
    var cfg = tnWiz.draft;
    var pub = cfg.publish || {};
    if (pub.status === 'scheduled') {
        var at = Date.parse(pub.scheduledAt || '');
        if (!isFinite(at)) { if (typeof toast === 'function') toast(tnL('Укажите дату/время отложенной публикации', 'Set schedule date/time'), 'error'); return; }
        if (at > Date.now()) {
            // останется черновиком со статусом scheduled — опубликуется автоматически
            tnwSet(tnWiz.draft, 'publish.status', 'scheduled');
            tnwMarkDirty();
            tnwSaveServer(true).then(function () {
                if (typeof toast === 'function') toast('⏰ ' + tnL('Публикация запланирована. Турнир опубликуется автоматически, когда админ-панель будет открыта после наступления времени.', 'Publishing scheduled. The tournament will go live automatically once the admin panel is opened after the set time.'));
            });
            return;
        }
    }
    var ev = (typeof window !== 'undefined') ? window.event : null;
    var btn = ev && ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    tnwPublishConfig(cfg, tnWiz.draftKey).then(function (tnId) {
        // турнир опубликован: черновик снимаем
        var database = tnwDb();
        if (database) database.ref('tnDrafts/' + tnwOwnerKey() + '/' + tnWiz.draftKey).remove();
        try { localStorage.removeItem(tnwLocalKey(tnWiz.draftKey)); } catch (e) { console.warn('[silent]', e); }
        var name = cfg.info.nameRu;
        tnWiz.draft = null;
        tnWiz.draftKey = null;
        tnWiz.step = 0;
        if (typeof toast === 'function') toast('🏆 ' + tnL('Турнир опубликован: ', 'Tournament published: ') + name);
        // Единая вкладка: публикация сразу открывает карточку нового турнира.
        if (typeof window !== 'undefined' && typeof window.tnsWizardPublished === 'function') { window.tnsWizardPublished(tnId); return; }
        tnwRenderWizard();
        // приносим пользователя в общий список (классическая суб-вкладка)
        tnwShowSubTab('classic');
    }).catch(function (err) {
        if (typeof toast === 'function') toast(tnL('Ошибка публикации: ', 'Publish error: ') + (err && err.message ? err.message : err), 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-bullhorn"></i> ' + tnL('Опубликовать', 'Publish'); }
    });
}

function tnwSaveDraftNow() {
    tnwMarkDirty();
    tnwSaveServer(true).then(function (ok) {
        if (typeof toast === 'function') toast(ok ? ('💾 ' + tnL('Черновик сохранён', 'Draft saved')) : tnL('Сохранено локально (нет базы)', 'Saved locally (no database)'), ok ? 'success' : 'info');
    });
}

function tnwSaveAsTemplate() {
    var cfg = tnWiz.draft;
    if (!cfg) return;
    var defName = (cfg.info && cfg.info.nameRu) || '';
    var name = prompt(tnL('Название шаблона:', 'Template name:'), defName);
    if (name == null || !String(name).trim()) return;
    tnTplCreateFromConfig(String(name).trim(), cfg).then(function () {
        if (typeof toast === 'function') toast('📐 ' + tnL('Шаблон сохранён: ', 'Template saved: ') + name);
    });
}

// ------------------------------------------------------------
// ШАБЛОНЫ ТУРНИРОВ (вкладка «Шаблоны турниров»)
// ------------------------------------------------------------
function tnTplStripForTemplate(cfg) {
    // из шаблона убираем даты и участников (по ТЗ)
    var c = TnEngine.utils.deepClone(cfg);
    if (c.format) {
        (c.format.rounds || []).forEach(function (r) { delete r.date; });
        c.format.regOpen = '';
        c.format.regClose = '';
    }
    c.participants = tnwDefaultDraft().participants;
    if (c.publish) { c.publish.status = 'draft'; c.publish.scheduledAt = ''; }
    return c;
}

function tnTplCreateFromConfig(name, cfg) {
    var database = tnwDb();
    if (!database) return Promise.resolve();
    return database.ref('tnTemplates').push({
        name: name,
        type: tnwCfgLabel(TN_CONFIG.tournamentTypes, (cfg.info && cfg.info.typeId) || ''),
        typeId: (cfg.info && cfg.info.typeId) || '',
        config: tnTplStripForTemplate(cfg),
        authorUid: tnwOwnerKey(),
        authorName: tnwAuthorName(),
        createdAt: Date.now(),
        updatedAt: Date.now()
    });
}

function tnwBindTemplates() {
    if (tnWiz.templatesBound) return;
    var database = tnwDb();
    if (!database) return;
    tnWiz.templatesBound = true;
    database.ref('tnTemplates').on('value', function (sn) {
        tnWiz.templates = sn.val() || {};
        if (tnWiz.subTab === 'templates') tnwRenderTemplates();
    });
}

function tnwRenderTemplates() {
    var root = document.getElementById('tn-templates-root');
    if (!root) return;
    tnwBindTemplates();
    var items = Object.keys(tnWiz.templates || {}).map(function (k) {
        var t = tnWiz.templates[k] || {};
        t._key = k;
        return t;
    }).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });

    var html = '<div class="tnw-card"><h3><i class="fas fa-layer-group"></i> ' + tnL('Шаблоны турниров', 'Tournament templates') + '</h3>' +
        '<div class="tnw-sub">' + tnL('Шаблон предзаполняет все настройки мастера, кроме дат и участников. Сохранить шаблон можно на шаге 10 мастера.', 'A template prefills all wizard settings except dates and participants. Save templates from wizard step 10.') + '</div>';

    if (!items.length) {
        html += '<div class="tnw-empty">' + tnL('Пока нет шаблонов. Создайте турнир в мастере и нажмите «Сохранить как шаблон».', 'No templates yet. Build a tournament in the wizard and press “Save as template”.') + '</div></div>';
        root.innerHTML = html;
        return;
    }
    html += '<div class="tnw-tpl-grid">' + items.map(function (t) {
        var sys = t.config && t.config.scoring ? (t.config.scoring.systems || []).map(function (s) { return tnwCfgLabel(TN_CONFIG.scoringSystems, s); }).join(', ') : '';
        var dt = t.updatedAt ? new Date(t.updatedAt).toLocaleDateString(tnL('ru-RU', 'en-GB')) : '—';
        return '<div class="tnw-tpl-card">' +
            '<div class="tnw-tpl-name">' + tnwEsc(t.name) + '</div>' +
            '<div class="tnw-tpl-meta">' +
            (t.type ? '<span><i class="fas fa-trophy"></i> ' + tnwEsc(t.type) + '</span>' : '') +
            (sys ? '<span><i class="fas fa-calculator"></i> ' + tnwEsc(sys) + '</span>' : '') +
            '<span><i class="fas fa-user"></i> ' + tnwEsc(t.authorName || '—') + '</span>' +
            '<span><i class="fas fa-clock"></i> ' + tnwEsc(dt) + '</span>' +
            '</div>' +
            '<div class="tnw-tpl-actions">' +
            '<button type="button" class="btn btn-g btn-sm" onclick="tnTplUse(\'' + tnwEsc(t._key) + '\')"><i class="fas fa-play"></i> ' + tnL('Создать турнир', 'Create tournament') + '</button>' +
            '<button type="button" class="btn btn-og btn-sm" onclick="tnTplRename(\'' + tnwEsc(t._key) + '\')"><i class="fas fa-pen"></i></button>' +
            '<button type="button" class="btn btn-og btn-sm" onclick="tnTplDuplicate(\'' + tnwEsc(t._key) + '\')"><i class="fas fa-copy"></i></button>' +
            '<button type="button" class="tnw-row-del" onclick="tnTplDelete(\'' + tnwEsc(t._key) + '\')"><i class="fas fa-trash"></i></button>' +
            '</div></div>';
    }).join('') + '</div></div>';
    root.innerHTML = html;
}

function tnTplUse(key) {
    var t = (tnWiz.templates || {})[key];
    if (!t || !t.config) return;
    var cfg = TnEngine.utils.deepClone(t.config);
    // даты и участники — по ТЗ не предзаполняются
    if (!cfg.format || !Array.isArray(cfg.format.rounds) || !cfg.format.rounds.length) {
        cfg.format = cfg.format || {};
        cfg.format.rounds = [{ date: '', title: 'R1', startTime: '09:00', startType: 'shotgun' }];
    }
    cfg.info = cfg.info || {};
    cfg.info.nameRu = '';
    // Единая вкладка: черновик из шаблона открывается в разделе мастера.
    if (typeof window !== 'undefined' && typeof window.tnsOpenWizardNew === 'function') {
        window.tnsOpenWizardNew();
        tnwStartNewDraft(cfg);
        if (typeof toast === 'function') toast('📐 ' + tnL('Создан черновик из шаблона: ', 'Draft created from template: ') + t.name);
        return;
    }
    tnwShowSubTab('new-create');
    tnwStartNewDraft(cfg);
    if (typeof toast === 'function') toast('📐 ' + tnL('Создан черновик из шаблона: ', 'Draft created from template: ') + t.name);
}
function tnTplRename(key) {
    var t = (tnWiz.templates || {})[key];
    if (!t) return;
    var name = prompt(tnL('Новое название шаблона:', 'New template name:'), t.name || '');
    if (name == null || !String(name).trim()) return;
    var database = tnwDb();
    if (database) database.ref('tnTemplates/' + key).update({ name: String(name).trim(), updatedAt: Date.now() });
}
function tnTplDuplicate(key) {
    var t = (tnWiz.templates || {})[key];
    if (!t) return;
    var database = tnwDb();
    if (!database) return;
    var copy = TnEngine.utils.deepClone(t);
    delete copy._key;
    copy.name = (t.name || '') + ' (' + tnL('копия', 'copy') + ')';
    copy.authorUid = tnwOwnerKey();
    copy.authorName = tnwAuthorName();
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();
    database.ref('tnTemplates').push(copy);
}
function tnTplDelete(key) {
    if (!confirm(tnL('Удалить шаблон?', 'Delete template?'))) return;
    var database = tnwDb();
    if (database) database.ref('tnTemplates/' + key).remove();
}

// ------------------------------------------------------------
// НАСТРОЙКИ ПОЛЯ (вкладка «Настройки поля»)
// ------------------------------------------------------------
function tnwCourseBlank(holesCount) {
    var n = parseInt(holesCount, 10) || 18;
    var holes = [];
    for (var i = 1; i <= n; i++) holes.push({ num: i, par: 4, si: i, yards: {} });
    return {
        name: '', logoUrl: '', address: '', lat: '', lng: '', type: n,
        difficultyNote: '', mapUrl: '', localRules: '',
        holes: holes,
        ratings: {}, // { tee: { cr, slope, par } }
        holeSponsors: {} // { holeNum: sponsorName }
    };
}

// Демо-поле «Пестово» (18 лунок, пар 72) — реалистичные пары и SI.
function tnwCourseDemo() {
    var pars =  [4, 5, 3, 4, 4, 3, 5, 4, 4,  4, 4, 3, 5, 4, 4, 3, 5, 4];
    var sis =   [9, 3, 17, 1, 11, 15, 5, 7, 13,  10, 4, 18, 2, 12, 8, 16, 6, 14];
    var wh =    [380, 520, 160, 430, 395, 175, 545, 410, 405,  420, 415, 155, 560, 400, 425, 165, 535, 390];
    var c = tnwCourseBlank(18);
    c.name = 'Гольф-клуб Пестово';
    c.address = 'Московская обл., Мытищи, Пестово';
    c.lat = '55.9702'; c.lng = '37.7560';
    c.type = 18;
    c.difficultyNote = 'Паркленд-поле, вода на 9 лунках, быстрые грины.';
    for (var i = 0; i < 18; i++) {
        var w = wh[i];
        c.holes[i] = { num: i + 1, par: pars[i], si: sis[i], yards: { bk: Math.round(w * 1.13), bl: Math.round(w * 1.06), wh: w, ye: Math.round(w * 0.92), rd: Math.round(w * 0.85) } };
    }
    c.ratings = {
        bk: { cr: 74.1, slope: 137 }, bl: { cr: 72.8, slope: 133 },
        wh: { cr: 71.5, slope: 128 }, ye: { cr: 69.8, slope: 123 }, rd: { cr: 71.9, slope: 126 }
    };
    return c;
}

function tnwBindCourse() {
    if (tnWiz.courseBound) return;
    var database = tnwDb();
    if (!database) return;
    tnWiz.courseBound = true;
    database.ref('settings/course').on('value', function (sn) {
        var v = sn.val();
        tnWiz.course = v || tnwCourseBlank(18);
        tnWiz.courseLoaded = true;
        if (tnWiz.subTab === 'course') tnwRenderCourse();
    });
}

function tnwRenderCourse() {
    var root = document.getElementById('tn-course-root');
    if (!root) return;
    if (typeof hasAdminPanelAccess === 'function' && !hasAdminPanelAccess()) {
        root.innerHTML = '<div class="tnw-empty">' + tnL('Настройки поля доступны только администратору.', 'Course settings are admin-only.') + '</div>';
        return;
    }
    tnwBindCourse();
    var c = tnWiz.course || tnwCourseBlank(18);
    var holes = (Array.isArray(c.holes) && c.holes.length) ? c.holes : tnwCourseBlank(c.type).holes;
    var N = holes.length;
    var tees = TN_CONFIG.teeBoxes;

    var html = '<div class="tnw-card"><h3><i class="fas fa-flag"></i> ' + tnL('Настройки поля', 'Course settings') + '</h3>' +
        '<div class="tnw-sub">' + tnL('Единственное поле клуба. Данные (пары, SI, рейтинги) автоматически используются мастером турниров, скорингом и печатью scorecard.', 'The single club course. Pars, SI and ratings feed the tournament wizard, scoring and scorecard printing automatically.') + '</div>' +
        '<div class="tnw-grid">' +
        '<div class="tnw-field"><label>' + tnL('Название', 'Name') + '</label><input type="text" data-tnw-course="name" value="' + tnwEsc(c.name) + '"></div>' +
        '<div class="tnw-field"><label>' + tnL('Логотип (URL)', 'Logo (URL)') + '</label><input type="text" data-tnw-course="logoUrl" value="' + tnwEsc(c.logoUrl) + '"></div>' +
        '<div class="tnw-field"><label>' + tnL('Адрес', 'Address') + '</label><input type="text" data-tnw-course="address" value="' + tnwEsc(c.address) + '"></div>' +
        '<div class="tnw-field"><label>' + tnL('Координаты', 'Coordinates') + '</label><div style="display:flex;gap:8px;"><input type="text" placeholder="lat" data-tnw-course="lat" value="' + tnwEsc(c.lat) + '"><input type="text" placeholder="lng" data-tnw-course="lng" value="' + tnwEsc(c.lng) + '"></div>' +
        (c.lat && c.lng ? '<div class="tnw-hint"><a href="https://maps.google.com/?q=' + tnwEsc(c.lat) + ',' + tnwEsc(c.lng) + '" target="_blank" rel="noopener" style="color:var(--gold);"><i class="fas fa-map-location-dot"></i> ' + tnL('Открыть карту', 'Open map') + '</a></div>' : '') + '</div>' +
        '<div class="tnw-field"><label>' + tnL('Тип поля', 'Course type') + '</label><select data-tnw-course="type">' +
        [9, 18, 27, 36].map(function (n) { return '<option value="' + n + '"' + (N === n || parseInt(c.type, 10) === n ? ' selected' : '') + '>' + n + ' ' + tnL('лунок', 'holes') + '</option>'; }).join('') + '</select>' +
        '<div class="tnw-hint">' + tnL('При смене типа таблица пересоздаётся (данные лунок сохраняются по возможности).', 'Changing type rebuilds the table (hole data is preserved where possible).') + '</div></div>' +
        '<div class="tnw-field"><label>' + tnL('Схема поля (URL изображения)', 'Course map (image URL)') + '</label><input type="text" data-tnw-course="mapUrl" value="' + tnwEsc(c.mapUrl) + '"></div>' +
        '<div class="tnw-field" style="grid-column:1/-1;"><label>' + tnL('Сложность поля (заметки)', 'Course difficulty notes') + '</label><input type="text" data-tnw-course="difficultyNote" value="' + tnwEsc(c.difficultyNote) + '"></div>' +
        '<div class="tnw-field" style="grid-column:1/-1;"><label>Local Rules</label><textarea data-tnw-course="localRules">' + tnwEsc(c.localRules) + '</textarea></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">' +
        '<button type="button" class="btn btn-g" onclick="tnCourseSave()"><i class="fas fa-save"></i> ' + tnL('Сохранить поле', 'Save course') + '</button>' +
        '<button type="button" class="btn btn-og" onclick="tnCourseDemoFill()"><i class="fas fa-fill-drip"></i> ' + tnL('Заполнить демо (18 лунок, пар 72)', 'Fill demo (18 holes, par 72)') + '</button>' +
        '<button type="button" class="btn btn-og" onclick="tnCourseExport()"><i class="fas fa-file-export"></i> JSON</button>' +
        '<button type="button" class="btn btn-og" onclick="tnCoursePrintScorecard()"><i class="fas fa-print"></i> ' + tnL('Печать scorecard', 'Print scorecard') + '</button>' +
        '</div></div>';

    // Таблица лунок
    html += '<div class="tnw-card"><h3><i class="fas fa-table-cells"></i> ' + tnL('Лунки', 'Holes') + '</h3>' +
        '<div class="tnw-sub">' + tnL('Yardage по каждому ти-боксу. Stroke index — уникальные значения 1…N.', 'Yardage per tee box. Stroke index values must be unique, 1…N.') + '</div>' +
        '<div class="tnw-course-table-wrap"><table class="tnw-course-table"><thead><tr>' +
        '<th>№</th><th>Par</th><th>SI</th>' +
        tees.map(function (tb) { return '<th><span class="tnw-tee-head" style="background:' + tb.color + ';"></span>' + tnwEsc(tnwCfgLabel(tees, tb.id)) + '</th>'; }).join('') +
        '<th>' + tnL('Холь-спонсор', 'Hole sponsor') + '</th></tr></thead><tbody>';

    for (var i = 0; i < N; i++) {
        var h = holes[i] || { num: i + 1, par: 4, si: i + 1, yards: {} };
        var sponsor = (c.holeSponsors && c.holeSponsors[h.num]) || '';
        html += '<tr><td><b>' + h.num + '</b></td>' +
            '<td><select data-tnw-hole="' + i + '" data-f="par">' + [3, 4, 5].map(function (p) { return '<option' + (h.par === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></td>' +
            '<td><input type="number" min="1" max="' + N + '" data-tnw-hole="' + i + '" data-f="si" value="' + tnwEsc(h.si) + '"></td>' +
            tees.map(function (tb) {
                return '<td><input type="number" min="0" data-tnw-hole="' + i + '" data-f="yd_' + tb.id + '" value="' + tnwEsc(h.yards && h.yards[tb.id] != null ? h.yards[tb.id] : '') + '" placeholder="—"></td>';
            }).join('') +
            '<td><input type="text" style="width:120px;" data-tnw-holesponsor="' + h.num + '" value="' + tnwEsc(sponsor) + '" placeholder="—"></td></tr>';
    }
    // итоговая строка
    html += '<tr class="tnw-totals"><td class="tnw-total">Σ</td><td class="tnw-total" id="tnw-par-total"></td><td></td>' +
        tees.map(function (tb) { return '<td class="tnw-total" id="tnw-yd-total-' + tb.id + '"></td>'; }).join('') + '<td></td></tr>';
    html += '</tbody></table></div>' +
        '<div id="tnw-course-validation"></div></div>';

    // Рейтинги по ти-боксам
    html += '<div class="tnw-card"><h3><i class="fas fa-gauge-high"></i> Course Rating / Slope (WHS)</h3>' +
        '<div class="tnw-course-table-wrap"><table class="tnw-course-table" style="min-width:520px;"><thead><tr><th>' + tnL('Ти', 'Tee') + '</th><th>Course Rating</th><th>Slope Rating</th></tr></thead><tbody>' +
        tees.map(function (tb) {
            var r = (c.ratings && c.ratings[tb.id]) || {};
            return '<tr><td class="l" style="text-align:left;"><span class="tnw-tee-head" style="background:' + tb.color + ';"></span>' + tnwEsc(tnwCfgLabel(tees, tb.id)) + '</td>' +
                '<td><input type="number" step="0.1" data-tnw-rating="' + tb.id + '" data-f="cr" value="' + tnwEsc(r.cr != null ? r.cr : '') + '" placeholder="72.0"></td>' +
                '<td><input type="number" step="1" data-tnw-rating="' + tb.id + '" data-f="slope" value="' + tnwEsc(r.slope != null ? r.slope : '') + '" placeholder="113"></td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="tnw-hint">' + tnL('Course Rating и Slope Rating используются для расчёта Playing Handicap по WHS: CH = HI × (Slope/113) + (CR − Par).', 'Course and Slope ratings feed the WHS Playing Handicap: CH = HI × (Slope/113) + (CR − Par).') + '</div></div>';
    html += '</div>';

    root.innerHTML = html;

    if (!root._tnwBound) {
        root._tnwBound = true;
        root.addEventListener('input', tnCourseOnInput);
        root.addEventListener('change', tnCourseOnInput);
    }
    tnCourseRecalc();
}

function tnCourseOnInput(e) {
    var el = e.target;
    if (!el) return;
    if (!tnWiz.course) tnWiz.course = tnwCourseBlank(18);
    var c = tnWiz.course;

    var cf = el.getAttribute('data-tnw-course');
    if (cf) {
        var v = el.value;
        if (cf === 'type') {
            var n = parseInt(v, 10) || 18;
            var old = (Array.isArray(c.holes) ? c.holes : []);
            var fresh = tnwCourseBlank(n).holes;
            for (var i = 0; i < Math.min(old.length, n); i++) fresh[i] = old[i];
            c.holes = fresh;
            c.type = n;
            tnwRenderCourse();
            return;
        }
        c[cf] = v;
        return;
    }
    var hi = el.getAttribute('data-tnw-hole');
    if (hi != null) {
        var idx = parseInt(hi, 10);
        if (!Array.isArray(c.holes) || !c.holes[idx]) return;
        var f = el.getAttribute('data-f');
        if (f === 'par' || f === 'si') c.holes[idx][f] = parseInt(el.value, 10) || 0;
        else if (f && f.indexOf('yd_') === 0) {
            c.holes[idx].yards = c.holes[idx].yards || {};
            var teeId = f.substring(3);
            if (el.value === '') delete c.holes[idx].yards[teeId];
            else c.holes[idx].yards[teeId] = parseInt(el.value, 10) || 0;
        }
        tnCourseRecalc();
        return;
    }
    var tr = el.getAttribute('data-tnw-rating');
    if (tr) {
        c.ratings = c.ratings || {};
        c.ratings[tr] = c.ratings[tr] || {};
        var rf = el.getAttribute('data-f');
        if (el.value === '') delete c.ratings[tr][rf];
        else c.ratings[tr][rf] = parseFloat(el.value);
        return;
    }
    var sp = el.getAttribute('data-tnw-holesponsor');
    if (sp) {
        c.holeSponsors = c.holeSponsors || {};
        if (el.value === '') delete c.holeSponsors[sp];
        else c.holeSponsors[sp] = el.value;
    }
}

// Пересчёт итогов + валидация (уникальность SI, сумма паров)
function tnCourseRecalc() {
    var c = tnWiz.course;
    if (!c || !Array.isArray(c.holes)) return;
    var holes = c.holes, N = holes.length;
    var parSum = 0, siSeen = {}, siDup = false, siOut = false;
    holes.forEach(function (h) {
        parSum += parseInt(h.par, 10) || 0;
        var si = parseInt(h.si, 10);
        if (!isFinite(si) || si < 1 || si > N) siOut = true;
        else if (siSeen[si]) siDup = true; else siSeen[si] = true;
    });
    var parEl = document.getElementById('tnw-par-total');
    if (parEl) parEl.textContent = parSum;
    TN_CONFIG.teeBoxes.forEach(function (tb) {
        var el = document.getElementById('tnw-yd-total-' + tb.id);
        if (!el) return;
        var s = holes.reduce(function (acc, h) { return acc + ((h.yards && h.yards[tb.id]) || 0); }, 0);
        el.textContent = s || '—';
    });
    // подсветка дублей / выхода за диапазон SI
    var siCount = {};
    holes.forEach(function (h) { var si = parseInt(h.si, 10); if (isFinite(si)) siCount[si] = (siCount[si] || 0) + 1; });
    document.querySelectorAll('#tn-course-root [data-f="si"]').forEach(function (inp) {
        var si = parseInt(inp.value, 10);
        var bad = !isFinite(si) || si < 1 || si > N || (siCount[si] || 0) > 1;
        inp.classList.toggle('tnw-invalid', bad);
    });
    var msgs = [];
    if (siDup) msgs.push(tnL('Stroke index: значения должны быть уникальными (1…' + N + ')', 'Stroke index values must be unique (1…' + N + ')'));
    if (siOut) msgs.push(tnL('Stroke index: допустимы значения 1…' + N, 'Stroke index must be within 1…' + N));
    var expected = { 9: [34, 36], 18: [70, 72] }[N];
    if (expected && (parSum < expected[0] || parSum > expected[1])) {
        msgs.push(tnL('Сумма паров ' + parSum + ' — для ' + N + ' лунок ожидается ' + expected[0] + '–' + expected[1] + ' (предупреждение)', 'Par total is ' + parSum + ' — for ' + N + ' holes ' + expected[0] + '–' + expected[1] + ' is expected (warning)'));
    }
    var box = document.getElementById('tnw-course-validation');
    if (box) box.innerHTML = msgs.map(function (m) { return '<div class="tnw-warn"><i class="fas fa-triangle-exclamation"></i> ' + tnwEsc(m) + '</div>'; }).join('');
    // запоминаем валидность для сохранения
    tnWiz._courseSiInvalid = siDup || siOut;
}

function tnCourseCollect() {
    var c = tnWiz.course || tnwCourseBlank(18);
    // нормализуем тип и лунки
    c.type = parseInt(c.type, 10) || (Array.isArray(c.holes) ? c.holes.length : 18);
    (c.holes || []).forEach(function (h, i) { h.num = i + 1; });
    return c;
}

function tnCourseSave() {
    var database = tnwDb();
    if (!database) { if (typeof toast === 'function') toast(tnL('Нет подключения к базе', 'No database'), 'error'); return; }
    if (typeof hasAdminPanelAccess === 'function' && !hasAdminPanelAccess()) {
        if (typeof toast === 'function') toast(tnL('Только для администратора', 'Admins only'), 'error');
        return;
    }
    if (tnWiz._courseSiInvalid) {
        if (typeof toast === 'function') toast(tnL('Исправьте ошибки stroke index перед сохранением', 'Fix stroke index errors before saving'), 'error');
        return;
    }
    var c = tnCourseCollect();
    c.updatedAt = Date.now();
    c.updatedBy = tnwAuthorName();
    database.ref('settings/course').set(c).then(function () {
        if (typeof toast === 'function') toast('⛳ ' + tnL('Поле сохранено', 'Course saved'));
    }).catch(function (err) {
        if (typeof toast === 'function') toast(tnL('Ошибка сохранения: ', 'Save error: ') + (err && err.message ? err.message : err), 'error');
    });
}

function tnCourseDemoFill() {
    if (!confirm(tnL('Заполнить таблицу демо-данными «Пестово» (пар 72)? Текущие значения поля будут заменены в форме.', 'Fill the table with the “Pestovo” demo (par 72)? Current form values will be replaced.'))) return;
    tnWiz.course = tnwCourseDemo();
    tnwRenderCourse();
    if (typeof toast === 'function') toast(tnL('Демо заполнено. Нажмите «Сохранить поле».', 'Demo filled. Press “Save course”.'));
}

function tnCourseExport() {
    var c = tnCourseCollect();
    tnwDownload('course-settings.json', TnEngine.Exporters.toJSON(c), 'application/json');
}

function tnCoursePrintScorecard() {
    var c = tnCourseCollect();
    var players = [];
    for (var i = 0; i < 4; i++) players.push({ id: 'p' + i, name: '', hi: '' });
    var html = TnEngine.Exporters.scorecardHtml(c, players, {
        brand: { name: c.name || 'Golf Club', logo: c.logoUrl || '', date: new Date().toLocaleDateString(tnL('ru-RU', 'en-GB')) },
        title: 'Scorecard',
        allowancePct: 100
    });
    tnwPrintHtml(html);
}

// ------------------------------------------------------------
// ВСПОМОГАТЕЛЬНОЕ: скачивание / печать
// ------------------------------------------------------------
function tnwDownload(filename, content, mime) {
    try {
        var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    } catch (e) { console.warn('[silent]', e); }
}

function tnwPrintHtml(html) {
    var w = window.open('', '_blank');
    if (!w) { if (typeof toast === 'function') toast(tnL('Разрешите всплывающие окна для печати', 'Allow pop-ups for printing'), 'error'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (e) { console.warn('[silent]', e); } }, 350);
}

// ------------------------------------------------------------
// СУБ-ВКЛАДКИ + HASH-РОУТИНГ (#new-create / #course / #templates)
// ------------------------------------------------------------
function tnwSubTabDefs() {
    return [
        { id: 'classic', icon: 'fa-list', ru: 'Классика · список турниров', en: 'Classic · tournament list', hash: '' },
        { id: 'new-create', icon: 'fa-wand-magic-sparkles', ru: 'Новая версия создания турнира', en: 'New tournament creation', hash: '#new-create' },
        { id: 'course', icon: 'fa-flag', ru: 'Настройки поля', en: 'Course settings', hash: '#course' },
        { id: 'templates', icon: 'fa-layer-group', ru: 'Шаблоны турниров', en: 'Tournament templates', hash: '#templates' }
    ];
}

function tnwShowSubTab(id, skipHash) {
    var defs = tnwSubTabDefs();
    var def = null;
    defs.forEach(function (d) { if (d.id === id) def = d; });
    if (!def) def = defs[0];
    tnWiz.subTab = def.id;
    defs.forEach(function (d) {
        var pane = document.getElementById('tn-pane-' + d.id);
        if (pane) pane.classList.toggle('hidden', d.id !== def.id);
        var btn = document.getElementById('tn-subtab-' + d.id);
        if (btn) btn.classList.toggle('active', d.id === def.id);
    });
    // Единая вкладка управляет hash сама — мастер его не трогает.
    var hostedInStudio = (typeof window !== 'undefined' && typeof window.tnsStudioHostsWizard === 'function' && window.tnsStudioHostsWizard());
    if (!skipHash && !hostedInStudio) {
        try {
            if (def.hash) history.replaceState(null, '', window.location.pathname + window.location.search + def.hash);
            else history.replaceState(null, '', window.location.pathname + window.location.search);
        } catch (e) { console.warn('[silent]', e); }
    }
    if (def.id === 'new-create') tnwRenderWizard();
    if (def.id === 'course') tnwRenderCourse();
    if (def.id === 'templates') tnwRenderTemplates();
}

// Открыть вкладку «Турниры» админки и нужную суб-вкладку по hash.
function tnwApplyHash() {
    var h = (window.location.hash || '').toLowerCase();
    // Единая вкладка турниров перехватывает все старые hash-маршруты.
    if (typeof window !== 'undefined' && typeof window.tnsRouteHash === 'function' && window.tnsRouteHash(h)) return;
    var sub = null;
    if (h === '#new-create') sub = 'new-create';
    else if (h === '#course') sub = 'course';
    else if (h === '#templates') sub = 'templates';
    if (!sub) return;
    // сначала активируем саму вкладку «Турниры» в админке
    var btn = document.querySelector('.admin-tab[onclick*="\'tournaments\'"]');
    if (btn && typeof switchTab === 'function') {
        var paneT = document.getElementById('tab-tournaments');
        if (paneT && paneT.classList.contains('hidden')) switchTab('tournaments', btn);
    }
    tnwShowSubTab(sub, true);
}

function tnwBuildSubTabsBar() {
    var bar = document.getElementById('tn-subtabs');
    if (!bar || bar._built) return;
    bar._built = true;
    bar.innerHTML = tnwSubTabDefs().map(function (d) {
        return '<button type="button" class="tnw-subtab" id="tn-subtab-' + d.id + '" onclick="tnwShowSubTab(\'' + d.id + '\')"><i class="fas ' + d.icon + '"></i> ' + tnwEsc(tnL(d.ru, d.en)) + '</button>';
    }).join('');
}

// ------------------------------------------------------------
// ИНИЦИАЛИЗАЦИЯ
// ------------------------------------------------------------
var tnwInited = false;
function tnwInit() {
    if (tnwInited) return;
    if (!document.getElementById('tn-wizard-root')) return; // не та страница
    if (typeof TnEngine === 'undefined') return;
    tnwInited = true;

    tnwBuildSubTabsBar();
    tnwShowSubTab((window.location.hash || '').toLowerCase() === '#new-create' ? 'new-create'
        : (window.location.hash || '').toLowerCase() === '#course' ? 'course'
        : (window.location.hash || '').toLowerCase() === '#templates' ? 'templates' : 'classic', true);

    window.addEventListener('hashchange', tnwApplyHash);

    // серверный автосейв черновика каждые 20 секунд
    setInterval(function () {
        if (tnWiz.subTab === 'new-create' && tnWiz.draft && tnWiz.dirty) tnwSaveServer(false);
    }, TNW_AUTOSAVE_MS);

    // Ctrl/Cmd+S — сохранить черновик
    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы')) {
            if (tnWiz.subTab === 'new-create' && tnWiz.draft) {
                e.preventDefault();
                tnwSaveDraftNow();
            }
        }
        if (e.key === 'Escape') {
            // модалок в модуле нет — резерв на будущее (единый обработчик)
        }
    });

    // перед уходом со страницы — локальный сейв
    window.addEventListener('beforeunload', function () { tnwSaveLocal(); });

    // перерисовка при смене языка (вызывается из utils.toggleLanguage)
    // данные тянем только когда админ-панель реально открыта
    if (typeof hasAdminPanelAccess === 'function' && hasAdminPanelAccess()) {
        tnwBindDrafts();
        tnwBindTemplates();
        tnwBindCourse();
    }
}

// перерисовать текущую суб-вкладку (смена языка)
function tnwOnLangChange() {
    if (!tnwInited) return;
    var bar = document.getElementById('tn-subtabs');
    if (bar) { bar._built = false; tnwBuildSubTabsBar(); }
    if (tnWiz.subTab === 'new-create') tnwRenderWizard();
    if (tnWiz.subTab === 'course') tnwRenderCourse();
    if (tnWiz.subTab === 'templates') tnwRenderTemplates();
}

// после входа в админку (вызывается из admin.js openAdminPanel)
function tnwOnAdminOpen() {
    if (!tnwInited) return;
    tnwBindDrafts();
    tnwBindTemplates();
    tnwBindCourse();
    tnwApplyHash();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tnwInit);
    else tnwInit();
}
