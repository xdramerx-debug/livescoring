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
function vib(ms){if(navigator.vibrate)navigator.vibrate(ms||50);}
function fmtDate(ts){if(!ts)return'—';return new Date(ts).toLocaleDateString(currentLang === 'en' ? 'en-US' : 'ru-RU',{day:'2-digit',month:'short',year:'numeric'});}
function fmtTime(ts){if(!ts)return'—';var d=new Date(ts),h=d.getHours(),m=d.getMinutes();return(h<10?'0':'')+h+':'+(m<10?'0':'')+m;}
function baseUrl(){var loc=window.location,path=loc.pathname,dir=path.substring(0,path.lastIndexOf('/')+1);return loc.origin+dir;}
function qrUrl(data){return'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='+encodeURIComponent(data);}

// ==========================================
// МЕЖДУНАРОДНЫЙ ЯЗЫКОВОЙ ПЕРЕКЛЮЧАТЕЛЬ (RU / EN)
// ==========================================
var currentLang = (typeof localStorage !== 'undefined' && localStorage.getItem('pestovo_lang')) || 'ru';

var I18N = {
    ru: {
        brand_name: 'Пестово',
        nav_home: 'Главная', nav_round: 'Раунд', nav_leaderboard: 'Все раунды',
        nav_guide: 'Книга поля', nav_feed: 'Лента событий', nav_predictor: 'Симулятор WHS', nav_oom: 'Зачёт сезона',
        nav_players: 'Игроки', nav_tournaments: 'Турниры', nav_stats: 'Статистика',
        nav_handicaps: 'Гандикапы', nav_admin: 'Админ', nav_login: 'Войти',
        footer_club: '© 2024 Гольф-клуб Пестово',

        hero_sub: 'Цифровая счётная карточка Пестово',
        hero_title: 'Лайв-скоринг и электронные карточки Пестово',
        hero_desc: '18 лунок · Пар 72 · Автоматический расчёт WHS-гандикапов',
        btn_start_game: 'Начать игру',
        btn_view_scores: 'Все раунды',
        sec_now_playing: 'Сейчас на поле',
        sec_my_active: 'Мои активные раунды',
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
        hole: 'Лунка', par: 'Пар', index: 'Индекс', gross: 'Gross', net: 'Net',
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
        share_card: 'Поделиться в соцсетях (PNG)',
        download_png: 'Скачать картинку (PNG)',
        share_native: 'Поделиться в приложении',

        page_title_live: 'Начать раунд',
        page_sub_live: 'Выберите режим или перейдите к игре',
        round_setup: 'Настройки раунда',
        group_setup_title: 'Настройка группы',
        solo_round: 'Одиночный раунд', group_round: 'Групповой раунд',
        solo_desc: 'Играете один. Сами вводите свой счёт на каждой лунке.',
        group_desc: 'От 2 до 4 игроков. Двойной ввод (свой счёт + счёт партнёра).',
        mode_solo_title: 'Одиночный раунд',
        mode_solo_desc: 'Играете один. Сами вводите свой счёт на каждой лунке.',
        mode_group_title: 'Групповой раунд',
        mode_group_desc: 'От 2 до 4 игроков. Двойной ввод (свой счёт + счёт партнёра).',
        tournament_opt: 'Турнир (опционально)',
        no_tournament: '— Без турнира —',
        start_time: 'Время старта', start_hole: 'Стартовая лунка',
        tee_select: 'ТИ', format_select: 'Формат',
        player_count: 'Количество игроков',
        player_count_1: '1 игрок', player_count_2: '2 игрока', player_count_3: '3 игрока', player_count_4: '4 игрока',
        player_data: 'Данные игрока',
        select_registered: 'Выбрать из зарегистрированных',
        guest_manual: '— Гость / ввести вручную —',
        first_name: 'Имя', last_name: 'Фамилия', gender_label: 'Пол',
        placeholder_first_name: 'Иван', placeholder_last_name: 'Петров',
        placeholder_tn_name: 'Чемпионат Пестово',
        placeholder_hcp_calc: '+2.4 или 12.4',
        men: 'Мужчина', women: 'Женщина',
        exact_hcp: 'Точный гандикап', field_hcp: 'Полевой гандикап',
        field_auto: 'Полевой (авто)',
        start_round_btn: 'Начать раунд', back_btn: 'Назад',
        timings_title: 'Тайминги',
        time_and_hole: 'Время и лунка',
        game_format: 'Формат игры',

        my_score: 'Мой счёт',
        marker_for: 'Маркер для',
        save_hole: 'Сохранить лунку', finish_round: 'Завершить раунд',
        next_hole_btn: 'На следующую лунку →',
        confirm_final_hole: 'Зафиксировать 18-ю лунку',
        waiting_for_marker: '⏳ Счёт отправлен. Ожидаем «На следующую лунку» от маркера',
        hole_finalized_both: '✅ Счёт зафиксирован и подтверждён обеими сторонами!',
        mismatch_error: '⚠️ Несовпадение с маркером! Исправьте результат.',
        call_referee: 'Вызвать судью', call_marshal: 'Вызвать маршала',
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
        tournament_date_label: 'Дата',
        tournament_name_label: 'Название',
        all_genders: 'Все', men_plural: 'Мужчины', women_plural: 'Женщины',
        quick_calc: 'Быстрый расчёт',
        full_table: 'Посмотреть полную таблицу',
        full_table_title: 'Посмотреть полную таблицу',
        full_table_sub: 'Выберите пол и ТИ — таблица появится ниже',
        tbl_gender: 'Пол игрока',
        tbl_select_gender: '— Выберите пол —',
        tbl_select_tee: '— Выберите ТИ —',
        select_gender_first: '— Сначала выберите пол —',
        from_col: 'Показатель от', to_col: 'Показатель до',
        round_history: 'История раундов',

        // Solo & Guest
        solo_sub: 'Гольф-клуб Пестово',
        guest_notice: 'Вы играете как гость.',
        login_link: 'Войти в аккаунт',
        guest_notice_suffix: ', чтобы сохранить раунд в истории.',
        current_score: 'Текущий счёт',
        view_mode_notice: 'Режим просмотра.',

        // Admin & Auth
        admin_login: 'Вход в админ-панель',
        admin_panel: 'Админ-панель',
        admin_desc: 'Войдите с мастер-паролем или авторизуйтесь через аккаунт с правами администратора.',
        username: 'Логин', password: 'Пароль',
        login_btn: 'Войти', register_btn: 'Регистрация', create_account: 'Создать аккаунт',
        continue_guest: 'Продолжить как гость',
        tab_rounds: 'Раунды', tab_alerts: 'Вызовы 🚨', tab_tournaments: 'Турниры',
        tab_players: 'Игроки и роли', tab_data: 'Данные',
        all_tournaments: 'Все турниры',
        create_tournament: 'Создать турнир',
        tournament_name: 'Название', tournament_date: 'Дата',
        available_formats: 'Доступные форматы', available_tees: 'Доступные ТИ',
        create_btn: 'Создать',
        admin_only_tournaments: 'Турниры создаёт только администратор.',
        admin_panel_link: 'Админка',
        referee_marshal_calls: 'Вызовы судей и маршалов',
        enable_push_notifications: 'Включить Push-уведомления',
        manage_players_roles: 'Управление игроками и ролями',
        manage_players_sub: 'Назначайте права Администратора другим игрокам. Администраторы получают полный доступ к этой панели.',
        data_management: 'Управление данными',
        data_danger_sub: 'Осторожно — действия необратимы.',
        delete_all_rounds: 'Удалить все раунды',
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
        round_leader: 'Лидер раунда', no_completed: 'Пока нет завершённых раундов'
    },
    en: {
        brand_name: 'Pestovo',
        nav_home: 'Home', nav_round: 'Round', nav_leaderboard: 'All Rounds',
        nav_guide: 'Course Guide', nav_feed: 'Live Feed', nav_predictor: 'WHS Predictor', nav_oom: 'Order of Merit',
        nav_players: 'Players', nav_tournaments: 'Tournaments', nav_stats: 'Statistics',
        nav_handicaps: 'Handicaps', nav_admin: 'Admin', nav_login: 'Login',
        footer_club: '© 2024 Pestovo Golf Club',

        hero_sub: 'Pestovo Digital Scorecard',
        hero_title: 'Pestovo Live Scoring & Digital Scorecards',
        hero_desc: '18 Holes · Par 72 · Automatic WHS Handicap Calculation',
        btn_start_game: 'Start Game',
        btn_view_scores: 'All Rounds',
        sec_now_playing: 'Currently Playing',
        sec_my_active: 'My Active Rounds',
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
        hole: 'Hole', par: 'Par', index: 'Index', gross: 'Gross', net: 'Net',
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
        share_card: 'Share Scorecard (PNG)',
        download_png: 'Download Image (PNG)',
        share_native: 'Share to Apps',

        page_title_live: 'Start Round',
        page_sub_live: 'Select mode or continue your game',
        round_setup: 'Round Settings',
        group_setup_title: 'Group Setup',
        solo_round: 'Solo Round', group_round: 'Group Round',
        solo_desc: 'Play solo. Enter your own score for each hole.',
        group_desc: '2 to 4 players. Dual entry (your score + partner score).',
        mode_solo_title: 'Solo Round',
        mode_solo_desc: 'Play solo. Enter your own score for each hole.',
        mode_group_title: 'Group Round',
        mode_group_desc: '2 to 4 players. Dual entry (your score + partner score).',
        tournament_opt: 'Tournament (optional)',
        no_tournament: '— No Tournament —',
        start_time: 'Start Time', start_hole: 'Start Hole',
        tee_select: 'Tee', format_select: 'Format',
        player_count: 'Number of Players',
        player_count_1: '1 Player', player_count_2: '2 Players', player_count_3: '3 Players', player_count_4: '4 Players',
        player_data: 'Player Details',
        select_registered: 'Select from registered users',
        guest_manual: '— Guest / enter manually —',
        first_name: 'First Name', last_name: 'Last Name', gender_label: 'Gender',
        placeholder_first_name: 'John', placeholder_last_name: 'Doe',
        placeholder_tn_name: 'Pestovo Championship',
        placeholder_hcp_calc: '+2.4 or 12.4',
        men: 'Male', women: 'Female',
        exact_hcp: 'Exact Handicap', field_hcp: 'Course Handicap',
        field_auto: 'Course HCP (auto)',
        start_round_btn: 'Start Round', back_btn: 'Back',
        timings_title: 'Hole Timings',
        time_and_hole: 'Time and Hole',
        game_format: 'Game Format',

        my_score: 'My Score',
        marker_for: 'Marker for',
        save_hole: 'Save Hole', finish_round: 'Finish Round',
        next_hole_btn: 'To Next Hole →',
        confirm_final_hole: 'Finalize Hole 18',
        waiting_for_marker: '⏳ Score sent. Waiting for marker to press "Next Hole"',
        hole_finalized_both: '✅ Score confirmed and finalized by both sides!',
        mismatch_error: '⚠️ Score mismatch with marker! Please correct before proceeding.',
        call_referee: 'Call Referee', call_marshal: 'Call Marshal',
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
        tournament_date_label: 'Date',
        tournament_name_label: 'Name',
        all_genders: 'All', men_plural: 'Male', women_plural: 'Female',
        quick_calc: 'Quick Calculator',
        full_table: 'View Full Table',
        full_table_title: 'View Full Table',
        full_table_sub: 'Select gender and tee — table will appear below',
        tbl_gender: 'Player Gender',
        tbl_select_gender: '— Select Gender —',
        tbl_select_tee: '— Select Tee —',
        select_gender_first: '— Select Gender First —',
        from_col: 'Handicap From', to_col: 'Handicap To',
        round_history: 'Round History',

        // Solo & Guest
        solo_sub: 'Pestovo Golf Club',
        guest_notice: 'You are playing as a guest.',
        login_link: 'Log in',
        guest_notice_suffix: ' to save round to history.',
        current_score: 'Current Score',
        view_mode_notice: 'View mode.',

        // Admin & Auth
        admin_login: 'Admin Panel Login',
        admin_panel: 'Admin Panel',
        admin_desc: 'Log in with master password or authenticate with an admin account.',
        username: 'Username', password: 'Password',
        login_btn: 'Log In', register_btn: 'Register', create_account: 'Create Account',
        continue_guest: 'Continue as Guest',
        tab_rounds: 'Rounds', tab_alerts: 'Alerts 🚨', tab_tournaments: 'Tournaments',
        tab_players: 'Players & Roles', tab_data: 'Data',
        all_tournaments: 'All Tournaments',
        create_tournament: 'Create Tournament',
        tournament_name: 'Name', tournament_date: 'Date',
        available_formats: 'Available Formats', available_tees: 'Available Tees',
        create_btn: 'Create',
        admin_only_tournaments: 'Tournaments are created by administrators only.',
        admin_panel_link: 'Admin Panel',
        referee_marshal_calls: 'Referee & Marshal Calls',
        enable_push_notifications: 'Enable Push Notifications',
        manage_players_roles: 'Manage Players & Roles',
        manage_players_sub: 'Assign Administrator rights to other players. Administrators get full access to this panel.',
        data_management: 'Data Management',
        data_danger_sub: 'Caution — actions are irreversible.',
        delete_all_rounds: 'Delete All Rounds',
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
        round_leader: 'Round Leader', no_completed: 'No completed rounds yet'
    }
};

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
    applyTranslations();
    updateLangButtons();
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

