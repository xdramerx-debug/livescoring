// js/admin-display.js — настройки отображения и приватности (админка);
// вынесено из js/admin.js (docs/CODE-REVIEW.md, п.3 — фичи-модули).
// Содержит: варианты карточек (stableford/social/group round), оформление
// счётной карточки в лидерборде турнира, вид страницы «Турниры» (5
// вариантов), группы на странице турниров, разделение по полу, варианты
// основных страниц (ADMIN_PAGE_DISPLAY_CONFIG), видимость страниц
// (PAGE VISIBILITY), стиль бейджа гандикапа, приватность имён (ФИО).
// Внешние зависимости: runtime-глобалы (db, toast, t, currentLang,
// escapeHtml) и guarded loadAdmPlayers. Вызовы load*() из admin.js —
// typeof-guarded (openAdminPanel/switchTab); markAdm*VariantButtons зовёт
// js/utils.js (тоже guarded). Грузится в admin.html рядом с admin.js.

// ==========================================
// DEFAULT STABLEFORD DISPLAY MANAGEMENT
// ==========================================
function loadStablefordDisplaySettings() {
    var checkbox = document.getElementById('pv-stableford-default');
    if (!checkbox) return;

    var applyValue = function(value) {
        // Ключ ещё не создан → дефолт ВЫКЛЮЧЕН: по умолчанию очки Stableford
        // при вводе счёта не показываются ни у кого, пока админ не включит.
        var normalized = typeof normalizeStablefordDisplayValue === 'function'
            ? normalizeStablefordDisplayValue(value) : null;
        checkbox.checked = normalized === null ? false : normalized;
    };

    if (typeof db === 'undefined') {
        applyValue(null);
        return;
    }

    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-stableford-display-default', db.ref('settings/stableford_display_default'), function(sn) {
            applyValue(sn.val());
        });
    } else {
        db.ref('settings/stableford_display_default').once('value').then(function(sn) {
            applyValue(sn.val());
        }).catch(function() { applyValue(null); });
    }
}

function toggleStablefordDefaultCheckbox(event) {
    togglePVCheckbox('pv-stableford-default', event);
}

// ==========================================
// SOCIAL SCORECARD DISPLAY MANAGEMENT
// ==========================================
// Вариант сохраняется глобально в settings/social_card_variant. Экспорт PNG
// читает это значение из utils.js, а localStorage остаётся офлайн-резервом.
function loadSocialCardDisplaySettings() {
    var applyValue = function(value) {
        if (value !== null && value !== undefined && typeof applySocialCardVariant === 'function') {
            applySocialCardVariant(value);
        }
        markAdmSocialCardVariantButtons();
    };

    if (typeof db === 'undefined') {
        applyValue(null);
        return;
    }

    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-social-card-variant', db.ref('settings/social_card_variant'), function(sn) {
            applyValue(sn.val());
        });
    } else {
        db.ref('settings/social_card_variant').once('value').then(function(sn) {
            applyValue(sn.val());
        }).catch(function() { applyValue(null); });
    }
}

function saveSocialCardVariant(v) {
    if (v !== '1' && v !== '2' && v !== '3') return;
    if (typeof vib === 'function') vib(30);

    if (typeof applySocialCardVariant === 'function') applySocialCardVariant(v);
    else markAdmSocialCardVariantButtons();

    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Card style saved locally' : 'Стиль карточки сохранён локально', 'info');
        return;
    }

    db.ref('settings/social_card_variant').set(v).then(function() {
        toast(currentLang === 'en'
            ? '✅ Social scorecard style saved for all players'
            : '✅ Стиль PNG-карточки сохранён для всех игроков', 'success');
    }).catch(function(err) {
        console.warn('Social card variant save error:', err);
        toast(currentLang === 'en'
            ? 'Could not save the card style to the cloud'
            : '⚠️ Не удалось сохранить стиль карточки в облако', 'error');
    });
}

function markAdmSocialCardVariantButtons() {
    var cur = (typeof getSocialCardVariant === 'function') ? getSocialCardVariant() : '1';
    ['1', '2', '3'].forEach(function(v) {
        var btn = document.getElementById('social-card-opt-' + v);
        if (!btn) return;
        btn.classList.toggle('social-card-variant-active', v === cur);
        btn.setAttribute('aria-pressed', v === cur ? 'true' : 'false');
    });
}

// ==========================================
// GROUP ROUND CARD DISPLAY MANAGEMENT
// ==========================================
// Вариант сохраняется глобально в settings/group_round_card_variant.
// Выбор стиля единой карточки группового раунда для главной страницы.
function loadGroupCardDisplaySettings() {
    var applyValue = function(value) {
        if (value !== null && value !== undefined && typeof applyGroupCardVariant === 'function') {
            applyGroupCardVariant(value);
        }
        markAdmGroupCardVariantButtons();
    };

    if (typeof db === 'undefined') {
        applyValue(null);
        return;
    }

    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-group-card-variant', db.ref('settings/group_round_card_variant'), function(sn) {
            applyValue(sn.val());
        });
    } else {
        db.ref('settings/group_round_card_variant').once('value').then(function(sn) {
            applyValue(sn.val());
        }).catch(function() { applyValue(null); });
    }
}

function saveGroupCardVariant(v) {
    if (v !== '1' && v !== '2' && v !== '3') return;
    if (typeof vib === 'function') vib(30);

    if (typeof applyGroupCardVariant === 'function') applyGroupCardVariant(v);
    else markAdmGroupCardVariantButtons();

    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Group card style saved locally' : 'Стиль групповой карточки сохранён локально', 'info');
        return;
    }

    db.ref('settings/group_round_card_variant').set(v).then(function() {
        toast(currentLang === 'en'
            ? '✅ Group round card style saved for all users'
            : '✅ Стиль карточки группового раунда сохранён для всех пользователей', 'success');
    }).catch(function(err) {
        console.warn('Group card variant save error:', err);
        toast(currentLang === 'en'
            ? 'Could not save the group card style to the cloud'
            : '⚠️ Не удалось сохранить стиль групповой карточки в облако', 'error');
    });
}

