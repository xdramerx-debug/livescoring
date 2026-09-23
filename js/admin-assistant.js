// js/admin-assistant.js — «Помощник»: управление источниками знаний
// (список PDF/ссылок, скрытие страницы, перестроение индекса) в админке;
// вынесено из js/admin.js (docs/CODE-REVIEW.md, п.3 — фичи-модули).
// Внешних зависимостей от admin.js нет: только runtime-глобалы фундаментов
// (db, toast, t, currentLang, esc/escapeHtml) и guarded-вызовы assistant-*.

// ==========================================
// «ПОМОЩНИК» — УПРАВЛЕНИЕ ИСТОЧНИКАМИ (PDF ПО ССЫЛКЕ)
// ==========================================
var ASSISTANT_SOURCES_KEY = 'pestovo_assistant_sources';
var ASSISTANT_INDEX_KEY = 'pestovo_assistant_index';

function getAssistantCustomSources() {
    try {
        var raw = localStorage.getItem(ASSISTANT_SOURCES_KEY);
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
}

function getAssistantCustomIndex() {
    try {
        var raw = localStorage.getItem(ASSISTANT_INDEX_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function renderAssistantSources() {
    var cont = document.getElementById('as-source-list');
    if (!cont) return;
    var sources = getAssistantCustomSources();
    if (!sources.length) {
        cont.innerHTML = '<p style="color:var(--muted);font-size:13px;margin:0;">' +
            (currentLang === 'en' ? 'No additional sources yet — only the base PDFs in docs/ are used.' : 'Дополнительных источников пока нет — используются базовые PDF из папки docs/.') + '</p>';
        return;
    }
    cont.innerHTML = '';
    sources.forEach(function (s, i) {
        var item = document.createElement('div');
        item.className = 'list-item';
        item.style.cssText = 'padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex:1 1 280px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:10px;';
        item.innerHTML =
            '<div style="min-width:0;">' +
                '<div style="font-weight:700;font-size:13px;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><i class="fas fa-file-pdf"></i> ' + escAttr(s.title || '—') + '</div>' +
                '<div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escAttr(String(s.url || '')) + '</div>' +
            '</div>' +
            '<button type="button" class="btn btn-r btn-sm" onclick="assistantRemoveSource(' + i + ')"><i class="fas fa-trash"></i> ' +
            (currentLang === 'en' ? 'Delete' : 'Удалить') + '</button>';
        cont.appendChild(item);
    });
}

function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function assistantAddSource() {
    var titleEl = document.getElementById('as-add-title');
    var urlEl = document.getElementById('as-add-url');
    var title = titleEl ? titleEl.value.trim() : '';
    var url = urlEl ? urlEl.value.trim() : '';
    var status = document.getElementById('as-add-status');
    if (status) status.className = 'as-status';
    if (!title) { if (status) { status.textContent = currentLang === 'en' ? 'Enter a document name' : 'Введите название документа'; } return; }
    if (!url) { if (status) { status.textContent = currentLang === 'en' ? 'Enter the PDF link' : 'Введите ссылку на PDF'; } return; }
    // Валидация: относительный путь или http(s)
    if (!/^(https?:\/\/|\/|docs\/|\.\/|[A-Za-z]:\\)/i.test(url) && !/\.pdf$/i.test(url)) {
        if (status) { status.textContent = currentLang === 'en' ? 'Link must point to a PDF or a relative path' : 'Ссылка должна вести на PDF или быть относительным путём'; }
        return;
    }

    var sources = getAssistantCustomSources();
    if (sources.some(function (s) { return s.url === url; })) {
        if (status) { status.textContent = currentLang === 'en' ? 'This source is already added' : 'Такой источник уже добавлен'; }
        return;
    }
    sources.push({ id: 'src-' + Date.now(), title: title, url: url });
    saveAssistantSources(sources);
    if (titleEl) titleEl.value = '';
    if (urlEl) urlEl.value = '';
    if (status) { status.textContent = currentLang === 'en' ? 'Source added. Click "Save and rebuild".' : 'Источник добавлен. Нажмите «Сохранить и перестроить».'; }
    renderAssistantSources();
}

function assistantRemoveSource(index) {
    var sources = getAssistantCustomSources();
    if (index < 0 || index >= sources.length) return;
    sources.splice(index, 1);
    saveAssistantSources(sources);
    renderAssistantSources();
}

function saveAssistantSources(sources) {
    try { localStorage.setItem(ASSISTANT_SOURCES_KEY, JSON.stringify(sources)); } catch (e) { console.warn("[silent]", e); }
    if (typeof db !== 'undefined') {
        var obj = {};
        sources.forEach(function (s, i) { obj[i] = s; });
        db.ref('settings/assistant_sources').set(obj).catch(function (err) {
            console.warn('Cannot sync assistant_source to Firebase', err);
        });
    }
}

// Синхронизация источника из Firebase (на устройствах админа)
function loadAssistantSourcesFromFirebase() {
    if (typeof db === 'undefined' || !db) return;
    // Одна подписка: bindRealtimeValue не плодит дубли при повторных заходах на вкладку.
    bindRealtimeValue('admin-assistant-sources', db.ref('settings/assistant_sources'), function (sn) {
        var v = sn.val();
        var arr = [];
        if (v && typeof v === 'object') {
            Object.keys(v).forEach(function (k) {
                if (v[k] && v[k].url) arr.push(v[k]);
            });
        }
        try { localStorage.setItem(ASSISTANT_SOURCES_KEY, JSON.stringify(arr)); } catch (e) { console.warn("[silent]", e); }
        renderAssistantSources();
    });
}

// Пересборка индекса (база + добавленные источники) и сохранение
function assistantRebuildIndex() {
    var status = document.getElementById('as-rebuild-status');
    var btn = document.getElementById('as-rebuild-btn');
    if (status) { status.className = 'as-status'; status.textContent = currentLang === 'en' ? 'Building index…' : 'Собираю индекс…'; }
    if (btn) btn.disabled = true;

    var sources = getAssistantCustomSources();
    if (typeof AssistantBuild === 'undefined') {
        if (status) { status.className = 'as-status as-err'; status.textContent = currentLang === 'en' ? 'Index builder not loaded' : 'Не удалось загрузить сборщик индекса'; }
        if (btn) btn.disabled = false;
        return;
    }

    // Загружаем базовый индекс
    var basePromise = fetch('docs/assistant-index.json', { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }).catch(function () { return { name: 'База знаний', sources: [], chunks: [], df: {}, docCount: 0 }; });

    basePromise.then(function (baseIndex) {
        return AssistantBuild.buildIndex(baseIndex, sources, function (title, phase) {
            if (status) status.textContent = (phase === 'fetch' ? 'Загружаю' : 'Читаю') + ': ' + title;
        });
    }).then(function (merged) {
        try { localStorage.setItem(ASSISTANT_INDEX_KEY, JSON.stringify(merged)); } catch (e) { console.warn("[silent]", e); }
        if (typeof db !== 'undefined') {
            db.ref('settings/assistant_index').set(JSON.stringify(merged)).catch(function (err) {
                console.warn('Cannot sync assistant_index to Firebase', err);
            });
        }
        if (status) { status.className = 'as-status as-ok'; status.textContent = (currentLang === 'en' ? '✅ Index rebuilt' : '✅ Индекс пересобран') + ': ' + merged.chunks.length + (currentLang === 'en' ? ' fragments' : ' фрагментов') + ' · ' + merged.sources.length + (currentLang === 'en' ? ' sources' : ' источников'); }
    }).catch(function (e) {
        if (status) { status.className = 'as-status as-err'; status.textContent = (currentLang === 'en' ? '⚠ Build failed: ' : '⚠ Ошибка сборки: ') + (e && e.message ? e.message : e); }
    }).finally(function () {
        if (btn) btn.disabled = false;
    });
}