document.addEventListener('DOMContentLoaded', function() {
    applyTranslations();
});

// ==========================================
// БЛОК «МОИ АКТИВНЫЕ РАУНДЫ»
// ==========================================
function loadMyActiveRounds(targetId) {
    var el = document.getElementById(targetId);
    if (!el || typeof db === 'undefined') return;

    db.ref('rounds').on('value', function(snap) {
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
            var link = r.mode === 'solo' ? 'solo.html?round=' + id : 'live.html?round=' + id;
            var modeIcon = r.mode === 'solo' ? '<i class="fas fa-user"></i> ' + t('solo_round') : '<i class="fas fa-users"></i> ' + t('group_round');
            var teePill = fmtTeePill(r.tee);
            var playersCount = Object.keys(r.players || {}).length;

            html += '<div class="list-item" style="padding:16px;background:var(--input);border:1px solid var(--border);margin-bottom:10px;flex-wrap:wrap;gap:12px;">';
            html += '<div style="flex:1;min-width:200px;">';
            html += '<div style="font-weight:800;font-size:16px;color:var(--white);"><span class="live-dot" style="width:7px;height:7px;margin-right:6px;"></span> ' + t('brand_name') + ' · ' + modeIcon + '</div>';
            html += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' +
                    t('start') + ': ' + fmtTime(r.startTime) + ' · ' + t('hole') + ': №' + (r.startHole || 1) + ' · ' + t('tee_select') + ': ' + teePill + ' · ' + t('player') + ': ' + playersCount + '</div>';
            html += '</div>';
            html += '<a href="' + link + '" class="btn btn-g" style="align-self:center;"><i class="fas fa-gamepad"></i> ' + t('btn_start_game') + '</a>';
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

document.addEventListener('DOMContentLoaded', function() {
    initThemeMode();
});

// ==========================================
// ФИРМЕННЫЕ БЕЙДЖИ РЕЗУЛЬТАТОВ И ТИ
// ==========================================
function fmtTeePill(teeCode) {
    teeCode = teeCode || 'wh';
    var nameKey = 'tee_' + teeCode;
    var name = t(nameKey);
    if (!name || name === nameKey) name = TEES[teeCode] || 'White';
    return '<span class="tee-pill tee-' + teeCode + '">' + name + '</span>';
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
// ВСПЛЕСК КОНФЕТТИ ПРИ BIRDIE / EAGLE / HIO
// ==========================================
function triggerVictoryConfetti() {
    if (typeof document === 'undefined' || !document.body) return;
    var colors = ['#f39c12', '#c9a84c', '#e0c76a', '#2ecc71', '#ffffff'];
    for (var i = 0; i < 35; i++) {
        var p = document.createElement('div');
        p.className = 'confetti-particle';
        var dx = (Math.random() * 200 - 100) + 'px';
        var dur = (1.2 + Math.random() * 0.8) + 's';
        var color = colors[Math.floor(Math.random() * colors.length)];
        var left = (Math.random() * 100) + 'vw';
        
        p.style.left = left;
        p.style.top = '-20px';
        p.style.backgroundColor = color;
        p.style.animationDuration = dur;
        if (p.style.setProperty) {
            p.style.setProperty('--dx', dx);
        }
        document.body.appendChild(p);
        (function(elem) {
            setTimeout(function() { elem.remove(); }, 2000);
        })(p);
    }
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
    var sunIcon = isSun ? 'fa-sun' : 'far fa-sun';

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

            '<div class="mobile-drawer-body">' +
                '<div class="mobile-drawer-group">' +
                    '<div class="mobile-drawer-group-title">⛳ ' + (isEn ? 'Game & Rounds' : 'Игра и Раунды') + '</div>' +
                    '<a href="index.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-home"></i> <span data-i18n="nav_home">' + t('nav_home') + '</span></a>' +
                    '<a href="live.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-gamepad"></i> <span data-i18n="nav_round">' + t('nav_round') + '</span></a>' +
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
                '</div>' +
            '</div>' +

            '<div class="mobile-drawer-footer">' +
                '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
                    '<button class="sun-mode-btn" style="flex:1;justify-content:center;" onclick="toggleSunMode()"><i class="fas ' + sunIcon + '"></i> ' + sunTxt + '</button>' +
                    '<button class="lang-btn" style="flex:1;justify-content:center;" onclick="toggleLang()">' + (isEn ? '🇬🇧 EN' : '🇷🇺 RU') + '</button>' +
                    '<button class="lang-btn" style="flex:1;justify-content:center;" onclick="closeMobileDrawer();openToolsMenu();"><i class="fas fa-toolbox"></i> ' + (isEn ? 'Tools' : 'Меню') + '</button>' +
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
}

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
function navAuth(u, d) {
    var e = document.getElementById('nav-auth');
    if (!e) return;
    var isSun = document.body && document.body.classList && document.body.classList.contains('sun-mode');
    var sunBtn = '<button class="sun-mode-btn" onclick="toggleSunMode()">' + (isSun ? '<i class="fas fa-sun"></i> ' + (currentLang === 'en' ? 'Sun ✅' : 'Солнце ✅') : '<i class="far fa-sun"></i> ' + (currentLang === 'en' ? 'Sun' : 'Солнце')) + '</button>';
    var langBtn = '<button class="lang-btn" onclick="toggleLang()">' + (currentLang === 'en' ? '🇬🇧 EN' : '🇷🇺 RU') + '</button>';
    var toolsBtn = '<button class="lang-btn" onclick="openToolsMenu()"><i class="fas fa-toolbox"></i> ' + (currentLang === 'en' ? 'Tools' : 'Меню') + '</button>';

    if (u && d) {
        var avatarMarkup = fmtUserAvatar(d, 30);
        e.innerHTML = '<div class="nav-user" style="cursor:pointer;" onclick="openPlayerProfileModal(\'' + u.uid + '\')">' +
            sunBtn + langBtn + toolsBtn + avatarMarkup +
            '<span class="nav-uname">' + (d.name || '') + '</span>' +
            '<button class="btn btn-og btn-sm" onclick="event.stopPropagation();doLogout()"><i class="fas fa-sign-out-alt"></i></button>' +
            '</div>';
    } else {
        e.innerHTML = '<div style="display:flex;align-items:center;gap:6px;">' + sunBtn + langBtn + toolsBtn + '<a href="auth.html" class="btn btn-g btn-sm" style="padding:5px 10px;font-size:11px;" data-i18n="nav_login">' + t('nav_login') + '</a></div>';
    }
}

function doLogout(){auth.signOut().then(function(){window.location.reload();});}
function holeOrder(sh){var o=[],h=parseInt(sh)||1;for(var i=0;i<18;i++){o.push(h);h=h>=18?1:h+1;}return o;}

function holeDeadline(startTime,startHole,targetHole){if(!startTime)return null;var tVal=0,h=parseInt(startHole)||1,c=0;while(c<18){tVal+=holeTiming(h);if(h===targetHole)break;h=h>=18?1:h+1;c++;}return startTime+tVal*60000;}
function checkTiming(startTime,startHole,holeNum){var dl=holeDeadline(startTime,startHole,holeNum);if(!dl)return{status:'ok',diff:0,deadline:null};var now=Date.now(),d=Math.round((now-dl)/60000);if(d>5)return{status:'late',diff:d,deadline:dl};if(d>0)return{status:'warning',diff:d,deadline:dl};return{status:'ok',diff:d,deadline:dl};}
function buildTimingNotice(st,sh,ch){var c=checkTiming(st,sh,ch);if(!c.deadline)return'';var dl=fmtTime(c.deadline),nw=fmtTime(Date.now());if(c.status==='late')return'<div class="timing-alert timing-late"><i class="fas fa-exclamation-triangle"></i><div><strong>' + (currentLang === 'en' ? 'Pace Lag!' : 'Отставание!') + '</strong><br>' + t('hole') + ' ' + ch + ': deadline ' + dl + ', now ' + nw + ' (' + c.diff + ' min)</div></div>';if(c.status==='warning')return'<div class="timing-alert timing-warn"><i class="fas fa-clock"></i><div><strong>' + (currentLang === 'en' ? 'Deadline Approaching' : 'Близко к дедлайну') + '</strong><br>' + t('hole') + ' ' + ch + ': ' + dl + '</div></div>';var a=Math.abs(c.diff);return'<div class="timing-alert timing-ok"><i class="fas fa-check-circle"></i><div>' + t('hole') + ' ' + ch + ': ' + (currentLang === 'en' ? 'On Pace' : 'в графике') + (a>0?' (' + (currentLang === 'en' ? 'buffer ' : 'запас ') + a + ' min)':'') + '</div></div>';}
function buildTimingTable(st, sh) {
    if (!st) return '';
    var startHole = parseInt(sh) || 1;

    var hole9Target = (startHole + 8 > 18) ? (startHole + 8 - 18) : (startHole + 8);
    var dl9 = holeDeadline(st, startHole, hole9Target);

    var hole18Target = (startHole + 17 > 18) ? (startHole + 17 - 18) : (startHole + 17);
    var dl18 = holeDeadline(st, startHole, hole18Target);

    var totalMin = Math.round((dl18 - st) / 60000);
    var hrs = Math.floor(totalMin / 60);
    var mins = totalMin % 60;
    var durationStr = hrs + (currentLang === 'en' ? 'h ' : 'ч ') + (mins < 10 ? '0' : '') + mins + (currentLang === 'en' ? 'm' : 'мин');

    var startStr = fmtTime(st);
    var turnStr = fmtTime(dl9);
    var finishStr = fmtTime(dl18);

    var html = '<div class="timing-summary-card">';
    html += '<div class="timing-pills-row">';
    html += '  <div class="timing-pill"><span class="tp-lbl">' + (currentLang === 'en' ? 'Start' : 'Старт') + '</span><span class="tp-val">' + startStr + '</span></div>';
    html += '  <div class="timing-pill"><span class="tp-lbl">' + (currentLang === 'en' ? 'Turn (9h)' : '9 лунок') + '</span><span class="tp-val">' + turnStr + '</span></div>';
    html += '  <div class="timing-pill tp-finish"><span class="tp-lbl">' + (currentLang === 'en' ? 'Finish (18h)' : 'Финиш') + '</span><span class="tp-val">' + finishStr + '</span></div>';
    html += '</div>';
    html += '<div class="timing-total-badge"><i class="fas fa-clock"></i> ' + (currentLang === 'en' ? 'Pace of Play: ' : 'Норматив раунда: ') + '<b>' + durationStr + '</b></div>';

    html += '<details class="timing-details"><summary><i class="fas fa-list-ol"></i> ' + (currentLang === 'en' ? 'Hole-by-Hole Deadlines' : 'Детализация по 18 лункам') + '</summary>';
    html += '<div class="timing-grid">';

    var h = startHole;
    for (var i = 0; i < 18; i++) {
        var dl = holeDeadline(st, startHole, h);
        var tMin = holeTiming(h);
        html += '<div class="timing-grid-item">';
        html += '  <span class="tg-hole">' + (currentLang === 'en' ? 'Hole ' : 'Л.') + h + ' <small>(P' + holePar(h) + '·' + tMin + 'm)</small></span>';
        html += '  <span class="tg-time">' + fmtTime(dl) + '</span>';
        html += '</div>';
        h = (h >= 18) ? 1 : h + 1;
    }
    html += '</div></details>';
    html += '</div>';
    return html;
}

const ADMIN_LOGIN='admin';
const ADMIN_PASS='pestovo2024';

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

function generateGroupHoleTableHTML(r) {
    var players = r.players || {};
    var playerEntries = Object.entries(players);
    if (!playerEntries.length) return '';

    var order = holeOrder(r.startHole || 1);

    // --- NO-SCROLL VERTICAL GRID MATRIX (100% FIT ON MOBILE SCREENS) ---
    var html = '<div class="no-scroll-view-container">';

    playerEntries.forEach(function(pe) {
        var pid = pe[0], p = pe[1];
        var sc = p.scores || {};
        var stats = calcRoundStats(sc, p.fieldHcp || 0, p.exactHcp || 0, order);
        var thruText = stats.holesPlayed >= 18 ? t('finished_f') : (stats.currentHole ? t('hole') + ' №' + stats.currentHole : '1/18');

        html += '<div class="noscroll-player-block" onclick="openPlayerProfileModal(\'' + pid + '\',\'' + (r.roundId || '') + '\')" style="cursor:pointer;">';
        html += '<div class="noscroll-player-hdr">';
        html += '<div><span class="noscroll-player-name"><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + (p.name || '—') + '</span>';
        html += '<div style="font-size:11px;color:var(--muted);margin-top:2px;">📍 ' + thruText + ' · Gross: ' + (stats.gross || 0) + ' · Net: ' + (stats.net || 0) + '</div></div>';
        html += '<div class="' + scoreClass(stats.toPar) + '" style="font-size:22px;font-weight:800;">' + fmtScore(stats.toPar) + '</div>';
        html += '</div>';

        // 18-Hole 6x3 Matrix (Fits 100% on any mobile screen width)
        html += '<div class="noscroll-grid">';
        for (var i = 1; i <= 18; i++) {
            var s = parseInt(sc[i]) || 0;
            var par = holePar(i);
            var cls = holeResClass(s, par);

            html += '<div class="noscroll-tile ' + cls + '">';
            html += '<div class="noscroll-hole">#' + i + '</div>';
            html += '<div class="noscroll-score">' + (s > 0 ? s : '—') + '</div>';
            html += '<div class="noscroll-par">p' + par + '</div>';
            html += '</div>';
        }
        html += '</div>';

        // Front 9 / Back 9 / Total Totals
        var outG = 0, inG = 0;
        for (var i = 1; i <= 9; i++) { var s = parseInt(sc[i]) || 0; if (s > 0) outG += s; }
        for (var i = 10; i <= 18; i++) { var s = parseInt(sc[i]) || 0; if (s > 0) inG += s; }

        html += '<div class="noscroll-totals">';
        html += '<span>OUT (1-9): <b>' + (outG > 0 ? outG : '—') + '</b></span>';
        html += '<span>IN (10-18): <b>' + (inG > 0 ? inG : '—') + '</b></span>';
        html += '<span>TOTAL: <b>' + (outG + inG > 0 ? (outG + inG) : '—') + '</b></span>';
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
        html += '<div style="flex:1;"><div class="profile-name">' + gIcon + ' ' + (u.name || '—') + guestBadge + '</div>';
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
            html += '<div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border);">';
            html += '<h3 style="color:var(--gold);margin-bottom:14px;font-family:var(--ff);font-size:18px;">' +
                    '<i class="fas fa-table"></i> ' + (currentLang === 'en' ? 'Round Scorecard' : 'Счётная карточка раунда') + ' (' + (rd.format || 'Stroke') + ' · ' + t('tee_select') + ': ' + fmtTeePill(rd.tee) + ')' +
                    '</h3>';
            
            if (typeof generatePestovoScorecardHTML === 'function') {
                html += generatePestovoScorecardHTML(roundPlayer, rd);
            }
            html += '</div>';
        }

        db.ref('users/' + playerId + '/history').once('value').then(function(hSn) {
            var history = hSn.val() || {};
            var rounds = Object.values(history);
            rounds.sort(function(a, b) { return (b.date || 0) - (a.date || 0); });

            if (rounds.length > 0) {
                html += renderTrophyCabinet(u, rounds);
                html += renderScoringDistributionBar(rounds);

                html += '<h3 style="color:var(--gold);margin:24px 0 12px;font-family:var(--ff);font-size:18px;"><i class="fas fa-history"></i> ' + t('round_history') + '</h3>';
                rounds.forEach(function(r) {
                    var isFull = r.holes === 18;
                    var fullTag = isFull ? ' <span style="color:#2ecc71;font-size:10px;">(18' + hTag + ')</span>' : ' <span style="color:var(--muted);font-size:10px;">(' + r.holes + hTag + ')</span>';

                    html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:8px;">';
                    html += '<div style="flex:1;min-width:180px;"><strong style="color:var(--white);">' + t('brand_name') + '</strong>' + fullTag;
                    html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' +
                            fmtDate(r.date) + ' · ' + (r.format || 'Stroke') + ' · ' + t('tee_select') + ': ' + (r.tee ? fmtTeePill(r.tee) : '—') +
                            ' · ' + (r.mode === 'solo' ? '👤' : '👥') + '</div>';
                    html += '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' +
                            (r.holeInOne ? '🎯 ' + r.holeInOne + ' · ' : '') +
                            '🦅 ' + (r.eagles || 0) + ' · 🐦 ' + (r.birdies || 0) + ' · Par ' + (r.pars || 0) + '</div></div>';
                    html += '<div style="text-align:right;">';
                    html += '<div style="font-size:22px;font-weight:800;color:var(--white);">' + r.gross + '</div>';
                    html += '<div class="' + scoreClass(r.toPar) + '" style="font-size:14px;font-weight:700;">' + fmtScore(r.toPar) + '</div>';
                    if (r.roundId) {
                        html += '<button class="btn btn-og btn-sm" style="margin-top:6px;" onclick="event.stopPropagation();downloadScorecard(\'' + r.roundId + '\')"><i class="fas fa-download"></i></button>';
                        html += '<button class="btn btn-g btn-sm" style="margin-top:6px;margin-left:6px;" onclick="event.stopPropagation();exportRoundPNG(\'' + r.roundId + '\')"><i class="fas fa-image"></i> PNG</button>';
                    }
                    html += '</div></div>';
                });
            }

            if (bodyEl) bodyEl.innerHTML = html;
        }).catch(function() {
            if (bodyEl) bodyEl.innerHTML = html;
        });
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
        html += '<div class="form-group"><label>' + t('first_name') + '</label><input type="text" id="edit-fn" class="form-input" value="' + firstName + '"></div>';
        html += '<div class="form-group"><label>' + t('last_name') + '</label><input type="text" id="edit-ln" class="form-input" value="' + lastName + '"></div>';
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
    var hcpInp = document.getElementById('edit-hcp');
    var genderInp = document.getElementById('edit-gender');
    var phoneInp = document.getElementById('edit-phone');
    var teeInp = document.getElementById('edit-tee');
    var avatarInp = document.getElementById('edit-avatar-val');

    var firstName = fnInp ? fnInp.value.trim() : '';
    var lastName = lnInp ? lnInp.value.trim() : '';
    var fullName = (lastName + ' ' + firstName).trim() || 'Player';
    var exactHcp = hcpInp ? parseExactHcp(hcpInp.value) : 0;
    var gender = genderInp ? genderInp.value : 'men';
    var phone = phoneInp ? phoneInp.value.trim() : '';
    var defaultTee = teeInp ? teeInp.value : 'wh';
    var avatar = avatarInp ? avatarInp.value : '';

    var updates = {
        name: fullName,
        firstName: firstName,
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
function openFinishConfirmModal(roundId, onConfirmCallback) {
    if (typeof db === 'undefined' || !roundId) return;

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
        var order = holeOrder(r.startHole || 1);
        var players = Object.entries(r.players || {});

        var titleStr = currentLang === 'en' ? '🏁 Finish Round Confirmation' : '🏁 Подтверждение завершения раунда';
        var subStr = currentLang === 'en' ? 'Please review final scores before finishing:' : 'Пожалуйста, проверьте итоговые результаты перед завершением:';
        var finishBtnStr = currentLang === 'en' ? '🏁 Finish & Save Round' : '🏁 Завершить раунд';
        var continueBtnStr = currentLang === 'en' ? '← Continue Playing' : '← Продолжить игру';

        var html = '<h2 style="color:var(--gold);font-family:var(--ff);margin-bottom:6px;">' + titleStr + '</h2>';
        html += '<p style="font-size:13px;color:var(--muted);margin-bottom:20px;">' + subStr + '</p>';

        var hasUnfinishedHoles = false;

        players.forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order);
            if (stats.holesPlayed < 18) hasUnfinishedHoles = true;

            html += '<div class="list-item" style="padding:14px;margin-bottom:10px;flex-wrap:wrap;gap:8px;">';
            html += '<div style="flex:1;"><strong style="color:var(--white);font-size:15px;"><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + (p.name || '—') + '</strong>';
            html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + t('hole') + 's: ' + stats.holesPlayed + ' / 18 · Gross: ' + (stats.gross || 0) + ' · Net: ' + (stats.net || 0) + '</div></div>';
            html += '<div style="text-align:right;"><div class="' + scoreClass(stats.toPar) + '" style="font-weight:800;font-size:18px;">' + fmtScore(stats.toPar) + '</div></div>';
            html += '</div>';
        });

        if (hasUnfinishedHoles) {
            var warnStr = currentLang === 'en' ? '⚠️ Note: Not all 18 holes have scores entered.' : '⚠️ Внимание: Не на всех 18 лунках введён счёт.';
            html += '<div class="timing-alert timing-warn" style="margin:16px 0;"><i class="fas fa-exclamation-triangle"></i><div>' + warnStr + '</div></div>';
        }

        html += '<div style="display:flex;gap:12px;margin-top:24px;flex-wrap:wrap;">';
        html += '<button class="btn btn-og" style="flex:1;" onclick="closeFinishModal()">' + continueBtnStr + '</button>';
        html += '<button class="btn btn-g" style="flex:1;" id="confirm-finish-btn">' + finishBtnStr + '</button>';
        html += '</div>';

        if (bodyEl) bodyEl.innerHTML = html;
        modalEl.classList.remove('hidden');

        var confirmBtn = document.getElementById('confirm-finish-btn');
        if (confirmBtn) {
            confirmBtn.onclick = function() {
                closeFinishModal();
                if (typeof onConfirmCallback === 'function') onConfirmCallback();
            };
        }
    });
}

function closeFinishModal() {
    var modalEl = document.getElementById('finish-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

// ==========================================
// СКОРКАРТА ПЕСТОВО (КАК НА ФОТО — 18 ЛУНОК)
// ==========================================
function generatePestovoScorecardHTML(player, roundData) {
    var p = player || {};
    var sc = p.scores || {};
    var fHcp = p.fieldHcp || 0;
    var eHcp = p.exactHcp || 0;
    var teeCode = (roundData && roundData.tee) || p.tee || 'wh';
    var fmt = (roundData && roundData.format) || 'Stroke Play';
    var date = fmtDate((roundData && (roundData.completedAt || roundData.createdAt)) || Date.now());

    var outG = 0, inG = 0, outS = 0, inS = 0, outNet = 0, inNet = 0;
    for (var i = 1; i <= 9; i++) {
        var s = parseInt(sc[i]) || 0;
        if (s > 0) {
            outG += s;
            outS += stablefordField(s, i, fHcp);
            outNet += calcNettScore(s, holePar(i), holeHcp(i), fHcp);
        }
    }
    for (var i = 10; i <= 18; i++) {
        var s = parseInt(sc[i]) || 0;
        if (s > 0) {
            inG += s;
            inS += stablefordField(s, i, fHcp);
            inNet += calcNettScore(s, holePar(i), holeHcp(i), fHcp);
        }
    }
    var totG = outG + inG, totS = outS + inS, totNet = outNet + inNet;

    var pOut = 0, pIn = 0;
    for (var i = 1; i <= 9; i++) pOut += holePar(i);
    for (var i = 10; i <= 18; i++) pIn += holePar(i);

    var html = '<div class="pestovo-modern-scorecard">';

    // 1. Top HUD Header
    html += '<div class="msc-card-hdr">';
    html += '  <div class="msc-player-title"><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + (p.name || '—') + '</div>';
    html += '  <div class="msc-meta-pills">';
    html += '    <span class="msc-pill">HCP: <b>' + fmtExactHcp(eHcp) + '</b> (' + fmtFieldHcp(fHcp) + ')</span>';
    html += '    <span class="msc-pill">' + fmtTeePill(teeCode) + '</span>';
    html += '    <span class="msc-pill">' + fmt + ' · ' + date + '</span>';
    html += '  </div>';
    html += '</div>';

    // 2. FRONT 9 (OUT) SECTION
    html += '<div class="msc-sec-hdr"><span>FRONT 9 (OUT)</span> <span>Par ' + pOut + '</span></div>';
    html += '<div class="msc-tile-grid">';
    for (var i = 1; i <= 9; i++) {
        var s = parseInt(sc[i]) || 0;
        var par = holePar(i);
        var dist = holeDist(i, teeCode);
        var hcp = holeHcp(i);
        var badgeCls = s > 0 ? holeResClass(s, par) : '';
        var stbl = s > 0 ? stablefordField(s, i, fHcp) : null;

        html += '<div class="msc-tile ' + badgeCls + '">';
        html += '  <div class="msc-tile-top"><span class="msc-hole-num">#' + i + '</span><span class="msc-hole-par">P' + par + ' · ' + dist + 'm</span></div>';
        html += '  <div class="msc-tile-score">' + (s > 0 ? s : '—') + '</div>';
        html += '  <div class="msc-tile-bot"><span class="msc-hole-idx">Idx ' + hcp + '</span><span class="msc-hole-stbl">' + (stbl !== null ? stbl + 'p' : '—') + '</span></div>';
        html += '</div>';
    }
    html += '</div>';

    // Front 9 Totals Strip
    html += '<div class="msc-totals-strip">';
    html += '  <span>OUT (1-9): <b>' + (outG > 0 ? outG : '—') + '</b></span>';
    html += '  <span>Net: <b>' + (outNet > 0 ? outNet : '—') + '</b></span>';
    html += '  <span>Stbl: <b>' + outS + 'p</b></span>';
    html += '</div>';

    // 3. BACK 9 (IN) SECTION
    html += '<div class="msc-sec-hdr" style="margin-top:10px;"><span>BACK 9 (IN)</span> <span>Par ' + pIn + '</span></div>';
    html += '<div class="msc-tile-grid">';
    for (var i = 10; i <= 18; i++) {
        var s = parseInt(sc[i]) || 0;
        var par = holePar(i);
        var dist = holeDist(i, teeCode);
        var hcp = holeHcp(i);
        var badgeCls = s > 0 ? holeResClass(s, par) : '';
        var stbl = s > 0 ? stablefordField(s, i, fHcp) : null;

        html += '<div class="msc-tile ' + badgeCls + '">';
        html += '  <div class="msc-tile-top"><span class="msc-hole-num">#' + i + '</span><span class="msc-hole-par">P' + par + ' · ' + dist + 'm</span></div>';
        html += '  <div class="msc-tile-score">' + (s > 0 ? s : '—') + '</div>';
        html += '  <div class="msc-tile-bot"><span class="msc-hole-idx">Idx ' + hcp + '</span><span class="msc-hole-stbl">' + (stbl !== null ? stbl + 'p' : '—') + '</span></div>';
        html += '</div>';
    }
    html += '</div>';

    // Back 9 & Grand Totals Strip
    html += '<div class="msc-totals-strip">';
    html += '  <span>IN (10-18): <b>' + (inG > 0 ? inG : '—') + '</b></span>';
    html += '  <span>Net: <b>' + (inNet > 0 ? inNet : '—') + '</b></span>';
    html += '  <span>Stbl: <b>' + inS + 'p</b></span>';
    html += '</div>';

    html += '<div class="msc-grand-strip">';
    html += '  <span>GROSS: <b>' + (totG > 0 ? totG : '—') + '</b></span>';
    html += '  <span>NET: <b>' + (totNet > 0 ? totNet : '—') + '</b></span>';
    html += '  <span>STABLEFORD: <b>' + totS + 'p</b></span>';
    html += '</div>';

    html += '</div>'; // End pestovo-modern-scorecard

    return html;
}

// ==========================================
// ПЕЧАТЬ С КНОПКОЙ «НАЗАД»
// ==========================================
function downloadScorecard(roundId){
    db.ref('rounds/'+roundId).once('value').then(function(sn){
        var r=sn.val();if(!r){toast(currentLang === 'en' ? 'Round not found' : 'Раунд не найден','error');return;}
        var pl=r.players||{};
        var w=window.open('','_blank');

        var css='body{font-family:Arial,sans-serif;margin:0;padding:20px;background:#fff;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
            +'@media print{.no-print{display:none!important;}}'
            +'.no-print-bar{display:flex;justify-content:space-between;align-items:center;background:#0b1a0e;color:#c9a84c;padding:12px 20px;margin-bottom:20px;border-radius:8px;font-family:Arial,sans-serif;}'
            +'.print-btn{background:#c9a84c;color:#0b1a0e;border:none;padding:10px 18px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;text-transform:uppercase;}'
            +'.back-btn{background:transparent;color:#c9a84c;border:1px solid #c9a84c;padding:10px 18px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;text-transform:uppercase;}'
            +'.pestovo-card-wrap{border:2px solid #000;border-radius:8px;padding:16px;margin-bottom:30px;page-break-inside:avoid;}'
            +'.pc-header{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:10px;font-size:12px;flex-wrap:wrap;gap:8px;}'
            +'.pc-col{display:flex;flex-direction:column;gap:4px;}'
            +'.pc-col strong{color:#000;}'
            +'.pc-table-wrap{overflow-x:auto;}'
            +'.pc-table{width:100%;border-collapse:collapse;text-align:center;font-size:11px;}'
            +'.pc-table th,.pc-table td{border:1px solid #000;padding:6px 3px;}'
            +'.pc-table th{background:#e0e0e0;font-weight:bold;}'
            +'.pc-lbl{text-align:left!important;padding-left:8px!important;font-weight:bold;width:60px;}'
            +'.pc-tot{background:#f5f5f5;font-weight:bold;}'
            +'.pc-par{background:#d4edda;}'
            +'.pc-idx{color:#555;font-size:10px;}'
            +'.pc-score-lbl{font-size:14px;text-transform:uppercase;}'
            +'.pc-score-box{height:28px;font-size:16px;color:#000!important;}'
            +'.pc-footer{display:flex;justify-content:space-between;margin-top:20px;font-size:12px;font-weight:bold;flex-wrap:wrap;gap:12px;}';

        var titleStr = currentLang === 'en' ? 'Pestovo Scorecards' : 'Печать счётных карточек — Пестово';
        var backBtnStr = currentLang === 'en' ? 'Back' : 'Назад';
        var printBtnStr = currentLang === 'en' ? 'Print' : 'Печать';

        var h='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + titleStr + '</title><style>'+css+'</style></head><body>';

        h+='<div class="no-print no-print-bar">'
           +'<button class="back-btn" onclick="if(window.opener || window.history.length<=1){window.close();}else{window.history.back();}">&larr; ' + backBtnStr + '</button>'
           +'<div style="font-weight:bold;font-size:15px;color:#c9a84c;">' + titleStr + '</div>'
           +'<button class="print-btn" onclick="window.print()">' + printBtnStr + '</button>'
           +'</div>';

        Object.values(pl).forEach(function(p){
            h+=generatePestovoScorecardHTML(p,r);
        });

        h+='</body></html>';
        w.document.write(h);w.document.close();
        setTimeout(function(){w.print();},500);
    });
}

// ==========================================
// ИСТОРИЯ
// ==========================================
function saveHistory(roundId,rd){
    var players=rd.players||{};
    Object.entries(players).forEach(function(pe){
        var pid=pe[0],p=pe[1],sc=p.scores||{},fH=p.fieldHcp||0,eH=p.exactHcp||0;
        var stats=calcRoundStats(sc,fH,eH,holeOrder(rd.startHole));
        if(stats.gross<=0)return;
        var isGuestPlayer=pid.indexOf('guest_')===0;
        if(isGuestPlayer){
            db.ref('users').orderByChild('name').equalTo(p.name||'Гость').once('value').then(function(usn){
                var existingId=null,existing=usn.val()||{};
                Object.entries(existing).forEach(function(ue){if(ue[1].isGuest===true)existingId=ue[0];});
                if(existingId){saveHistoryEntry(existingId,roundId,rd,p,stats);}
                else{
                    var newRef=db.ref('users').push();
                    newRef.set({name:p.name||'Гость',firstName:p.firstName||'',lastName:p.lastName||'',email:'',role:'guest',gender:p.gender||'men',handicap:eH||null,createdAt:Date.now(),roundsPlayed:0,bestGross:null,bestStableford:null,isGuest:true}).then(function(){saveHistoryEntry(newRef.key,roundId,rd,p,stats);});
                }
            });
        }else{saveHistoryEntry(pid,roundId,rd,p,stats);}
    });
}

function saveHistoryEntry(userId,roundId,rd,p,stats){
    db.ref('users/'+userId+'/history').push({
        roundId:roundId,date:rd.completedAt||Date.now(),tee:rd.tee||'wh',format:rd.format||'Stroke Play',
        mode:rd.mode||'group',startHole:rd.startHole||1,gross:stats.gross,toPar:stats.toPar,
        net:stats.net,netToPar:stats.netToPar,stablefordField:stats.stablefordField,stablefordExact:stats.stablefordExact,
        holes:stats.holesPlayed,scores:p.scores||{},birdies:stats.birdies,eagles:stats.eagles,
        pars:stats.pars,holeInOne:stats.holeInOne,exactHcp:p.exactHcp||0,fieldHcp:p.fieldHcp||0,gender:p.gender||'men'
    });
    db.ref('users/'+userId+'/roundsPlayed').transaction(function(v){return(v||0)+1;});
    if(stats.holesPlayed===18){
        db.ref('users/'+userId+'/bestGross').transaction(function(v){if(!v||stats.gross<v)return stats.gross;return v;});
        db.ref('users/'+userId+'/bestStableford').transaction(function(v){if(!v||stats.stablefordField>v)return stats.stablefordField;return v;});
    }
}


// ==========================================
// ГЕНЕРАТОР PNG-КАРТОЧКИ ДЛЯ СОЦСЕТЕЙ
// ==========================================
function exportRoundPNG(roundId, playerId) {
    if (typeof db === 'undefined' || !roundId) return;

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
        var teeName = t('tee_' + (r.tee || 'wh'));
        var fmtStr = (r.format || 'Stroke Play') + ' · Tee: ' + teeName + ' · HCP: ' + fmtExactHcp(p.exactHcp);
        var dateStr = fmtDate(r.completedAt || r.createdAt || Date.now());

        ctx.fillStyle = '#c9a84c';
        ctx.font = '600 20px "Inter", sans-serif';
        ctx.fillText(fmtStr, 540, 255);

        ctx.fillStyle = '#9eb5a5';
        ctx.font = '16px "Inter", sans-serif';
        ctx.fillText(dateStr, 540, 288);

        // Score KPIs Cards (Gross, Net, ToPar)
        var order = holeOrder(r.startHole || 1);
        var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order);

        drawKPICard(ctx, 160, 315, 220, 115, 'TO PAR', fmtScore(stats.toPar), stats.toPar < 0 ? '#2ecc71' : stats.toPar > 0 ? '#e05a4a' : '#ffffff');
        drawKPICard(ctx, 430, 315, 220, 115, 'GROSS', String(stats.gross || 0), '#c9a84c');
        drawKPICard(ctx, 700, 315, 220, 115, 'NET', String(stats.net || 0), '#5aade0');

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
            html += '<option value="' + pid + '" ' + sel + '>' + (p.name || 'Player') + '</option>';
        });
        html += '</select></div>';
    }

    html += '<img src="' + pngDataUrl + '" alt="Pestovo Card" style="width:100%;max-width:440px;border-radius:12px;border:2px solid var(--gold);box-shadow:0 8px 32px rgba(0,0,0,0.5);margin-bottom:20px;">';
    html += '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">';
    html += '<a href="' + pngDataUrl + '" download="' + fileName + '" class="btn btn-g" style="flex:1;min-width:180px;"><i class="fas fa-download"></i> ' + t('download_png') + '</a>';

    if (navigator.share) {
        html += '<button class="btn btn-og" style="flex:1;min-width:180px;" onclick="sharePNGNative(\'' + pngDataUrl + '\', \'' + fileName + '\')"><i class="fas fa-share-nodes"></i> ' + t('share_native') + '</button>';
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
            html += '<option value="' + e[0] + '" ' + sel + '>' + (e[1].name || 'Player') + '</option>';
        });
        html += '</select></div>';

        html += '<div class="form-group"><label>Player 2</label><select class="form-input" onchange="openHeadToHeadModal(\'' + uid1 + '\', this.value)">';
        userEntries.forEach(function(e) {
            var sel = e[0] === uid2 ? 'selected' : '';
            html += '<option value="' + e[0] + '" ' + sel + '>' + (e[1].name || 'Player') + '</option>';
        });
        html += '</select></div>';
        html += '</div>';

        // Head-to-Head Comparison Table
        html += '<div class="card" style="background:var(--input);padding:16px;">';
        html += '<div style="display:flex;justify-content:space-around;align-items:center;margin-bottom:16px;text-align:center;">';
        html += '<div>' + fmtUserAvatar(u1, 52) + '<div style="font-weight:700;color:var(--gold);margin-top:4px;">' + (u1.name || 'Player 1') + '</div></div>';
        html += '<div style="font-size:24px;font-weight:900;color:var(--white);">VS</div>';
        html += '<div style="font-size:24px;font-weight:900;color:var(--white);">' + fmtUserAvatar(u2, 52) + '<div style="font-weight:700;color:var(--gold);margin-top:4px;">' + (u2.name || 'Player 2') + '</div></div>';
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

