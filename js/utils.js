const CLUB = 'Гольф-клуб Пестово';
const TOTAL_PAR = 72;
const ADDR = 'МО, г. Мытищи, Никольская ул., 1, Румянцево';

const HOLES = {
    1:{p:4,hcp:5,bk:373,bl:339,wh:328,rd:317},
    2:{p:4,hcp:13,bk:272,bl:257,wh:257,rd:250},
    3:{p:5,hcp:9,bk:486,bl:475,wh:464,rd:423},
    4:{p:3,hcp:11,bk:192,bl:174,wh:161,rd:144},
    5:{p:4,hcp:1,bk:411,bl:382,wh:370,rd:331},
    6:{p:4,hcp:15,bk:377,bl:345,wh:333,rd:316},
    7:{p:4,hcp:3,bk:406,bl:380,wh:336,rd:308},
    8:{p:3,hcp:7,bk:181,bl:165,wh:159,rd:132},
    9:{p:5,hcp:17,bk:507,bl:459,wh:421,rd:399},
    10:{p:5,hcp:12,bk:491,bl:470,wh:461,rd:442},
    11:{p:4,hcp:16,bk:382,bl:362,wh:345,rd:318},
    12:{p:4,hcp:2,bk:383,bl:375,wh:365,rd:322},
    13:{p:3,hcp:18,bk:185,bl:162,wh:138,rd:123},
    14:{p:4,hcp:4,bk:374,bl:362,wh:327,rd:323},
    15:{p:5,hcp:8,bk:533,bl:517,wh:483,rd:454},
    16:{p:4,hcp:14,bk:423,bl:391,wh:368,rd:312},
    17:{p:3,hcp:10,bk:199,bl:188,wh:174,rd:151},
    18:{p:4,hcp:6,bk:375,bl:349,wh:335,rd:302}
};

const TIMINGS = {1:15,2:15,3:20,4:12,5:15,6:15,7:15,8:12,9:20,10:20,11:15,12:15,13:12,14:15,15:20,16:15,17:12,18:15};
const TEES = {bk:'Чёрный',bl:'Синий',wh:'Белый',rd:'Красный'};
const TEE_ORDER = ['bk', 'bl', 'wh', 'rd'];
const COURSE_RATINGS = {
    men:{bk:{cr:76.0,sr:144},bl:{cr:73.8,sr:137},wh:{cr:72.0,sr:135},rd:{cr:69.2,sr:134}},
    women:{bl:{cr:80.8,sr:153},wh:{cr:78.6,sr:143},rd:{cr:75.2,sr:136}}
};

function holePar(h){return HOLES[h]?HOLES[h].p:4;}
function holeDist(h,teeCode){teeCode=teeCode||'wh';return HOLES[h]?(HOLES[h][teeCode]||0):0;}
function holeHcp(h){return HOLES[h]?HOLES[h].hcp:h;}
function holeTiming(h){return TIMINGS[h]||15;}
function fmtScore(s){if(s===null||s===undefined||isNaN(s))return'—';if(s===0)return'E';return s>0?'+'+s:''+s;}
function scoreClass(s){if(s===null||s===undefined)return'';return s<0?'s-un':s>0?'s-ov':'s-ev';}
function holeResClass(s,p){if(!s||s<1||!p)return'';var d=s-p;if(d<=-2)return'r-eag';if(d===-1)return'r-bir';if(d===0)return'r-par';if(d===1)return'r-bog';return'r-dbl';}
function holeResName(s,p){
    if(!s||!p)return'';
    if(s===1)return t('res_hio');
    var d=s-p;
    if(d<=-3)return t('res_albatross');
    if(d===-2)return t('res_eagle');
    if(d===-1)return t('res_birdie');
    if(d===0)return t('res_par');
    if(d===1)return t('res_bogey');
    if(d===2)return t('res_double');
    return '+'+d;
}
function toast(m,toastType){toastType=toastType||'success';var e=document.createElement('div');e.className='toast t-'+toastType;e.innerHTML=m;document.body.appendChild(e);setTimeout(function(){e.classList.add('t-show');},10);setTimeout(function(){e.classList.remove('t-show');setTimeout(function(){e.remove();},300);},4000);}
function isPlayerModeEnabled(key){
    try { return localStorage.getItem(key) === '1'; } catch(e) { return false; }
}
function vib(pattern){
    if (!navigator.vibrate) return;
    var value = pattern === undefined || pattern === null ? 50 : pattern;
    // Усиленный режим меняет только длительность вибрации, сохраняя ритм паттерна.
    if (isPlayerModeEnabled('pestovo_strong_vibration')) {
        if (Array.isArray(value)) {
            value = value.map(function(part, index) {
                if (index % 2 === 0) return Math.min(650, Math.max(35, Math.round((parseInt(part) || 0) * 1.45)));
                return Math.min(260, Math.max(20, Math.round((parseInt(part) || 0) * 0.9)));
            });
        } else {
            value = Math.min(650, Math.max(70, Math.round((parseInt(value) || 50) * 1.5)));
        }
    }
    try { navigator.vibrate(value); } catch(e) {}
}
function fmtDate(ts){if(!ts)return'—';return new Date(ts).toLocaleDateString(currentLang === 'en' ? 'en-US' : 'ru-RU',{day:'2-digit',month:'short',year:'numeric'});}
function fmtTime(ts){if(!ts)return'—';var d=new Date(ts),h=d.getHours(),m=d.getMinutes();return(h<10?'0':'')+h+':'+(m<10?'0':'')+m;}
function baseUrl(){var loc=window.location,path=loc.pathname,dir=path.substring(0,path.lastIndexOf('/')+1);return loc.origin+dir;}
function qrUrl(data){return'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='+encodeURIComponent(data);}
function escapeHtml(str){
    if(str===null||str===undefined)return'';
    return String(str).replace(/[&<>"']/g,function(c){
        return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
}

// Одна Firebase-подписка на логический виджет. Повторный рендер (например, при
// смене языка или фильтра) переиспользует последний снимок, не создавая дублей.
var realtimeValueBindings = Object.create(null);
function bindRealtimeValue(key, firebaseRef, render) {
    if (!key || !firebaseRef || typeof render !== 'function') return;
    var binding = realtimeValueBindings[key];
    if (!binding) {
        binding = realtimeValueBindings[key] = { render: render, snapshot: null };
        firebaseRef.on('value', function(snapshot) {
            binding.snapshot = snapshot;
            binding.render(snapshot);
        }, function(error) {
            console.error('[Firebase] ' + key + ':', error);
        });
    } else {
        binding.render = render;
        if (binding.snapshot) binding.render(binding.snapshot);
    }
}

// Глобальный fallback для битых <img> (заменяет инлайн-обработчики onerror — лучше для CSP).
// Слушаем в фазе capture: ошибки ресурсов не всплывают.
document.addEventListener('error', function(e) {
    var el = e && e.target;
    if (el && el.tagName === 'IMG') { el.style.display = 'none'; }
}, true);

// Санитизация имён/текстов перед записью в БД: убираем HTML/JS-инъекции на входе,
// чтобы все места, где имя рендерится в innerHTML, были безопасны.
function sanitizeNameRaw(str){
    if(str===null||str===undefined)return'';
    var s=String(str);
    s=s.replace(/[<>&"'`{}\\\/\[\]();:]/g,'');   // потенциально опасная для HTML разметка
    s=s.replace(/\s+/g,' ').trim();
    if(s.length>60)s=s.substring(0,60).trim();
    return s;
}

// ==========================================
// МЕЖДУНАРОДНЫЙ ЯЗЫКОВОЙ ПЕРЕКЛЮЧАТЕЛЬ (RU / EN)
// ==========================================
var currentLang = (typeof localStorage !== 'undefined' && localStorage.getItem('pestovo_lang')) || 'ru';

var I18N = {
    ru: {
        brand_name: 'Пестово',
        nav_home: 'Главная', nav_round: 'Раунд', nav_leaderboard: 'Все раунды',
        bn_home: 'Главная', bn_round: 'Раунд', bn_rounds: 'Табло', bn_guide: 'Поле', bn_menu: 'Меню',
        nav_guide: 'Книга поля', nav_feed: 'Лента событий', nav_predictor: 'Симулятор WHS', nav_oom: 'Зачёт сезона',
        nav_players: 'Игроки', nav_tournaments: 'Турниры', nav_stats: 'Статистика',
        nav_handicaps: 'Гандикапы', nav_admin: 'Админ', nav_login: 'Войти',
        footer_club: '© 2024 Гольф-клуб Пестово',

        hero_sub: 'Цифровая счётная карточка Пестово',
        hero_title: 'Лайв-скоринг и электронные карточки Пестово',
        hero_desc: '18 лунок · Пар 72',
        btn_start_game: 'Начать игру',
        btn_view_scores: 'Все раунды',
        sec_now_playing: 'Сейчас на поле',
        sec_my_active: 'Мои активные раунды',
        continue_round: 'Продолжить игру',
        sec_club_stats: 'Клуб в цифрах',
        sec_course_card: 'Поле клуба',
        sec_recent_results: 'Последние результаты',
        all_rounds: 'Все раунды',
        no_active_players: 'Сейчас никто не играет',
        course_card_sub: '18 лунок · Пар 72 · Все ТИ (метры)',
        address_str: '📍 МО, г. Мытищи, Никольская ул., 1, Румянцево',
        nav_header: 'Навигация',
        more_header: 'Ещё',

        tee_bk: 'Чёрный', tee_bl: 'Синий', tee_wh: 'Белый', tee_rd: 'Красный',
        tee_opt_bk: '⬛ Чёрный', tee_opt_bl: '🟦 Синий', tee_opt_wh: '⬜ Белый', tee_opt_rd: '🟥 Красный',
        hole: 'Лунка', par: 'Пар', index: 'Индекс', gross: 'Gross',
        hole_lbl: 'Лунка', par_lbl: 'Пар', dist_lbl: 'Метры', deadline_lbl: 'Дедлайн',
        stbl_field: 'Stableford (пол.)', stbl_exact: 'Stableford (игр.)',
        out: 'Аут', in_side: 'Ин', total: 'Итого', meters: 'Метры', deadline: 'Дедлайн',
        format_match_1v1: 'Матч-плей (1х1)',
        format_match_2v2: 'Матч-плей (2х2)',
        format_scramble: 'Скрембл (Scramble)',
        voice_score_btn: 'Голос',
        hole_map_btn: '2D Схема',
        analytics_title: 'Аналитика',
        voice_not_supported: 'Голосовой ввод не поддерживается вашим браузером',
        no_data: 'Нет данных',
        select_hole_title: 'Выберите лунку:',
        putts_label: 'Патты:',
        forecast_input_title: 'Данные для прогноза',
        select_registered_player: 'Выберите зарегистрированного игрока:',
        planned_tee: 'Планируемый ТИ:',
        guide_sub: 'Тактический гид и советы тренера Пестово',
        save_group: 'Сохранить Группу',
        test_group: 'Проверить Группу',
        save_channel: 'Сохранить Канал',
        test_channel: 'Проверить Канал',
        save_vk: 'Сохранить настройки ВКонтакте',
        test_vk: 'Проверить отправку в ВКонтакте',
        tg_integration_title: 'Интеграция Telegram: Группа Судей & Канал Клуба',
        tg_integration_sub: 'Вы можете настроить отправку уведомлений отдельно для Группы Судей/Маршалов и для Канала Клуба.',
        tg_group_title: '1. Telegram Группа (Вызовы Судей и Маршалов)',
        tg_group_sub: '💡 Добавьте бота в группу судей. Chat ID обычно начинается с -100...',
        tg_channel_title: '2. Telegram Канал (Анонсы и Результаты)',
        tg_channel_sub: '💡 Назначьте бота Администратором канала с правом публикации сообщений.',
        placeholder_tg_channel_id: '@pestovo_golf или -1001987654321',
        vk_integration_title: 'Интеграция ВКонтакте (VK API)',
        vk_integration_sub: 'При вызове судьи или маршала уведомление мгновенно отправится в беседу или личные сообщения ВКонтакте.',
        vk_token_lbl: 'VK Access Token Сообщества',
        placeholder_vk_peer_id: '2000000001 (беседа) или 123456789 (пользователь)',
        placeholder_bc_title: '🏆 Чемпионат Пестово 2024',
        placeholder_bc_body: 'Регистрация на турнир открыта! Старт в субботу в 10:00.',
        share_card: 'Поделиться в соцсетях (PNG)',
        download_png: 'Скачать картинку (PNG)',
        share_native: 'Поделиться в приложении',

        page_title_live: 'Начать раунд',
        page_sub_live: 'Одиночный или групповой раунд — переключайте вкладки',
        round_setup: 'Настройки раунда',
        group_setup_title: 'Настройка группы',
        solo_round: 'Одиночный раунд', group_round: 'Групповой раунд',
        solo_desc: 'Играете один. Сами вводите свой счёт на каждой лунке.',
        group_desc: 'От 2 до 4 игроков. Двойной ввод (свой счёт + счёт партнёра).',
        mode_solo_title: 'Одиночный раунд',
        mode_solo_desc: 'Играете один. Сами вводите свой счёт на каждой лунке.',
        mode_group_title: 'Групповой раунд',
        mode_group_desc: 'От 2 до 4 игроков. Двойной ввод (свой счёт + счёт партнёра).',
        mode_start: 'Начать',
        tournament_opt: 'Турнир (опционально)',
        no_tournament: '— Без турнира —',
        start_time: 'Время старта', start_hole: 'Стартовая лунка', holes_count: 'Сколько лунок',
        tee_select: 'ТИ', format_select: 'Формат',
        player_count: 'Количество игроков',
        player_count_1: '1 игрок', player_count_2: '2 игрока', player_count_3: '3 игрока', player_count_4: '4 игрока',
        player_data: 'Данные игрока',
        select_registered: 'Выбрать из зарегистрированных',
        guest_manual: '— Гость / ввести вручную —',
        first_name: 'Имя', last_name: 'Фамилия', middle_name: 'Отчество (необязательно)', gender_label: 'Пол',
        placeholder_first_name: 'Имя', placeholder_last_name: 'Фамилия', placeholder_middle_name: 'Отчество',
        placeholder_tn_name: 'Чемпионат Пестово',
        placeholder_hcp_calc: '+2.4 или 12.4',
        men: 'Мужчина', women: 'Девушка',
        exact_hcp: 'Точный гандикап', field_hcp: 'Полевой гандикап',
        field_auto: 'Полевой (авто)',
        start_round_btn: 'Начать раунд', back_btn: 'Назад',
        timings_title: 'Тайминги',
        pace_of_play: 'Темп игры',
        pace_current_hole: 'Текущая лунка',
        pace_completed: 'Пройдено',
        pace_delay: 'Общее отставание',
        pace_buffer: 'Запас',
        pace_on_time: 'В графике',
        pace_warning: 'Небольшое отставание',
        pace_late: 'Отставание',
        pace_severe: 'Сильное отставание',
        pace_pending: 'Тайминг появится после сохранения лунок',
        pace_deadline: 'Плановый дедлайн',
        pace_hole_norm: 'Норма',
        pace_in_progress: 'в процессе',
        time_and_hole: 'Время и лунка',
        game_format: 'Формат игры',

        my_score: 'Мой счёт',
        marker_for: 'Маркер для',
        score_of_player: 'Счёт игрока:',
        score_col_you: '(вы вводите свой счёт)',
        score_col_marked: '(того, за кем вы ведёте счёт)',
        save_hole: 'Сохранить лунку', finish_round: 'Завершить раунд',
        next_hole_btn: 'На следующую лунку →',
        show_stableford_points: 'Показывать очки Stableford',
        show_stableford_points_hint: 'Очки с учётом полевой форы будут показаны рядом с введённым счётом. Эта настройка сохраняется только для вас.',
        stableford_default: 'Stableford по умолчанию',
        stableford_default_hint: 'Показывать очки Stableford рядом со счётом всем игрокам, которые ещё не выбрали личную настройку.',
        save_stableford_default: 'Сохранить настройку Stableford',
        confirm_final_hole: 'Зафиксировать 18-ю лунку',
        waiting_for_marker: '⏳ Ваш счёт введён. Ожидаем подтверждение от маркера',
        hole_finalized_both: '✅ Счёт зафиксирован и подтверждён обеими сторонами!',
        mismatch_error: '⚠️ Несовпадение с маркером! Исправьте результат.',
        call_referee: 'Вызвать судью', call_marshal: 'Вызвать маршала',
        call_sent: 'Вызов отправлен',
        call_accepted: 'принял вызов',
        call_on_way: 'едет',
        call_retry_in: 'Повторный вызов через',
        call_cooldown: 'Повторный вызов будет доступен через',
        read_only_mode: 'Режим просмотра. Ввод счёта доступен только участникам раунда.',
        view_only_group_desc: 'Режим просмотра. Ввод счёта доступен только участникам раунда.',
        round_score: 'Счёт раунда', hole_scorecard: 'Счётная карточка по лункам',
        group_summary: 'Сводка группы',
        connect_players: 'Подключение игроков группы',
        connect_players_title: 'Подключение игроков группы',
        connect_players_desc: 'Дайте отсканировать QR-код другим игрокам, чтобы они открыли счётную карточку со своих телефонов.',
        scan_to_play: 'Сканируй, чтобы играть за этого игрока',
        round_progress: 'Прогресс раунда',
        finished_f: 'Завершил (F)',

        res_hio: 'Hole-in-One!', res_albatross: 'Альбатрос', res_eagle: 'Eagle',
        res_birdie: 'Birdie', res_par: 'Par', res_bogey: 'Bogey', res_double: 'Double',

        weather_clear: 'Ясно', weather_cloudy: 'Малооблачно', weather_fog: 'Туман',
        weather_rain: 'Дождь', weather_snow: 'Снег', weather_thunder: 'Гроза',
        wind_label: 'Ветер',

        status_label: 'Статус', status_all: 'Все', status_active: 'Live', status_completed: 'Завершённые',
        all_players: 'Все игроки',
        type_registered: 'Только зарегистрированные',
        type_guests: 'Только гости',
        sort_rounds: 'По раундам', sort_gross: 'По лучшему Gross', sort_name: 'По имени',
        player_type: 'Тип игрока',
        sort_by: 'Сортировка',
        role_admin: 'Администратор',
        role_referee: 'Судья',
        role_marshal: 'Маршал',
        role_player: 'Игрок',
        export_csv_btn: 'Экспортировать все раунды в CSV',
        download_backup_btn: 'Скачать бэкап базы (JSON)',
        generate_flights_btn: 'Сформировать флайты',
        register_tournament_btn: 'Записаться на турнир',
        registered_badge: 'Вы зарегистрированы ✅',
        cancel_registration: 'Отменить запись',
        participants_list: 'Список участников',
        registered_count: 'Заявлено участников',
        msg_tournament_registered: '🎉 Вы успешно записались на турнир!',
        msg_registration_cancelled: 'Запись на турнир отменена',
        confirm_registration: 'Подтвердить запись на турнир',
        tools_title: 'Инструменты и функции',
        gps_rangefinder: 'GPS-Дальномер до грина',
        shot_tracking: 'Детальный трекинг ударов (FIR/GIR/Putts)',
        tv_mode: 'ТВ-Трансляция (Clubhouse TV)',
        h2h_duel: 'Сравнение игроков 1v1 (Head-to-Head)',
        enabled_lbl: 'Включено ✅',
        disabled_lbl: 'Выключено ❌',
        send_broadcast_title: 'Отправить Push-анонс клуба',
        send_broadcast_sub: 'Сообщение будет отправлено на смартфоны всех игроков клуба.',
        broadcast_title_lbl: 'Заголовок анонса',
        broadcast_body_lbl: 'Текст сообщения',
        broadcast_link_lbl: 'Ссылка (опционально)',
        send_broadcast_btn: 'Отправить анонс всем игрокам',
        broadcast_history_title: 'История отправленных анонсов',
        edit_profile: 'Редактировать профиль',
        save_profile: 'Сохранить профиль',
        cancel_btn: 'Отмена',
        expand_scorecard: 'Показать карточку',
        collapse_scorecard: 'Свернуть карточку',
        expand_round: 'Развернуть раунд',
        collapse_round: 'Свернуть раунд',
        expand_all_rounds: 'Развернуть все',
        collapse_all_rounds: 'Свернуть все',
        live_rounds_hint: 'Видно, кто сейчас на поле. Нажмите на строку, чтобы развернуть детали',
        field_map_title: 'Карта лунок и старты',
        my_round_tag: 'Мой раунд',
        current_round_tag: 'Текущий',
        leader_lbl: 'Лидер',
        sc_tab_front: 'Первые 9',
        sc_tab_back: 'Вторые 9',
        sc_tab_all: 'Все 18',
        sc_topar_lbl: 'To-par по ходу',
        to_current_hole: 'К текущей лунке',
        no_current_hole: 'Текущая лунка ещё не определена',
        avatar_label: 'Аватар профиля',
        upload_photo: 'Загрузить фото',
        choose_preset: 'Или выберите иконку',
        phone_label: 'Телефон',
        default_tee: 'Предпочитаемый ТИ по умолчанию',
        msg_profile_saved: '✅ Профиль обновлён!',
        search_label: 'Поиск игрока',
        search_placeholder: 'Поиск по имени...',
        page_title_handicaps: 'Полевые гандикапы',
        page_sub_handicaps: 'Пестово · Пар 72',
        admin_login_title: 'Вход в админ-панель',
        remember_me: 'Запомнить меня',
        forgot_password: 'Забыли пароль?',
        admin_logout: 'Выйти из админки',
        tournament_date_label: 'Дата',
        tournament_name_label: 'Название',
        all_genders: 'Все', men_plural: 'Мужчины', women_plural: 'Девушки',
        quick_calc: 'Быстрый расчёт',
        full_table: 'Посмотреть полную таблицу',
        full_table_title: 'Посмотреть полную таблицу',
        full_table_sub: 'Выберите пол и ТИ — таблица появится ниже',
        tbl_gender: 'Пол игрока',
        tbl_select_gender: '— Пол —',
        tbl_select_tee: '— ТИ —',
        select_gender_first: '— Сначала пол —',
        from_col: 'Показатель от', to_col: 'Показатель до',
        round_history: 'История раундов',

        // Режимы интерфейса игрока
        large_ui_mode: 'Крупный шрифт и кнопки',
        strong_vibration_mode: 'Усиленная вибрация',
        high_contrast_mode: 'Более заметные цвета статусов',
        battery_saver_mode: 'Экономия батареи',
        player_modes_title: 'Мои настройки',
        my_preferences_title: 'Мои настройки',
        mode_on: 'Вкл.',
        mode_off: 'Выкл.',

        // Solo & Guest
        solo_sub: 'Гольф-клуб Пестово',
        current_score: 'Текущий счёт',
        view_mode_notice: 'Режим просмотра.',

        // Admin & Auth
        admin_login: 'Вход в админ-панель',
        admin_panel: 'Админ-панель',
        admin_desc: 'Войдите с мастер-паролем или авторизуйтесь через аккаунт с правами администратора.',
        username: 'Логин', password: 'Пароль',
        login_btn: 'Войти', register_btn: 'Регистрация', create_account: 'Создать аккаунт',
        continue_guest: 'Продолжить как гость',
        tab_rounds: 'Раунды', tab_alerts: 'Вызовы 🚨', tab_groups: 'Группы сейчас ⏱️', tab_tournaments: 'Турниры',
        tab_players: 'Игроки и роли', tab_data: 'Данные',
        tab_importexport: 'Импорт/Экспорт 📊', tab_rusgolf: 'RUSGOLF 🇷🇺',
        imp_exp_title: 'Импорт и экспорт игроков (Excel)',
        imp_exp_sub: 'Выгружайте список игроков в таблицу Excel и импортируйте игроков обратно: имя, фамилия и точный гандикап.',
        rg_title: 'Проверка гандикапа — база АГР России',
        rg_sub: 'Поиск точного гандикапа (HI) игрока в официальной базе Ассоциации гольфа России (hcp.rusgolf.ru) с возможностью добавить игрока к себе на сайт.',
        all_tournaments: 'Все турниры',
        create_tournament: 'Создать турнир',
        tournament_name: 'Название', tournament_date: 'Дата',
        available_formats: 'Доступные форматы', available_tees: 'Доступные ТИ',
        create_btn: 'Создать',
        admin_only_tournaments: 'Турниры создаёт только администратор.',
        admin_panel_link: 'Админка',
        referee_marshal_calls: 'Вызовы судей и маршалов',
        admin_groups_title: 'Группы, которые сейчас играют',
        admin_groups_sub: 'Контроль темпа игры по активным групповым раундам',
        admin_no_groups: 'Сейчас нет активных групповых раундов',
        admin_group_players: 'Игроки',
        admin_start_time: 'Стартовое время',
        admin_start_hole: 'Стартовая лунка',
        admin_current_hole: 'Текущая лунка',
        admin_hole_timings: 'Тайминги прохождения лунок',
        admin_total_delay: 'Общее отставание',
        enable_push_notifications: 'Включить Push-уведомления',
        manage_players_roles: 'Управление игроками и ролями',
        manage_players_sub: 'Назначайте права Администратора другим игрокам. Администраторы получают полный доступ к этой панели.',
        data_management: 'Управление данными',
        data_danger_sub: 'Осторожно — действия необратимы.',
        page_visibility_title: 'Управление видимостью страниц и функций',
        page_visibility_sub: 'Снимите галочку с любой страницы или функции, чтобы полностью скрыть её из меню навигации для игроков.',
        save_visibility_btn: 'Сохранить настройки',
        tab_broadcasts: 'Анонсы 📢',
        delete_all_rounds: 'Удалить все раунды',
        delete_all_data: 'Удалить всех игроков и раунды',
        delete_all_data_sub: 'Полностью удаляет всех игроков и все раунды. Данные исчезнут из всех списков, статистики и автоподбора и не появятся снова.',
        full_name: 'Имя и фамилия',
        repeat_password: 'Повторите пароль',

        // Scorer & Marker
        scorer_title: 'Ввод счёта',
        marker_title: '👁️ Маркер',
        confirm_score_sub: 'Подтверждение счёта',
        marker_notice_title: 'Вы — маркер',
        marker_notice_desc: 'Введите наблюдаемый счёт. Подтверждается только при совпадении.',
        confirm_btn: 'Подтвердить',

        // Stats
        page_title_stats: 'Статистика клуба',
        page_sub_stats: 'Аналитика по всем раундам',
        total_stats: 'Общая статистика',
        top_players: 'Топ игроков',
        club_records: 'Рекорды клуба',
        hole_difficulty: 'Сложность лунок',

        // Offline & Error
        offline_title: 'Нет соединения',
        offline_desc: 'Проверьте интернет-соединение. Ваши результаты сохраняются локально.',
        refresh_btn: 'Обновить', error_title: 'Ошибка', qr_invalid: 'QR-код недействителен.',

        // Toast Messages
        msg_start_time_req: 'Укажите время старта',
        msg_name_req: 'Заполните имя игрока',
        msg_exact_hcp_req: 'Укажите точный гандикап',
        msg_round_started: '🏌️ Раунд начат!',
        msg_saved_hole: '✅ Сохранено на лунке ',
        msg_edit_disabled: 'Редактирование запрещено',
        msg_score_min: 'Счёт должен быть ≥ 1',
        msg_finish_confirm: 'Завершить раунд?',
        msg_round_finished: '🏁 Раунд завершён!',

        player: 'Игрок', players_label: 'Игроки', guest: 'ГОСТЬ', start: 'Старт', date: 'Дата', format: 'Формат',
        round_leader: 'Лидер раунда', no_completed: 'Пока нет завершённых раундов',

        unsaved_score_hint: 'Счёт не сохранён — нажмите кнопку «Сохранить»',
        start_hint_title: 'С какой лунки лучше стартовать?',
        field_hcp_short: 'пол. HCP',
        exact_hcp_short: 'точн. HCP',
        total_players_on_course: 'Всего игроков на поле',
        total_players_label: 'Всего игроков',
        free_holes_label: 'Свободные лунки',
        busy_holes_label: 'Занятые лунки',
        tee_label: 'ТИ'
    },
    en: {
        brand_name: 'Pestovo',
        nav_home: 'Home', nav_round: 'Round', nav_leaderboard: 'All Rounds',
        bn_home: 'Home', bn_round: 'Round', bn_rounds: 'Board', bn_guide: 'Course', bn_menu: 'Menu',
        nav_guide: 'Course Guide', nav_feed: 'Live Feed', nav_predictor: 'WHS Predictor', nav_oom: 'Order of Merit',
        nav_players: 'Players', nav_tournaments: 'Tournaments', nav_stats: 'Statistics',
        nav_handicaps: 'Handicaps', nav_admin: 'Admin', nav_login: 'Login',
        footer_club: '© 2024 Pestovo Golf Club',

        hero_sub: 'Pestovo Digital Scorecard',
        hero_title: 'Pestovo Live Scoring & Digital Scorecards',
        hero_desc: '18 Holes · Par 72',
        btn_start_game: 'Start Game',
        btn_view_scores: 'All Rounds',
        sec_now_playing: 'Currently Playing',
        sec_my_active: 'My Active Rounds',
        continue_round: 'Continue Playing',
        sec_club_stats: 'Club Statistics',
        sec_course_card: 'Course Map',
        sec_recent_results: 'Recent Results',
        all_rounds: 'All Rounds',
        no_active_players: 'No active players on course',
        course_card_sub: '18 Holes · Par 72 · All Tees (meters)',
        address_str: '📍 Pestovo Golf Club, Mytishchi, Moscow Region',
        nav_header: 'Navigation',
        more_header: 'More',

        tee_bk: 'Black', tee_bl: 'Blue', tee_wh: 'White', tee_rd: 'Red',
        tee_opt_bk: '⬛ Black', tee_opt_bl: '🟦 Blue', tee_opt_wh: '⬜ White', tee_opt_rd: '🟥 Red',
        hole: 'Hole', par: 'Par', index: 'Index', gross: 'Gross',
        hole_lbl: 'Hole', par_lbl: 'Par', dist_lbl: 'Meters', deadline_lbl: 'Deadline',
        stbl_field: 'Stableford (Course)', stbl_exact: 'Stableford (Playing)',
        out: 'Out', in_side: 'In', total: 'Total', meters: 'Meters', deadline: 'Deadline',
        format_match_1v1: 'Match Play (1v1)',
        format_match_2v2: 'Match Play (2v2)',
        format_scramble: 'Scramble',
        voice_score_btn: 'Voice',
        hole_map_btn: '2D Map',
        analytics_title: 'Analytics',
        voice_not_supported: 'Voice input is not supported by your browser',
        no_data: 'No data',
        select_hole_title: 'Select Hole:',
        putts_label: 'Putts:',
        forecast_input_title: 'Handicap Predictor Data',
        select_registered_player: 'Select Registered Player:',
        planned_tee: 'Planned Tee:',
        guide_sub: 'Tactical Guide & Pestovo Pro Coach Tips',
        save_group: 'Save Group',
        test_group: 'Test Group',
        save_channel: 'Save Channel',
        test_channel: 'Test Channel',
        save_vk: 'Save VKontakte Settings',
        test_vk: 'Test VK Message',
        tg_integration_title: 'Telegram Integration: Referee Group & Club Channel',
        tg_integration_sub: 'Configure notification settings for Referee/Marshal Group and Club Channel.',
        tg_group_title: '1. Telegram Group (Referee/Marshal Calls)',
        tg_group_sub: '💡 Add bot to referee group. Chat ID usually starts with -100...',
        tg_channel_title: '2. Telegram Channel (Announcements & Results)',
        tg_channel_sub: '💡 Set bot as Channel Administrator with Post Messages permission.',
        placeholder_tg_channel_id: '@pestovo_golf or -1001987654321',
        vk_integration_title: 'VKontakte Integration (VK API)',
        vk_integration_sub: 'Referee/marshal call notifications will be sent instantly to your VK chat or DM.',
        vk_token_lbl: 'VK Community Access Token',
        placeholder_vk_peer_id: '2000000001 (chat) or 123456789 (user)',
        placeholder_bc_title: '🏆 Pestovo Championship 2024',
        placeholder_bc_body: 'Tournament registration is open! Start on Saturday at 10:00.',
        share_card: 'Share Scorecard (PNG)',
        download_png: 'Download Image (PNG)',
        share_native: 'Share to Apps',

        page_title_live: 'Start Round',
        page_sub_live: 'Solo or group round — switch tabs',
        round_setup: 'Round Settings',
        group_setup_title: 'Group Setup',
        solo_round: 'Solo Round', group_round: 'Group Round',
        solo_desc: 'Play solo. Enter your own score for each hole.',
        group_desc: '2 to 4 players. Dual entry (your score + partner score).',
        mode_solo_title: 'Solo Round',
        mode_solo_desc: 'Play solo. Enter your own score for each hole.',
        mode_group_title: 'Group Round',
        mode_group_desc: '2 to 4 players. Dual entry (your score + partner score).',
        mode_start: 'Start',
        tournament_opt: 'Tournament (optional)',
        no_tournament: '— No Tournament —',
        start_time: 'Start Time', start_hole: 'Start Hole', holes_count: 'Number of Holes',
        tee_select: 'Tee', format_select: 'Format',
        player_count: 'Number of Players',
        player_count_1: '1 Player', player_count_2: '2 Players', player_count_3: '3 Players', player_count_4: '4 Players',
        player_data: 'Player Details',
        select_registered: 'Select from registered users',
        guest_manual: '— Guest / enter manually —',
        first_name: 'First Name', last_name: 'Last Name', middle_name: 'Middle Name (optional)', gender_label: 'Gender',
        placeholder_first_name: 'John', placeholder_last_name: 'Doe', placeholder_middle_name: 'Jr.',
        placeholder_tn_name: 'Pestovo Championship',
        placeholder_hcp_calc: '+2.4 or 12.4',
        men: 'Male', women: 'Female',
        exact_hcp: 'Exact Handicap', field_hcp: 'Course Handicap',
        field_auto: 'Course HCP (auto)',
        start_round_btn: 'Start Round', back_btn: 'Back',
        timings_title: 'Hole Timings',
        pace_of_play: 'Pace of Play',
        pace_current_hole: 'Current hole',
        pace_completed: 'Completed',
        pace_delay: 'Total delay',
        pace_buffer: 'Buffer',
        pace_on_time: 'On pace',
        pace_warning: 'Slightly behind',
        pace_late: 'Behind pace',
        pace_severe: 'Severely behind',
        pace_pending: 'Timing appears after holes are saved',
        pace_deadline: 'Planned deadline',
        pace_hole_norm: 'Target',
        pace_in_progress: 'in progress',
        time_and_hole: 'Time and Hole',
        game_format: 'Game Format',

        my_score: 'My Score',
        marker_for: 'Marker for',
        save_hole: 'Save Hole', finish_round: 'Finish Round',
        next_hole_btn: 'To Next Hole →',
        show_stableford_points: 'Show Stableford points',
        show_stableford_points_hint: 'Handicap-adjusted points will appear next to the entered score. This setting is saved only for you.',
        stableford_default: 'Default Stableford display',
        stableford_default_hint: 'Show Stableford points next to the score for every player who has not selected a personal preference.',
        save_stableford_default: 'Save Stableford setting',
        confirm_final_hole: 'Finalize Hole 18',
        waiting_for_marker: '⏳ Your score is in. Waiting for the marker to confirm',
        hole_finalized_both: '✅ Score confirmed and finalized by both sides!',
        mismatch_error: '⚠️ Score mismatch with marker! Please correct before proceeding.',
        call_referee: 'Call Referee', call_marshal: 'Call Marshal',
        call_sent: 'Call sent',
        call_accepted: 'accepted the call',
        call_on_way: 'is on the way',
        call_retry_in: 'Call again in',
        call_cooldown: 'Another call will be available in',
        read_only_mode: 'View mode. Score entry is available to active players only.',
        view_only_group_desc: 'View mode. Score entry is available to active players only.',
        round_score: 'Round Score', hole_scorecard: 'Hole Scorecard',
        group_summary: 'Group Summary',
        connect_players: 'Connect Players',
        connect_players_title: 'Connect Group Players',
        connect_players_desc: 'Let other players scan their QR code to open their scorecard on their phones.',
        scan_to_play: 'Scan to play for this player',
        round_progress: 'Round Progress',
        finished_f: 'Finished (F)',

        res_hio: 'Hole-in-One!', res_albatross: 'Albatross', res_eagle: 'Eagle',
        res_birdie: 'Birdie', res_par: 'Par', res_bogey: 'Bogey', res_double: 'Double',

        weather_clear: 'Clear', weather_cloudy: 'Partly Cloudy', weather_fog: 'Fog',
        weather_rain: 'Rain', weather_snow: 'Snow', weather_thunder: 'Storm',
        wind_label: 'Wind',

        status_label: 'Status', status_all: 'All', status_active: 'Live', status_completed: 'Completed',
        all_players: 'All Players',
        type_registered: 'Registered Only',
        type_guests: 'Guests Only',
        sort_rounds: 'By Rounds', sort_gross: 'By Best Gross', sort_name: 'By Name',
        player_type: 'Player Type',
        sort_by: 'Sort By',
        role_admin: 'Chief Administrator',
        role_referee: 'Referee',
        role_marshal: 'Marshal',
        role_player: 'Player',
        export_csv_btn: 'Export All Rounds to CSV',
        download_backup_btn: 'Download Database Backup (JSON)',
        generate_flights_btn: 'Generate Tournament Flights',
        register_tournament_btn: 'Register for Tournament',
        registered_badge: 'Registered ✅',
        cancel_registration: 'Cancel Registration',
        participants_list: 'Registered Roster',
        registered_count: 'Registered Players',
        msg_tournament_registered: '🎉 Successfully registered for tournament!',
        msg_registration_cancelled: 'Registration cancelled',
        confirm_registration: 'Confirm Tournament Registration',
        tools_title: 'Tools & Features',
        gps_rangefinder: 'GPS Rangefinder',
        shot_tracking: 'Advanced Shot Tracking (FIR/GIR/Putts)',
        tv_mode: 'TV Broadcast Mode',
        h2h_duel: 'Head-to-Head Duel 1v1',
        enabled_lbl: 'Enabled ✅',
        disabled_lbl: 'Disabled ❌',
        send_broadcast_title: 'Send Club Push Announcement',
        send_broadcast_sub: 'Message will be sent to smartphones of all club players.',
        broadcast_title_lbl: 'Announcement Title',
        broadcast_body_lbl: 'Message Text',
        broadcast_link_lbl: 'Link (optional)',
        send_broadcast_btn: 'Send Broadcast to All Players',
        broadcast_history_title: 'Sent Announcements History',
        edit_profile: 'Edit Profile',
        save_profile: 'Save Profile',
        cancel_btn: 'Cancel',
        expand_scorecard: 'Expand Scorecard',
        collapse_scorecard: 'Collapse Scorecard',
        expand_round: 'Expand round',
        collapse_round: 'Collapse round',
        expand_all_rounds: 'Expand all',
        collapse_all_rounds: 'Collapse all',
        live_rounds_hint: 'You can see who is on the course now. Tap a row to expand details',
        field_map_title: 'Hole map & starts',
        my_round_tag: 'My round',
        current_round_tag: 'Current',
        leader_lbl: 'Leader',
        sc_tab_front: 'Front 9',
        sc_tab_back: 'Back 9',
        sc_tab_all: 'All 18',
        sc_topar_lbl: 'To-par by hole',
        to_current_hole: 'To current hole',
        no_current_hole: 'Current hole is not set yet',
        avatar_label: 'Profile Avatar',
        upload_photo: 'Upload Photo',
        choose_preset: 'Or choose icon preset',
        phone_label: 'Phone Number',
        default_tee: 'Default Preferred Tee',
        msg_profile_saved: '✅ Profile updated!',
        search_label: 'Search Player',
        search_placeholder: 'Search by name...',
        page_title_handicaps: 'Course Handicaps',
        page_sub_handicaps: 'Pestovo · Par 72',
        admin_login_title: 'Admin Panel Login',
        remember_me: 'Remember me',
        forgot_password: 'Forgot password?',
        admin_logout: 'Log out Admin',
        tournament_date_label: 'Date',
        tournament_name_label: 'Name',
        all_genders: 'All', men_plural: 'Male', women_plural: 'Female',
        quick_calc: 'Quick Calculator',
        full_table: 'View Full Table',
        full_table_title: 'View Full Table',
        full_table_sub: 'Select gender and tee — table will appear below',
        tbl_gender: 'Player Gender',
        tbl_select_gender: '— Gender —',
        tbl_select_tee: '— Tee —',
        select_gender_first: '— Gender First —',
        from_col: 'Handicap From', to_col: 'Handicap To',
        round_history: 'Round History',

        // Player interface modes
        large_ui_mode: 'Large text and buttons',
        strong_vibration_mode: 'Stronger vibration',
        high_contrast_mode: 'High-visibility status colors',
        battery_saver_mode: 'Battery saver',
        player_modes_title: 'My preferences',
        my_preferences_title: 'My preferences',
        mode_on: 'On',
        mode_off: 'Off',

        // Solo & Guest
        solo_sub: 'Pestovo Golf Club',
        current_score: 'Current Score',
        view_mode_notice: 'View mode.',

        // Admin & Auth
        admin_login: 'Admin Panel Login',
        admin_panel: 'Admin Panel',
        admin_desc: 'Log in with master password or authenticate with an admin account.',
        username: 'Username', password: 'Password',
        login_btn: 'Log In', register_btn: 'Register', create_account: 'Create Account',
        continue_guest: 'Continue as Guest',
        tab_rounds: 'Rounds', tab_alerts: 'Alerts 🚨', tab_groups: 'Groups now ⏱️', tab_tournaments: 'Tournaments',
        tab_players: 'Players & Roles', tab_data: 'Data',
        tab_importexport: 'Import/Export 📊', tab_rusgolf: 'RUSGOLF 🇷🇺',
        imp_exp_title: 'Player Import & Export (Excel)',
        imp_exp_sub: 'Export the player list to an Excel table and import players back: first name, last name and exact handicap.',
        rg_title: 'Handicap Lookup — RGA Database',
        rg_sub: 'Look up a player\'s exact Handicap Index (HI) in the official Russian Golf Association database (hcp.rusgolf.ru) and add players to your site.',
        all_tournaments: 'All Tournaments',
        create_tournament: 'Create Tournament',
        tournament_name: 'Name', tournament_date: 'Date',
        available_formats: 'Available Formats', available_tees: 'Available Tees',
        create_btn: 'Create',
        admin_only_tournaments: 'Tournaments are created by administrators only.',
        admin_panel_link: 'Admin Panel',
        referee_marshal_calls: 'Referee & Marshal Calls',
        admin_groups_title: 'Groups currently playing',
        admin_groups_sub: 'Pace monitoring for active group rounds',
        admin_no_groups: 'There are no active group rounds',
        admin_group_players: 'Players',
        admin_start_time: 'Start time',
        admin_start_hole: 'Start hole',
        admin_current_hole: 'Current hole',
        admin_hole_timings: 'Hole-by-hole timing',
        admin_total_delay: 'Total delay',
        enable_push_notifications: 'Enable Push Notifications',
        manage_players_roles: 'Manage Players & Roles',
        manage_players_sub: 'Assign Administrator rights to other players. Administrators get full access to this panel.',
        data_management: 'Data Management',
        data_danger_sub: 'Caution — actions are irreversible.',
        page_visibility_title: 'Manage Page & Feature Visibility',
        page_visibility_sub: 'Uncheck any page or feature to completely hide it from the navigation menu for players.',
        save_visibility_btn: 'Save Settings',
        tab_broadcasts: 'Announcements 📢',
        delete_all_rounds: 'Delete All Rounds',
        delete_all_data: 'Delete All Players & Rounds',
        delete_all_data_sub: 'Permanently removes every player and every round. Data disappears from all lists, stats and autocomplete and will not reappear.',
        full_name: 'Full Name',
        repeat_password: 'Repeat Password',

        // Scorer & Marker
        scorer_title: 'Score Entry',
        marker_title: '👁️ Marker',
        confirm_score_sub: 'Score Confirmation',
        marker_notice_title: 'You are a Marker',
        marker_notice_desc: 'Enter observed score. Confirmed only when scores match.',
        confirm_btn: 'Confirm',

        // Stats
        page_title_stats: 'Club Statistics',
        page_sub_stats: 'Analytics across all rounds',
        total_stats: 'General Statistics',
        top_players: 'Top Players',
        club_records: 'Club Records',
        hole_difficulty: 'Hole Difficulty',

        // Offline & Error
        offline_title: 'No Connection',
        offline_desc: 'Check your internet connection. Your scores are saved locally.',
        refresh_btn: 'Refresh', error_title: 'Error', qr_invalid: 'QR code is invalid.',

        // Toast Messages
        msg_start_time_req: 'Specify start time',
        msg_name_req: 'Enter player name',
        msg_exact_hcp_req: 'Specify exact handicap',
        msg_round_started: '🏌️ Round Started!',
        msg_saved_hole: '✅ Saved for Hole ',
        msg_edit_disabled: 'Editing disabled',
        msg_score_min: 'Score must be ≥ 1',
        msg_finish_confirm: 'Finish round?',
        msg_round_finished: '🏁 Round Completed!',

        player: 'Player', players_label: 'Players', guest: 'GUEST', start: 'Start', date: 'Date', format: 'Format',
        round_leader: 'Round Leader', no_completed: 'No completed rounds yet',

        unsaved_score_hint: 'Score is not saved yet — press the “Save” button',
        start_hint_title: 'Which hole is best to start from?',
        field_hcp_short: 'Course HCP',
        exact_hcp_short: 'Exact HCP',
        total_players_on_course: 'Total players on course',
        total_players_label: 'Total players',
        free_holes_label: 'Free holes',
        busy_holes_label: 'Busy holes',
        tee_label: 'Tee'
    }
};

// Год копирайта всегда актуален
(function(){ var y = new Date().getFullYear(); if (I18N.ru) I18N.ru.footer_club = '© ' + y + ' Гольф-клуб Пестово'; if (I18N.en) I18N.en.footer_club = '© ' + y + ' Pestovo Golf Club'; })();

function t(key) {
    if (I18N[currentLang] && I18N[currentLang][key] !== undefined) {
        return I18N[currentLang][key];
    }
    if (I18N['ru'] && I18N['ru'][key] !== undefined) {
        return I18N['ru'][key];
    }
    return key;
}

function toggleLang() {
    currentLang = currentLang === 'ru' ? 'en' : 'ru';
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('pestovo_lang', currentLang);
    }
    try { document.documentElement.setAttribute('lang', currentLang); } catch(e) {}
    applyTranslations();
    updateLangButtons();
    if (typeof applyPlayerModes === 'function') applyPlayerModes();
    if (typeof refreshOfficialCallBindings === 'function') refreshOfficialCallBindings();
    if (typeof renderAdmGroups === 'function') renderAdmGroups();
    if (typeof buildMobileDrawer === 'function') {
        var drawerRoot = document.getElementById('mobile-drawer-root');
        var wasOpen = drawerRoot && drawerRoot.classList.contains('open');
        buildMobileDrawer();
        if (wasOpen && drawerRoot) drawerRoot.classList.add('open');
    }
    if (typeof toast === 'function') {
        toast(currentLang === 'en' ? '🇬🇧 English language enabled' : '🇷🇺 Выбран русский язык', 'info');
    }
    if (typeof loadLiveRounds === 'function') loadLiveRounds();
    if (typeof loadRecentResults === 'function') loadRecentResults();
    if (typeof loadLB === 'function') loadLB();
    if (typeof loadPlayers === 'function') loadPlayers();
    if (typeof loadPestovoWeather === 'function') loadPestovoWeather('nav-weather-container');
    if (typeof showGroupSetup === 'function' && document.getElementById('group-setup') && !document.getElementById('group-setup').classList.contains('hidden')) {
        showGroupSetup();
    }
    if (typeof initRoundView === 'function' && typeof curRid !== 'undefined' && curRid) {
        initRoundView();
    }
    if (typeof initSoloView === 'function') {
        initSoloView();
    }
    if (typeof updateHcpTable === 'function') updateHcpTable();
    if (typeof loadClubStats === 'function') loadClubStats();
    if (typeof loadMyActiveRounds === 'function') {
        loadMyActiveRounds('my-active-rounds-container');
    }
}

function updateLangButtons() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.lang-btn').forEach(function(btn) {
        btn.innerHTML = currentLang === 'en' ? '🇬🇧 EN' : '🇷🇺 RU';
    });
}

function applyTranslations() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
        var key = el.getAttribute('data-i18n');
        if (key && I18N[currentLang] && I18N[currentLang][key] !== undefined) {
            el.innerHTML = I18N[currentLang][key];
        }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
        var key = el.getAttribute('data-i18n-placeholder');
        if (key && I18N[currentLang] && I18N[currentLang][key] !== undefined) {
            el.setAttribute('placeholder', I18N[currentLang][key]);
        }
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
        var key = el.getAttribute('data-i18n-title');
        if (key && I18N[currentLang] && I18N[currentLang][key] !== undefined) {
            el.setAttribute('title', I18N[currentLang][key]);
        }
    });
}

/* Применяем переводы и тему мгновенно (скрипт внизу <body> — DOM уже распаршен),
   чтобы не было «вспышки» исходного текста/темы при загрузке */
try { if (document.documentElement) document.documentElement.setAttribute('lang', currentLang); } catch(e) {}
applyTranslations();
document.addEventListener('DOMContentLoaded', function() {
    applyTranslations();
    updateFooterYear();
});

// Динамический год копирайта (никогда не устареет)
function updateFooterYear() {
    if (typeof document === 'undefined') return;
    var year = new Date().getFullYear();
    document.querySelectorAll('.footer-bottom p').forEach(function(p) {
        p.innerHTML = p.innerHTML.replace(/(©|&copy;)\s*\d{4}/g, '$1 ' + year).replace(/&copy;\s*\d{4}/g, '&copy; ' + year);
    });
}
updateFooterYear();

// ==========================================
// БЛОК «МОИ АКТИВНЫЕ РАУНДЫ»
// ==========================================
function loadMyActiveRounds(targetId) {
    var el = document.getElementById(targetId);
    if (!el || typeof db === 'undefined') return;

    bindRealtimeValue('my-active-rounds:' + targetId, db.ref('rounds'), function(snap) {
        var data = snap.val() || {};
        var myActive = [];

        Object.entries(data).forEach(function(e) {
            var id = e[0], r = e[1];
            if (!r || r.status !== 'active') return;

            var localSoloKey = localStorage.getItem('pestovo_solo_key_' + id);
            var localGroupKey = localStorage.getItem('pestovo_group_key_' + id);
            var localActingAs = localStorage.getItem('pestovo_acting_as_' + id);

            var isCreatedByMe = false;

            if (currentUser && r.createdBy === currentUser.uid) {
                isCreatedByMe = true;
            } else if (localSoloKey && r.accessKey === localSoloKey) {
                isCreatedByMe = true;
            } else if (localGroupKey && r.accessKey === localGroupKey) {
                isCreatedByMe = true;
            } else if (currentUser && r.players && r.players[currentUser.uid]) {
                isCreatedByMe = true;
            } else if (localActingAs && r.players && r.players[localActingAs]) {
                isCreatedByMe = true;
            }

            if (isCreatedByMe) {
                myActive.push({ id: id, round: r });
            }
        });

        if (myActive.length === 0) {
            el.innerHTML = '';
            el.classList.add('hidden');
            return;
        }

        myActive.sort(function(a, b) { return (b.round.createdAt || 0) - (a.round.createdAt || 0); });

        var html = '<div class="card" style="border:2px solid var(--gold);background:linear-gradient(135deg, rgba(201,168,76,0.12), var(--card));margin-bottom:24px;">';
        html += '<h2 style="color:var(--gold);margin-bottom:12px;"><i class="fas fa-play-circle"></i> ' + t('sec_my_active') + '</h2>';
        html += '<p style="font-size:13px;color:var(--muted);margin-bottom:16px;">' + (currentLang === 'en' ? 'You have an active round in progress:' : 'У вас есть начатый раунд. Нажмите, чтобы продолжить игру:') + '</p>';

        myActive.forEach(function(item) {
            var id = item.id, r = item.round;
            var link = 'setup-round.html?round=' + id;
            var modeIcon = r.mode === 'solo' ? '<i class="fas fa-user"></i> ' + t('solo_round') : '<i class="fas fa-users"></i> ' + t('group_round');
            var teePill = fmtRoundTeePills(r);
            var resume = getRoundResumeState(id, r);
            var pace = resume.metrics;
            var paceState = paceStatus(pace.overallDelay);
            var progressPercent = resume.holeCount ? Math.min(100, Math.round((resume.holesPlayed / resume.holeCount) * 100)) : 0;
            var playersCount = Object.keys(r.players || {}).length;
            var progressLabel = currentLang === 'en' ? 'Progress' : 'Прогресс';
            var currentHoleLabel = currentLang === 'en' ? 'Current hole' : 'Текущая лунка';
            var paceLabel = currentLang === 'en' ? 'Pace' : 'Темп';

            html += '<div class="list-item resume-round-card" style="padding:16px;background:var(--input);border:1px solid var(--border);margin-bottom:10px;flex-wrap:wrap;gap:12px;">';
            html += '<div style="flex:1;min-width:200px;">';
            html += '<div style="font-weight:800;font-size:16px;color:var(--white);"><span class="live-dot" style="width:7px;height:7px;margin-right:6px;"></span> ' + t('brand_name') + ' · ' + modeIcon + '</div>';
            html += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' +
                    t('start') + ': ' + fmtTime(r.startTime) + ' · ' + t('hole') + ': №' + (r.startHole || 1) + ' · ' + t('tee_select') + ': ' + teePill + ' · ' + t('player') + ': ' + playersCount + '</div>';
            html += '<div class="resume-round-meta">' +
                    '<span><b>' + currentHoleLabel + ':</b> №' + resume.currentHole + '</span>' +
                    '<span><b>' + progressLabel + ':</b> ' + resume.holesPlayed + '/' + resume.holeCount + '</span>' +
                    '<span style="color:' + paceState.color + '"><b>' + paceLabel + ':</b> ' + formatPaceDelta(pace.overallDelay) + '</span>' +
                    '</div>';
            html += '<div class="resume-progress-track" aria-label="' + progressLabel + '">' +
                    '<span style="width:' + progressPercent + '%;background:' + paceState.color + ';"></span></div>';
            html += '</div>';
            html += '<a href="' + link + '" class="btn btn-g resume-round-button" style="align-self:center;"><i class="fas fa-gamepad"></i> ' + t('continue_round') + '</a>';
            html += '</div>';
        });

        html += '</div>';
        el.innerHTML = html;
        el.classList.remove('hidden');
    });
}

// ==========================================
// ПОГОДНЫЙ ВИДЖЕТ И ВЕКТОР ВЕТРА В ШАПКЕ
// ==========================================
function getWindCardinal(deg) {
    var directions = currentLang === 'en' 
        ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
        : ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
    var idx = Math.round((deg % 360) / 45) % 8;
    return directions[idx];
}

function getWeatherCodeInfo(code) {
    if (code === 0) return { icon: '☀️', text: t('weather_clear') };
    if (code >= 1 && code <= 3) return { icon: '🌤️', text: t('weather_cloudy') };
    if (code === 45 || code === 48) return { icon: '🌫️', text: t('weather_fog') };
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { icon: '🌧️', text: t('weather_rain') };
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return { icon: '❄️', text: t('weather_snow') };
    if (code >= 95) return { icon: '⛈️', text: t('weather_thunder') };
    return { icon: '🌤️', text: 'Pestovo' };
}

function loadPestovoWeather(targetId) {
    targetId = targetId || 'nav-weather-container';
    var el = document.getElementById(targetId);
    if (!el) return;

    var url = 'https://api.open-meteo.com/v1/forecast?latitude=56.09&longitude=37.62&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code&wind_speed_unit=ms';

    if (typeof fetch !== 'undefined') {
        fetch(url).then(function(res) {
            return res.json();
        }).then(function(data) {
            if (!data || !data.current) throw new Error('No data');
            var curr = data.current;
            var temp = Math.round(curr.temperature_2m);
            var tempStr = (temp > 0 ? '+' : '') + temp + '°C';
            var windSpeed = Math.round(curr.wind_speed_10m || 0);
            var windDeg = Math.round(curr.wind_direction_10m || 0);
            var windDir = getWindCardinal(windDeg);
            var weather = getWeatherCodeInfo(curr.weather_code);

            var html = '<div class="weather-widget">' +
                '<div class="weather-item"><span class="weather-icon">' + weather.icon + '</span><b>' + tempStr + '</b> <span class="weather-desc" style="color:var(--muted);font-size:10px;">(' + weather.text + ')</span></div>' +
                '<div class="weather-divider"></div>' +
                '<div class="weather-item"><i class="fas fa-location-arrow wind-arrow" style="transform:rotate(' + (windDeg - 45) + 'deg);"></i> <b>' + windSpeed + ' m/s ' + windDir + '</b></div>' +
                '</div>';

            el.innerHTML = html;
            el.classList.remove('hidden');
        }).catch(function() {
            var html = '<div class="weather-widget">' +
                '<div class="weather-item"><span class="weather-icon">⛳</span> <b>Pestovo</b></div>' +
                '<div class="weather-divider"></div>' +
                '<div class="weather-item"><i class="fas fa-wind" style="color:var(--gold);"></i> <b>3 m/s SW</b></div>' +
                '</div>';
            el.innerHTML = html;
            el.classList.remove('hidden');
        });
    } else {
        var html = '<div class="weather-widget">' +
            '<div class="weather-item"><span class="weather-icon">⛳</span> <b>Pestovo</b></div>' +
            '<div class="weather-divider"></div>' +
            '<div class="weather-item"><i class="fas fa-wind" style="color:var(--gold);"></i> <b>3 m/s SW</b></div>' +
            '</div>';
        el.innerHTML = html;
        el.classList.remove('hidden');
    }
}

// ==========================================
// ДНЕВНОЙ РЕЖИМ «ЯРКОЕ СОЛНЦЕ» (SUN MODE)
// ==========================================
function initThemeMode() {
    var savedTheme = localStorage.getItem('pestovo_theme');
    if (savedTheme === 'sun' && document.body) {
        document.body.classList.add('sun-mode');
    }
}

function toggleSunMode() {
    if (!document.body) return;
    var isSun = document.body.classList.toggle('sun-mode');
    localStorage.setItem('pestovo_theme', isSun ? 'sun' : 'dark');
    updateSunModeButtons();
    if (typeof toast === 'function') {
        toast(isSun ? (currentLang === 'en' ? '☀️ Sun mode enabled' : '☀️ Включён режим «Яркое солнце»') : (currentLang === 'en' ? '🌙 Dark mode enabled' : '🌙 Включена тёмная тема'), 'info');
    }
}

function updateSunModeButtons() {
    var isSun = document.body && document.body.classList && document.body.classList.contains('sun-mode');
    document.querySelectorAll('.sun-mode-btn').forEach(function(btn) {
        btn.innerHTML = isSun ? '<i class="fas fa-sun"></i> ' + (currentLang === 'en' ? 'Sun ✅' : 'Солнце ✅') : '<i class="far fa-sun"></i> ' + (currentLang === 'en' ? 'Sun' : 'Солнце');
    });
}

// ==========================================
// РЕЖИМЫ ИНТЕРФЕЙСА ИГРОКА
// ==========================================
var PLAYER_MODE_STORAGE_KEYS = [
    'pestovo_large_ui',
    'pestovo_strong_vibration',
    'pestovo_high_contrast',
    'pestovo_battery_saver'
];

function isBatterySaverEnabled() {
    return isPlayerModeEnabled('pestovo_battery_saver');
}

function applyPlayerModes() {
    if (!document.body) return;
    document.body.classList.toggle('large-ui', isPlayerModeEnabled('pestovo_large_ui'));
    document.body.classList.toggle('high-contrast-status', isPlayerModeEnabled('pestovo_high_contrast'));
    document.body.classList.toggle('battery-saver', isBatterySaverEnabled());

    // Режим экономии батареи не держит экран постоянно включённым.
    if (isBatterySaverEnabled() && typeof wakeLockSentinel !== 'undefined' && wakeLockSentinel) {
        try { wakeLockSentinel.release(); } catch(e) {}
        wakeLockSentinel = null;
    } else if (!isBatterySaverEnabled()) {
        acquireWakeLockIfAllowed();
    }
}

function togglePlayerMode(key) {
    if (PLAYER_MODE_STORAGE_KEYS.indexOf(key) === -1) return;
    var enabled = !isPlayerModeEnabled(key);
    try { localStorage.setItem(key, enabled ? '1' : '0'); } catch(e) {}
    applyPlayerModes();
    if (typeof soloRound !== 'undefined' && soloRound && typeof startSoloPaceTicker === 'function') startSoloPaceTicker();
    if (typeof curRoundData !== 'undefined' && curRoundData && typeof startGroupPaceTicker === 'function') startGroupPaceTicker();
    if (typeof buildMobileDrawer === 'function') {
        var drawer = document.getElementById('mobile-drawer-root');
        var wasOpen = drawer && drawer.classList.contains('open');
        buildMobileDrawer();
        if (wasOpen && drawer) drawer.classList.add('open');
    }
    var labels = {
        pestovo_large_ui: t('large_ui_mode'),
        pestovo_strong_vibration: t('strong_vibration_mode'),
        pestovo_high_contrast: t('high_contrast_mode'),
        pestovo_battery_saver: t('battery_saver_mode')
    };
    toast((enabled ? '✅ ' : '❌ ') + labels[key] + (enabled ? (currentLang === 'en' ? ' enabled' : ' включён') : (currentLang === 'en' ? ' disabled' : ' выключен')), 'info');
}

function playerModeRow(key, labelKey, icon) {
    var enabled = isPlayerModeEnabled(key);
    return '<div class="player-mode-row">' +
        '<span><i class="fas ' + icon + '"></i> ' + t(labelKey) + '</span>' +
        '<button type="button" class="player-mode-button ' + (enabled ? 'active' : '') + '" aria-pressed="' + (enabled ? 'true' : 'false') + '" onclick="togglePlayerMode(\'' + key + '\')">' + (enabled ? t('mode_on') : t('mode_off')) + '</button>' +
        '</div>';
}

initThemeMode(); // применяем сразу, до первой отрисовки — без вспышки тёмной темы
applyPlayerModes();
document.addEventListener('DOMContentLoaded', function() {
    initThemeMode();
    applyPlayerModes();
});

// ==========================================
// ФИРМЕННЫЕ БЕЙДЖИ РЕЗУЛЬТАТОВ И ТИ
// ==========================================
function getRoundTeeCodes(r) {
    if (!r) return ['wh'];
    if (typeof r === 'string') return [r];
    if (Array.isArray(r)) {
        var arr = [];
        r.forEach(function(code) {
            if (code && arr.indexOf(code) === -1) arr.push(code);
        });
        return arr.length ? arr : ['wh'];
    }
    var teesFound = [];
    var players = r.players || {};
    var playerEntries = Object.entries(players).filter(function(pe) {
        return !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(pe[0], pe[1] && pe[1].name));
    });

    if (playerEntries.length > 0) {
        playerEntries.forEach(function(pe) {
            var p = pe[1];
            var code = (p && p.tee) || r.tee || 'wh';
            if (code && teesFound.indexOf(code) === -1) {
                teesFound.push(code);
            }
        });
    }

    if (!teesFound.length) {
        teesFound.push(r.tee || 'wh');
    }

    teesFound.sort(function(a, b) {
        var idxA = TEE_ORDER.indexOf(a);
        var idxB = TEE_ORDER.indexOf(b);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
    });

    return teesFound;
}

function fmtTeePill(teeCode) {
    if (!teeCode) teeCode = 'wh';
    if (typeof teeCode === 'object' && teeCode !== null) {
        return fmtRoundTeePills(teeCode);
    }
    var nameKey = 'tee_' + teeCode;
    var name = t(nameKey);
    if (!name || name === nameKey) name = TEES[teeCode] || 'White';
    return '<span class="tee-pill tee-' + teeCode + '">' + name + '</span>';
}

function fmtRoundTeePills(r) {
    var codes = getRoundTeeCodes(r);
    var pills = codes.map(function(c) {
        var nameKey = 'tee_' + c;
        var name = t(nameKey);
        if (!name || name === nameKey) name = TEES[c] || 'White';
        return '<span class="tee-pill tee-' + c + '">' + name + '</span>';
    });
    return '<span class="round-tee-pills">' + pills.join('') + '</span>';
}

function fmtRoundTeesText(r) {
    var codes = getRoundTeeCodes(r);
    return codes.map(function(c) {
        var nameKey = 'tee_' + c;
        var name = t(nameKey);
        if (!name || name === nameKey) name = TEES[c] || 'White';
        return name;
    }).join(', ');
}

function fmtScoreBadge(s, p) {
    if (!s || s < 1 || !p) return '—';
    var diff = s - p;
    var name = holeResName(s, p);
    var cls = 'badge-par';
    if (diff <= -2 || s === 1) cls = 'badge-eag';
    else if (diff === -1) cls = 'badge-bir';
    else if (diff === 0) cls = 'badge-par';
    else if (diff === 1) cls = 'badge-bog';
    else cls = 'badge-dbl';

    return '<span class="' + cls + '">' + name + ' (' + s + ')</span>';
}

// ==========================================
// ПРОГРЕСС-БАР РАУНДА
// ==========================================
function renderHoleProgressBar(targetId, holesPlayed) {
    var el = document.getElementById(targetId);
    if (!el) return;
    el.innerHTML = '';
}

// ==========================================
// КОНФЕТТИ ПРИ ВВОДЕ СЧЁТА — ЭФФЕКТ ОТКЛЮЧЁН
// (функция оставлена как no-op для совместимости со старыми вызовами)
// ==========================================
function triggerVictoryConfetti() {
    return; // конфетти при вводе счёта больше не показываются
}

// ==========================================
// FLIP / SPRING ANIMATION FOR SCORES
// ==========================================
function animateScoreElement(elId) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.classList.remove('score-pulse');
    void el.offsetWidth;
    el.classList.add('score-pulse');
}

function initNav(){
    buildMobileDrawer();

    var tg = document.getElementById('nav-toggle');
    if (tg) {
        tg.onclick = function(e) {
            e.stopPropagation();
            toggleMobileDrawer();
        };
    }

    window.addEventListener('scroll', function() {
        var n = document.getElementById('main-nav');
        if (n) {
            if (window.scrollY > 50) n.classList.add('nav-scrolled');
            else n.classList.remove('nav-scrolled');
        }
    });

    loadPestovoWeather('nav-weather-container');
}

function buildMobileDrawer() {
    if (typeof document === 'undefined') return;
    var container = document.getElementById('mobile-drawer-root');
    if (!container) {
        container = document.createElement('div');
        container.id = 'mobile-drawer-root';
        container.className = 'mobile-drawer-container';
        if (document.body) document.body.appendChild(container);
    }

    var isSun = document.body && document.body.classList && document.body.classList.contains('sun-mode');
    var isEn = currentLang === 'en';

    var sunTxt = isSun ? (isEn ? 'Sun ✅' : 'Солнце ✅') : (isEn ? 'Sun' : 'Солнце');
    var sunPrefix = isSun ? 'fas' : 'far';

    var authBtnMarkup = '';
    var isUserLoggedIn = (typeof currentUser !== 'undefined' && currentUser && typeof currentUserData !== 'undefined' && currentUserData);

    if (isUserLoggedIn) {
        var avatarMarkup = fmtUserAvatar(currentUserData, 32);
        authBtnMarkup = '<div style="display:flex;align-items:center;justify-content:space-between;background:var(--input);padding:10px 14px;border-radius:var(--rs);border:1px solid var(--border);cursor:pointer;" onclick="closeMobileDrawer();openPlayerProfileModal(\'' + currentUser.uid + '\')">' +
            '<div style="display:flex;align-items:center;gap:10px;">' + avatarMarkup + '<strong style="color:var(--gold);font-size:14px;">' + (currentUserData.name || '') + '</strong></div>' +
            '<button class="btn btn-og btn-sm" onclick="event.stopPropagation();doLogout()"><i class="fas fa-sign-out-alt"></i></button>' +
            '</div>';
    } else {
        authBtnMarkup = '<a href="auth.html" class="btn btn-g btn-block" onclick="closeMobileDrawer()"><i class="fas fa-sign-in-alt"></i> ' + t('nav_login') + '</a>';
    }

    var menuBodyMarkup = '<div class="mobile-drawer-group">' +
        '<div class="mobile-drawer-group-title">⛳ ' + (isEn ? 'Game & Rounds' : 'Игра и Раунды') + '</div>' +
        '<a href="index.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-home"></i> <span data-i18n="nav_home">' + t('nav_home') + '</span></a>' +
        '<a href="setup-round.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-gamepad"></i> <span data-i18n="nav_round">' + t('nav_round') + '</span></a>' +
        '<a href="leaderboard.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-trophy"></i> <span data-i18n="nav_leaderboard">' + t('nav_leaderboard') + '</span></a>' +
        '</div>' +

        '<div class="mobile-drawer-group">' +
        '<div class="mobile-drawer-group-title">📖 ' + (isEn ? 'Club & Features' : 'Клуб и Сервисы') + '</div>' +
        '<a href="guide.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-book-bookmark"></i> <span data-i18n="nav_guide">' + t('nav_guide') + '</span></a>' +
        '<a href="feed.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-rss"></i> <span data-i18n="nav_feed">' + t('nav_feed') + '</span></a>' +
        '<a href="predictor.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-calculator"></i> <span data-i18n="nav_predictor">' + t('nav_predictor') + '</span></a>' +
        '<a href="order-of-merit.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-crown"></i> <span data-i18n="nav_oom">' + t('nav_oom') + '</span></a>' +
        '</div>' +

        '<div class="mobile-drawer-group">' +
        '<div class="mobile-drawer-group-title">👥 ' + (isEn ? 'Community & Stats' : 'Сообщество и Инфо') + '</div>' +
        '<a href="players.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-users"></i> <span data-i18n="nav_players">' + t('nav_players') + '</span></a>' +
        '<a href="tournaments.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-list"></i> <span data-i18n="nav_tournaments">' + t('nav_tournaments') + '</span></a>' +
        '<a href="stats.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-chart-bar"></i> <span data-i18n="nav_stats">' + t('nav_stats') + '</span></a>' +
        '<a href="handicap.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-calculator"></i> <span data-i18n="nav_handicaps">' + t('nav_handicaps') + '</span></a>' +
        '</div>';

    // В самом конце бокового меню — отдельная вкладка «Мои настройки» с тогглами
    // режимов игрока. Видимость управляется админом (isMyPreferencesEnabled).
    if (typeof isMyPreferencesEnabled === 'function' ? isMyPreferencesEnabled() : true) {
        menuBodyMarkup += '<div class="mobile-drawer-group mobile-drawer-group-preferences" data-group="my-preferences">' +
            '<div class="mobile-drawer-group-title"><i class="fas fa-gear"></i> ' + t('my_preferences_title') + '</div>' +
            '<div class="my-preferences-inline" data-my-preferences-inline>' +
                playerModeRow('pestovo_large_ui', 'large_ui_mode', 'fa-text-height') +
                playerModeRow('pestovo_strong_vibration', 'strong_vibration_mode', 'fa-mobile-screen-button') +
                playerModeRow('pestovo_high_contrast', 'high_contrast_mode', 'fa-circle-half-stroke') +
                playerModeRow('pestovo_battery_saver', 'battery_saver_mode', 'fa-battery-quarter') +
            '</div>' +
        '</div>';
    }

    var html =
        '<div class="mobile-drawer-backdrop" onclick="closeMobileDrawer()"></div>' +
        '<div class="mobile-drawer-panel">' +
            '<div class="mobile-drawer-header">' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                    '<img src="img/logo.png" alt="Logo" class="nav-logo" onerror="this.style.display=\'none\'">' +
                    '<span class="nav-brand-text" data-i18n="brand_name">' + t('brand_name') + '</span>' +
                '</div>' +
                '<button class="mobile-drawer-close" onclick="closeMobileDrawer()">&times;</button>' +
            '</div>' +

            '<div class="mobile-drawer-body">' + menuBodyMarkup + '</div>' +

            '<div class="mobile-drawer-footer">' +
            '<div style="display:flex;gap:6px;margin-bottom:12px;">' +
                '<button class="sun-mode-btn" style="flex:1;justify-content:center;" onclick="toggleSunMode()"><i class="' + sunPrefix + ' fa-sun"></i> ' + sunTxt + '</button>' +
                    '<button class="lang-btn" style="flex:1;justify-content:center;" onclick="toggleLang()">' + (isEn ? '🇬🇧 EN' : '🇷🇺 RU') + '</button>' +
                '</div>' +
                '<div id="mobile-drawer-auth">' + authBtnMarkup + '</div>' +
            '</div>' +
        '</div>';

    container.innerHTML = html;

    var curPage = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname.split('/').pop() || 'index.html' : 'index.html';
    if (container.querySelectorAll) {
        container.querySelectorAll('.mobile-drawer-link').forEach(function(link) {
            if (link.getAttribute('href') === curPage) {
                link.classList.add('active');
            }
        });
    }

    if (typeof applyPageVisibilitySettings === 'function') {
        applyPageVisibilitySettings();
    }
}

/* Прячем нижнюю навигацию, когда открыта экранная клавиатура (фокус в поле ввода) */
document.addEventListener('focusin', function(e) {
    if (!e || !e.target) return;
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        document.body.classList.add('kb-open');
    }
});
document.addEventListener('focusout', function(e) {
    setTimeout(function() {
        var a = document.activeElement;
        var tag = a && a.tagName;
        if (!(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) {
            document.body.classList.remove('kb-open');
        }
    }, 120);
});

// ==========================================
// SCREEN WAKE LOCK — экран не гаснет во время раунда
// ==========================================
var wakeLockSentinel = null;
var wakeLockVisibilityListenerAttached = false;

function acquireWakeLockIfAllowed() {
    if (typeof document === 'undefined' || isBatterySaverEnabled() || !('wakeLock' in navigator)) return;
    var curPage = (window.location && window.location.pathname) ? (window.location.pathname.split('/').pop() || '') : '';
    var SCORING_PAGES = ['setup-round.html', 'scorer.html', 'marker.html'];
    if (SCORING_PAGES.indexOf(curPage) === -1 || wakeLockSentinel) return;
    navigator.wakeLock.request('screen').then(function(s) {
        wakeLockSentinel = s;
        s.addEventListener('release', function() { wakeLockSentinel = null; });
    }).catch(function() { /* тихо игнорируем — не критично */ });
}

function initWakeLock() {
    if (typeof document === 'undefined' || isBatterySaverEnabled()) return;
    if (!('wakeLock' in navigator)) return;
    acquireWakeLockIfAllowed();
    if (!wakeLockVisibilityListenerAttached) {
        wakeLockVisibilityListenerAttached = true;
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') acquireWakeLockIfAllowed();
        });
    }
}
initWakeLock();

function openMobileDrawer() {
    buildMobileDrawer();
    var container = document.getElementById('mobile-drawer-root');
    var tg = document.getElementById('nav-toggle');
    if (container) container.classList.add('open');
    if (tg) tg.classList.add('active');
    if (typeof document !== 'undefined' && document.body && document.body.style) document.body.style.overflow = 'hidden';
}

function closeMobileDrawer() {
    var container = document.getElementById('mobile-drawer-root');
    var tg = document.getElementById('nav-toggle');
    if (container) container.classList.remove('open');
    if (tg) tg.classList.remove('active');
    if (typeof document !== 'undefined' && document.body && document.body.style) document.body.style.overflow = '';
}

function toggleMobileDrawer() {
    var container = document.getElementById('mobile-drawer-root');
    if (container && container.classList.contains('open')) {
        closeMobileDrawer();
    } else {
        openMobileDrawer();
    }
}

function fmtUserAvatar(u, sizePx) {
    sizePx = sizePx || 40;
    if (u && u.avatar) {
        if (u.avatar.startsWith('data:') || u.avatar.startsWith('http') || u.avatar.startsWith('img/')) {
            return '<img src="' + u.avatar + '" alt="Avatar" class="user-avatar-img" style="width:' + sizePx + 'px;height:' + sizePx + 'px;">';
        }
        return '<div class="lb-avatar" style="width:' + sizePx + 'px;height:' + sizePx + 'px;font-size:' + Math.round(sizePx * 0.5) + 'px;">' + u.avatar + '</div>';
    }
    var initial = (u && u.name) ? u.name.charAt(0).toUpperCase() : '?';
    return '<div class="lb-avatar" style="width:' + sizePx + 'px;height:' + sizePx + 'px;font-size:' + Math.round(sizePx * 0.45) + 'px;">' + initial + '</div>';
}

function handleAvatarFileUpload(fileInputEl, callback) {
    if (!fileInputEl || !fileInputEl.files || !fileInputEl.files[0]) return;
    var file = fileInputEl.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
            var canvas = document.createElement('canvas');
            var maxDim = 160;
            var w = img.width;
            var h = img.height;
            if (w > h) {
                if (w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
            } else {
                if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
            }
            canvas.width = w;
            canvas.height = h;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            if (typeof callback === 'function') callback(dataUrl);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
function isToolsMenuEnabled() {
    // Администратор может включить/выключить отображение кнопки «Меню» (Инструменты и функции).
    // По умолчанию кнопка скрыта — вкл/выкл делается из админ-панели (вкладка «Данные»).
    try {
        return localStorage.getItem('pestovo_tools_menu_enabled') === '1';
    } catch(e) { return false; }
}

// Включение/выключение вкладки «Мои настройки» в боковом меню
// (тоггл в админ-панели, вкладка «Данные»). По умолчанию ВКЛ — это
// основной блок настроек игрока, который должен быть у всех.
function isMyPreferencesEnabled() {
    try {
        var v = localStorage.getItem('pestovo_my_preferences_enabled');
        // По умолчанию — включено. Если ключ явно установлен в '0' — выключено.
        return v === null || v === undefined || v === '1';
    } catch(e) { return true; }
}

function navAuth(u, d) {
    var e = document.getElementById('nav-auth');
    if (!e) return;
    var isSun = document.body && document.body.classList && document.body.classList.contains('sun-mode');

    var sunBtn = '<button class="sun-mode-btn" onclick="toggleSunMode()">' + (isSun ? '<i class="fas fa-sun"></i> ' + (currentLang === 'en' ? 'Sun ✅' : 'Солнце ✅') : '<i class="far fa-sun"></i> ' + (currentLang === 'en' ? 'Sun' : 'Солнце')) + '</button>';
    var langBtn = '<button class="lang-btn" onclick="toggleLang()">' + (currentLang === 'en' ? '🇬🇧 EN' : '🇷🇺 RU') + '</button>';
    var playerModesBtn = '<button class="player-modes-launcher" title="' + t('player_modes_title') + '" aria-label="' + t('player_modes_title') + '" onclick="event.stopPropagation();openMobileDrawer()"><i class="fas fa-sliders"></i></button>';
    // Кнопка «Меню» (Инструменты) показывается только если администратор явно включил это
    var toolsBtn = isToolsMenuEnabled()
        ? '<button class="lang-btn" onclick="openToolsMenu()"><i class="fas fa-toolbox"></i> ' + (currentLang === 'en' ? 'Tools' : 'Меню') + '</button>'
        : '';

    if (u && d) {
        var avatarMarkup = fmtUserAvatar(d, 30);
        e.innerHTML = '<div class="nav-user" style="cursor:pointer;" onclick="openPlayerProfileModal(\'' + u.uid + '\')">' +
            sunBtn + langBtn + playerModesBtn + toolsBtn + avatarMarkup +
            '<span class="nav-uname">' + (d.name || '') + '</span>' +
            '<button class="btn btn-og btn-sm" onclick="event.stopPropagation();doLogout()"><i class="fas fa-sign-out-alt"></i></button>' +
            '</div>';
    } else {
        e.innerHTML = '<div style="display:flex;align-items:center;gap:6px;">' + sunBtn + langBtn + playerModesBtn + toolsBtn + '<a href="auth.html" class="btn btn-g btn-sm" style="padding:5px 10px;font-size:11px;" data-i18n="nav_login">' + t('nav_login') + '</a></div>';
    }
}

function doLogout(){if(typeof auth!=='undefined'&&auth&&auth.signOut){auth.signOut().then(function(){window.location.reload();});}else{window.location.reload();}}
function holeOrder(sh){var o=[],h=parseInt(sh)||1;for(var i=0;i<18;i++){o.push(h);h=h>=18?1:h+1;}return o;}

// ==========================================
// ВЫБОР КОЛИЧЕСТВА ЛУНОК (holeRange)
// '1-9' | '10-18' | '1-18' (по умолчанию)
// ==========================================
function roundHoles(startHole, holeRange) {
    startHole = parseInt(startHole) || 1;
    if (holeRange === '1-9') return [1,2,3,4,5,6,7,8,9];
    if (holeRange === '10-18') return [10,11,12,13,14,15,16,17,18];
    return holeOrder(startHole); // 18 лунок, порядок со стартовой лунки (shotgun)
}
function roundHoleCount(holeRange) {
    return (holeRange === '1-9' || holeRange === '10-18') ? 9 : 18;
}
function getRoundOrder(rd) { return roundHoles((rd && rd.startHole) || 1, rd && rd.holeRange); }
function getRoundHoleCount(rd) { return roundHoleCount(rd && rd.holeRange); }

// Заполняет выпадающий список «Стартовая лунка» лунками выбранного диапазона:
// '1-9' → только 1-9, '10-18' → только 10-18, '1-18' (и другое) → все 18.
// Если текущее значение выпадающего списка уже входит в диапазон — сохраняем его.
function buildStartHoleOptions(holeEl, holeRange) {
    if (!holeEl) return;
    holeRange = holeRange || '1-18';
    var from = 1, to = 18;
    if (holeRange === '1-9') { from = 1; to = 9; }
    else if (holeRange === '10-18') { from = 10; to = 18; }
    var cur = parseInt(holeEl.value);
    if (!cur || cur < from || cur > to) {
        cur = (holeRange === '10-18') ? 10 : 1;
    }
    var html = '';
    for (var i = from; i <= to; i++) {
        html += '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>' + t('hole') + ' ' + i + ' (' + t('par') + ' ' + holePar(i) + ')</option>';
    }
    holeEl.innerHTML = html;
    holeEl.value = cur;
}

// Состояние подтверждения счёта игрока на лунке h — по фактическим данным, а не только по флагу verified:
//  'confirmed' — счёт игрока и маркера введены и совпадают (флаг мог устареть — данные важнее)
//  'mismatch'  — введённые счёта расходятся (или несовпадение зафиксировано флагом verified === false,
//                например внешним маркером через marker.html, чьих данных в раунде нет)
//  'pending'   — счёт игрока введён, но маркер ещё не подтвердил
//  'none'      — счёт ещё не введён
function getHoleVerifyState(p, h) {
    p = p || {};
    var ps = parseInt(p.scores && p.scores[h]) || 0;
    var markerId = p.markedBy;
    var ms = markerId ? (parseInt(p.markerScores && p.markerScores[markerId] && p.markerScores[markerId][h]) || 0) : 0;
    var v = p.verified && p.verified[h];

    // Фактические данные приоритетнее флага: флаг мог не обновиться,
    // если маркер ввёл счёт позже игрока или счёт исправили
    if (ps >= 1 && ms >= 1) return (ps === ms) ? 'confirmed' : 'mismatch';
    if (v === false) return 'mismatch';
    if (v === true) return 'confirmed';
    if (ps >= 1) return 'pending';
    return 'none';
}

// Собирает информацию о «незавершённых» лунках раунда для проверки перед финишем:
//  - mismatch: лунки, где есть несовпадение счёта (по фактическим данным игрок/маркер или флагу verified === false)
//  - unconfirmed: лунки, где счёт ещё не подтверждён всеми / не введён
function collectRoundVerification(r) {
    var order = getRoundOrder(r);
    var players = Object.entries((r && r.players) || {});
    var mismatch = {}, unconfirmed = {};
    var missing = {};
    if (r && r.mode === 'solo') {
        // В сольном раунде нет маркера — игрок вводит счёт сам за себя,
        // поэтому проверка маркеров НЕ нужна: раунд можно завершить в любой момент
        // (например, после 1–2 лунок). Лунки без счёта показываем только как справку
        // в списке `missing` и они НЕ блокируют завершение (canFinish остаётся true).
        order.forEach(function(h){
            var allScored = true;
            players.forEach(function(pe){
                var sc = (pe[1] && pe[1].scores) || {};
                if (!(parseInt(sc[h]) >= 1)) allScored = false;
            });
            if (!allScored) missing[h] = true;
        });
    } else {
        order.forEach(function(h){
            var mismatchForHole = {}, unconfForHole = {};
            players.forEach(function(pe){
                var p = pe[1] || {};
                var name = p.name || (currentLang === 'en' ? 'Player' : 'Игрок');
                var st = getHoleVerifyState(p, h);
                if (st === 'mismatch') {
                    // Показываем расхождение цифрами: «Имя (4≠5)» — когда известны оба счёта
                    var ps = parseInt(p.scores && p.scores[h]) || 0;
                    var mkId = p.markedBy;
                    var ms = mkId ? (parseInt(p.markerScores && p.markerScores[mkId] && p.markerScores[mkId][h]) || 0) : 0;
                    var label = (ps >= 1 && ms >= 1) ? (name + ' (' + ps + '\u2260' + ms + ')') : name;
                    mismatchForHole[label] = true;
                } else if (st !== 'confirmed') {
                    unconfForHole[name] = true;
                }
            });
            if (Object.keys(mismatchForHole).length > 0) mismatch[h] = Object.keys(mismatchForHole);
            else if (Object.keys(unconfForHole).length > 0) unconfirmed[h] = Object.keys(unconfForHole);
        });
    }
    var canFinish = Object.keys(mismatch).length === 0 && Object.keys(unconfirmed).length === 0;
    return { order: order, mismatch: mismatch, unconfirmed: unconfirmed, missing: missing, canFinish: canFinish, total: order.length };
}

function buildVerificationReportHtml(v) {
    if (!v) return '';
    var isEn = currentLang === 'en';
    var parts = [];
    var misKeys = Object.keys(v.mismatch || {});
    var uncKeys = Object.keys(v.unconfirmed || {});
    if (misKeys.length) {
        var misList = misKeys.map(function(h){ return '#' + h + (v.mismatch[h].length ? ' (' + v.mismatch[h].join(', ') + ')' : ''); }).join(', ');
        parts.push('<div class="timing-alert timing-late"><i class="fas fa-exclamation-triangle"></i><div><strong>' + (isEn ? 'Score mismatch on holes: ' : 'Несовпадения на лунках: ') + '</strong>' + misList + '</div></div>');
    }
    if (uncKeys.length) {
        var uncList = uncKeys.map(function(h){ return '#' + h + (v.unconfirmed[h].length ? ' (' + v.unconfirmed[h].join(', ') + ')' : ''); }).join(', ');
        parts.push('<div class="timing-alert timing-warn"><i class="fas fa-clock"></i><div><strong>' + (isEn ? 'Score not confirmed on holes: ' : 'Счёт не подтверждён на лунках: ') + '</strong>' + uncList + '</div></div>');
    }
    if (v.canFinish) {
        parts.push('<div class="verify-ok">✅ ' + (isEn ? 'All ' + v.total + ' holes are confirmed.' : 'Все ' + v.total + ' лунок подтверждены.') + '</div>');
    }
    return parts.join('');
}

function holeDeadline(startTime,startHole,targetHole){if(!startTime)return null;var tVal=0,h=parseInt(startHole)||1,c=0;while(c<18){tVal+=holeTiming(h);if(h===targetHole)break;h=h>=18?1:h+1;c++;}return startTime+tVal*60000;}
function checkTiming(startTime,startHole,holeNum){var dl=holeDeadline(startTime,startHole,holeNum);if(!dl)return{status:'ok',diff:0,deadline:null};var now=Date.now(),d=Math.round((now-dl)/60000);if(d>5)return{status:'late',diff:d,deadline:dl};if(d>0)return{status:'warning',diff:d,deadline:dl};return{status:'ok',diff:d,deadline:dl};}
function buildTimingNotice(st,sh,ch){var c=checkTiming(st,sh,ch);if(!c.deadline)return'';var dl=fmtTime(c.deadline),nw=fmtTime(Date.now());if(c.status==='late')return'<div class="timing-alert timing-late"><i class="fas fa-exclamation-triangle"></i><div><strong>' + (currentLang === 'en' ? 'Pace Lag!' : 'Отставание!') + '</strong><br>' + t('hole') + ' ' + ch + ': deadline ' + dl + ', now ' + nw + ' (' + c.diff + ' min)</div></div>';if(c.status==='warning')return'<div class="timing-alert timing-warn"><i class="fas fa-clock"></i><div><strong>' + (currentLang === 'en' ? 'Deadline Approaching' : 'Близко к дедлайну') + '</strong><br>' + t('hole') + ' ' + ch + ': ' + dl + '</div></div>';var a=Math.abs(c.diff);return'<div class="timing-alert timing-ok"><i class="fas fa-check-circle"></i><div>' + t('hole') + ' ' + ch + ': ' + (currentLang === 'en' ? 'On Pace' : 'в графике') + (a>0?' (' + (currentLang === 'en' ? 'buffer ' : 'запас ') + a + ' min)':'') + '</div></div>';}
function buildTimingTable(st, sh, holeRange) {
    if (!st) return '';
    var startHole = parseInt(sh) || 1;
    var order = roundHoles(startHole, holeRange);
    var count = order.length;
    var lastHole = order[order.length - 1];

    var dlFinish = holeDeadline(st, startHole, lastHole);
    var totalMin = Math.round((dlFinish - st) / 60000);
    var hrs = Math.floor(totalMin / 60);
    var mins = totalMin % 60;
    var durationStr = hrs + (currentLang === 'en' ? 'h ' : 'ч ') + (mins < 10 ? '0' : '') + mins + (currentLang === 'en' ? 'm' : 'мин');

    var startStr = fmtTime(st);
    var finishStr = fmtTime(dlFinish);

    var html = '<div class="timing-summary-card">';
    html += '<div class="timing-pills-row">';
    html += '  <div class="timing-pill"><span class="tp-lbl">' + (currentLang === 'en' ? 'Start' : 'Старт') + '</span><span class="tp-val">' + startStr + '</span></div>';
    if (count === 18) {
        var dl9 = holeDeadline(st, startHole, order[8]);
        html += '  <div class="timing-pill"><span class="tp-lbl">' + (currentLang === 'en' ? 'Turn (9h)' : '9 лунок') + '</span><span class="tp-val">' + fmtTime(dl9) + '</span></div>';
    }
    html += '  <div class="timing-pill tp-finish"><span class="tp-lbl">' + (currentLang === 'en' ? (count === 18 ? 'Finish (18h)' : 'Finish') : 'Финиш') + '</span><span class="tp-val">' + finishStr + '</span></div>';
    html += '</div>';
    html += '<div class="timing-total-badge"><i class="fas fa-clock"></i> ' + (currentLang === 'en' ? 'Pace of Play: ' : 'Норматив раунда: ') + '<b>' + durationStr + '</b></div>';

    html += '<details class="timing-details"><summary><i class="fas fa-list-ol"></i> ' + (currentLang === 'en' ? 'Hole-by-Hole Deadlines' : 'Детализация по лункам') + '</summary>';
    html += '<div class="timing-grid">';

    order.forEach(function(h) {
        var dl = holeDeadline(st, startHole, h);
        var tMin = holeTiming(h);
        html += '<div class="timing-grid-item">';
        html += '  <span class="tg-hole">' + (currentLang === 'en' ? 'Hole ' : 'Л.') + h + ' <small>(P' + holePar(h) + '·' + tMin + 'm)</small></span>';
        html += '  <span class="tg-time">' + fmtTime(dl) + '</span>';
        html += '</div>';
    });
    html += '</div></details>';
    html += '</div>';
    return html;
}

// ==========================================
// ТЕМП ИГРЫ / ТАЙМИНГИ ПРОХОЖДЕНИЯ ЛУНОК
// ==========================================
function paceStatus(delayMinutes) {
    if (delayMinutes === null || delayMinutes === undefined || isNaN(delayMinutes)) {
        return { key: 'pending', color: '#9eb5a5', label: t('pace_pending') };
    }
    var delay = Math.round(parseFloat(delayMinutes) || 0);
    if (delay <= 2) return { key: 'ok', color: '#2ecc71', label: t('pace_on_time') };
    if (delay <= 5) return { key: 'warning', color: '#f39c12', label: t('pace_warning') };
    if (delay <= 10) return { key: 'late', color: '#e67e22', label: t('pace_late') };
    return { key: 'severe', color: '#e05a4a', label: t('pace_severe') };
}

function formatPaceMinutes(minutes) {
    if (minutes === null || minutes === undefined || isNaN(minutes)) return '—';
    var value = Math.max(0, Math.round(parseFloat(minutes) || 0));
    if (value < 1) return currentLang === 'en' ? '<1 min' : '<1 мин';
    if (value >= 60) {
        var hours = Math.floor(value / 60);
        var rest = value % 60;
        return hours + (currentLang === 'en' ? 'h' : 'ч') + (rest ? ' ' + rest + (currentLang === 'en' ? 'm' : 'мин') : '');
    }
    return value + (currentLang === 'en' ? ' min' : ' мин');
}

function formatPaceDelta(minutes) {
    if (minutes === null || minutes === undefined || isNaN(minutes)) return '—';
    var value = Math.round(parseFloat(minutes) || 0);
    if (value > 0) return '+' + value + (currentLang === 'en' ? ' min' : ' мин');
    if (value < 0) return (currentLang === 'en' ? 'buffer ' : 'запас ') + Math.abs(value) + (currentLang === 'en' ? ' min' : ' мин');
    return currentLang === 'en' ? 'on time' : 'в графике';
}

function getPaceParticipants(roundData) {
    if (!roundData || !roundData.players) return [];
    var ids = Array.isArray(roundData.participantsList) && roundData.participantsList.length
        ? roundData.participantsList.slice()
        : Object.keys(roundData.players);
    return ids.map(function(id) {
        return { id: id, player: roundData.players[id] };
    }).filter(function(item) {
        return item.player && !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(item.id, item.player.name));
    });
}

function getPaceHoleTime(player, hole) {
    if (!player) return null;
    var candidates = [
        player.holeTimes && player.holeTimes[hole],
        player.scoreTimes && player.scoreTimes[hole],
        player.completedHoles && player.completedHoles[hole]
    ];
    for (var i = 0; i < candidates.length; i++) {
        var value = parseInt(candidates[i]);
        if (value > 0) return value;
    }
    return null;
}

function getGroupPaceHoleTime(roundData, hole, participants) {
    var rootTime = roundData && roundData.holeTimes && parseInt(roundData.holeTimes[hole]);
    if (rootTime > 0) return rootTime;

    var times = (participants || []).map(function(item) {
        return getPaceHoleTime(item.player, hole);
    }).filter(function(value) { return value !== null; });
    // Для старых раундов, где root holeTimes ещё нет, считаем лунку
    // завершённой группой в момент, когда последний игрок отправил счёт.
    if (times.length === (participants || []).length && times.length > 0) {
        return Math.max.apply(Math, times);
    }
    return null;
}

function getRoundPaceMetrics(roundData, nowValue) {
    var now = nowValue || Date.now();
    var order = getRoundOrder(roundData || {});
    var participants = getPaceParticipants(roundData);
    var isGroup = !!(roundData && roundData.mode === 'group' && participants.length > 1);
    var startTime = parseInt(roundData && roundData.startTime) || 0;
    var startHole = parseInt(roundData && roundData.startHole) || 1;
    var timeline = [];
    var completedHoles = [];
    var currentHole = order.length ? order[order.length - 1] : startHole;
    var previousTime = startTime || now;
    var hasTimingData = false;

    order.forEach(function(hole) {
        var complete;
        if (isGroup) {
            complete = participants.length > 0 && participants.every(function(item) {
                return parseInt(item.player.scores && item.player.scores[hole]) >= 1;
            });
        } else {
            var soloPlayer = participants.length ? participants[0].player : null;
            complete = !!(soloPlayer && parseInt(soloPlayer.scores && soloPlayer.scores[hole]) >= 1);
        }

        var completedAt = isGroup
            ? getGroupPaceHoleTime(roundData, hole, participants)
            : getPaceHoleTime(participants.length ? participants[0].player : null, hole);
        var durationMin = null;
        var holeDelay = null;

        if (complete) {
            completedHoles.push(hole);
            if (completedAt && startTime) {
                hasTimingData = true;
                durationMin = Math.max(0, (completedAt - previousTime) / 60000);
                holeDelay = durationMin - holeTiming(hole);
                previousTime = Math.max(previousTime, completedAt);
            }
        } else if (currentHole === order[order.length - 1] || completedHoles.length === order.indexOf(currentHole)) {
            currentHole = hole;
        }

        timeline.push({
            hole: hole,
            complete: complete,
            inProgress: false,
            completedAt: completedAt,
            durationMin: durationMin,
            expectedMin: holeTiming(hole),
            delayMin: holeDelay
        });
    });

    // Первый незавершённый элемент — текущая лунка. Если всё записано,
    // оставляем последнюю лунку, чтобы показывать итоговый темп до финиша.
    var firstIncompleteIndex = -1;
    for (var i = 0; i < timeline.length; i++) {
        if (!timeline[i].complete) { firstIncompleteIndex = i; break; }
    }
    if (firstIncompleteIndex >= 0) {
        currentHole = timeline[firstIncompleteIndex].hole;
        var currentItem = timeline[firstIncompleteIndex];
        var currentStart = previousTime;
        currentItem.inProgress = true;
        currentItem.durationMin = startTime ? Math.max(0, (now - currentStart) / 60000) : null;
        currentItem.delayMin = startTime ? currentItem.durationMin - currentItem.expectedMin : null;
    }

    var expectedDeadline = startTime ? holeDeadline(startTime, startHole, currentHole) : null;
    var actualReference = firstIncompleteIndex >= 0 ? now : (previousTime || now);
    var overallDelay = (expectedDeadline && actualReference) ? (actualReference - expectedDeadline) / 60000 : null;

    return {
        order: order,
        participants: participants,
        isGroup: isGroup,
        currentHole: currentHole,
        holesCompleted: completedHoles.length,
        holeCount: order.length,
        completedHoles: completedHoles,
        timeline: timeline,
        expectedDeadline: expectedDeadline,
        actualReference: actualReference,
        overallDelay: overallDelay,
        hasTimingData: hasTimingData,
        startTime: startTime,
        startHole: startHole
    };
}

function getRoundResumePlayerId(roundId, roundData) {
    if (!roundData || !roundData.players) return null;
    var stored = null;
    try { stored = localStorage.getItem('pestovo_acting_as_' + roundId); } catch(e) {}
    if (stored && roundData.players[stored]) return stored;
    if (typeof currentUser !== 'undefined' && currentUser && roundData.players[currentUser.uid]) return currentUser.uid;
    if (roundData.createdBy && roundData.players[roundData.createdBy]) return roundData.createdBy;
    var ids = Array.isArray(roundData.participantsList) && roundData.participantsList.length
        ? roundData.participantsList
        : Object.keys(roundData.players);
    return ids.length ? ids[0] : null;
}

function getSavedResumeHole(roundId, playerId, order, player) {
    if (!roundId || !playerId || !order || !order.length) return null;
    var value = null;
    try { value = parseInt(localStorage.getItem('pestovo_resume_hole_' + roundId + '_' + playerId)); } catch(e) {}
    if (order.indexOf(value) === -1) return null;
    if (player && player.verified && player.verified[value] === true) return null;
    return value;
}

function rememberResumeHole(roundId, playerId, hole) {
    if (!roundId || !playerId || !hole) return;
    try {
        localStorage.setItem('pestovo_resume_hole_' + roundId + '_' + playerId, String(hole));
        localStorage.setItem('pestovo_last_round_id', String(roundId));
    } catch(e) {}
}

function getRoundResumeState(roundId, roundData) {
    var metrics = getRoundPaceMetrics(roundData);
    var playerId = getRoundResumePlayerId(roundId, roundData);
    var player = playerId && roundData && roundData.players ? roundData.players[playerId] : null;
    var order = metrics.order;
    var resumeHole = getSavedResumeHole(roundId, playerId, order, player);
    if (!resumeHole) {
        resumeHole = metrics.currentHole || (order.length ? order[0] : 1);
    }
    var played = 0;
    if (player && player.scores) {
        order.forEach(function(h) { if (parseInt(player.scores[h]) >= 1) played++; });
    } else {
        played = metrics.holesCompleted;
    }
    return {
        playerId: playerId,
        currentHole: resumeHole,
        holesPlayed: played,
        holeCount: metrics.holeCount,
        metrics: metrics
    };
}

function renderPaceHoleTimeline(metrics) {
    if (!metrics || !metrics.timeline) return '';
    return metrics.timeline.map(function(item) {
        var state = item.complete || item.inProgress ? paceStatus(item.delayMin) : paceStatus(null);
        var marker = item.complete ? '✓ ' : item.inProgress ? '▶ ' : '';
        var duration = item.durationMin === null ? '—' : formatPaceMinutes(item.durationMin);
        var title = currentLang === 'en'
            ? 'Hole ' + item.hole + ': ' + duration + ' / target ' + item.expectedMin + ' min'
            : 'Лунка ' + item.hole + ': ' + duration + ' / норма ' + item.expectedMin + ' мин';
        var holePrefix = currentLang === 'en' ? 'H.' : 'Л.';
        return '<span class="pace-hole pace-hole-' + state.key + '" title="' + title + '">' + marker + holePrefix + item.hole + ' · ' + duration + '</span>';
    }).join('');
}

function renderPaceAssistant(targetId, roundData) {
    var el = document.getElementById(targetId);
    if (!el || !roundData) return;
    var metrics = getRoundPaceMetrics(roundData);
    var state = paceStatus(metrics.overallDelay);
    var delayText = formatPaceDelta(metrics.overallDelay);
    var currentDeadline = metrics.expectedDeadline ? fmtTime(metrics.expectedDeadline) : '—';
    var title = t('pace_of_play');
    var note = '';
    if (!metrics.hasTimingData) note = '<div class="pace-note">' + t('pace_pending') + '</div>';

    var html = '<div class="pace-assistant pace-state-' + state.key + '" style="--pace-color:' + state.color + ';">';
    html += '<div class="pace-assistant-header"><strong><i class="fas fa-stopwatch"></i> ' + title + '</strong><span class="pace-status-label">' + state.label + '</span></div>';
    html += '<div class="pace-assistant-grid">';
    html += '<div><span>' + t('pace_current_hole') + '</span><b>№' + metrics.currentHole + '</b></div>';
    html += '<div><span>' + t('pace_completed') + '</span><b>' + metrics.holesCompleted + '/' + metrics.holeCount + '</b></div>';
    html += '<div><span>' + t('pace_delay') + '</span><b>' + delayText + '</b></div>';
    html += '</div>';
    html += '<div class="pace-assistant-deadline"><i class="fas fa-clock"></i> ' + t('pace_deadline') + ': <b>' + currentDeadline + '</b></div>';
    html += note;
    html += '</div>';
    el.innerHTML = html;
}

function recordHoleCompletionTime(roundId, playerId, hole, timestamp) {
    if (typeof db === 'undefined' || !roundId || !playerId || !hole) return Promise.resolve();
    var path = 'rounds/' + roundId + '/players/' + playerId + '/holeTimes/' + hole;
    var value = timestamp || Date.now();
    return db.ref(path).transaction(function(existing) {
        return parseInt(existing) > 0 ? existing : value;
    }).catch(function(error) {
        console.warn('[Pace] Cannot save hole time', error);
    });
}

function recordGroupHoleCompletion(roundId, hole, timestamp) {
    if (typeof db === 'undefined' || !roundId || !hole) return Promise.resolve();
    return db.ref('rounds/' + roundId).once('value').then(function(snapshot) {
        var roundData = snapshot.val();
        if (!roundData || roundData.mode !== 'group') return;
        var participants = getPaceParticipants(roundData);
        if (!participants.length || !participants.every(function(item) {
            return parseInt(item.player.scores && item.player.scores[hole]) >= 1;
        })) return;
        var path = 'rounds/' + roundId + '/holeTimes/' + hole;
        var value = timestamp || Date.now();
        return db.ref(path).transaction(function(existing) {
            return parseInt(existing) > 0 ? existing : value;
        });
    }).catch(function(error) {
        console.warn('[Pace] Cannot save group hole time', error);
    });
}

// ==========================================
// ВЫЗОВ СУДЬИ / МАРШАЛА С КУЛДАУНОМ 5 МИНУТ
// ==========================================
var OFFICIAL_CALL_COOLDOWN_MS = 5 * 60 * 1000;
var officialCallBindings = Object.create(null);

function officialCallKey(roundId, playerId, type) {
    return String(roundId || '') + '|' + String(playerId || '') + '|' + String(type || '');
}

function readLocalOfficialCall(roundId, playerId, type) {
    try {
        var raw = localStorage.getItem('pestovo_official_call_' + officialCallKey(roundId, playerId, type));
        if (!raw) return null;
        var value = JSON.parse(raw);
        return value && parseInt(value.time) > 0 ? value : null;
    } catch(e) { return null; }
}

function saveLocalOfficialCall(roundId, playerId, type, call) {
    try {
        localStorage.setItem('pestovo_official_call_' + officialCallKey(roundId, playerId, type), JSON.stringify({
            time: call.time,
            cooldownUntil: call.cooldownUntil,
            alertId: call.alertId || '',
            response: call.response || null
        }));
    } catch(e) {}
}

function getOfficialCallState(alerts, roundId, playerId, type) {
    var matches = Object.entries(alerts || {}).map(function(entry) {
        return Object.assign({}, entry[1] || {}, { alertId: entry[0] });
    }).filter(function(alert) {
        return String(alert.roundId || '') === String(roundId || '') &&
            String(alert.playerId || '') === String(playerId || '') &&
            String(alert.type || '') === String(type || '') && parseInt(alert.time) > 0;
    });
    matches.sort(function(a, b) { return parseInt(a.time) - parseInt(b.time); });

    var localCall = readLocalOfficialCall(roundId, playerId, type);
    var serverCall = matches.length ? matches[matches.length - 1] : null;
    var call = serverCall;
    if (localCall && (!call || parseInt(localCall.time) > parseInt(call.time))) {
        call = Object.assign({}, localCall);
    }
    if (!call) return { call: null, remainingMs: 0, accepted: false, available: true };

    var callTime = parseInt(call.time) || 0;
    var cooldownUntil = parseInt(call.cooldownUntil) || (callTime + OFFICIAL_CALL_COOLDOWN_MS);
    var remainingMs = Math.max(0, cooldownUntil - Date.now());
    return {
        call: call,
        remainingMs: remainingMs,
        accepted: !!(call.response && parseInt(call.response.respondedAt) > 0),
        available: remainingMs <= 0
    };
}

function formatOfficialCountdown(ms) {
    var totalSeconds = Math.max(0, Math.ceil((parseInt(ms) || 0) / 1000));
    var mins = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    return (mins < 10 ? '0' : '') + mins + ':' + (seconds < 10 ? '0' : '') + seconds;
}

function getOfficialRoleName(type) {
    return type === 'marshal'
        ? (currentLang === 'en' ? 'Marshal' : 'Маршал')
        : (currentLang === 'en' ? 'Referee' : 'Судья');
}

function getOfficialCallButtonLabel(type) {
    return type === 'marshal' ? t('call_marshal') : t('call_referee');
}

function getOfficialCallIcon(type) {
    return type === 'marshal' ? 'fa-shield-halved' : 'fa-gavel';
}

function renderOfficialCallButtons(config, alerts) {
    if (!config || !config.roundId || !config.playerId) return;
    var canEdit = typeof config.canEdit === 'function' ? config.canEdit() : config.canEdit !== false;
    var prefix = config.prefix || 'official';
    ['referee', 'marshal'].forEach(function(type) {
        var btn = document.getElementById(prefix + '-' + type + '-call-btn');
        if (!btn) return;
        var state = getOfficialCallState(alerts || {}, config.roundId, config.playerId, type);
        var enabled = canEdit && state.available;
        var role = getOfficialRoleName(type);
        var isAccepted = state.accepted && !state.available;
        var label = enabled
            ? getOfficialCallButtonLabel(type)
            : (isAccepted ? role + ' ' + t('call_on_way') : t('call_sent'));

        btn.disabled = !enabled;
        btn.className = 'btn btn-sm official-call-btn ' + (type === 'marshal' ? 'btn-warning' : 'btn-danger') +
            (enabled ? ' official-call-ready' : isAccepted ? ' official-call-accepted' : ' official-call-sent');
        btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        btn.innerHTML = '<i class="fas ' + getOfficialCallIcon(type) + '"></i> ' + label;

        var statusEl = document.getElementById(prefix + '-' + type + '-call-status');
        if (!statusEl) return;
        if (!state.call || state.available) {
            statusEl.innerHTML = '';
            statusEl.className = 'official-call-status hidden';
            return;
        }

        var statusHtml = '';
        if (state.accepted) {
            var acceptedAt = parseInt(state.call.response.respondedAt) || 0;
            statusHtml = '<strong>' + role + ' ' + t('call_accepted') + ' ' + fmtTime(acceptedAt) + '</strong>' +
                ' · ' + role + ' ' + t('call_on_way');
        } else {
            statusHtml = '<strong>' + t('call_sent') + '</strong>' +
                (state.call.time ? ' · ' + fmtTime(state.call.time) : '');
        }
        statusHtml += '<br><span>' + t('call_cooldown') + ' <b>' + formatOfficialCountdown(state.remainingMs) + '</b></span>';
        statusEl.innerHTML = statusHtml;
        statusEl.className = 'official-call-status ' + (state.accepted ? 'accepted' : 'sent');
    });
}

function refreshOfficialCallBindings() {
    Object.keys(officialCallBindings).forEach(function(key) {
        var binding = officialCallBindings[key];
        if (binding) renderOfficialCallButtons(binding.config, binding.alerts || {});
    });
}

function ensureOfficialCallTicker(key) {
    var binding = officialCallBindings[key];
    if (!binding || binding.timer) return;
    var tick = function() {
        var current = officialCallBindings[key];
        if (!current) return;
        renderOfficialCallButtons(current.config, current.alerts || {});
        current.timer = setTimeout(tick, isBatterySaverEnabled() ? 30000 : 1000);
    };
    binding.timer = setTimeout(tick, isBatterySaverEnabled() ? 30000 : 1000);
}

function reconcileOfficialCallResponse(binding, notification) {
    if (!binding || !notification || notification.type !== 'call_response') return;
    var alertId = notification.alertId || '';
    var alert = alertId && binding.alerts ? binding.alerts[alertId] : null;
    if (alert && String(alert.playerId || '') !== String(binding.config.playerId || '')) alert = null;
    var response = {
        status: 'accepted',
        responderRole: notification.responderRole,
        respondedAt: parseInt(notification.time) || Date.now()
    };

    if (alert) {
        alert.response = Object.assign({}, alert.response || {}, response);
        saveLocalOfficialCall(binding.config.roundId, binding.config.playerId, alert.type, alert);
    } else {
        // Если чтение alerts недоступно, локальная запись всё равно переводит
        // кнопку в состояние «едет» после push-уведомления от администратора.
        ['referee', 'marshal'].forEach(function(type) {
            var local = readLocalOfficialCall(binding.config.roundId, binding.config.playerId, type);
            if (local && (!alertId || local.alertId === alertId)) {
                local.response = response;
                saveLocalOfficialCall(binding.config.roundId, binding.config.playerId, type, local);
            }
        });
    }
    renderOfficialCallButtons(binding.config, binding.alerts || {});
}

function listenForOfficialCallState(config) {
    if (typeof db === 'undefined' || !config || !config.roundId || !config.playerId) return;
    var key = officialCallKey(config.roundId, config.playerId, config.prefix || 'official');
    if (!officialCallBindings[key]) {
        officialCallBindings[key] = { config: config, alerts: {}, timer: null };
        db.ref('alerts').orderByChild('roundId').equalTo(String(config.roundId)).on('value', function(snapshot) {
            var binding = officialCallBindings[key];
            if (!binding) return;
            binding.alerts = snapshot.val() || {};
            renderOfficialCallButtons(binding.config, binding.alerts);
        });
        db.ref('users/' + config.playerId + '/notifications').orderByChild('type').equalTo('call_response').on('child_added', function(snapshot) {
            var binding = officialCallBindings[key];
            if (binding) reconcileOfficialCallResponse(binding, snapshot.val());
        });
    } else {
        officialCallBindings[key].config = config;
    }
    ensureOfficialCallTicker(key);
    renderOfficialCallButtons(officialCallBindings[key].config, officialCallBindings[key].alerts || {});
}

function requestOfficialCall(config) {
    if (typeof db === 'undefined' || !config || !config.roundId || !config.playerId || !config.type) return Promise.resolve(false);
    var type = config.type;
    var localState = getOfficialCallState({}, config.roundId, config.playerId, type);
    if (localState.remainingMs > 0) {
        renderOfficialCallButtons(config, {});
        toast(t('call_cooldown') + ' ' + formatOfficialCountdown(localState.remainingMs), 'warn');
        return Promise.resolve(false);
    }

    // Чтение списка вызовов может быть запрещено правилами Firebase для игрока.
    // В этом случае локальный таймер всё равно защищает от обычного спама,
    // а сам вызов не должен блокироваться — продолжаем с пустым списком.
    var alertsPromise = db.ref('alerts').orderByChild('roundId').equalTo(String(config.roundId)).once('value')
        .then(function(snapshot) { return snapshot.val() || {}; })
        .catch(function(error) {
            console.warn('[Calls] Cannot read existing calls; using local cooldown', error);
            return {};
        });

    return alertsPromise.then(function(alerts) {
        var state = getOfficialCallState(alerts, config.roundId, config.playerId, type);
        if (state.remainingMs > 0) {
            renderOfficialCallButtons(config, alerts);
            toast(t('call_cooldown') + ' ' + formatOfficialCountdown(state.remainingMs), 'warn');
            return false;
        }

        var hole = typeof config.hole === 'function' ? config.hole() : config.hole;
        var role = getOfficialRoleName(type);
        var confirmText = currentLang === 'en'
            ? 'Call ' + role.toLowerCase() + ' to hole ' + hole + '?'
            : 'Вызвать ' + (type === 'marshal' ? 'маршала' : 'судью') + ' на лунку ' + hole + '?';
        if (!window.confirm(confirmText)) return false;

        var now = Date.now();
        var playerName = typeof config.playerName === 'function' ? config.playerName() : config.playerName;
        var flightMembers = typeof config.flightMembers === 'function' ? config.flightMembers() : config.flightMembers;
        var call = {
            roundId: config.roundId,
            type: type,
            hole: hole,
            playerId: config.playerId,
            playerName: playerName || (currentLang === 'en' ? 'Player' : 'Игрок'),
            flightMembers: flightMembers || [],
            time: now,
            createdAt: now,
            cooldownUntil: now + OFFICIAL_CALL_COOLDOWN_MS,
            status: 'active',
            state: 'sent'
        };
        var ref = db.ref('alerts').push();
        call.alertId = ref.key;
        return ref.set(call).then(function() {
            saveLocalOfficialCall(config.roundId, config.playerId, type, call);
            var binding = officialCallBindings[officialCallKey(config.roundId, config.playerId, config.prefix || 'official')];
            if (binding) {
                binding.alerts = binding.alerts || {};
                binding.alerts[ref.key] = call;
                renderOfficialCallButtons(binding.config, binding.alerts);
            }
            if (typeof config.onSent === 'function') config.onSent(call);
            return true;
        });
    }).catch(function(error) {
        toast((currentLang === 'en' ? '❌ Call failed: ' : '❌ Не удалось отправить вызов: ') + (error && error.message ? error.message : error), 'error');
        return false;
    });
}

function parseExactHcp(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    var s = String(val).trim().replace(',', '.');
    if (s.startsWith('+')) {
        return -Math.abs(parseFloat(s.substring(1)) || 0);
    }
    return parseFloat(s) || 0;
}

function fmtExactHcp(val) {
    if (val === null || val === undefined || isNaN(val) || val === '') return '—';
    var num = parseFloat(val);
    if (isNaN(num)) return '—';
    if (num < 0) {
        return '+' + Math.abs(num).toFixed(1);
    }
    return Math.abs(num).toFixed(1);
}

function fmtFieldHcp(val) {
    if (val === null || val === undefined || isNaN(val) || val === '') return '0';
    var num = Math.round(parseFloat(val) || 0);
    if (num < 0) {
        return '+' + Math.abs(num);
    }
    return String(num);
}

// Цветовая градация игрового гандикапа для счётных карточек и чипов.
// Зелёный — свободные лунки, гандикап кодируется отдельной шкалой:
// +/скретч (<=0), 1–10, 11–20, 21–36, 37+.
function fieldHcpBandClass(val) {
    var hcp = parseFloat(val);
    if (isNaN(hcp)) return 'hcp-band-unknown';
    if (hcp <= 0) return 'hcp-band-plus';
    if (hcp <= 10) return 'hcp-band-1-10';
    if (hcp <= 20) return 'hcp-band-11-20';
    if (hcp <= 36) return 'hcp-band-21-36';
    return 'hcp-band-37';
}

function fieldHcpBandTitle(val) {
    var hcp = parseFloat(val);
    if (isNaN(hcp)) return '';
    if (hcp <= 0) return 'HCP + / scratch';
    if (hcp <= 10) return 'HCP 1–10';
    if (hcp <= 20) return 'HCP 11–20';
    if (hcp <= 36) return 'HCP 21–36';
    return 'HCP 37+';
}

const PESTOVO_MEN_HCP_TABLE = {
    bk: [
        { min: -3.5, max: -2.8, hcp: 0 }, { min: -2.7, max: -2.0, hcp: 1 }, { min: -1.9, max: -1.2, hcp: 2 },
        { min: -1.1, max: -0.4, hcp: 3 }, { min: -0.3, max: 0.3, hcp: 4 }, { min: 0.4, max: 1.1, hcp: 5 },
        { min: 1.2, max: 1.9, hcp: 6 }, { min: 2.0, max: 2.7, hcp: 7 }, { min: 2.8, max: 3.5, hcp: 8 },
        { min: 3.6, max: 4.3, hcp: 9 }, { min: 4.4, max: 5.1, hcp: 10 }, { min: 5.2, max: 5.8, hcp: 11 },
        { min: 5.9, max: 6.6, hcp: 12 }, { min: 6.7, max: 7.4, hcp: 13 }, { min: 7.5, max: 8.2, hcp: 14 },
        { min: 8.3, max: 9.0, hcp: 15 }, { min: 9.1, max: 9.8, hcp: 16 }, { min: 9.9, max: 10.5, hcp: 17 },
        { min: 10.6, max: 11.3, hcp: 18 }, { min: 11.4, max: 12.1, hcp: 19 }, { min: 12.2, max: 12.9, hcp: 20 },
        { min: 13.0, max: 13.7, hcp: 21 }, { min: 13.8, max: 14.5, hcp: 22 }, { min: 14.6, max: 15.3, hcp: 23 },
        { min: 15.4, max: 16.0, hcp: 24 }, { min: 16.1, max: 16.8, hcp: 25 }, { min: 16.9, max: 17.6, hcp: 26 },
        { min: 17.7, max: 18.4, hcp: 27 }, { min: 18.5, max: 19.2, hcp: 28 }, { min: 19.3, max: 20.0, hcp: 29 },
        { min: 20.1, max: 20.7, hcp: 30 }, { min: 20.8, max: 21.5, hcp: 31 }, { min: 21.6, max: 22.3, hcp: 32 },
        { min: 22.4, max: 23.1, hcp: 33 }, { min: 23.2, max: 23.9, hcp: 34 }, { min: 24.0, max: 24.7, hcp: 35 },
        { min: 24.8, max: 25.5, hcp: 36 }, { min: 25.6, max: 26.2, hcp: 37 }, { min: 26.3, max: 27.0, hcp: 38 },
        { min: 27.1, max: 27.8, hcp: 39 }, { min: 27.9, max: 28.6, hcp: 40 }, { min: 28.7, max: 29.4, hcp: 41 },
        { min: 29.5, max: 30.2, hcp: 42 }, { min: 30.3, max: 30.9, hcp: 43 }, { min: 31.0, max: 31.7, hcp: 44 },
        { min: 31.8, max: 32.5, hcp: 45 }, { min: 32.6, max: 33.3, hcp: 46 }, { min: 33.4, max: 34.1, hcp: 47 },
        { min: 34.2, max: 34.9, hcp: 48 }, { min: 35.0, max: 35.7, hcp: 49 }, { min: 35.8, max: 36.4, hcp: 50 },
        { min: 36.5, max: 37.2, hcp: 51 }, { min: 37.3, max: 38.0, hcp: 52 }, { min: 38.1, max: 38.8, hcp: 53 },
        { min: 38.9, max: 39.6, hcp: 54 }, { min: 39.7, max: 40.4, hcp: 55 }, { min: 40.5, max: 41.1, hcp: 56 },
        { min: 41.2, max: 41.9, hcp: 57 }, { min: 42.0, max: 42.7, hcp: 58 }, { min: 42.8, max: 43.5, hcp: 59 },
        { min: 43.6, max: 44.3, hcp: 60 }, { min: 44.4, max: 45.1, hcp: 61 }, { min: 45.2, max: 45.9, hcp: 62 },
        { min: 46.0, max: 46.6, hcp: 63 }, { min: 46.7, max: 47.4, hcp: 64 }, { min: 47.5, max: 48.2, hcp: 65 },
        { min: 48.3, max: 49.0, hcp: 66 }, { min: 49.1, max: 49.8, hcp: 67 }, { min: 49.9, max: 50.6, hcp: 68 },
        { min: 50.7, max: 51.3, hcp: 69 }, { min: 51.4, max: 52.1, hcp: 70 }, { min: 52.2, max: 52.9, hcp: 71 },
        { min: 53.0, max: 53.7, hcp: 72 }, { min: 53.8, max: 54.0, hcp: 73 }
    ],
    bl: [
        { min: -3.5, max: -2.8, hcp: -2 }, { min: -2.7, max: -1.9, hcp: -1 }, { min: -1.8, max: -1.1, hcp: 0 },
        { min: -1.0, max: -0.3, hcp: 1 }, { min: -0.2, max: 0.5, hcp: 2 }, { min: 0.6, max: 1.4, hcp: 3 },
        { min: 1.5, max: 2.2, hcp: 4 }, { min: 2.3, max: 3.0, hcp: 5 }, { min: 3.1, max: 3.8, hcp: 6 },
        { min: 3.9, max: 4.7, hcp: 7 }, { min: 4.8, max: 5.5, hcp: 8 }, { min: 5.6, max: 6.3, hcp: 9 },
        { min: 6.4, max: 7.1, hcp: 10 }, { min: 7.2, max: 8.0, hcp: 11 }, { min: 8.1, max: 8.8, hcp: 12 },
        { min: 8.9, max: 9.6, hcp: 13 }, { min: 9.7, max: 10.4, hcp: 14 }, { min: 10.5, max: 11.3, hcp: 15 },
        { min: 11.4, max: 12.1, hcp: 16 }, { min: 12.2, max: 12.9, hcp: 17 }, { min: 13.0, max: 13.7, hcp: 18 },
        { min: 13.8, max: 14.5, hcp: 19 }, { min: 14.6, max: 15.4, hcp: 20 }, { min: 15.5, max: 16.2, hcp: 21 },
        { min: 16.3, max: 17.0, hcp: 22 }, { min: 17.1, max: 17.8, hcp: 23 }, { min: 17.9, max: 18.7, hcp: 24 },
        { min: 18.8, max: 19.5, hcp: 25 }, { min: 19.6, max: 20.3, hcp: 26 }, { min: 20.4, max: 21.1, hcp: 27 },
        { min: 21.2, max: 22.0, hcp: 28 }, { min: 22.1, max: 22.8, hcp: 29 }, { min: 22.9, max: 23.6, hcp: 30 },
        { min: 23.7, max: 24.4, hcp: 31 }, { min: 24.5, max: 25.3, hcp: 32 }, { min: 25.4, max: 26.1, hcp: 33 },
        { min: 26.2, max: 26.9, hcp: 34 }, { min: 27.0, max: 27.7, hcp: 35 }, { min: 27.8, max: 28.6, hcp: 36 },
        { min: 28.7, max: 29.4, hcp: 37 }, { min: 29.5, max: 30.2, hcp: 38 }, { min: 30.3, max: 31.0, hcp: 39 },
        { min: 31.1, max: 31.9, hcp: 40 }, { min: 32.0, max: 32.7, hcp: 41 }, { min: 32.8, max: 33.5, hcp: 42 },
        { min: 33.6, max: 34.3, hcp: 43 }, { min: 34.4, max: 35.2, hcp: 44 }, { min: 35.3, max: 36.0, hcp: 45 },
        { min: 36.1, max: 36.8, hcp: 46 }, { min: 36.9, max: 37.6, hcp: 47 }, { min: 37.7, max: 38.5, hcp: 48 },
        { min: 38.6, max: 39.3, hcp: 49 }, { min: 39.4, max: 40.1, hcp: 50 }, { min: 40.2, max: 40.9, hcp: 51 },
        { min: 41.0, max: 41.8, hcp: 52 }, { min: 41.9, max: 42.6, hcp: 53 }, { min: 42.7, max: 43.4, hcp: 54 },
        { min: 43.5, max: 44.2, hcp: 55 }, { min: 44.3, max: 45.1, hcp: 56 }, { min: 45.2, max: 45.9, hcp: 57 },
        { min: 46.0, max: 46.7, hcp: 58 }, { min: 46.8, max: 47.5, hcp: 59 }, { min: 47.6, max: 48.4, hcp: 60 },
        { min: 48.5, max: 49.2, hcp: 61 }, { min: 49.3, max: 50.0, hcp: 62 }, { min: 50.1, max: 50.8, hcp: 63 },
        { min: 50.9, max: 51.7, hcp: 64 }, { min: 51.8, max: 52.5, hcp: 65 }, { min: 52.6, max: 53.3, hcp: 66 },
        { min: 53.4, max: 54.0, hcp: 67 }
    ],
    wh: [
        { min: -3.7, max: -3.0, hcp: -4 }, { min: -2.9, max: -2.1, hcp: -3 }, { min: -2.0, max: -1.3, hcp: -2 },
        { min: -1.2, max: -0.5, hcp: -1 }, { min: -0.4, max: 0.4, hcp: 0 }, { min: 0.5, max: 1.2, hcp: 1 },
        { min: 1.3, max: 2.0, hcp: 2 }, { min: 2.1, max: 2.9, hcp: 3 }, { min: 3.0, max: 3.7, hcp: 4 },
        { min: 3.8, max: 4.6, hcp: 5 }, { min: 4.7, max: 5.4, hcp: 6 }, { min: 5.5, max: 6.2, hcp: 7 },
        { min: 6.3, max: 7.1, hcp: 8 }, { min: 7.2, max: 7.9, hcp: 9 }, { min: 8.0, max: 8.7, hcp: 10 },
        { min: 8.8, max: 9.6, hcp: 11 }, { min: 9.7, max: 10.4, hcp: 12 }, { min: 10.5, max: 11.3, hcp: 13 },
        { min: 11.4, max: 12.1, hcp: 14 }, { min: 12.2, max: 12.9, hcp: 15 }, { min: 13.0, max: 13.8, hcp: 16 },
        { min: 13.9, max: 14.6, hcp: 17 }, { min: 14.7, max: 15.4, hcp: 18 }, { min: 15.5, max: 16.3, hcp: 19 },
        { min: 16.4, max: 17.1, hcp: 20 }, { min: 17.2, max: 17.9, hcp: 21 }, { min: 18.0, max: 18.8, hcp: 22 },
        { min: 18.9, max: 19.6, hcp: 23 }, { min: 19.7, max: 20.5, hcp: 24 }, { min: 20.6, max: 21.3, hcp: 25 },
        { min: 21.4, max: 22.1, hcp: 26 }, { min: 22.2, max: 23.0, hcp: 27 }, { min: 23.1, max: 23.8, hcp: 28 },
        { min: 23.9, max: 24.6, hcp: 29 }, { min: 24.7, max: 25.5, hcp: 30 }, { min: 25.6, max: 26.3, hcp: 31 },
        { min: 26.4, max: 27.2, hcp: 32 }, { min: 27.3, max: 28.0, hcp: 33 }, { min: 28.1, max: 28.8, hcp: 34 },
        { min: 28.9, max: 29.7, hcp: 35 }, { min: 29.8, max: 30.5, hcp: 36 }, { min: 30.6, max: 31.3, hcp: 37 },
        { min: 31.4, max: 32.2, hcp: 38 }, { min: 32.3, max: 33.0, hcp: 39 }, { min: 33.1, max: 33.9, hcp: 40 },
        { min: 34.0, max: 34.7, hcp: 41 }, { min: 34.8, max: 35.5, hcp: 42 }, { min: 35.6, max: 36.4, hcp: 43 },
        { min: 36.5, max: 37.2, hcp: 44 }, { min: 37.3, max: 38.0, hcp: 45 }, { min: 38.1, max: 38.9, hcp: 46 },
        { min: 39.0, max: 39.7, hcp: 47 }, { min: 39.8, max: 40.5, hcp: 48 }, { min: 40.6, max: 41.4, hcp: 49 },
        { min: 41.5, max: 42.2, hcp: 50 }, { min: 42.3, max: 43.1, hcp: 51 }, { min: 43.2, max: 43.9, hcp: 52 },
        { min: 44.0, max: 44.7, hcp: 53 }, { min: 44.8, max: 45.6, hcp: 54 }, { min: 45.7, max: 46.4, hcp: 55 },
        { min: 46.5, max: 47.2, hcp: 56 }, { min: 47.3, max: 48.1, hcp: 57 }, { min: 48.2, max: 48.9, hcp: 58 },
        { min: 49.0, max: 49.8, hcp: 59 }, { min: 49.9, max: 50.6, hcp: 60 }, { min: 50.7, max: 51.4, hcp: 61 },
        { min: 51.5, max: 52.3, hcp: 62 }, { min: 52.4, max: 53.1, hcp: 63 }, { min: 53.2, max: 53.9, hcp: 64 },
        { min: 54.0, max: 54.0, hcp: 65 }
    ],
    rd: [
        { min: -3.1, max: -2.3, hcp: -6 }, { min: -2.2, max: -1.5, hcp: -5 }, { min: -1.4, max: -0.6, hcp: -4 },
        { min: -0.5, max: 0.2, hcp: -3 }, { min: 0.3, max: 1.0, hcp: -2 }, { min: 1.1, max: 1.9, hcp: -1 },
        { min: 2.0, max: 2.7, hcp: 0 }, { min: 2.8, max: 3.6, hcp: 1 }, { min: 3.7, max: 4.4, hcp: 2 },
        { min: 4.5, max: 5.3, hcp: 3 }, { min: 5.4, max: 6.1, hcp: 4 }, { min: 6.2, max: 6.9, hcp: 5 },
        { min: 7.0, max: 7.8, hcp: 6 }, { min: 7.9, max: 8.6, hcp: 7 }, { min: 8.7, max: 9.5, hcp: 8 },
        { min: 9.6, max: 10.3, hcp: 9 }, { min: 10.4, max: 11.2, hcp: 10 }, { min: 11.3, max: 12.0, hcp: 11 },
        { min: 12.1, max: 12.9, hcp: 12 }, { min: 13.0, max: 13.7, hcp: 13 }, { min: 13.8, max: 14.5, hcp: 14 },
        { min: 14.6, max: 15.4, hcp: 15 }, { min: 15.5, max: 16.2, hcp: 16 }, { min: 16.3, max: 17.1, hcp: 17 },
        { min: 17.2, max: 17.9, hcp: 18 }, { min: 18.0, max: 18.8, hcp: 19 }, { min: 18.9, max: 19.6, hcp: 20 },
        { min: 19.7, max: 20.4, hcp: 21 }, { min: 20.5, max: 21.3, hcp: 22 }, { min: 21.4, max: 22.1, hcp: 23 },
        { min: 22.2, max: 23.0, hcp: 24 }, { min: 23.1, max: 23.8, hcp: 25 }, { min: 23.9, max: 24.7, hcp: 26 },
        { min: 24.8, max: 25.5, hcp: 27 }, { min: 25.6, max: 26.3, hcp: 28 }, { min: 26.4, max: 27.2, hcp: 29 },
        { min: 27.3, max: 28.0, hcp: 30 }, { min: 28.1, max: 28.9, hcp: 31 }, { min: 29.0, max: 29.7, hcp: 32 },
        { min: 29.8, max: 30.6, hcp: 33 }, { min: 30.7, max: 31.4, hcp: 34 }, { min: 31.5, max: 32.2, hcp: 35 },
        { min: 32.3, max: 33.1, hcp: 36 }, { min: 33.2, max: 33.9, hcp: 37 }, { min: 34.0, max: 34.8, hcp: 38 },
        { min: 34.9, max: 35.6, hcp: 39 }, { min: 35.7, max: 36.5, hcp: 40 }, { min: 36.6, max: 37.3, hcp: 41 },
        { min: 37.4, max: 38.2, hcp: 42 }, { min: 38.3, max: 39.0, hcp: 43 }, { min: 39.1, max: 39.8, hcp: 44 },
        { min: 39.9, max: 40.7, hcp: 45 }, { min: 40.8, max: 41.5, hcp: 46 }, { min: 41.6, max: 42.4, hcp: 47 },
        { min: 42.5, max: 43.2, hcp: 48 }, { min: 43.3, max: 44.1, hcp: 49 }, { min: 44.2, max: 44.9, hcp: 50 },
        { min: 45.0, max: 45.7, hcp: 51 }, { min: 45.8, max: 46.6, hcp: 52 }, { min: 46.7, max: 47.4, hcp: 53 },
        { min: 47.5, max: 48.3, hcp: 54 }, { min: 48.4, max: 49.1, hcp: 55 }, { min: 49.2, max: 50.0, hcp: 56 },
        { min: 50.1, max: 50.8, hcp: 57 }, { min: 50.9, max: 51.6, hcp: 58 }, { min: 51.7, max: 52.5, hcp: 59 },
        { min: 52.6, max: 53.3, hcp: 60 }, { min: 53.4, max: 54.0, hcp: 61 }
    ]
};

const PESTOVO_WOMEN_HCP_TABLE = {
    bl: [
        { min: -6.8, max: -6.2, hcp: 0 }, { min: -6.1, max: -5.4, hcp: 1 }, { min: -5.3, max: -4.7, hcp: 2 },
        { min: -4.6, max: -4.0, hcp: 3 }, { min: -3.9, max: -3.2, hcp: 4 }, { min: -3.1, max: -2.5, hcp: 5 },
        { min: -2.4, max: -1.7, hcp: 6 }, { min: -1.6, max: -1.0, hcp: 7 }, { min: -0.9, max: -0.3, hcp: 8 },
        { min: -0.2, max: 0.5, hcp: 9 }, { min: 0.6, max: 1.2, hcp: 10 }, { min: 1.3, max: 1.9, hcp: 11 },
        { min: 2.0, max: 2.7, hcp: 12 }, { min: 2.8, max: 3.4, hcp: 13 }, { min: 3.5, max: 4.2, hcp: 14 },
        { min: 4.3, max: 4.9, hcp: 15 }, { min: 5.0, max: 5.6, hcp: 16 }, { min: 5.7, max: 6.4, hcp: 17 },
        { min: 6.5, max: 7.1, hcp: 18 }, { min: 7.2, max: 7.9, hcp: 19 }, { min: 8.0, max: 8.6, hcp: 20 },
        { min: 8.7, max: 9.3, hcp: 21 }, { min: 9.4, max: 10.1, hcp: 22 }, { min: 10.2, max: 10.8, hcp: 23 },
        { min: 10.9, max: 11.5, hcp: 24 }, { min: 11.6, max: 12.3, hcp: 25 }, { min: 12.4, max: 13.0, hcp: 26 },
        { min: 13.1, max: 13.8, hcp: 27 }, { min: 13.9, max: 14.5, hcp: 28 }, { min: 14.6, max: 15.2, hcp: 29 },
        { min: 15.3, max: 16.0, hcp: 30 }, { min: 16.1, max: 16.7, hcp: 31 }, { min: 16.8, max: 17.5, hcp: 32 },
        { min: 17.6, max: 18.2, hcp: 33 }, { min: 18.3, max: 18.9, hcp: 34 }, { min: 19.0, max: 19.7, hcp: 35 },
        { min: 19.8, max: 20.4, hcp: 36 }, { min: 20.5, max: 21.1, hcp: 37 }, { min: 21.2, max: 21.9, hcp: 38 },
        { min: 22.0, max: 22.6, hcp: 39 }, { min: 22.7, max: 23.4, hcp: 40 }, { min: 23.5, max: 24.1, hcp: 41 },
        { min: 24.2, max: 24.8, hcp: 42 }, { min: 24.9, max: 25.6, hcp: 43 }, { min: 25.7, max: 26.3, hcp: 44 },
        { min: 26.4, max: 27.1, hcp: 45 }, { min: 27.2, max: 27.8, hcp: 46 }, { min: 27.9, max: 28.5, hcp: 47 },
        { min: 28.6, max: 29.3, hcp: 48 }, { min: 29.4, max: 30.0, hcp: 49 }, { min: 30.1, max: 30.7, hcp: 50 },
        { min: 30.8, max: 31.5, hcp: 51 }, { min: 31.6, max: 32.2, hcp: 52 }, { min: 32.3, max: 33.0, hcp: 53 },
        { min: 33.1, max: 33.7, hcp: 54 }, { min: 33.8, max: 34.4, hcp: 55 }, { min: 34.5, max: 35.2, hcp: 56 },
        { min: 35.3, max: 35.9, hcp: 57 }, { min: 36.0, max: 36.7, hcp: 58 }, { min: 36.8, max: 37.4, hcp: 59 },
        { min: 37.5, max: 38.1, hcp: 60 }, { min: 38.2, max: 38.9, hcp: 61 }, { min: 39.0, max: 39.6, hcp: 62 },
        { min: 39.7, max: 40.3, hcp: 63 }, { min: 40.4, max: 41.1, hcp: 64 }, { min: 41.2, max: 41.8, hcp: 65 },
        { min: 41.9, max: 42.6, hcp: 66 }, { min: 42.7, max: 43.3, hcp: 67 }, { min: 43.4, max: 44.0, hcp: 68 },
        { min: 44.1, max: 44.8, hcp: 69 }, { min: 44.9, max: 45.5, hcp: 70 }, { min: 45.6, max: 46.3, hcp: 71 },
        { min: 46.4, max: 47.0, hcp: 72 }, { min: 47.1, max: 47.7, hcp: 73 }, { min: 47.8, max: 48.5, hcp: 74 },
        { min: 48.6, max: 49.2, hcp: 75 }, { min: 49.3, max: 50.0, hcp: 76 }, { min: 50.1, max: 50.7, hcp: 77 },
        { min: 50.8, max: 51.4, hcp: 78 }, { min: 51.5, max: 52.2, hcp: 79 }, { min: 52.3, max: 52.9, hcp: 80 },
        { min: 53.0, max: 53.6, hcp: 81 }, { min: 53.7, max: 54.0, hcp: 82 }
    ],
    wh: [
        { min: -5.6, max: -4.9, hcp: 0 }, { min: -4.8, max: -4.1, hcp: 1 }, { min: -4.0, max: -3.3, hcp: 2 },
        { min: -3.2, max: -2.5, hcp: 3 }, { min: -2.4, max: -1.7, hcp: 4 }, { min: -1.6, max: -0.9, hcp: 5 },
        { min: -0.8, max: -0.1, hcp: 6 }, { min: 0.0, max: 0.7, hcp: 7 }, { min: 0.8, max: 1.5, hcp: 8 },
        { min: 1.6, max: 2.2, hcp: 9 }, { min: 2.3, max: 3.0, hcp: 10 }, { min: 3.1, max: 3.8, hcp: 11 },
        { min: 3.9, max: 4.6, hcp: 12 }, { min: 4.7, max: 5.4, hcp: 13 }, { min: 5.5, max: 6.2, hcp: 14 },
        { min: 6.3, max: 7.0, hcp: 15 }, { min: 7.1, max: 7.8, hcp: 16 }, { min: 7.9, max: 8.6, hcp: 17 },
        { min: 8.7, max: 9.4, hcp: 18 }, { min: 9.5, max: 10.1, hcp: 19 }, { min: 10.2, max: 10.9, hcp: 20 },
        { min: 11.0, max: 11.7, hcp: 21 }, { min: 11.8, max: 12.5, hcp: 22 }, { min: 12.6, max: 13.3, hcp: 23 },
        { min: 13.4, max: 14.1, hcp: 24 }, { min: 14.2, max: 14.9, hcp: 25 }, { min: 15.0, max: 15.7, hcp: 26 },
        { min: 15.8, max: 16.5, hcp: 27 }, { min: 16.6, max: 17.3, hcp: 28 }, { min: 17.4, max: 18.0, hcp: 29 },
        { min: 18.1, max: 18.8, hcp: 30 }, { min: 18.9, max: 19.6, hcp: 31 }, { min: 19.7, max: 20.4, hcp: 32 },
        { min: 20.5, max: 21.2, hcp: 33 }, { min: 21.3, max: 22.0, hcp: 34 }, { min: 22.1, max: 22.8, hcp: 35 },
        { min: 22.9, max: 23.6, hcp: 36 }, { min: 23.7, max: 24.4, hcp: 37 }, { min: 24.5, max: 25.2, hcp: 38 },
        { min: 25.3, max: 25.9, hcp: 39 }, { min: 26.0, max: 26.7, hcp: 40 }, { min: 26.8, max: 27.5, hcp: 41 },
        { min: 27.6, max: 28.3, hcp: 42 }, { min: 28.4, max: 29.1, hcp: 43 }, { min: 29.2, max: 29.9, hcp: 44 },
        { min: 30.0, max: 30.7, hcp: 45 }, { min: 30.8, max: 31.5, hcp: 46 }, { min: 31.6, max: 32.3, hcp: 47 },
        { min: 32.4, max: 33.1, hcp: 48 }, { min: 33.2, max: 33.9, hcp: 49 }, { min: 34.0, max: 34.6, hcp: 50 },
        { min: 34.7, max: 35.4, hcp: 51 }, { min: 35.5, max: 36.2, hcp: 52 }, { min: 36.3, max: 37.0, hcp: 53 },
        { min: 37.1, max: 37.8, hcp: 54 }, { min: 37.9, max: 38.6, hcp: 55 }, { min: 38.7, max: 39.4, hcp: 56 },
        { min: 39.5, max: 40.2, hcp: 57 }, { min: 40.3, max: 41.0, hcp: 58 }, { min: 41.1, max: 41.8, hcp: 59 },
        { min: 41.9, max: 42.5, hcp: 60 }, { min: 42.6, max: 43.3, hcp: 61 }, { min: 43.4, max: 44.1, hcp: 62 },
        { min: 44.2, max: 44.9, hcp: 63 }, { min: 45.0, max: 45.7, hcp: 64 }, { min: 45.8, max: 46.5, hcp: 65 },
        { min: 46.6, max: 47.3, hcp: 66 }, { min: 47.4, max: 48.1, hcp: 67 }, { min: 48.2, max: 48.9, hcp: 68 },
        { min: 49.0, max: 49.7, hcp: 69 }, { min: 49.8, max: 50.4, hcp: 70 }, { min: 50.5, max: 51.2, hcp: 71 },
        { min: 51.3, max: 52.0, hcp: 72 }, { min: 52.1, max: 52.8, hcp: 73 }, { min: 52.9, max: 53.6, hcp: 74 },
        { min: 53.7, max: 54.0, hcp: 75 }
    ],
    rd: [
        { min: -3.0, max: -2.3, hcp: 0 }, { min: -2.2, max: -1.5, hcp: 1 }, { min: -1.4, max: -0.6, hcp: 2 },
        { min: -0.5, max: 0.2, hcp: 3 }, { min: 0.3, max: 1.0, hcp: 4 }, { min: 1.1, max: 1.9, hcp: 5 },
        { min: 2.0, max: 2.7, hcp: 6 }, { min: 2.8, max: 3.5, hcp: 7 }, { min: 3.6, max: 4.4, hcp: 8 },
        { min: 4.5, max: 5.2, hcp: 9 }, { min: 5.3, max: 6.0, hcp: 10 }, { min: 6.1, max: 6.8, hcp: 11 },
        { min: 6.9, max: 7.7, hcp: 12 }, { min: 7.8, max: 8.5, hcp: 13 }, { min: 8.6, max: 9.3, hcp: 14 },
        { min: 9.4, max: 10.2, hcp: 15 }, { min: 10.3, max: 11.0, hcp: 16 }, { min: 11.1, max: 11.8, hcp: 17 },
        { min: 11.9, max: 12.7, hcp: 18 }, { min: 12.8, max: 13.5, hcp: 19 }, { min: 13.6, max: 14.3, hcp: 20 },
        { min: 14.4, max: 15.2, hcp: 21 }, { min: 15.3, max: 16.0, hcp: 22 }, { min: 16.1, max: 16.8, hcp: 23 },
        { min: 16.9, max: 17.6, hcp: 24 }, { min: 17.7, max: 18.5, hcp: 25 }, { min: 18.6, max: 19.3, hcp: 26 },
        { min: 19.4, max: 20.1, hcp: 27 }, { min: 20.2, max: 21.0, hcp: 28 }, { min: 21.1, max: 21.8, hcp: 29 },
        { min: 21.9, max: 22.6, hcp: 30 }, { min: 22.7, max: 23.5, hcp: 31 }, { min: 23.6, max: 24.3, hcp: 32 },
        { min: 24.4, max: 25.1, hcp: 33 }, { min: 25.2, max: 26.0, hcp: 34 }, { min: 26.1, max: 26.8, hcp: 35 },
        { min: 26.9, max: 27.6, hcp: 36 }, { min: 27.7, max: 28.4, hcp: 37 }, { min: 28.5, max: 29.3, hcp: 38 },
        { min: 29.4, max: 30.1, hcp: 39 }, { min: 30.2, max: 30.9, hcp: 40 }, { min: 31.0, max: 31.8, hcp: 41 },
        { min: 31.9, max: 32.6, hcp: 42 }, { min: 32.7, max: 33.4, hcp: 43 }, { min: 33.5, max: 34.3, hcp: 44 },
        { min: 34.4, max: 35.1, hcp: 45 }, { min: 35.2, max: 35.9, hcp: 46 }, { min: 36.0, max: 36.8, hcp: 47 },
        { min: 36.9, max: 37.6, hcp: 48 }, { min: 37.7, max: 38.4, hcp: 49 }, { min: 38.5, max: 39.3, hcp: 50 },
        { min: 39.4, max: 40.1, hcp: 51 }, { min: 40.2, max: 40.9, hcp: 52 }, { min: 41.0, max: 41.7, hcp: 53 },
        { min: 41.8, max: 42.6, hcp: 54 }, { min: 42.7, max: 43.4, hcp: 55 }, { min: 43.5, max: 44.2, hcp: 56 },
        { min: 44.3, max: 45.1, hcp: 57 }, { min: 45.2, max: 45.9, hcp: 58 }, { min: 46.0, max: 46.7, hcp: 59 },
        { min: 46.8, max: 47.6, hcp: 60 }, { min: 47.7, max: 48.4, hcp: 61 }, { min: 48.5, max: 49.2, hcp: 62 },
        { min: 49.3, max: 50.1, hcp: 63 }, { min: 50.2, max: 50.9, hcp: 64 }, { min: 51.0, max: 51.7, hcp: 65 },
        { min: 51.8, max: 52.5, hcp: 66 }, { min: 52.6, max: 53.4, hcp: 67 }, { min: 53.5, max: 54.0, hcp: 68 }
    ]
};

function getFieldHcp(exactHcp, teeCode, gender) {
    var parsed = parseExactHcp(exactHcp);
    gender = gender || 'men'; teeCode = teeCode || 'wh';

    if (gender === 'men' && PESTOVO_MEN_HCP_TABLE[teeCode]) {
        var list = PESTOVO_MEN_HCP_TABLE[teeCode];
        for (var i = 0; i < list.length; i++) {
            var r = list[i];
            if (parsed >= r.min - 0.001 && parsed <= r.max + 0.001) {
                return r.hcp;
            }
        }
    } else if (gender === 'women' && PESTOVO_WOMEN_HCP_TABLE[teeCode]) {
        var list = PESTOVO_WOMEN_HCP_TABLE[teeCode];
        for (var i = 0; i < list.length; i++) {
            var r = list[i];
            if (parsed >= r.min - 0.001 && parsed <= r.max + 0.001) {
                return r.hcp;
            }
        }
    }

    var rating = COURSE_RATINGS[gender] && COURSE_RATINGS[gender][teeCode];
    if (!rating) return Math.round(parsed);
    var field = (parsed * (rating.sr / 113)) + (rating.cr - TOTAL_PAR);
    return Math.round(field);
}

function generateHcpTable(gender, teeCode) {
    gender = gender || 'men'; teeCode = teeCode || 'wh';

    if (gender === 'men' && PESTOVO_MEN_HCP_TABLE[teeCode]) {
        return PESTOVO_MEN_HCP_TABLE[teeCode].map(function(r) {
            return [fmtExactHcp(r.min), fmtExactHcp(r.max), fmtFieldHcp(r.hcp)];
        });
    } else if (gender === 'women' && PESTOVO_WOMEN_HCP_TABLE[teeCode]) {
        return PESTOVO_WOMEN_HCP_TABLE[teeCode].map(function(r) {
            return [fmtExactHcp(r.min), fmtExactHcp(r.max), fmtFieldHcp(r.hcp)];
        });
    }

    var rating = COURSE_RATINGS[gender] && COURSE_RATINGS[gender][teeCode];
    if (!rating) return [];
    var rows = [];
    var maxPlus = -5.0;
    var maxHandicap = 54.0;

    var curStart = maxPlus;
    var curField = getFieldHcp(curStart, teeCode, gender);

    for (var x = -4.9; x <= maxHandicap + 0.05; x += 0.1) {
        var exactVal = Math.round(x * 10) / 10;
        var f = getFieldHcp(exactVal, teeCode, gender);
        if (f !== curField) {
            var prevExact = Math.round((exactVal - 0.1) * 10) / 10;
            rows.push([fmtExactHcp(curStart), fmtExactHcp(prevExact), fmtFieldHcp(curField)]);
            curStart = exactVal;
            curField = f;
        }
    }
    rows.push([fmtExactHcp(curStart), fmtExactHcp(maxHandicap), fmtFieldHcp(curField)]);
    return rows;
}

var HCP_TABLE = {
    get men() {
        return {
            bk: generateHcpTable('men', 'bk'),
            bl: generateHcpTable('men', 'bl'),
            wh: generateHcpTable('men', 'wh'),
            rd: generateHcpTable('men', 'rd')
        };
    },
    get women() {
        return {
            bl: generateHcpTable('women', 'bl'),
            wh: generateHcpTable('women', 'wh'),
            rd: generateHcpTable('women', 'rd')
        };
    }
};
if (typeof window !== 'undefined') {
    window.HCP_TABLE = HCP_TABLE;
}

// Кол-во ударов полевой форы (course handicap) на конкретной лунке.
// Фора раздаётся по индексам лунок: индекс 1 — самая сложная лунка, получает удар первой и т.д.
// fieldHcp = 18 -> по 1 удару на каждой лунке; 19 -> +доп. удар на лунке с индексом 1;
// отрицательная фора раздаётся с самой простой лунки (индекс 18).
function hcpStrokesOnHole(holeNum,fieldHcp){
    fieldHcp=parseInt(fieldHcp)||0;
    if(!fieldHcp)return 0;
    var idx=holeHcp(holeNum);
    if(!idx)return 0;
    if(fieldHcp>0){
        var n=Math.floor(fieldHcp/18);
        if(idx<=(fieldHcp%18))n++;
        return n;
    }
    var a=Math.abs(fieldHcp);
    var m=-Math.floor(a/18);
    if((19-idx)<=(a%18))m--;
    return m;
}

// Маленькие чёрточки-индикаторы ударов форы для квадратика с номером лунки.
function hcpStrokesMarksHTML(fieldHcp,holeNum){
    var n=hcpStrokesOnHole(holeNum,fieldHcp);
    if(!n)return '';
    var neg=n<0,cnt=Math.abs(n),bars=[];
    for(var i=0;i<cnt;i++)bars.push('<span class="hm-bar"></span>');
    var title;
    if(currentLang==='en'){
        title=cnt+(cnt===1?' handicap stroke':' handicap strokes')+(neg?' (given)':'');
    }else{
        title='Фора: '+cnt+' '+pluralN(cnt,'удар','удара','ударов')+(neg?' (минусовая)':'');
    }
    return '<span class="hcp-marks'+(neg?' hm-minus':'')+'" title="'+title+'">'+bars.join('')+'</span>';
}

function pluralN(n,one,few,many){
    var m10=n%10,m100=n%100;
    if(m10===1&&m100!==11)return one;
    if(m10>=2&&m10<=4&&(m100<10||m100>=20))return few;
    return many;
}

function stablefordField(strokes,holeNum,fieldHcp){
    if(!strokes||strokes<1)return 0;
    var par=holePar(holeNum),hcpIdx=holeHcp(holeNum),extra=0;
    if(fieldHcp>0&&hcpIdx>0){
        extra=Math.floor(fieldHcp/18);
        if(hcpIdx<=(fieldHcp%18))extra++;
    } else if(fieldHcp<0&&hcpIdx>0){
        var absHcp=Math.abs(fieldHcp);
        extra=-Math.floor(absHcp/18);
        if((19-hcpIdx)<=(absHcp%18))extra--;
    }
    var nett=strokes-extra,diff=nett-par;
    if(diff<=-3)return 5;if(diff===-2)return 4;if(diff===-1)return 3;if(diff===0)return 2;if(diff===1)return 1;return 0;
}

function stablefordExact(strokes,holeNum,exactHcp){
    if(!strokes||strokes<1)return 0;
    var par=holePar(holeNum),hcpIdx=holeHcp(holeNum),hcp=Math.round(parseExactHcp(exactHcp)||0),extra=0;
    if(hcp>0&&hcpIdx>0){
        extra=Math.floor(hcp/18);
        if(hcpIdx<=(hcp%18))extra++;
    } else if(hcp<0&&hcpIdx>0){
        var absHcp=Math.abs(hcp);
        extra=-Math.floor(absHcp/18);
        if((19-hcpIdx)<=(absHcp%18))extra--;
    }
    var nett=strokes-extra,diff=nett-par;
    if(diff<=-3)return 5;if(diff===-2)return 4;if(diff===-1)return 3;if(diff===0)return 2;if(diff===1)return 1;return 0;
}

// Настройка отображения очков Stableford. Если игрок ещё не выбрал своё
// значение, используется клубный дефолт из settings/stableford_display_default.
// Дефолт включён: новая подсказка сразу доступна в карточке, но каждый игрок
// может сохранить собственный выбор в текущем раунде.
var pestovoStablefordDisplayDefault = true;

function normalizeStablefordDisplayValue(value) {
    if (value === true || value === 1 || value === '1' || value === 'true') return true;
    if (value === false || value === 0 || value === '0' || value === 'false') return false;
    return null;
}

function isStablefordDisplayDefaultEnabled() {
    return pestovoStablefordDisplayDefault !== false;
}

function isPlayerStablefordDisplayEnabled(player) {
    var personalValue = player && normalizeStablefordDisplayValue(player.stablefordDisplay);
    return personalValue === null ? isStablefordDisplayDefaultEnabled() : personalValue;
}

function stablefordPointsText(points) {
    points = Math.max(0, parseInt(points) || 0);
    if (currentLang === 'en') {
        return points + ' Stableford ' + (points === 1 ? 'point' : 'points');
    }
    return points + ' ' + pluralN(points, 'очко', 'очка', 'очков') + ' Stableford';
}

// Разметка крупного счёта: gross остаётся главным, а очки отображаются рядом,
// например: 4 (3 очка Stableford). Используется в каждом экране ввода счёта.
function scoreWithStablefordHTML(score, holeNum, fieldHcp, showStableford) {
    var gross = parseInt(score) || 0;
    if (gross < 1) return '—';
    var html = '<span class="score-gross">' + gross + '</span>';
    if (showStableford) {
        var points = stablefordField(gross, holeNum, fieldHcp || 0);
        var label = stablefordPointsText(points);
        html += '<span class="score-stableford-points" aria-label="' + label + '">(' + label + ')</span>';
    }
    return html;
}

function syncStablefordDisplayDefault(value) {
    var normalized = normalizeStablefordDisplayValue(value);
    // Отсутствующий ключ — включённый дефолт для обратной совместимости.
    pestovoStablefordDisplayDefault = normalized === null ? true : normalized;
    try {
        document.dispatchEvent(new CustomEvent('pestovo-stableford-default-change'));
    } catch (e) {}
}

function calcNettScore(strokes,par,hcpIdx,fieldHcp){
    if(!strokes||strokes<1)return 0;
    var extra=0;
    if(fieldHcp>0&&hcpIdx>0){
        extra=Math.floor(fieldHcp/18);
        if(hcpIdx<=(fieldHcp%18))extra++;
    } else if(fieldHcp<0&&hcpIdx>0){
        var absHcp=Math.abs(fieldHcp);
        extra=-Math.floor(absHcp/18);
        if((19-hcpIdx)<=(absHcp%18))extra--;
    }
    return strokes-extra;
}

function calcRoundStats(scores,fieldHcp,exactHcp,holesOrder){
    holesOrder=holesOrder||[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];
    var played=[],remaining=[],gross=0,parPlayed=0,netTotal=0,stblField=0,stblExact=0;
    var birdies=0,eagles=0,pars=0,bogeys=0,doubles=0,hio=0,currentHole=null;

    for(var i=0;i<holesOrder.length;i++){
        var h=holesOrder[i],s=scores[h]?parseInt(scores[h]):0,par=holePar(h);
        if(s>=1){
            played.push(h);gross+=s;parPlayed+=par;
            netTotal+=calcNettScore(s,par,holeHcp(h),fieldHcp||0);
            var diff=s-par;
            if(diff<=-2)eagles++;else if(diff===-1)birdies++;else if(diff===0)pars++;else if(diff===1)bogeys++;else doubles++;
            if(s===1)hio++;
            stblField+=stablefordField(s,h,fieldHcp||0);
            stblExact+=stablefordExact(s,h,exactHcp||0);
        }else{
            remaining.push(h);
            if(currentHole===null)currentHole=h;
        }
    }
    var toPar=played.length>0?gross-parPlayed:null;
    var netToPar=played.length>0?netTotal-parPlayed:null;
    var projected=played.length>0?gross+(TOTAL_PAR-parPlayed):null;
    return{played:played,remaining:remaining,holesPlayed:played.length,holesRemaining:remaining.length,currentHole:currentHole,gross:gross,parPlayed:parPlayed,toPar:toPar,net:netTotal,netToPar:netToPar,projected:projected,stablefordField:stblField,stablefordExact:stblExact,birdies:birdies,eagles:eagles,pars:pars,bogeys:bogeys,doubles:doubles,holeInOne:hio};
}

// ==========================================
// СЧЁТНАЯ КАРТОЧКА: ВКЛАДКИ ДЕВЯТОК, НАКОПИТЕЛЬНЫЙ TO-PAR,
// ПОДСВЕТКА ТЕКУЩЕЙ ЛУНКИ И БЫСТРЫЙ ПЕРЕХОД К НЕЙ
// ==========================================

// Активная вкладка карточки: 'front' | 'back' | 'all'. Состояние общее для всех
// карточек на странице и запоминается в localStorage, поэтому перерисовка
// блоков в реальном времени не сбрасывает выбранный вид.
var scorecardView = (function() {
    var v = null;
    try { v = localStorage.getItem('pestovo_sc_view'); } catch (e) {}
    return (v === 'front' || v === 'back') ? v : 'all';
})();

function holeNineClass(h) { return h <= 9 ? 'sc-h-front' : 'sc-h-back'; }

function setScorecardView(view) {
    scorecardView = (view === 'front' || view === 'back') ? view : 'all';
    try { localStorage.setItem('pestovo_sc_view', scorecardView); } catch (e) {}

    var wraps = document.querySelectorAll('.sc-tabs-wrap');
    for (var i = 0; i < wraps.length; i++) {
        // Карточки без вкладок (раунды на 9 лунок) не переключаем: иначе
        // фильтр по девятке спрятал бы все их лунки.
        if (!wraps[i].querySelector('.sc-tabs')) continue;
        wraps[i].setAttribute('data-view', scorecardView);
    }
    var btns = document.querySelectorAll('.sc-tab');
    for (var j = 0; j < btns.length; j++) {
        var isActive = btns[j].getAttribute('data-sc-view') === scorecardView;
        btns[j].classList.toggle('active', isActive);
        btns[j].setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
    if (typeof vib === 'function') vib(10);
}

// Вкладки доступны только для полных раундов: у девятки фильтр по девятке
// спрятал бы все лунки, поэтому для таких карточек всегда показываем всё.
function scorecardViewFor(frontCount, backCount) {
    return (frontCount && backCount) ? scorecardView : 'all';
}

// Вкладки «Первые 9 / Вторые 9 / Все 18» — рисуются только для полных раундов,
// где есть обе девятки.
function buildScorecardTabsHTML(frontCount, backCount) {
    if (!frontCount || !backCount) return '';
    var tabs = [
        { key: 'front', label: t('sc_tab_front') },
        { key: 'back', label: t('sc_tab_back') },
        { key: 'all', label: t('sc_tab_all') }
    ];
    var html = '<div class="sc-tabs" role="tablist">';
    tabs.forEach(function(tb) {
        var isActive = scorecardView === tb.key;
        html += '<button type="button" role="tab" class="sc-tab' + (isActive ? ' active' : '') + '" data-sc-view="' + tb.key + '" ' +
            'aria-selected="' + (isActive ? 'true' : 'false') + '" onclick="setScorecardView(\'' + tb.key + '\')">' +
            tb.label + '</button>';
    });
    html += '</div>';
    return html;
}

// Строка накопительного to-par: под каждой лункой итог относительно пара
// на момент её завершения. startRun позволяет продолжить счёт со второй девятки.
function buildToParRowHTML(order, sc, startRun, gridClass, wrapClass) {
    var run = startRun || 0;
    var playedAny = false;
    var cells = '';

    order.forEach(function(i) {
        var s = parseInt(sc[i]) || 0;
        var cls = 'sc-tp-none';
        var txt = '·';
        if (s >= 1) {
            playedAny = true;
            run += s - holePar(i);
            cls = run < 0 ? 'sc-tp-under' : (run > 0 ? 'sc-tp-over' : 'sc-tp-even');
            txt = run > 0 ? '+' + run : (run === 0 ? 'E' : '' + run);
        }
        var title = currentLang === 'en'
            ? 'Hole #' + i + (s >= 1 ? ': ' + s + ' (par ' + holePar(i) + ') — to-par after the hole: ' + fmtScore(run) : ': not played yet')
            : 'Лунка #' + i + (s >= 1 ? ': ' + s + ' (пар ' + holePar(i) + ') — to-par после лунки: ' + fmtScore(run) : ': ещё не сыграна');
        cells += '<span class="sc-topar-cell ' + cls + ' ' + holeNineClass(i) + '" title="' + title + '">' + txt + '</span>';
    });

    if (!playedAny) return { html: '', run: run };

    var html = '<div class="sc-topar ' + (wrapClass || '') + '">' +
        '<div class="sc-topar-lbl"><i class="fas fa-chart-line"></i> ' + t('sc_topar_lbl') + ': <b>' + fmtScore(run) + '</b></div>' +
        '<div class="' + (gridClass || 'noscroll-grid') + ' sc-topar-row">' + cells + '</div>' +
        '</div>';
    return { html: html, run: run };
}

// Переход к текущей лунке игрока: плитка подсвечивается и прокручивается в центр экрана.
function scrollToPlayerCurrentHole(pid) {
    var tile = document.querySelector('.sc-cur-tile[data-sc-player="' + pid + '"]');
    if (!tile) {
        if (typeof toast === 'function') toast(t('no_current_hole'), 'info');
        return;
    }
    // Если лунка скрыта выбранной вкладкой — сначала показываем все 18
    if (scorecardView !== 'all' && tile.offsetParent === null) setScorecardView('all');
    if (typeof tile.scrollIntoView === 'function') {
        tile.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
    tile.classList.add('sc-cur-flash');
    setTimeout(function() { tile.classList.remove('sc-cur-flash'); }, 1800);
}

function generateGroupHoleTableHTML(r) {
    var players = r.players || {};
    var playerEntries = Object.entries(players).filter(function(pe) {
        // Удалённые и навсегда заблокированные демо-игроки не показываются
        return !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(pe[0], pe[1] && pe[1].name));
    });
    if (!playerEntries.length) return '';

    var order = getRoundOrder(r);
    var holeCount = order.length;
    var frontCount = order.filter(function(h) { return h <= 9; }).length;
    var backCount = holeCount - frontCount;

    // --- NO-SCROLL VERTICAL GRID MATRIX (100% FIT ON MOBILE SCREENS) ---
    var html = '<div class="no-scroll-view-container">';
    var courseHcpLbl = t('field_hcp_short');

    playerEntries.forEach(function(pe) {
        var pid = pe[0], p = pe[1];
        var sc = p.scores || {};
        var fieldHcp = p.fieldHcp !== undefined ? p.fieldHcp : 0;
        var stats = calcRoundStats(sc, fieldHcp || 0, p.exactHcp || 0, order);
        var thruText = stats.holesPlayed >= holeCount ? t('finished_f') : (stats.currentHole ? t('hole') + ' №' + stats.currentHole : '');

        var pTee = (p && p.tee) || r.tee || 'wh';
        var pTeeBadge = '<span class="tee-pill tee-' + pTee + '" style="font-size:9.5px;padding:1px 7px;margin-left:6px;vertical-align:middle;">' + t('tee_' + pTee) + '</span>';
        var pHcpBadge = '<span class="hcp-chip ' + fieldHcpBandClass(fieldHcp) + '" title="' + fieldHcpBandTitle(fieldHcp) + '">' + courseHcpLbl + ' ' + fmtFieldHcp(fieldHcp) + '</span>';

        var isFinished = stats.holesPlayed >= holeCount;
        var curHole = isFinished ? null : stats.currentHole;

        html += '<div class="noscroll-player-block" onclick="openPlayerProfileModal(\'' + pid + '\',\'' + (r.roundId || '') + '\')" style="cursor:pointer;">';
        html += '<div class="noscroll-player-hdr">';
        html += '<div><span class="noscroll-player-name"><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + escapeHtml(p.name || '—') + pTeeBadge + pHcpBadge + '</span>';
        html += '<div style="font-size:11px;color:var(--muted);margin-top:2px;">📍 ' + thruText + ' · Gross: ' + (stats.gross || 0) + '</div>';
        // Быстрый переход к лунке, на которой игрок стоит прямо сейчас
        if (curHole) {
            html += '<button type="button" class="sc-to-cur-btn" onclick="event.stopPropagation();scrollToPlayerCurrentHole(\'' + pid + '\')">' +
                '<i class="fas fa-location-crosshairs"></i> ' + t('to_current_hole') + ' · #' + curHole + '</button>';
        }
        html += '</div>';
        html += '<div class="' + scoreClass(stats.toPar) + '" style="font-size:22px;font-weight:800;">' + fmtScore(stats.toPar) + '</div>';
        html += '</div>';

        // Вкладки «Первые 9 / Вторые 9 / Все 18» + матрица лунок
        html += '<div class="sc-tabs-wrap" data-view="' + scorecardViewFor(frontCount, backCount) + '">';
        html += buildScorecardTabsHTML(frontCount, backCount);

        // Hole matrix (9 or 18 holes): фора + № лунки, счёт, индекс, очки Stableford
        html += '<div class="noscroll-grid">';
        order.forEach(function(i) {
            var s = parseInt(sc[i]) || 0;
            var par = holePar(i);
            var cls = holeResClass(s, par) + ' ' + holeNineClass(i);
            // Несовпадение с маркером — ячейка мигает серым, чтобы игроки видели расхождение
            if (getHoleVerifyState(p, i) === 'mismatch') cls += ' cell-mismatch';
            // Текущая лунка игрока — золотая рамка и пульсация
            var isCur = (curHole !== null && i === curHole);
            if (isCur) cls += ' sc-cur-tile';
            var stbl = s > 0 ? stablefordField(s, i, fieldHcp) : null;
            var stblTitle = currentLang === 'en'
                ? (stbl !== null ? stbl + ' Stableford ' + (stbl === 1 ? 'point' : 'points') : 'No Stableford points yet')
                : (stbl !== null ? 'Очки Stableford: ' + stbl : 'Очков Stableford пока нет');
            if (isCur) {
                stblTitle = (currentLang === 'en' ? 'Current hole. ' : 'Текущая лунка. ') + stblTitle;
            }

            html += '<div class="noscroll-tile ' + cls + '" title="' + stblTitle + '" data-sc-player="' + pid + '" data-sc-hole="' + i + '"' + (isCur ? ' data-sc-current="1"' : '') + '>';
            html += '<div class="noscroll-hole"><span>#' + i + '</span>' + hcpStrokesMarksHTML(fieldHcp, i) + '</div>';
            html += '<div class="noscroll-score">' + (s > 0 ? s : '—') + '</div>';
            html += '<div class="noscroll-tile-bot"><span class="noscroll-idx">idx ' + holeHcp(i) + '</span><span class="noscroll-stbl">' + (stbl !== null ? stbl + ' pt' : '—') + '</span></div>';
            html += '</div>';
        });
        html += '</div>';

        // Накопительный to-par по ходу раунда (строка под плитками)
        html += buildToParRowHTML(order, sc, 0, 'noscroll-grid').html;

        html += '</div>'; // /sc-tabs-wrap

        // Totals
        var totG = 0, parTotal = 0;
        order.forEach(function(i) { var s = parseInt(sc[i]) || 0; if (s > 0) totG += s; parTotal += holePar(i); });

        html += '<div class="noscroll-totals">';
        html += '<span>' + (currentLang === 'en' ? 'Holes' : 'Лунки') + ': <b>' + stats.holesPlayed + '/' + holeCount + '</b></span>';
        html += '<span>' + t('par') + ': <b>' + parTotal + '</b></span>';
        html += '<span>' + t('total') + ': <b>' + (totG > 0 ? totG : '—') + '</b></span>';
        html += '</div>';

        html += '</div>';
    });

    html += '</div>';

    return html;
}

// ==========================================
// УНИВЕРСАЛЬНОЕ МОДАЛЬНОЕ ОКНО ПРОФИЛЯ И СЧЁТНОЙ КАРТОЧКИ
// ==========================================
function openPlayerProfileModal(playerId, roundId) {
    var modalEl = document.getElementById('pmodal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'pmodal';
        modalEl.className = 'modal hidden';
        modalEl.innerHTML =
            '<div class="modal-bg" onclick="closePModal()"></div>' +
            '<div class="modal-body">' +
            '<div class="modal-top-bar">' +
            '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closePModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
            '<button type="button" class="modal-close-btn" onclick="closePModal()">&times;</button>' +
            '</div>' +
            '<div id="pmodal-body"><div class="loading"><div class="spinner"></div></div></div>' +
            '</div>';
        if (document.body) document.body.appendChild(modalEl);
    }

    var bodyEl = document.getElementById('pmodal-body');
    if (bodyEl) bodyEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    modalEl.classList.remove('hidden');

    if (typeof db === 'undefined') return;

    var userPromise = db.ref('users/' + playerId).once('value').then(function(sn) { return sn.val(); }).catch(function() { return null; });
    var roundPromise = roundId ? db.ref('rounds/' + roundId).once('value').then(function(sn) { return sn.val(); }).catch(function() { return null; }) : Promise.resolve(null);

    Promise.all([userPromise, roundPromise]).then(function(res) {
        var u = res[0];
        var rd = res[1];

        if (!u && rd && rd.players && rd.players[playerId]) {
            var p = rd.players[playerId];
            u = {
                name: p.name || t('guest'),
                handicap: p.exactHcp || null,
                gender: p.gender || 'men',
                isGuest: true,
                roundsPlayed: 1
            };
        }

        if (!u) {
            if (bodyEl) bodyEl.innerHTML = '<p style="color:var(--muted);text-align:center;padding:30px;">' + (currentLang === 'en' ? 'Player profile not found' : 'Профиль игрока не найден') + '</p>';
            return;
        }

        var isMe = (currentUser && currentUser.uid === playerId);
        var gIcon = u.gender === 'women' ? '👩' : '👨';
        var guestBadge = u.isGuest ? '<span style="background:rgba(201,168,76,0.15);color:var(--gold);padding:2px 8px;border-radius:12px;font-size:10px;margin-left:6px;">' + t('guest') + '</span>' : '';

        var roundsWord = currentLang === 'en' ? 'rounds' : 'раундов';
        var teePillMarkup = u.defaultTee ? fmtTeePill(u.defaultTee) : '';

        var html = '<div class="profile-head" style="margin-bottom:16px;">';
        html += fmtUserAvatar(u, 80);
        html += '<div style="flex:1;"><div class="profile-name">' + gIcon + ' ' + escapeHtml(privacyDisplayName(u, playerId)) + guestBadge + '</div>';
        html += '<div class="profile-meta">';
        html += '<span><i class="fas fa-golf-ball"></i> HCP: ' + (u.handicap != null ? fmtExactHcp(u.handicap) : '—') + '</span>';
        if (teePillMarkup) html += '<span><i class="fas fa-golf-ball-tee"></i> Tee: ' + teePillMarkup + '</span>';
        html += '<span><i class="fas fa-flag"></i> ' + (u.roundsPlayed || 0) + ' ' + roundsWord + '</span>';
        var hTag = currentLang === 'en' ? 'h' : 'л';
        if (u.bestGross) html += '<span><i class="fas fa-trophy"></i> Gross (18' + hTag + '): ' + u.bestGross + '</span>';
        html += '</div>';

        if (isMe) {
            html += '<button class="btn btn-og btn-sm" style="margin-top:10px;" onclick="renderProfileEditForm(\'' + playerId + '\')"><i class="fas fa-user-pen"></i> ' + t('edit_profile') + '</button>';
        }

        html += '</div></div>';

        if (rd && rd.players && rd.players[playerId]) {
            var roundPlayer = rd.players[playerId];
            var roundPlayerTee = (roundPlayer && roundPlayer.tee) || (rd && rd.tee) || 'wh';
            html += '<div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border);">';
            html += '<h3 style="color:var(--gold);margin-bottom:14px;font-family:var(--ff);font-size:18px;">' +
                    '<i class="fas fa-table"></i> ' + (currentLang === 'en' ? 'Round Scorecard' : 'Счётная карточка раунда') + ' (' + (rd.format || 'Stroke') + ' · ' + t('tee_select') + ': ' + fmtTeePill(roundPlayerTee) + ')' +
                    '</h3>';
            
            if (typeof generatePestovoScorecardHTML === 'function') {
                html += generatePestovoScorecardHTML(roundPlayer, rd);
            }
            html += '</div>';
        }

        db.ref('users/' + playerId + '/history').once('value').then(function(hSn) {
            var history = hSn.val() || {};
            var entries = Object.entries(history);
            entries.sort(function(a, b) { return (b[1].date || 0) - (a[1].date || 0); });

            if (entries.length > 0) {
                var roundsList = entries.map(function(e) { return Object.assign({}, e[1], { _key: e[0] }); });
                html += renderTrophyCabinet(u, roundsList);
                html += renderScoringDistributionBar(roundsList);

                html += '<h3 style="color:var(--gold);margin:24px 0 12px;font-family:var(--ff);font-size:18px;"><i class="fas fa-history"></i> ' + t('round_history') + ' (' + entries.length + ')</h3>';

                entries.forEach(function(entry, idx) {
                    var hKey = entry[0];
                    var r = entry[1];
                    var cardId = 'pr-card-' + idx;
                    var btnTxtId = 'pr-btn-txt-' + idx;
                    var btnIconId = 'pr-btn-icon-' + idx;

                    var isFull = r.holes === 18;
                    var fullTag = isFull ? ' <span style="color:#2ecc71;font-size:10px;font-weight:700;">(18' + hTag + ')</span>' : ' <span style="color:var(--muted);font-size:10px;">(' + (r.holes || 1) + hTag + ')</span>';

                    html += '<div class="card" style="padding:14px;margin-bottom:12px;border:1px solid var(--border);background:var(--card-bg);">';
                    
                    html += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">';
                    html += '<div style="flex:1;min-width:180px;">';
                    html += '<strong style="color:var(--white);font-size:15px;">' + t('brand_name') + '</strong>' + fullTag;
                    html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' +
                            fmtDate(r.date) + ' · ' + (r.format || 'Stroke') + ' · ' + t('tee_select') + ': ' + (r.tee ? fmtTeePill(r.tee) : '—') +
                            ' · ' + (r.mode === 'solo' ? '👤 Solo' : '👥 Group') + '</div>';
                    html += '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' +
                            (r.holeInOne ? '🎯 ' + r.holeInOne + ' · ' : '') +
                            '🦅 ' + (r.eagles || 0) + ' · 🐦 ' + (r.birdies || 0) + ' · Par ' + (r.pars || 0) + '</div></div>';

                    html += '<div style="text-align:right;">';
                    html += '<div style="font-size:22px;font-weight:800;color:var(--white);">' + r.gross + ' <span style="font-size:12px;color:var(--muted);font-weight:600;">Gross</span></div>';
                    html += '<div class="' + scoreClass(r.toPar) + '" style="font-size:14px;font-weight:700;">' + fmtScore(r.toPar) + '</div>';
                    html += '</div></div>';

                    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);flex-wrap:wrap;gap:8px;">';
                    html += '<button class="btn btn-og btn-sm" onclick="toggleProfileRoundCard(\'' + cardId + '\')"><i class="fas fa-chevron-down" id="' + btnIconId + '"></i> <span id="' + btnTxtId + '">' + (currentLang === 'en' ? 'Expand Scorecard' : 'Развернуть карточку') + '</span></button>';

                    var isAdminOrOwner = (currentUser && (currentUser.uid === playerId || (currentUserData && currentUserData.role === 'admin') || sessionStorage.getItem('pestovo_is_admin') === 'true'));
                    if (isAdminOrOwner) {
                        html += '<button class="btn btn-r btn-sm" onclick="deletePlayerHistoryRecord(\'' + playerId + '\', \'' + hKey + '\')" title="' + (currentLang === 'en' ? 'Delete Round' : 'Удалить из истории') + '"><i class="fas fa-trash"></i></button>';
                    }
                    html += '</div>';

                    html += '<div id="' + cardId + '" class="hidden" style="display:none;margin-top:12px;padding-top:12px;border-top:1px dashed var(--border);">';
                    
                    var pObj = {
                        name: u.name || 'Игрок',
                        scores: r.scores || {},
                        fieldHcp: r.fieldHcp || 0,
                        exactHcp: r.exactHcp || 0,
                        tee: r.tee || 'wh'
                    };
                    var rObj = {
                        tee: r.tee || 'wh',
                        format: r.format || 'Stroke Play',
                        holeRange: r.holeRange || '1-18',
                        startHole: r.startHole || 1,
                        completedAt: r.date
                    };

                    if (typeof generatePestovoScorecardHTML === 'function') {
                        html += generatePestovoScorecardHTML(pObj, rObj);
                    }

                    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">';
                    if (r.roundId) {
                        html += '<button class="btn btn-og btn-sm" onclick="openPrintScorecardModal(\'' + r.roundId + '\')"><i class="fas fa-print"></i> ' + (currentLang === 'en' ? 'Print (A4)' : 'Печать (A4)') + '</button>';
                        html += '<button class="btn btn-g btn-sm" onclick="exportRoundPNG(\'' + r.roundId + '\')"><i class="fas fa-image"></i> PNG</button>';
                    }
                    html += '</div>';

                    html += '</div></div>';
                });
            }

            if (bodyEl) bodyEl.innerHTML = html;
        }).catch(function() {
            if (bodyEl) bodyEl.innerHTML = html;
        });
    });
}

function toggleProfileRoundCard(cardId) {
    var card = document.getElementById(cardId);
    var btnTxt = document.getElementById(cardId.replace('pr-card-', 'pr-btn-txt-'));
    var icon = document.getElementById(cardId.replace('pr-card-', 'pr-btn-icon-'));
    if (!card) return;

    if (card.style.display === 'none' || card.classList.contains('hidden')) {
        card.style.display = 'block';
        card.classList.remove('hidden');
        if (btnTxt) btnTxt.textContent = currentLang === 'en' ? 'Collapse' : 'Свернуть карточку';
        if (icon) icon.className = 'fas fa-chevron-up';
    } else {
        card.style.display = 'none';
        card.classList.add('hidden');
        if (btnTxt) btnTxt.textContent = currentLang === 'en' ? 'Expand Scorecard' : 'Развернуть карточку';
        if (icon) icon.className = 'fas fa-chevron-down';
    }
}

function deletePlayerHistoryRecord(userId, historyKey) {
    if (!userId || !historyKey) return;
    var confirmMsg = currentLang === 'en' ? 'Delete this round from history?' : 'Удалить этот раунд из истории?';
    if (!confirm(confirmMsg)) return;

    db.ref('users/' + userId + '/history/' + historyKey).remove().then(function() {
        db.ref('users/' + userId + '/history').once('value').then(function(sn) {
            var history = sn.val() || {};
            var rounds = Object.values(history);
            var count = rounds.length;
            var bestG = null;
            var bestS = null;

            rounds.forEach(function(r) {
                if (r.holes === 18 && r.gross) {
                    if (bestG === null || r.gross < bestG) bestG = r.gross;
                }
                if (r.holes === 18 && r.stablefordField) {
                    if (bestS === null || r.stablefordField > bestS) bestS = r.stablefordField;
                }
            });

            db.ref('users/' + userId).update({
                roundsPlayed: count,
                bestGross: bestG,
                bestStableford: bestS
            });

            toast(currentLang === 'en' ? 'Round deleted from history' : 'Раунд удалён из истории', 'info');
            if (typeof vib === 'function') vib(30);
            if (typeof openPlayerProfileModal === 'function') openPlayerProfileModal(userId);
        });
    }).catch(function(err) {
        toast('⚠️ Ошибка: ' + err.message, 'error');
    });
}

function closePModal() {
    var modalEl = document.getElementById('pmodal');
    if (modalEl) modalEl.classList.add('hidden');
}

// ==========================================
// ФОРМА РЕДАКТИРОВАНИЯ И КАСТОМИЗАЦИИ ПРОФИЛЯ
// ==========================================
function renderProfileEditForm(playerId) {
    var bodyEl = document.getElementById('pmodal-body');
    if (!bodyEl || typeof db === 'undefined') return;

    db.ref('users/' + playerId).once('value').then(function(sn) {
        var u = sn.val() || {};

        var firstName = u.firstName || (u.name ? u.name.split(' ')[0] : '');
        var lastName = u.lastName || (u.name ? u.name.split(' ').slice(1).join(' ') : '');
        var middleName = u.middleName || '';
        var phone = u.phone || '';
        var hcp = u.handicap != null ? fmtExactHcp(u.handicap) : '';
        var gender = u.gender || 'men';
        var defaultTee = u.defaultTee || 'wh';
        var currentAvatar = u.avatar || '';

        var html = '<h2 style="color:var(--gold);margin-bottom:16px;"><i class="fas fa-user-gear"></i> ' + t('edit_profile') + '</h2>';

        // Avatar Section
        html += '<div class="form-group"><label><i class="fas fa-image"></i> ' + t('avatar_label') + '</label>';
        html += '<div style="display:flex;align-items:center;gap:16px;margin:10px 0;flex-wrap:wrap;">';
        html += '<div id="edit-avatar-preview">' + fmtUserAvatar(u, 64) + '</div>';
        html += '<input type="file" id="edit-avatar-file" accept="image/*" style="display:none;" onchange="onAvatarFileSelected(this)">';
        html += '<button type="button" class="btn btn-og btn-sm" onclick="document.getElementById(\'edit-avatar-file\').click()"><i class="fas fa-upload"></i> ' + t('upload_photo') + '</button>';
        html += '</div>';

        // Presets
        html += '<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">' + t('choose_preset') + ':</div>';
        html += '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">';
        var presets = ['⛳', '🏆', '🦅', '👑', '⭐', '👤'];
        presets.forEach(function(icon) {
            html += '<button type="button" class="preset-avatar-btn" onclick="selectPresetAvatar(\'' + icon + '\')">' + icon + '</button>';
        });
        html += '</div></div>';

        // Form Inputs
        html += '<div class="form-row">';
        html += '<div class="form-group"><label>' + t('first_name') + '</label><input type="text" id="edit-fn" class="form-input" value="' + escapeHtml(firstName) + '"></div>';
        html += '<div class="form-group"><label>' + t('last_name') + '</label><input type="text" id="edit-ln" class="form-input" value="' + escapeHtml(lastName) + '"></div>';
        html += '</div>';
        html += '<div class="form-row">';
        html += '<div class="form-group"><label>' + t('middle_name') + '</label><input type="text" id="edit-mid" class="form-input" value="' + escapeHtml(middleName) + '" placeholder="' + (currentLang === 'en' ? 'Middle name (optional)' : 'Отчество (необязательно)') + '"></div>';
        html += '</div>';

        html += '<div class="form-row">';
        html += '<div class="form-group"><label>' + t('exact_hcp') + '</label><input type="text" id="edit-hcp" class="form-input" value="' + hcp + '" placeholder="+2.4 / 12.4"></div>';
        html += '<div class="form-group"><label>' + t('gender_label') + '</label><select id="edit-gender" class="form-input">' +
                '<option value="men" ' + (gender === 'men' ? 'selected' : '') + '>' + t('men') + '</option>' +
                '<option value="women" ' + (gender === 'women' ? 'selected' : '') + '>' + t('women') + '</option>' +
                '</select></div>';
        html += '</div>';

        html += '<div class="form-row">';
        html += '<div class="form-group"><label>' + t('phone_label') + '</label><input type="text" id="edit-phone" class="form-input" value="' + phone + '" placeholder="+7 (999) 000-00-00"></div>';
        html += '<div class="form-group"><label>' + t('default_tee') + '</label><select id="edit-tee" class="form-input">' +
                '<option value="bk" ' + (defaultTee === 'bk' ? 'selected' : '') + '>⬛ ' + t('tee_bk') + '</option>' +
                '<option value="bl" ' + (defaultTee === 'bl' ? 'selected' : '') + '>🟦 ' + t('tee_bl') + '</option>' +
                '<option value="wh" ' + (defaultTee === 'wh' ? 'selected' : '') + '>⬜ ' + t('tee_wh') + '</option>' +
                '<option value="rd" ' + (defaultTee === 'rd' ? 'selected' : '') + '>🟥 ' + t('tee_rd') + '</option>' +
                '</select></div>';
        html += '</div>';

        html += '<input type="hidden" id="edit-avatar-val" value="' + currentAvatar + '">';

        html += '<div style="display:flex;gap:12px;margin-top:20px;">';
        html += '<button type="button" class="btn btn-og" style="flex:1;" onclick="openPlayerProfileModal(\'' + playerId + '\')">' + t('cancel_btn') + '</button>';
        html += '<button type="button" class="btn btn-g" style="flex:1;" onclick="saveUserProfileData(\'' + playerId + '\')"><i class="fas fa-save"></i> ' + t('save_profile') + '</button>';
        html += '</div>';

        bodyEl.innerHTML = html;
    });
}

function selectPresetAvatar(icon) {
    var valEl = document.getElementById('edit-avatar-val');
    if (valEl) valEl.value = icon;
    var preview = document.getElementById('edit-avatar-preview');
    if (preview) preview.innerHTML = fmtUserAvatar({ avatar: icon, name: 'User' }, 64);
}

function onAvatarFileSelected(inp) {
    handleAvatarFileUpload(inp, function(dataUrl) {
        var valEl = document.getElementById('edit-avatar-val');
        if (valEl) valEl.value = dataUrl;
        var preview = document.getElementById('edit-avatar-preview');
        if (preview) preview.innerHTML = fmtUserAvatar({ avatar: dataUrl, name: 'User' }, 64);
    });
}

function saveUserProfileData(playerId) {
    var fnInp = document.getElementById('edit-fn');
    var lnInp = document.getElementById('edit-ln');
    var midInp = document.getElementById('edit-mid');
    var hcpInp = document.getElementById('edit-hcp');
    var genderInp = document.getElementById('edit-gender');
    var phoneInp = document.getElementById('edit-phone');
    var teeInp = document.getElementById('edit-tee');
    var avatarInp = document.getElementById('edit-avatar-val');

    var firstName = fnInp ? sanitizeNameRaw(fnInp.value) : '';
    var middleName = midInp ? sanitizeNameRaw(midInp.value) : '';
    var lastName = lnInp ? sanitizeNameRaw(lnInp.value) : '';
    // Полное имя: «Имя [Отчество] Фамилия»
    var fullName = ((firstName + ' ' + (middleName ? middleName + ' ' : '')) + lastName).trim() || 'Player';
    var exactHcp = hcpInp ? parseExactHcp(hcpInp.value) : 0;
    var gender = genderInp ? genderInp.value : 'men';
    var phone = phoneInp ? phoneInp.value.trim().replace(/[^\d+\-() ]/g, '').substring(0, 20) : '';
    var defaultTee = teeInp ? teeInp.value : 'wh';
    var avatar = avatarInp ? avatarInp.value : '';

    var updates = {
        name: fullName,
        firstName: firstName,
        middleName: middleName || null,
        lastName: lastName,
        handicap: exactHcp,
        gender: gender,
        phone: phone,
        defaultTee: defaultTee,
        avatar: avatar
    };

    db.ref('users/' + playerId).update(updates).then(function() {
        if (currentUserData) {
            Object.assign(currentUserData, updates);
        }
        toast(t('msg_profile_saved'), 'success');
        openPlayerProfileModal(playerId);
        if (typeof loadPlayers === 'function') loadPlayers();
        if (typeof loadLB === 'function') loadLB();
    });
}

// ==========================================
// МОДАЛЬНОЕ ОКНО ПОДТВЕРЖДЕНИЯ ЗАВЕРШЕНИЯ РАУНДА
// ==========================================
function openFinishConfirmModal(roundId, onConfirmCallback, onCloseCallback) {
    if (typeof db === 'undefined' || !roundId) return;
    window._pestovoFinishModalOnClose = (typeof onCloseCallback === 'function') ? onCloseCallback : null;

    db.ref('rounds/' + roundId).once('value').then(function(sn) {
        var r = sn.val();
        if (!r) return;

        var modalEl = document.getElementById('finish-modal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'finish-modal';
            modalEl.className = 'modal hidden';
            modalEl.innerHTML =
                '<div class="modal-bg" onclick="closeFinishModal()"></div>' +
                '<div class="modal-body" style="max-width:560px;">' +
                '<div class="modal-top-bar">' +
                '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closeFinishModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
                '<button type="button" class="modal-close-btn" onclick="closeFinishModal()">&times;</button>' +
                '</div>' +
                '<div id="finish-modal-body"></div>' +
                '</div>';
            if (document.body) document.body.appendChild(modalEl);
        }

        var bodyEl = document.getElementById('finish-modal-body');
        var order = getRoundOrder(r);
        var holeCount = order.length;
        var players = Object.entries(r.players || {}).filter(function(pe) {
            // Удалённые и навсегда заблокированные демо-игроки не показываются
            return !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(pe[0], pe[1] && pe[1].name));
        });
        var verification = collectRoundVerification(r);

        var titleStr = currentLang === 'en' ? '🏁 Finish Round Confirmation' : '🏁 Подтверждение завершения раунда';
        var subStr = currentLang === 'en' ? 'Please review final scores before finishing:' : 'Пожалуйста, проверьте итоговые результаты перед завершением:';
        var finishBtnStr = currentLang === 'en' ? '🏁 Finish & Save Round' : '🏁 Завершить раунд';
        var continueBtnStr = currentLang === 'en' ? '← Continue Playing' : '← Продолжить игру';

        var html = '<h2 style="color:var(--gold);font-family:var(--ff);margin-bottom:6px;">' + titleStr + '</h2>';
        html += '<p style="font-size:13px;color:var(--muted);margin-bottom:20px;">' + subStr + '</p>';

        players.forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order);

            html += '<div class="list-item" style="padding:14px;margin-bottom:10px;flex-wrap:wrap;gap:8px;">';
            html += '<div style="flex:1;"><strong style="color:var(--white);font-size:15px;"><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + escapeHtml(p.name || '—') + '</strong>';
            html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + t('hole') + 's: ' + stats.holesPlayed + ' / ' + holeCount + ' · Gross: ' + (stats.gross || 0) + '</div></div>';
            html += '<div style="text-align:right;"><div class="' + scoreClass(stats.toPar) + '" style="font-weight:800;font-size:18px;">' + fmtScore(stats.toPar) + '</div></div>';
            html += '</div>';
        });

        if (!verification.canFinish) {
            html += '<div style="margin:16px 0;" id="finish-verification-report">' + buildVerificationReportHtml(verification) + '</div>';
            if (currentLang === 'en') {
                html += '<div class="timing-alert timing-late" style="margin-bottom:4px;"><i class="fas fa-ban"></i><div><strong>The round cannot be finished until all scores are confirmed and matches are resolved.</strong></div></div>';
            } else {
                html += '<div class="timing-alert timing-late" style="margin-bottom:4px;"><i class="fas fa-ban"></i><div><strong>Раунд нельзя завершить, пока все счета не подтверждены и не устранены несовпадения.</strong></div></div>';
            }
        }

        html += '<div style="display:flex;gap:12px;margin-top:24px;flex-wrap:wrap;">';
        html += '<button class="btn btn-og" style="flex:1;" onclick="closeFinishModal()">' + continueBtnStr + '</button>';
        html += '<button class="btn btn-g" style="flex:1;" id="confirm-finish-btn">' + finishBtnStr + '</button>';
        html += '</div>';

        if (bodyEl) bodyEl.innerHTML = html;
        modalEl.classList.remove('hidden');

        var confirmBtn = document.getElementById('confirm-finish-btn');
        if (confirmBtn) {
            if (!verification.canFinish) {
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = '0.45';
                confirmBtn.style.cursor = 'not-allowed';
                confirmBtn.style.pointerEvents = 'none';
            } else {
                confirmBtn.onclick = function() {
                    closeFinishModal();
                    if (typeof onConfirmCallback === 'function') onConfirmCallback();
                };
            }
        }
    });
}

function closeFinishModal() {
    var modalEl = document.getElementById('finish-modal');
    if (modalEl) modalEl.classList.add('hidden');
    if (typeof window._pestovoFinishModalOnClose === 'function') {
        var cb = window._pestovoFinishModalOnClose;
        window._pestovoFinishModalOnClose = null;
        cb();
    }
}

// ==========================================
// СКОРКАРТА ПЕСТОВО (КАК НА ФОТО — 18 ЛУНОК)
// ==========================================
function generatePestovoScorecardHTML(player, roundData) {
    var p = player || {};
    var sc = p.scores || {};
    var fHcp = p.fieldHcp || 0;
    var eHcp = p.exactHcp || 0;
    var teeCode = (p && p.tee) || (roundData && roundData.tee) || 'wh';
    var fmt = (roundData && roundData.format) || 'Stroke Play';
    var date = fmtDate((roundData && (roundData.completedAt || roundData.createdAt)) || Date.now());

    var order = getRoundOrder(roundData);
    var holeRange = (roundData && roundData.holeRange) || '1-18';
    var front = order.filter(function(h){ return h <= 9; });
    var back = order.filter(function(h){ return h >= 10; });

    var pStats = calcRoundStats(sc, fHcp || 0, eHcp || 0, order);
    var pCurHole = pStats.holesPlayed >= order.length ? null : pStats.currentHole;

    var totG = 0, totS = 0, totPar = 0;
    order.forEach(function(i) {
        var s = parseInt(sc[i]) || 0;
        if (s > 0) {
            totG += s;
            totS += stablefordField(s, i, fHcp);
        }
        totPar += holePar(i);
    });

    var html = '<div class="pestovo-modern-scorecard">';

    // 1. Top HUD Header
    html += '<div class="msc-card-hdr">';
    html += '  <div class="msc-player-title"><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + escapeHtml(p.name || '—') + '</div>';
    html += '  <div class="msc-meta-pills">';
    html += '    <span class="msc-pill hcp-band ' + fieldHcpBandClass(fHcp) + '" title="' + fieldHcpBandTitle(fHcp) + '">HCP: <b>' + fmtExactHcp(eHcp) + '</b> (' + fmtFieldHcp(fHcp) + ')</span>';
    html += '    <span class="msc-pill">' + fmtTeePill(teeCode) + '</span>';
    html += '    <span class="msc-pill">' + fmt + ' · ' + holeRange + ' · ' + date + '</span>';
    html += '  </div>';
    html += '</div>';

    // Тайл лунки: фора (как при вводе счёта), номер лунки, счёт, индекс и очки Stableford.
    // Расстояние на тайле не показывается — карточка остаётся компактной без скроллов.
    var tileHTML = function(i) {
        var s = parseInt(sc[i]) || 0;
        var par = holePar(i);
        var hcp = holeHcp(i);
        var badgeCls = (s > 0 ? holeResClass(s, par) : '') + ' ' + holeNineClass(i);
        // Несовпадение с маркером — ячейка мигает серым, чтобы игроки видели расхождение
        if (getHoleVerifyState(p, i) === 'mismatch') badgeCls += ' cell-mismatch';
        // Текущая лунка игрока — золотая рамка и пульсация
        var isCur = (pCurHole !== null && i === pCurHole);
        if (isCur) badgeCls += ' sc-cur-tile';
        var stbl = s > 0 ? stablefordField(s, i, fHcp) : null;
        var stblTitle = currentLang === 'en'
            ? (stbl !== null ? stbl + ' Stableford ' + (stbl === 1 ? 'point' : 'points') : 'No Stableford points yet')
            : (stbl !== null ? 'Очки Stableford: ' + stbl : 'Очков Stableford пока нет');
        if (isCur) {
            stblTitle = (currentLang === 'en' ? 'Current hole. ' : 'Текущая лунка. ') + stblTitle;
        }

        var html = '<div class="msc-tile ' + badgeCls + '" title="' + stblTitle + '" data-sc-hole="' + i + '"' + (isCur ? ' data-sc-current="1"' : '') + '>';
        html += '  <div class="msc-tile-top"><span class="msc-hole-num">#' + i + '</span>' + hcpStrokesMarksHTML(fHcp, i) + '</div>';
        html += '  <div class="msc-tile-score">' + (s > 0 ? s : '—') + '</div>';
        html += '  <div class="msc-tile-bot"><span class="msc-hole-idx">idx ' + hcp + '</span><span class="msc-hole-stbl">' + (stbl !== null ? stbl + ' pt' : '—') + '</span></div>';
        html += '</div>';
        return html;
    };

    // Вкладки «Первые 9 / Вторые 9 / Все 18»: скрывают лишнюю девятку через CSS,
    // поэтому состояние не теряется при перерисовке карточки в реальном времени.
    html += '<div class="sc-tabs-wrap" data-view="' + scorecardViewFor(front.length, back.length) + '">';
    html += buildScorecardTabsHTML(front.length, back.length);

    var frontRun = 0;

    if (front.length) {
        var pOut = 0; front.forEach(function(i){ pOut += holePar(i); });
        html += '<div class="msc-sec-hdr sc-h-front"><span>FRONT 9 (OUT)</span> <span>Par ' + pOut + '</span></div>';
        html += '<div class="msc-tile-grid">';
        front.forEach(function(i) {
            html += tileHTML(i);
        });
        html += '</div>';
        var frontToPar = buildToParRowHTML(front, sc, 0, 'msc-tile-grid', 'sc-h-front');
        frontRun = frontToPar.run;
        html += frontToPar.html;
        var outG = 0, outS = 0;
        front.forEach(function(i){ var s=parseInt(sc[i])||0; if(s>0){ outG+=s; outS+=stablefordField(s,i,fHcp);} });
        html += '<div class="msc-totals-strip sc-h-front">';
        html += '  <span>OUT: <b>' + (outG > 0 ? outG : '—') + '</b></span>';
        html += '  <span>Stbl: <b>' + outS + 'p</b></span>';
        html += '</div>';
    }

    if (back.length) {
        var pIn = 0; back.forEach(function(i){ pIn += holePar(i); });
        html += '<div class="msc-sec-hdr sc-h-back" style="margin-top:10px;"><span>BACK 9 (IN)</span> <span>Par ' + pIn + '</span></div>';
        html += '<div class="msc-tile-grid">';
        back.forEach(function(i) {
            html += tileHTML(i);
        });
        html += '</div>';
        html += buildToParRowHTML(back, sc, frontRun, 'msc-tile-grid', 'sc-h-back').html;
        var inG = 0, inS = 0;
        back.forEach(function(i){ var s=parseInt(sc[i])||0; if(s>0){ inG+=s; inS+=stablefordField(s,i,fHcp);} });
        html += '<div class="msc-totals-strip sc-h-back">';
        html += '  <span>IN: <b>' + (inG > 0 ? inG : '—') + '</b></span>';
        html += '  <span>Stbl: <b>' + inS + 'p</b></span>';
        html += '</div>';
    }

    html += '</div>'; // /sc-tabs-wrap

    html += '<div class="msc-grand-strip">';
    html += '  <span>GROSS: <b>' + (totG > 0 ? totG : '—') + '</b></span>';
    html += '  <span>STABLEFORD: <b>' + totS + 'p</b></span>';
    html += '</div>';

    html += '</div>'; // End pestovo-modern-scorecard

    return html;
}

// ==========================================
// ПЕЧАТЬ ОФИЦИАЛЬНОЙ СЧЁТНОЙ КАРТОЧКИ (IMG_1113.JPEG REPLICA)
// ==========================================
function generateExactPestovoPaperScorecardHTML(player, roundData) {
    var p = player || {};
    var sc = p.scores || {};
    var fHcp = p.fieldHcp || 0;
    var eHcp = p.exactHcp || 0;
    var teeCode = (p && p.tee) || (roundData && roundData.tee) || 'wh';
    var fmt = (roundData && roundData.format) || 'Stroke Play';
    var tName = (roundData && roundData.tournamentName) || '—';
    var date = fmtDate((roundData && (roundData.completedAt || roundData.createdAt)) || Date.now());
    var startTime = fmtTime(roundData && roundData.startTime);

    var outG = 0, inG = 0, outS = 0, inS = 0;
    for (var i = 1; i <= 9; i++) {
        var s = parseInt(sc[i]) || 0;
        if (s > 0) { outG += s; outS += stablefordField(s, i, fHcp); }
    }
    for (var i = 10; i <= 18; i++) {
        var s = parseInt(sc[i]) || 0;
        if (s > 0) { inG += s; inS += stablefordField(s, i, fHcp); }
    }
    var totG = outG + inG, totS = outS + inS;

    var pOut = 0, pIn = 0;
    for (var i = 1; i <= 9; i++) pOut += holePar(i);
    for (var i = 10; i <= 18; i++) pIn += holePar(i);

    var html = '<div class="paper-scorecard-wrap">';

    // Top Header with Logo
    html += '<div class="psc-top-header">';
    html += '  <div class="psc-logo-brand">';
    html += '    <img src="img/logo.png" alt="Pestovo" class="psc-logo" onerror="this.style.display=\'none\'">';
    html += '    <div><div class="psc-club-title">ГОЛЬФ-КЛУБ «ПЕСТОВО»</div><div class="psc-club-sub">Официальная счётная карточка</div></div>';
    html += '  </div>';
    html += '</div>';

    // Player & Meta Block (Matching IMG_1113.jpeg)
    html += '<div class="psc-meta-grid">';
    html += '  <div class="psc-meta-left">';
    html += '    <div><b>Игрок:</b> ' + escapeHtml(p.name || '___________________________') + '</div>';
    html += '    <div><b>Турнир:</b> ' + escapeHtml(tName || '') + ' &nbsp;&nbsp;&nbsp;&nbsp; <b>Формат:</b> ' + escapeHtml(fmt || '') + '</div>';
    html += '  </div>';
    html += '  <div class="psc-meta-right">';
    html += '    <div><b>Точный гандикап:</b> ' + fmtExactHcp(eHcp) + ' &nbsp;&nbsp; (Игровой: ' + fmtFieldHcp(fHcp) + ')</div>';
    html += '    <table class="psc-meta-table">';
    html += '      <tr><th>Раунд</th><th>Время старта</th><th>Дата</th></tr>';
    html += '      <tr><td>1</td><td>' + startTime + '</td><td>' + date + '</td></tr>';
    html += '    </table>';
    html += '  </div>';
    html += '</div>';

    // Grid Table Showing ONLY Played Tee
    html += '<div class="psc-table-wrap">';
    html += '<table class="psc-grid-table">';
    html += '<thead><tr><th style="width:75px;">ТИ \\ Лунка</th>';
    for (var i = 1; i <= 9; i++) html += '<th>' + i + '</th>';
    html += '<th class="psc-tot-col">Аут</th>';
    for (var i = 10; i <= 18; i++) html += '<th>' + i + '</th>';
    html += '<th class="psc-tot-col">Ин</th><th class="psc-tot-col">Итого</th></tr></thead>';

    html += '<tbody>';

    // SINGLE PLAYED TEE ROW (Only the Tee played by the player)
    var teeName = TEES[teeCode] || 'Белый';
    var teeClass = 'psc-tee-' + teeCode;
    var dO = 0, dI = 0;
    for (var i = 1; i <= 9; i++) dO += (HOLES[i][teeCode] || HOLES[i].wh);
    for (var i = 10; i <= 18; i++) dI += (HOLES[i][teeCode] || HOLES[i].wh);

    html += '<tr><td class="psc-lbl-tee ' + teeClass + '">' + teeName + '</td>';
    for (var i = 1; i <= 9; i++) html += '<td>' + (HOLES[i][teeCode] || HOLES[i].wh) + '</td>';
    html += '<td class="psc-tot-col">' + dO + '</td>';
    for (var i = 10; i <= 18; i++) html += '<td>' + (HOLES[i][teeCode] || HOLES[i].wh) + '</td>';
    html += '<td class="psc-tot-col">' + dI + '</td><td class="psc-tot-col">' + (dO + dI) + '</td></tr>';

    // Пар
    html += '<tr class="psc-row-par"><td class="psc-lbl-bold">Пар</td>';
    for (var i = 1; i <= 9; i++) html += '<td>' + HOLES[i].p + '</td>';
    html += '<td class="psc-tot-col">' + pOut + '</td>';
    for (var i = 10; i <= 18; i++) html += '<td>' + HOLES[i].p + '</td>';
    html += '<td class="psc-tot-col">' + pIn + '</td><td class="psc-tot-col">' + (pOut + pIn) + '</td></tr>';

    // Индекс
    html += '<tr class="psc-row-idx"><td class="psc-lbl-bold">Индекс</td>';
    for (var i = 1; i <= 9; i++) html += '<td>' + HOLES[i].hcp + '</td>';
    html += '<td class="psc-tot-col">—</td>';
    for (var i = 10; i <= 18; i++) html += '<td>' + HOLES[i].hcp + '</td>';
    html += '<td class="psc-tot-col">—</td><td class="psc-tot-col">—</td></tr>';

    // Счёт Игрока
    html += '<tr class="psc-row-score"><td class="psc-lbl-bold">Счёт</td>';
    for (var i = 1; i <= 9; i++) {
        var s = parseInt(sc[i]) || 0;
        html += '<td class="psc-score-cell">' + (s > 0 ? '<b>' + s + '</b>' : '') + '</td>';
    }
    html += '<td class="psc-tot-col"><b>' + (outG > 0 ? outG : '') + '</b></td>';
    for (var i = 10; i <= 18; i++) {
        var s = parseInt(sc[i]) || 0;
        html += '<td class="psc-score-cell">' + (s > 0 ? '<b>' + s + '</b>' : '') + '</td>';
    }
    html += '<td class="psc-tot-col"><b>' + (inG > 0 ? inG : '') + '</b></td>';
    html += '<td class="psc-tot-col"><b>' + (totG > 0 ? totG : '') + '</b></td></tr>';

    // Stableford
    html += '<tr><td class="psc-lbl-bold">Stableford</td>';
    for (var i = 1; i <= 9; i++) {
        var s = parseInt(sc[i]) || 0;
        var pts = s > 0 ? stablefordField(s, i, fHcp) : '';
        html += '<td>' + pts + '</td>';
    }
    html += '<td class="psc-tot-col"><b>' + (outS > 0 ? outS : '') + '</b></td>';
    for (var i = 10; i <= 18; i++) {
        var s = parseInt(sc[i]) || 0;
        var pts = s > 0 ? stablefordField(s, i, fHcp) : '';
        html += '<td>' + pts + '</td>';
    }
    html += '<td class="psc-tot-col"><b>' + (inS > 0 ? inS : '') + '</b></td>';
    html += '<td class="psc-tot-col"><b>' + (totS > 0 ? totS : '') + '</b></td></tr>';

    html += '</tbody></table></div>';

    // Signatures Footer
    html += '<div class="psc-signatures">';
    html += '  <span><b>Подписи:</b></span>';
    html += '  <span><b>Игрок:</b> ____________________</span>';
    html += '  <span><b>Маркер:</b> ____________________</span>';
    html += '  <span><b>Судья:</b> ____________________</span>';
    html += '</div>';

    html += '</div>';

    return html;
}

function openPrintScorecardModal(roundId, playerId) {
    if (typeof db === 'undefined' || !roundId) return;

    db.ref('rounds/' + roundId).once('value').then(function(sn) {
        var r = sn.val();
        if (!r || !r.players) {
            toast(currentLang === 'en' ? 'Round not found' : 'Раунд не найден', 'error');
            return;
        }

        var playersList = Object.entries(r.players);
        if (!playersList.length) return;

        var modalEl = document.getElementById('print-modal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'print-modal';
            modalEl.className = 'modal hidden';
            modalEl.innerHTML =
                '<div class="modal-bg" onclick="closePrintModal()"></div>' +
                '<div class="modal-body" style="max-width:880px;">' +
                '<div class="modal-top-bar">' +
                '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closePrintModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
                '<button type="button" class="modal-close-btn" onclick="closePrintModal()">&times;</button>' +
                '</div>' +
                '<div id="print-modal-body"></div>' +
                '</div>';
            if (document.body) document.body.appendChild(modalEl);
        }

    var bodyEl = document.getElementById('print-modal-body');

    // Печатается карточка каждого игрока раунда: на листе A4 (landscape)
    // помещается 2 карточки, при печати видна только сама карточка.
    var html = '<div class="print-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">';
    html += '<h2 style="color:var(--gold);margin:0;"><i class="fas fa-print"></i> ' + (currentLang === 'en' ? 'Print Official Scorecard' : 'Печать официальной счётной карточки') + '</h2>';
    html += '<div style="display:flex;gap:8px;">';
    html += '<button type="button" class="btn btn-g" onclick="window.print()"><i class="fas fa-print"></i> ' + (currentLang === 'en' ? 'Print' : 'Распечатать') + '</button>';
    html += '<button type="button" class="btn btn-og" onclick="closePrintModal()">' + (currentLang === 'en' ? 'Close' : 'Закрыть') + '</button>';
    html += '</div></div>';

    if (playersList.length > 1) {
        html += '<p class="no-print" style="color:var(--muted);font-size:12px;margin-bottom:10px;"><i class="fas fa-circle-info"></i> ' +
            (currentLang === 'en' ? 'Cards for all ' + playersList.length + ' players — 2 per A4 sheet.' : 'Карточки всех игроков (' + playersList.length + ') — по 2 на лист A4.') + '</p>';
    }

    html += '<div id="printable-scorecard" class="print-cards-grid">';
    playersList.forEach(function(pe) {
        html += generateExactPestovoPaperScorecardHTML(pe[1], r);
    });
    html += '</div>';

    if (bodyEl) bodyEl.innerHTML = html;
    modalEl.classList.remove('hidden');
    });
}

function closePrintModal() {
    var modalEl = document.getElementById('print-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

function downloadScorecard(roundId) {
    openPrintScorecardModal(roundId);
}

// ==========================================
// ИСТОРИЯ
// ==========================================
function saveHistory(roundId,rd){
    var players=rd.players||{};
    Object.entries(players).forEach(function(pe){
        var pid=pe[0],p=pe[1],sc=p.scores||{},fH=p.fieldHcp||0,eH=p.exactHcp||0;
        var stats=calcRoundStats(sc,fH,eH,getRoundOrder(rd));
        if(stats.gross<=0)return;
        var isGuestPlayer=String(pid).indexOf('guest_')===0;
        if(isGuestPlayer && typeof resolveOrCreatePlayerUser==='function'){
            // Идемпотентное разрешение игрока: переиспользуем существующую запись
            // (по детерминированному id или по имени) вместо создания новой —
            // иначе один игрок плодил дубликаты в users после каждого раунда.
            resolveOrCreatePlayerUser({
                uid:null,
                name:p.name||'Гость',
                firstName:p.firstName||'',
                lastName:p.lastName||'',
                exactHcp:eH,
                gender:p.gender||'men',
                isGuest:true
            }).then(function(userId){
                if(userId)saveHistoryEntry(userId,roundId,rd,p,stats);
            }).catch(function(){});
        }else{saveHistoryEntry(pid,roundId,rd,p,stats);}
    });
}

function saveHistoryEntry(userId,roundId,rd,p,stats){
    db.ref('users/'+userId+'/history').push({
        roundId:roundId,date:rd.completedAt||Date.now(),tee:(p&&p.tee)||rd.tee||'wh',format:rd.format||'Stroke Play',
        mode:rd.mode||'group',startHole:rd.startHole||1,holeRange:rd.holeRange||'1-18',gross:stats.gross,toPar:stats.toPar,
        net:stats.net,netToPar:stats.netToPar,stablefordField:stats.stablefordField,stablefordExact:stats.stablefordExact,
        holes:stats.holesPlayed,scores:p.scores||{},birdies:stats.birdies,eagles:stats.eagles,
        pars:stats.pars,holeInOne:stats.holeInOne,exactHcp:p.exactHcp||0,fieldHcp:p.fieldHcp||0,gender:p.gender||'men'
    });
    db.ref('users/'+userId+'/roundsPlayed').transaction(function(v){return(v||0)+1;});
    if(stats.holesPlayed===getRoundHoleCount(rd)){
        db.ref('users/'+userId+'/bestGross').transaction(function(v){if(!v||stats.gross<v)return stats.gross;return v;});
        db.ref('users/'+userId+'/bestStableford').transaction(function(v){if(!v||stats.stablefordField>v)return stats.stablefordField;return v;});
    }
}


// ==========================================
// ГЕНЕРАТОР PNG-КАРТОЧКИ ДЛЯ СОЦСЕТЕЙ
// ==========================================
function exportRoundPNG(roundId, playerId) {
    if (typeof db === 'undefined' || !roundId) return;

    toast(currentLang === 'en' ? '⏳ Generating PNG scorecard...' : '⏳ Генерируем PNG-карточку...', 'info');

    db.ref('rounds/' + roundId).once('value').then(function(sn) {
        var r = sn.val();
        if (!r || !r.players) return;

        var playersList = Object.entries(r.players);
        var pid = playerId || playersList[0][0];
        var p = r.players[pid] || playersList[0][1];
        if (!p) return;

        var canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1080;
        var ctx = canvas.getContext('2d');

        // Background Gradient
        var bgGrad = ctx.createLinearGradient(0, 0, 1080, 1080);
        bgGrad.addColorStop(0, '#0b1a0e');
        bgGrad.addColorStop(0.5, '#132817');
        bgGrad.addColorStop(1, '#071209');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 1080, 1080);

        // Gold Border Frame
        ctx.strokeStyle = '#c9a84c';
        ctx.lineWidth = 8;
        ctx.strokeRect(30, 30, 1020, 1020);

        ctx.strokeStyle = 'rgba(201,168,76,0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(42, 42, 996, 996);

        // Header Title
        ctx.fillStyle = '#c9a84c';
        ctx.font = 'bold 36px "Playfair Display", Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('PESTOVO GOLF CLUB', 540, 95);

        ctx.fillStyle = '#9eb5a5';
        ctx.font = '500 18px "Inter", sans-serif';
        ctx.fillText('OFFICIAL DIGITAL SCORECARD', 540, 130);

        // Gold Divider
        ctx.beginPath();
        ctx.moveTo(180, 150);
        ctx.lineTo(900, 150);
        ctx.strokeStyle = '#c9a84c';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Player Name
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px "Playfair Display", serif';
        ctx.fillText(p.name || 'Golf Player', 540, 215);

        // Sub Meta
        var teeName = t('tee_' + ((p && p.tee) || r.tee || 'wh'));
        var fmtStr = (r.format || 'Stroke Play') + ' · Tee: ' + teeName + ' · HCP: ' + fmtExactHcp(p.exactHcp);
        var dateStr = fmtDate(r.completedAt || r.createdAt || Date.now());

        ctx.fillStyle = '#c9a84c';
        ctx.font = '600 20px "Inter", sans-serif';
        ctx.fillText(fmtStr, 540, 255);

        ctx.fillStyle = '#9eb5a5';
        ctx.font = '16px "Inter", sans-serif';
        ctx.fillText(dateStr, 540, 288);

        // Score KPIs Cards (Gross, Net, ToPar)
        var order = getRoundOrder(r);
        var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order);

        // Карточка NET убрана из PNG (по требованию клуба — без отображения Net)
        drawKPICard(ctx, 160, 315, 220, 115, 'TO PAR', fmtScore(stats.toPar), stats.toPar < 0 ? '#2ecc71' : stats.toPar > 0 ? '#e05a4a' : '#ffffff');
        drawKPICard(ctx, 430, 315, 220, 115, 'GROSS', String(stats.gross || 0), '#c9a84c');

        // Hole Grid Rows (Front 9 & Back 9) - TRADITIONAL SCORECARD (HOLE, PAR, SCORE)
        drawScorecardGridRow(ctx, p.scores || {}, 1, 9, 460);
        drawScorecardGridRow(ctx, p.scores || {}, 10, 18, 680);

        // Total 18 Holes Summary Bar
        var outGross = 0, inGross = 0;
        for (var i = 1; i <= 9; i++) { var s = parseInt(p.scores && p.scores[i]) || 0; if (s > 0) outGross += s; }
        for (var i = 10; i <= 18; i++) { var s = parseInt(p.scores && p.scores[i]) || 0; if (s > 0) inGross += s; }
        var totalGross18 = outGross + inGross;

        ctx.fillStyle = '#101f13';
        ctx.fillRect(60, 850, 960, 50);
        ctx.strokeStyle = '#c9a84c';
        ctx.lineWidth = 1;
        ctx.strokeRect(60, 850, 960, 50);

        ctx.fillStyle = '#c9a84c';
        ctx.font = 'bold 18px "Inter", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(' OUT: ' + (outGross || '—') + '  |  IN: ' + (inGross || '—') + '  |  TOTAL 18 HOLES: ' + (totalGross18 || '—'), 80, 882);

        ctx.textAlign = 'right';
        ctx.fillText('STABLEFORD: ' + stats.stablefordField + ' PTS ', 1000, 882);

        // Footer Branding
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(201,168,76,0.6)';
        ctx.font = '600 18px "Inter", sans-serif';
        ctx.fillText('⛳ GOLF CLUB PESTOVO · LIVE SCORING SYSTEM', 540, 995);

        var dataUrl = canvas.toDataURL('image/png');
        openPNGExportModal(dataUrl, p.name, roundId, pid, playersList);
    });
}

function drawKPICard(ctx, x, y, w, h, label, value, valColor) {
    ctx.fillStyle = '#132218';
    ctx.strokeStyle = '#1e3525';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#9eb5a5';
    ctx.font = 'bold 15px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + 32);

    ctx.fillStyle = valColor || '#ffffff';
    ctx.font = 'bold 38px "Inter", sans-serif';
    ctx.fillText(value, x + w / 2, y + 84);
}

function drawScorecardGridRow(ctx, scores, startHole, endHole, startY) {
    var startX = 60;
    var labelW = 110;
    var holeW = 85;
    var totW = 85;
    var row1H = 36;
    var row2H = 36;
    var row3H = 65;

    // --- ROW 1: HOLE NUMBERS ---
    ctx.fillStyle = '#101f13';
    ctx.fillRect(startX, startY, labelW + holeW * 9 + totW, row1H);
    ctx.strokeStyle = '#1e3525';
    ctx.lineWidth = 1;
    ctx.strokeRect(startX, startY, labelW + holeW * 9 + totW, row1H);

    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 15px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(' HOLE', startX + 10, startY + 24);

    ctx.textAlign = 'center';
    var parSum = 0;
    for (var i = startHole; i <= endHole; i++) {
        var colX = startX + labelW + (i - startHole) * holeW;
        ctx.fillText(String(i), colX + holeW / 2, startY + 24);
        parSum += holePar(i);
    }
    var totX = startX + labelW + holeW * 9;
    ctx.fillText(startHole === 1 ? 'OUT' : 'IN', totX + totW / 2, startY + 24);

    // --- ROW 2: PAR ---
    var y2 = startY + row1H;
    ctx.fillStyle = 'rgba(46, 204, 113, 0.08)';
    ctx.fillRect(startX, y2, labelW + holeW * 9 + totW, row2H);
    ctx.strokeStyle = '#1e3525';
    ctx.strokeRect(startX, y2, labelW + holeW * 9 + totW, row2H);

    ctx.fillStyle = '#2ecc71';
    ctx.font = 'bold 15px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(' PAR', startX + 10, y2 + 24);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    for (var i = startHole; i <= endHole; i++) {
        var colX = startX + labelW + (i - startHole) * holeW;
        ctx.fillText(String(holePar(i)), colX + holeW / 2, y2 + 24);
    }
    ctx.fillStyle = '#2ecc71';
    ctx.fillText(String(parSum), totX + totW / 2, y2 + 24);

    // --- ROW 3: SCORE ---
    var y3 = y2 + row2H;
    ctx.fillStyle = '#132218';
    ctx.fillRect(startX, y3, labelW + holeW * 9 + totW, row3H);
    ctx.strokeStyle = '#1e3525';
    ctx.strokeRect(startX, y3, labelW + holeW * 9 + totW, row3H);

    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 16px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(' SCORE', startX + 10, y3 + 38);

    ctx.textAlign = 'center';
    var scoreSum = 0;
    for (var i = startHole; i <= endHole; i++) {
        var s = parseInt(scores[i]) || 0;
        var par = holePar(i);
        var colX = startX + labelW + (i - startHole) * holeW;

        if (s > 0) {
            scoreSum += s;
            var diff = s - par;
            var circleColor = '#132218';

            if (diff <= -2 || s === 1) circleColor = '#f39c12';
            else if (diff === -1) circleColor = '#2ecc71';
            else if (diff === 0) circleColor = '#2c3e50';
            else if (diff === 1) circleColor = '#5aade0';
            else circleColor = '#e05a4a';

            // Score Badge Circle
            ctx.fillStyle = circleColor;
            ctx.beginPath();
            ctx.arc(colX + holeW / 2, y3 + row3H / 2, 22, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px "Inter", sans-serif';
            ctx.fillText(String(s), colX + holeW / 2, y3 + row3H / 2 + 7);
        } else {
            ctx.fillStyle = '#3a523e';
            ctx.font = '18px "Inter", sans-serif';
            ctx.fillText('—', colX + holeW / 2, y3 + row3H / 2 + 6);
        }
    }

    ctx.fillStyle = scoreSum > 0 ? '#c9a84c' : '#3a523e';
    ctx.font = 'bold 22px "Inter", sans-serif';
    ctx.fillText(scoreSum > 0 ? String(scoreSum) : '—', totX + totW / 2, y3 + row3H / 2 + 7);
}

function drawHoleGridRow(ctx, scores, markerScores, startHole, endHole, startY) {
    var startX = 60;
    var cellW = 96;
    var cellH = 95;

    // Header Row
    ctx.fillStyle = '#101f13';
    ctx.fillRect(startX, startY, cellW * 10, 36);
    ctx.strokeStyle = '#1e3525';
    ctx.lineWidth = 1;
    ctx.strokeRect(startX, startY, cellW * 10, 36);

    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 15px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(startHole === 1 ? 'FRONT 9' : 'BACK 9', startX + cellW / 2, startY + 24);

    for (var i = startHole; i <= endHole; i++) {
        var colX = startX + (i - startHole + 1) * cellW;
        ctx.fillText(String(i), colX + cellW / 2, startY + 24);
    }

    // Scores Row
    var rowY = startY + 36;
    ctx.fillStyle = '#132218';
    ctx.fillRect(startX, rowY, cellW * 10, cellH);
    ctx.strokeRect(startX, rowY, cellW * 10, cellH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px "Inter", sans-serif';
    ctx.fillText('SCORE', startX + cellW / 2, rowY + 35);
    ctx.fillStyle = '#9b59b6';
    ctx.font = '12px "Inter", sans-serif';
    ctx.fillText('MARKER', startX + cellW / 2, rowY + 68);

    for (var i = startHole; i <= endHole; i++) {
        var s = parseInt(scores[i]) || 0;
        var ms = parseInt(markerScores[i]) || 0;
        var par = holePar(i);
        var colX = startX + (i - startHole + 1) * cellW;

        if (s > 0) {
            var diff = s - par;
            var circleColor = '#132218';

            if (diff <= -2 || s === 1) circleColor = '#f39c12';
            else if (diff === -1) circleColor = '#2ecc71';
            else if (diff === 0) circleColor = '#2c3e50';
            else if (diff === 1) circleColor = '#5aade0';
            else circleColor = '#e05a4a';

            // Top: Player Score Badge
            ctx.fillStyle = circleColor;
            ctx.beginPath();
            ctx.arc(colX + cellW / 2, rowY + 30, 20, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px "Inter", sans-serif';
            ctx.fillText(String(s), colX + cellW / 2, rowY + 37);

            // Bottom: Marker Score (With Strikethrough if Mismatch)
            if (ms > 0) {
                var isMatch = (ms === s);
                var mText = 'M: ' + ms;
                ctx.font = '13px "Inter", sans-serif';
                var textX = colX + cellW / 2;
                var textY = rowY + 74;

                if (isMatch) {
                    ctx.fillStyle = '#9b59b6';
                    ctx.fillText(mText, textX, textY);
                } else {
                    ctx.fillStyle = '#e05a4a';
                    ctx.fillText(mText, textX, textY);

                    // Draw Strikethrough line
                    var textW = ctx.measureText(mText).width;
                    ctx.beginPath();
                    ctx.moveTo(textX - textW / 2 - 2, textY - 4);
                    ctx.lineTo(textX + textW / 2 + 2, textY - 4);
                    ctx.strokeStyle = '#e05a4a';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
            }
        } else {
            ctx.fillStyle = '#3a523e';
            ctx.font = '18px "Inter", sans-serif';
            ctx.fillText('—', colX + cellW / 2, rowY + 45);
        }
    }
}

function downloadPNGImage(pngDataUrl, fileName) {
    fileName = fileName || 'Pestovo_Scorecard.png';
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    var dataURLtoBlob = function(dataurl) {
        var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
            bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
        while(n--){
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], {type:mime});
    };

    var blob = null;
    try {
        blob = dataURLtoBlob(pngDataUrl);
    } catch(e) {}

    if (navigator.share && blob) {
        try {
            var file = new File([blob], fileName, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({
                    files: [file],
                    title: 'Пестово Счётная Карточка',
                    text: 'Официальная карточка раунда'
                }).then(function() {
                    console.log('✅ Web Share succeeded');
                }).catch(function(err) {
                    if (err && err.name !== 'AbortError') {
                        fallbackIOSDownload(pngDataUrl, blob, fileName, isIOS);
                    }
                });
                return;
            }
        } catch (e) {
            console.warn('Web Share file error:', e);
        }
    }

    fallbackIOSDownload(pngDataUrl, blob, fileName, isIOS);
}

function fallbackIOSDownload(pngDataUrl, blob, fileName, isIOS) {
    if (isIOS) {
        var blobUrl = blob ? URL.createObjectURL(blob) : pngDataUrl;
        var win = window.open(blobUrl, '_blank');
        if (!win) {
            window.location.href = blobUrl;
        }
        toast(currentLang === 'en' ? '📱 Long press image and choose "Save to Photos"!' : '📱 Зажмите изображение пальцем и выберите «Сохранить в Фото»!', 'info');
    } else {
        var a = document.createElement('a');
        a.href = pngDataUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast(currentLang === 'en' ? '✅ PNG Scorecard downloaded!' : '✅ PNG Карточка успешно скачана!', 'success');
    }
}

function openPNGExportModal(pngDataUrl, playerName, roundId, activePid, playersList) {
    var modalEl = document.getElementById('png-modal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'png-modal';
        modalEl.className = 'modal hidden';
        modalEl.innerHTML =
            '<div class="modal-bg" onclick="closePNGModal()"></div>' +
            '<div class="modal-body" style="max-width:560px;text-align:center;">' +
            '<div class="modal-top-bar">' +
            '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closePNGModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
            '<button type="button" class="modal-close-btn" onclick="closePNGModal()">&times;</button>' +
            '</div>' +
            '<div id="png-modal-body"></div>' +
            '</div>';
        if (document.body) document.body.appendChild(modalEl);
    }

    var bodyEl = document.getElementById('png-modal-body');
    var fileName = 'Pestovo_' + (playerName || 'Card').replace(/\s+/g, '_') + '.png';

    var html = '<h2 style="color:var(--gold);margin-bottom:12px;"><i class="fas fa-image"></i> ' + t('share_card') + '</h2>';

    // Group Player Selector (If Group Round with >1 players)
    if (playersList && playersList.length > 1 && roundId) {
        html += '<div style="margin-bottom:16px;background:var(--input);padding:12px;border-radius:var(--rs);border:1px solid var(--border);">';
        html += '<label style="font-size:12px;color:var(--gold);display:block;margin-bottom:6px;font-weight:700;"><i class="fas fa-users"></i> ' + (currentLang === 'en' ? 'Select Group Player Card:' : 'Выберите карточку игрока группы:') + '</label>';
        html += '<select class="form-input" style="max-width:320px;margin:0 auto;text-align:center;font-weight:700;" onchange="exportRoundPNG(\'' + roundId + '\', this.value)">';
        playersList.forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            var sel = pid === activePid ? 'selected' : '';
            html += '<option value="' + pid + '" ' + sel + '>' + escapeHtml(p.name || 'Player') + '</option>';
        });
        html += '</select></div>';
    }

    html += '<img src="' + pngDataUrl + '" alt="Pestovo Card" style="width:100%;max-width:440px;border-radius:12px;border:2px solid var(--gold);box-shadow:0 8px 32px rgba(0,0,0,0.5);margin-bottom:12px;">';
    html += '<p style="font-size:11px;color:var(--muted);margin-bottom:14px;"><i class="fas fa-mobile-screen-button"></i> ' + (currentLang === 'en' ? 'On iPhone / iPad: Tap button to Share or long-press image to Save to Photos' : 'На iPhone: нажмите кнопку для отправки или зажмите картинку пальцем для сохранения в Фото') + '</p>';

    html += '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">';
    html += '<button type="button" class="btn btn-g" style="flex:1;min-width:180px;" onclick="downloadPNGImage(\'' + pngDataUrl + '\', \'' + fileName + '\')"><i class="fas fa-download"></i> ' + t('download_png') + '</button>';

    if (navigator.share) {
        html += '<button type="button" class="btn btn-og" style="flex:1;min-width:180px;" onclick="downloadPNGImage(\'' + pngDataUrl + '\', \'' + fileName + '\')"><i class="fas fa-share-nodes"></i> ' + t('share_native') + '</button>';
    }
    html += '</div>';

    if (bodyEl) bodyEl.innerHTML = html;
    modalEl.classList.remove('hidden');
}

function closePNGModal() {
    var modalEl = document.getElementById('png-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

function renderTrophyCabinet(u, rounds) {
    var totalEagles = 0, totalBirdies = 0, totalHIO = 0;
    (rounds || []).forEach(function(r) {
        if (r.eagles) totalEagles += r.eagles;
        if (r.birdies) totalBirdies += r.birdies;
        if (r.holeInOne) totalHIO += r.holeInOne;
    });

    var trophies = [];
    if (totalHIO > 0) trophies.push({ icon: '🎯', title: 'Hole-in-One', desc: 'Hole-in-One!' });
    if (totalEagles > 0) trophies.push({ icon: '🦅', title: 'Eagle Hunter', desc: totalEagles + ' Eagles' });
    if (totalBirdies >= 5) trophies.push({ icon: '🐦', title: 'Birdie Master', desc: totalBirdies + ' Birdies' });
    if (u.roundsPlayed >= 10) trophies.push({ icon: '👑', title: 'Century Player', desc: u.roundsPlayed + ' Rounds' });
    else if (u.roundsPlayed >= 1) trophies.push({ icon: '⛳', title: 'Pestovo Golfer', desc: u.roundsPlayed + ' Rounds' });

    if (!trophies.length) return '';

    var html = '<div class="trophy-cabinet" style="margin:16px 0;padding:12px;background:var(--input);border-radius:var(--rs);border:1px solid var(--border);">';
    html += '<div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:8px;text-transform:uppercase;"><i class="fas fa-award"></i> ' + (currentLang === 'en' ? 'Trophy Cabinet & Badges' : 'Витрина наград и достижений') + '</div>';
    html += '<div style="display:flex;gap:10px;flex-wrap:wrap;">';
    trophies.forEach(function(tVal) {
        html += '<div class="trophy-badge" style="background:rgba(201,168,76,0.12);border:1px solid var(--gold);padding:6px 12px;border-radius:20px;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--white);">';
        html += '<span>' + tVal.icon + '</span><span>' + tVal.title + ' <small style="color:var(--muted);font-weight:400;">(' + tVal.desc + ')</small></span>';
        html += '</div>';
    });
    html += '</div></div>';
    return html;
}

function renderScoringDistributionBar(rounds) {
    var eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0;
    (rounds || []).forEach(function(r) {
        if (r.eagles) eagles += r.eagles;
        if (r.birdies) birdies += r.birdies;
        if (r.pars) pars += r.pars;
        if (r.bogeys) bogeys += r.bogeys;
        if (r.doubles) doubles += r.doubles;
    });

    var total = eagles + birdies + pars + bogeys + doubles;
    if (total === 0) return '';

    var pEag = Math.round((eagles / total) * 100);
    var pBir = Math.round((birdies / total) * 100);
    var pPar = Math.round((pars / total) * 100);
    var pBog = Math.round((bogeys / total) * 100);
    var pDbl = Math.round((doubles / total) * 100);

    var html = '<div class="scoring-dist-wrap" style="margin:16px 0;padding:12px;background:var(--input);border-radius:var(--rs);border:1px solid var(--border);">';
    html += '<div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:8px;text-transform:uppercase;"><i class="fas fa-chart-pie"></i> ' + (currentLang === 'en' ? 'Scoring Distribution' : 'Распределение результатов ударов') + '</div>';
    html += '<div style="height:12px;border-radius:6px;overflow:hidden;display:flex;background:var(--border);margin-bottom:8px;">';
    if (pEag > 0) html += '<div style="width:' + pEag + '%;background:#f39c12;" title="Eagle ' + pEag + '%"></div>';
    if (pBir > 0) html += '<div style="width:' + pBir + '%;background:#2ecc71;" title="Birdie ' + pBir + '%"></div>';
    if (pPar > 0) html += '<div style="width:' + pPar + '%;background:#555555;" title="Par ' + pPar + '%"></div>';
    if (pBog > 0) html += '<div style="width:' + pBog + '%;background:#5aade0;" title="Bogey ' + pBog + '%"></div>';
    if (pDbl > 0) html += '<div style="width:' + pDbl + '%;background:#e05a4a;" title="Double+ ' + pDbl + '%"></div>';
    html += '</div>';

    html += '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);flex-wrap:wrap;gap:6px;">';
    html += '<span style="color:#f39c12;">🦅 Eagle ' + pEag + '%</span>';
    html += '<span style="color:#2ecc71;">🐦 Birdie ' + pBir + '%</span>';
    html += '<span>⚪ Par ' + pPar + '%</span>';
    html += '<span style="color:#5aade0;">🔷 Bogey ' + pBog + '%</span>';
    html += '<span style="color:#e05a4a;">🟥 Dbl+ ' + pDbl + '%</span>';
    html += '</div></div>';

    return html;
}

function sharePNGNative(dataUrl, fileName) {
    fetch(dataUrl).then(function(res) { return res.blob(); }).then(function(blob) {
        var file = new File([blob], fileName || 'Pestovo_Card.png', { type: 'image/png' });
        if (navigator.share) {
            navigator.share({
                title: 'Pestovo Golf Scorecard',
                text: 'My score at Pestovo Golf Club!',
                files: [file]
            }).catch(function() {});
        }
    });
}

// ==========================================
// МЕНЮ ИНСТРУМЕНТОВ И ФУНКЦИЙ (TOOLS MENU)
// ==========================================
function openToolsMenu() {
    var modalEl = document.getElementById('tools-modal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'tools-modal';
        modalEl.className = 'modal hidden';
        modalEl.innerHTML =
            '<div class="modal-bg" onclick="closeToolsModal()"></div>' +
            '<div class="modal-body" style="max-width:520px;">' +
            '<div class="modal-top-bar">' +
            '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closeToolsModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
            '<button type="button" class="modal-close-btn" onclick="closeToolsModal()">&times;</button>' +
            '</div>' +
            '<div id="tools-modal-body"></div>' +
            '</div>';
        if (document.body) document.body.appendChild(modalEl);
    }

    var bodyEl = document.getElementById('tools-modal-body');
    if (!bodyEl) return;

    var isGps = localStorage.getItem('pestovo_gps_enabled') === '1';
    var isShotTrack = localStorage.getItem('pestovo_shot_tracking_enabled') === '1';

    var html = '<h2 style="color:var(--gold);margin-bottom:12px;"><i class="fas fa-toolbox"></i> ' + t('tools_title') + '</h2>';
    html += '<p style="font-size:13px;color:var(--muted);margin-bottom:20px;">' + (currentLang === 'en' ? 'Toggle optional features on/off or launch standalone tools:' : 'Включайте и выключайте отдельные функции или запускайте инструменты:') + '</p>';

    // Feature 1: GPS Rangefinder
    html += '<div class="list-item" style="padding:14px;margin-bottom:12px;flex-wrap:wrap;gap:10px;">';
    html += '<div style="flex:1;min-width:180px;"><strong style="color:var(--white);font-size:15px;"><i class="fas fa-location-crosshairs" style="color:var(--gold);"></i> ' + t('gps_rangefinder') + '</strong>';
    html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + (currentLang === 'en' ? 'Live GPS distance in meters to green & club recommendation' : 'Точный расчёт дистанции в метрах до грина по GPS и рекомендация клюшки') + '</div></div>';
    html += '<div style="display:flex;gap:8px;align-items:center;">';
    html += '<button class="btn ' + (isGps ? 'btn-g' : 'btn-og') + ' btn-sm" onclick="toggleFeatureSetting(\'pestovo_gps_enabled\')">' + (isGps ? t('enabled_lbl') : t('disabled_lbl')) + '</button>';
    html += '<button class="btn btn-og btn-sm" onclick="openGPSRangefinderModal()"><i class="fas fa-expand"></i></button>';
    html += '</div></div>';

    // Feature 2: Shot Tracking
    html += '<div class="list-item" style="padding:14px;margin-bottom:12px;flex-wrap:wrap;gap:10px;">';
    html += '<div style="flex:1;min-width:180px;"><strong style="color:var(--white);font-size:15px;"><i class="fas fa-chart-line" style="color:var(--gold);"></i> ' + t('shot_tracking') + '</strong>';
    html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + (currentLang === 'en' ? 'Record FIR (Fairway), GIR (Green) & Putts per hole' : 'Дополнительный ввод точности драйва, выхода на грин и числа паттов') + '</div></div>';
    html += '<div><button class="btn ' + (isShotTrack ? 'btn-g' : 'btn-og') + ' btn-sm" onclick="toggleFeatureSetting(\'pestovo_shot_tracking_enabled\')">' + (isShotTrack ? t('enabled_lbl') : t('disabled_lbl')) + '</button></div>';
    html += '</div>';

    // Feature 3: TV Broadcast Mode
    html += '<div class="list-item" style="padding:14px;margin-bottom:12px;flex-wrap:wrap;gap:10px;">';
    html += '<div style="flex:1;min-width:180px;"><strong style="color:var(--white);font-size:15px;"><i class="fas fa-tv" style="color:var(--gold);"></i> ' + t('tv_mode') + '</strong>';
    html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + (currentLang === 'en' ? 'Fullscreen auto-scrolling leaderboard for Clubhouse TV panels' : 'Полноэкранная ТВ-трансляция для телевизоров в клубном доме') + '</div></div>';
    html += '<div><a href="tv.html" target="_blank" class="btn btn-g btn-sm"><i class="fas fa-desktop"></i> ' + (currentLang === 'en' ? 'Open TV Page' : 'Открыть ТВ') + '</a></div>';
    html += '</div>';

    // Feature 4: Head-to-Head 1v1
    html += '<div class="list-item" style="padding:14px;margin-bottom:12px;flex-wrap:wrap;gap:10px;">';
    html += '<div style="flex:1;min-width:180px;"><strong style="color:var(--white);font-size:15px;"><i class="fas fa-handshake-simple" style="color:var(--gold);"></i> ' + t('h2h_duel') + '</strong>';
    html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + (currentLang === 'en' ? 'Compare stats and direct head-to-head match history between 2 players' : 'Прямое сравнение результатов двух игроков и история личных встреч') + '</div></div>';
    html += '<div><button class="btn btn-og btn-sm" onclick="closeToolsModal();openHeadToHeadModal();"><i class="fas fa-chart-column"></i> ' + (currentLang === 'en' ? 'Compare 1v1' : 'Сравнить 1v1') + '</button></div>';
    html += '</div>';

    bodyEl.innerHTML = html;
    modalEl.classList.remove('hidden');
}

function closeToolsModal() {
    var modalEl = document.getElementById('tools-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

function toggleFeatureSetting(key) {
    var curr = localStorage.getItem(key) === '1';
    localStorage.setItem(key, curr ? '0' : '1');
    toast(curr ? (currentLang === 'en' ? 'Feature Disabled' : 'Функция выключена') : (currentLang === 'en' ? 'Feature Enabled ✅' : 'Функция включена ✅'), 'info');
    openToolsMenu();
    if (typeof renderPlayHole === 'function') renderPlayHole();
    if (typeof renderCurrentHole === 'function') renderCurrentHole();
}

// ==========================================
// FEATURE 1: GPS-ДАЛЬНОМЕР И РЕКОМЕНДАЦИЯ КЛЮШКИ
// ==========================================
const HOLE_GREENS = {
    1: { lat: 56.0912, lon: 37.6210 }, 2: { lat: 56.0925, lon: 37.6225 }, 3: { lat: 56.0938, lon: 37.6240 },
    4: { lat: 56.0918, lon: 37.6255 }, 5: { lat: 56.0905, lon: 37.6235 }, 6: { lat: 56.0892, lon: 37.6215 },
    7: { lat: 56.0880, lon: 37.6200 }, 8: { lat: 56.0872, lon: 37.6220 }, 9: { lat: 56.0895, lon: 37.6250 },
    10: { lat: 56.0910, lon: 37.6270 }, 11: { lat: 56.0928, lon: 37.6285 }, 12: { lat: 56.0945, lon: 37.6275 },
    13: { lat: 56.0952, lon: 37.6255 }, 14: { lat: 56.0935, lon: 37.6230 }, 15: { lat: 56.0920, lon: 37.6205 },
    16: { lat: 56.0902, lon: 37.6185 }, 17: { lat: 56.0885, lon: 37.6170 }, 18: { lat: 56.0898, lon: 37.6198 }
};

function calcGPSDistanceMeters(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

function suggestGolfClub(meters) {
    if (meters > 210) return 'Driver / 3-Wood';
    if (meters > 185) return '4-Hybrid / 4-Iron';
    if (meters > 170) return '5-Iron';
    if (meters > 155) return '6-Iron';
    if (meters > 140) return '7-Iron';
    if (meters > 125) return '8-Iron';
    if (meters > 110) return '9-Iron';
    if (meters > 90) return 'Pitching Wedge (PW)';
    if (meters > 70) return 'Gap Wedge (GW)';
    return 'Sand Wedge / Putter';
}

function openGPSRangefinderModal(holeNum) {
    holeNum = holeNum || (typeof playHole !== 'undefined' ? playHole : (typeof curHole !== 'undefined' ? curHole : 1));

    var modalEl = document.getElementById('gps-modal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'gps-modal';
        modalEl.className = 'modal hidden';
        modalEl.innerHTML =
            '<div class="modal-bg" onclick="closeGPSModal()"></div>' +
            '<div class="modal-body" style="max-width:480px;text-align:center;">' +
            '<div class="modal-top-bar">' +
            '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closeGPSModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
            '<button type="button" class="modal-close-btn" onclick="closeGPSModal()">&times;</button>' +
            '</div>' +
            '<div id="gps-modal-body"></div>' +
            '</div>';
        if (document.body) document.body.appendChild(modalEl);
    }

    var bodyEl = document.getElementById('gps-modal-body');
    if (!bodyEl) return;

    var green = HOLE_GREENS[holeNum] || HOLE_GREENS[1];

    var html = '<h2 style="color:var(--gold);margin-bottom:8px;"><i class="fas fa-location-crosshairs"></i> GPS Rangefinder</h2>';
    html += '<div style="font-size:16px;font-weight:700;color:var(--white);margin-bottom:16px;">' + t('hole') + ' #' + holeNum + ' (' + t('par') + ' ' + holePar(holeNum) + ')</div>';

    html += '<div id="gps-status-card" class="card" style="background:var(--input);padding:20px;border-color:var(--gold);margin-bottom:16px;">';
    html += '<div class="loading"><div class="spinner"></div><p style="margin-top:8px;font-size:13px;color:var(--muted);">' + (currentLang === 'en' ? 'Acquiring GPS position...' : 'Определяем GPS-координаты...') + '</p></div>';
    html += '</div>';

    html += '<div class="form-group"><label>' + t('hole') + ':</label><select class="form-input" style="max-width:200px;margin:0 auto;" onchange="openGPSRangefinderModal(parseInt(this.value))">';
    for (var i = 1; i <= 18; i++) {
        var sel = i === holeNum ? 'selected' : '';
        html += '<option value="' + i + '" ' + sel + '>' + t('hole') + ' #' + i + '</option>';
    }
    html += '</select></div>';

    bodyEl.innerHTML = html;
    modalEl.classList.remove('hidden');

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
            var userLat = pos.coords.latitude;
            var userLon = pos.coords.longitude;
            var distCenter = calcGPSDistanceMeters(userLat, userLon, green.lat, green.lon);
            var distFront = Math.max(10, distCenter - 14);
            var distBack = distCenter + 14;
            var club = suggestGolfClub(distCenter);

            var cardEl = document.getElementById('gps-status-card');
            if (cardEl) {
                var cHtml = '<div style="font-size:11px;color:#2ecc71;font-weight:700;margin-bottom:10px;"><i class="fas fa-satellite"></i> GPS ACTIVE (±' + Math.round(pos.coords.accuracy || 3) + 'm)</div>';
                cHtml += '<div style="display:flex;justify-content:space-around;align-items:center;margin:12px 0;">';
                cHtml += '<div><div style="font-size:10px;color:var(--muted);">FRONT</div><div style="font-size:18px;font-weight:700;color:var(--text);">' + distFront + 'm</div></div>';
                cHtml += '<div style="background:rgba(201,168,76,0.15);padding:10px 18px;border-radius:12px;border:1px solid var(--gold);"><div style="font-size:11px;color:var(--gold);font-weight:700;">CENTER</div><div style="font-size:36px;font-weight:800;color:var(--white);line-height:1;">' + distCenter + 'm</div></div>';
                cHtml += '<div><div style="font-size:10px;color:var(--muted);">BACK</div><div style="font-size:18px;font-weight:700;color:var(--text);">' + distBack + 'm</div></div>';
                cHtml += '</div>';
                cHtml += '<div style="font-size:13px;color:var(--gold);font-weight:700;margin-top:10px;"><i class="fas fa-golf-ball-tee"></i> ' + (currentLang === 'en' ? 'Suggested Club: ' : 'Рекомендуемая клюшка: ') + '<b>' + club + '</b></div>';
                cardEl.innerHTML = cHtml;
            }
        }, function(err) {
            var cardEl = document.getElementById('gps-status-card');
            if (cardEl) {
                var distCenter = holeDist(holeNum, 'wh');
                var club = suggestGolfClub(distCenter);
                cardEl.innerHTML = '<div style="font-size:11px;color:var(--gold);font-weight:700;margin-bottom:8px;"><i class="fas fa-flag"></i> ' + (currentLang === 'en' ? 'Course Yardage' : 'Дистанция по карте Пестово') + '</div>' +
                    '<div style="font-size:36px;font-weight:800;color:var(--white);">' + distCenter + 'm</div>' +
                    '<div style="font-size:12px;color:var(--gold);margin-top:6px;">' + (currentLang === 'en' ? 'Suggested Club: ' : 'Рекомендуемая клюшка: ') + '<b>' + club + '</b></div>';
            }
        }, { enableHighAccuracy: true, timeout: 8000 });
    }
}

function closeGPSModal() {
    var modalEl = document.getElementById('gps-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

// ==========================================
// FEATURE 4: HEAD-TO-HEAD DUEL 1v1
// ==========================================
function openHeadToHeadModal(p1Id, p2Id) {
    var modalEl = document.getElementById('h2h-modal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'h2h-modal';
        modalEl.className = 'modal hidden';
        modalEl.innerHTML =
            '<div class="modal-bg" onclick="closeH2HModal()"></div>' +
            '<div class="modal-body" style="max-width:580px;">' +
            '<div class="modal-top-bar">' +
            '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closeH2HModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
            '<button type="button" class="modal-close-btn" onclick="closeH2HModal()">&times;</button>' +
            '</div>' +
            '<div id="h2h-modal-body"></div>' +
            '</div>';
        if (document.body) document.body.appendChild(modalEl);
    }

    var bodyEl = document.getElementById('h2h-modal-body');
    if (!bodyEl || typeof db === 'undefined') return;

    db.ref('users').once('value').then(function(sn) {
        var users = sn.val() || {};
        var userEntries = Object.entries(users);
        if (userEntries.length < 2) {
            bodyEl.innerHTML = '<p style="color:var(--muted);text-align:center;padding:30px;">' + (currentLang === 'en' ? 'Need at least 2 registered players' : 'Требуется минимум 2 зарегистрированных игрока') + '</p>';
            modalEl.classList.remove('hidden');
            return;
        }

        var uid1 = p1Id || userEntries[0][0];
        var uid2 = p2Id || (userEntries[1] ? userEntries[1][0] : userEntries[0][0]);
        if (uid1 === uid2 && userEntries[1]) uid2 = userEntries[1][0];

        var u1 = users[uid1] || {};
        var u2 = users[uid2] || {};

        var html = '<h2 style="color:var(--gold);margin-bottom:14px;"><i class="fas fa-handshake-simple"></i> ' + t('h2h_duel') + '</h2>';

        // Player Selectors
        html += '<div class="form-row" style="margin-bottom:20px;">';
        html += '<div class="form-group"><label>Player 1</label><select class="form-input" onchange="openHeadToHeadModal(this.value, \'' + uid2 + '\')">';
        userEntries.forEach(function(e) {
            var sel = e[0] === uid1 ? 'selected' : '';
            html += '<option value="' + e[0] + '" ' + sel + '>' + escapeHtml(e[1].name || 'Player') + '</option>';
        });
        html += '</select></div>';

        html += '<div class="form-group"><label>Player 2</label><select class="form-input" onchange="openHeadToHeadModal(\'' + uid1 + '\', this.value)">';
        userEntries.forEach(function(e) {
            var sel = e[0] === uid2 ? 'selected' : '';
            html += '<option value="' + e[0] + '" ' + sel + '>' + escapeHtml(e[1].name || 'Player') + '</option>';
        });
        html += '</select></div>';
        html += '</div>';

        // Head-to-Head Comparison Table
        html += '<div class="card" style="background:var(--input);padding:16px;">';
        html += '<div style="display:flex;justify-content:space-around;align-items:center;margin-bottom:16px;text-align:center;">';
        html += '<div>' + fmtUserAvatar(u1, 52) + '<div style="font-weight:700;color:var(--gold);margin-top:4px;">' + escapeHtml(u1.name || 'Player 1') + '</div></div>';
        html += '<div style="font-size:24px;font-weight:900;color:var(--white);">VS</div>';
        html += '<div style="font-size:24px;font-weight:900;color:var(--white);">' + fmtUserAvatar(u2, 52) + '<div style="font-weight:700;color:var(--gold);margin-top:4px;">' + escapeHtml(u2.name || 'Player 2') + '</div></div>';
        html += '</div>';

        // Metrics Rows
        html += drawH2HRow('Exact HCP', fmtExactHcp(u1.handicap), fmtExactHcp(u2.handicap));
        html += drawH2HRow('Rounds Played', String(u1.roundsPlayed || 0), String(u2.roundsPlayed || 0));
        html += drawH2HRow('Best Gross (18h)', String(u1.bestGross || '—'), String(u2.bestGross || '—'));
        html += drawH2HRow('Best Stableford', String(u1.bestStableford || '—'), String(u2.bestStableford || '—'));

        html += '</div>';

        bodyEl.innerHTML = html;
        modalEl.classList.remove('hidden');
    });
}

function drawH2HRow(label, v1, v2) {
    return '<div class="list-item" style="padding:10px;margin-bottom:6px;">' +
        '<div style="font-weight:700;color:var(--white);width:30%;text-align:center;">' + v1 + '</div>' +
        '<div style="font-size:11px;color:var(--muted);width:40%;text-align:center;text-transform:uppercase;">' + label + '</div>' +
        '<div style="font-weight:700;color:var(--white);width:30%;text-align:center;">' + v2 + '</div>' +
        '</div>';
}

function closeH2HModal() {
    var modalEl = document.getElementById('h2h-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

// ==========================================
// FEATURE 3: OFFICIAL PDF SCORECARD EXPORT
// ==========================================
function downloadOfficialScorecardPDF(roundData) {
    if (!roundData) {
        toast(t('no_data') || 'Нет данных раунда', 'error');
        return;
    }

    var pName = roundData.playerName || 'Игрок';
    var mName = roundData.markerName || 'Маркёр';
    var dateStr = fmtDate(roundData.createdAt || Date.now());
    var timeStr = fmtTime(roundData.createdAt || Date.now());
    var teeCode = roundData.tee || 'wh';
    var format = roundData.format || 'Stroke Play';
    var exactHcp = roundData.exactHandicap != null ? fmtExactHcp(roundData.exactHandicap) : '—';
    var fieldHcp = roundData.fieldHandicap != null ? fmtFieldHcp(roundData.fieldHandicap) : '—';

    var printWin = window.open('', '_blank');
    if (!printWin) {
        toast('Пожалуйста, разрешите всплывающие окна для печати PDF', 'error');
        return;
    }

    var html = '<!DOCTYPE html><html><head><title>Pestovo_Scorecard_' + pName.replace(/\s+/g, '_') + '</title>' +
        '<meta charset="utf-8">' +
        '<style>' +
        'body{font-family:Arial,sans-serif;padding:20px;color:#000;background:#fff;font-size:12px;}' +
        '.header{text-align:center;border-bottom:2px solid #c9a84c;padding-bottom:10px;margin-bottom:15px;}' +
        '.header h1{margin:0;font-size:18px;color:#132218;letter-spacing:1px;}' +
        '.header h2{margin:4px 0 0;font-size:12px;color:#c9a84c;font-weight:700;}' +
        '.meta-table{width:100%;border-collapse:collapse;margin-bottom:15px;}' +
        '.meta-table td{padding:6px;border:1px solid #ccc;font-size:11px;}' +
        '.grid-table{width:100%;border-collapse:collapse;margin-bottom:15px;text-align:center;}' +
        '.grid-table th,.grid-table td{border:1px solid #333;padding:5px 2px;font-size:11px;}' +
        '.grid-table th{background:#132218;color:#fff;}' +
        '.out-in-row{background:#f0f0f0;font-weight:700;}' +
        '.sigs{display:flex;justify-content:space-between;margin-top:30px;padding-top:15px;border-top:1px dashed #666;}' +
        '.sig-box{width:45%;font-size:11px;}' +
        '.stamp-box{text-align:center;border:2px solid #c9a84c;border-radius:8px;padding:8px;margin-top:20px;color:#c9a84c;font-weight:700;}' +
        '</style></head><body>' +
        '<div class="header">' +
        '<h1>⛳ ГОЛЬФ-КЛУБ «ПЕСТОВО»</h1>' +
        '<h2>ОФИЦИАЛЬНАЯ СЧЁТНАЯ КАРТОЧКА / OFFICIAL SCORECARD</h2>' +
        '</div>' +
        '<table class="meta-table">' +
        '<tr><td><b>Игрок:</b> ' + pName + '</td><td><b>Маркёр:</b> ' + mName + '</td><td><b>Дата:</b> ' + dateStr + ' ' + timeStr + '</td></tr>' +
        '<tr><td><b>Точный HCP:</b> ' + exactHcp + '</td><td><b>Игровой HCP:</b> ' + fieldHcp + '</td><td><b>ТИ:</b> ' + (TEES[teeCode]||teeCode) + ' · <b>Формат:</b> ' + format + '</td></tr>' +
        '</table>' +
        '<table class="grid-table">' +
        '<thead><tr><th>Л.</th>';

    for (var i = 1; i <= 18; i++) html += '<th>' + i + '</th>';
    html += '<th>OUT</th><th>IN</th><th>ВСЕГО</th></tr></thead><tbody>';

    html += '<tr><td><b>PAR</b></td>';
    var outPar = 0, inPar = 0;
    for (var h = 1; h <= 18; h++) {
        var p = holePar(h);
        if (h <= 9) outPar += p; else inPar += p;
        html += '<td>' + p + '</td>';
    }
    html += '<td class="out-in-row">' + outPar + '</td><td class="out-in-row">' + inPar + '</td><td class="out-in-row">' + (outPar + inPar) + '</td></tr>';

    html += '<tr><td><b>SCORE</b></td>';
    var outScore = 0, inScore = 0, totalScore = 0;
    var scores = roundData.scores || {};
    for (var h = 1; h <= 18; h++) {
        var s = scores[h];
        if (s != null && s > 0) {
            totalScore += s;
            if (h <= 9) outScore += s; else inScore += s;
            html += '<td style="font-weight:700;">' + s + '</td>';
        } else {
            html += '<td>—</td>';
        }
    }
    html += '<td class="out-in-row">' + (outScore || '—') + '</td><td class="out-in-row">' + (inScore || '—') + '</td><td class="out-in-row">' + (totalScore || '—') + '</td></tr>';

    html += '</tbody></table>' +
        '<div class="sigs">' +
        '<div class="sig-box">Подпись игрока: _______________________</div>' +
        '<div class="sig-box">Подпись маркёра: _______________________</div>' +
        '</div>' +
        '<div class="stamp-box">ГСК ГОЛЬФ-КЛУБА ПЕСТОВО · ПОДТВЕРЖДЕНО</div>' +
        '<script>window.onload = function() { window.print(); };</script>' +
        '</body></html>';

    printWin.document.write(html);
    printWin.document.close();
}

// ==========================================
// FEATURE 4: MATCH PLAY VISUAL TRACKER
// ==========================================
function calcMatchPlayStatus(p1Scores, p2Scores, p1Name, p2Name) {
    p1Name = p1Name || 'Игрок 1';
    p2Name = p2Name || 'Игрок 2';
    p1Scores = p1Scores || {};
    p2Scores = p2Scores || {};

    var p1HolesWon = 0;
    var p2HolesWon = 0;
    var holesCompleted = 0;
    var holeHistory = [];

    for (var h = 1; h <= 18; h++) {
        var s1 = p1Scores[h];
        var s2 = p2Scores[h];

        if (s1 != null && s1 > 0 && s2 != null && s2 > 0) {
            holesCompleted++;
            if (s1 < s2) {
                p1HolesWon++;
                holeHistory.push({ hole: h, winner: 1 });
            } else if (s2 < s1) {
                p2HolesWon++;
                holeHistory.push({ hole: h, winner: 2 });
            } else {
                holeHistory.push({ hole: h, winner: 0 });
            }
        }
    }

    var lead = p1HolesWon - p2HolesWon;
    var absLead = Math.abs(lead);
    var remaining = 18 - holesCompleted;

    var statusText = '';
    var state = 'active';

    if (absLead > remaining && holesCompleted > 0) {
        state = 'final';
        var winnerName = lead > 0 ? p1Name : p2Name;
        statusText = '🏆 ПОБЕДА ' + winnerName.toUpperCase() + ' ' + absLead + ' & ' + remaining;
    } else if (absLead === remaining && remaining > 0) {
        state = 'dormie';
        var leaderName = lead > 0 ? p1Name : p2Name;
        statusText = '🔥 ' + leaderName.toUpperCase() + ' ' + absLead + ' UP (DORMIE)';
    } else if (lead === 0) {
        statusText = '⚖️ ALL SQUARE (Ничья)';
    } else {
        var leaderName = lead > 0 ? p1Name : p2Name;
        statusText = '⚡ ' + leaderName.toUpperCase() + ' ' + absLead + ' UP (' + remaining + ' л. осталось)';
    }

    return {
        p1HolesWon: p1HolesWon,
        p2HolesWon: p2HolesWon,
        holesCompleted: holesCompleted,
        remaining: remaining,
        lead: lead,
        state: state,
        statusText: statusText,
        holeHistory: holeHistory
    };
}

function renderMatchPlayTrackerHTML(matchStatus) {
    if (!matchStatus) return '';
    var html = '<div class="card setup-card" style="border-color:var(--gold);background:rgba(201,168,76,0.06);margin-bottom:12px;">' +
        '<div style="font-size:12px;color:var(--gold);font-weight:700;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">' +
        '<span><i class="fas fa-swords"></i> Match Play Status</span>' +
        '<span style="font-size:10px;color:var(--muted);">' + matchStatus.holesCompleted + '/18 holes</span>' +
        '</div>' +
        '<div style="font-size:14px;font-weight:800;color:var(--white);text-align:center;padding:8px 0;background:rgba(0,0,0,0.3);border-radius:8px;margin-bottom:8px;">' +
        matchStatus.statusText +
        '</div>' +
        '<div style="display:flex;gap:4px;overflow-x:auto;padding-bottom:4px;">';

    for (var i = 0; i < matchStatus.holeHistory.length; i++) {
        var item = matchStatus.holeHistory[i];
        var bg = item.winner === 1 ? '#2ecc71' : (item.winner === 2 ? '#e05a4a' : 'var(--muted)');
        var lbl = item.winner === 1 ? 'W1' : (item.winner === 2 ? 'W2' : 'AS');
        html += '<div style="background:' + bg + ';color:#fff;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;white-space:nowrap;">Л.' + item.hole + ': ' + lbl + '</div>';
    }

    html += '</div></div>';
    return html;
}

function toggleActiveScorecard(panelId) {
    var panel = document.getElementById(panelId);
    var icon = document.getElementById(panelId + '-icon');
    var txt = document.getElementById(panelId + '-txt');
    if (!panel) return;

    var isHidden = panel.classList.contains('hidden');
    if (isHidden) {
        panel.classList.remove('hidden');
        if (icon) icon.className = 'fas fa-chevron-up';
        if (txt) txt.textContent = currentLang === 'en' ? 'Collapse Scorecard' : 'Свернуть счётную карточку';
    } else {
        panel.classList.add('hidden');
        if (icon) icon.className = 'fas fa-chevron-down';
        if (txt) txt.textContent = currentLang === 'en' ? 'Expand Scorecard' : 'Развернуть счётную карточку';
    }
}

// Состав флайта: имена всех игроков раунда, играющих на поле вместе с
// вызвавшим (кроме самого вызвавшего). Порядок — как в participantsList.
function getFlightPlayerNames(roundData, excludeUid) {
    if (!roundData || !roundData.players) return [];
    var order = (Array.isArray(roundData.participantsList) && roundData.participantsList.length)
        ? roundData.participantsList
        : Object.keys(roundData.players);
    var names = [];
    order.forEach(function(pid) {
        if (pid === excludeUid) return;
        var p = roundData.players[pid];
        if (p && p.name) names.push(p.name);
    });
    return names;
}

// ==========================================
// TELEGRAM BOT OFFICIAL ALERTS (GROUP & CHANNEL)
// ==========================================
// Формат сообщения о вызове судьи/маршала (общий для Telegram и ВКонтакте):
//   Вызов Судьи / Вызов Маршала
//   Кто вызвал: Имя Фамилия игрока
//   Лунка: №N
//   Время: ЧЧ:ММ
//   Состав флайта: Имя Фамилия, ... (все игроки, играющие на поле
//   вместе с вызвавшим; для группового раунда)
function buildOfficialCallText(type, holeNum, callerName, flightNames, withHtml) {
    var isHtml = !!withHtml;
    var esc = isHtml ? (typeof escapeHtml === 'function' ? escapeHtml : function(v) { return String(v); }) : function(v) { return String(v); };
    var timeStr = typeof fmtTime === 'function' ? fmtTime(Date.now()) : new Date().toLocaleTimeString('ru-RU');
    var title = type === 'referee' ? '🚨 Вызов Судьи' : '🚨 Вызов Маршала';
    var bOpen = isHtml ? '<b>' : '', bClose = isHtml ? '</b>' : '';
    var parts = [];
    parts.push(isHtml ? '<b>' + title + '</b>' : title);
    parts.push(bOpen + 'Кто вызвал:' + bClose + ' ' + esc(callerName || 'Игрок'));
    parts.push(bOpen + 'Лунка:' + bClose + ' №' + holeNum);
    parts.push(bOpen + 'Время:' + bClose + ' ' + timeStr);
    var flight = (flightNames || []).map(function(n) { return String(n || '').trim(); }).filter(Boolean);
    if (flight.length) {
        parts.push(bOpen + 'Состав флайта:' + bClose + ' ' + esc(flight.join(', ')));
    }
    return parts.join('\n');
}

// Внутренний «молчаливый» отправитель: используется, когда вызов делает
// ИГРОК с поля — он не должен видеть «Тайм-аут соединения» / «Ошибка сети»
// в тосте (он уже нажал «Вызвать судью» и видит «🚨 Судья вызван»).
function sendTelegramDirectAlert(token, chat, labelName, type, holeNum, playerName, flightNames) {
    token = (token || '').trim();
    chat = (chat || '').trim();

    if (!token || !chat) {
        toast('⚠️ Укажите Bot Token и Chat ID / Username для ' + (labelName || 'Telegram'), 'error');
        return;
    }

    var text = buildOfficialCallText(type, holeNum, playerName, flightNames, true);

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function() { try { controller.abort(); } catch(e){} }, 6000) : null;

    var fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chat,
            text: text,
            parse_mode: 'HTML'
        })
    };
    if (controller) fetchOptions.signal = controller.signal;

    fetch('https://api.telegram.org/bot' + token + '/sendMessage', fetchOptions)
    .then(function(res) {
        if (timeoutId) clearTimeout(timeoutId);
        return res.json();
    })
    .then(function(data) {
        if (data && data.ok) {
            console.log('✅ Telegram alert delivered to ' + labelName + ':', data.result);
            toast('✅ Telegram сообщение доставлено в ' + (labelName || 'чат') + '!', 'success');
        } else {
            var errDesc = (data && data.description) ? data.description : 'Ошибка Telegram API';
            console.error('❌ Telegram Bot API Error (' + labelName + '):', errDesc);
            toast('❌ Ошибка Telegram (' + (labelName || 'чат') + '): ' + errDesc, 'error');
        }
    })
    .catch(function(err) {
        if (timeoutId) clearTimeout(timeoutId);
        var isAbort = err && err.name === 'AbortError';
        var errMsg = isAbort ? 'Таймаут соединения (6 сек)' : (err ? err.message : 'Ошибка сети');
        console.error('❌ Telegram Fetch Error (' + labelName + '):', err);
        toast('❌ Ошибка сети / Таймаут Telegram: ' + errMsg, 'error');
    });
}

// «Молчаливый» вариант: та же логика, но без тостов на ошибках и успехах.
// Используется, когда вызов инициирует ИГРОК — он не должен получать
// «Тайм-аут соединения» или «Ошибка сети», только «🚨 Судья вызван».
function sendTelegramSilentAlert(token, chat, type, holeNum, playerName, flightNames) {
    token = (token || '').trim();
    chat = (chat || '').trim();
    if (!token || !chat) return; // нет настроек — тихо выходим

    var text = buildOfficialCallText(type, holeNum, playerName, flightNames, true);

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function() { try { controller.abort(); } catch(e){} }, 6000) : null;

    var fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: text, parse_mode: 'HTML' })
    };
    if (controller) fetchOptions.signal = controller.signal;

    fetch('https://api.telegram.org/bot' + token + '/sendMessage', fetchOptions)
    .then(function(res) {
        if (timeoutId) clearTimeout(timeoutId);
        return res.json();
    })
    .then(function(data) {
        if (!data || !data.ok) {
            console.warn('⚠️ Telegram silent send failed:', data && data.description);
        }
    })
    .catch(function(err) {
        if (timeoutId) clearTimeout(timeoutId);
        // Намеренно НЕ показываем toast — игрок уже получил «🚨 Судья вызван».
        // Тайм-аут / ошибка сети — внутренняя кухня отправки уведомления админу,
        // а вызов уже зафиксирован в Firebase (`alerts/<id>`) и виден в админке.
        console.warn('⚠️ Telegram silent send error (suppressed):', err && err.message);
    });
}

function sendTelegramOfficialAlert(type, holeNum, playerName, flightNames, targetMode) {
    // ВАЖНО: этот вызов делает ИГРОК. Никаких тостов об ошибках сети / таймаутах
    // Telegram ему показывать нельзя — он уже видит «🚨 Судья вызван». Если Telegram
    // настроен и отвечает — это плюс. Если нет — вызов всё равно лежит в Firebase
    // и админ увидит его в панели «Вызовы».
    var groupToken = (localStorage.getItem('pestovo_tg_group_token') || localStorage.getItem('pestovo_tg_bot_token') || '').trim();
    var groupId = (localStorage.getItem('pestovo_tg_group_id') || localStorage.getItem('pestovo_tg_chat_id') || '').trim();

    var channelToken = (localStorage.getItem('pestovo_tg_channel_token') || groupToken || '').trim();
    var channelId = (localStorage.getItem('pestovo_tg_channel_id') || '').trim();

    if (groupToken && groupId && (targetMode === 'group' || !targetMode)) {
        sendTelegramSilentAlert(groupToken, groupId, type, holeNum, playerName, flightNames);
    }
    if (channelToken && channelId && (targetMode === 'channel' || !targetMode)) {
        sendTelegramSilentAlert(channelToken, channelId, type, holeNum, playerName, flightNames);
    }

    if (!groupToken && !channelToken && typeof db !== 'undefined') {
        db.ref('settings/telegram').once('value').then(function(sn) {
            var tg = sn.val() || {};
            var gTok = (tg.groupToken || tg.botToken || '').trim();
            var gId = (tg.groupId || tg.chatId || '').trim();
            var cTok = (tg.channelToken || gTok || '').trim();
            var cId = (tg.channelId || '').trim();

            if (gTok && gId && (targetMode === 'group' || !targetMode)) {
                sendTelegramSilentAlert(gTok, gId, type, holeNum, playerName, flightNames);
            }
            if (cTok && cId && (targetMode === 'channel' || !targetMode)) {
                sendTelegramSilentAlert(cTok, cId, type, holeNum, playerName, flightNames);
            }
        });
    }
}

// ==========================================
// VK API OFFICIAL ALERTS
// Использует JSONP (<script>-тег) для обхода CORS-ограничений браузера.
// VK API официально поддерживает JSONP через параметр callback=.
// ==========================================

/**
 * Низкоуровневая отправка через JSONP — единственный способ вызвать
 * VK API из браузера без серверного прокси (обходит CORS).
 *
 * @param {string} token     - Access Token сообщества VK
 * @param {string} peerId    - Peer ID беседы / пользователя
 * @param {string} text      - Текст сообщения
 * @param {boolean} silent   - true = без тостов об ошибках
 */
function vkSendMessageJsonp(token, peerId, text, silent) {
    token = (token || '').trim();
    peerId = (peerId || '').trim();
    if (!token || !peerId) {
        if (!silent) toast('⚠️ Укажите VK Access Token и Peer ID в настройках', 'error');
        return;
    }

    var cbName = '_vkCb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    var randomId = Math.floor(Math.random() * 2000000000);
    var timeoutId = null;
    var script = null;

    var cleanup = function() {
        try { if (script && script.parentNode) script.parentNode.removeChild(script); } catch(e) {}
        try { delete window[cbName]; } catch(e) { window[cbName] = undefined; }
        if (timeoutId) clearTimeout(timeoutId);
    };

    window[cbName] = function(data) {
        cleanup();
        if (data && (data.response !== undefined) && data.response) {
            if (!silent) {
                console.log('✅ VK message sent, id:', data.response);
                toast('✅ Сообщение ВКонтакте доставлено!', 'success');
            }
        } else {
            var errCode = data && data.error && data.error.error_code;
            var errMsg  = data && data.error && data.error.error_msg
                          ? data.error.error_msg
                          : 'Ошибка VK API';
            console.error('❌ VK API Error ' + errCode + ':', errMsg, data);
            if (!silent) {
                toast('❌ VK API: ' + errMsg, 'error');
            } else {
                console.warn('⚠️ VK silent send failed (code ' + errCode + '):', errMsg);
            }
        }
    };

    var url = 'https://api.vk.com/method/messages.send' +
              '?access_token=' + encodeURIComponent(token) +
              '&peer_id='      + encodeURIComponent(peerId) +
              '&message='      + encodeURIComponent(text) +
              '&random_id='    + randomId +
              '&v=5.199' +
              '&callback='    + cbName;

    script = document.createElement('script');
    script.src = url;
    script.onerror = function() {
        cleanup();
        if (!silent) {
            toast('❌ Ошибка сети при отправке в VK (JSONP)', 'error');
        } else {
            console.warn('⚠️ VK JSONP network error (suppressed)');
        }
    };

    // Таймаут 10 секунд
    timeoutId = setTimeout(function() {
        cleanup();
        if (!silent) {
            toast('❌ Таймаут соединения с VK (10 сек)', 'error');
        } else {
            console.warn('⚠️ VK JSONP timeout (suppressed)');
        }
    }, 10000);

    (document.head || document.body).appendChild(script);
}

/**
 * Формирует текст уведомления о вызове судьи/маршала (обычный текст для VK).
 */
function vkBuildAlertText(type, holeNum, playerName, flightNames) {
    return buildOfficialCallText(type, holeNum, playerName, flightNames, false);
}

/**
 * Прямая отправка с тостами (для теста из админки).
 */
function sendVKDirectAlert(token, peerId, type, holeNum, playerName, flightNames) {
    token = (token || '').trim();
    peerId = (peerId || '').trim();
    if (!token || !peerId) {
        toast('⚠️ Укажите VK Access Token и Peer ID в настройках', 'error');
        return;
    }
    var text = vkBuildAlertText(type, holeNum, playerName, flightNames);
    vkSendMessageJsonp(token, peerId, text, false);
}

/**
 * «Молчаливый» вариант для ИГРОКА: без тостов об ошибках.
 */
function sendVKSilentAlert(token, peerId, type, holeNum, playerName, flightNames) {
    token = (token || '').trim();
    peerId = (peerId || '').trim();
    if (!token || !peerId) return;
    var text = vkBuildAlertText(type, holeNum, playerName, flightNames);
    vkSendMessageJsonp(token, peerId, text, true);
}

/**
 * Точка входа при вызове судьи/маршала ИГРОКОМ.
 * Читает настройки из localStorage → Firebase, отправляет молча.
 */
function sendVKOfficialAlert(type, holeNum, playerName, flightNames) {
    var vkToken  = (localStorage.getItem('pestovo_vk_token')   || '').trim();
    var vkPeerId = (localStorage.getItem('pestovo_vk_peer_id') || '').trim();

    if (vkToken && vkPeerId) {
        sendVKSilentAlert(vkToken, vkPeerId, type, holeNum, playerName, flightNames);
    } else if (typeof db !== 'undefined') {
        db.ref('settings/vk').once('value').then(function(sn) {
            var vk = sn.val() || {};
            var token = (vk.token  || '').trim();
            var peer  = (vk.peerId || '').trim();
            if (token && peer) {
                sendVKSilentAlert(token, peer, type, holeNum, playerName, flightNames);
            }
        }).catch(function(e) {
            console.warn('⚠️ VK: не удалось загрузить настройки из Firebase:', e);
        });
    }
}

// Глобальный дефолт показа Stableford синхронизируется на всех страницах.
// Личный выбор игрока хранится в rounds/<round>/players/<player>/stablefordDisplay
// и поэтому не перезаписывается этой настройкой.
if (typeof db !== 'undefined') {
    try {
        db.ref('settings/stableford_display_default').on('value', function(sn) {
            syncStablefordDisplayDefault(sn.val());
        });
    } catch (e) {}
}

// ==========================================
// DYNAMIC PAGE VISIBILITY MANAGEMENT
// ==========================================
var MANAGED_PAGES = [
    'guide.html',
    'feed.html',
    'predictor.html',
    'order-of-merit.html',
    'players.html',
    'tournaments.html',
    'stats.html',
    'handicap.html'
];

function getHiddenPages() {
    try {
        var local = localStorage.getItem('pestovo_hidden_pages');
        return local ? JSON.parse(local) : {};
    } catch(e) {
        return {};
    }
}

function applyPageVisibilitySettings() {
    if (typeof document === 'undefined') return;

    var hiddenPages = getHiddenPages();
    var curPage = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname.split('/').pop() || 'index.html' : 'index.html';

    var isTournamentsHidden = (hiddenPages['tournaments.html'] === true || hiddenPages['tournaments'] === true);
    var tnSel = document.getElementById('grp-tournament');
    if (tnSel) {
        var tnGroup = tnSel.closest('.form-group');
        if (tnGroup) {
            if (isTournamentsHidden) {
                tnGroup.style.setProperty('display', 'none', 'important');
                tnSel.value = '';
            } else {
                tnGroup.style.removeProperty('display');
            }
        }
    }

    MANAGED_PAGES.forEach(function(page) {
        var key = page.replace('.html', '');
        var isHidden = (hiddenPages[page] === true || hiddenPages[key] === true);
        var links = document.querySelectorAll('a[href*="' + page + '"]');
        links.forEach(function(link) {
            if (isHidden) {
                link.classList.add('nav-page-hidden');
                link.style.setProperty('display', 'none', 'important');
            } else {
                link.classList.remove('nav-page-hidden');
                link.style.removeProperty('display');
            }
        });
    });

    var groups = document.querySelectorAll('.mobile-drawer-group, .nav-group, .menu-group, .footer-group');
    groups.forEach(function(group) {
        var links = group.querySelectorAll('a');
        if (links.length > 0) {
            var visibleCount = 0;
            links.forEach(function(l) {
                if (l.style.display !== 'none' && !l.classList.contains('nav-page-hidden')) {
                    visibleCount++;
                }
            });
            if (visibleCount === 0) {
                group.style.setProperty('display', 'none', 'important');
            } else {
                group.style.removeProperty('display');
            }
        }
    });

    // Группа «Мои настройки» (без ссылок, но с тогглами) тоже можно скрывать через админку
    if (typeof isMyPreferencesEnabled === 'function' && !isMyPreferencesEnabled()) {
        var prefGroups = document.querySelectorAll('.mobile-drawer-group-preferences');
        prefGroups.forEach(function(g) {
            g.style.setProperty('display', 'none', 'important');
        });
    } else {
        var prefGroupsShow = document.querySelectorAll('.mobile-drawer-group-preferences');
        prefGroupsShow.forEach(function(g) {
            g.style.removeProperty('display');
        });
    }

    if (MANAGED_PAGES.includes(curPage) && (hiddenPages[curPage] === true || hiddenPages[curPage.replace('.html', '')] === true)) {
        var mainEl = document.querySelector('main') || document.body;
        if (mainEl && !document.getElementById('page-hidden-notice')) {
            var homeText = (typeof t === 'function' ? t('nav_home') : (currentLang === 'en' ? 'Home' : 'Главная'));
            mainEl.innerHTML =
                '<div class="container" style="padding:60px 20px;text-align:center;" id="page-hidden-notice">' +
                '<div class="card" style="max-width:500px;margin:0 auto;padding:40px;border:2px solid var(--gold);">' +
                '<div style="font-size:56px;color:var(--gold);margin-bottom:16px;"><i class="fas fa-eye-slash"></i></div>' +
                '<h2 style="color:var(--white);margin-bottom:10px;font-size:22px;">' + (currentLang === 'en' ? 'Page Hidden' : 'Страница скрыта администратором') + '</h2>' +
                '<p style="color:var(--muted);font-size:14px;margin-bottom:24px;line-height:1.6;">' + (currentLang === 'en' ? 'This page has been temporarily hidden by the club administrator.' : 'Эта страница временно убрана из доступа администратором клуба.') + '</p>' +
                '<a href="index.html" class="btn btn-g btn-lg"><i class="fas fa-home"></i> ' + homeText + '</a>' +
                '</div>' +
                '</div>';
        }
    }
}

if (typeof db !== 'undefined') {
    try {
        db.ref('settings/hidden_pages').on('value', function(sn) {
            var hp = sn.val() || {};
            localStorage.setItem('pestovo_hidden_pages', JSON.stringify(hp));
            applyPageVisibilitySettings();
        });
        // Синхронизация переключателя «Меню инструментов» между устройствами
        db.ref('settings/tools_menu_enabled').on('value', function(sn) {
            var v = sn.val();
            var enabled = (v === true || v === '1' || v === 1);
            try { localStorage.setItem('pestovo_tools_menu_enabled', enabled ? '1' : '0'); } catch(e) {}
            // Перерисовываем навигацию, чтобы кнопка появилась/исчезла сразу
            if (typeof navAuth === 'function' && typeof currentUser !== 'undefined') {
                navAuth(currentUser, currentUserData || null);
            }
            if (typeof buildMobileDrawer === 'function') buildMobileDrawer();
        });
        // Синхронизация переключателя «Мои настройки» между устройствами
        db.ref('settings/my_preferences_enabled').on('value', function(sn) {
            var v = sn.val();
            // По умолчанию ВКЛ — если ключа нет, не трогаем localStorage
            if (v === null || v === undefined) return;
            var enabled = (v === true || v === '1' || v === 1);
            try { localStorage.setItem('pestovo_my_preferences_enabled', enabled ? '1' : '0'); } catch(e) {}
            if (typeof buildMobileDrawer === 'function') buildMobileDrawer();
            if (typeof applyPageVisibilitySettings === 'function') applyPageVisibilitySettings();
        });
    } catch(e) {}
}

document.addEventListener('DOMContentLoaded', function() {
    applyPageVisibilitySettings();
});

// Нормализация ключа для Firebase (нельзя . $ # [ ] /)
function firebaseSafeKeyStr(s) { return String(s).replace(/[.$#\[\]\/]/g, '_'); }

// Детерминированный id гостя: одно и то же имя + HCP всегда даёт один и тот же id,
// чтобы игрок не дублировался в users при повторных раундах (соло, группа, турниры).
// Детерминированный id гостя: одно и то же ФИО всегда даёт один и тот же id,
// чтобы игрок не дублировался в users при повторных раундах (соло, группа, турниры).
// HCP НЕ входит в ключ — одинаковое имя с разным HCP это один и тот же человек,
// гандикап просто обновляется. Это предотвращает сдваивание игроков.
function buildGuestUserId(cleanName, exactHcp) {
    // exactHcp игнорируется для детерминизма по имени, чтобы не плодить дубли
    return firebaseSafeKeyStr('guest_' + cleanName.toLowerCase().replace(/\s+/g, '_'));
}

// Полный ФИО-ключ для дедупликации: имя + отчество + фамилия в нормализованном виде
function getPlayerFioKey(u) {
    if (!u) return '';
    var first = (u.firstName || '').toString();
    var middle = (u.middleName || '').toString();
    var last = (u.lastName || '').toString();
    var name = (u.name || '').toString();
    var combined = (first + ' ' + middle + ' ' + last).replace(/\s+/g, ' ').trim() || name;
    return normalizeSearchText(combined);
}

function getNamePartsNormalized(nameStr) {
    var s = normalizeSearchText(nameStr || '');
    return s ? s.split(' ').filter(Boolean) : [];
}

// Проверка совпадения по ФИО: учитывает оба порядка «Имя Фамилия» и «Фамилия Имя»
// и наличие отчества. Возвращает 'strong', 'loose' или null.
function isSamePersonByFio(localParts, remoteParts, localFullNorm, remoteFullNorm) {
    if (!localParts.length || !remoteParts.length) return null;
    if (localFullNorm && remoteFullNorm && localFullNorm === remoteFullNorm) return 'strong';
    if (localParts.length >= 2 && remoteParts.length >= 2) {
        var allLocalInRemote = localParts.every(function(p) { return remoteParts.indexOf(p) !== -1; });
        if (allLocalInRemote) return 'strong';
        var allRemoteMainInLocal = remoteParts.slice(0, 2).every(function(p) { return localParts.indexOf(p) !== -1; });
        if (allRemoteMainInLocal && localParts.length >= 2) return 'strong';
    }
    if (localParts.length >= 2 && remoteParts.length >= 2) {
        var lf = localParts[0], ll = localParts[localParts.length - 1];
        var rf = remoteParts[0], rl = remoteParts[remoteParts.length - 1];
        if ((lf === rf && ll === rl) || (lf === rl && ll === rf)) return 'strong';
    }
    var shared = localParts.filter(function(p) { return remoteParts.indexOf(p) !== -1; });
    if (shared.length >= 2) return 'strong';
    if (shared.length === 1 && shared[0].length > 2) {
        return 'loose';
    }
    return null;
}

function dedupePlayerEntriesByFio(entries) {
    // entries: array of [id, userData] or array of player objects with name
    // Возвращает отфильтрованный массив без дублей по ФИО
    var seen = {};
    var result = [];
    // Сортируем по приоритету: не гость > гость, больше раундов > меньше
    var sorted = (entries || []).slice().sort(function(a,b){
        var aIsArr = Array.isArray(a);
        var bIsArr = Array.isArray(b);
        var aData = aIsArr ? a[1] : a;
        var bData = bIsArr ? b[1] : b;
        var aId = aIsArr ? a[0] : (aData.id || aData.uid || '');
        var bId = bIsArr ? b[0] : (bData.id || bData.uid || '');
        var aGuest = !!(aData.isGuest || String(aId).indexOf('guest_')===0);
        var bGuest = !!(bData.isGuest || String(bId).indexOf('guest_')===0);
        if (aGuest !== bGuest) return aGuest ? 1 : -1;
        var aRounds = aData.roundsPlayed || 0;
        var bRounds = bData.roundsPlayed || 0;
        return bRounds - aRounds;
    });
    sorted.forEach(function(entry){
        var isArr = Array.isArray(entry);
        var data = isArr ? entry[1] : entry;
        var key = getPlayerFioKey(data) || normalizeSearchText(data.name || '');
        if (!key) {
            result.push(entry);
            return;
        }
        if (seen[key]) return;
        seen[key] = true;
        result.push(entry);
    });
    return result;
}

function dedupeRoundPlayersByFio(playersObj) {
    // playersObj: { pid: playerData }
    // Возвращает новый объект без дублей по ФИО (оставляет приоритетную запись)
    if (!playersObj || typeof playersObj !== 'object') return playersObj;
    var entries = Object.entries(playersObj);
    var deduped = dedupePlayerEntriesByFio(entries);
    var out = {};
    deduped.forEach(function(e){ out[e[0]] = e[1]; });
    return out;
}



function hcpKey1(v) {
    var n = parseFloat(v);
    if (isNaN(n)) n = 0;
    return Math.round(n * 10) / 10;
}

// ==========================================
// ЕДИНАЯ ИДЕМПОТЕНТНАЯ РЕГИСТРАЦИЯ ИГРОКА
// Возвращает Promise<userId>. Гарантирует, что один и тот же человек
// (одно имя / один uid) получает ОДНУ запись в users во всех режимах:
// одиночный раунд, групповой раунд, завершение раунда (история).
// Никогда не создаёт вторую запись, если игрок уже есть (по uid или по имени).
// ==========================================
function resolveOrCreatePlayerUser(p) {
    p = p || {};
    if (!p.name) return Promise.resolve(null);

    var cleanName = sanitizeNameRaw(p.name);
    if (!cleanName) return Promise.resolve(null);
    if (isBlockedDemoPlayer(null, cleanName)) return Promise.resolve(null);
    var parts = cleanName.split(' ');
    var firstName = p.firstName ? sanitizeNameRaw(p.firstName) : (parts[0] || cleanName);
    var middleName = p.middleName ? sanitizeNameRaw(p.middleName) : '';
    var lastName = p.lastName ? sanitizeNameRaw(p.lastName) : (parts.slice(1).join(' ') || '');
    var exactHcp = parseExactHcp(p.exactHcp != null ? p.exactHcp : (p.handicap || 0));
    var gender = p.gender || 'men';
    var defaultTee = p.tee || p.defaultTee || (gender === 'women' ? 'rd' : 'bl');

    // Патч для обновления: гандикап всегда, отчество только если было пусто и теперь есть
    var buildPatchForExisting = function(existingData) {
        existingData = existingData || {};
        var patch = { handicap: exactHcp };
        // Имя/фамилия — обновляем только если у существующего они пустые
        if (!existingData.firstName && firstName) patch.firstName = firstName;
        if (!existingData.lastName && lastName) patch.lastName = lastName;
        // Отчество — добавляем если его не было (требование: добавление отчества если не было)
        if (!existingData.middleName && middleName) {
            patch.middleName = middleName;
            // Обновляем полное имя на формат «Имя Отчество Фамилия»
            var newFull = (firstName + ' ' + middleName + ' ' + lastName).replace(/\s+/g, ' ').trim() || cleanName;
            patch.name = newFull;
        }
        // Если у существующего нет имени вообще — ставим новое
        if (!existingData.name && cleanName) patch.name = cleanName;
        if (!existingData.gender && gender) patch.gender = gender;
        return patch;
    };

    var updateLocalCaches = function(id, data) {
        if (!id) return;
        try {
            var custom = {};
            var existing = localStorage.getItem('pestovo_custom_players');
            if (existing) custom = JSON.parse(existing) || {};
            if (!custom[id]) {
                custom[id] = data;
                localStorage.setItem('pestovo_custom_players', JSON.stringify(custom));
            } else {
                // Обновляем гандикап и отчество если нужно, не создавая дубль
                var cur = custom[id] || {};
                if (data.handicap != null) cur.handicap = data.handicap;
                if (data.middleName && !cur.middleName) {
                    cur.middleName = data.middleName;
                    cur.name = data.name || cur.name;
                    cur.firstName = data.firstName || cur.firstName;
                    cur.lastName = data.lastName || cur.lastName;
                }
                custom[id] = cur;
                localStorage.setItem('pestovo_custom_players', JSON.stringify(custom));
            }
        } catch(e) {}
        if (typeof cachedRegisteredUsers !== 'undefined') {
            if (cachedRegisteredUsers[id]) {
                var cur = cachedRegisteredUsers[id] || {};
                if (data.handicap != null) cur.handicap = data.handicap;
                if (data.middleName && !cur.middleName) {
                    cur.middleName = data.middleName;
                    cur.name = data.name || cur.name;
                    cur.firstName = data.firstName || cur.firstName;
                    cur.lastName = data.lastName || cur.lastName;
                } else if (!cur.name && data.name) {
                    cur.name = data.name;
                }
                cachedRegisteredUsers[id] = Object.assign({}, cur, { handicap: data.handicap != null ? data.handicap : cur.handicap });
            } else {
                cachedRegisteredUsers[id] = Object.assign({}, cachedRegisteredUsers[id] || {}, data);
            }
            try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch(e) {}
        }
    };

    var finish = function(id, finalData) {
        var cacheData = { name: finalData && finalData.name ? finalData.name : cleanName, firstName: firstName, lastName: lastName, handicap: exactHcp, gender: gender, defaultTee: defaultTee };
        if (middleName) cacheData.middleName = middleName;
        if (finalData && finalData.middleName) cacheData.middleName = finalData.middleName;
        if (finalData && finalData.name) cacheData.name = finalData.name;
        updateLocalCaches(id, cacheData);
        return id;
    };

    if (p.uid) {
        var uidKey = firebaseSafeKeyStr(String(p.uid));
        if (!uidKey) return Promise.resolve(null);
        var uidData = {
            name: cleanName,
            firstName: firstName,
            lastName: lastName,
            handicap: exactHcp,
            gender: gender,
            defaultTee: defaultTee,
            role: 'player',
            isGuest: !!p.isGuest || uidKey.indexOf('guest_') === 0,
            createdAt: Date.now(),
            roundsPlayed: 0
        };
        if (middleName) uidData.middleName = middleName;
        if (typeof db === 'undefined') return Promise.resolve(finish(uidKey, uidData));
        return db.ref('users/' + uidKey).once('value').then(function(sn) {
            if (!sn.exists()) {
                return db.ref('users/' + uidKey).set(uidData).catch(function(){}).then(function() { return uidKey; });
            }
            var existing = sn.val() || {};
            var patch = buildPatchForExisting(existing);
            // Для uid — гандикап всегда обновляем, отчество добавляем если не было
            return db.ref('users/' + uidKey).update(patch).catch(function(){}).then(function() { return uidKey; });
        }).catch(function() { return uidKey; }).then(function(id){ return finish(id, uidData); });
    }

    var candidateId = buildGuestUserId(cleanName, exactHcp);
    if (!candidateId || candidateId === 'guest__') return Promise.resolve(null);

    var guestData = {
        name: cleanName,
        firstName: firstName,
        lastName: lastName,
        handicap: exactHcp,
        gender: gender,
        defaultTee: defaultTee,
        role: 'player',
        isGuest: true,
        createdAt: Date.now(),
        roundsPlayed: 0
    };
    if (middleName) guestData.middleName = middleName;

    if (typeof db === 'undefined') return Promise.resolve(finish(candidateId, guestData));

    // Ищем существующего игрока по ФИО (без учета HCP) — чтобы не плодить дубликаты
    // Одинаковое имя + разный HCP = один и тот же человек (гандикап обновляется)
    return db.ref('users').once('value').then(function(usn) {
        var users = usn.val() || {};
        var found = null;
        var foundData = null;
        var cleanParts = getNamePartsNormalized(cleanName);
        var cleanFullNorm = normalizeSearchText(cleanName);
        Object.keys(users).forEach(function(key) {
            var u = users[key] || {};
            if (isPlayerDeleted(key, u.name)) return;
            if (isBlockedDemoPlayer(key, u.name)) return;
            var existingFioKey = getPlayerFioKey(u);
            if (!existingFioKey) return;
            var existingParts = getNamePartsNormalized(u.name || ((u.firstName||'')+' '+(u.middleName||'')+' '+(u.lastName||'')));
            var existingFullNorm = normalizeSearchText(u.name || '');
            var match = isSamePersonByFio(existingParts, cleanParts, existingFullNorm, cleanFullNorm);
            // Также проверяем прямое совпадение ключа
            if (!match && existingFioKey === cleanFullNorm) match = 'strong';
            if (!match) return;
            // Выбираем лучшего: не гость приоритетнее, больше раундов приоритетнее
            var better;
            if (!found) better = true;
            else {
                var foundIsGuest = !!foundData.isGuest || String(found).indexOf('guest_') === 0;
                var curIsGuest = !!u.isGuest || String(key).indexOf('guest_') === 0;
                if (foundIsGuest && !curIsGuest) better = true;
                else if (foundIsGuest === curIsGuest) better = ((u.roundsPlayed || 0) > (foundData.roundsPlayed || 0));
                else better = false;
            }
            if (better) { found = key; foundData = u; }
        });
        if (found) {
            var patch = buildPatchForExisting(foundData);
            return db.ref('users/' + found).update(patch).catch(function(){}).then(function() { return found; });
        }
        // Проверяем детерминированный id
        return db.ref('users/' + candidateId).once('value').then(function(sn) {
            if (sn.exists()) {
                var existing = sn.val() || {};
                var patch = buildPatchForExisting(existing);
                return db.ref('users/' + candidateId).update(patch).catch(function(){}).then(function(){ return candidateId; });
            }
            return db.ref('users/' + candidateId).set(guestData).catch(function(){}).then(function(){ return candidateId; });
        });
    }).catch(function() {
        return candidateId;
    }).then(function(id){
        return finish(id, guestData);
    });
}


function registerGuestPlayerInDatabase(p) {
    return resolveOrCreatePlayerUser(p);
}
if (typeof window !== 'undefined') {
    window.registerGuestPlayerInDatabase = registerGuestPlayerInDatabase;
    window.resolveOrCreatePlayerUser = resolveOrCreatePlayerUser;
}

function normalizeSearchText(str) {
    if (!str) return '';
    return str.toString().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}
if (typeof window !== 'undefined') {
    window.normalizeSearchText = normalizeSearchText;
}

// ==========================================
// УДАЛЁННЫЕ ИГРОКИ (ЗАЩИТА ОТ «ВОСКРЕШЕНИЯ»)
// Запоминаем id и нормализованное имя удалённых в админке игроков,
// чтобы локальный кэш и история раундов не возвращали их в списки
// ==========================================
function getDeletedPlayerIds() {
    try {
        var raw = localStorage.getItem('pestovo_deleted_player_ids');
        if (raw) {
            var list = JSON.parse(raw);
            if (Array.isArray(list)) return list;
        }
    } catch(e) {}
    return [];
}

function isPlayerDeleted(id, name) {
    // Навсегда заблокированные демо-игроки проверяются в первую очередь
    if (typeof isBlockedDemoPlayer === 'function' && isBlockedDemoPlayer(id, name)) return true;
    var list = getDeletedPlayerIds();
    if (!list.length) return false;
    if (id && list.indexOf(id) !== -1) return true;
    var nm = name ? normalizeSearchText(name) : '';
    return !!nm && list.indexOf(nm) !== -1;
}

function markPlayerDeleted(id, name) {
    try {
        var list = getDeletedPlayerIds();
        var add = function(v) {
            if (v && list.indexOf(v) === -1) list.push(v);
        };
        add(id);
        add(name ? normalizeSearchText(name) : '');
        localStorage.setItem('pestovo_deleted_player_ids', JSON.stringify(list));
    } catch(e) {}
}

// ==========================================
// НАВСЕГДА ЗАБЛОКИРОВАННЫЕ ДЕМО-ИГРОКИ
// Старые версии сайта жёстко «подмешивали» в списки игроков демо-записи
// (Петр Один, Пётр Петров, Александр Иванов, Анна Воробьёва и т.д.).
// Из-за этого при каждом обновлении сайта они появлялись снова.
// Демо-список полностью УДАЛЁН из кода, а все известные id и имена
// навсегда заблокированы: даже если их запись осталась в Firebase
// (users / rounds) или в локальных кэшах старых версий, они нигде
// больше не показываются и не могут быть созданы заново.
// ==========================================
var BLOCKED_DEMO_PLAYER_IDS = [
    'user_petr_odin_17',
    'user_petr_odin_21',
    'user_petr_p',
    'user_vasya_p',
    'user_vladimir_v',
    'user_vladimir_v2',
    'user_anna_v',
    'user_alex_i',
    'user_ekaterina_p',
    'user_dmitry_s',
    'user_elena_k'
];

// Нормализованные имена (ё → е, нижний регистр, схлопнутые пробелы),
// включая варианты «Фамилия Имя», чтобы заблокировать и ghost-записи.
var BLOCKED_DEMO_PLAYER_NAMES = [
    'петр один',
    'один петр',
    'петр петров',
    'петров петр',
    'вася петров',
    'петров вася',
    'владимир воробьев',
    'воробьев владимир',
    'анна воробьева',
    'воробьева анна',
    'александр иванов',
    'иванов александр',
    'екатерина петрова',
    'петрова екатерина',
    'дмитрий смирнов',
    'смирнов дмитрий',
    'елена кузнецова',
    'кузнецова елена'
];

function isBlockedDemoPlayer(id, name) {
    if (id && BLOCKED_DEMO_PLAYER_IDS.indexOf(id) !== -1) return true;
    // ghost-записи из истории раундов имеют вид guest_name_имя_фамилия
    if (id && String(id).indexOf('guest_name_') === 0) {
        var ghostName = String(id).slice('guest_name_'.length).replace(/_/g, ' ').replace(/ё/g, 'е');
        ghostName = ghostName.replace(/\s+/g, ' ').trim();
        if (ghostName && BLOCKED_DEMO_PLAYER_NAMES.indexOf(ghostName) !== -1) return true;
    }
    if (name) {
        var nm = normalizeSearchText(name);
        if (nm && BLOCKED_DEMO_PLAYER_NAMES.indexOf(nm) !== -1) return true;
    }
    return false;
}
if (typeof window !== 'undefined') {
    window.isBlockedDemoPlayer = isBlockedDemoPlayer;
    window.BLOCKED_DEMO_PLAYER_IDS = BLOCKED_DEMO_PLAYER_IDS;
    window.BLOCKED_DEMO_PLAYER_NAMES = BLOCKED_DEMO_PLAYER_NAMES;
}

// Флаг «полной очистки» сохранён для обратной совместимости с админкой.
// Встроенных демо-игроков в коде больше нет.
function areDefaultPlayersCleared() {
    try { return localStorage.getItem('pestovo_defaults_cleared') === 'true'; } catch(e) { return false; }
}

// Встроенные демо-игроки навсегда удалены из кода — кэш игроков стартует пустым.
var cachedRegisteredUsers = {};

function purgeBlockedFromPlayerCaches() {
    var clean = function(raw) {
        if (!raw) return raw;
        var obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
            Object.keys(obj).forEach(function(k) {
                var u = obj[k];
                if (isBlockedDemoPlayer(k, u && u.name)) delete obj[k];
            });
        }
        return obj;
    };
    try {
        var c1 = localStorage.getItem('pestovo_cached_users');
        if (c1) localStorage.setItem('pestovo_cached_users', JSON.stringify(clean(c1)));
    } catch(e) {}
    try {
        var c2 = localStorage.getItem('pestovo_custom_players');
        if (c2) localStorage.setItem('pestovo_custom_players', JSON.stringify(clean(c2)));
    } catch(e) {}
}

// Полностью стирает локальный кэш игроков (и в памяти, и в localStorage),
// а также «прячет» встроенных демо-игроков, чтобы после удаления всех данных
// в админке ни один игрок нигде не всплыл заново.
function wipeLocalPlayerCaches() {
    try {
        localStorage.removeItem('pestovo_cached_users');
        localStorage.removeItem('pestovo_custom_players');
        localStorage.setItem('pestovo_defaults_cleared', 'true');
        // Сброс списка удалённых игроков — после полной очистки база пуста,
        // никакие id не должны считаться «удалёнными» (чтобы не мешали новой работе)
        localStorage.setItem('pestovo_deleted_player_ids', JSON.stringify([]));
    } catch(e) {}

    if (typeof cachedRegisteredUsers === 'object' && cachedRegisteredUsers) {
        Object.keys(cachedRegisteredUsers).forEach(function(k) {
            delete cachedRegisteredUsers[k];
        });
    }
    lastRemoteUserIds = null;
}

if (typeof window !== 'undefined') {
    window.wipeLocalPlayerCaches = wipeLocalPlayerCaches;
    window.areDefaultPlayersCleared = areDefaultPlayersCleared;
}

function syncKnownPlayersCache() {
    if (areDefaultPlayersCleared()) {
        try {
            localStorage.removeItem('pestovo_cached_users');
            localStorage.removeItem('pestovo_custom_players');
        } catch(e) {}
        return;
    }

    var deletedIds = [];
    try {
        var dRaw = localStorage.getItem('pestovo_deleted_player_ids');
        if (dRaw) deletedIds = JSON.parse(dRaw) || [];
    } catch(e) {}

    var mergeCache = function(obj) {
        Object.keys(obj).forEach(function(k) {
            if (isPlayerDeleted(k, obj[k] && obj[k].name)) return;
            if (obj[k] && obj[k].name) {
                var nKey = normalizeSearchText(obj[k].name);
                if (nKey && deletedIds.indexOf(nKey) !== -1) return;
            }
            cachedRegisteredUsers[k] = obj[k];
        });
    };

    try {
        var localCached = localStorage.getItem('pestovo_cached_users');
        if (localCached) {
            var p1 = JSON.parse(localCached);
            if (p1 && typeof p1 === 'object') mergeCache(p1);
        }
    } catch(e) {}

    try {
        var custom = localStorage.getItem('pestovo_custom_players');
        if (custom) {
            var p2 = JSON.parse(custom);
            if (p2 && typeof p2 === 'object') mergeCache(p2);
        }
    } catch(e) {}

    // Дедуп по ФИО в локальном кэше, чтобы не было сдваивания
    try {
        var entries = Object.entries(cachedRegisteredUsers);
        var deduped = dedupePlayerEntriesByFio(entries);
        // Очищаем и перезаписываем только дедуплицированными
        Object.keys(cachedRegisteredUsers).forEach(function(k){ delete cachedRegisteredUsers[k]; });
        deduped.forEach(function(en){ cachedRegisteredUsers[en[0]] = en[1]; });
    } catch(e) {}

    purgeBlockedFromPlayerCaches();
}

syncKnownPlayersCache();

var lastRemoteUserIds = null;

if (typeof db !== 'undefined') {
    try {
        db.ref('users').on('value', function(sn) {
            var val = sn.val();
            // Сброс: если после очистки БД в Firebase нет пользователей (val === null) —
            // полностью вычищаем in-memory кэш и localStorage, чтобы демо/удалённые
            // игроки не «воскрешали» при обновлении страницы.
            if (!val || typeof val !== 'object' || Object.keys(val).length === 0) {
                Object.keys(cachedRegisteredUsers).forEach(function(k) {
                    delete cachedRegisteredUsers[k];
                });
                lastRemoteUserIds = [];
                try {
                    localStorage.removeItem('pestovo_cached_users');
                    localStorage.removeItem('pestovo_custom_players');
                    localStorage.setItem('pestovo_defaults_cleared', 'true');
                } catch(e) {}
                return;
            }
            Object.assign(cachedRegisteredUsers, val);
            // Игрок, которого удалили в Firebase, должен исчезнуть из локального кэша
            // (Object.assign только добавляет, поэтому удаляем ключи из прошлого снапшота)
            if (lastRemoteUserIds) {
                lastRemoteUserIds.forEach(function(key) {
                    if (!Object.prototype.hasOwnProperty.call(val, key)) {
                        delete cachedRegisteredUsers[key];
                        // Также убираем guest_name_-записи, ссылающиеся на удалённого игрока
                        var removed = cachedRegisteredUsers[key];
                        if (removed && removed.name) {
                            var ghostKey = 'guest_name_' + removed.name.toLowerCase().replace(/\s+/g, '_');
                            delete cachedRegisteredUsers[ghostKey];
                        }
                    }
                });
            }
            lastRemoteUserIds = Object.keys(val);
            // Убираем ghost-записи гостевых игроков, для которых уже существует
            // реальная запись в users с тем же именем (иначе игрок отображался дважды)
            Object.keys(cachedRegisteredUsers).forEach(function(k) {
                if (k.indexOf('guest_name_') !== 0) return;
                var ghost = cachedRegisteredUsers[k];
                if (!ghost || !ghost.name) return;
                var gName = normalizeSearchText(ghost.name);
                var hasReal = Object.keys(val).some(function(rk) {
                    var ru = val[rk];
                    if (!ru || !ru.name) return false;
                    if (normalizeSearchText(ru.name) !== gName) return false;
                    return true; // одинаковое имя = один игрок, HCP не разделяет
                });
                if (hasReal) delete cachedRegisteredUsers[k];
            });
            // Вычищаем из кэша всех игроков, помеченных как удалённые,
            // а также навсегда заблокированных демо-игроков
            var deleted = [];
            try {
                var dRaw = localStorage.getItem('pestovo_deleted_player_ids');
                if (dRaw) deleted = JSON.parse(dRaw) || [];
            } catch(e) {}
            Object.keys(cachedRegisteredUsers).forEach(function(k) {
                var u = cachedRegisteredUsers[k];
                if (!u) return;
                if (isPlayerDeleted(k, u.name)) { delete cachedRegisteredUsers[k]; return; }
                if (deleted.indexOf(k) !== -1) { delete cachedRegisteredUsers[k]; return; }
                if (u.name) {
                    var nKey = normalizeSearchText(u.name);
                    if (nKey && deleted.indexOf(nKey) !== -1) delete cachedRegisteredUsers[k];
                }
            });
            try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch(e) {}
        });
        db.ref('rounds').on('value', function(sn) {
            var roundsData = sn.val() || {};
            // Когда все раунды удалены (очистка БД) — раунды не должны «воскрешать»
            // гостевые записи игроков из несуществующих раундов.
            if (!roundsData || typeof roundsData !== 'object' || Object.keys(roundsData).length === 0) {
                return;
            }
            Object.values(roundsData).forEach(function(r) {
                if (r && r.players && typeof r.players === 'object') {
                    Object.entries(r.players).forEach(function(pe) {
                        var pid = pe[0], p = pe[1];
                        if (p && p.name) {
                            var pName = p.name.trim();
                            var normName = normalizeSearchText(pName);
                            // Усиленная проверка: не воскрешаем удалённых и навсегда
                            // заблокированных демо-игроков ни по uid, ни по имени
                            var deleted = [];
                            try {
                                var dRaw = localStorage.getItem('pestovo_deleted_player_ids');
                                if (dRaw) deleted = JSON.parse(dRaw) || [];
                            } catch(e) {}
                            var isDel = (deleted.indexOf(pid) !== -1) || (normName && deleted.indexOf(normName) !== -1) || isBlockedDemoPlayer(pid, pName);
                            if (isDel) return;
                            var key = pid.startsWith('guest_') ? ('guest_name_' + pName.toLowerCase().replace(/\s+/g, '_')) : pid;
                            // Не перезаписываем существующую запись, если игрок уже в кэше с корректными данными —
                            // и только добавляем гостевую запись, если её действительно нет.
                            // Дополнительно: если игрок с таким же именем и HCP уже есть в кэше
                            // (зарегистрированный или гостевой из users) — ghost-дубль не создаём.
                            if (!cachedRegisteredUsers[key]) {
                                var dupInCache = Object.keys(cachedRegisteredUsers).some(function(ck) {
                                    if (ck === key) return false;
                                    var cu = cachedRegisteredUsers[ck];
                                    if (!cu || !cu.name) return false;
                                    if (normalizeSearchText(cu.name) !== normName) return false;
                                    return true; // дедуп по имени, без учета HCP
                                });
                                if (!dupInCache) {
                                    var parts = pName.split(' ');
                                    cachedRegisteredUsers[key] = {
                                        name: pName,
                                        firstName: parts[0] || pName,
                                        lastName: parts.slice(1).join(' ') || '',
                                        handicap: p.exactHcp != null ? p.exactHcp : (p.fieldHcp || 0),
                                        gender: p.gender || 'men',
                                        defaultTee: p.tee || (p.gender === 'women' ? 'rd' : 'bl'),
                                        isGuest: true
                                    };
                                }
                            }
                        }
                    });
                }
            });
        });
    } catch(e) {}
}

function getKnownPlayersSync() {
    syncKnownPlayersCache();
    return cachedRegisteredUsers;
}

function loadAllRegisteredUsers(callback) {
    if (typeof callback === 'function') {
        callback(getKnownPlayersSync());
    }
}


// ==========================================
// ФИО: разбор частей и отображение
// «Фамилия Имя Отчество» — только визуал автоподбора.
// В поля формы всегда кладём firstName/lastName/middleName по смыслу.
// ==========================================
function looksLikePatronymic(s) {
    s = normalizeSearchText(s || '');
    if (!s) return false;
    return /(ович|евич|ич|овна|евна|ична|инична)$/.test(s);
}

function looksLikeLastName(s) {
    s = normalizeSearchText(s || '');
    if (!s || s.length < 3) return false;
    return /(ов|ева|ова|ев|ин|ына|ина|ын|ский|цкий|ская|цкая|енко|ук|юк|ко)$/.test(s);
}

function joinNameParts(parts) {
    return (parts || []).map(function(x) { return String(x || '').trim(); }).filter(Boolean).join(' ');
}

function formatFioLastFirstMiddle(firstName, lastName, middleName) {
    return joinNameParts([lastName, firstName, middleName]);
}

function resolvePlayerNameParts(u) {
    u = u || {};
    var first = String(u.firstName || '').replace(/\s+/g, ' ').trim();
    var middle = String(u.middleName || '').replace(/\s+/g, ' ').trim();
    var last = String(u.lastName || '').replace(/\s+/g, ' ').trim();
    var name = String(u.name || '').replace(/\s+/g, ' ').trim();
    var tokens = name ? name.split(' ').filter(Boolean) : [];

    // Если имя и отчество перепутаны в полях — меняем местами.
    if (first && middle && looksLikePatronymic(first) && !looksLikePatronymic(middle)) {
        var swapped = first;
        first = middle;
        middle = swapped;
    }

    // Имя+отчество в одном поле firstName: «Иван Иванович»
    if (!middle && first && first.indexOf(' ') !== -1) {
        var fp = first.split(' ').filter(Boolean);
        if (fp.length >= 2 && looksLikePatronymic(fp[fp.length - 1])) {
            middle = fp.slice(1).join(' ');
            first = fp[0];
        }
    }

    // Отчество попало в фамилию: «Иванович Петров» или «Петров Иванович»
    if (!middle && last && last.indexOf(' ') !== -1) {
        var lp = last.split(' ').filter(Boolean);
        if (lp.length >= 2 && looksLikePatronymic(lp[0])) {
            middle = lp[0];
            last = lp.slice(1).join(' ');
        } else if (lp.length >= 2 && looksLikePatronymic(lp[lp.length - 1])) {
            middle = lp[lp.length - 1];
            last = lp.slice(0, -1).join(' ');
        }
    }

    // Добираем недостающие части из полного name, учитывая разные порядки.
    if (tokens.length >= 3 && (!first || !last || !middle)) {
        var t0 = tokens[0];
        var t1 = tokens[1];
        var tLast = tokens[tokens.length - 1];
        var tMid = tokens.slice(1, -1).join(' ');
        var tRest = tokens.slice(2).join(' ');
        if (looksLikeLastName(t0) && looksLikePatronymic(t1) && !looksLikePatronymic(tLast)) {
            // «Фамилия Отчество Имя»
            if (!last) last = t0;
            if (!middle) middle = t1;
            if (!first) first = tokens.slice(2).join(' ');
        } else if (looksLikeLastName(t0) && looksLikePatronymic(tLast)) {
            // «Фамилия Имя Отчество»
            if (!last) last = t0;
            if (!first) first = t1;
            if (!middle) middle = tRest;
        } else if (looksLikePatronymic(t1) || looksLikeLastName(tLast)) {
            // «Имя Отчество Фамилия»
            if (!first) first = t0;
            if (!middle) middle = tMid;
            if (!last) last = tLast;
        } else if (looksLikeLastName(t0)) {
            if (!last) last = t0;
            if (!first) first = t1;
            if (!middle) middle = tRest;
        } else {
            if (!first) first = t0;
            if (!last) last = tLast;
            if (!middle) middle = tMid;
        }
    } else if (tokens.length === 2 && (!first || !last)) {
        if (looksLikeLastName(tokens[0]) && !looksLikeLastName(tokens[1])) {
            if (!last) last = tokens[0];
            if (!first) first = tokens[1];
        } else {
            if (!first) first = tokens[0];
            if (!last) last = tokens[1];
        }
    } else if (tokens.length === 1) {
        if (!first && !last) first = tokens[0];
    }

    var displayName = formatFioLastFirstMiddle(first, last, middle) || name;
    return {
        firstName: first,
        lastName: last,
        middleName: middle,
        displayName: displayName,
        storedName: name
    };
}

if (typeof window !== 'undefined') {
    window.resolvePlayerNameParts = resolvePlayerNameParts;
    window.formatFioLastFirstMiddle = formatFioLastFirstMiddle;
}

var currentAutocompleteMatches = [];
var currentAutocompleteCallback = null;
var activeAutocompleteDropdown = null;

function handlePlayerSelect(evt, idx) {
    if (evt) {
        if (evt.preventDefault) evt.preventDefault();
        if (evt.stopPropagation) evt.stopPropagation();
    }
    var match = currentAutocompleteMatches[idx];
    if (match && typeof currentAutocompleteCallback === 'function') {
        currentAutocompleteCallback(match);
    }
    if (activeAutocompleteDropdown) {
        activeAutocompleteDropdown.style.display = 'none';
        activeAutocompleteDropdown.classList.add('hidden');
    }
}

function attachPlayerNameAutocomplete(inputEl, containerEl, onSelectCallback) {
    if (!inputEl) return;
    initPlayerSearchAutofill({
        searchInputId: inputEl.id,
        onSelect: onSelectCallback,
        onClear: null
    });
}

function initPlayerSearchAutofill(opts) {
    opts = opts || {};
    var searchInputId = opts.searchInputId;
    var onSelect = opts.onSelect;
    var onClear = opts.onClear;

    var inputEl = document.getElementById(searchInputId);
    if (!inputEl) return;

    inputEl.setAttribute('autocomplete', 'off');
    inputEl.setAttribute('autocorrect', 'off');

    var parent = inputEl.parentElement;
    if (parent) {
        parent.style.position = 'relative';
        parent.style.overflow = 'visible';
    }

    var oldDropdown = parent ? parent.querySelector('.autocomplete-suggestions') : null;
    if (oldDropdown) oldDropdown.remove();

    var dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-suggestions hidden';
    dropdown.style.display = 'none';

    if (parent) {
        parent.appendChild(dropdown);
    } else {
        document.body.appendChild(dropdown);
    }

    var activeMatches = [];
    var highlightedIdx = -1;

    var updateHighlight = function() {
        var items = dropdown.querySelectorAll('.autocomplete-item');
        items.forEach(function(item, i) {
            if (i === highlightedIdx) {
                item.classList.add('active-keyboard');
                try { item.scrollIntoView({ block: 'nearest' }); } catch(e) {}
            } else {
                item.classList.remove('active-keyboard');
            }
        });
    };

    var triggerSelection = function(match) {
        if (!match) return;
        if (typeof onSelect === 'function') {
            onSelect(match);
        }
        dropdown.style.display = 'none';
        dropdown.classList.add('hidden');
        highlightedIdx = -1;
        try { inputEl.blur(); } catch(e) {}
    };

    var handleInput = function() {
        var query = inputEl.value.trim().toLowerCase();
        if (!query || query.length < 1) {
            dropdown.style.display = 'none';
            dropdown.classList.add('hidden');
            highlightedIdx = -1;
            if (typeof onClear === 'function') onClear();
            return;
        }

        var usersData = getKnownPlayersSync();
        var matches = [];
        var seenKeys = {};

        Object.entries(usersData || {}).forEach(function(e) {
            var uid = e[0];
            var u = e[1];
            var name = (u.name || '').trim();
            var parts = resolvePlayerNameParts(u);
            var fn = parts.firstName;
            var mn = parts.middleName;
            var ln = parts.lastName;
            var email = (u.email || '').trim();

            // Подсказка и выбранная строка: «Фамилия Имя Отчество».
            // Части first/last/middle при этом остаются своими — ими заполняем поля.
            var full = parts.displayName || name;
            if (!full) return;

            // Защита: не показывать удалённых в админке игроков
            if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(uid, name)) return;

            // Короткая старая запись «Имя Фамилия» и обновлённая запись
            // «Имя Отчество Фамилия» — один человек. Ключ без HCP и отчества
            // убирает старый guest-вариант из автодобавления после синхронизации.
            var normKey = (fn && ln)
                ? normalizeSearchText(fn + ' ' + ln)
                : normalizeSearchText(full);
            var isGuestEntry = !!u.isGuest || String(uid).indexOf('guest_') === 0;
            var prevUid = seenKeys[normKey];
            if (prevUid !== undefined) {
                // Приоритет: зарегистрированная запись, затем запись с полным ФИО.
                var prev = usersData[prevUid] || {};
                var prevIsGuest = !!prev.isGuest || String(prevUid).indexOf('guest_') === 0;
                var prevMiddle = String(prev.middleName || '').trim();
                var preferNew = (prevIsGuest && !isGuestEntry) ||
                    (prevIsGuest === isGuestEntry && !prevMiddle && !!mn);
                if (preferNew) {
                    matches = matches.filter(function(m) { return m.uid !== prevUid; });
                } else {
                    return;
                }
            }

            var fnLower = fn.toLowerCase();
            var mnLower = mn.toLowerCase();
            var lnLower = ln.toLowerCase();
            var fullLower = full.toLowerCase();
            var nameLower = name.toLowerCase();

            var isPrefixMatch = (fnLower.startsWith(query) || mnLower.startsWith(query) || lnLower.startsWith(query) || fullLower.startsWith(query) || nameLower.startsWith(query) || fullLower.includes(query));

            if (isPrefixMatch) {
                seenKeys[normKey] = uid;
                var playerObj = {
                    uid: uid,
                    name: full,
                    firstName: fn,
                    lastName: ln,
                    middleName: mn,
                    handicap: u.handicap != null ? u.handicap : 0,
                    gender: u.gender || 'men',
                    defaultTee: u.defaultTee || (u.gender === 'women' ? 'rd' : 'bl'),
                    isGuest: isGuestEntry
                };
                matches.push(playerObj);
            }
        });

        if (matches.length === 0) {
            dropdown.style.display = 'none';
            dropdown.classList.add('hidden');
            highlightedIdx = -1;
            return;
        }

        activeMatches = matches;
        currentAutocompleteMatches = matches;
        currentAutocompleteCallback = onSelect;
        activeAutocompleteDropdown = dropdown;
        highlightedIdx = -1;

        var html = '';
        matches.slice(0, 8).forEach(function(m, idx) {
            var gIcon = m.gender === 'women' ? '👩' : '👨';
            var hcpText = fmtExactHcp(m.handicap) + ' HCP';
            var guestTag = m.isGuest ? ' <span style="font-size:10px;color:var(--gold);">(Гость)</span>' : '';

            html += '<div class="autocomplete-item" data-idx="' + idx + '" style="padding:12px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.08);min-height:44px;">';
            html += '<span>' + gIcon + ' <strong style="color:var(--white);font-size:14px;">' + escapeHtml(m.name) + '</strong>' + guestTag + '</span>';
            html += '<span style="color:var(--gold);font-weight:700;font-size:13px;">' + hcpText + '</span>';
            html += '</div>';
        });

        dropdown.innerHTML = html;
        dropdown.style.display = 'block';
        dropdown.classList.remove('hidden');

        dropdown.querySelectorAll('.autocomplete-item').forEach(function(item) {
            var handleTap = function(evt) {
                if (evt.cancelable) evt.preventDefault();
                evt.stopPropagation();
                var idxAttr = item.getAttribute('data-idx');
                var idx = parseInt(idxAttr);
                var match = activeMatches[idx];
                if (match) {
                    triggerSelection(match);
                }
            };

            item.addEventListener('touchstart', handleTap, { passive: false });
            item.addEventListener('mousedown', handleTap);
            item.addEventListener('click', handleTap);
        });
    };

    inputEl.addEventListener('keydown', function(e) {
        if (dropdown.style.display === 'none' || activeMatches.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightedIdx = (highlightedIdx + 1) % activeMatches.length;
            updateHighlight();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightedIdx = (highlightedIdx - 1 + activeMatches.length) % activeMatches.length;
            updateHighlight();
        } else if (e.key === 'Enter') {
            if (highlightedIdx >= 0 && highlightedIdx < activeMatches.length) {
                e.preventDefault();
                triggerSelection(activeMatches[highlightedIdx]);
            }
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
            dropdown.classList.add('hidden');
            highlightedIdx = -1;
        }
    });

    inputEl.addEventListener('input', handleInput);
    inputEl.addEventListener('focus', handleInput);

    document.addEventListener('touchstart', function(e) {
        if (e.target !== inputEl && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
            dropdown.classList.add('hidden');
            highlightedIdx = -1;
        }
    });
    document.addEventListener('click', function(e) {
        if (e.target !== inputEl && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
            dropdown.classList.add('hidden');
            highlightedIdx = -1;
        }
    });
}

// ==========================================
// КОНФИДЕНЦИАЛЬНОСТЬ ИМЁН (ФИО)
// Админ может скрывать полные имена игроков (имя/фамилия/отчество) от других
// игроков и гостей. Вместо ФИО показываются инициалы («И. Т.») или маска
// («Игрок №N»). Гандикап и история раундов остаются доступны. Админ и сам
// игрок всегда видят своё имя. Настройки: settings/privacy в Firebase:
//   { enabled: bool, maskMode: 'initials'|'masked', players: { uid: bool } }
// Для конкретного игрока players[uid]=true — скрыть (перекрывает глобальный
// выключатель), players[uid]=false — показывать, даже если включено глобально.
// ==========================================
var pestovoPrivacy = { enabled: false, maskMode: 'initials', players: {}, loaded: false };

function initPrivacySettings() {
    // Начальные значения из локального кэша (офлайн/при первом кадре)
    try {
        var cached = localStorage.getItem('pestovo_privacy');
        if (cached) {
            var c = JSON.parse(cached);
            if (c && typeof c === 'object') {
                pestovoPrivacy.enabled = c.enabled === true;
                pestovoPrivacy.maskMode = c.maskMode === 'masked' ? 'masked' : 'initials';
                pestovoPrivacy.players = c.players || {};
            }
        }
    } catch (e) {}

    if (typeof db === 'undefined') { pestovoPrivacy.loaded = true; return; }
    try {
        db.ref('settings/privacy').on('value', function(sn) {
            var v = sn.val() || {};
            pestovoPrivacy.enabled = v.enabled === true;
            pestovoPrivacy.maskMode = v.maskMode === 'masked' ? 'masked' : 'initials';
            pestovoPrivacy.players = v.players || {};
            pestovoPrivacy.loaded = true;
            try {
                localStorage.setItem('pestovo_privacy', JSON.stringify({
                    enabled: pestovoPrivacy.enabled,
                    maskMode: pestovoPrivacy.maskMode,
                    players: pestovoPrivacy.players
                }));
            } catch (e2) {}
            // После обновления настроек приватности — перерисуем открытые блоки на главной
            if (typeof renderPrivacySensitiveHome === 'function') renderPrivacySensitiveHome();
        }, function() {});
    } catch (e) { pestovoPrivacy.loaded = true; }
}

function privacyIsAdmin() {
    try {
        if (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.role === 'admin') return true;
        if (sessionStorage.getItem('pestovo_is_admin') === 'true') return true;
    } catch (e) {}
    return false;
}

function privacyShouldHide(pid) {
    if (typeof currentUser !== 'undefined' && currentUser && pid && currentUser.uid === pid) return false;
    if (privacyIsAdmin()) return false;
    if (!pid) return false;
    var ind = pestovoPrivacy.players && pestovoPrivacy.players[pid];
    if (ind === false) return false;   // явное «показывать» для этого игрока
    if (ind === true) return true;     // явное «скрыть» для этого игрока
    return pestovoPrivacy.enabled === true;
}

function privacyMaskNumber(s) {
    var h = 0;
    s = String(s || '');
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
    return (h % 999) + 1;
}

function privacyMaskName(name, pid) {
    if (pestovoPrivacy.maskMode === 'masked') {
        var word = (typeof currentLang !== 'undefined' && currentLang === 'en') ? 'Player' : 'Игрок';
        return word + ' №' + privacyMaskNumber(pid || name);
    }
    // Инициалы: «Иван Тестов» → «И. Т.»
    var parts = String(name || '').replace(/\s+/g, ' ').trim().split(' ');
    var initials = parts.filter(Boolean).slice(0, 2).map(function(w) { return w.charAt(0).toUpperCase() + '.'; }).join(' ');
    return initials || '?';
}

function privacyDisplayName(p, pid) {
    if (!p) return '—';
    if (privacyShouldHide(pid)) return privacyMaskName(p.name, pid);
    return p.name || '—';
}

document.addEventListener('DOMContentLoaded', function() {
    if (typeof initPrivacySettings === 'function') initPrivacySettings();
});
