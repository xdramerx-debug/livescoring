// js/admin-name-forms.js — «Формы имён» (Наташа = Наталья = Наталия):
// выбор режима сопоставления, пользовательские псевдонимы, синхронизация
// настроек через settings/nameVariants; вынесено из js/admin.js
// (docs/CODE-REVIEW.md, п.3 — фичи-модули). Внешних зависимостей от
// admin.js нет; load-time nmApplyStored() самодостаточен (typeof
// NameVariants + try/catch). Грузится в admin.html рядом с admin.js.

// ==========================================
// ФОРМЫ ИМЁН (Наташа = Наталья = Наталия)
// ==========================================
// Словарь и три режима совпадения — в js/name-variants.js.
var NM_MODE_KEY = 'pestovo_name_match_mode';
var NM_ALIASES_KEY = 'pestovo_name_aliases';
var NM_AUTO_KEY = 'pestovo_name_autoapply';

var NM_MODE_INFO = [
    {
        id: 'off',
        title: { ru: 'Не учитывать формы имени (как сейчас)', en: 'Ignore name forms (current behaviour)' },
        text: {
            ru: 'Имя сравнивается как текст: «Наташа» не найдёт «Наталья» и не объединит дубли.',
            en: 'Names are compared as plain text: «Natasha» will not find «Natalia».'
        }
    },
    {
        id: 'A',
        title: { ru: 'Вариант 1 — Словарь форм имени', en: 'Option 1 — Dictionary of name forms' },
        text: {
            ru: 'Известные формы (Наташа = Наталья = Наталия, Катя = Екатерина, Саша = Александр…) и латиница (Natalia = Наталия). Фамилия должна совпасть точно. Автоматически HCP обновится только при точной фамилии.',
            en: 'Known forms (Natasha = Natalia, Kate = Catherine…) and latin spelling. Surname must match exactly.'
        }
    },
    {
        id: 'B',
        title: { ru: 'Вариант 2 — Словарь + допуск (рекомендуется)', en: 'Option 2 — Dictionary + tolerance (recommended)' },
        text: {
            ru: 'Всё из варианта 1 плюс: мужской/женский род фамилии (Смирнов/Смирнова), транслитерация фамилии (Smirnova = Смирнова), опечатки (Ноталья), отчества не мешают. Нечёткие совпадения не применяются сами, а попадают в блок «Выберите нужного игрока».',
            en: 'Option 1 plus surname gender (Smirnov/Smirnova), transliteration and typos. Fuzzy matches go to the manual choice block.'
        }
    },
    {
        id: 'C',
        title: { ru: 'Вариант 3 — Максимум + свой словарь', en: 'Option 3 — Maximum + custom dictionary' },
        text: {
            ru: 'Всё из варианта 2 плюс: инициалы («Н. Смирнова» = «Наталья Смирнова»), основа фамилии (Смирн/Смирнова) и ваши собственные формы имён в поле ниже. Максимальный охват, но чаще придётся выбирать вручную.',
            en: 'Option 2 plus initials, surname stems and your own name forms.'
        }
    }
];

/** Применяет сохранённый режим сразу при загрузке админки. */
function nmApplyStored() {
    if (typeof NameVariants === 'undefined') return;
    // По умолчанию: формы имени не учитываются, автоприменение выключено —
    // нужный режим администратор включает сам в блоке «Формы имён».
    var mode = 'off', aliases = '', auto = false;
    try {
        mode = localStorage.getItem(NM_MODE_KEY) || 'off';
        aliases = localStorage.getItem(NM_ALIASES_KEY) || '';
        auto = localStorage.getItem(NM_AUTO_KEY) === '1';
    } catch (e) { console.warn("[silent]", e); }
    NameVariants.setMode(mode);
    NameVariants.setCustomAliases(aliases);
    NameVariants.setAutoApply(auto);
}
nmApplyStored();

function nmCurrentMode() {
    return (typeof NameVariants !== 'undefined') ? NameVariants.getMode() : 'off';
}

