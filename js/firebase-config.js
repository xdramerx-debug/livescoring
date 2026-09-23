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
// Единая точка для будущего репортинга (Sentry / аналитика). Сейчас только
// логирует; подключить внешний сервис можно внутри reportError.
function reportError(err, context) {
    try {
        var detail = err && (err.stack || err.message || String(err));
        console.error('[reportError]', context || '', detail);
    } catch (_) { /* никогда не падаем в обработчике ошибок */ }
}
if (typeof window !== 'undefined') {
    window.reportError = reportError;
    window.addEventListener('error', function (e) {
        reportError(e.error || e.message, 'window.error:' + (e.filename || '') + ':' + (e.lineno || ''));
    });
    window.addEventListener('unhandledrejection', function (e) {
        reportError(e.reason, 'unhandledrejection');
    });
}