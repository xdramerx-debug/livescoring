// ═════════════════════════════════════════════════════════════════
// ЕДИНЫЙ БЛОК «СОЗДАНИЕ РАУНДА» (v1.69.0)
// ─────────────────────────────────────────────────────────────────
// Вместо двух вкладок «Одиночный раунд» / «Групповой раунд» — одна
// форма: параметры (время, лунки, формат) + список игроков. Игроков
// добавляет кнопка «Добавить игрока» (1–6 человек):
//   • 1 игрок  → одиночный раунд (startSolo из js/solo.js);
//   • 2+ игроков → групповой раунд (startGroup из js/live.js)
//     с двойным вводом и маркерами по кругу.
//
// 5 вариантов отображения блока выбирает ТОЛЬКО админ (админ-панель →
// «Создание раунда (5 видов)»), сохраняется в settings/round_setup_view
// и применяется для всех (механизм view5 из js/utils.js):
//   1 · Классика   — аккордеон, по одной карточке раскрыта;
//   2 · Всё открыто — все карточки раскрыты, 2 колонки на широких экранах;
//   3 · Список     — компактные строки (один игрок — одна строка);
//   4 · Витрина    — наглядные карточки с аватарами и цветом ТИ;
//   5 · По шагам   — мастер «Параметры → Игроки → Старт».
// ═════════════════════════════════════════════════════════════════
var SETUP_MAX_PLAYERS = 6;
var setupPlayerOrder = [1];  // индексы карточек игроков, в порядке формы
var setupPlayerSeq = 1;      // счётчик следующего индекса
var setupWizardStep = 1;     // текущий шаг (вариант «По шагам»)

function setupVariant() {
    return (typeof getRoundSetupView === 'function') ? getRoundSetupView() : '1';
}

// Варианты с аккордеоном (остальные — всё видно сразу)
function setupIsAccordion() {
    var v = setupVariant();
    return v === '1' || v === '5';
}

// Индексы игроков в порядке, в котором они стоят в форме.
function setupPlayerIndices() {
    return setupPlayerOrder.slice();
}

// Данные всех игроков формы (для startGroup / startSolo).
function getSetupPlayers() {
    var out = [];
    setupPlayerIndices().forEach(function(idx) {
        var g = function(id) { var e = document.getElementById(id); return e ? e.value : ''; };
        out.push({
            idx: idx,
            uid: g('pl-uid-' + idx),
            name: g('pl-name-' + idx),
            middleName: g('pl-mid-' + idx),
            gender: g('pl-gender-' + idx) || 'men',
            tee: g('pl-tee-' + idx) || 'bl',
            hcpStr: g('pl-hcp-' + idx)
        });
    });
    return out;
}

// ─────────────────────────── МАРКАП ───────────────────────────

function spcAvatarText(name, idx) {
    try {
        if (typeof playerInitials === 'function') {
            var s = playerInitials(name);
            if (s && s !== '?') return s;
        }
    } catch (e) { /* игнорируем */ }
    return String(idx);
}

// Карточка игрока (варианты 1, 2, 4, 5).
function setupPlayerCardHtml(idx, opts) {
    opts = opts || {};
    var isEn = false;
    try { isEn = currentLang === 'en'; } catch (e) { isEn = false; }
    var open = !!opts.open;
    var rich = !!opts.rich;
    var you = !!opts.you;

    var cls = 'setup-player-card spc' + (rich ? ' spc-rich' : '') + (open ? ' open' : '');
    var head =
        '<div class="setup-player-head" role="button" tabindex="0" aria-expanded="' + (open ? 'true' : 'false') + '">' +
            '<span class="spc-avatar" id="spc-avatar-' + idx + '">' + spcAvatarText(opts.name || '', idx) + '</span>' +
            '<span class="spc-title"><i class="fas fa-user"></i> ' + t('player') + ' #' + idx + (you ? ' <em class="spc-you">(' + t('you') + ')</em>' : '') + '</span>' +
            '<span class="spc-meta" id="spc-meta-' + idx + '"></span>' +
            (!opts.first
                ? '<button type="button" class="spc-remove" title="' + t('remove_player_btn') + '" aria-label="' + t('remove_player_btn') + '" onclick="removeSetupPlayer(' + idx + ')"><i class="fas fa-user-minus"></i></button>'
                : '') +
            '<button type="button" id="pl-hcp-refresh-' + idx + '" class="setup-hcp-refresh setup-hcp-refresh-head hidden" onclick="event.stopPropagation();refreshSetupPlayerHandicap(' + idx + ')" title="' + t('refresh_hcp_from_rusgolf') + '" aria-label="' + t('refresh_hcp_from_rusgolf') + '" aria-hidden="true"><i class="fas fa-rotate"></i><span class="setup-hcp-refresh-text">RUSGOLF</span></button>' +
            '<i class="fas fa-chevron-down" aria-hidden="true"></i>' +
        '</div>';

    var body =
        '<div class="form-row form-row-3">' +
            '<div class="form-group" style="flex:1.4 1 130px;position:relative;"><label>' + t('first_name') + ' & ' + t('last_name') + '</label>' +
                '<input type="text" id="pl-name-' + idx + '" class="form-input" placeholder="' + (isEn ? 'John Doe' : 'Имя Фамилия') + '">' +
                '<input type="hidden" id="pl-uid-' + idx + '" value="">' +
            '</div>' +
            '<div class="form-group" style="flex:1 1 90px;"><label>' + t('middle_name') + '</label><input type="text" id="pl-mid-' + idx + '" class="form-input" placeholder="' + (isEn ? 'Jr.' : 'Отчество') + '"></div>' +
            '<div class="form-group" style="flex:1 1 80px;"><label>' + t('gender_label') + '</label><select id="pl-gender-' + idx + '" class="form-input" onchange="onPlayerGenderOrTeeChange(' + idx + ')"><option value="men">' + t('men') + '</option><option value="women">' + t('women') + '</option></select></div>' +
        '</div>' +
        '<div class="form-row form-row-3">' +
            '<div class="form-group" style="flex:1 1 80px;"><label>' + t('tee_select') + '</label><select id="pl-tee-' + idx + '" class="form-input" onchange="calcPlayerFieldHcp(' + idx + ')"><option value="bk">' + t('tee_opt_bk') + '</option><option value="bl" selected>' + t('tee_opt_bl') + '</option><option value="wh">' + t('tee_opt_wh') + '</option><option value="rd">' + t('tee_opt_rd') + '</option></select></div>' +
            '<div class="form-group" style="flex:1 1 90px;"><label class="setup-hcp-label"><span>' + t('exact_hcp') + '</span></label><input type="text" inputmode="decimal" id="pl-hcp-' + idx + '" class="form-input" placeholder="+2.4 / 12.4" oninput="calcPlayerFieldHcp(' + idx + ')"></div>' +
            '<div class="form-group" style="flex:1 1 90px;"><label>' + t('field_auto') + '</label><input type="text" id="pl-field-' + idx + '" class="form-input" readonly placeholder="—"></div>' +
        '</div>';

    return '<div class="' + cls + '" data-pidx="' + idx + '">' + head + body + '</div>';
}