function nmLoadSettings(fromRemote) {
    var list = document.getElementById('nm-mode-list');
    if (!list) return;
    var en = currentLang === 'en';
    var mode = nmCurrentMode();
    var html = '';
    NM_MODE_INFO.forEach(function(m) {
        html += '<label class="nm-mode" style="display:block;gap:10px;align-items:flex-start;padding:10px 12px;margin-bottom:8px;' +
            'background:rgba(255,255,255,0.03);border:1px solid ' + (m.id === mode ? 'var(--gold)' : 'var(--border)') +
            ';border-radius:10px;cursor:pointer;">' +
            '<input type="radio" name="nm-mode" value="' + m.id + '" ' + (m.id === mode ? 'checked' : '') +
            ' onchange="nmToggleCustomBlock()" style="width:18px;height:18px;margin-top:3px;cursor:pointer;">' +
            '<span><b style="color:' + (m.id === mode ? 'var(--gold)' : 'var(--white)') + ';font-size:13px;">' +
            escapeHtml(en ? m.title.en : m.title.ru) + '</b>' +
            '<br><span style="color:var(--muted);font-size:12px;">' + escapeHtml(en ? m.text.en : m.text.ru) + '</span></span></label>';
    });
    list.innerHTML = html;

    var autoEl = document.getElementById('nm-autoapply');
    if (autoEl && typeof NameVariants !== 'undefined') autoEl.checked = NameVariants.getAutoApply();

    var ta = document.getElementById('nm-custom-aliases');
    if (ta) {
        var saved = '';
        try { saved = localStorage.getItem(NM_ALIASES_KEY) || ''; } catch (e) { console.warn("[silent]", e); }
        ta.value = saved;
    }
    nmToggleCustomBlock();

    if (typeof db !== 'undefined' && !fromRemote) {
        db.ref('settings/nameMatching').once('value').then(function(sn) {
            var v = sn.val() || {};
            if (!v || typeof v !== 'object') return;
            if (v.mode && typeof NameVariants !== 'undefined') {
                NameVariants.setMode(v.mode);
                try { localStorage.setItem(NM_MODE_KEY, v.mode); } catch (e) { console.warn("[silent]", e); }
            }
            if (typeof v.aliases === 'string') {
                if (typeof NameVariants !== 'undefined') NameVariants.setCustomAliases(v.aliases);
                try { localStorage.setItem(NM_ALIASES_KEY, v.aliases); } catch (e) { console.warn("[silent]", e); }
                if (ta) ta.value = v.aliases;
            }
            if (v.autoApply != null && typeof NameVariants !== 'undefined') {
                NameVariants.setAutoApply(v.autoApply === true);
                try { localStorage.setItem(NM_AUTO_KEY, v.autoApply === true ? '1' : '0'); } catch (e) { console.warn("[silent]", e); }
                if (autoEl) autoEl.checked = (v.autoApply === true);
            }
            nmLoadSettings(true);
        }).catch(function() {});
    }
}

function nmToggleCustomBlock() {
    var box = document.getElementById('nm-custom-block');
    if (!box) return;
    var anyChecked = document.querySelector('input[name="nm-mode"]:checked');
    box.classList.toggle('hidden', !anyChecked || anyChecked.value !== 'C');
}

function nmSaveSettings() {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    if (typeof NameVariants === 'undefined') return;
    var checked = document.querySelector('input[name="nm-mode"]:checked');
    var mode = checked ? checked.value : 'off';
    var autoEl = document.getElementById('nm-autoapply');
    var ta = document.getElementById('nm-custom-aliases');
    var aliases = ta ? ta.value : '';

    NameVariants.setMode(mode);
    NameVariants.setAutoApply(autoEl ? autoEl.checked : true);
    NameVariants.setCustomAliases(aliases);
    try {
        localStorage.setItem(NM_MODE_KEY, mode);
        localStorage.setItem(NM_ALIASES_KEY, aliases);
        localStorage.setItem(NM_AUTO_KEY, (autoEl && !autoEl.checked) ? '0' : '1');
    } catch (e) { console.warn("[silent]", e); }
    if (typeof db !== 'undefined') {
        db.ref('settings/nameMatching').update({
            mode: mode,
            aliases: aliases,
            autoApply: !!(autoEl && autoEl.checked),
            updatedAt: Date.now()
        }).catch(function() {});
    }
    nmLoadSettings(true);
    toast(currentLang === 'en' ? '✅ Name matching settings saved' : '✅ Настройки сравнения имён сохранены', 'success');
}

