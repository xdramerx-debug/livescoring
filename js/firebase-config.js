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
const db = firebase.database();
const auth = firebase.auth();

try { firebase.database().goOnline(); } catch (e) {}

let currentUser = null;
let currentUserData = null;

auth.onAuthStateChanged(function(user) {
    currentUser = user;
    if (user) {
        db.ref('users/' + user.uid).once('value').then(function(s) {
            currentUserData = s.val();
            if (typeof onAuthReady === 'function') onAuthReady(user, currentUserData);
        });
    } else {
        currentUserData = null;
        if (typeof onAuthReady === 'function') onAuthReady(null, null);
    }
});