// Компактная строка игрока (вариант «Список»).
function setupPlayerRowHtml(idx, opts) {
    opts = opts || {};
    var isEn = false;
    try { isEn = currentLang === 'en'; } catch (e) { isEn = false; }

    var fields =
        '<div class="form-group spx-name" style="position:relative;"><label>' + t('first_name') + ' & ' + t('last_name') + '</label>' +
            '<input type="text" id="pl-name-' + idx + '" class="form-input" placeholder="' + (isEn ? 'John Doe' : 'Имя Фамилия') + '">' +
            '<input type="hidden" id="pl-uid-' + idx + '" value="">' +
        '</div>' +
        '<div class="form-group"><label>' + t('middle_name') + '</label><input type="text" id="pl-mid-' + idx + '" class="form-input" placeholder="' + (isEn ? 'Jr.' : 'Отчество') + '"></div>' +
        '<div class="form-group"><label>' + t('gender_label') + '</label><select id="pl-gender-' + idx + '" class="form-input" onchange="onPlayerGenderOrTeeChange(' + idx + ')"><option value="men">' + t('men') + '</option><option value="women">' + t('women') + '</option></select></div>' +
        '<div class="form-group"><label>' + t('tee_select') + '</label><select id="pl-tee-' + idx + '" class="form-input" onchange="calcPlayerFieldHcp(' + idx + ')"><option value="bk">' + t('tee_opt_bk') + '</option><option value="bl" selected>' + t('tee_opt_bl') + '</option><option value="wh">' + t('tee_opt_wh') + '</option><option value="rd">' + t('tee_opt_rd') + '</option></select></div>' +
            '<div class="form-group"><label class="setup-hcp-label"><span>' + t('exact_hcp') + '</span><button type="button" id="pl-hcp-refresh-' + idx + '" class="setup-hcp-refresh hidden" onclick="refreshSetupPlayerHandicap(' + idx + ')" title="' + t('refresh_hcp_from_rusgolf') + '" aria-label="' + t('refresh_hcp_from_rusgolf') + '" aria-hidden="true"><i class="fas fa-rotate"></i></button></label><input type="text" inputmode="decimal" id="pl-hcp-' + idx + '" class="form-input" placeholder="+2.4 / 12.4" oninput="calcPlayerFieldHcp(' + idx + ')"></div>' +
        '<div class="form-group"><label>' + t('field_auto') + '</label><input type="text" id="pl-field-' + idx + '" class="form-input" readonly placeholder="—"></div>';

    return '<div class="setup-player-card spc spc-row open" data-pidx="' + idx + '">' +
        '<span class="spc-avatar" id="spc-avatar-' + idx + '">' + spcAvatarText(opts.name || '', idx) + '</span>' +
        '<div class="form-row spc-row-fields">' + fields + '</div>' +
        (!opts.first
            ? '<button type="button" class="spc-remove" title="' + t('remove_player_btn') + '" aria-label="' + t('remove_player_btn') + '" onclick="removeSetupPlayer(' + idx + ')"><i class="fas fa-user-minus"></i></button>'
            : '') +
        '</div>';
}

