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
    if (name === 'scorecard') return saveClubScorecardView(v);
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
        : { homeTournament: 'settings/home_tournament_view', scorecard: 'settings/scorecard_view' }[name];
    if (!path) return;
    db.ref(path).set(String(v)).then(function() {
        toast(currentLang === 'en' ? '✅ View saved for all users' : '✅ Вид сохранён для всех пользователей', 'success');
    }).catch(function(err) {
        console.warn('view5 save error', err);
        toast(currentLang === 'en' ? 'Could not save to the cloud' : '⚠️ Не удалось сохранить в облако', 'error');
    });
}

function loadAdmView5Settings() {
    ['homeTournament', 'scorecard', 'roundsetup'].forEach(function(name) {
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
    handicap: { path: 'settings/handicap_display_variant', label: 'Гандикапы' }
};

function pageDisplayLabelKey(page, v) {
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
                page + '-display-opt-' + v + '" data-act="savePageDisplayVariant" data-arg="' + escapeHtml(page) + '" data-arg2="' + escapeHtml(v) + '" data-i18n="' +
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
var clubScorecardCompletedDraft = null;
var clubScorecardSaving = false;
var clubScorecardViewNames = { '1': 'Бланк клуба', '2': 'Блоки по 3 лунки', '3': 'Крупная лента', '4': 'Вертикальный список', '5': 'Плитки' };
function previewClubScorecardView(value) {
    clubScorecardPreviewView = normalizeView5(value);
    renderClubScorecardPreview();
}
function previewCompletedScorecardView(value) {
    clubScorecardCompletedDraft = normalizeScorecardDisplay({ completedView: value }).completedView;
    renderClubScorecardPreview();
}
function renderClubScorecardSavedState() {
    var saved = getScorecardDisplaySettings();
    var label = document.getElementById('club-sc-saved');
    if (label) label.textContent = 'Сохранено: общий — ' + saved.view + ' · ' + clubScorecardViewNames[saved.view] + '; завершённые — ' + (saved.completedView === 'inherit' ? 'как общий' : saved.completedView + ' · ' + clubScorecardViewNames[saved.completedView]) + '.';
    var undo = document.getElementById('club-sc-undo');
    if (undo) {
        var previous = scorecardDisplayState && scorecardDisplayState.previous;
        undo.disabled = clubScorecardSaving || !previous;
        undo.title = previous ? 'Восстановить: общий ' + previous.view + ', завершённые ' + (previous.completedView === 'inherit' ? 'как общий' : previous.completedView) : 'Предыдущего сохранения пока нет';
    }
    var select = document.getElementById('club-sc-completed-view');
    if (select && clubScorecardCompletedDraft === null) select.value = saved.completedView;
    markAdmView5Buttons('scorecard');
}
function renderClubScorecardPreview() {
    var el = document.getElementById('club-sc-preview');
    if (!el) return;
    function selected(id, fallback) { var input = document.getElementById(id); return input ? input.value : fallback; }
    var count = parseInt(selected('club-sc-preview-players', '1'), 10);
    if ([1, 2, 4].indexOf(count) < 0) count = 1;
    var holes = selected('club-sc-preview-holes', '18') === '9' ? 9 : 18;
    var completed = selected('club-sc-preview-status', 'active') === 'completed';
    var round = { status: completed ? 'completed' : 'active', holeRange: '1-' + holes, players: {} };
    var names = ['Александр Иванов', 'Мария Петрова', 'Александр Ильин', 'Елена Смирнова'];
    for (var i = 0; i < count; i++) {
        var scores = {}, marker = {};
        for (var h = 1; h <= (completed ? holes : Math.min(holes - 2, 12)); h++) {
            scores[h] = holePar(h) + ((h + i) % 3) - 1;
            marker[h] = scores[h];
        }
        if (!completed && marker[7]) marker[7] += 1;
        round.players['preview' + i] = { name: names[i], tee: i % 2 ? 'rd' : 'wh', fieldHcp: [23, 12, 0, -2][i], scores: scores, markedBy: 'marker', markerScores: { marker: marker } };
    }
    var saved = getScorecardDisplaySettings();
    var general = clubScorecardPreviewView || saved.view;
    var finished = clubScorecardCompletedDraft === null ? saved.completedView : clubScorecardCompletedDraft;
    var view = completed && finished !== 'inherit' ? finished : general;
    el.innerHTML = count === 1
        ? renderClubScorecard(round.players.preview0, round, { playerId: 'preview0', showMarker: !completed })
        : renderUnifiedGroupScorecardHTML(round, Object.entries(round.players), getRoundOrder(round), { showMarker: !completed });
    var card = el.querySelector('.club-sc');
    card.setAttribute('data-sc-preview', 'true');
    card.setAttribute('data-sc-view', view);
    var caption = document.getElementById('club-sc-preview-caption');
    if (caption) caption.textContent = (completed ? 'Завершённый' : 'Активный') + ' · ' + count + ' игр. · ' + holes + ' лунок · вид ' + view + ' — ' + clubScorecardViewNames[view] + '. Это предпросмотр, изменения ещё не опубликованы.';
    renderClubScorecardSavedState();
}

// A single transaction preserves the actual preceding server values, including
// when another administrator saves concurrently. Local events are suppressed:
// only the acknowledged snapshot is presented as successfully saved.
// Кнопка сохранения передавала текущий предпросмотр прямо в onclick=.
pestovoOnAction('pestovoSaveClubScorecardView', function () {
    saveClubScorecardView(clubScorecardPreviewView);
});

function saveClubScorecardView(value) {
    return persistClubScorecardDisplay(false, {
        view: normalizeView5(value || clubScorecardPreviewView || getRoundScorecardView()),
        completedView: clubScorecardCompletedDraft === null ? getScorecardDisplaySettings().completedView : clubScorecardCompletedDraft
    });
}
function restoreClubScorecardView() { return persistClubScorecardDisplay(true); }
function persistClubScorecardDisplay(restore, draft) {
    if (clubScorecardSaving) return Promise.resolve(false);
    var status = document.getElementById('club-sc-save-status');
    function message(text) { if (status) status.textContent = text; }
    if (typeof db === 'undefined' || !db || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
        message('Нет соединения с базой. Общий вид не изменён.');
        return Promise.resolve(false);
    }
    clubScorecardSaving = true;
    message('Сохраняем для всех пользователей…');
    var selector = '#tab-scorecards .club-sc-options button, #club-sc-apply, #club-sc-undo, #club-sc-completed-view';
    document.querySelectorAll(selector).forEach(function(b) { b.disabled = true; });
    // Read the legacy value on first migration, rather than trusting a stale
    // local cache as the rollback snapshot. Once migrated, transaction data wins.
    return db.ref(PESTOVO_VIEW5_CONFIG.scorecard.firebase).once('value').then(function(sn) {
        var legacy = { view: normalizeView5(sn.val()), completedView: 'inherit' };
        return db.ref(SCORECARD_DISPLAY_PATH).transaction(function(current) {
            var before = current ? normalizeScorecardDisplay(current) : legacy;
            if (restore && !(current && current.previous)) return;
            var next = restore ? normalizeScorecardDisplay(current.previous) : normalizeScorecardDisplay(draft);
            if (next.view === before.view && next.completedView === before.completedView) return;
            return { view: next.view, completedView: next.completedView, previous: before };
        }, undefined, false);
    }).then(function(result) {
        if (!result.committed) { message(restore ? 'Нет предыдущего отличающегося оформления для возврата.' : 'Эти настройки уже сохранены.'); return false; }
        applyScorecardDisplaySettings(result.snapshot.val());
        clubScorecardPreviewView = null;
        clubScorecardCompletedDraft = null;
        renderClubScorecardPreview();
        message(restore ? 'Предыдущее оформление восстановлено для всех игроков.' : 'Оба вида сохранены для всех игроков.');
        return true;
    }).catch(function(err) {
        console.warn('Scorecard display save failed', err);
        message('Не удалось сохранить. Проверьте соединение и права администратора.');
        return false;
    }).finally(function() {
        clubScorecardSaving = false;
        document.querySelectorAll(selector).forEach(function(b) { b.disabled = false; });
        renderClubScorecardSavedState();
    });
}


// ── Гибкая глобальная настройка экранов турниров и ввода счёта ────────────
var pestovoDisplayEditorDrafts = {};
var pestovoDisplayEditorDirty = {};
var pestovoDisplayEditorSaving = {};
var PESTOVO_DISPLAY_ORDER_LABELS = {
    tournaments: {
        active: { ru: 'Активный турнир', en: 'Active tournament' },
        upcoming: { ru: 'Предстоящие старты', en: 'Upcoming tournaments' },
        archive: { ru: 'Архив', en: 'Archive' }
    },
    scoring: {
        info: { ru: 'Информация о лунке', en: 'Hole information' },
        holes: { ru: 'Навигация по лункам', en: 'Hole navigation' },
        input: { ru: 'Ввод счёта', en: 'Score input' }
    },
    tournamentScoring: {
        info: { ru: 'Информация о лунке', en: 'Hole information' },
        holes: { ru: 'Навигация по лункам', en: 'Hole navigation' },
        input: { ru: 'Ввод счёта', en: 'Score input' }
    }
};
function pestovoDisplayEditorSource(scope) {
    if (scope !== 'tournamentScoring') return getPestovoDisplaySettings(scope);
    var base = getPestovoDisplaySettings('scoring');
    var override = getPestovoDisplaySettings('tournamentScoring');
    Object.keys(override.visible).forEach(function(key) { base.visible[key] = override.visible[key]; });
    if (override.order) base.order = override.order.slice();
    return base;
}
function pestovoDisplayEditorDraft(scope, reset) {
    if (reset || !pestovoDisplayEditorDrafts[scope]) {
        pestovoDisplayEditorDrafts[scope] = pestovoDisplayEditorSource(scope);
        pestovoDisplayEditorDirty[scope] = false;
    }
    return pestovoDisplayEditorDrafts[scope];
}
function pestovoDisplayScopeStatusId(scope) {
    return scope === 'tournaments' ? 'tournaments-display-status' :
        scope === 'tournamentScoring' ? 'tn-score-display-status' : 'score-entry-display-status';
}
function pestovoDisplayLabel(meta) {
    if (!meta) return '';
    return currentLang === 'en' ? (meta.en || meta.ru || '') : (meta.ru || meta.en || '');
}
function renderPestovoDisplayAdmin(scope, force) {
    scope = scope || 'scoring';
    if (!PESTOVO_DISPLAY_CONFIGS || !PESTOVO_DISPLAY_CONFIGS[scope]) return;
    if (force || !pestovoDisplayEditorDirty[scope]) pestovoDisplayEditorDraft(scope, true);
    var draft = pestovoDisplayEditorDraft(scope);
    var isTournamentPage = scope === 'tournaments';
    var meta = isTournamentPage ? PESTOVO_TOURNAMENT_DISPLAY_META : PESTOVO_SCORE_DISPLAY_META;
    var keys = isTournamentPage ? PESTOVO_TOURNAMENT_DISPLAY_KEYS : PESTOVO_SCORE_DISPLAY_KEYS;
    var host = document.getElementById(isTournamentPage ? 'tournaments-display-elements' :
        scope === 'tournamentScoring' ? 'tn-score-display-elements' : 'score-entry-display-elements');
    if (host) {
        host.innerHTML = keys.map(function(key) {
            var item = meta[key] || { ru: key, en: key };
            var checked = draft.visible[key] !== false;
            var required = !isTournamentPage && (key === 'input' || key === 'myScore');
            return '<label class="screen-display-option' + (checked ? ' is-on' : '') + (required ? ' is-required' : '') + '">' +
                '<input type="checkbox" data-screen-display-toggle="' + escapeHtml(scope) + '" data-display-key="' + escapeHtml(key) + '"' +
                (checked ? ' checked' : '') + (required ? ' disabled aria-disabled="true"' : '') +
                ' data-act="setPestovoDisplayDraftVisible" data-arg="' + escapeHtml(scope) + '" data-arg2="' + escapeHtml(key) + '" data-checked="1">' +
                '<span>' + escapeHtml(pestovoDisplayLabel(item)) + (required ? '<small>' + (currentLang === 'en' ? 'Required to save scores' : 'Нужен для сохранения счёта') + '</small>' : '') + '</span></label>';
        }).join('');
    }
    var orderHost = document.getElementById(isTournamentPage ? 'tournaments-display-order' :
        scope === 'tournamentScoring' ? 'tn-score-display-order' : 'score-entry-display-order');
    if (orderHost) {
        var orderLabels = PESTOVO_DISPLAY_ORDER_LABELS[scope] || {};
        orderHost.innerHTML = draft.order.map(function(key, index) {
            var label = pestovoDisplayLabel(orderLabels[key]);
            return '<div class="screen-display-order-row"><span><b>' + (index + 1) + '</b> ' + escapeHtml(label || key) + '</span>' +
                '<div><button type="button" class="btn btn-ol btn-sm" data-display-order-move="up" aria-label="' + (currentLang === 'en' ? 'Move up' : 'Переместить выше') + '"' +
                (index === 0 ? ' disabled' : '') + ' data-act="movePestovoDisplayDraftOrder" data-arg="' + escapeHtml(scope) + '" data-arg2="' + index + '" data-arg3="-1"><i class="fas fa-arrow-up"></i></button>' +
                '<button type="button" class="btn btn-ol btn-sm" data-display-order-move="down" aria-label="' + (currentLang === 'en' ? 'Move down' : 'Переместить ниже') + '"' +
                (index === draft.order.length - 1 ? ' disabled' : '') + ' data-act="movePestovoDisplayDraftOrder" data-arg="' + escapeHtml(scope) + '" data-arg2="' + index + '" data-arg3="1"><i class="fas fa-arrow-down"></i></button></div></div>';
        }).join('');
    }
    if (isTournamentPage) {
        var layout = document.getElementById('tournaments-display-layout');
        if (layout) layout.value = draft.layout;
    }
    var saveButton = document.querySelector('[data-display-save="' + scope + '"]');
    if (saveButton) saveButton.disabled = !!pestovoDisplayEditorSaving[scope];
    var resetButton = document.querySelector('[data-display-reset="' + scope + '"]');
    if (resetButton) resetButton.disabled = !!pestovoDisplayEditorSaving[scope];
    renderPestovoDisplayPreview(scope, draft);
}
function renderPestovoDisplayPreview(scope, draft) {
    var id = scope === 'tournaments' ? 'tournaments-display-preview' :
        scope === 'tournamentScoring' ? 'tn-score-display-preview' : 'score-entry-display-preview';
    var host = document.getElementById(id);
    if (!host) return;
    var isTournament = scope === 'tournaments';
    var meta = isTournament ? PESTOVO_TOURNAMENT_DISPLAY_META : PESTOVO_SCORE_DISPLAY_META;
    var orderLabels = PESTOVO_DISPLAY_ORDER_LABELS[scope] || {};
    var shown = Object.keys(draft.visible).filter(function(key) { return draft.visible[key] !== false; });
    var labels = shown.map(function(key) { return pestovoDisplayLabel(meta[key]); }).filter(Boolean);
    var order = draft.order.map(function(key) { return pestovoDisplayLabel(orderLabels[key]) || key; });
    host.innerHTML = '<div class="screen-display-preview-head"><i class="fas ' + (isTournament ? 'fa-trophy' : 'fa-golf-ball-tee') + '"></i> ' +
        (isTournament ? (currentLang === 'en' ? 'Tournament page' : 'Страница турниров') : (currentLang === 'en' ? 'Score entry' : 'Экран ввода счёта')) +
        (isTournament ? '<span>' + escapeHtml(draft.layout) + '</span>' : '') + '</div>' +
        '<div class="screen-display-preview-order">' + order.map(function(label, index) { return '<span><b>' + (index + 1) + '</b>' + escapeHtml(label) + '</span>'; }).join('') + '</div>' +
        '<p>' + (currentLang === 'en' ? 'Visible elements' : 'Показываются') + ': <strong>' + labels.length + '</strong></p>';
}
function setPestovoDisplayDraftVisible(scope, key, checked) {
    if (pestovoDisplayEditorSaving[scope]) return;
    if (scope === 'tournaments' && PESTOVO_TOURNAMENT_DISPLAY_KEYS.indexOf(key) === -1) return;
    if (scope !== 'tournaments' && PESTOVO_SCORE_DISPLAY_KEYS.indexOf(key) === -1) return;
    if (scope !== 'tournaments' && (key === 'input' || key === 'myScore')) return;
    var draft = pestovoDisplayEditorDraft(scope);
    draft.visible[key] = !!checked;
    pestovoDisplayEditorDirty[scope] = true;
    renderPestovoDisplayAdmin(scope);
}
function setPestovoDisplayDraftLayout(value) {
    if (pestovoDisplayEditorSaving.tournaments) return;
    if (PESTOVO_TOURNAMENT_DISPLAY_LAYOUTS.indexOf(String(value)) === -1) return;
    pestovoDisplayEditorDraft('tournaments').layout = String(value);
    pestovoDisplayEditorDirty.tournaments = true;
    renderPestovoDisplayAdmin('tournaments');
}
function movePestovoDisplayDraftOrder(scope, index, delta) {
    // Аргументы приходят из data-атрибутов, то есть строками.
    index = parseInt(index, 10);
    delta = parseInt(delta, 10);
    if (pestovoDisplayEditorSaving[scope]) return;
    var draft = pestovoDisplayEditorDraft(scope);
    var next = index + delta;
    if (next < 0 || next >= draft.order.length) return;
    var key = draft.order[index];
    draft.order[index] = draft.order[next];
    draft.order[next] = key;
    pestovoDisplayEditorDirty[scope] = true;
    renderPestovoDisplayAdmin(scope);
    var button = document.querySelector('[data-display-save="' + scope + '"]');
    if (button && button.focus) button.focus({ preventScroll: true });
}
function pestovoDisplayConfigPayload(scope, draft) {
    if (scope === 'tournamentScoring') {
        var visible = {};
        PESTOVO_SCORE_DISPLAY_KEYS.forEach(function(key) {
            if (key !== 'input') visible[key] = draft.visible[key] !== false;
        });
        return { order: draft.order.slice(), visible: visible };
    }
    return normalizePestovoDisplaySettings(scope, draft);
}
function savePestovoDisplaySettings(scope) {
    if (!PESTOVO_DISPLAY_CONFIGS[scope] || pestovoDisplayEditorSaving[scope]) return;
    var draft = pestovoDisplayEditorDraft(scope);
    var payload = pestovoDisplayConfigPayload(scope, draft);
    var status = document.getElementById(pestovoDisplayScopeStatusId(scope));
    var resetToGlobal = scope === 'tournamentScoring' && draft._resetToGlobal === true;
    if (resetToGlobal) payload = { order: null, visible: {} };
    if (typeof vib === 'function') vib(25);
    if (typeof db === 'undefined' || !db) {
        setPestovoDisplaySettings(scope, payload);
        pestovoDisplayEditorDirty[scope] = false;
        if (status) status.textContent = currentLang === 'en'
            ? 'Saved on this device only: the database is not connected.'
            : 'Сохранено только на этом устройстве: нет соединения с базой.';
        return;
    }
    pestovoDisplayEditorSaving[scope] = true;
    renderPestovoDisplayAdmin(scope);
    if (status) status.textContent = currentLang === 'en' ? 'Saving shared settings…' : 'Сохраняем общие настройки…';
    db.ref(PESTOVO_DISPLAY_CONFIGS[scope].firebase).set(payload).then(function() {
        setPestovoDisplaySettings(scope, payload);
        pestovoDisplayEditorDrafts[scope] = null;
        pestovoDisplayEditorDirty[scope] = false;
        if (status) status.textContent = resetToGlobal
            ? (currentLang === 'en' ? 'Tournament QR screens now inherit the shared score-entry settings.' : 'Для турнирных QR-экранов снова действуют общие настройки ввода счёта.')
            : (currentLang === 'en' ? '✅ Applied for all players.' : '✅ Настройки применены для всех игроков.');
        renderPestovoDisplayAdmin(scope, true);
    }).catch(function(error) {
        console.warn('Display settings save failed (' + scope + ')', error);
        if (status) status.textContent = currentLang === 'en'
            ? 'Could not save. Check the connection and administrator permissions.'
            : 'Не удалось сохранить. Проверьте соединение и права администратора.';
    }).finally(function() {
        pestovoDisplayEditorSaving[scope] = false;
        renderPestovoDisplayAdmin(scope);
    });
}
function resetPestovoDisplaySettings(scope) {
    if (pestovoDisplayEditorSaving[scope]) return;
    if (scope === 'tournamentScoring') {
        pestovoDisplayEditorDrafts[scope] = { order: getPestovoDisplaySettings('scoring').order.slice(), visible: getPestovoDisplaySettings('scoring').visible, _resetToGlobal: true };
        pestovoDisplayEditorDirty[scope] = true;
        savePestovoDisplaySettings(scope);
        return;
    }
    var defaults = normalizePestovoDisplaySettings(scope, null);
    pestovoDisplayEditorDrafts[scope] = defaults;
    pestovoDisplayEditorDirty[scope] = true;
    savePestovoDisplaySettings(scope);
}
function openTournamentsPagePreview() {
    try { window.open('tournaments.html', '_blank', 'noopener'); } catch (e) { console.warn('[display] preview open failed', e); }
}