function markAdmGroupCardVariantButtons() {
    var cur = (typeof getGroupCardVariant === 'function') ? getGroupCardVariant() : '1';
    ['1', '2', '3'].forEach(function(v) {
        var btn = document.getElementById('group-card-opt-' + v);
        if (!btn) return;
        var active = (v === cur);
        btn.classList.toggle('btn-g', active);
        btn.classList.toggle('btn-og', !active);
        btn.classList.toggle('group-card-variant-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

// ==========================================
// СЧЁТНАЯ КАРТОЧКА ИГРОКА В ЛИДЕРБОРДЕ ТУРНИРА
// ==========================================
// Админ выбирает оформление один раз для всего клуба:
// settings/tn_scorecard_variant → «Турниры → лидерборд → карточка игрока».
function loadTnCardDisplaySettings() {
    var applyValue = function(value) {
        if (value !== null && value !== undefined && typeof applyTnCardVariant === 'function') {
            applyTnCardVariant(value);
        }
        markAdmTnCardVariantButtons();
    };

    if (typeof db === 'undefined') {
        applyValue(null);
        return;
    }

    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-tn-card-variant', db.ref('settings/tn_scorecard_variant'), function(sn) {
            applyValue(sn.val());
        });
    } else {
        db.ref('settings/tn_scorecard_variant').once('value').then(function(sn) {
            applyValue(sn.val());
        }).catch(function() { applyValue(null); });
    }
}

function saveTnCardVariant(v) {
    if (v !== '1' && v !== '2' && v !== '3') return;
    if (typeof vib === 'function') vib(30);

    if (typeof applyTnCardVariant === 'function') applyTnCardVariant(v);
    else markAdmTnCardVariantButtons();

    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Tournament scorecard style saved locally' : 'Вид счётной карточки сохранён локально', 'info');
        return;
    }

    db.ref('settings/tn_scorecard_variant').set(v).then(function() {
        toast(currentLang === 'en'
            ? '✅ Tournament scorecard style saved for all users'
            : '✅ Вид счётной карточки в лидерборде сохранён для всех пользователей', 'success');
    }).catch(function(err) {
        console.warn('Tournament scorecard variant save error:', err);
        toast(currentLang === 'en'
            ? 'Could not save the scorecard style to the cloud'
            : '⚠️ Не удалось сохранить вид счётной карточки в облако', 'error');
    });
}

function markAdmTnCardVariantButtons() {
    var cur = (typeof getTnCardVariant === 'function') ? getTnCardVariant() : '1';
    ['1', '2', '3'].forEach(function(v) {
        var btn = document.getElementById('tn-card-opt-' + v);
        if (!btn) return;
        var active = (v === cur);
        btn.classList.toggle('btn-g', active);
        btn.classList.toggle('btn-og', !active);
        btn.classList.toggle('tn-card-variant-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function loadTnLbDisplaySettings() {
    var applyValue = function(value) {
        if (value !== null && value !== undefined && typeof applyTnLbVariant === 'function') {
            applyTnLbVariant(value);
        }
        markAdmTnLbVariantButtons();
    };
    if (typeof db === 'undefined') {
        applyValue(null);
        return;
    }
    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-tn-lb-variant', db.ref('settings/tournament_leaderboard_variant'), function(sn) {
            applyValue(sn.val());
        });
    } else {
        db.ref('settings/tournament_leaderboard_variant').once('value').then(function(sn) {
            applyValue(sn.val());
        }).catch(function() { applyValue(null); });
    }
}