// ──────────────────────── РЕНДЕР СЛОТОВ ────────────────────────

// Автозаполнение из списка зарегистрированных (как в прежней вкладке группы).
function setupPlayerOnSelect(idx) {
    return function(matchedUser) {
        var nEl = document.getElementById('pl-name-' + idx);
        var uEl = document.getElementById('pl-uid-' + idx);
        var midEl = document.getElementById('pl-mid-' + idx);
        var gEl = document.getElementById('pl-gender-' + idx);
        var tEl = document.getElementById('pl-tee-' + idx);
        var hEl = document.getElementById('pl-hcp-' + idx);

        var parts = (typeof resolvePlayerNameParts === 'function')
            ? resolvePlayerNameParts(matchedUser)
            : matchedUser;
        if (nEl) nEl.value = ((parts.firstName || '') + ' ' + (parts.lastName || '')).trim();
        if (uEl) uEl.value = matchedUser.uid;
        if (midEl) midEl.value = parts.middleName || '';
        if (gEl) gEl.value = matchedUser.gender;
        if (tEl) {
            if (matchedUser.defaultTee) tEl.value = matchedUser.defaultTee;
            else if (matchedUser.gender === 'women') tEl.value = 'rd';
            else tEl.value = 'bl';
        }
        if (hEl) hEl.value = fmtExactHcp(matchedUser.handicap);
        if (typeof calcPlayerFieldHcp === 'function') calcPlayerFieldHcp(idx);
        if (typeof markSetupPlayerMeta === 'function') markSetupPlayerMeta(idx);
        if (typeof toast === 'function') toast('👤 ' + (currentLang === 'en' ? 'Selected player: ' : 'Выбран игрок: ') + matchedUser.name + ' (' + fmtExactHcp(matchedUser.handicap) + ' HCP)', 'info');
    };
}

function setupPlayerOnClear(idx) {
    return function() {
        var uEl = document.getElementById('pl-uid-' + idx);
        var hEl = document.getElementById('pl-hcp-' + idx);
        var fEl = document.getElementById('pl-field-' + idx);
        if (uEl) uEl.value = '';
        if (hEl) hEl.value = '';
        if (fEl) fEl.value = '';
        if (typeof markSetupPlayerMeta === 'function') markSetupPlayerMeta(idx);
    };
}

// Перерисовка карточек игроков.
// preserve=true — сохранить уже введённые значения (смена языка, добавление
// и удаление игроков) — пользователь ничего не теряет.
function renderSetupPlayers(preserve) {
    var el = document.getElementById('player-slots');
    if (!el) return;
    var variant = setupVariant();

    var saved = {};
    if (preserve) {
        setupPlayerIndices().forEach(function(idx) {
            var card = el.querySelector('[data-pidx="' + idx + '"]');
            var g = function(id) { var e = document.getElementById(id); return e ? e.value : ''; };
            saved[idx] = {
                hasCard: !!card,
                uid: g('pl-uid-' + idx),
                name: g('pl-name-' + idx),
                mid: g('pl-mid-' + idx),
                gender: g('pl-gender-' + idx),
                tee: g('pl-tee-' + idx),
                hcp: g('pl-hcp-' + idx),
                open: card ? card.classList.contains('open') : null
            };
        });
    }

    var isYou = !!(typeof currentUser !== 'undefined' && currentUser);
    var html = '';
    setupPlayerIndices().forEach(function(idx, pos) {
        var s = saved[idx] || {};
        if (variant === '3') {
            html += setupPlayerRowHtml(idx, { first: pos === 0, name: s.name });
        } else {
            var open;
            if (variant === '2' || variant === '4') open = true;
            // null = карточки ещё не было (первый рендер) — первая раскрыта
            else open = (s.open !== null && s.open !== undefined) ? s.open : (pos === 0);
            html += setupPlayerCardHtml(idx, {
                open: open,
                rich: variant === '4',
                first: pos === 0,
                you: pos === 0 && isYou,
                name: s.name
            });
        }
    });
    el.innerHTML = html;
    el.classList.toggle('unified-slots-grid', variant === '2');

    // Поиск/автозаполнение зарегистрированных игроков по имени
    setupPlayerIndices().forEach(function(idx) {
        var nEl = document.getElementById('pl-name-' + idx);
        if (nEl && typeof initPlayerSearchAutofill === 'function') {
            initPlayerSearchAutofill({
                searchInputId: 'pl-name-' + idx,
                onSelect: setupPlayerOnSelect(idx),
                onClear: setupPlayerOnClear(idx)
            });
        }
    });

    // Восстановление введённых значений
    if (preserve) {
        setupPlayerIndices().forEach(function(idx) {
            var s = saved[idx];
            if (!s) return;
            var g = function(id) { return document.getElementById(id); };
            if (g('pl-uid-' + idx)) g('pl-uid-' + idx).value = s.uid || '';
            if (g('pl-name-' + idx)) g('pl-name-' + idx).value = s.name || '';
            if (g('pl-mid-' + idx)) g('pl-mid-' + idx).value = s.mid || '';
            if (s.gender && g('pl-gender-' + idx)) g('pl-gender-' + idx).value = s.gender;
            if (s.tee && g('pl-tee-' + idx)) g('pl-tee-' + idx).value = s.tee;
            if (g('pl-hcp-' + idx)) g('pl-hcp-' + idx).value = s.hcp || '';
        });
    }

    // Дефолты от текущего пользователя (первая карточка = создатель)
    applyUnifiedUserDefaults();

    // Метаданные: аватары, цвет ТИ, полевой гандикап
    setupPlayerIndices().forEach(function(idx) {
        markSetupPlayerMeta(idx);
        if (typeof calcPlayerFieldHcp === 'function') calcPlayerFieldHcp(idx);
    });

    bindSetupSlotsMeta();
    if (typeof bindPlayerSlotsAccordion === 'function') bindPlayerSlotsAccordion();
    updateUnifiedChrome();

    // Мобильный степпер «Параметры → Игроки → Старт» (кроме мастера)
    try { if (typeof ensurePlayerWizardSteps === 'function') ensurePlayerWizardSteps(setupPlayerOrder.length); } catch (e) { console.warn('[silent]', e); }
    // applyUnifiedStep() в не-мастерских вариантах раскрывает все секции
    // и прячет мастер-бар — важно при живой смене вида админом.
    applyUnifiedStep();
    try { if (typeof updateGroupTimingPreview === 'function') updateGroupTimingPreview(); } catch (e) { console.warn('[silent]', e); }
}

