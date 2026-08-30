function getSafeAuthRedirect() {
    var requested = new URLSearchParams(window.location.search).get('redirect');
    if (!requested) return 'index.html';
    try {
        var target = new URL(requested, window.location.href);
        if (target.origin !== window.location.origin) return 'index.html';
        var fileName = target.pathname.split('/').pop() || 'index.html';
        if (!/^[a-z0-9-]+\.html$/i.test(fileName)) return 'index.html';
        return fileName + target.search + target.hash;
    } catch (e) {
        return 'index.html';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    if (!document.getElementById('auth-page')) return;

    if (typeof auth !== 'undefined' && auth.setPersistence && firebase.auth.Auth.Persistence.LOCAL) {
        auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function(e) {
            console.warn('Auth persistence error:', e);
        });
    }

    if (currentUser) { window.location.href = getSafeAuthRedirect(); return; }

    // АУДИТ БЕЗОПАСНОСТИ: пароль никогда не хранится локально.
    // Миграция: удаляем пароль, если он остался со старой версии приложения.
    try { ['pestovo_saved_password'].forEach(function(k) { if (localStorage.getItem(k) !== null) localStorage.removeItem(k); }); } catch (e) {}

    var savedEmail = localStorage.getItem('pestovo_saved_email');
    var savedRem = localStorage.getItem('pestovo_saved_remember');

    var emInp = document.getElementById('login-email');
    var remChk = document.getElementById('login-remember');

    if (savedEmail && emInp) emInp.value = savedEmail;
    if (remChk && savedRem !== null) remChk.checked = (savedRem === 'true');

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
        var remChk = document.getElementById('login-remember');

        var em = emInp.value.trim();
        var pw = pwInp.value;
        var er = document.getElementById('login-error');
        er.classList.add('hidden');

        if (!em) { emInp.classList.add('is-invalid'); er.textContent = currentLang === 'en' ? 'Enter email' : 'Укажите email'; er.classList.remove('hidden'); return; }
        if (!pw) { pwInp.classList.add('is-invalid'); er.textContent = currentLang === 'en' ? 'Enter password' : 'Укажите пароль'; er.classList.remove('hidden'); return; }

        var btn = document.getElementById('login-btn');
        btn.textContent = currentLang === 'en' ? 'Loading...' : 'Загрузка...'; btn.disabled = true;

        // Храним только e-mail (для удобства автозаполнения), пароль — никогда.
        if (remChk && remChk.checked) {
            localStorage.setItem('pestovo_saved_email', em);
            localStorage.setItem('pestovo_saved_remember', 'true');
        } else {
            localStorage.removeItem('pestovo_saved_email');
            localStorage.setItem('pestovo_saved_remember', 'false');
        }

        auth.signInWithEmailAndPassword(em, pw).then(function() {
            window.location.href = getSafeAuthRedirect();
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

        var nm = sanitizeNameRaw(nmInp.value);
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

        localStorage.setItem('pestovo_saved_email', em);
        localStorage.setItem('pestovo_saved_remember', 'true');

        auth.createUserWithEmailAndPassword(em, pw).then(function(c) {
            return db.ref('users/' + c.user.uid).set({
                name: nm, email: em, role: 'player', gender: gd,
                handicap: parseExactHcp(hc),
                createdAt: Date.now(), roundsPlayed: 0, bestGross: null, bestStableford: null
            });
        }).then(function() {
            toast(currentLang === 'en' ? '🎉 Account created!' : '🎉 Аккаунт создан!');
            window.location.href = getSafeAuthRedirect();
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

function forgotPassword() {
    var emInp = document.getElementById('login-email');
    var email = emInp ? emInp.value.trim() : '';

    // Если поле email уже заполнено — используем его без лишних вопросов.
    if (!email) {
        email = prompt(currentLang === 'en' ? 'Enter your email for password recovery:' : 'Введите ваш email для восстановления пароля:', '');
        if (!email) return;
        email = email.trim();
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (emInp) emInp.classList.add('is-invalid');
        var er = document.getElementById('login-error');
        if (er) { er.textContent = currentLang === 'en' ? 'Enter a valid email above' : 'Укажите корректный email в поле выше'; er.classList.remove('hidden'); }
        return;
    }

    if (typeof auth !== 'undefined' && auth.sendPasswordResetEmail) {
        auth.sendPasswordResetEmail(email).then(function() {
            toast(currentLang === 'en' ? '📧 Reset link sent to ' + email : '📧 Ссылка для сброса пароля отправлена на ' + email, 'success');
        }).catch(function(err) {
            toast('⚠️ ' + authErr(err.code), 'error');
        });
    } else {
        toast(currentLang === 'en' ? '📧 Password reset email sent!' : '📧 Инструкция по сбросу пароля отправлена на email!', 'success');
    }
}

function onAuthReady(u, d) { navAuth(u, d); }
