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

try { firebase.database().goOnline(); } catch (e) {}

var currentUser = null;
var currentUserData = null;

auth.onAuthStateChanged(function(user) {
    currentUser = user;
    if (user) {
        db.ref('users/' + user.uid).once('value').then(function(s) {
            currentUserData = s.val();
            if (typeof applyPageVisibilitySettings === 'function') applyPageVisibilitySettings();
            if (typeof onAuthReady === 'function') onAuthReady(user, currentUserData);
        });
    } else {
        currentUserData = null;
        if (typeof applyPageVisibilitySettings === 'function') applyPageVisibilitySettings();
        if (typeof onAuthReady === 'function') onAuthReady(null, null);
    }
});