document.addEventListener('DOMContentLoaded', function() {
    if (!document.getElementById('auth-page')) return;
    if (currentUser) { window.location.href = 'index.html'; return; }

    var tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(function(t) {
        t.addEventListener('click', function() {
            tabs.forEach(function(x) { x.classList.remove('active'); });
            t.classList.add('active');
            document.querySelectorAll('.auth-form').forEach(function(f) { f.classList.add('hidden'); });
            var targetForm = document.getElementById('form-' + t.dataset.tab);
            if (targetForm) targetForm.classList.remove('hidden');
        });
    });

    document.querySelectorAll('.form-input').forEach(function(inp) {
        inp.addEventListener('input', function() { inp.classList.remove('is-invalid'); });
    });

    document.getElementById('login-form').addEventListener('submit', function(e) {
        e.preventDefault();
        var emInp = document.getElementById('login-email');
        var pwInp = document.getElementById('login-pass');
        var em = emInp.value.trim();
        var pw = pwInp.value;
        var er = document.getElementById('login-error');
        er.classList.add('hidden');

        if (!em) { emInp.classList.add('is-invalid'); er.textContent = currentLang === 'en' ? 'Enter email' : 'Укажите email'; er.classList.remove('hidden'); return; }
        if (!pw) { pwInp.classList.add('is-invalid'); er.textContent = currentLang === 'en' ? 'Enter password' : 'Укажите пароль'; er.classList.remove('hidden'); return; }

        var btn = document.getElementById('login-btn');
        btn.textContent = currentLang === 'en' ? 'Loading...' : 'Загрузка...'; btn.disabled = true;
        auth.signInWithEmailAndPassword(em, pw).then(function() {
            window.location.href = 'index.html';
        }).catch(function(err) {
            er.textContent = authErr(err.code);
            er.classList.remove('hidden');
            if (err.code && err.code.indexOf('user') !== -1) emInp.classList.add('is-invalid');
            if (err.code && err.code.indexOf('password') !== -1) pwInp.classList.add('is-invalid');
            btn.textContent = t('login_btn'); btn.disabled = false;
        });
    });

    document.getElementById('register-form').addEventListener('submit', function(e) {
        e.preventDefault();
        var nmInp = document.getElementById('reg-name');
        var emInp = document.getElementById('reg-email');
        var pwInp = document.getElementById('reg-pass');
        var pw2Inp = document.getElementById('reg-pass2');

        var nm = nmInp.value.trim();
        var em = emInp.value.trim();
        var hc = document.getElementById('reg-hcp').value;
        var gd = document.getElementById('reg-gender').value;
        var pw = pwInp.value;
        var pw2 = pw2Inp.value;
        var er = document.getElementById('register-error');
        er.classList.add('hidden');

        if (!nm) { nmInp.classList.add('is-invalid'); er.textContent = currentLang === 'en' ? 'Enter full name' : 'Заполните имя'; er.classList.remove('hidden'); return; }
        if (!em) { emInp.classList.add('is-invalid'); er.textContent = currentLang === 'en' ? 'Enter email' : 'Заполните email'; er.classList.remove('hidden'); return; }
        if (pw.length < 6) { pwInp.classList.add('is-invalid'); er.textContent = currentLang === 'en' ? 'Password minimum 6 characters' : 'Пароль минимум 6 символов'; er.classList.remove('hidden'); return; }
        if (pw !== pw2) { pw2Inp.classList.add('is-invalid'); er.textContent = currentLang === 'en' ? 'Passwords do not match' : 'Пароли не совпадают'; er.classList.remove('hidden'); return; }

        var btn = document.getElementById('register-btn');
        btn.textContent = currentLang === 'en' ? 'Loading...' : 'Загрузка...'; btn.disabled = true;
        auth.createUserWithEmailAndPassword(em, pw).then(function(c) {
            return db.ref('users/' + c.user.uid).set({
                name: nm, email: em, role: 'player', gender: gd,
                handicap: parseExactHcp(hc),
                createdAt: Date.now(), roundsPlayed: 0, bestGross: null, bestStableford: null
            });
        }).then(function() {
            toast(currentLang === 'en' ? '🎉 Account created!' : '🎉 Аккаунт создан!');
            window.location.href = 'index.html';
        }).catch(function(err) {
            er.textContent = authErr(err.code);
            er.classList.remove('hidden');
            btn.textContent = t('create_account'); btn.disabled = false;
        });
    });
});

function authErr(code) {
    if (currentLang === 'en') {
        var mEn = {
            'auth/user-not-found':'User not found','auth/wrong-password':'Incorrect password',
            'auth/email-already-in-use':'Email already in use','auth/weak-password':'Weak password',
            'auth/invalid-email':'Invalid email','auth/too-many-requests':'Too many requests',
            'auth/invalid-credential':'Invalid email or password','auth/invalid-login-credentials':'Invalid email or password'
        };
        return mEn[code] || 'Error: ' + code;
    }
    var mRu = {
        'auth/user-not-found':'Пользователь не найден','auth/wrong-password':'Неверный пароль',
        'auth/email-already-in-use':'Email уже зарегистрирован','auth/weak-password':'Слабый пароль',
        'auth/invalid-email':'Некорректный email','auth/too-many-requests':'Слишком много попыток',
        'auth/invalid-credential':'Неверный email или пароль','auth/invalid-login-credentials':'Неверный email или пароль'
    };
    return mRu[code] || 'Ошибка: ' + code;
}

function onAuthReady(u, d) { navAuth(u, d); }