// ──────────────── ДОБАВЛЕНИЕ / УДАЛЕНИЕ ИГРОКОВ ────────────────

function addSetupPlayer() {
    if (setupPlayerOrder.length >= SETUP_MAX_PLAYERS) {
        if (typeof toast === 'function') toast(t('max_players_msg'), 'warn');
        return;
    }
    setupPlayerSeq += 1;
    setupPlayerOrder.push(setupPlayerSeq);
    renderSetupPlayers(true);

    var last = setupPlayerOrder[setupPlayerOrder.length - 1];
    // В аккордеоне раскрываем новую карточку, остальные сворачиваем
    if (setupIsAccordion()) {
        var cards = document.querySelectorAll('#player-slots .setup-player-card');
        for (var i = 0; i < cards.length; i++) {
            var open = parseInt(cards[i].getAttribute('data-pidx'), 10) === last;
            cards[i].classList.toggle('open', open);
            var h = cards[i].querySelector('.setup-player-head');
            if (h) h.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
    }
    var inp = document.getElementById('pl-name-' + last);
    if (inp) {
        try { inp.focus(); } catch (e) { /* игнорируем */ }
        try { inp.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* игнорируем */ }
    }
    // Мастер: новый игрок виден на шаге 2
    if (setupVariant() === '5') { setupWizardStep = 2; applyUnifiedStep(); }
    if (typeof vib === 'function') vib(15);
}

function removeSetupPlayer(idx) {
    idx = parseInt(idx, 10);
    if (setupPlayerOrder.length <= 1) {
        if (typeof toast === 'function') toast(t('min_players_msg'), 'warn');
        return;
    }
    setupPlayerOrder = setupPlayerOrder.filter(function(x) { return x !== idx; });
    renderSetupPlayers(true);
    if (typeof vib === 'function') vib(15);
}

// ──────────────── МЕТА: АВАТАР И ЦВЕТ ТИ ────────────────

function markSetupPlayerMeta(idx) {
    var el = document.getElementById('player-slots');
    if (!el) return;
    var card = el.querySelector('[data-pidx="' + idx + '"]');
    if (!card) return;
    var nEl = document.getElementById('pl-name-' + idx);
    var tEl = document.getElementById('pl-tee-' + idx);
    var name = nEl ? nEl.value : '';
    var tee = tEl ? tEl.value : 'bl';

    var av = document.getElementById('spc-avatar-' + idx);
    if (av) av.textContent = spcAvatarText(name, idx);

    var meta = document.getElementById('spc-meta-' + idx);
    if (meta) {
        var hEl = document.getElementById('pl-hcp-' + idx);
        var fEl = document.getElementById('pl-field-' + idx);
        var parts = [];
        if (tee && typeof t === 'function') parts.push(t('tee_' + tee));
        if (hEl && hEl.value && typeof fmtFieldHcp === 'function' && fEl && fEl.value) parts.push(fEl.value + ' ' + (currentLang === 'en' ? 'field' : 'поля'));
        meta.textContent = parts.join(' · ');
    }

    ['bk', 'bl', 'wh', 'rd'].forEach(function(x) { card.classList.remove('spc-tee-' + x); });
    card.classList.add('spc-tee-' + tee);
    syncSetupHcpRefreshButton(idx);
}

var setupHcpRefreshRunning = {};
// Общий дедлайн поиска в RUSGOLF: кнопка не может «висеть» дольше этого срока.
var SETUP_HCP_LOOKUP_DEADLINE_MS = 20000;
function setupHcpNameTokens(idx) {
    var nameEl = document.getElementById('pl-name-' + idx);
    return String(nameEl && nameEl.value || '').trim().split(/\s+/).filter(Boolean);
}
function setupHcpNameValue(idx) {
    var nameEl = document.getElementById('pl-name-' + idx);
    return String(nameEl && nameEl.value || '').trim();
}
// Строка принадлежит текущему пользователю: выбран из подсказок (uid совпадает)
// либо введено его собственное ФИО вручную — тогда uid проставляется сразу.
function setupIsOwnRow(idx) {
    var user = typeof currentUser !== 'undefined' && currentUser ? currentUser : null;
    var myUid = user ? String(user.uid || '') : '';
    var uidEl = document.getElementById('pl-uid-' + idx);
    if (!myUid || !uidEl) return false;
    if (uidEl.value === myUid) return true;
    if (uidEl.value) return false;
    var profile = typeof currentUserData !== 'undefined' && currentUserData ? currentUserData : null;
    if (!profile) return false;
    var ownFio = [profile.lastName, profile.firstName, profile.middleName].filter(Boolean).join(' ');
    if (setupHcpNameTokensCount(setupHcpNameValue(idx)) < 2 || !setupRusgolfNameMatches(setupHcpNameValue(idx), { fio: ownFio })) return false;
    uidEl.value = myUid;
    return true;
}
function setupHcpNameTokensCount(value) {
    return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}
function setupParseHcpInput(value) {
    var cleaned = String(value || '').replace(/\u00a0/g, '').replace(/\s+/g, '').replace(',', '.');
    if (!cleaned || cleaned === '-' || cleaned === '—') return null;
    var num = cleaned.charAt(0) === '+' ? -Math.abs(parseFloat(cleaned.substring(1))) : parseFloat(cleaned);
    return isFinite(num) ? num : null;
}
// Кнопка «RUSGOLF» видна только у своей карточки, когда введены имя и фамилия.
function syncSetupHcpRefreshButton(idx) {
    var button = document.getElementById('pl-hcp-refresh-' + idx);
    if (!button) return;
    var running = !!setupHcpRefreshRunning[idx];
    var visible = running || (setupIsOwnRow(idx) && setupHcpNameTokensCount(setupHcpNameValue(idx)) >= 2);
    button.classList.toggle('hidden', !visible);
    button.disabled = running;
    button.setAttribute('aria-hidden', visible ? 'false' : 'true');
    button.setAttribute('aria-busy', running ? 'true' : 'false');
    button.classList.toggle('is-loading', running);
    var label = button.querySelector('.setup-hcp-refresh-text');
    if (label) label.textContent = running ? (currentLang === 'en' ? 'Searching…' : 'Поиск…') : 'RUSGOLF';
}

function setupNormalizeHcpName(value) {
    return String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

function setupRusgolfNameMatches(query, remote) {
    var localTokens = setupNormalizeHcpName(query).split(' ').filter(Boolean);
    var remoteTokens = setupNormalizeHcpName(remote && (remote.fio || [remote.lastName, remote.firstName, remote.middleName].filter(Boolean).join(' '))).split(' ').filter(Boolean);
    if (localTokens.length < 2 || remoteTokens.length < 2) return false;
    return localTokens.every(function (token) { return remoteTokens.indexOf(token) !== -1; });
}

function refreshSetupPlayerHandicap(idx) {
    idx = parseInt(idx, 10);
    if (setupHcpRefreshRunning[idx]) return;
    var uidEl = document.getElementById('pl-uid-' + idx);
    var nameEl = document.getElementById('pl-name-' + idx);
    var genderEl = document.getElementById('pl-gender-' + idx);
    var hcpEl = document.getElementById('pl-hcp-' + idx);
    var button = document.getElementById('pl-hcp-refresh-' + idx);
    var user = typeof currentUser !== 'undefined' && currentUser ? currentUser : null;
    var myUid = user ? String(user.uid || '') : '';
    // Обновление доступно только для своей карточки (как и раньше): поиск по чужому
    // ФИО не делаем, профиль другого игрока не переписываем.
    if (!setupIsOwnRow(idx)) {
        if (typeof toast === 'function') toast(currentLang === 'en' ? 'Select yourself from the player suggestions first.' : 'Сначала выберите себя в подсказках списка игроков.', 'warn');
        return;
    }
    var query = String(nameEl && nameEl.value || '').trim();
    if (query.split(/\s+/).filter(Boolean).length < 2) {
        if (typeof toast === 'function') toast(currentLang === 'en' ? 'Enter first and last name.' : 'Укажите имя и фамилию.', 'warn');
        return;
    }
    if (!window.PestovoRusgolf || typeof window.PestovoRusgolf.fetchViaProxy !== 'function') {
        if (typeof toast === 'function') toast(currentLang === 'en' ? 'Rusgolf sync is unavailable on this page.' : 'Синхронизация с RUSGOLF на этой странице недоступна.', 'error');
        return;
    }

    var prevHcp = hcpEl ? setupParseHcpInput(hcpEl.value) : null;
    var expectedGender = genderEl && genderEl.value ? genderEl.value : '';
    // Номер RUSGOLF берём только из собственного профиля — иначе чужая строка получит чужой HCP.
    var existingNumber = typeof currentUserData !== 'undefined' && currentUserData
        ? String(currentUserData.rusgolfNumber || '').replace(/\s+/g, '').toUpperCase() : '';

    setupHcpRefreshRunning[idx] = true;
    syncSetupHcpRefreshButton(idx);
    if (button) button.setAttribute('title', currentLang === 'en' ? 'Searching RUSGOLF…' : 'Поиск в RUSGOLF…');

    var timer = null;
    var deadline = new Promise(function (resolve, reject) {
        timer = setTimeout(function () {
            reject(new Error(currentLang === 'en'
                ? 'RUSGOLF did not answer in time. Try again or enter the handicap manually.'
                : 'RUSGOLF не ответил вовремя. Попробуйте ещё раз или введите гандикап вручную.'));
        }, SETUP_HCP_LOOKUP_DEADLINE_MS);
    });
    var lookup = window.PestovoRusgolf.fetchViaProxy(query, 0, { timeoutMs: 8000 });

    Promise.race([lookup, deadline]).then(function (result) {
        var rows = result && Array.isArray(result.rows) ? result.rows : [];
        var byNumber = existingNumber ? rows.filter(function (row) {
            return row && String(row.number || '').replace(/\s+/g, '').toUpperCase() === existingNumber && row.hcp != null;
        }) : [];
        var candidates = byNumber.length ? byNumber : rows.filter(function (row) {
            if (!row || row.hcp == null || !setupRusgolfNameMatches(query, row)) return false;
            return !expectedGender || !row.gender || row.gender === expectedGender;
        });
        if (candidates.length !== 1) {
            var message = candidates.length > 1
                ? (currentLang === 'en' ? 'Several matching RUSGOLF profiles were found. Ask the club administrator to verify the record.' : 'Найдено несколько совпадений RUSGOLF. Попросите администратора проверить запись.')
                : (currentLang === 'en' ? 'No exact RUSGOLF match was found. Check the name and try again.' : 'Точное совпадение в RUSGOLF не найдено. Проверьте ФИО и попробуйте ещё раз.');
            if (typeof toast === 'function') toast(message, 'warn');
            return null;
        }

        var official = candidates[0], hcp = Number(official.hcp);
        if (!isFinite(hcp)) throw new Error(currentLang === 'en' ? 'The RUSGOLF handicap is invalid.' : 'В RUSGOLF указан некорректный гандикап.');
        if (hcpEl) hcpEl.value = fmtExactHcp(hcp);
        if (typeof calcPlayerFieldHcp === 'function') calcPlayerFieldHcp(idx);
        if (typeof markSetupPlayerMeta === 'function') markSetupPlayerMeta(idx);

        var playerName = official.fio || query;
        var logEntry = {
            playerUid: myUid,
            playerName: playerName,
            oldHcp: prevHcp,
            newHcp: hcp,
            source: 'rusgolf-self'
        };
        var logIt = function () {
            return typeof pestovoLogHcpChange === 'function' ? pestovoLogHcpChange(logEntry) : Promise.resolve(false);
        };

        if (typeof db === 'undefined' || !db) {
            return logIt().then(function () { return { hcp: hcp, saved: false }; });
        }

        if (typeof currentUserData !== 'undefined' && currentUserData) {
            currentUserData.handicap = hcp;
            currentUserData.hcpSource = 'rusgolf';
            currentUserData.hcpUpdatedAt = Date.now();
            if (official.number) currentUserData.rusgolfNumber = official.number;
            if (official.hcpDate) currentUserData.rusgolfHcpDate = official.hcpDate;
        }
        var stamp = Date.now();
        var fields = { handicap: hcp, hcpSource: 'rusgolf', hcpUpdatedAt: stamp };
        if (official.number) fields.rusgolfNumber = official.number;
        if (official.hcpDate) fields.rusgolfHcpDate = official.hcpDate;
        return db.ref('users/' + myUid).update(fields).then(function () {
            // Публичный профиль — best effort: старые записи без usersPublic не блокируют обновление.
            return db.ref('usersPublic/' + myUid).once('value').then(function (snapshot) {
                if (!snapshot || !snapshot.exists || !snapshot.exists()) return null;
                return db.ref('usersPublic/' + myUid).update(fields).catch(function (error) { console.warn('[setup hcp public sync]', error); });
            }).catch(function (error) { console.warn('[setup hcp public sync]', error); });
        }).then(logIt).then(function () { return { hcp: hcp, saved: true }; });
    }).then(function (result) {
        if (result && typeof toast === 'function') {
            var value = fmtExactHcp(result.hcp);
            if (result.saved) {
                toast((currentLang === 'en' ? '✅ RUSGOLF handicap saved to your profile: ' : '✅ Гандикап из RUSGOLF сохранён в профиле: ') + value, 'success');
            } else {
                toast((currentLang === 'en' ? '✅ RUSGOLF handicap filled in: ' : '✅ Гандикап из RUSGOLF подставлен: ') + value, 'success');
            }
        }
    }).catch(function (error) {
        console.warn('[setup hcp rusgolf]', error);
        if (typeof toast === 'function') toast((currentLang === 'en' ? 'Could not sync RUSGOLF: ' : 'Не удалось синхронизировать RUSGOLF: ') + (error && error.message || error), 'error');
    }).then(function () {
        if (timer) clearTimeout(timer);
        setupHcpRefreshRunning[idx] = false;
        syncSetupHcpRefreshButton(idx);
        if (button) button.setAttribute('title', t('refresh_hcp_from_rusgolf'));
    });
}

// Одиночный делегированный обработчик: ввод имени/ТИ обновляет аватар и цвет.
function bindSetupSlotsMeta() {
    var el = document.getElementById('player-slots');
    if (!el || el._unifMetaBound) return;
    el._unifMetaBound = true;
    el.addEventListener('input', function(e) {
        var target = e.target;
        if (!target || !target.closest) return;
        var card = target.closest('[data-pidx]');
        if (card) markSetupPlayerMeta(parseInt(card.getAttribute('data-pidx'), 10));
    });
    el.addEventListener('change', function(e) {
        var target = e.target;
        if (!target || !target.closest) return;
        var card = target.closest('[data-pidx]');
        if (card) markSetupPlayerMeta(parseInt(card.getAttribute('data-pidx'), 10));
    });
}

// ──────────────── ДЕФОЛТЫ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ ────────────────
// Первая карточка = создатель раунда. Заполняем пустые поля профилем
// (пока пользователь ничего не ввёл — его данные не затираем).
function applyUnifiedUserDefaults() {
    if (typeof currentUser === 'undefined' || !currentUser || typeof currentUserData === 'undefined' || !currentUserData) return;
    var el = document.getElementById('player-slots');
    if (!el || !el.querySelector('[data-pidx]')) return;
    var first = setupPlayerOrder[0];
    if (!first) return;
    var g = function(id) { return document.getElementById(id); };

    var p1Name = g('pl-name-' + first);
    if (p1Name && !p1Name.value) {
        if (currentUserData.firstName || currentUserData.lastName) {
            p1Name.value = ((currentUserData.firstName || '') + ' ' + (currentUserData.lastName || '')).trim();
        } else {
            p1Name.value = currentUserData.name || '';
        }
    }
    if (g('pl-uid-' + first)) g('pl-uid-' + first).value = currentUser.uid;
    if (g('pl-mid-' + first) && !g('pl-mid-' + first).value) g('pl-mid-' + first).value = currentUserData.middleName || '';
    var gEl = g('pl-gender-' + first);
    if (gEl && !gEl.value && currentUserData.gender) gEl.value = currentUserData.gender;
    // ТИ: предпочитаемый игроком (дефолт формы — синий; если профиль
    // задаёт ТИ — применяем, его можно сменить вручную).
    var tEl = g('pl-tee-' + first);
    if (tEl && currentUserData.defaultTee) tEl.value = currentUserData.defaultTee;
    var hEl = g('pl-hcp-' + first);
    if (hEl && !hEl.value && currentUserData.handicap != null) hEl.value = fmtExactHcp(currentUserData.handicap);
    if (typeof calcPlayerFieldHcp === 'function') calcPlayerFieldHcp(first);
    if (typeof markSetupPlayerMeta === 'function') markSetupPlayerMeta(first);
}

// ──────────────── СЧЁТЧИК / РЕЖИМ / КНОПКИ ────────────────

function updateUnifiedChrome() {
    var n = setupPlayerOrder.length;
    var badge = document.getElementById('unified-count-badge');
    if (badge) badge.textContent = String(n);
    var note = document.getElementById('unified-mode-note');
    if (note) {
        note.innerHTML = n === 1
            ? '<i class="fas fa-user"></i> ' + t('mode_note_solo')
            : '<i class="fas fa-users"></i> ' + t('mode_note_group');
    }
    var addBtn = document.getElementById('unified-add-btn');
    if (addBtn) addBtn.classList.toggle('is-max', n >= SETUP_MAX_PLAYERS);
}

// ──────────────────────── СТАРТ ────────────────────────
// 1 игрок — одиночный раунд, 2+ — групповой (маркеры по кругу).
function startUnifiedRound() {
    var n = setupPlayerOrder.length;
    if (n <= 1) {
        if (typeof startSolo === 'function') startSolo();
    } else if (typeof startGroup === 'function') {
        startGroup();
    }
}

// ──────────────── МАСТЕР «ПО ШАГАМ» (вариант 5) ────────────────

function applyUnifiedStep() {
    var secs = document.querySelectorAll('.unified-sec');
    var bar = document.getElementById('unified-wizard');
    var sum = document.getElementById('unified-summary');
    if (setupVariant() !== '5') {
        // Не-мастерские варианты: все секции сразу
        for (var i = 0; i < secs.length; i++) secs[i].classList.remove('hidden');
        if (bar) bar.classList.add('hidden');
        if (sum) sum.classList.add('hidden');
        return;
    }
    if (bar) bar.classList.remove('hidden');
    // Убираем статический мобильный степпер — у мастера свой
    var p0 = document.getElementById('p0-wizard-steps');
    if (p0 && p0.parentNode) p0.parentNode.removeChild(p0);
    for (var k = 0; k < secs.length; k++) {
        var n = parseInt(secs[k].getAttribute('data-unif-sec'), 10) || 0;
        secs[k].classList.toggle('hidden', n !== setupWizardStep);
    }
    var stepsEl = document.getElementById('unified-steps');
    if (stepsEl) {
        var labels = [t('wiz_step_1'), t('wiz_step_2'), t('wiz_step_3')];
        stepsEl.innerHTML = labels.map(function(lb, i) {
            var cls = 'unified-step' + (i + 1 === setupWizardStep ? ' active' : (i + 1 < setupWizardStep ? ' done' : ''));
            return '<button type="button" class="' + cls + '" onclick="unifiedStepGo(' + (i + 1) + ')"><span>' + (i + 1) + '</span>' + lb + '</button>';
        }).join('');
    }
    var back = document.getElementById('unified-back-btn');
    var next = document.getElementById('unified-next-btn');
    if (back) back.classList.toggle('hidden', setupWizardStep === 1);
    if (next) next.classList.toggle('hidden', setupWizardStep === 3);
    if (setupWizardStep === 3) renderUnifiedSummary();
    else if (sum) sum.classList.add('hidden');
}

function unifiedStepNext() {
    if (setupVariant() !== '5' || setupWizardStep >= 3) return;
    setupWizardStep += 1;
    applyUnifiedStep();
}

function unifiedStepPrev() {
    if (setupVariant() !== '5' || setupWizardStep <= 1) return;
    setupWizardStep -= 1;
    applyUnifiedStep();
}

function unifiedStepGo(n) {
    n = parseInt(n, 10);
    if (setupVariant() !== '5' || !(n >= 1 && n <= 3)) return;
    setupWizardStep = n;
    applyUnifiedStep();
}

function renderUnifiedSummary() {
    var el = document.getElementById('unified-summary');
    if (!el) return;
    var ps = getSetupPlayers();
    var timeEl = document.getElementById('grp-time');
    var holeEl = document.getElementById('grp-hole');
    var rangeEl = document.getElementById('grp-range');
    var fmtEl = document.getElementById('grp-format');

    var rows = '';
    ps.forEach(function(p, i) {
        var ini = spcAvatarText(p.name, i + 1);
        var fEl = document.getElementById('pl-field-' + p.idx);
        rows += '<div class="us-row">' +
            '<span class="spc-avatar">' + ini + '</span>' +
            '<span class="us-name">' + (p.name ? escapeHtml(p.name) : (t('player') + ' #' + p.idx)) + '</span>' +
            '<span class="tee-pill tee-' + p.tee + '" style="font-size:9.5px;padding:1px 7px;">' + (typeof t === 'function' ? t('tee_' + p.tee) : p.tee) + '</span>' +
            '<span style="color:var(--muted);font-size:12px;">' + (fEl && fEl.value ? fEl.value : '—') + '</span>' +
            '</div>';
    });

    var meta = (timeEl && timeEl.value)
        ? '<i class="fas fa-clock"></i> ' + timeEl.value +
          ' · <i class="fas fa-flag"></i> ' + t('start_hole') + ': ' + (holeEl ? holeEl.value : '—') +
          ' · ' + (rangeEl ? rangeEl.value : '1-18') +
          ' · ' + (fmtEl ? fmtEl.value : '')
        : '';

    el.innerHTML = '<div class="us-title"><i class="fas fa-circle-check"></i> ' + t('unified_summary_title') +
        ' · ' + ps.length + ' ' + (currentLang === 'en' ? 'player(s)' : 'игроков') + '</div>' +
        rows + (meta ? '<div class="us-meta">' + meta + '</div>' : '');
    el.classList.remove('hidden');
}

// ──────────────────────── ИНИЦИАЛИЗАЦИЯ ────────────────────────

function initUnifiedSetup() {
    var el = document.getElementById('setup');
    if (!el || el.classList.contains('hidden')) return;
    try {
        var q = new URLSearchParams(window.location.search);
        // Ссылки старого вида ?mode=group (QR/история) — сразу готовим
        // второго игрока, чтобы сценарий «групповой раунд» сохранялся.
        if (q.get('mode') === 'group' && setupPlayerOrder.length < 2) {
            setupPlayerSeq += 1;
            setupPlayerOrder.push(setupPlayerSeq);
        }
    } catch (e) { /* игнорируем */ }

    if (setupVariant() === '5') applyUnifiedStep();
    // Первый проход — сразу (форма не пустая), а showGroupSetup
    // достроит слоты после асинхронной загрузки пользователей.
    renderSetupPlayers(true);
    if (typeof showGroupSetup === 'function') showGroupSetup();
}

document.addEventListener('DOMContentLoaded', function() {
    // Админский вариант блока «Создание раунда» (5 видов) — живая подписка.
    try {
        if (typeof pestovoBindView5 === 'function') pestovoBindView5('roundsetup', function() {
            try { syncView5BodyClasses(); } catch (e) { console.warn('[silent]', e); }
            var s = document.getElementById('setup');
            if (s && !s.classList.contains('hidden') && typeof renderSetupPlayers === 'function') renderSetupPlayers(true);
        });
    } catch (e) { console.warn('[silent]', e); }

    try {
        var p = new URLSearchParams(window.location.search);
        if (!p.get('round')) initUnifiedSetup();
    } catch (e) { console.warn('[silent]', e); }
});
