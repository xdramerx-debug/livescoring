document.addEventListener('DOMContentLoaded', function() { initNav(); });
function onAuthReady(u, d) { navAuth(u, d); }

function updateHcpTable() {
    onGenderChange();
}

function calcField() {
    var hcpInp = document.getElementById('calc-hcp');
    if (!hcpInp) return;
    var hcp = hcpInp.value;
    var genderSelect = document.getElementById('calc-gender');
    var teeSelect = document.getElementById('calc-tee');
    var gender = genderSelect ? genderSelect.value : 'men';
    var tee = teeSelect ? teeSelect.value : 'wh';
    var res = document.getElementById('calc-result');
    if (!res) return;

    if (!hcp && hcp !== '0') { res.classList.add('hidden'); return; }
    var field = getFieldHcp(hcp, tee, gender);
    var valEl = document.getElementById('calc-val');
    if (valEl) valEl.textContent = fmtFieldHcp(field);
    res.classList.remove('hidden');
}

function onGenderChange() {
    var genderSelect = document.getElementById('tbl-gender');
    if (!genderSelect) return;
    var gender = genderSelect.value;
    var teeSel = document.getElementById('tbl-tee');
    var tablesEl = document.getElementById('hcp-tables');
    if (tablesEl) tablesEl.innerHTML = '';
    if (!teeSel) return;

    if (!gender) { 
        teeSel.innerHTML = '<option value="">' + t('select_gender_first') + '</option>'; 
        teeSel.disabled = true; 
        return; 
    }
    teeSel.disabled = false;
    var prevVal = teeSel.value;
    teeSel.innerHTML = '<option value="">' + t('tbl_select_tee') + '</option>';
    
    if (gender === 'men') {
        teeSel.innerHTML += '<option value="bk">⬛ ' + t('tee_bk') + ' (CR 76.0 / SR 144)</option>';
        teeSel.innerHTML += '<option value="bl">🟦 ' + t('tee_bl') + ' (CR 73.8 / SR 137)</option>';
        teeSel.innerHTML += '<option value="wh">⬜ ' + t('tee_wh') + ' (CR 72.0 / SR 135)</option>';
        teeSel.innerHTML += '<option value="rd">🟥 ' + t('tee_rd') + ' (CR 69.2 / SR 134)</option>';
    } else {
        teeSel.innerHTML += '<option value="bl">🟦 ' + t('tee_bl') + ' (CR 80.8 / SR 153)</option>';
        teeSel.innerHTML += '<option value="wh">⬜ ' + t('tee_wh') + ' (CR 78.6 / SR 143)</option>';
        teeSel.innerHTML += '<option value="rd">🟥 ' + t('tee_rd') + ' (CR 75.2 / SR 136)</option>';
    }

    if (prevVal && teeSel.querySelector('option[value="' + prevVal + '"]')) {
        teeSel.value = prevVal;
        showTable();
    }
}

function showTable() {
    var genderSelect = document.getElementById('tbl-gender');
    var teeSelect = document.getElementById('tbl-tee');
    var el = document.getElementById('hcp-tables');
    if (!genderSelect || !teeSelect || !el) return;
    var gender = genderSelect.value;
    var tee = teeSelect.value;
    if (!gender || !tee) { el.innerHTML = ''; return; }

    var table = generateHcpTable(gender, tee);
    var cr = COURSE_RATINGS[gender] && COURSE_RATINGS[gender][tee];
    if (!table || !cr || !table.length) { el.innerHTML = '<div class="card"><p style="text-align:center;color:var(--muted);">' + (currentLang === 'en' ? 'No data' : 'Нет данных') + '</p></div>'; return; }
    var genderIcon = gender === 'women' ? '👩' : '👨';
    var genderName = gender === 'women' ? (currentLang === 'en' ? 'Women' : 'Женщины') : (currentLang === 'en' ? 'Men' : 'Мужчины');
    var teeName = t('tee_' + tee);
    var fromHeader = t('from_col');
    var toHeader = t('to_col');
    var fieldHeader = t('field_hcp');

    var html = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">';
    html += '<div><div style="font-family:var(--ff);color:var(--gold);font-size:20px;font-weight:700;">' + genderIcon + ' ' + genderName + ' · ' + teeName + '</div>';
    html += '<div style="color:var(--muted);font-size:13px;">' + (currentLang === 'en' ? 'Par 72 · Rows: ' : 'Пар 72 · Значений: ') + table.length + '</div></div>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;"><span style="background:rgba(201,168,76,.15);color:var(--gold);padding:5px 12px;border-radius:20px;font-size:11px;font-weight:700;">CR: ' + cr.cr + '</span>';
    html += '<span style="background:rgba(201,168,76,.15);color:var(--gold);padding:5px 12px;border-radius:20px;font-size:11px;font-weight:700;">SR: ' + cr.sr + '</span></div></div>';
    html += '<div style="overflow-x:auto;"><table class="hcp-tbl"><tr><th>' + fromHeader + '</th><th>' + toHeader + '</th><th>' + fieldHeader + '</th></tr>';
    table.forEach(function(row) { html += '<tr><td>' + row[0] + '</td><td>' + row[1] + '</td><td class="tbl-field">' + row[2] + '</td></tr>'; });
    html += '</table></div></div>';
    el.innerHTML = html;
}