// ── ВИДЫ ОТОБРАЖЕНИЯ (5 вариантов): сохранение в settings/* для всех ──
function markAdmView5Buttons(name) {
    if (typeof getView5 !== 'function') return;
    var cur = name === 'scorecard' && typeof clubScorecardPreviewView !== 'undefined' && clubScorecardPreviewView ? clubScorecardPreviewView : getView5(name);
    if (name === 'scoring' && typeof scoreEntryDraft !== 'undefined' && scoreEntryDraft) cur = scoreEntryDraft.view;
    ['1', '2', '3', '4', '5'].forEach(function(v) {
        var btn = document.getElementById('v5-' + name + '-' + v);
        if (!btn) return;
        var active = (String(v) === String(cur));
        btn.classList.toggle('btn-g', active);
        btn.classList.toggle('btn-og', !active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function saveView5Setting(name, v) {
    if (typeof applyView5 !== 'function') return;
    if (typeof vib === 'function') vib(30);
    applyView5(name, v);
    if (typeof db === 'undefined' || !db) {
        toast(currentLang === 'en' ? 'Saved locally (no database)' : 'Сохранено локально (нет базы)', 'info');
        return;
    }
    // Путь в Firebase берём из общего конфига view5 (js/utils.js) —
    // новые блоки (например, roundSetup) подключаются без правок админки.
    var cfg = (typeof PESTOVO_VIEW5_CONFIG !== 'undefined') ? PESTOVO_VIEW5_CONFIG[name] : null;
    var path = (cfg && cfg.firebase)
        ? cfg.firebase
        : { homeTournament: 'settings/home_tournament_view', scorecard: 'settings/scorecard_view', scoring: 'settings/scoring_view' }[name];
    if (!path) return;
    db.ref(path).set(String(v)).then(function() {
        toast(currentLang === 'en' ? '✅ View saved for all users' : '✅ Вид сохранён для всех пользователей', 'success');
    }).catch(function(err) {
        console.warn('view5 save error', err);
        toast(currentLang === 'en' ? 'Could not save to the cloud' : '⚠️ Не удалось сохранить в облако', 'error');
    });
}

function loadAdmView5Settings() {
    ['homeTournament', 'scorecard', 'scoring', 'roundsetup'].forEach(function(name) {
        if (typeof pestovoBindView5 === 'function') pestovoBindView5(name, function() {});
        else if (typeof markAdmView5Buttons === 'function') markAdmView5Buttons(name);
    });
}

function saveTnLbVariant(v) {
    if (['1','2','3','4','5'].indexOf(String(v)) === -1) return;
    if (typeof vib === 'function') vib(30);
    if (typeof applyTnLbVariant === 'function') applyTnLbVariant(v);
    else markAdmTnLbVariantButtons();
    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Leaderboard style saved locally' : 'Вид лидерборда сохранён локально', 'info');
        return;
    }
    db.ref('settings/tournament_leaderboard_variant').set(String(v)).then(function() {
        toast(currentLang === 'en'
            ? '✅ Tournament leaderboard style saved for all users'
            : '✅ Вид лидерборда турнира сохранён для всех пользователей', 'success');
    }).catch(function(err) {
        console.warn('Tournament leaderboard variant save error:', err);
        toast(currentLang === 'en'
            ? 'Could not save the leaderboard style to the cloud'
            : '⚠️ Не удалось сохранить вид лидерборда в облако', 'error');
    });
}

function markAdmTnLbVariantButtons() {
    var cur = (typeof getTnLbVariant === 'function') ? getTnLbVariant() : '1';
    ['1','2','3','4','5'].forEach(function(v) {
        var btn = document.getElementById('tn-lb-opt-' + v);
        if (!btn) return;
        var active = (String(v) === String(cur));
        btn.classList.toggle('btn-g', active);
        btn.classList.toggle('btn-og', !active);
        btn.classList.toggle('tn-lb-variant-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

// ==========================================
// ГРУППЫ НА СТРАНИЦЕ ТУРНИРОВ (вкл/выкл) + 4 ВИДА СПИСКА
// ==========================================
function markAdmTnGroupsVisible() {
    var btn = document.getElementById('tn-groups-visible-btn');
    var lbl = document.getElementById('tn-groups-visible-label');
    var on = (typeof getTnGroupsVisible === 'function') ? getTnGroupsVisible() : false;
    var en = currentLang === 'en';
    if (btn) {
        btn.classList.toggle('btn-g', on);
        btn.classList.toggle('btn-ol', !on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        var ic = btn.querySelector('i');
        if (ic) ic.className = on ? 'fas fa-eye' : 'fas fa-eye-slash';
    }
    if (lbl) lbl.textContent = on
        ? (en ? 'Show groups: ON' : 'Показывать группы: включено')
        : (en ? 'Show groups: OFF' : 'Показывать группы: выключено');
}

function saveTnGroupsVisible() {
    var next = !(typeof getTnGroupsVisible === 'function' && getTnGroupsVisible());
    if (typeof vib === 'function') vib(30);
    if (typeof applyTnGroupsVisible === 'function') applyTnGroupsVisible(next);
    if (typeof db === 'undefined' || !db) {
        toast('Сохранено локально', 'info');
        return;
    }
    db.ref('settings/tn_groups_visible').set(next).then(function() {
        toast(next ? '✅ Группы включены для всех' : '✅ Группы скрыты для всех', 'success');
    }).catch(function() { toast('⚠️ Не удалось сохранить в облако', 'error'); });
}

function loadTnGroupsSettings() {
    if (typeof db !== 'undefined' && db && typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-tn-groups-visible', db.ref('settings/tn_groups_visible'), function(sn) {
            var v = sn.val();
            if (v === null || typeof v === 'undefined') v = true; // дефолт — группы видны
            if (typeof applyTnGroupsVisible === 'function') applyTnGroupsVisible(v === true || v === '1' || v === 1);
            markAdmTnGroupsVisible();
        });
        bindRealtimeValue('admin-tn-roster-variant', db.ref('settings/tn_roster_variant'), function(sn) {
            var v = sn.val();
            if (v !== null && typeof v !== 'undefined' && typeof applyTnRosterVariant === 'function') applyTnRosterVariant(v);
            markAdmTnRosterVariantButtons();
        });
    } else {
        markAdmTnGroupsVisible();
        markAdmTnRosterVariantButtons();
    }
}

function markAdmTnRosterVariantButtons() {
    var cur = (typeof getTnRosterVariant === 'function') ? getTnRosterVariant() : '1';
    ['1', '2', '3', '4'].forEach(function(v) {
        var btn = document.getElementById('tn-roster-opt-' + v);
        if (!btn) return;
        var active = String(v) === String(cur);
        btn.classList.toggle('btn-g', active);
        btn.classList.toggle('btn-og', !active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function saveTnRosterVariant(v) {
    if (['1', '2', '3', '4'].indexOf(String(v)) === -1) return;
    if (typeof vib === 'function') vib(30);
    if (typeof applyTnRosterVariant === 'function') applyTnRosterVariant(v);
    if (typeof db === 'undefined' || !db) { toast('Сохранено локально', 'info'); return; }
    db.ref('settings/tn_roster_variant').set(String(v)).then(function() {
        toast('✅ Вид списка участников сохранён для всех', 'success');
    }).catch(function() { toast('⚠️ Не удалось сохранить в облако', 'error'); });
}

// ==========================================
// РАЗДЕЛЕНИЕ ЛИДЕРБОРДА ТУРНИРА ПО ПОЛУ (3 вида)
// ==========================================
function markAdmTnGenderSplitButtons() {
    var cur = (typeof getTnGenderSplit === 'function') ? getTnGenderSplit() : '1';
    ['1', '2', '3'].forEach(function(v) {
        var btn = document.getElementById('tn-gs-opt-' + v);
        if (!btn) return;
        var active = String(v) === String(cur);
        btn.classList.toggle('btn-g', active);
        btn.classList.toggle('btn-og', !active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function saveTnGenderSplit(v) {
    if (['1', '2', '3'].indexOf(String(v)) === -1) return;
    if (typeof vib === 'function') vib(30);
    if (typeof applyTnGenderSplit === 'function') applyTnGenderSplit(v);
    else markAdmTnGenderSplitButtons();
    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Saved locally (no database)' : 'Сохранено локально (нет базы)', 'info');
        return;
    }
    db.ref('settings/tn_gender_split').set(String(v)).then(function() {
        toast(currentLang === 'en'
            ? '✅ Gender split for the tournament leaderboard saved for all users'
            : '✅ Разделение лидерборда по полу сохранено для всех', 'success');
    }).catch(function(err) {
        console.warn('tn_gender_split save error:', err);
        toast(currentLang === 'en' ? '⚠️ Could not save to the cloud' : '⚠️ Не удалось сохранить в облако', 'error');
    });
}

function loadTnGenderSplitSettings() {
    var applyValue = function(value) {
        if (value !== null && value !== undefined && typeof applyTnGenderSplit === 'function') {
            applyTnGenderSplit(value);
        }
        markAdmTnGenderSplitButtons();
    };
    if (typeof db === 'undefined') {
        applyValue(null);
        return;
    }
    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-tn-gender-split', db.ref('settings/tn_gender_split'), function(sn) {
            applyValue(sn.val());
        });
    } else {
        db.ref('settings/tn_gender_split').once('value').then(function(sn) {
            applyValue(sn.val());
        }).catch(function() { applyValue(null); });
    }
}

// ==========================================
// ВАРИАНТЫ ОТОБРАЖЕНИЯ ОСНОВНЫХ СТРАНИЦ
// ==========================================
var ADMIN_PAGE_DISPLAY_CONFIG = {
    home: { path: 'settings/home_display_variant', label: 'Главная' },
    players: { path: 'settings/players_display_variant', label: 'Игроки' },
    stats: { path: 'settings/stats_display_variant', label: 'Статистика' },
    rounds: { path: 'settings/all_rounds_display_variant', label: 'Все раунды' },
    tournaments: { path: 'settings/tournaments_display_variant', label: 'Турниры' },
    handicap: { path: 'settings/handicap_display_variant', label: 'Гандикапы' }
};

function pageDisplayLabelKey(page, v) {
    // У «Турниров» варианты 4–5 описаны только в ключах вкладки «Турниры: вид».
    if (page === 'tournaments' && parseInt(v, 10) > 3) return 'tournaments_view_variant_' + v;
    return page + '_display_variant_' + v;
}

function renderPageDisplaySettingsGrid() {
    var grid = document.querySelector('.page-display-settings-grid');
    if (!grid) return;
    var pages = Object.keys(ADMIN_PAGE_DISPLAY_CONFIG);
    grid.innerHTML = pages.map(function(page) {
        var keys = (typeof pageDisplayVariantKeys === 'function') ? pageDisplayVariantKeys(page) : ['1', '2', '3'];
        var titleKey = page + '_display_title';
        var subKey = page + '_display_sub';
        var title = (typeof t === 'function') ? t(titleKey) : titleKey;
        var sub = (typeof t === 'function') ? t(subKey) : subKey;
        var buttons = keys.map(function(v) {
            var labelKey = pageDisplayLabelKey(page, v);
            var label = (typeof t === 'function') ? t(labelKey) : labelKey;
            return '<button type="button" class="btn btn-og btn-sm page-display-variant-btn" id="' +
                page + '-display-opt-' + v + '" onclick="savePageDisplayVariant(\'' + page + '\',\'' + v + '\')" data-i18n="' +
                labelKey + '">' + label + '</button>';
        }).join('');
        return '<div class="page-display-setting-card">' +
            '<span class="page-display-setting-title" data-i18n="' + titleKey + '">' + title + '</span>' +
            '<div class="page-display-setting-sub" data-i18n="' + subKey + '">' + sub + '</div>' +
            '<div class="page-display-variant-buttons">' + buttons + '</div></div>';
    }).join('');
    pages.forEach(function(page) { markAdmPageDisplayVariantButtons(page); });
}

function savePageDisplayVariant(page, value) {
    var cfg = ADMIN_PAGE_DISPLAY_CONFIG[page];
    if (!cfg) return;
    value = String(value);
    var keys = (typeof pageDisplayVariantKeys === 'function') ? pageDisplayVariantKeys(page) : ['1', '2', '3'];
    if (keys.indexOf(value) === -1) return;
    if (typeof vib === 'function') vib(30);
    if (typeof applyPageDisplayVariant === 'function') applyPageDisplayVariant(page, value);
    else markAdmPageDisplayVariantButtons(page);
    if (page === 'tournaments' && typeof markAdmTnPageViewButtons === 'function') markAdmTnPageViewButtons();

    if (typeof db === 'undefined' || !db) {
        toast(currentLang === 'en' ? 'Layout saved locally' : 'Вариант отображения сохранён локально', 'info');
        return;
    }
    db.ref(cfg.path).set(value).then(function() {
        toast(currentLang === 'en' ? '✅ Page layout saved for all users' : '✅ Вид страницы сохранён для всех', 'success');
    }).catch(function(err) {
        console.warn('Page display variant save error:', err);
        toast(currentLang === 'en' ? 'Could not save the layout' : '⚠️ Не удалось сохранить вариант отображения', 'error');
    });
}

function loadPageDisplaySettings() {
    renderPageDisplaySettingsGrid();
    Object.keys(ADMIN_PAGE_DISPLAY_CONFIG).forEach(function(page) {
        var cfg = ADMIN_PAGE_DISPLAY_CONFIG[page];
        var applyValue = function(value) {
            if (value !== null && value !== undefined && typeof applyPageDisplayVariant === 'function') {
                applyPageDisplayVariant(page, value);
            }
            markAdmPageDisplayVariantButtons(page);
        };
        if (typeof db === 'undefined') {
            applyValue(null);
        } else if (typeof bindRealtimeValue === 'function') {
            bindRealtimeValue('admin-page-display-' + page, db.ref(cfg.path), function(sn) {
                applyValue(sn.val());
            });
        } else {
            db.ref(cfg.path).once('value').then(function(sn) { applyValue(sn.val()); }).catch(function() { applyValue(null); });
        }
    });
}
function markAdmPageDisplayVariantButtons(page) {
    var cur = (typeof getPageDisplayVariant === 'function') ? getPageDisplayVariant(page) : '1';
    var keys = (typeof pageDisplayVariantKeys === 'function') ? pageDisplayVariantKeys(page) : ['1', '2', '3'];
    keys.forEach(function(v) {
        var btn = document.getElementById(page + '-display-opt-' + v);
        if (!btn) return;
        var active = v === cur;
        btn.classList.toggle('page-display-variant-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

// ==========================================
// ВКЛАДКА «ТУРНИРЫ: ВИД» — 5 ВАРИАНТОВ СТРАНИЦЫ «ТУРНИРЫ»
// ==========================================
// Оформление выбирает только администратор; значение хранится в
// settings/tournaments_display_variant и применяется для всех игроков.
var TN_PAGE_VIEW_VARIANTS = ['1', '2', '3', '4', '5'];
var TN_PAGE_VIEW_DESC = {
    1: 'tournaments_view_variant_1_desc',
    2: 'tournaments_view_variant_2_desc',
    3: 'tournaments_view_variant_3_desc',
    4: 'tournaments_view_variant_4_desc',
    5: 'tournaments_view_variant_5_desc'
};

function markAdmTnPageViewButtons() {
    var cur = (typeof getPageDisplayVariant === 'function') ? getPageDisplayVariant('tournaments') : '1';
    TN_PAGE_VIEW_VARIANTS.forEach(function(v) {
        var btn = document.getElementById('tn-view-opt-' + v);
        if (!btn) return;
        var active = v === cur;
        btn.classList.toggle('page-display-variant-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    // Подпись активного варианта — чтобы админ видел, что именно включено.
    var hint = document.getElementById('tn-view-current-desc');
    if (hint) {
        var key = TN_PAGE_VIEW_DESC[cur] || TN_PAGE_VIEW_DESC['1'];
        hint.textContent = (typeof t === 'function' ? t(key) : key) || '';
    }
    var badge = document.getElementById('tn-view-current-badge');
    if (badge) {
        var labelKey = 'tournaments_view_variant_' + cur;
        badge.textContent = (typeof t === 'function' ? t(labelKey) : labelKey) || cur;
    }
}

function loadTnPageViewSettings() {
    var applyValue = function(value) {
        if (value !== null && value !== undefined && typeof applyPageDisplayVariant === 'function') {
            applyPageDisplayVariant('tournaments', value);
        }
        markAdmTnPageViewButtons();
    };
    if (typeof db === 'undefined') { applyValue(null); return; }
    var path = 'settings/tournaments_display_variant';
    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-tn-page-view', db.ref(path), function(sn) { applyValue(sn.val()); });
    } else {
        db.ref(path).once('value').then(function(sn) { applyValue(sn.val()); }).catch(function() { applyValue(null); });
    }
}

function saveTnPageViewVariant(value) {
    if (TN_PAGE_VIEW_VARIANTS.indexOf(String(value)) === -1) return;
    value = String(value);
    if (typeof vib === 'function') vib(30);
    if (typeof applyPageDisplayVariant === 'function') applyPageDisplayVariant('tournaments', value);
    markAdmTnPageViewButtons();

    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Layout saved locally' : 'Вариант отображения сохранён локально', 'info');
        return;
    }
    db.ref('settings/tournaments_display_variant').set(value).then(function() {
        toast(currentLang === 'en'
            ? '✅ ' + t('tournaments_view_saved')
            : '✅ ' + t('tournaments_view_saved'), 'success');
    }).catch(function(err) {
        console.warn('Tournaments layout save error:', err);
        toast(currentLang === 'en' ? 'Could not save the layout' : '⚠️ Не удалось сохранить вариант отображения', 'error');
    });
}

function openTournamentsPagePreview() {
    try { window.open('tournaments.html', '_blank', 'noopener'); } catch (e) { console.warn("[silent]", e); }
}

function saveStablefordDisplayDefault() {
    var checkbox = document.getElementById('pv-stableford-default');
    var enabled = checkbox ? !!checkbox.checked : false;

    // Обновление мгновенно отражается в этой вкладке; на устройствах игроков
    // настройка придёт через listener в utils.js. Личные настройки не меняем.
    if (typeof syncStablefordDisplayDefault === 'function') syncStablefordDisplayDefault(enabled);

    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Stableford default saved locally' : 'Настройка Stableford сохранена локально', 'success');
        return;
    }

    db.ref('settings/stableford_display_default').set(enabled).then(function() {
        toast(enabled
            ? (currentLang === 'en' ? 'Stableford is enabled by default' : 'Stableford включён по умолчанию')
            : (currentLang === 'en' ? 'Stableford is disabled by default' : 'Stableford выключен по умолчанию'), 'success');
    }).catch(function(error) {
        console.warn('[Stableford] Cannot save default display setting', error);
        toast(currentLang === 'en' ? 'Could not save the Stableford default' : 'Не удалось сохранить настройку Stableford', 'error');
    });
}

// ==========================================
// PAGE VISIBILITY MANAGEMENT
// ==========================================
function loadPageVisibilitySettings() {
    if (typeof MANAGED_PAGES === 'undefined') return;

    var updateCheckboxes = function(hp) {
        hp = hp || {};
        MANAGED_PAGES.forEach(function(page) {
            var key = page.replace('.html', '');
            var checkbox = document.getElementById('pv-' + key) || document.getElementById('pv-' + page);
            if (checkbox) {
                var isHidden = (hp[page] === true || hp[key] === true);
                checkbox.checked = !isHidden;
            }
        });
    };

    if (typeof getHiddenPages === 'function') {
        updateCheckboxes(getHiddenPages());
    }

    if (typeof db !== 'undefined' && db) {
        // Подписки через bindRealtimeValue — без дублей при повторных заходах на вкладку.
        bindRealtimeValue('admin-hidden-pages', db.ref('settings/hidden_pages'), function(sn) {
            var fbVal = sn.val();
            if (fbVal !== null && typeof fbVal === 'object') {
                var hp = {};
                MANAGED_PAGES.forEach(function(page) {
                    var key = page.replace('.html', '');
                    if (fbVal[key] !== undefined) {
                        hp[page] = (fbVal[key] === true);
                        hp[key] = (fbVal[key] === true);
                    } else if (fbVal[page] !== undefined) {
                        hp[page] = (fbVal[page] === true);
                        hp[key] = (fbVal[page] === true);
                    }
                });
                localStorage.setItem('pestovo_hidden_pages', JSON.stringify(hp));
                updateCheckboxes(hp);
                if (typeof applyPageVisibilitySettings === 'function') applyPageVisibilitySettings();
            }
        });
    }

    // Подсветка активного стиля галочки гандикапа (значение из localStorage,
    // актуализируется listener'ом utils.js из Firebase)
    if (typeof markAdmHcpVariantButtons === 'function') markAdmHcpVariantButtons();
}

function savePageVisibilitySettings() {
    if (typeof MANAGED_PAGES === 'undefined') return;

    var hiddenPages = {};
    var fbPages = {};

    MANAGED_PAGES.forEach(function(page) {
        var key = page.replace('.html', '');
        var checkbox = document.getElementById('pv-' + key) || document.getElementById('pv-' + page);
        var isHidden = checkbox ? !checkbox.checked : false;

        hiddenPages[page] = isHidden;
        hiddenPages[key] = isHidden;
        fbPages[key] = isHidden;
    });

    localStorage.setItem('pestovo_hidden_pages', JSON.stringify(hiddenPages));
    if (typeof applyPageVisibilitySettings === 'function') applyPageVisibilitySettings();

    toast(currentLang === 'en' ? '✅ Page visibility settings saved!' : '✅ Настройки видимости сохранены!', 'success');
    if (typeof vib === 'function') vib([50, 30, 50]);

    if (typeof db !== 'undefined') {
        db.ref('settings/hidden_pages').set(fbPages).then(function() {
            console.log('Visibility settings synced to Firebase successfully');
        }).catch(function(err) {
            console.warn('Firebase sync warning:', err);
        });
    }
}

function togglePVCheckbox(id, event) {
    if (event) {
        if (event.preventDefault) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
    }
    var checkbox = document.getElementById(id);
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        if (typeof vib === 'function') vib(30);
    }
}

// ==========================================
// СТИЛЬ ГАЛОЧКИ ГАНДИКАПА (глобально, для всех игроков)
// Вариант 1/2/3 хранится в Firebase settings/hcp_badge_variant.
// utils.js подписан на это поле и сам перерисовывает списки.
// ==========================================
function saveHcpBadgeVariant(v) {
    if (v !== '1' && v !== '2' && v !== '3') return;
    if (typeof vib === 'function') vib(30);

    // Применяем мгновенно локально: перерисовка списков + подсветка кнопок
    if (typeof applyHcpBadgeVariant === 'function') applyHcpBadgeVariant(v);
    else markAdmHcpVariantButtons();

    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Style saved locally (no cloud connection)' : 'Стиль сохранён локально (нет связи с облаком)', 'info');
        return;
    }
    db.ref('settings/hcp_badge_variant').set(v).then(function() {
        toast(currentLang === 'en' ? '✅ Handicap checkmark style saved for all players' : '✅ Стиль галочки гандикапа сохранён для всех игроков', 'success');
    }).catch(function(err) {
        console.warn('HCP badge variant save error:', err);
        toast(currentLang === 'en' ? 'Could not save the style to the cloud' : '⚠️ Не удалось сохранить стиль в облако', 'error');
    });
}

// Подсветка выбранного стиля галочки гандикапа в кнопках админ-панели.
function markAdmHcpVariantButtons() {
    var cur = (typeof getHcpBadgeVariant === 'function') ? getHcpBadgeVariant() : '1';
    ['1', '2', '3'].forEach(function(v) {
        var btn = document.getElementById('hcp-badge-opt-' + v);
        if (!btn) return;
        btn.classList.toggle('hcp-variant-active', v === cur);
    });
}

// ==========================================
// КОНФИДЕНЦИАЛЬНОСТЬ ИМЁН (ФИО)
// Настройки: settings/privacy = { enabled, maskMode, players: { uid: bool } }
// ==========================================
function loadPrivacySettings() {
    var globalCb = document.getElementById('pv-privacy-global');
    var maskSel = document.getElementById('pv-privacy-mask');

    var apply = function(v) {
        v = v || {};
        if (globalCb) globalCb.checked = v.enabled === true;
        if (maskSel) maskSel.value = (v.maskMode === 'masked') ? 'masked' : 'initials';
    };

    if (typeof db === 'undefined') {
        apply(null);
        return;
    }
    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-privacy', db.ref('settings/privacy'), function(sn) {
            apply(sn.val());
        });
    } else {
        db.ref('settings/privacy').once('value').then(function(sn) { apply(sn.val()); }).catch(function() { apply(null); });
    }
}

function togglePrivacyGlobalCheckbox(event) {
    togglePVCheckbox('pv-privacy-global', event);
}

function savePrivacySettings() {
    var globalCb = document.getElementById('pv-privacy-global');
    var maskSel = document.getElementById('pv-privacy-mask');
    var enabled = globalCb ? globalCb.checked : false;
    var maskMode = maskSel && maskSel.value === 'masked' ? 'masked' : 'initials';

    // Обновляем локальное состояние для текущего пользователя сразу
    if (typeof pestovoPrivacy !== 'undefined') {
        pestovoPrivacy.enabled = enabled;
        pestovoPrivacy.maskMode = maskMode;
    }
    try {
        localStorage.setItem('pestovo_privacy', JSON.stringify({ enabled: enabled, maskMode: maskMode, players: pestovoPrivacy.players || {} }));
    } catch (e) { console.warn("[silent]", e); }
    if (typeof renderPrivacySensitiveHome === 'function') renderPrivacySensitiveHome();

    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Privacy settings saved locally' : 'Настройки приватности сохранены локально', 'success');
        return;
    }

    db.ref('settings/privacy').once('value').then(function(sn) {
        var cur = sn.val() || {};
        db.ref('settings/privacy').update({
            enabled: enabled,
            maskMode: maskMode,
            players: cur.players || {},
            updatedAt: Date.now()
        }).then(function() {
            toast(enabled
                ? (currentLang === 'en' ? '✅ Names are now hidden from others' : '✅ Имена теперь скрыты от других')
                : (currentLang === 'en' ? '✅ Names are visible to others' : '✅ Имена снова видны другим'), 'success');
        }).catch(function(err) {
            toast('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

// Переключатель «Скрыть имя» для конкретного игрока (в списке игроков админки).
// true — скрывать (перекрывает глобальный выключатель), false — показывать.
function togglePlayerPrivacy(id) {
    if (!id) return;
    if (typeof db === 'undefined' || !db) {
        toast(currentLang === 'en' ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    var ref = db.ref('settings/privacy/players/' + id);
    ref.once('value').then(function(sn) {
        var cur = sn.val();
        var newVal = (cur === true) ? false : true;
        return ref.set(newVal).then(function() {
            toast(newVal
                ? (currentLang === 'en' ? '🙈 Name will be hidden from others' : '🙈 Имя будет скрыто от других')
                : (currentLang === 'en' ? '🙂 Name will be visible to others' : '🙂 Имя будет видно другим'), 'success');
            if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        });
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

var clubScorecardPreviewView = null;
function previewClubScorecardView(value) {
    clubScorecardPreviewView = normalizeView5(value);
    renderClubScorecardPreview();
}

function renderClubScorecardPreview() {
    var el = document.getElementById('club-sc-preview');
    if (!el) return;
    var scores = {}, marker = {};
    for (var h = 1; h <= 12; h++) { scores[h] = holePar(h) + (h % 3) - 1; marker[h] = scores[h]; }
    marker[7] += 1;
    var p = { name: 'Александр · пример', tee: 'wh', fieldHcp: 23, scores: scores };
    el.innerHTML = renderClubScorecard(p, { status: 'active', holeRange: '1-18' }, { showMarker: true, markerScores: marker });
    var card = el.querySelector('.club-sc');
    card.setAttribute('data-sc-preview', 'true');
    card.setAttribute('data-sc-view', clubScorecardPreviewView || getRoundScorecardView());
    markAdmView5Buttons('scorecard');
}

// Cloud acknowledgement, not an optimistic local change, confirms a global choice.
var clubScorecardSaving = false;
function saveClubScorecardView(value) {
    if (clubScorecardSaving) return;
    var status = document.getElementById('club-sc-save-status');
    var v = normalizeView5(value || getRoundScorecardView());
    if (typeof db === 'undefined' || !db) {
        status.textContent = 'Нет соединения с базой. Общий вид не изменён.';
        return;
    }
    clubScorecardSaving = true;
    status.textContent = 'Сохраняем для всех пользователей…';
    document.querySelectorAll('#tab-scorecards > .card:first-child .club-sc-options button, #club-sc-apply').forEach(function(b) { b.disabled = true; });
    db.ref(PESTOVO_VIEW5_CONFIG.scorecard.firebase).set(v).then(function() {
        applyView5('scorecard', v);
        status.textContent = 'Вариант ' + v + ' сохранён для всех пользователей.';
    }).catch(function(err) {
        console.warn('Scorecard display save failed', err);
        status.textContent = 'Не удалось сохранить. Проверьте соединение и права администратора.';
    }).finally(function() {
        clubScorecardSaving = false;
        document.querySelectorAll('#tab-scorecards > .card:first-child .club-sc-options button, #club-sc-apply').forEach(function(b) { b.disabled = false; });
    });
}


var scoreEntryDraft = null;
var scoreEntrySaving = false;
// Премиум-карточка настройки: у каждого блока — иконка, название и описание.
var SCORE_ENTRY_BLOCK_META = {
    info:  { icon: 'fa-circle-info',   title: 'Информация о лунке',      desc: 'Лунка, пар, метры и дедлайн' },
    holes: { icon: 'fa-table-cells',   title: 'Выбор лунки',             desc: 'Все лунки раунда для быстрого перехода' },
    input: { icon: 'fa-pen-to-square', title: 'Ввод счёта и сохранение', desc: 'Квадрат счёта, кнопки ± и сохранение' }
};
function ensureScoreEntryDraft() {
    if (!scoreEntryDraft) scoreEntryDraft = { view: getScoringView(), order: scoreEntryOrder.slice() };
    return scoreEntryDraft;
}
function previewScoreEntryView(view) {
    if (scoreEntrySaving) return;
    ensureScoreEntryDraft().view = normalizeView5(view);
    renderScoreEntryPreview();
}
function moveScoreEntryBlock(index, delta) {
    if (scoreEntrySaving) return;
    var order = ensureScoreEntryDraft().order;
    var next = index + delta;
    if (next < 0 || next >= order.length) return;
    var key = order[index]; order[index] = order[next]; order[next] = key;
    renderScoreEntryPreview();
    var button = document.querySelector('#score-entry-order [data-move-key="' + key + '"][data-delta="' + delta + '"]');
    if (button && !button.disabled) button.focus();
}
function renderScoreEntryPreview() {
    var host = document.getElementById('score-entry-preview');
    if (!host) return;
    var draft = ensureScoreEntryDraft();
    document.getElementById('score-entry-order').innerHTML = draft.order.map(function(key, index) {
        var meta = SCORE_ENTRY_BLOCK_META[key] || { icon: 'fa-grip', title: key, desc: '' };
        return '<div class="entry-order-row">' +
            '<span class="sev-order-num">' + (index + 1) + '</span>' +
            '<span class="sev-order-ic"><i class="fas ' + meta.icon + '" aria-hidden="true"></i></span>' +
            '<span class="sev-order-info"><strong>' + meta.title + '</strong><small>' + meta.desc + '</small></span>' +
            '<span class="sev-order-btns">' + [-1, 1].map(function(delta) {
                return '<button type="button" class="btn" data-move-key="' + key + '" data-delta="' + delta + '" aria-label="' + meta.title + (delta < 0 ? ': выше' : ': ниже') + '" onclick="moveScoreEntryBlock(' + index + ',' + delta + ')"' + (index + delta < 0 || index + delta >= draft.order.length ? ' disabled' : '') + '>' + (delta < 0 ? '↑' : '↓') + '</button>';
            }).join('') + '</span>' +
            '</div>';
    }).join('');
    var mode = document.getElementById('score-entry-mode').value;
    var nav = '';
    for (var h = 1; h <= 18; h++) {
        nav += '<button type="button" class="hole-btn ' + (h === 7 ? 'active' : h < 7 ? 'verified' : '') + '" aria-label="Лунка ' + h + '" disabled>' + entryHoleContentHTML(h < 8 ? 5 : 0, mode === 'solo' ? null : h < 7 ? 5 : 0, h, 37) + '</button>';
    }
    function input(name, hcp, score, isMark) {
        var badge = isMark ? '<span class="dual-half__badge dual-half__badge--mark"><i class="fas fa-eye"></i> Маркер</span>' : '<span class="dual-half__badge dual-half__badge--my"><i class="fas fa-user"></i> Я</span>';
        return '<div class="dual-half ' + (isMark ? 'dual-half--mark' : 'dual-half--my') + '"><div class="dual-half__head">' + badge + '<span class="dual-half__name">' + name + ' ' + fmtTeePill(hcp < 0 ? 'bl' : 'wh') + '</span></div><div class="dual-half__score"><div class="score-disp">' + scoreSquareHTML(score, 7, hcp) + (typeof hcpCaptionHTML === 'function' ? hcpCaptionHTML(hcp, 7) : '') + '</div></div><div class="dual-half__controls"><button type="button" class="dual-btn dual-btn--minus' + (isMark ? ' dual-btn--mark' : '') + '" disabled>−</button><button type="button" class="dual-btn dual-btn--plus' + (isMark ? ' dual-btn--mark' : '') + '" disabled>+</button></div></div>';
    }
    var info = '<div class="hole-display" data-entry-block="info">' +
        '<div class="hole-box"><div class="hole-lbl">Лунка</div><div class="hole-val">7</div></div>' +
        '<div class="hole-box h-par"><div class="hole-lbl">Пар</div><div class="hole-val">' + holePar(7) + '</div></div>' +
        '<div class="hole-box h-dist"><div class="hole-lbl">Метры</div><div class="hole-val" style="font-size:24px;">385</div></div>' +
        '<div class="hole-box"><div class="hole-lbl">Дедлайн</div><div class="hole-val" style="font-size:20px;color:var(--gold-l);">12:40</div></div>' +
        '</div>';
    host.innerHTML = '<div class="score-entry card" data-entry-preview="true">' + info + '<div class="hole-nav" data-entry-block="holes">' + nav + '</div><div data-entry-block="input"><div class="dual-score-split-panel' + (mode === 'solo' ? ' single' : '') + '">' + input(mode === 'marker' ? 'Маркируемый игрок' : 'Мой счёт', 37, 5, false) + (mode !== 'solo' ? '<div class="dual-split-divider"><span></span></div>' : '') + (mode === 'group' ? input('Маркируемый игрок', -18, 4, true) : '') + '</div><button type="button" class="btn btn-g btn-block" disabled>Сохранить результат</button></div></div>';
    arrangeScoreEntry(host.firstElementChild, draft.view, draft.order);
    markAdmView5Buttons('scoring');
}
function saveScoreEntryLayout() {
    if (scoreEntrySaving) return;
    var status = document.getElementById('score-entry-status');
    if (typeof db === 'undefined' || !db) { status.textContent = 'Нет соединения с базой. Настройки не изменены.'; return; }
    var draft = ensureScoreEntryDraft();
    var view = normalizeView5(draft.view), order = normalizeScoreEntryOrder(draft.order);
    scoreEntrySaving = true;
    status.textContent = 'Сохраняем…';
    document.querySelectorAll('#score-entry-settings button, #score-entry-settings select').forEach(function(el) { el.disabled = true; });
    // Atomic write: style and hierarchy cannot get out of sync on partial failure.
    db.ref('settings').update({ scoring_view: view, scoring_order: order }).then(function() {
        applyView5('scoring', view);
        applyScoreEntryOrder(order);
        status.textContent = 'Вид и порядок блоков сохранены для всех пользователей.';
    }).catch(function(error) {
        console.warn('Score entry layout save failed', error);
        status.textContent = 'Не удалось сохранить. Проверьте соединение и права администратора.';
    }).finally(function() {
        scoreEntrySaving = false;
        document.querySelectorAll('#score-entry-settings button, #score-entry-settings select').forEach(function(el) { el.disabled = false; });
        renderScoreEntryPreview();
    });
}