/** Показывает, какие имена игроков система теперь считает одинаковыми
 *  и какие формы имени будет искать в базе АГР. */
function nmAnalyzeNames() {
    var out = document.getElementById('nm-analyze-results');
    if (!out || typeof NameVariants === 'undefined') return;
    var en = currentLang === 'en';
    out.innerHTML = '<p style="color:var(--muted);font-size:12px;"><i class="fas fa-spinner fa-spin"></i> ' +
        (en ? 'Analysing player names…' : 'Анализирую имена игроков…') + '</p>';

    impCollectPlayers(function(players) {
        var savedMode = NameVariants.getMode();
        // анализ показываем по максимуму — независимо от выбранного режима
        NameVariants.setMode('C');
        var collisions = NameVariants.findFormCollisions(players);

        var withForms = [];
        (players || []).forEach(function(p) {
            var d = p.data || {};
            var first = NameVariants.norm(d.firstName || NameVariants.splitNameParts(d).first);
            if (!first) return;
            var forms = NameVariants.officialFormsOf(first);
            var others = forms.filter(function(f) { return f !== first; });
            if (forms.length || NameVariants.hasKnownForms(first)) {
                withForms.push({ name: rgPlayerDisplayName(p), first: first, forms: NameVariants.formsOf(first), others: others });
            }
        });
        NameVariants.setMode(savedMode);

        var html = '';
        html += '<div class="imp-note" style="margin-top:14px;"><i class="fas fa-circle-info"></i> ' +
            (en
                ? 'Players: <b>' + (players || []).length + '</b> · with known name forms: <b>' + withForms.length + '</b> · collisions found: <b>' + collisions.length + '</b>'
                : 'Игроков: <b>' + (players || []).length + '</b> · с известными формами имени: <b>' + withForms.length + '</b> · найдено совпадений: <b>' + collisions.length + '</b>') +
            '</div>';

        if (collisions.length) {
            html += '<h3 style="color:var(--gold);font-size:14px;margin:14px 0 8px;"><i class="fas fa-clone"></i> ' +
                (en ? 'Same player written differently' : 'Один и тот же игрок, записанный по-разному') + ' (' + collisions.length + ')</h3>';
            collisions.forEach(function(c) {
                html += '<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;">';
                html += '<div style="font-weight:700;font-size:13px;color:var(--white);">' +
                    escapeHtml(NameVariants.cap(c.canon)) + ' ' + escapeHtml(NameVariants.cap(c.lastName)) +
                    ' <span style="color:var(--muted);font-weight:400;">· ' + escapeHtml(c.forms.join(' / ')) + '</span></div>';
                c.players.forEach(function(pl) {
                    var d = pl.data || {};
                    html += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">• ' + escapeHtml(rgPlayerDisplayName(pl)) +
                        ' · HCP ' + (d.handicap != null ? fmtExactHcp(d.handicap) : '—') +
                        (d.rusgolfNumber ? ' · 💳 ' + escapeHtml(d.rusgolfNumber) : '') + '</div>';
                });
                html += '</div>';
            });
        }

        if (withForms.length) {
            html += '<h3 style="color:var(--gold);font-size:14px;margin:14px 0 8px;"><i class="fas fa-magnifying-glass"></i> ' +
                (en ? 'Which name forms will be searched in the RGA database' : 'Какие формы имени будут проверены в базе АГР') + '</h3>';
            html += '<div style="font-size:12px;color:var(--muted);line-height:1.9;">';
            withForms.forEach(function(w) {
                html += '<div>• <b style="color:var(--white);">' + escapeHtml(w.name) + '</b>' +
                    (w.others.length ? ' <span style="color:var(--muted);">→ в АГР ищем также: ' +
                    escapeHtml(w.others.map(function(f) { return NameVariants.cap(f); }).join(', ')) + '</span>' : '') + '</div>';
            });
            html += '</div>';
        }

        if (!collisions.length && !withForms.length) {
            html += '<div class="imp-note"><i class="fas fa-check"></i> ' +
                (en ? 'No name forms to normalise.' : 'Формы имён приводить не нужно.') + '</div>';
        }
        out.innerHTML = html;
    });
}
