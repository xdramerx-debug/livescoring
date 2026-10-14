const firebaseConfig = {
    apiKey: "AIzaSyDPlUXzNvvhb-Lxd_1lw0sX1hNXnzvlGPM",
    authDomain: "livescore-b77e4.firebaseapp.com",
    databaseURL: "https://livescore-b77e4-default-rtdb.firebaseio.com",
    projectId: "livescore-b77e4",
    storageBucket: "livescore-b77e4.firebasestorage.app",
    messagingSenderId: "718863252815",
    appId: "1:718863252815:web:f1a96270ffe3f170ebd93a"
};

firebase.initializeApp(firebaseConfig);

// ВАЖНО: именно var, а не const/let.
// Объявления const/let на верхнем уровне скрипта НЕ создают свойство window,
// поэтому модули в IIFE (js/design-admin.js и т.п.), которые обращаются к
// window.db / window.currentUser, видели undefined и считали, что базы нет —
// из-за этого настройки (например, шаблон оформления) сохранялись только
// локально и не доходили до остальных пользователей.
// var создаёт свойство window и, в отличие от ручного window.x = x,
// сохраняет связь при последующих переприсваиваниях (currentUser).
var db = firebase.database();
var auth = firebase.auth();

try { firebase.database().goOnline(); } catch (e) { console.warn("[silent]", e); }

var currentUser = null;
var currentUserData = null;
// QR-карточка без личного аккаунта получает анонимную Firebase-сессию.
// Это не удостоверяет личность: сервер помечает действия как QR-доступ.
var pestovoQrAuthPending = false;
try {
    var qrPath = location.pathname.split('/').pop();
    var qrQuery = new URLSearchParams(location.search);
    pestovoQrAuthPending = ['scorer.html','marker.html','setup-round.html'].indexOf(qrPath) !== -1 &&
        !!(qrQuery.get('round') && (qrQuery.get('player') || qrQuery.get('as')));
} catch (e) { pestovoQrAuthPending = false; }


auth.onAuthStateChanged(function(user) {
    currentUser = user;
    if (!user && pestovoQrAuthPending) {
        auth.signInAnonymously().catch(function(err) {
            pestovoQrAuthPending = false;
            console.error('[QR] Anonymous Firebase Auth is required', err);
            if (typeof toast === 'function') toast('QR-ввод недоступен: включите Anonymous Auth в Firebase.', 'error');
        });
        return;
    }
    pestovoQrAuthPending = false;
    if (user) {
        db.ref('users/' + user.uid).once('value').then(function(s) {
            currentUserData = s.val();
            if (typeof applyPageVisibilitySettings === 'function') applyPageVisibilitySettings();
            if (typeof onAuthReady === 'function') onAuthReady(user, currentUserData);
        }).catch(function(err) {
            currentUserData = null;
            console.warn('[auth] user profile unavailable', err);
            if (typeof onAuthReady === 'function') onAuthReady(user, null);
        });
    } else {
        currentUserData = null;
        if (typeof applyPageVisibilitySettings === 'function') applyPageVisibilitySettings();
        if (typeof onAuthReady === 'function') onAuthReady(null, null);
    }
});

// ── Глобальный перехват ошибок ──
// Единая точка репортинга. До аудита 2026-10 здесь был только console.error,
// то есть полевые сбои (плохой мобильный интернет на курсе, гонки подписок,
// отказ правил БД) не были видны никому: разработчик узнавал о проблеме со слов
// игрока. Теперь сообщение дублируется в узел RTDB `errorReports`, который
// читается в админке (вкладка «Журнал действий со счётом» → блок «Ошибки
// клиентов»). Правила доступа — в database.rules.json; узел доступен на запись
// любому аутентифицированному, на чтение — только админу.
//
// Ограничения обязательны: без них одна циклическая ошибка засыпала бы базу
// (RTDB тарифицирует записи и скачанный объём).
var pestovoErrRep = { sent: 0, seen: {}, last: 0, inFlight: false };
var PESTOVO_ERR_MAX_PER_SESSION = 20;   // не больше N сообщений за жизнь страницы
var PESTOVO_ERR_MIN_INTERVAL_MS = 2000; // не чаще раза в N мс
var PESTOVO_ERR_MAX_PER_KEY = 3;        // одна и та же ошибка — не больше N раз

