document.addEventListener('DOMContentLoaded', function() {
    if (!document.getElementById('auth-page')) return;
    if (currentUser) { window.location.href = 'index.html'; return; }

    var tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(function(t) {
        t.addEventListener('click', function() {
            tabs.forEach(function(x) { x.classList.remove('active'); });
            t.classList.add('active');
            document.querySelectorAll('.auth-form').forEach(function(f) { f.classList.add('hidden'); });
            document.getElementById('form-' + t.dataset.tab).classList.remove('hidden');
        });
    });

    document.getElementById('login-form').addEventListener('submit', function(e) {
        e.preventDefault();
        var em = document.getElementById('login-email').value.trim();
        var pw = document.getElementById('login-pass').value;
        var er = document.getElementById('login-error');
        er.classList.add('hidden');
        var btn = document.getElementById('login-btn');
        btn.textContent = 'Загрузка...'; btn.disabled = true;
        auth.signInWithEmailAndPassword(em, pw).then(function() {
            window.location.href = 'index.html';
        }).catch(function(err) {
            er.textContent = authErr(err.code);
            er.classList.remove('hidden');
            btn.textContent = 'Войти'; btn.disabled = false;
        });
    });

    document.getElementById('register-form').addEventListener('submit', function(e) {
        e.preventDefault();
        var nm = document.getElementById('reg-name').value.trim();
        var em = document.getElementById('reg-email').value.trim();
        var hc = document.getElementById('reg-hcp').value;
        var gd = document.getElementById('reg-gender').value;
        var pw = document.getElementById('reg-pass').value;
        var pw2 = document.getElementById('reg-pass2').value;
        var er = document.getElementById('register-error');
        er.classList.add('hidden');
        if (!nm || !em || !pw) { er.textContent = 'Заполните все поля'; er.classList.remove('hidden'); return; }
        if (pw.length < 6) { er.textContent = 'Пароль минимум 6 символов'; er.classList.remove('hidden'); return; }
        if (pw !== pw2) { er.textContent = 'Пароли не совпадают'; er.classList.remove('hidden'); return; }
        var btn = document.getElementById('register-btn');
        btn.textContent = 'Загрузка...'; btn.disabled = true;
        auth.createUserWithEmailAndPassword(em, pw).then(function(c) {
            return db.ref('users/' + c.user.uid).set({
                name: nm, email: em, role: 'player', gender: gd,
                handicap: hc ? parseFloat(hc) : null,
                createdAt: Date.now(), roundsPlayed: 0, bestGross: null, bestStableford: null
            });
        }).then(function() {
            toast('🎉 Аккаунт создан!');
            window.location.href = 'index.html';
        }).catch(function(err) {
            er.textContent = authErr(err.code);
            er.classList.remove('hidden');
            btn.textContent = 'Создать аккаунт'; btn.disabled = false;
        });
    });
});

function authErr(code) {
    var m = {
        'auth/user-not-found':'Пользователь не найден','auth/wrong-password':'Неверный пароль',
        'auth/email-already-in-use':'Email уже зарегистрирован','auth/weak-password':'Слабый пароль',
        'auth/invalid-email':'Некорректный email','auth/too-many-requests':'Слишком много попыток',
        'auth/invalid-credential':'Неверный email или пароль','auth/invalid-login-credentials':'Неверный email или пароль'
    };
    return m[code] || 'Ошибка: ' + code;
}

function onAuthReady(u, d) { navAuth(u, d); }