// ==========================================
// TELEGRAM BOT OFFICIAL ALERTS
// ==========================================
function sendTelegramOfficialAlert(type, holeNum, playerName, roundInfo) {
    var botToken = localStorage.getItem('pestovo_tg_bot_token');
    var chatId = localStorage.getItem('pestovo_tg_chat_id');

    var triggerAlert = function(token, chat) {
        if (!token || !chat) return;
        var typeTitle = type === 'referee' ? '⚖️ ВЫЗОВ СУДЬИ' : '🛡️ ВЫЗОВ МАРШАЛА';
        var text = '🚨 *' + typeTitle + ' В ПЕСТОВО!*\n' +
                   '----------------------------------\n' +
                   '👤 *Игрок:* ' + (playerName || 'Игрок') + '\n' +
                   '⛳ *Лунка:* №' + holeNum + '\n' +
                   '📋 *Раунд:* ' + (roundInfo || 'Активный раунд') + '\n' +
                   '⏰ *Время:* ' + fmtTime(Date.now());

        fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chat,
                text: text,
                parse_mode: 'Markdown'
            })
        }).catch(function(err) { console.warn('Telegram Alert error:', err); });
    };

    if (botToken && chatId) {
        triggerAlert(botToken, chatId);
    } else if (typeof db !== 'undefined') {
        db.ref('settings/telegram').once('value').then(function(sn) {
            var tg = sn.val() || {};
            if (tg.botToken && tg.chatId) {
                triggerAlert(tg.botToken, tg.chatId);
            }
        });
    }
}