function pestovoErrClip(v, max) {
    var s = v == null ? '' : String(v);
    return s.length > max ? s.slice(0, max) + '…' : s;
}

function reportError(err, context) {
    var detail = '';
    try {
        detail = err && (err.stack || err.message || String(err));
    } catch (_) { detail = ''; }
    try {
        console.error('[reportError]', context || '', detail);
    } catch (_) { /* никогда не падаем в обработчике ошибок */ }

    try {
        // Рекурсия запрещена: отказ записи не должен порождать новый репорт.
        if (pestovoErrRep.inFlight) return;
        if (typeof db === 'undefined' || !db || typeof db.ref !== 'function') return;
        if (pestovoErrRep.sent >= PESTOVO_ERR_MAX_PER_SESSION) return;

        var now = Date.now();
        if (now - pestovoErrRep.last < PESTOVO_ERR_MIN_INTERVAL_MS) return;

        var msg = pestovoErrClip((err && (err.message || err.code)) || detail || 'unknown', 500);
        var key = (context || '') + '|' + msg;
        var times = pestovoErrRep.seen[key] || 0;
        if (times >= PESTOVO_ERR_MAX_PER_KEY) return;
        pestovoErrRep.seen[key] = times + 1;

        var page = '';
        try { page = pestovoErrClip(location.pathname.split('/').pop() + location.search, 120); } catch (_) { page = ''; }
        var ver = '';
        try {
            var vEl = document.querySelector('.version-number');
            ver = pestovoErrClip(vEl && vEl.textContent, 20);
        } catch (_) { ver = ''; }
        var uid = '';
        try { uid = (currentUser && currentUser.uid) ? pestovoErrClip(currentUser.uid, 64) : ''; } catch (_) { uid = ''; }
        var lang = '';
        try { lang = (typeof currentLang !== 'undefined' && currentLang) ? pestovoErrClip(currentLang, 2) : ''; } catch (_) { lang = ''; }

        pestovoErrRep.last = now;
        pestovoErrRep.inFlight = true;
        db.ref('errorReports').push({
            ts: now,
            page: page,
            ctx: pestovoErrClip(context || '', 200),
            msg: msg,
            stack: pestovoErrClip((err && err.stack) || '', 2000),
            ver: ver,
            lang: lang,
            uid: uid,
            n: times + 1
        }).then(function () {
            pestovoErrRep.sent++;
            pestovoErrRep.inFlight = false;
        }).catch(function (e) {
            // Узел может быть закрыт правилами (например, правила ещё не
            // задеплоены) или сеть недоступна — репортинг не должен ломать UI.
            pestovoErrRep.inFlight = false;
            try { console.warn('[reportError] upload skipped', e && e.code || e); } catch (_) {}
        });
    } catch (_) { /* репортинг никогда не роняет приложение */ }
}

if (typeof window !== 'undefined') {
    window.reportError = reportError;
    // Контекст — стабильный идентификатор источника. Текст ошибки в него не
    // входит: он и так попадает в msg, а ключ группировки в админке — ctx|msg,
    // поэтому дубль сообщения размывал бы группы. Позиция в файле полезнее.
    window.addEventListener('error', function (e) {
        var where = (e.filename || '') + ':' + (e.lineno || 0) + ':' + (e.colno || 0);
        reportError(e.error || e.message, 'window.onerror ' + where);
    });
    window.addEventListener('unhandledrejection', function (e) {
        reportError(e.reason, 'unhandledrejection');
    });
}