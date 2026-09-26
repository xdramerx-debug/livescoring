const J = "Гольф-клуб Пестово", Ce = 72, $ = "МО, г. Мытищи, Никольская ул., 1, Румянцево", v = {
  1: { p: 4, hcp: 5, bk: 373, bl: 339, wh: 328, rd: 317 },
  2: { p: 4, hcp: 13, bk: 272, bl: 257, wh: 257, rd: 250 },
  3: { p: 5, hcp: 9, bk: 486, bl: 475, wh: 464, rd: 423 },
  4: { p: 3, hcp: 11, bk: 192, bl: 174, wh: 161, rd: 144 },
  5: { p: 4, hcp: 1, bk: 411, bl: 382, wh: 370, rd: 331 },
  6: { p: 4, hcp: 15, bk: 377, bl: 345, wh: 333, rd: 316 },
  7: { p: 4, hcp: 3, bk: 406, bl: 380, wh: 336, rd: 308 },
  8: { p: 3, hcp: 7, bk: 181, bl: 165, wh: 159, rd: 132 },
  9: { p: 5, hcp: 17, bk: 507, bl: 459, wh: 421, rd: 399 },
  10: { p: 5, hcp: 12, bk: 491, bl: 470, wh: 461, rd: 442 },
  11: { p: 4, hcp: 16, bk: 382, bl: 362, wh: 345, rd: 318 },
  12: { p: 4, hcp: 2, bk: 383, bl: 375, wh: 365, rd: 322 },
  13: { p: 3, hcp: 18, bk: 185, bl: 162, wh: 138, rd: 123 },
  14: { p: 4, hcp: 4, bk: 374, bl: 362, wh: 327, rd: 323 },
  15: { p: 5, hcp: 8, bk: 533, bl: 517, wh: 483, rd: 454 },
  16: { p: 4, hcp: 14, bk: 423, bl: 391, wh: 368, rd: 312 },
  17: { p: 3, hcp: 10, bk: 199, bl: 188, wh: 174, rd: 151 },
  18: { p: 4, hcp: 6, bk: 375, bl: 349, wh: 335, rd: 302 }
}, O = { 1: 15, 2: 15, 3: 20, 4: 12, 5: 15, 6: 15, 7: 15, 8: 12, 9: 20, 10: 20, 11: 15, 12: 15, 13: 12, 14: 15, 15: 20, 16: 15, 17: 12, 18: 15 }, z = { bk: "Чёрный", bl: "Синий", wh: "Белый", rd: "Красный" }, Q = ["bk", "bl", "wh", "rd"], X = {
  men: { bk: { cr: 76, sr: 144 }, bl: { cr: 73.8, sr: 137 }, wh: { cr: 72, sr: 135 }, rd: { cr: 69.2, sr: 134 } },
  women: { bl: { cr: 80.8, sr: 153 }, wh: { cr: 78.6, sr: 143 }, rd: { cr: 75.2, sr: 136 } }
};
function Z(e) {
  return v[e] ? v[e].p : 4;
}
function ee(e, a) {
  return a = a || "wh", v[e] && v[e][a] || 0;
}
function te(e) {
  return v[e] ? v[e].hcp : e;
}
function ae(e) {
  return O[e] || 15;
}
typeof window < "u" && Object.assign(window, { CLUB: J, TOTAL_PAR: 72, ADDR: $, HOLES: v, TIMINGS: O, TEES: z, TEE_ORDER: Q, COURSE_RATINGS: X, holePar: Z, holeDist: ee, holeHcp: te, holeTiming: ae });
function re(e) {
  return e == null || isNaN(e) ? "—" : e === 0 ? "E" : e > 0 ? "+" + e : "" + e;
}
function ne(e) {
  return e == null ? "" : e < 0 ? "s-un" : e > 0 ? "s-ov" : "s-ev";
}
function oe(e, a) {
  if (!e || e < 1 || !a) return "";
  var r = e - a;
  return r <= -2 ? "r-eag" : r === -1 ? "r-bir" : r === 0 ? "r-par" : r === 1 ? "r-bog" : "r-dbl";
}
function se(e, a) {
  if (!e || !a) return "";
  if (e === 1) return t("res_hio");
  var r = e - a;
  return r <= -3 ? t("res_albatross") : r === -2 ? t("res_eagle") : r === -1 ? t("res_birdie") : r === 0 ? t("res_par") : r === 1 ? t("res_bogey") : r === 2 ? t("res_double") : "+" + r;
}
typeof window < "u" && Object.assign(window, {
  fmtScore: re,
  scoreClass: ne,
  holeResClass: oe,
  holeResName: se,
  fmtDate: le,
  fmtTime: ie,
  tnDateTs: _e,
  normalizeTimestampMs: T,
  isTodayTimestamp: de
});
function le(e) {
  if (!e) return "—";
  var a = typeof currentLang < "u" && currentLang ? currentLang : "ru";
  try {
    return new Date(e).toLocaleDateString(a === "en" ? "en-US" : "ru-RU", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    var r = new Date(e);
    return (r.getDate() < 10 ? "0" : "") + r.getDate() + "." + (r.getMonth() + 1 < 10 ? "0" : "") + (r.getMonth() + 1) + "." + r.getFullYear();
  }
}
function ie(e) {
  if (e == null || e === "") return "—";
  var a = /^(\d{1,2}):(\d{2})(:\d{2})?$/.exec(String(e).trim());
  if (a) {
    var r = parseInt(a[1], 10), n = parseInt(a[2], 10);
    if (r >= 0 && r < 24 && n >= 0 && n < 60) return (r < 10 ? "0" : "") + r + ":" + (n < 10 ? "0" : "") + n;
  }
  var o = typeof T == "function" ? T(e) : Number(e);
  if (!o || !isFinite(o)) return "—";
  try {
    var s = new Date(o), i = s.getHours(), _ = s.getMinutes();
    return isNaN(i) || isNaN(_) ? "—" : (i < 10 ? "0" : "") + i + ":" + (_ < 10 ? "0" : "") + _;
  } catch {
    return "—";
  }
}
function _e(e) {
  if (typeof e == "number" && isFinite(e)) return e;
  var a = String(e ?? "").trim();
  if (!a) return NaN;
  var r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a);
  if (r) {
    var n = new Date(Number(r[1]), Number(r[2]) - 1, Number(r[3]), 12, 0, 0, 0).getTime();
    return isNaN(n) ? NaN : n;
  }
  var o = Date.parse(a);
  return isNaN(o) ? NaN : o;
}
function T(e) {
  if (e instanceof Date) return e.getTime() || 0;
  var a = Number(e);
  return (!isFinite(a) || a <= 0) && (a = typeof e == "string" ? Date.parse(e) : 0), a > 0 && a < 1e11 && (a *= 1e3), isFinite(a) && a > 0 ? a : 0;
}
function de(e, a) {
  var r = T(e);
  if (!r) return !1;
  var n = new Date(T(a || Date.now())), o = new Date(r);
  return !isNaN(o.getTime()) && !isNaN(n.getTime()) && o.getFullYear() === n.getFullYear() && o.getMonth() === n.getMonth() && o.getDate() === n.getDate();
}
var C = ["today", "7d", "30d", "month", "year", "all"];
function G(e) {
  var a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(e ?? "").trim());
  if (!a) return null;
  var r = new Date(Number(a[1]), Number(a[2]) - 1, Number(a[3]), 0, 0, 0, 0).getTime();
  return isNaN(r) ? null : r;
}
function B(e) {
  var a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(e ?? "").trim());
  if (!a) return null;
  var r = new Date(Number(a[1]), Number(a[2]) - 1, Number(a[3]), 23, 59, 59, 999).getTime();
  return isNaN(r) ? null : r;
}
function x(e) {
  if (!e) return "";
  var a = new Date(e), r = a.getMonth() + 1, n = a.getDate();
  return a.getFullYear() + "-" + (r < 10 ? "0" : "") + r + "-" + (n < 10 ? "0" : "") + n;
}
function V(e) {
  return !e || typeof e != "object" ? 0 : Number(e.startTime) || Number(e.createdAt) || 0;
}
function E(e) {
  var a = /* @__PURE__ */ new Date(), r = new Date(a.getFullYear(), a.getMonth(), a.getDate()), n = null;
  return e === "today" ? n = r : e === "7d" ? n = new Date(r.getFullYear(), r.getMonth(), r.getDate() - 6) : e === "30d" ? n = new Date(r.getFullYear(), r.getMonth(), r.getDate() - 29) : e === "month" ? n = new Date(r.getFullYear(), r.getMonth(), 1) : e === "year" && (n = new Date(r.getFullYear(), 0, 1)), n ? { from: x(n.getTime()), to: x(r.getTime()) } : { from: "", to: "" };
}
function R(e, a) {
  var r = e && e.value || "", n = a && a.value || "", o = r ? G(r) : null, s = n ? B(n) : null, i = o !== null && s !== null && o > s;
  return {
    from: o,
    to: s,
    fromValue: r,
    toValue: n,
    invalid: i,
    active: !i && (o !== null || s !== null)
  };
}
function ce(e, a) {
  return !a || !a.active ? e.slice() : e.filter(function(r) {
    var n = V(r && r[1]);
    return !(!n || a.from !== null && n < a.from || a.to !== null && n > a.to);
  });
}
function j(e, a, r, n) {
  if (e) {
    var o = typeof currentLang < "u" && currentLang === "en", s = '<i class="fas fa-calendar-check"></i> ';
    if (a && a.active) {
      var i = a.from !== null ? fmtDate(a.from) : o ? "the beginning" : "с начала", _ = a.to !== null ? fmtDate(a.to) : o ? "today" : "сегодня";
      s += '<span class="rs-period">' + escapeHtml(i + " — " + _) + '</span><span class="rs-sep">·</span>' + t("rounds_found_label") + ": <b>" + r + "</b>", typeof n == "number" && n !== r && (s += ' <span class="rs-dim">' + (o ? "of" : "из") + " " + n + "</span>");
    } else
      s += t("rounds_total_label") + ": <b>" + r + "</b>";
    e.innerHTML = s;
  }
}
var P = /* @__PURE__ */ Object.create(null);
function ue(e) {
  if (!e) return null;
  var a = document.getElementById(e.fromId), r = document.getElementById(e.toId);
  if (!a || !r) return null;
  var n = e.presetsId ? document.getElementById(e.presetsId) : null, o = e.resetId ? document.getElementById(e.resetId) : null, s = e.hintId ? document.getElementById(e.hintId) : null, i = "pestovo_date_filter_" + e.key;
  function _() {
    try {
      localStorage.setItem(i, JSON.stringify({ from: a.value || "", to: r.value || "" }));
    } catch (p) {
      console.warn("[silent]", p);
    }
  }
  function u() {
    var p = R(a, r);
    if (!p.fromValue && !p.toValue) return "all";
    for (var g = 0; g < C.length; g++) {
      var w = C[g];
      if (w !== "all") {
        var S = E(w);
        if (S.from === p.fromValue && S.to === p.toValue) return w;
      }
    }
    return "";
  }
  function d() {
    if (n) {
      var p = u();
      n.innerHTML = C.map(function(g) {
        return '<button type="button" class="date-chip' + (p === g ? " active" : "") + '" data-preset="' + g + '">' + t("date_preset_" + g) + "</button>";
      }).join("");
    }
  }
  function l() {
    r.value ? a.setAttribute("max", r.value) : a.removeAttribute("max"), a.value ? r.setAttribute("min", a.value) : r.removeAttribute("min");
  }
  function c() {
    var p = R(a, r).invalid;
    a.classList.toggle("is-invalid", p), r.classList.toggle("is-invalid", p), s && (s.textContent = p ? t("date_filter_invalid") : "", s.classList.toggle("hidden", !p));
  }
  function h() {
    c(), typeof e.onChange == "function" && e.onChange(b.getRange());
  }
  var b = {
    key: e.key,
    getRange: function() {
      return R(a, r);
    },
    renderPresets: d,
    lastSummary: null,
    renderSummary: function(p, g) {
      b.lastSummary = { count: p, total: g }, j(e.summaryId ? document.getElementById(e.summaryId) : null, b.getRange(), p, g);
    },
    rerenderSummary: function() {
      b.lastSummary && b.renderSummary(b.lastSummary.count, b.lastSummary.total);
    }
  };
  try {
    var y = JSON.parse(localStorage.getItem(i) || "null");
    y && typeof y == "object" && (y.from && (a.value = y.from), y.to && (r.value = y.to));
  } catch (p) {
    console.warn("[silent]", p);
  }
  return a.addEventListener("change", function() {
    l(), _(), d(), h();
  }), r.addEventListener("change", function() {
    l(), _(), d(), h();
  }), n && n.addEventListener("click", function(p) {
    var g = p.target && p.target.closest ? p.target.closest(".date-chip") : null, w = g && g.getAttribute("data-preset");
    if (w) {
      var S = E(w);
      a.value = S.from, r.value = S.to, l(), _(), d(), h();
    }
  }), o && o.addEventListener("click", function() {
    a.value = "", r.value = "", l(), _(), d(), h();
  }), l(), d(), c(), P[b.key] = b, b;
}
function pe(e) {
  return P[e] || null;
}
function me() {
  Object.keys(P).forEach(function(e) {
    var a = P[e];
    a && (a.renderPresets(), a.rerenderSummary());
  });
}
typeof window < "u" && Object.assign(window, { DATE_RANGE_PRESETS: C, dateInputToStartTs: G, dateInputToEndTs: B, tsToDateInputValue: x, getRoundFilterTs: V, datePresetRange: E, readDateRange: R, filterEntriesByDateRange: ce, renderRoundsPeriodSummary: j, dateRangeFilters: P, initDateRangeFilter: ue, getDateRangeFilter: pe, refreshDateRangeFilters: me });
function q(e) {
  return e == null ? "" : String(e).replace(/[&<>"']/g, function(a) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[a];
  });
}
function fe() {
  for (var e = arguments[0], a = Array.prototype.slice.call(arguments, 1), r = "", n = 0; n < e.length; n++)
    r += e[n], n < a.length && (r += q(a[n]));
  return r;
}
function he(e, a) {
  e && (e.innerHTML = a == null ? "" : String(a));
}
typeof window < "u" && Object.assign(window, { esc: q, html: fe, setSafeHtml: he });
var L = 3e3;
function K() {
  if (typeof document > "u" || !document.body) return null;
  var e = document.getElementById("toast-root");
  return e || (e = document.createElement("div"), e.id = "toast-root", e.className = "toast-root", e.setAttribute("aria-live", "polite"), document.body.appendChild(e)), e;
}
function U(e) {
  return e === "error" ? '<i class="fas fa-triangle-exclamation"></i>' : e === "warn" ? '<i class="fas fa-bell"></i>' : e === "info" ? '<i class="fas fa-circle-info"></i>' : '<i class="fas fa-circle-check"></i>';
}
function I(e, a, r) {
  a = a || "success", r = r || {};
  var n = parseInt(r.duration) > 0 ? parseInt(r.duration) : L;
  try {
    if (typeof document > "u" || !document.body) return null;
    var o = K();
    if (!o) return null;
    for (; o.children.length >= 3; )
      try {
        var s = o.firstChild;
        if (!s) break;
        s._pestovoDismiss && s._pestovoDismiss(!0), o.removeChild(s);
      } catch {
        break;
      }
    var i = document.createElement("div");
    i.className = "toast t-" + a, i.setAttribute("role", "status"), i.innerHTML = '<span class="toast-ico">' + U(a) + '</span><span class="toast-msg">' + e + '</span><button type="button" class="toast-x" aria-label="×">×</button><span class="toast-bar"><span style="animation-duration:' + n + 'ms"></span></span>';
    var _ = !1, u = function(d) {
      if (!_) {
        _ = !0;
        try {
          i.classList.remove("t-show"), i.classList.add("t-hide"), setTimeout(function() {
            try {
              i.remove();
            } catch {
            }
          }, d ? 0 : 320);
        } catch {
        }
      }
    };
    return i._pestovoDismiss = u, i.addEventListener("click", function(d) {
      if (d && d.target && d.target.classList && d.target.classList.contains("toast-x")) {
        d.stopPropagation(), u(!1);
        return;
      }
      if (typeof r.onClick == "function") {
        try {
          r.onClick();
        } catch {
        }
        u(!1);
      } else
        u(!1);
    }), o.appendChild(i), setTimeout(function() {
      try {
        i.classList.add("t-show");
      } catch {
      }
    }, 10), setTimeout(function() {
      u(!1);
    }, n), i;
  } catch {
    return null;
  }
}
function be(e, a) {
  a = a || {};
  var r = (e || []).slice();
  if (r.length) {
    var n = parseInt(a.gap) > 0 ? parseInt(a.gap) : 350, o = L + n;
    r.forEach(function(s, i) {
      setTimeout(function() {
        typeof s == "string" ? I(s, a.type || "warn", a.toastOpts || {}) : I(s.msg || s.html || "", s.type || a.type || "warn", s.opts || a.toastOpts || {});
      }, i * o);
    });
  }
}
function Y(e) {
  try {
    return localStorage.getItem(e) === "1";
  } catch {
    return !1;
  }
}
function ge(e) {
  if (navigator.vibrate) {
    var a = e ?? 50;
    Y("pestovo_strong_vibration") && (Array.isArray(a) ? a = a.map(function(r, n) {
      return n % 2 === 0 ? Math.min(650, Math.max(35, Math.round((parseInt(r) || 0) * 1.45))) : Math.min(260, Math.max(20, Math.round((parseInt(r) || 0) * 0.9)));
    }) : a = Math.min(650, Math.max(70, Math.round((parseInt(a) || 50) * 1.5))));
    try {
      navigator.vibrate(a);
    } catch {
    }
  }
}
function ye(e) {
  return e == null ? "" : String(e).replace(/[&<>"']/g, function(a) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[a];
  });
}
typeof window < "u" && Object.assign(window, { TOAST_DURATION_MS: L, ensureToastRoot: K, toastIconFor: U, toast: I, toastSequence: be, isPlayerModeEnabled: Y, vib: ge, escapeHtml: ye });
var m = typeof localStorage < "u" && localStorage.getItem("pestovo_lang") || "ru", f = {
  ru: {
    brand_name: "Пестово",
    nav_home: "Главная",
    nav_round: "Раунд",
    nav_leaderboard: "Все раунды",
    bn_home: "Главная",
    bn_round: "Раунд",
    bn_rounds: "Табло",
    bn_menu: "Меню",
    nav_players: "Игроки",
    nav_tournaments: "Турниры",
    nav_stats: "Статистика",
    nav_handicaps: "Гандикапы",
    nav_admin: "Админ",
    nav_login: "Войти",
    footer_club: "© 2024 Гольф-клуб Пестово",
    tab_design: "Дизайн 🎨",
    design_admin_title: "Шаблоны оформления сайта",
    design_admin_sub: "Текущий дизайн + 5 альтернативных шаблонов. Шаблон можно назначить всему сайту, отдельной странице или отдельному блоку — так собирается собственный дизайн из готовых частей.",
    design_mode_title: "Режим оформления",
    design_global_title: "Базовый шаблон сайта",
    design_preview_title: "Живой предпросмотр",
    design_preview_sub: "Слева — как сайт выглядит сейчас с выбранными настройками, дальше — каждый шаблон целиком.",
    design_save_btn: "Сохранить оформление для всех",
    design_reset_btn: "Вернуть текущий дизайн",
    design_pages_title: "Шаблон для каждой страницы",
    design_pages_sub: "Работает в режиме «Сборка из шаблонов». Значение «Текущий» — страница оформлена базовым шаблоном сайта.",
    design_blocks_title: "Шаблон для каждого блока",
    design_blocks_sub: "Блок со своим шаблоном перекрывает шаблон страницы — так собирается уникальный дизайн из разных частей.",
    hero_sub: "Цифровая счётная карточка Пестово",
    hero_title: "Лайв-скоринг и электронные карточки Пестово",
    hero_desc: "18 лунок · Пар 72",
    btn_start_game: "Начать игру",
    btn_view_scores: "Все раунды",
    sec_now_playing: "Сейчас на поле",
    sec_active_tournament: "Активный турнир",
    sec_my_active: "Мои активные раунды",
    continue_round: "Продолжить игру",
    sec_club_stats: "Клуб в цифрах",
    sec_course_card: "Поле клуба",
    sec_recent_results: "Последние результаты",
    all_rounds: "Все раунды",
    no_active_players: "Сейчас никто не играет",
    course_card_sub: "18 лунок · Пар 72 · Все ТИ (метры)",
    address_str: "📍 МО, г. Мытищи, Никольская ул., 1, Румянцево",
    nav_header: "Навигация",
    more_header: "Ещё",
    tee_bk: "Чёрный",
    tee_bl: "Синий",
    tee_wh: "Белый",
    tee_rd: "Красный",
    tee_opt_bk: "⬛ Чёрный",
    tee_opt_bl: "🟦 Синий",
    tee_opt_wh: "⬜ Белый",
    tee_opt_rd: "🟥 Красный",
    hole: "Лунка",
    par: "Пар",
    index: "Индекс",
    gross: "Gross",
    hole_lbl: "Лунка",
    par_lbl: "Пар",
    dist_lbl: "Метры",
    deadline_lbl: "Дедлайн",
    stbl_field: "Stableford (пол.)",
    stbl_exact: "Stableford (игр.)",
    out: "Аут",
    in_side: "Ин",
    total: "Итого",
    meters: "Метры",
    deadline: "Дедлайн",
    format_match_1v1: "Матч-плей (1х1)",
    format_match_2v2: "Матч-плей (2х2)",
    format_scramble: "Скрембл (Scramble)",
    voice_score_btn: "Голос",
    hole_map_btn: "2D Схема",
    analytics_title: "Аналитика",
    voice_not_supported: "Голосовой ввод не поддерживается вашим браузером",
    no_data: "Нет данных",
    select_hole_title: "Выберите лунку:",
    forecast_input_title: "Данные для прогноза",
    select_registered_player: "Выберите зарегистрированного игрока:",
    planned_tee: "Планируемый ТИ:",
    save_group: "Сохранить Группу",
    test_group: "Проверить Группу",
    save_channel: "Сохранить Канал",
    test_channel: "Проверить Канал",
    save_vk: "Сохранить настройки ВКонтакте",
    test_vk: "Проверить отправку в ВКонтакте",
    tg_integration_title: "Интеграция Telegram: Группа Судей & Канал Клуба",
    tg_integration_sub: "Вы можете настроить отправку уведомлений отдельно для Группы Судей/Маршалов и для Канала Клуба.",
    tg_group_title: "1. Telegram Группа (Вызовы Судей и Маршалов)",
    tg_group_sub: "💡 Добавьте бота в группу судей. Chat ID обычно начинается с -100...",
    tg_channel_title: "2. Telegram Канал (Анонсы и Результаты)",
    tg_channel_sub: "💡 Назначьте бота Администратором канала с правом публикации сообщений.",
    placeholder_tg_channel_id: "@pestovo_golf или -1001987654321",
    vk_integration_title: "Интеграция ВКонтакте (VK API)",
    vk_integration_sub: "При вызове судьи или маршала уведомление мгновенно отправится в беседу или личные сообщения ВКонтакте.",
    vk_token_lbl: "VK Access Token Сообщества",
    placeholder_vk_peer_id: "2000000001 (беседа) или 123456789 (пользователь)",
    placeholder_bc_title: "🏆 Чемпионат Пестово 2024",
    placeholder_bc_body: "Регистрация на турнир открыта! Старт в субботу в 10:00.",
    share_card: "Поделиться в соцсетях (PNG)",
    download_png: "Скачать картинку (PNG)",
    share_native: "Поделиться в приложении",
    page_title_live: "Начать раунд",
    page_sub_live: "Одна форма для одиночного и группового раунда — игроков добавляет кнопка «Добавить игрока»",
    round_setup: "Настройки раунда",
    group_setup_title: "Настройка группы",
    solo_round: "Одиночный раунд",
    group_round: "Групповой раунд",
    solo_desc: "Играете один. Сами вводите свой счёт на каждой лунке.",
    group_desc: "От 2 до 4 игроков. Двойной ввод (свой счёт + счёт партнёра).",
    mode_solo_title: "Одиночный раунд",
    mode_solo_desc: "Играете один. Сами вводите свой счёт на каждой лунке.",
    mode_group_title: "Групповой раунд",
    mode_group_desc: "От 2 до 4 игроков. Двойной ввод (свой счёт + счёт партнёра).",
    mode_start: "Начать",
    unified_hint: "Начните раунд одному или нескольким игрокам: 1 игрок — одиночный раунд, 2 и более — групповой (двойной ввод, маркеры).",
    add_player_btn: "Добавить игрока",
    remove_player_btn: "Убрать игрока",
    max_players_msg: "В одном раунде не больше 6 игроков",
    min_players_msg: "Минимум один игрок. Добавьте ещё — и раунд станет групповым",
    mode_note_solo: "Соло-раунд — вы играете один и вводите свой счёт",
    mode_note_group: "Групповой раунд — двойной ввод: свой счёт и счёт партнёра-маркера",
    unified_summary_title: "Проверьте состав",
    wiz_step_1: "Параметры",
    wiz_step_2: "Игроки",
    wiz_step_3: "Старт",
    btn_next: "Далее",
    btn_back: "Назад",
    fio_full_req: "Введите имя и фамилию",
    you: "вы",
    tournament_opt: "Турнир (опционально)",
    no_tournament: "— Без турнира —",
    start_time: "Время старта",
    start_hole: "Стартовая лунка",
    holes_count: "Сколько лунок",
    tee_select: "ТИ",
    format_select: "Формат",
    player_count: "Количество игроков",
    player_count_1: "1 игрок",
    player_count_2: "2 игрока",
    player_count_3: "3 игрока",
    player_count_4: "4 игрока",
    player_data: "Данные игрока",
    select_registered: "Выбрать из зарегистрированных",
    guest_manual: "— Гость / ввести вручную —",
    first_name: "Имя",
    last_name: "Фамилия",
    middle_name: "Отчество (необязательно)",
    gender_label: "Пол",
    placeholder_first_name: "Имя",
    placeholder_last_name: "Фамилия",
    placeholder_middle_name: "Отчество",
    placeholder_tn_name: "Чемпионат Пестово",
    placeholder_hcp_calc: "+2.4 или 12.4",
    men: "Мужчина",
    women: "Девушка",
    exact_hcp: "Точный гандикап",
    field_hcp: "Полевой гандикап",
    field_auto: "Полевой (авто)",
    start_round_btn: "Начать раунд",
    back_btn: "Назад",
    timings_title: "Тайминги",
    pace_of_play: "Темп игры",
    pace_current_hole: "Текущая лунка",
    pace_completed: "Пройдено",
    pace_delay: "Общее отставание",
    pace_buffer: "Запас",
    pace_on_time: "В графике",
    pace_warning: "Небольшое отставание",
    pace_late: "Отставание",
    pace_severe: "Сильное отставание",
    pace_pending: "Тайминг появится после сохранения лунок",
    pace_deadline: "Плановый дедлайн",
    pace_hole_norm: "Норма",
    pace_in_progress: "в процессе",
    time_and_hole: "Время и лунка",
    game_format: "Формат игры",
    my_score: "Мой счёт",
    marker_for: "Маркер для",
    score_col_you: "(вы вводите свой счёт)",
    score_col_marked: "(того, за кем вы ведёте счёт)",
    save_hole: "Сохранить лунку",
    finish_round: "Завершить раунд",
    // Кнопка ввода счёта: игрок ПОДТВЕРЖДАЕТ результат лунки (переход к
    // следующей лунке происходит автоматически, поэтому в названии его нет).
    next_hole_btn: "Подтвердить результат",
    solo_next_hole_btn: "Подтвердить результат",
    solo_save_result_btn: "✅ Подтвердить результат",
    solo_next_keep_btn: "➡️ Следующая лунка",
    skipped_holes_title: "Не введён счёт",
    skipped_holes_goto: "Перейти к лунке",
    skipped_holes_skip: "Продолжить с пропуском",
    skipped_holes_finish_q: "На лунке(ах) {holes} нет счёта. Завершить раунд всё равно?",
    score_of_player: "Ваш счёт",
    score_of_marked: "Маркер",
    score_of_marked_hint: "Счёт игрока, которого вы маркируете",
    tn_start_pending_title: "Турнир ещё не начался",
    tn_start_countdown_label: "До старта осталось",
    tn_start_at: "Старт:",
    tn_start_gate_hint: "Ввод счёта откроется автоматически ровно в момент старта — обновлять страницу не нужно.",
    tn_start_gate_started: "🏁 Турнир стартовал — можно вводить счёт!",
    finish_blocked_title: "Раунд пока нельзя завершить",
    finish_blocked_hint: "Уведомление исчезнет само, как только все лунки будут подтверждены.",
    pause_round: "Пауза",
    resume_round: "Возобновить",
    fio_resume_title: "Продолжить игру по ФИО",
    fio_resume_desc: "Если телефон разрядился — введите имя и фамилию, чтобы найти незавершённый раунд и продолжить (дата/время старта, текущая лунка).",
    fio_label: "Имя Фамилия",
    search_btn: "Найти",
    round_paused: "Раунд на паузе",
    round_resumed: "Раунд возобновлён",
    force_finish: "Завершить принудительно",
    force_finish_short: "Досрочно",
    force_finish_btn: "Завершить раунд принудительно (сохранить счёт)",
    pause_round_title: "⏸ Поставить раунд на паузу",
    pause_round_desc: "Тайминги и нормативы темпа игры будут остановлены на время паузы. Дедлайны по всем оставшимся лункам автоматически сдвинутся на длительность паузы.",
    pause_reason_label: "Причина паузы (необязательно):",
    pause_reason_weather: "⛈ Гроза / Непогода",
    pause_reason_lunch: "🍽 Перерыв / Обед",
    pause_reason_marshal: "🚨 Остановка маршалом / судьёй",
    pause_reason_delay: "🔍 Задержка на поле / Поиск мяча",
    pause_reason_tech: "⚙️ Техническая пауза",
    pause_reason_other: "📝 Другая причина",
    force_finish_title: "⚡ Принудительное завершение раунда",
    force_finish_desc: "Все введённые к этому моменту результаты будут сохранены в карточке и учтены в статистике. Несыгранные лунки останутся незаполненными.",
    force_scope_self: "👤 Завершить только для меня",
    force_scope_self_desc: "Другие игроки группы продолжат играть в этом раунде.",
    force_scope_all: "👥 Завершить для всей группы",
    force_scope_all_desc: "Завершить раунд для всех участников с сохранением текущих очков каждого.",
    force_reason_label: "Причина завершения:",
    force_reason_wd: "🛑 Сход / По решению игрока (WD)",
    force_reason_darkness: "🌙 Наступление темноты",
    force_reason_weather: "⛈ Непогода / Дождь",
    force_reason_injury: "🚑 Травма / Самочувствие",
    force_reason_time: "⏰ Нехватка времени",
    force_reason_other: "📝 Другая причина",
    my_round_completed_notice: "Вы завершили этот раунд. Ваши партнёры ещё продолжают игру.",
    show_stableford_points: "Показывать очки Stableford",
    show_stableford_points_hint: "Очки с учётом полевой форы будут показаны рядом с введённым счётом. Эта настройка сохраняется только для вас.",
    stableford_default: "Stableford по умолчанию",
    stableford_default_hint: "Показывать очки Stableford рядом со счётом всем игрокам, которые ещё не выбрали личную настройку.",
    save_stableford_default: "Сохранить настройку Stableford",
    confirm_final_hole: "Зафиксировать 18-ю лунку",
    waiting_for_marker: "⏳ Ваш счёт введён. Ожидаем подтверждение от маркера",
    hole_finalized_both: "✅ Счёт зафиксирован и подтверждён обеими сторонами!",
    mismatch_error: "⚠️ Несовпадение с маркером! Исправьте результат.",
    call_referee: "Вызвать судью",
    call_marshal: "Вызвать маршала",
    call_sent: "Вызов отправлен",
    call_accepted: "принял вызов",
    call_on_way: "едет",
    call_retry_in: "Повторный вызов через",
    call_cooldown: "Повторный вызов будет доступен через",
    read_only_mode: "Режим просмотра. Ввод счёта доступен только участникам раунда.",
    view_only_group_desc: "Режим просмотра. Ввод счёта доступен только участникам раунда.",
    round_score: "Счёт раунда",
    hole_scorecard: "Счётная карточка по лункам",
    group_summary: "Сводка группы",
    connect_players: "Подключение игроков группы",
    connect_players_title: "Подключение игроков группы",
    connect_players_desc: "Дайте отсканировать QR-код другим игрокам, чтобы они открыли счётную карточку со своих телефонов.",
    scan_to_play: "Сканируй, чтобы играть за этого игрока",
    invite_qrs_collapse: "Свернуть QR-коды подключения",
    invite_qrs_expand: "Развернуть QR-коды подключения",
    joined_in_game: "В игре",
    waiting_join: "Ожидает подключения",
    ready_to_score: "готовы вводить счёт",
    ready_to_score_one: "готов вводить счёт",
    of_word: "из",
    all_joined: "Все игроки подключены",
    qr_reconnect_hint: "QR сохранён — можно переподключиться",
    marker_score_short: "М",
    legend_player_score: "счёт игрока",
    legend_marker_score: "счёт маркера",
    legend_mismatch: "расхождение",
    round_progress: "Прогресс раунда",
    finished_f: "Завершил (F)",
    res_hio: "Hole-in-One!",
    res_albatross: "Альбатрос",
    res_eagle: "Eagle",
    res_birdie: "Birdie",
    res_par: "Par",
    res_bogey: "Bogey",
    res_double: "Double",
    weather_clear: "Ясно",
    weather_cloudy: "Малооблачно",
    weather_fog: "Туман",
    weather_rain: "Дождь",
    weather_snow: "Снег",
    weather_thunder: "Гроза",
    wind_label: "Ветер",
    status_label: "Статус",
    status_all: "Все",
    status_active: "Live",
    status_completed: "Завершённые",
    date_filter_label: "Период",
    date_from_label: "Дата с",
    date_to_label: "Дата по",
    date_filter_reset: "Сбросить",
    date_preset_today: "Сегодня",
    date_preset_7d: "7 дней",
    date_preset_30d: "30 дней",
    date_preset_month: "Этот месяц",
    date_preset_year: "Этот год",
    date_preset_all: "Всё время",
    date_filter_invalid: "Дата «с» позже даты «по»",
    rounds_found_label: "Найдено раундов",
    rounds_total_label: "Всего раундов",
    round: "Раунд",
    period_label: "Период",
    period_all_time: "за всё время",
    no_rounds_in_period: "Нет раундов за выбранный период",
    all_players: "Все игроки",
    type_registered: "Только зарегистрированные",
    type_guests: "Только гости",
    sort_rounds: "По раундам",
    sort_gross: "По лучшему Gross",
    sort_name: "По имени",
    player_type: "Тип игрока",
    sort_by: "Сортировка",
    role_admin: "Администратор",
    role_referee: "Судья",
    role_marshal: "Маршал",
    role_player: "Игрок",
    export_csv_btn: "Экспортировать все раунды в CSV",
    download_backup_btn: "Скачать бэкап базы (JSON)",
    generate_flights_btn: "Сформировать флайты",
    register_tournament_btn: "Записаться на турнир",
    registered_badge: "Вы зарегистрированы ✅",
    cancel_registration: "Отменить запись",
    participants_list: "Список участников",
    registered_count: "Заявлено участников",
    msg_tournament_registered: "🎉 Вы успешно записались на турнир!",
    msg_registration_cancelled: "Запись на турнир отменена",
    confirm_registration: "Подтвердить запись на турнир",
    send_broadcast_title: "Отправить Push-анонс клуба",
    send_broadcast_sub: "Сообщение будет отправлено на смартфоны всех игроков клуба.",
    broadcast_title_lbl: "Заголовок анонса",
    broadcast_body_lbl: "Текст сообщения",
    broadcast_link_lbl: "Ссылка (опционально)",
    send_broadcast_btn: "Отправить анонс всем игрокам",
    bc_audience_lbl: "Кому отправить",
    bc_aud_all_pwa: "Всем + PWA-уведомления (включая гостей)",
    tab_scores: "Счёт ⛳",
    scores_editor_title: "Редактор счёта всех раундов",
    scores_editor_sub: "Редактируйте счёт любой лунки любого игрока — активного, запланированного или завершённого раунда. Найдите игрока или раунд поиском, раскройте карточку, внесите правки и сохраните.",
    scores_search_fio: "Поиск по ФИО игрока",
    scores_search_date: "Дата раунда",
    scores_search_status: "Статус раунда",
    bc_aud_all: "Всем игрокам клуба",
    bc_aud_tournament: "Турниру (его registrations)",
    bc_aud_protocol: "Игрокам стартового протокола",
    bc_aud_tn_lbl: "Турнир",
    bc_aud_proto_lbl: "Стартовый протокол",
    bc_aud_none: "— выберите —",
    bc_aud_hint: "Адресный анонс увидят только адресаты: страница игрока проверяет, есть ли он в списке получателей, и лишнего не показывает.",
    bc_aud_count: "Получателей",
    bc_aud_none_sel: "Анонс некому отправлять: в списке получателей нет ни одного игрока",
    bc_aud_count_btn: "Отправить анонс",
    broadcast_history_title: "История отправленных анонсов",
    edit_profile: "Редактировать профиль",
    save_profile: "Сохранить профиль",
    cancel_btn: "Отмена",
    expand_scorecard: "Показать карточку",
    collapse_scorecard: "Свернуть карточку",
    expand_round: "Развернуть раунд",
    collapse_round: "Свернуть раунд",
    expand_all_rounds: "Развернуть все",
    collapse_all_rounds: "Свернуть все",
    live_rounds_hint: "Видно, кто сейчас на поле. Нажмите на строку, чтобы развернуть детали",
    field_map_title: "Карта лунок и старты",
    privacy_title: "Конфиденциальность имён (ФИО)",
    privacy_sub: "Скрывать полные имена игроков (имя, фамилия, отчество) от других игроков и гостей. Вместо ФИО показываются инициалы или маска, а гандикап и история раундов остаются видны.",
    privacy_global_lbl: "Скрывать ФИО всех игроков от других (глобально)",
    privacy_global_sub: "Включите, чтобы скрыть полные имена сразу для всех игроков.",
    privacy_mask_lbl: "Формат скрытия имени",
    privacy_opt_initials: "Инициалы (И. Т.)",
    privacy_opt_masked: "Полная маскировка (Игрок №N)",
    privacy_save_btn: "Сохранить настройки приватности",
    privacy_hide_btn: "Скрыть имя",
    privacy_show_btn: "Показать имя",
    my_round_tag: "Мой раунд",
    current_round_tag: "Текущий",
    leader_lbl: "Лидер",
    sc_topar_lbl: "To-par по ходу",
    to_current_hole: "К текущей лунке",
    card_marker_lbl: "Маркер",
    no_current_hole: "Текущая лунка ещё не определена",
    avatar_label: "Аватар профиля",
    upload_photo: "Загрузить фото",
    choose_preset: "Или выберите иконку",
    phone_label: "Телефон",
    default_tee: "Предпочитаемый ТИ по умолчанию",
    msg_profile_saved: "✅ Профиль обновлён!",
    search_label: "Поиск игрока",
    search_placeholder: "Поиск по имени...",
    page_title_handicaps: "Полевые гандикапы",
    page_sub_handicaps: "Пестово · Пар 72",
    admin_login_title: "Вход в админ-панель",
    remember_me: "Запомнить меня",
    forgot_password: "Забыли пароль?",
    admin_logout: "Выйти из админки",
    tournament_date_label: "Дата",
    tournament_name_label: "Название",
    all_genders: "Все",
    men_plural: "Мужчины",
    women_plural: "Девушки",
    quick_calc: "Быстрый расчёт",
    full_table: "Посмотреть полную таблицу",
    full_table_title: "Посмотреть полную таблицу",
    full_table_sub: "Выберите пол и ТИ — таблица появится ниже",
    tbl_gender: "Пол игрока",
    tbl_select_gender: "— Пол —",
    tbl_select_tee: "— ТИ —",
    select_gender_first: "— Сначала пол —",
    from_col: "Показатель от",
    to_col: "Показатель до",
    round_history: "История раундов",
    // Режимы интерфейса игрока
    // Solo & Guest
    solo_sub: "Гольф-клуб Пестово",
    current_score: "Текущий счёт",
    view_mode_notice: "Режим просмотра.",
    // Admin & Auth
    admin_login: "Вход в админ-панель",
    admin_panel: "Админ-панель",
    admin_desc: "Войдите с мастер-паролем или авторизуйтесь через аккаунт с правами администратора.",
    admin_master_session_hint: "Сессия по мастер-паролю действует до закрытия браузера",
    username: "Логин",
    password: "Пароль",
    login_btn: "Войти",
    register_btn: "Регистрация",
    create_account: "Создать аккаунт",
    continue_guest: "Продолжить как гость",
    tab_rounds: "Раунды",
    tab_alerts: "Вызовы 🚨",
    tab_groups: "Группы сейчас ⏱️",
    tab_tournaments: "Турниры 🏆",
    tab_studio: "Турниры · создание",
    tab_start: "Старт турнира 🏁",
    tab_players: "Игроки и роли",
    tab_data: "Данные",
    tab_importexport: "Импорт/Экспорт 📊",
    tab_rusgolf: "RUSGOLF 🇷🇺",
    imp_exp_title: "Импорт и экспорт игроков (Excel)",
    imp_exp_sub: "Выгружайте список игроков в таблицу Excel и импортируйте игроков обратно: имя, фамилия и точный гандикап.",
    rg_title: "Проверка гандикапа — база АГР России",
    rg_sub: "Поиск точного гандикапа (HI) игрока в официальной базе Ассоциации гольфа России (hcp.rusgolf.ru) с возможностью добавить игрока к себе на сайт.",
    all_tournaments: "Все турниры",
    create_tournament: "Создать турнир",
    tournament_name: "Название",
    tournament_date: "Дата",
    available_formats: "Доступные форматы",
    available_tees: "Доступные ТИ",
    create_btn: "Создать",
    admin_only_tournaments: "Турниры создаёт только администратор.",
    admin_panel_link: "Админка",
    referee_marshal_calls: "Вызовы судей и маршалов",
    admin_groups_title: "Группы, которые сейчас играют",
    admin_groups_sub: "Контроль темпа игры по активным групповым раундам",
    admin_no_groups: "Сейчас нет активных групповых раундов",
    admin_group_players: "Игроки",
    admin_start_time: "Стартовое время",
    admin_start_hole: "Стартовая лунка",
    admin_current_hole: "Текущая лунка",
    admin_hole_timings: "Тайминги прохождения лунок",
    admin_total_delay: "Общее отставание",
    enable_push_notifications: "Включить Push-уведомления",
    manage_players_roles: "Управление игроками и ролями",
    manage_players_sub: "Назначайте права Администратора другим игрокам. Администраторы получают полный доступ к этой панели.",
    data_management: "Управление данными",
    data_danger_sub: "Осторожно — действия необратимы.",
    page_visibility_title: "Управление видимостью страниц и функций",
    page_visibility_sub: "Снимите галочку с любой страницы или функции, чтобы полностью скрыть её из меню навигации для игроков.",
    save_visibility_btn: "Сохранить настройки",
    hcp_variant_title: "Стиль галочки гандикапа",
    hcp_variant_sub: "Зелёная галочка «гандикап синхронизирован» и дата обновления показаны во вкладке «Игроки», личном профиле и в списке админки. Выбор действует для всех игроков.",
    hcp_variant_1: "1 · Компактная галочка",
    hcp_variant_2: "2 · Пилюля «обновлён»",
    hcp_variant_3: "3 · Галочка на аватаре",
    social_card_variant_title: "Оформление PNG-карточки для соцсетей",
    social_card_variant_sub: "Выберите один из трёх вариантов. Выбранное оформление применится ко всем новым PNG-карточкам при экспорте.",
    social_card_variant_1: "1 · Классика",
    social_card_variant_2: "2 · Акцент на результате",
    social_card_variant_3: "3 · Турнирная",
    group_card_variant_title: "Отображение группового раунда на главной",
    group_card_variant_sub: "Выберите стиль единой карточки группового раунда для главной страницы. Настройка применяется для всех пользователей.",
    group_card_variant_1: "1 · Сводная матрица",
    group_card_variant_2: "2 · Сравнительная таблица",
    group_card_variant_3: "3 · Лидерборд флайта",
    tn_card_variant_title: "Счётная карточка игрока в лидерборде турнира",
    tn_card_variant_sub: "Игрок нажимает на свою строку в лидерборде турнира (страница «Турниры») — открывается его счётная карточка. Выберите один из трёх видов. Настройка применяется для всех пользователей.",
    tn_card_variant_1: "1 · Официальный бланк",
    tn_card_variant_2: "2 · Плитки лунок",
    tn_card_variant_3: "3 · Турнирная сводка",
    tn_card_preview: "Примеры — так карточка выглядит у игрока:",
    players_display_title: "Отображение страницы «Игроки»",
    players_display_sub: "Выберите один из трёх вариантов оформления списка игроков. Настройка применяется для всех пользователей.",
    players_display_variant_1: "1 · Карточки",
    players_display_variant_2: "2 · Компактный список",
    players_display_variant_3: "3 · Витрина",
    stats_display_title: "Отображение страницы «Статистика»",
    stats_display_sub: "Выберите один из трёх вариантов оформления статистики клуба. Настройка применяется для всех пользователей.",
    stats_display_variant_1: "1 · Карточки",
    stats_display_variant_2: "2 · Сводка",
    stats_display_variant_3: "3 · Дашборд",
    rounds_display_title: "Отображение страницы «Все раунды»",
    rounds_display_sub: "Выберите один из трёх вариантов списка раундов. Настройка применяется для всех пользователей.",
    rounds_display_variant_1: "1 · Текущий список",
    rounds_display_variant_2: "2 · Таблица",
    rounds_display_variant_3: "3 · Витрина раундов",
    home_display_title: "Отображение страницы «Главная»",
    home_display_sub: "Выберите один из трёх вариантов оформления главной страницы. Настройка применяется для всех пользователей.",
    home_display_variant_1: "1 · Классика",
    home_display_variant_2: "2 · Компактная",
    home_display_variant_3: "3 · Витрина",
    tournaments_display_title: "Отображение страницы «Турниры»",
    tournaments_display_sub: "Выберите один из трёх вариантов оформления списка турниров. Настройка применяется для всех пользователей.",
    tournaments_display_variant_1: "1 · Список",
    tournaments_display_variant_2: "2 · Компактный",
    tournaments_display_variant_3: "3 · Витрина",
    tab_tournaments_view: "Турниры: вид 👁",
    tournaments_view_tab_title: "Отображение страницы «Турниры» — 5 вариантов",
    tournaments_view_tab_sub: "Вариант выбирает только администратор. Он сохраняется в настройках клуба и сразу применяется у всех игроков на странице «Турниры».",
    tournaments_view_variant_1: "1 · Сетка карточек",
    tournaments_view_variant_2: "2 · Компактный список",
    tournaments_view_variant_3: "3 · Витрина",
    tournaments_view_variant_4: "4 · Таблица",
    tournaments_view_variant_5: "5 · Календарь",
    tournaments_view_variant_1_desc: "Текущий вид: карточки турниров в адаптивной сетке.",
    tournaments_view_variant_2_desc: "Плотный список в одну строку: название, статус и дата — максимум турниров на экране.",
    tournaments_view_variant_3_desc: "Крупные карточки с большим баннером — по одной-две в ряд, как афиша клуба.",
    tournaments_view_variant_4_desc: "Табличный вид: строки с колонками «Турнир · Дата · Формат · Статус».",
    tournaments_view_variant_5_desc: "Календарная лента: слева дата старта, справа карточка турнира.",
    tournaments_view_open_page: "Открыть страницу «Турниры»",
    tournaments_view_saved: "Вариант отображения «Турниры» сохранён для всех пользователей",
    handicap_display_title: "Отображение страницы «Гандикапы»",
    handicap_display_sub: "Выберите один из трёх вариантов оформления калькулятора и таблиц гандикапов. Настройка применяется для всех пользователей.",
    handicap_display_variant_1: "1 · Стандарт",
    handicap_display_variant_2: "2 · Компактный",
    handicap_display_variant_3: "3 · Витрина",
    all_players_joined: "Все игроки уже вошли в раунд",
    tab_broadcasts: "Анонсы 📢",
    delete_all_rounds: "Удалить все раунды",
    delete_all_data: "Удалить всех игроков и раунды",
    delete_all_data_sub: "Полностью удаляет всех игроков и все раунды. Данные исчезнут из всех списков, статистики и автоподбора и не появятся снова.",
    wipe_everything: "Удалить все данные",
    wipe_everything_sub: "Удаляет абсолютно всё: турниры, игроков, раунды, историю, маркеры, протоколы, трансляции, реакции, демо-имена и все локальные кэши. Настройки дизайна и доступа в админку сохраняются.",
    full_name: "Имя и фамилия",
    repeat_password: "Повторите пароль",
    // Scorer & Marker
    scorer_title: "Ввод счёта",
    marker_title: "👁️ Маркер",
    confirm_score_sub: "Подтверждение счёта",
    marker_notice_title: "Вы — маркер",
    marker_notice_desc: "Введите наблюдаемый счёт. Подтверждается только при совпадении.",
    confirm_btn: "Подтвердить",
    // Stats
    page_title_stats: "Статистика клуба",
    page_sub_stats: "Аналитика по всем раундам",
    total_stats: "Общая статистика",
    top_players: "Топ игроков",
    club_records: "Рекорды клуба",
    hole_difficulty: "Сложность лунок",
    // Offline & Error
    offline_title: "Нет соединения",
    offline_desc: "Проверьте интернет-соединение. Ваши результаты сохраняются локально.",
    refresh_btn: "Обновить",
    error_title: "Ошибка",
    qr_invalid: "QR-код недействителен.",
    // Toast Messages
    msg_start_time_req: "Укажите время старта",
    msg_name_req: "Заполните имя игрока",
    msg_exact_hcp_req: "Укажите точный гандикап",
    msg_round_started: "🏌️ Раунд начат!",
    msg_saved_hole: "✅ Сохранено на лунке ",
    msg_edit_disabled: "Редактирование запрещено",
    msg_score_min: "Счёт должен быть ≥ 1",
    msg_finish_confirm: "Завершить раунд?",
    msg_round_finished: "🏁 Раунд завершён!",
    player: "Игрок",
    players_label: "Игроки",
    guest: "ГОСТЬ",
    start: "Старт",
    date: "Дата",
    format: "Формат",
    round_leader: "Лидер раунда",
    no_completed: "Пока нет завершённых раундов",
    unsaved_score_hint: "Счёт не сохранён — нажмите кнопку «Сохранить»",
    start_hint_title: "С какой лунки лучше стартовать?",
    field_hcp_short: "пол. HCP",
    exact_hcp_short: "точн. HCP",
    total_players_on_course: "Всего игроков на поле",
    total_players_label: "Всего игроков",
    free_holes_label: "Свободные лунки",
    busy_holes_label: "Занятые лунки",
    tee_label: "ТИ"
  },
  en: {
    brand_name: "Pestovo",
    nav_home: "Home",
    nav_round: "Round",
    nav_leaderboard: "All Rounds",
    bn_home: "Home",
    bn_round: "Round",
    bn_rounds: "Board",
    bn_menu: "Menu",
    nav_players: "Players",
    nav_tournaments: "Tournaments",
    nav_stats: "Statistics",
    nav_handicaps: "Handicaps",
    nav_admin: "Admin",
    nav_login: "Login",
    footer_club: "© 2024 Pestovo Golf Club",
    tab_design: "Design 🎨",
    design_admin_title: "Site design templates",
    design_admin_sub: "The current design + 5 alternative templates. A template can be applied to the whole site, to a single page or to a single block — this is how a custom design is assembled from ready-made parts.",
    design_mode_title: "Design mode",
    design_global_title: "Base site template",
    design_preview_title: "Live preview",
    design_preview_sub: "On the left — how the site looks now with the current settings, then every template in full.",
    design_save_btn: "Save the design for everyone",
    design_reset_btn: "Restore the current design",
    design_pages_title: "Template for each page",
    design_pages_sub: 'Works in the "Mix templates" mode. "Current" means the page follows the base site template.',
    design_blocks_title: "Template for each block",
    design_blocks_sub: "A block with its own template overrides the page template — this is how a unique design is assembled from different parts.",
    hero_sub: "Pestovo Digital Scorecard",
    hero_title: "Pestovo Live Scoring & Digital Scorecards",
    hero_desc: "18 Holes · Par 72",
    btn_start_game: "Start Game",
    btn_view_scores: "All Rounds",
    sec_now_playing: "Currently Playing",
    sec_active_tournament: "Active tournament",
    sec_my_active: "My Active Rounds",
    continue_round: "Continue Playing",
    sec_club_stats: "Club Statistics",
    sec_course_card: "Course Map",
    sec_recent_results: "Recent Results",
    all_rounds: "All Rounds",
    no_active_players: "No active players on course",
    course_card_sub: "18 Holes · Par 72 · All Tees (meters)",
    address_str: "📍 Pestovo Golf Club, Mytishchi, Moscow Region",
    nav_header: "Navigation",
    more_header: "More",
    tee_bk: "Black",
    tee_bl: "Blue",
    tee_wh: "White",
    tee_rd: "Red",
    tee_opt_bk: "⬛ Black",
    tee_opt_bl: "🟦 Blue",
    tee_opt_wh: "⬜ White",
    tee_opt_rd: "🟥 Red",
    hole: "Hole",
    par: "Par",
    index: "Index",
    gross: "Gross",
    hole_lbl: "Hole",
    par_lbl: "Par",
    dist_lbl: "Meters",
    deadline_lbl: "Deadline",
    stbl_field: "Stableford (Course)",
    stbl_exact: "Stableford (Playing)",
    out: "Out",
    in_side: "In",
    total: "Total",
    meters: "Meters",
    deadline: "Deadline",
    format_match_1v1: "Match Play (1v1)",
    format_match_2v2: "Match Play (2v2)",
    format_scramble: "Scramble",
    voice_score_btn: "Voice",
    hole_map_btn: "2D Map",
    analytics_title: "Analytics",
    voice_not_supported: "Voice input is not supported by your browser",
    no_data: "No data",
    select_hole_title: "Select Hole:",
    forecast_input_title: "Handicap Predictor Data",
    select_registered_player: "Select Registered Player:",
    planned_tee: "Planned Tee:",
    save_group: "Save Group",
    test_group: "Test Group",
    save_channel: "Save Channel",
    test_channel: "Test Channel",
    save_vk: "Save VKontakte Settings",
    test_vk: "Test VK Message",
    tg_integration_title: "Telegram Integration: Referee Group & Club Channel",
    tg_integration_sub: "Configure notification settings for Referee/Marshal Group and Club Channel.",
    tg_group_title: "1. Telegram Group (Referee/Marshal Calls)",
    tg_group_sub: "💡 Add bot to referee group. Chat ID usually starts with -100...",
    tg_channel_title: "2. Telegram Channel (Announcements & Results)",
    tg_channel_sub: "💡 Set bot as Channel Administrator with Post Messages permission.",
    placeholder_tg_channel_id: "@pestovo_golf or -1001987654321",
    vk_integration_title: "VKontakte Integration (VK API)",
    vk_integration_sub: "Referee/marshal call notifications will be sent instantly to your VK chat or DM.",
    vk_token_lbl: "VK Community Access Token",
    placeholder_vk_peer_id: "2000000001 (chat) or 123456789 (user)",
    placeholder_bc_title: "🏆 Pestovo Championship 2024",
    placeholder_bc_body: "Tournament registration is open! Start on Saturday at 10:00.",
    share_card: "Share Scorecard (PNG)",
    download_png: "Download Image (PNG)",
    share_native: "Share to Apps",
    page_title_live: "Start Round",
    page_sub_live: 'One form for solo and group rounds — add players with the "Add Player" button',
    round_setup: "Round Settings",
    group_setup_title: "Group Setup",
    solo_round: "Solo Round",
    group_round: "Group Round",
    solo_desc: "Play solo. Enter your own score for each hole.",
    group_desc: "2 to 4 players. Dual entry (your score + partner score).",
    mode_solo_title: "Solo Round",
    mode_solo_desc: "Play solo. Enter your own score for each hole.",
    mode_group_title: "Group Round",
    mode_group_desc: "2 to 4 players. Dual entry (your score + partner score).",
    mode_start: "Start",
    unified_hint: "Start a round for one or several players: 1 player — solo round, 2+ — group round (dual entry, markers).",
    add_player_btn: "Add Player",
    remove_player_btn: "Remove Player",
    max_players_msg: "A round can have at most 6 players",
    min_players_msg: "At least one player is required. Add more to make it a group round",
    mode_note_solo: "Solo round — you play alone and enter your own score",
    mode_note_group: "Group round — dual entry: your score and your partner-marker's score",
    unified_summary_title: "Review your players",
    wiz_step_1: "Settings",
    wiz_step_2: "Players",
    wiz_step_3: "Start",
    btn_next: "Next",
    btn_back: "Back",
    fio_full_req: "Enter first and last name",
    you: "you",
    tournament_opt: "Tournament (optional)",
    no_tournament: "— No Tournament —",
    start_time: "Start Time",
    start_hole: "Start Hole",
    holes_count: "Number of Holes",
    tee_select: "Tee",
    format_select: "Format",
    player_count: "Number of Players",
    player_count_1: "1 Player",
    player_count_2: "2 Players",
    player_count_3: "3 Players",
    player_count_4: "4 Players",
    player_data: "Player Details",
    select_registered: "Select from registered users",
    guest_manual: "— Guest / enter manually —",
    first_name: "First Name",
    last_name: "Last Name",
    middle_name: "Middle Name (optional)",
    gender_label: "Gender",
    placeholder_first_name: "John",
    placeholder_last_name: "Doe",
    placeholder_middle_name: "Jr.",
    placeholder_tn_name: "Pestovo Championship",
    placeholder_hcp_calc: "+2.4 or 12.4",
    men: "Male",
    women: "Female",
    exact_hcp: "Exact Handicap",
    field_hcp: "Course Handicap",
    field_auto: "Course HCP (auto)",
    start_round_btn: "Start Round",
    back_btn: "Back",
    timings_title: "Hole Timings",
    pace_of_play: "Pace of Play",
    pace_current_hole: "Current hole",
    pace_completed: "Completed",
    pace_delay: "Total delay",
    pace_buffer: "Buffer",
    pace_on_time: "On pace",
    pace_warning: "Slightly behind",
    pace_late: "Behind pace",
    pace_severe: "Severely behind",
    pace_pending: "Timing appears after holes are saved",
    pace_deadline: "Planned deadline",
    pace_hole_norm: "Target",
    pace_in_progress: "in progress",
    time_and_hole: "Time and Hole",
    game_format: "Game Format",
    my_score: "My Score",
    marker_for: "Marker for",
    score_col_you: "(you enter your own score)",
    score_col_marked: "(the player you are marking for)",
    save_hole: "Save Hole",
    finish_round: "Finish Round",
    next_hole_btn: "Confirm result",
    solo_next_hole_btn: "Confirm result",
    solo_save_result_btn: "✅ Confirm result",
    solo_next_keep_btn: "➡️ Next hole",
    skipped_holes_title: "Score not entered",
    skipped_holes_goto: "Go to hole",
    skipped_holes_skip: "Continue with gaps",
    skipped_holes_finish_q: "No score on hole(s) {holes}. Finish the round anyway?",
    score_of_player: "Your score",
    score_of_marked: "Marker",
    score_of_marked_hint: "Score of the player you are marking",
    tn_start_pending_title: "The tournament has not started yet",
    tn_start_countdown_label: "Starts in",
    tn_start_at: "Start:",
    tn_start_gate_hint: "Score entry opens automatically at the start time — no need to refresh the page.",
    tn_start_gate_started: "🏁 The tournament has started — you can enter scores now!",
    finish_blocked_title: "The round cannot be finished yet",
    finish_blocked_hint: "This notice disappears on its own as soon as every hole is confirmed.",
    pause_round: "Pause",
    resume_round: "Resume",
    fio_resume_title: "Continue playing by name",
    fio_resume_desc: "If your phone died — enter your first and last name to find the unfinished round and continue (start date/time, current hole).",
    fio_label: "First and last name",
    search_btn: "Search",
    round_paused: "Round Paused",
    round_resumed: "Round Resumed",
    force_finish: "Force Finish",
    force_finish_short: "Early Finish",
    force_finish_btn: "Force finish round (keep scores)",
    pause_round_title: "⏸ Pause Round",
    pause_round_desc: "Pace-of-play timings will be stopped during pause. Hole deadlines will automatically be extended by the pause duration.",
    pause_reason_label: "Pause reason (optional):",
    pause_reason_weather: "⛈ Thunderstorm / Weather",
    pause_reason_lunch: "🍽 Break / Lunch",
    pause_reason_marshal: "🚨 Marshal / Referee stop",
    pause_reason_delay: "🔍 Course delay / Lost ball",
    pause_reason_tech: "⚙️ Technical pause",
    pause_reason_other: "📝 Other reason",
    force_finish_title: "⚡ Force Finish Round",
    force_finish_desc: "All scores entered so far will be saved to your scorecard and history. Unplayed holes will remain empty.",
    force_scope_self: "👤 Finish only for myself",
    force_scope_self_desc: "Other players in the group will continue playing in this round.",
    force_scope_all: "👥 Finish for the entire group",
    force_scope_all_desc: "Finish the round for all players, keeping current scores of each.",
    force_reason_label: "Reason for finish:",
    force_reason_wd: "🛑 Player withdrawal / Decision (WD)",
    force_reason_darkness: "🌙 Darkness",
    force_reason_weather: "⛈ Bad weather / Rain",
    force_reason_injury: "🚑 Injury / Illness",
    force_reason_time: "⏰ Out of time",
    force_reason_other: "📝 Other reason",
    my_round_completed_notice: "You have finished this round. Your partners are still playing.",
    show_stableford_points: "Show Stableford points",
    show_stableford_points_hint: "Handicap-adjusted points will appear next to the entered score. This setting is saved only for you.",
    stableford_default: "Default Stableford display",
    stableford_default_hint: "Show Stableford points next to the score for every player who has not selected a personal preference.",
    save_stableford_default: "Save Stableford setting",
    confirm_final_hole: "Finalize Hole 18",
    waiting_for_marker: "⏳ Your score is in. Waiting for the marker to confirm",
    hole_finalized_both: "✅ Score confirmed and finalized by both sides!",
    mismatch_error: "⚠️ Score mismatch with marker! Please correct before proceeding.",
    call_referee: "Call Referee",
    call_marshal: "Call Marshal",
    call_sent: "Call sent",
    call_accepted: "accepted the call",
    call_on_way: "is on the way",
    call_retry_in: "Call again in",
    call_cooldown: "Another call will be available in",
    read_only_mode: "View mode. Score entry is available to active players only.",
    view_only_group_desc: "View mode. Score entry is available to active players only.",
    round_score: "Round Score",
    hole_scorecard: "Hole Scorecard",
    group_summary: "Group Summary",
    connect_players: "Connect Players",
    connect_players_title: "Connect Group Players",
    connect_players_desc: "Let other players scan their QR code to open their scorecard on their phones.",
    scan_to_play: "Scan to play for this player",
    invite_qrs_collapse: "Collapse player QR codes",
    invite_qrs_expand: "Expand player QR codes",
    joined_in_game: "In game",
    waiting_join: "Waiting to join",
    ready_to_score: "ready to score",
    ready_to_score_one: "ready to score",
    of_word: "of",
    all_joined: "All players connected",
    qr_reconnect_hint: "QR kept — you can reconnect",
    marker_score_short: "M",
    legend_player_score: "player's score",
    legend_marker_score: "marker's score",
    legend_mismatch: "mismatch",
    round_progress: "Round Progress",
    finished_f: "Finished (F)",
    res_hio: "Hole-in-One!",
    res_albatross: "Albatross",
    res_eagle: "Eagle",
    res_birdie: "Birdie",
    res_par: "Par",
    res_bogey: "Bogey",
    res_double: "Double",
    weather_clear: "Clear",
    weather_cloudy: "Partly Cloudy",
    weather_fog: "Fog",
    weather_rain: "Rain",
    weather_snow: "Snow",
    weather_thunder: "Storm",
    wind_label: "Wind",
    status_label: "Status",
    status_all: "All",
    status_active: "Live",
    status_completed: "Completed",
    date_filter_label: "Period",
    date_from_label: "From",
    date_to_label: "To",
    date_filter_reset: "Reset",
    date_preset_today: "Today",
    date_preset_7d: "7 days",
    date_preset_30d: "30 days",
    date_preset_month: "This month",
    date_preset_year: "This year",
    date_preset_all: "All time",
    date_filter_invalid: "Start date is after the end date",
    rounds_found_label: "Rounds found",
    rounds_total_label: "Total rounds",
    round: "Round",
    period_label: "Period",
    period_all_time: "all time",
    no_rounds_in_period: "No rounds in the selected period",
    all_players: "All Players",
    type_registered: "Registered Only",
    type_guests: "Guests Only",
    sort_rounds: "By Rounds",
    sort_gross: "By Best Gross",
    sort_name: "By Name",
    player_type: "Player Type",
    sort_by: "Sort By",
    role_admin: "Chief Administrator",
    role_referee: "Referee",
    role_marshal: "Marshal",
    role_player: "Player",
    export_csv_btn: "Export All Rounds to CSV",
    download_backup_btn: "Download Database Backup (JSON)",
    generate_flights_btn: "Generate Tournament Flights",
    register_tournament_btn: "Register for Tournament",
    registered_badge: "Registered ✅",
    cancel_registration: "Cancel Registration",
    participants_list: "Registered Roster",
    registered_count: "Registered Players",
    msg_tournament_registered: "🎉 Successfully registered for tournament!",
    msg_registration_cancelled: "Registration cancelled",
    confirm_registration: "Confirm Tournament Registration",
    send_broadcast_title: "Send Club Push Announcement",
    send_broadcast_sub: "Message will be sent to smartphones of all club players.",
    broadcast_title_lbl: "Announcement Title",
    broadcast_body_lbl: "Message Text",
    broadcast_link_lbl: "Link (optional)",
    send_broadcast_btn: "Send Broadcast to All Players",
    bc_audience_lbl: "Audience",
    bc_aud_all_pwa: "Everyone + PWA notifications (incl. guests)",
    tab_scores: "Scores ⛳",
    scores_editor_title: "All-rounds score editor",
    scores_editor_sub: "Edit any hole of any player — active, scheduled or completed round. Find a player or round via search, expand the card, make changes and save.",
    scores_search_fio: "Search by player name",
    scores_search_date: "Round date",
    scores_search_status: "Round status",
    bc_aud_all: "All club players",
    bc_aud_tournament: "Tournament (its registrations)",
    bc_aud_protocol: "Players of the start list",
    bc_aud_tn_lbl: "Tournament",
    bc_aud_proto_lbl: "Start protocol",
    bc_aud_none: "— pick one —",
    bc_aud_hint: "A targeted announcement is shown to its addressees only: the player page checks the recipient list and hides everything else.",
    bc_aud_count: "Recipients",
    bc_aud_none_sel: "Nobody to send to: the recipient list is empty",
    bc_aud_count_btn: "Send announcement",
    broadcast_history_title: "Sent Announcements History",
    edit_profile: "Edit Profile",
    save_profile: "Save Profile",
    cancel_btn: "Cancel",
    expand_scorecard: "Expand Scorecard",
    collapse_scorecard: "Collapse Scorecard",
    expand_round: "Expand round",
    collapse_round: "Collapse round",
    expand_all_rounds: "Expand all",
    collapse_all_rounds: "Collapse all",
    live_rounds_hint: "You can see who is on the course now. Tap a row to expand details",
    field_map_title: "Hole map & starts",
    privacy_title: "Name privacy (Full name)",
    privacy_sub: "Hide players' full names (first, last, patronymic) from other players and guests. Initials or a mask are shown instead, while handicap and round history remain visible.",
    privacy_global_lbl: "Hide all players' full names from others (globally)",
    privacy_global_sub: "Enable to hide full names for all players at once.",
    privacy_mask_lbl: "Hidden name format",
    privacy_opt_initials: "Initials (I. T.)",
    privacy_opt_masked: "Full mask (Player #N)",
    privacy_save_btn: "Save privacy settings",
    privacy_hide_btn: "Hide name",
    privacy_show_btn: "Show name",
    my_round_tag: "My round",
    current_round_tag: "Current",
    leader_lbl: "Leader",
    sc_topar_lbl: "To-par by hole",
    to_current_hole: "To current hole",
    card_marker_lbl: "Marker",
    no_current_hole: "Current hole is not set yet",
    avatar_label: "Profile Avatar",
    upload_photo: "Upload Photo",
    choose_preset: "Or choose icon preset",
    phone_label: "Phone Number",
    default_tee: "Default Preferred Tee",
    msg_profile_saved: "✅ Profile updated!",
    search_label: "Search Player",
    search_placeholder: "Search by name...",
    page_title_handicaps: "Course Handicaps",
    page_sub_handicaps: "Pestovo · Par 72",
    admin_login_title: "Admin Panel Login",
    remember_me: "Remember me",
    forgot_password: "Forgot password?",
    admin_logout: "Log out Admin",
    tournament_date_label: "Date",
    tournament_name_label: "Name",
    all_genders: "All",
    men_plural: "Male",
    women_plural: "Female",
    quick_calc: "Quick Calculator",
    full_table: "View Full Table",
    full_table_title: "View Full Table",
    full_table_sub: "Select gender and tee — table will appear below",
    tbl_gender: "Player Gender",
    tbl_select_gender: "— Gender —",
    tbl_select_tee: "— Tee —",
    select_gender_first: "— Gender First —",
    from_col: "Handicap From",
    to_col: "Handicap To",
    round_history: "Round History",
    // Player interface modes
    // Solo & Guest
    solo_sub: "Pestovo Golf Club",
    current_score: "Current Score",
    view_mode_notice: "View mode.",
    // Admin & Auth
    admin_login: "Admin Panel Login",
    admin_panel: "Admin Panel",
    admin_desc: "Log in with master password or authenticate with an admin account.",
    admin_master_session_hint: "The master-password session ends when you close the browser",
    username: "Username",
    password: "Password",
    login_btn: "Log In",
    register_btn: "Register",
    create_account: "Create Account",
    continue_guest: "Continue as Guest",
    tab_rounds: "Rounds",
    tab_alerts: "Alerts 🚨",
    tab_groups: "Groups now ⏱️",
    tab_tournaments: "Tournaments 🏆",
    tab_studio: "Tournaments · create",
    tab_start: "Tournament Start 🏁",
    tab_players: "Players & Roles",
    tab_data: "Data",
    tab_importexport: "Import/Export 📊",
    tab_rusgolf: "RUSGOLF 🇷🇺",
    imp_exp_title: "Player Import & Export (Excel)",
    imp_exp_sub: "Export the player list to an Excel table and import players back: first name, last name and exact handicap.",
    rg_title: "Handicap Lookup — RGA Database",
    rg_sub: "Look up a player's exact Handicap Index (HI) in the official Russian Golf Association database (hcp.rusgolf.ru) and add players to your site.",
    all_tournaments: "All Tournaments",
    create_tournament: "Create Tournament",
    tournament_name: "Name",
    tournament_date: "Date",
    available_formats: "Available Formats",
    available_tees: "Available Tees",
    create_btn: "Create",
    admin_only_tournaments: "Tournaments are created by administrators only.",
    admin_panel_link: "Admin Panel",
    referee_marshal_calls: "Referee & Marshal Calls",
    admin_groups_title: "Groups currently playing",
    admin_groups_sub: "Pace monitoring for active group rounds",
    admin_no_groups: "There are no active group rounds",
    admin_group_players: "Players",
    admin_start_time: "Start time",
    admin_start_hole: "Start hole",
    admin_current_hole: "Current hole",
    admin_hole_timings: "Hole-by-hole timing",
    admin_total_delay: "Total delay",
    enable_push_notifications: "Enable Push Notifications",
    manage_players_roles: "Manage Players & Roles",
    manage_players_sub: "Assign Administrator rights to other players. Administrators get full access to this panel.",
    data_management: "Data Management",
    data_danger_sub: "Caution — actions are irreversible.",
    page_visibility_title: "Manage Page & Feature Visibility",
    page_visibility_sub: "Uncheck any page or feature to completely hide it from the navigation menu for players.",
    save_visibility_btn: "Save Settings",
    hcp_variant_title: "Handicap checkmark style",
    hcp_variant_sub: "The green “handicap synced” checkmark and update date are shown in the Players tab, player profile and the admin list. The choice applies to all players.",
    hcp_variant_1: "1 · Compact check",
    hcp_variant_2: "2 · “Updated” pill",
    hcp_variant_3: "3 · Check on avatar",
    social_card_variant_title: "Social PNG scorecard style",
    social_card_variant_sub: "Choose one of three layouts. The selected design is used for every newly exported PNG scorecard.",
    social_card_variant_1: "1 · Classic",
    social_card_variant_2: "2 · Result focus",
    social_card_variant_3: "3 · Tournament",
    group_card_variant_title: "Group round card layout on home page",
    group_card_variant_sub: "Choose the layout for the unified group round card on the home page. Applies to all users.",
    group_card_variant_1: "1 · Summary Matrix",
    group_card_variant_2: "2 · Comparison Table",
    group_card_variant_3: "3 · Flight Leaderboard",
    tn_card_variant_title: "Player scorecard in the tournament leaderboard",
    tn_card_variant_sub: "A player taps their row in the tournament leaderboard (Tournaments page) and their scorecard opens. Pick one of three styles. Applies to all users.",
    tn_card_variant_1: "1 · Official card",
    tn_card_variant_2: "2 · Hole tiles",
    tn_card_variant_3: "3 · Tournament board",
    tn_card_preview: "Preview — how the card looks for a player:",
    players_display_title: "“Players” page layout",
    players_display_sub: "Choose one of three player-list layouts. The setting applies to all users.",
    players_display_variant_1: "1 · Cards",
    players_display_variant_2: "2 · Compact list",
    players_display_variant_3: "3 · Showcase",
    stats_display_title: "“Statistics” page layout",
    stats_display_sub: "Choose one of three club-statistics layouts. The setting applies to all users.",
    stats_display_variant_1: "1 · Cards",
    stats_display_variant_2: "2 · Summary",
    stats_display_variant_3: "3 · Dashboard",
    rounds_display_title: "“All Rounds” page layout",
    rounds_display_sub: "Choose one of three round-list layouts. The setting applies to all users.",
    rounds_display_variant_1: "1 · Current list",
    rounds_display_variant_2: "2 · Table",
    rounds_display_variant_3: "3 · Round showcase",
    home_display_title: "“Home” page layout",
    home_display_sub: "Choose one of three home page layouts. The setting applies to all users.",
    home_display_variant_1: "1 · Classic",
    home_display_variant_2: "2 · Compact",
    home_display_variant_3: "3 · Showcase",
    tournaments_display_title: "“Tournaments” page layout",
    tournaments_display_sub: "Choose one of three tournament-list layouts. The setting applies to all users.",
    tournaments_display_variant_1: "1 · List",
    tournaments_display_variant_2: "2 · Compact",
    tournaments_display_variant_3: "3 · Showcase",
    tab_tournaments_view: "Tournaments: layout 👁",
    tournaments_view_tab_title: "“Tournaments” page layout — 5 variants",
    tournaments_view_tab_sub: "Only an administrator picks the layout. It is stored in the club settings and applies to every player on the “Tournaments” page right away.",
    tournaments_view_variant_1: "1 · Card grid",
    tournaments_view_variant_2: "2 · Compact list",
    tournaments_view_variant_3: "3 · Showcase",
    tournaments_view_variant_4: "4 · Table",
    tournaments_view_variant_5: "5 · Calendar",
    tournaments_view_variant_1_desc: "Current look: tournament cards in a responsive grid.",
    tournaments_view_variant_2_desc: "Dense one-line rows with name, status and date — more tournaments per screen.",
    tournaments_view_variant_3_desc: "Large cards with a big banner, one or two per row, like a club poster wall.",
    tournaments_view_variant_4_desc: "Table view: rows with “Tournament · Date · Format · Status” columns.",
    tournaments_view_variant_5_desc: "Calendar timeline: start date on the left, tournament card on the right.",
    tournaments_view_open_page: "Open the “Tournaments” page",
    tournaments_view_saved: "“Tournaments” layout saved for all users",
    handicap_display_title: "“Handicaps” page layout",
    handicap_display_sub: "Choose one of three handicap calculator and table layouts. The setting applies to all users.",
    handicap_display_variant_1: "1 · Standard",
    handicap_display_variant_2: "2 · Compact",
    handicap_display_variant_3: "3 · Showcase",
    all_players_joined: "All players have already joined the round",
    tab_broadcasts: "Announcements 📢",
    delete_all_rounds: "Delete All Rounds",
    delete_all_data: "Delete All Players & Rounds",
    delete_all_data_sub: "Permanently removes every player and every round. Data disappears from all lists, stats and autocomplete and will not reappear.",
    wipe_everything: "Delete all data",
    wipe_everything_sub: "Erases absolutely everything: tournaments, players, rounds, history, markers, protocols, broadcasts, reactions, demo names and all local caches. Design and admin access settings are kept.",
    full_name: "Full Name",
    repeat_password: "Repeat Password",
    // Scorer & Marker
    scorer_title: "Score Entry",
    marker_title: "👁️ Marker",
    confirm_score_sub: "Score Confirmation",
    marker_notice_title: "You are a Marker",
    marker_notice_desc: "Enter observed score. Confirmed only when scores match.",
    confirm_btn: "Confirm",
    // Stats
    page_title_stats: "Club Statistics",
    page_sub_stats: "Analytics across all rounds",
    total_stats: "General Statistics",
    top_players: "Top Players",
    club_records: "Club Records",
    hole_difficulty: "Hole Difficulty",
    // Offline & Error
    offline_title: "No Connection",
    offline_desc: "Check your internet connection. Your scores are saved locally.",
    refresh_btn: "Refresh",
    error_title: "Error",
    qr_invalid: "QR code is invalid.",
    // Toast Messages
    msg_start_time_req: "Specify start time",
    msg_name_req: "Enter player name",
    msg_exact_hcp_req: "Specify exact handicap",
    msg_round_started: "🏌️ Round Started!",
    msg_saved_hole: "✅ Saved for Hole ",
    msg_edit_disabled: "Editing disabled",
    msg_score_min: "Score must be ≥ 1",
    msg_finish_confirm: "Finish round?",
    msg_round_finished: "🏁 Round Completed!",
    player: "Player",
    players_label: "Players",
    guest: "GUEST",
    start: "Start",
    date: "Date",
    format: "Format",
    round_leader: "Round Leader",
    no_completed: "No completed rounds yet",
    unsaved_score_hint: "Score is not saved yet — press the “Save” button",
    start_hint_title: "Which hole is best to start from?",
    field_hcp_short: "Course HCP",
    exact_hcp_short: "Exact HCP",
    total_players_on_course: "Total players on course",
    total_players_label: "Total players",
    free_holes_label: "Free holes",
    busy_holes_label: "Busy holes",
    tee_label: "Tee"
  }
};
(function() {
  var e = (/* @__PURE__ */ new Date()).getFullYear();
  f.ru && (f.ru.footer_club = "© " + e + " Гольф-клуб Пестово"), f.en && (f.en.footer_club = "© " + e + " Pestovo Golf Club");
})();
function ve(e) {
  var a = typeof m < "u" && m ? m : "ru";
  try {
    if (f[a] && f[a][e] !== void 0)
      return f[a][e];
    if (f.ru && f.ru[e] !== void 0)
      return f.ru[e];
  } catch (r) {
    console.warn("[silent]", r);
  }
  return e;
}
function we() {
  m = m === "ru" ? "en" : "ru", typeof localStorage < "u" && localStorage.setItem("pestovo_lang", m);
  try {
    document.documentElement.setAttribute("lang", m);
  } catch (o) {
    console.warn("[silent]", o);
  }
  if (A(), W(), typeof applyPlayerModes == "function" && applyPlayerModes(), typeof refreshOfficialCallBindings == "function" && refreshOfficialCallBindings(), typeof renderAdmGroups == "function" && renderAdmGroups(), typeof loadAdmRounds == "function" && typeof hasAdminPanelAccess == "function" && hasAdminPanelAccess()) {
    var e = document.getElementById("admin-content");
    e && !e.classList.contains("hidden") && loadAdmRounds();
  }
  if (typeof buildMobileDrawer == "function") {
    var a = document.getElementById("mobile-drawer-root"), r = a && a.classList.contains("open");
    buildMobileDrawer(), r && a && a.classList.add("open");
  }
  if (typeof initP0MobileEnhancements == "function") try {
    initP0MobileEnhancements();
  } catch (o) {
    console.warn("[silent]", o);
  }
  if (typeof tnwOnLangChange == "function") try {
    tnwOnLangChange();
  } catch (o) {
    console.warn("[silent]", o);
  }
  if (typeof toast == "function" && toast(m === "en" ? "🇬🇧 English language enabled" : "🇷🇺 Выбран русский язык", "info"), typeof loadLiveRounds == "function" && loadLiveRounds(), typeof loadRecentResults == "function" && loadRecentResults(), typeof loadLB == "function" && loadLB(), typeof loadPlayers == "function" && loadPlayers(), typeof loadStats == "function" && loadStats(), typeof loadPestovoWeather == "function" && loadPestovoWeather("nav-weather-container"), typeof showGroupSetup == "function") {
    var n = document.getElementById("group-setup") || document.getElementById("setup");
    n && !n.classList.contains("hidden") && showGroupSetup();
  }
  typeof initRoundView == "function" && typeof curRid < "u" && curRid && initRoundView(), typeof initSoloView == "function" && initSoloView(), typeof updateHcpTable == "function" && updateHcpTable(), typeof loadClubStats == "function" && loadClubStats(), typeof loadMyActiveRounds == "function" && loadMyActiveRounds("my-active-rounds-container");
}
function W() {
  typeof document > "u" || document.querySelectorAll(".lang-btn").forEach(function(e) {
    e.innerHTML = m === "en" ? "🇬🇧 EN" : "🇷🇺 RU";
  });
}
function A() {
  typeof document > "u" || (document.querySelectorAll("[data-i18n]").forEach(function(e) {
    var a = e.getAttribute("data-i18n");
    a && f[m] && f[m][a] !== void 0 && (e.innerHTML = f[m][a]);
  }), document.querySelectorAll("[data-i18n-placeholder]").forEach(function(e) {
    var a = e.getAttribute("data-i18n-placeholder");
    a && f[m] && f[m][a] !== void 0 && e.setAttribute("placeholder", f[m][a]);
  }), document.querySelectorAll("[data-i18n-title]").forEach(function(e) {
    var a = e.getAttribute("data-i18n-title");
    a && f[m] && f[m][a] !== void 0 && e.setAttribute("title", f[m][a]);
  }), typeof refreshDateRangeFilters == "function" && refreshDateRangeFilters());
}
try {
  document.documentElement && typeof document.documentElement.setAttribute == "function" && document.documentElement.setAttribute("lang", m);
} catch (e) {
  console.warn("[silent]", e);
}
try {
  A();
} catch (e) {
  console.warn("[silent]", e);
}
document.addEventListener("DOMContentLoaded", function() {
  A(), N();
});
function N() {
  if (!(typeof document > "u")) {
    var e = (/* @__PURE__ */ new Date()).getFullYear();
    document.querySelectorAll(".footer-bottom p").forEach(function(a) {
      a.innerHTML = a.innerHTML.replace(/(©|&copy;)\s*\d{4}/g, "$1 " + e).replace(/&copy;\s*\d{4}/g, "&copy; " + e);
    });
  }
}
N();
typeof window < "u" && Object.assign(window, { currentLang: m, I18N: f, t: ve, toggleLang: we, updateLangButtons: W, applyTranslations: A, updateFooterYear: N });
function D(e, a, r, n, o) {
  var s = !!o, i = s ? escapeHtml : function(b) {
    return String(b);
  }, _ = typeof fmtTime == "function" ? fmtTime(Date.now()) : (/* @__PURE__ */ new Date()).toLocaleTimeString("ru-RU"), u = e === "referee" ? "🚨 Вызов Судьи" : "🚨 Вызов Маршала", d = s ? "<b>" : "", l = s ? "</b>" : "", c = [];
  c.push(s ? "<b>" + u + "</b>" : u), c.push(d + "Кто вызвал:" + l + " " + i(r || "Игрок")), c.push(d + "Лунка:" + l + " №" + a), c.push(d + "Время:" + l + " " + _);
  var h = (n || []).map(function(b) {
    return String(b || "").trim();
  }).filter(Boolean);
  return h.length && c.push(d + "Состав флайта:" + l + " " + i(h.join(", "))), c.join(`
`);
}
function Se(e, a, r, n, o, s, i) {
  if (e = (e || "").trim(), a = (a || "").trim(), !e || !a) {
    toast("⚠️ Укажите Bot Token и Chat ID / Username для " + (r || "Telegram"), "error");
    return;
  }
  var _ = D(n, o, s, i, !0), u = typeof AbortController < "u" ? new AbortController() : null, d = u ? setTimeout(function() {
    try {
      u.abort();
    } catch (c) {
      console.warn("[silent]", c);
    }
  }, 6e3) : null, l = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: a,
      text: _,
      parse_mode: "HTML"
    })
  };
  u && (l.signal = u.signal), fetch("https://api.telegram.org/bot" + e + "/sendMessage", l).then(function(c) {
    return d && clearTimeout(d), c.json();
  }).then(function(c) {
    if (c && c.ok)
      console.log("✅ Telegram alert delivered to " + r + ":", c.result), toast("✅ Telegram сообщение доставлено в " + (r || "чат") + "!", "success");
    else {
      var h = c && c.description ? c.description : "Ошибка Telegram API";
      console.error("❌ Telegram Bot API Error (" + r + "):", h), toast("❌ Ошибка Telegram (" + (r || "чат") + "): " + h, "error");
    }
  }).catch(function(c) {
    d && clearTimeout(d);
    var h = c && c.name === "AbortError", b = h ? "Таймаут соединения (6 сек)" : c ? c.message : "Ошибка сети";
    console.error("❌ Telegram Fetch Error (" + r + "):", c), toast("❌ Ошибка сети / Таймаут Telegram: " + b, "error");
  });
}
function k(e, a, r, n, o, s) {
  if (e = (e || "").trim(), a = (a || "").trim(), !(!e || !a)) {
    var i = D(r, n, o, s, !0), _ = typeof AbortController < "u" ? new AbortController() : null, u = _ ? setTimeout(function() {
      try {
        _.abort();
      } catch (l) {
        console.warn("[silent]", l);
      }
    }, 6e3) : null, d = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: a, text: i, parse_mode: "HTML" })
    };
    _ && (d.signal = _.signal), fetch("https://api.telegram.org/bot" + e + "/sendMessage", d).then(function(l) {
      return u && clearTimeout(u), l.json();
    }).then(function(l) {
      (!l || !l.ok) && console.warn("⚠️ Telegram silent send failed:", l && l.description);
    }).catch(function(l) {
      u && clearTimeout(u), console.warn("⚠️ Telegram silent send error (suppressed):", l && l.message);
    });
  }
}
function ke(e, a, r, n, o) {
  var s = (localStorage.getItem("pestovo_tg_group_token") || localStorage.getItem("pestovo_tg_bot_token") || "").trim(), i = (localStorage.getItem("pestovo_tg_group_id") || localStorage.getItem("pestovo_tg_chat_id") || "").trim(), _ = (localStorage.getItem("pestovo_tg_channel_token") || s || "").trim(), u = (localStorage.getItem("pestovo_tg_channel_id") || "").trim();
  s && i && (o === "group" || !o) && k(s, i, e, a, r, n), _ && u && (o === "channel" || !o) && k(_, u, e, a, r, n), !s && !_ && typeof db < "u" && db.ref("settings/telegram").once("value").then(function(d) {
    var l = d.val() || {}, c = (l.groupToken || l.botToken || "").trim(), h = (l.groupId || l.chatId || "").trim(), b = (l.channelToken || c || "").trim(), y = (l.channelId || "").trim();
    c && h && (o === "group" || !o) && k(c, h, e, a, r, n), b && y && (o === "channel" || !o) && k(b, y, e, a, r, n);
  });
}
function H(e, a, r, n) {
  if (e = (e || "").trim(), a = (a || "").trim(), !e || !a) {
    n || toast("⚠️ Укажите VK Access Token и Peer ID в настройках", "error");
    return;
  }
  var o = "_vkCb_" + Date.now() + "_" + Math.floor(Math.random() * 1e6), s = Math.floor(Math.random() * 2e9), i = null, _ = null, u = function() {
    try {
      _ && _.parentNode && _.parentNode.removeChild(_);
    } catch (l) {
      console.warn("[silent]", l);
    }
    try {
      delete window[o];
    } catch {
      window[o] = void 0;
    }
    i && clearTimeout(i);
  };
  window[o] = function(l) {
    if (u(), l && l.response !== void 0 && l.response)
      n || (console.log("✅ VK message sent, id:", l.response), toast("✅ Сообщение ВКонтакте доставлено!", "success"));
    else {
      var c = l && l.error && l.error.error_code, h = l && l.error && l.error.error_msg ? l.error.error_msg : "Ошибка VK API";
      console.error("❌ VK API Error " + c + ":", h, l), n ? console.warn("⚠️ VK silent send failed (code " + c + "):", h) : toast("❌ VK API: " + h, "error");
    }
  };
  var d = "https://api.vk.com/method/messages.send?access_token=" + encodeURIComponent(e) + "&peer_id=" + encodeURIComponent(a) + "&message=" + encodeURIComponent(r) + "&random_id=" + s + "&v=5.199&callback=" + o;
  _ = document.createElement("script"), _.src = d, _.onerror = function() {
    u(), n ? console.warn("⚠️ VK JSONP network error (suppressed)") : toast("❌ Ошибка сети при отправке в VK (JSONP)", "error");
  }, i = setTimeout(function() {
    u(), n ? console.warn("⚠️ VK JSONP timeout (suppressed)") : toast("❌ Таймаут соединения с VK (10 сек)", "error");
  }, 1e4), (document.head || document.body).appendChild(_);
}
function F(e, a, r, n) {
  return D(e, a, r, n, !1);
}
function Te(e, a, r, n, o, s) {
  if (e = (e || "").trim(), a = (a || "").trim(), !e || !a) {
    toast("⚠️ Укажите VK Access Token и Peer ID в настройках", "error");
    return;
  }
  var i = F(r, n, o, s);
  H(e, a, i, !1);
}
function M(e, a, r, n, o, s) {
  if (e = (e || "").trim(), a = (a || "").trim(), !(!e || !a)) {
    var i = F(r, n, o, s);
    H(e, a, i, !0);
  }
}
function Pe(e, a, r, n) {
  var o = (localStorage.getItem("pestovo_vk_token") || "").trim(), s = (localStorage.getItem("pestovo_vk_peer_id") || "").trim();
  o && s ? M(o, s, e, a, r, n) : typeof db < "u" && db.ref("settings/vk").once("value").then(function(i) {
    var _ = i.val() || {}, u = (_.token || "").trim(), d = (_.peerId || "").trim();
    u && d && M(u, d, e, a, r, n);
  }).catch(function(i) {
    console.warn("⚠️ VK: не удалось загрузить настройки из Firebase:", i);
  });
}
typeof window < "u" && Object.assign(window, { buildOfficialCallText: D, sendTelegramDirectAlert: Se, sendTelegramSilentAlert: k, sendTelegramOfficialAlert: ke, vkSendMessageJsonp: H, vkBuildAlertText: F, sendVKDirectAlert: Te, sendVKSilentAlert: M, sendVKOfficialAlert: Pe });
export {
  $ as ADDR,
  J as CLUB,
  X as COURSE_RATINGS,
  C as DATE_RANGE_PRESETS,
  v as HOLES,
  f as I18N,
  z as TEES,
  Q as TEE_ORDER,
  O as TIMINGS,
  L as TOAST_DURATION_MS,
  Ce as TOTAL_PAR,
  A as applyTranslations,
  D as buildOfficialCallText,
  m as currentLang,
  B as dateInputToEndTs,
  G as dateInputToStartTs,
  E as datePresetRange,
  P as dateRangeFilters,
  K as ensureToastRoot,
  q as esc,
  ye as escapeHtml,
  ce as filterEntriesByDateRange,
  le as fmtDate,
  re as fmtScore,
  ie as fmtTime,
  pe as getDateRangeFilter,
  V as getRoundFilterTs,
  ee as holeDist,
  te as holeHcp,
  Z as holePar,
  oe as holeResClass,
  se as holeResName,
  ae as holeTiming,
  fe as html,
  ue as initDateRangeFilter,
  Y as isPlayerModeEnabled,
  de as isTodayTimestamp,
  T as normalizeTimestampMs,
  R as readDateRange,
  me as refreshDateRangeFilters,
  j as renderRoundsPeriodSummary,
  ne as scoreClass,
  Se as sendTelegramDirectAlert,
  ke as sendTelegramOfficialAlert,
  k as sendTelegramSilentAlert,
  Te as sendVKDirectAlert,
  Pe as sendVKOfficialAlert,
  M as sendVKSilentAlert,
  he as setSafeHtml,
  ve as t,
  _e as tnDateTs,
  I as toast,
  U as toastIconFor,
  be as toastSequence,
  we as toggleLang,
  x as tsToDateInputValue,
  N as updateFooterYear,
  W as updateLangButtons,
  ge as vib,
  F as vkBuildAlertText,
  H as vkSendMessageJsonp
};
