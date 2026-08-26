var activeGuideHole = 1;

const PESTOVO_COACH_TIPS = {
    1: { ru: "Широкий стартовый фарватер. Избегайте бункера справа на 210м. Выход на грин требует внимания из-за наклона влево.", en: "Wide opening fairway. Avoid bunker right at 210m. Green slopes gently to the left." },
    2: { ru: "Короткая пар-4. Отличная возможность для Birdie. Атакуйте драйвером или надёжным 3-Wood.", en: "Short Par 4. Great Birdie opportunity. Attack with Driver or solid 3-Wood." },
    3: { ru: "Длинная пар-5 с водой слева на втором ударе. Играйте в три удара для комфортного выхода на грин.", en: "Long Par 5 with water left on layup. Play three solid shots for easy green approach." },
    4: { ru: "Красивая пар-3 над водой. При сильном встречном ветре берите на 1 клюшку длиннее.", en: "Scenic Par 3 over water. With headwind, club up one extra iron." },
    5: { ru: "Сложная пар-4 Front 9! Водная преграда слева на 220м. Играйте строго по центру фарватера.", en: "Tougest Par 4 on Front 9! Water hazard left at 220m. Aim strictly down center fairway." },
    6: { ru: "Прямая пар-4. Держитесь правой стороны фарватера для лучшего угла подхода на грин.", en: "Straight Par 4. Favor right side of fairway for best approach angle." },
    7: { ru: "Длинная пар-4 с бункерами на приземлении. Удар на грин требует высокой точности.", en: "Long Par 4 with landing bunkers. Approach to green demands precision." },
    8: { ru: "Пар-3 с глубоким бункером перед грином. Мимо грина лучше уйти чуть вправо.", en: "Par 3 with deep bunker fronting green. Miss right if anything." },
    9: { ru: "Финальная пар-5 первой девятки к Clubhouse. Легкий доглег вправо, хорошая возможность для Par.", en: "Front 9 closing Par 5 towards Clubhouse. Gentle dogleg right, great Par chance." },
    10: { ru: "Стартовая пар-5 Back 9. Широкое приземление, аккуратный второй удар перед водным каналом.", en: "Back 9 opening Par 5. Generous fairway, careful second shot short of water." },
    11: { ru: "Аккуратная пар-4. Остерегайтесь деревьев слева. Подход на грин слегка подъёмный.", en: "Precision Par 4. Guard against trees left. Approach is slightly uphill." },
    12: { ru: "Сложнейшая пар-4 Back 9 с водой вдоль всего грина справа. Играйте с запасом влево.", en: "Hardest Par 4 on Back 9! Water guards right side of green. Favor left safety margin." },
    13: { ru: "Самая короткая пар-3 на поле. Отличный шанс на Birdie или Hole-in-One!", en: "Shortest Par 3 on course. Prime Birdie or Hole-in-One opportunity!" },
    14: { ru: "Узкий фарватер с бункерами. Рекомендуется точный удар гибридом или 3-Wood.", en: "Tight fairway with fairway bunkers. Smart play is Hybrid or 3-Wood tee shot." },
    15: { ru: "Длинная пар-5. Играйте аккуратно в три удара, избегая бункеров вокруг грина.", en: "Long Par 5. Three smart shots, avoiding green-side bunkers." },
    16: { ru: "Прямая пар-4 с широким грином. Держитесь левее на приземлении.", en: "Straight Par 4 with wide green. Favor left side off the tee." },
    17: { ru: "Фирменная пар-3 с островным грином. Высокое напряжение, тщательно проверяйте ветер!", en: "Signature Par 3 island green! High excitement, check wind vector carefully." },
    18: { ru: "Финальная пар-4 перед террасой Клубного дома Пестово. Вода справа, играйте строго по центру!", en: "Home Par 4 in front of Clubhouse terrace. Water right, play firmly down center." }
};

document.addEventListener('DOMContentLoaded', function() {
    initNav();
    buildGuideNav();
    renderHoleGuide(1);
});

function onAuthReady(u, d) { navAuth(u, d); }

function buildGuideNav() {
    var el = document.getElementById('guide-hole-nav');
    if (!el) return;
    var html = '';
    for (var i = 1; i <= 18; i++) {
        var cls = i === activeGuideHole ? 'active' : '';
        html += '<button class="hole-btn ' + cls + '" onclick="renderHoleGuide(' + i + ')">' + i + '</button>';
    }
    el.innerHTML = html;
}

function renderHoleGuide(h) {
    activeGuideHole = h;
    buildGuideNav();

    var cardEl = document.getElementById('hole-guide-card');
    if (!cardEl) return;

    var hData = HOLES[h] || HOLES[1];
    var par = hData.p;
    var hcp = hData.hcp;
    var timing = holeTiming(h);
    var tip = PESTOVO_COACH_TIPS[h] ? (currentLang === 'en' ? PESTOVO_COACH_TIPS[h].en : PESTOVO_COACH_TIPS[h].ru) : '';

    var html = '<div class="card" style="border:2px solid var(--gold);background:linear-gradient(135deg, rgba(201,168,76,0.12), var(--card));">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">';
    html += '<div><h2 style="font-size:28px;font-family:var(--ff);color:var(--white);margin:0;"><i class="fas fa-flag" style="color:var(--gold);"></i> ' + t('hole') + ' #' + h + '</h2>';
    html += '<div style="font-size:14px;color:var(--gold);font-weight:700;margin-top:2px;">' + t('par') + ' ' + par + ' · ' + t('index') + ' ' + hcp + ' · Timing: ' + timing + ' min</div></div>';
    html += '<div><button class="btn btn-g" onclick="openGPSRangefinderModal(' + h + ')"><i class="fas fa-location-crosshairs"></i> GPS Rangefinder</button></div>';
    html += '</div>';

    // Tees Distances Grid
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:20px;">';
    html += '<div class="stat"><div class="tee-pill tee-bk" style="margin-bottom:4px;">' + t('tee_bk') + '</div><div class="stat-n">' + hData.bk + 'm</div></div>';
    html += '<div class="stat"><div class="tee-pill tee-bl" style="margin-bottom:4px;">' + t('tee_bl') + '</div><div class="stat-n">' + hData.bl + 'm</div></div>';
    html += '<div class="stat"><div class="tee-pill tee-wh" style="margin-bottom:4px;">' + t('tee_wh') + '</div><div class="stat-n">' + hData.wh + 'm</div></div>';
    html += '<div class="stat"><div class="tee-pill tee-rd" style="margin-bottom:4px;">' + t('tee_rd') + '</div><div class="stat-n">' + hData.rd + 'm</div></div>';
    html += '</div>';

    // Pro Coach Tip Box
    html += '<div class="card" style="background:var(--input);border-left:4px solid var(--gold);padding:18px;">';
    html += '<h3 style="color:var(--gold);font-size:16px;margin-bottom:8px;"><i class="fas fa-user-graduate"></i> ' + (currentLang === 'en' ? 'Pro Coach Tactical Tip:' : 'Тактический совет тренера Пестово:') + '</h3>';
    html += '<p style="font-size:14px;color:var(--white);line-height:1.6;">' + tip + '</p>';
    html += '</div>';

    html += '</div>';

    cardEl.innerHTML = html;
}
