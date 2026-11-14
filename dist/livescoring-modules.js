const Z = "Пестово", xe = 72, ee = "МО, г. Мытищи, Никольская ул., 1, Румянцево", w = {
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
}, G = { 1: 15, 2: 15, 3: 20, 4: 12, 5: 15, 6: 15, 7: 15, 8: 12, 9: 20, 10: 20, 11: 15, 12: 15, 13: 12, 14: 15, 15: 20, 16: 15, 17: 12, 18: 15 }, ae = { bk: "Чёрный", bl: "Синий", wh: "Белый", rd: "Красный" }, te = ["bk", "bl", "wh", "rd"], re = {
  men: { bk: { cr: 76, sr: 144 }, bl: { cr: 73.8, sr: 137 }, wh: { cr: 72, sr: 135 }, rd: { cr: 69.2, sr: 134 } },
  women: { bl: { cr: 80.8, sr: 153 }, wh: { cr: 78.6, sr: 143 }, rd: { cr: 75.2, sr: 136 } }
};
function ne(e) {
  return w[e] ? w[e].p : 4;
}
function ie(e, a) {
  return a = a || "wh", w[e] && w[e][a] || 0;
}
function oe(e) {
  return w[e] ? w[e].hcp : e;
}
function se(e) {
  return G[e] || 15;
}
typeof window < "u" && Object.assign(window, { CLUB: Z, TOTAL_PAR: 72, ADDR: ee, HOLES: w, TIMINGS: G, TEES: ae, TEE_ORDER: te, COURSE_RATINGS: re, holePar: ne, holeDist: ie, holeHcp: oe, holeTiming: se });
function le(e) {
  return e == null || isNaN(e) ? "—" : e === 0 ? "E" : e > 0 ? "+" + e : "" + e;
}
function _e(e) {
  return e == null ? "" : e < 0 ? "s-un" : e > 0 ? "s-ov" : "s-ev";
}
function de(e, a) {
  if (!e || e < 1 || !a) return "";
  var r = e - a;
  return r <= -2 ? "r-eag" : r === -1 ? "r-bir" : r === 0 ? "r-par" : r === 1 ? "r-bog" : "r-dbl";
}
function ue(e, a) {
  if (!e || !a) return "";
  if (e === 1) return t("res_hio");
  var r = e - a;
  return r <= -3 ? t("res_albatross") : r === -2 ? t("res_eagle") : r === -1 ? t("res_birdie") : r === 0 ? t("res_par") : r === 1 ? t("res_bogey") : r === 2 ? t("res_double") : "+" + r;
}
typeof window < "u" && Object.assign(window, {
  fmtScore: le,
  scoreClass: _e,
  holeResClass: de,
  holeResName: ue,
  fmtDate: ce,
  fmtTime: pe,
  tnDateTs: fe,
  normalizeTimestampMs: k,
  isTodayTimestamp: be
});
function ce(e) {
  if (!e) return "—";
  var a = typeof currentLang < "u" && currentLang ? currentLang : "ru";
  try {
    return new Date(e).toLocaleDateString(a === "en" ? "en-US" : "ru-RU", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    var r = new Date(e);
    return (r.getDate() < 10 ? "0" : "") + r.getDate() + "." + (r.getMonth() + 1 < 10 ? "0" : "") + (r.getMonth() + 1) + "." + r.getFullYear();
  }
}
function pe(e) {
  if (e == null || e === "") return "—";
  var a = /^(\d{1,2}):(\d{2})(:\d{2})?$/.exec(String(e).trim());
  if (a) {
    var r = parseInt(a[1], 10), n = parseInt(a[2], 10);
    if (r >= 0 && r < 24 && n >= 0 && n < 60) return (r < 10 ? "0" : "") + r + ":" + (n < 10 ? "0" : "") + n;
  }
  var i = typeof k == "function" ? k(e) : Number(e);
  if (!i || !isFinite(i)) return "—";
  try {
    var o = new Date(i), s = o.getHours(), f = o.getMinutes();
    return isNaN(s) || isNaN(f) ? "—" : (s < 10 ? "0" : "") + s + ":" + (f < 10 ? "0" : "") + f;
  } catch {
    return "—";
  }
}
function fe(e) {
  if (typeof e == "number" && isFinite(e)) return e;
  var a = String(e ?? "").trim();
  if (!a) return NaN;
  var r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a);
  if (r) {
    var n = new Date(Number(r[1]), Number(r[2]) - 1, Number(r[3]), 12, 0, 0, 0).getTime();
    return isNaN(n) ? NaN : n;
  }
  var i = Date.parse(a);
  return isNaN(i) ? NaN : i;
}
function k(e) {
  if (e instanceof Date) return e.getTime() || 0;
  var a = Number(e);
  return (!isFinite(a) || a <= 0) && (a = typeof e == "string" ? Date.parse(e) : 0), a > 0 && a < 1e11 && (a *= 1e3), isFinite(a) && a > 0 ? a : 0;
}
function be(e, a) {
  var r = k(e);
  if (!r) return !1;
  var n = new Date(k(a || Date.now())), i = new Date(r);
  return !isNaN(i.getTime()) && !isNaN(n.getTime()) && i.getFullYear() === n.getFullYear() && i.getMonth() === n.getMonth() && i.getDate() === n.getDate();
}
var R = ["today", "7d", "30d", "month", "year", "all"];
function B(e) {
  var a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(e ?? "").trim());
  if (!a) return null;
  var r = new Date(Number(a[1]), Number(a[2]) - 1, Number(a[3]), 0, 0, 0, 0).getTime();
  return isNaN(r) ? null : r;
}
function V(e) {
  var a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(e ?? "").trim());
  if (!a) return null;
  var r = new Date(Number(a[1]), Number(a[2]) - 1, Number(a[3]), 23, 59, 59, 999).getTime();
  return isNaN(r) ? null : r;
}
function E(e) {
  if (!e) return "";
  var a = new Date(e), r = a.getMonth() + 1, n = a.getDate();
  return a.getFullYear() + "-" + (r < 10 ? "0" : "") + r + "-" + (n < 10 ? "0" : "") + n;
}
function U(e) {
  return !e || typeof e != "object" ? 0 : Number(e.startTime) || Number(e.createdAt) || 0;
}
function M(e) {
  var a = /* @__PURE__ */ new Date(), r = new Date(a.getFullYear(), a.getMonth(), a.getDate()), n = null;
  return e === "today" ? n = r : e === "7d" ? n = new Date(r.getFullYear(), r.getMonth(), r.getDate() - 6) : e === "30d" ? n = new Date(r.getFullYear(), r.getMonth(), r.getDate() - 29) : e === "month" ? n = new Date(r.getFullYear(), r.getMonth(), 1) : e === "year" && (n = new Date(r.getFullYear(), 0, 1)), n ? { from: E(n.getTime()), to: E(r.getTime()) } : { from: "", to: "" };
}
function C(e, a) {
  var r = e && e.value || "", n = a && a.value || "", i = r ? B(r) : null, o = n ? V(n) : null, s = i !== null && o !== null && i > o;
  return {
    from: i,
    to: o,
    fromValue: r,
    toValue: n,
    invalid: s,
    active: !s && (i !== null || o !== null)
  };
}
function me(e, a) {
  return !a || !a.active ? e.slice() : e.filter(function(r) {
    var n = U(r && r[1]);
    return !(!n || a.from !== null && n < a.from || a.to !== null && n > a.to);
  });
}
function q(e, a, r, n, i) {
  if (e) {
    var o = typeof currentLang < "u" && currentLang === "en", s = '<i class="fas fa-calendar-check"></i> ';
    if (a && a.active) {
      var f = a.from !== null ? fmtDate(a.from) : o ? "the beginning" : "с начала", c = a.to !== null ? fmtDate(a.to) : o ? "today" : "сегодня";
      s += '<span class="rs-period">' + escapeHtml(f + " — " + c) + '</span><span class="rs-sep">·</span>' + t("rounds_found_label") + ": <b>" + r + "</b>", typeof n == "number" && n !== r && (s += ' <span class="rs-dim">' + (o ? "of" : "из") + " " + n + "</span>");
    } else
      s += t("rounds_total_label") + ": <b>" + r + "</b>";
    i && i.windowed && i.limit && (s += ' <span class="rs-dim">' + escapeHtml(o ? "· latest " + i.limit + " loaded" : "· загружены последние " + i.limit) + "</span>"), e.innerHTML = s;
  }
}
var P = /* @__PURE__ */ Object.create(null);
function he(e) {
  if (!e) return null;
  var a = document.getElementById(e.fromId), r = document.getElementById(e.toId);
  if (!a || !r) return null;
  var n = e.presetsId ? document.getElementById(e.presetsId) : null, i = e.resetId ? document.getElementById(e.resetId) : null, o = e.hintId ? document.getElementById(e.hintId) : null, s = "pestovo_date_filter_" + e.key;
  function f() {
    try {
      localStorage.setItem(s, JSON.stringify({ from: a.value || "", to: r.value || "" }));
    } catch (p) {
      console.warn("[silent]", p);
    }
  }
  function c() {
    var p = C(a, r);
    if (!p.fromValue && !p.toValue) return "all";
    for (var y = 0; y < R.length; y++) {
      var v = R[y];
      if (v !== "all") {
        var S = M(v);
        if (S.from === p.fromValue && S.to === p.toValue) return v;
      }
    }
    return "";
  }
  function u() {
    if (n) {
      var p = c();
      n.innerHTML = R.map(function(y) {
        return '<button type="button" class="date-chip' + (p === y ? " active" : "") + '" data-preset="' + y + '">' + t("date_preset_" + y) + "</button>";
      }).join("");
    }
  }
  function l() {
    r.value ? a.setAttribute("max", r.value) : a.removeAttribute("max"), a.value ? r.setAttribute("min", a.value) : r.removeAttribute("min");
  }
  function _() {
    var p = C(a, r).invalid;
    a.classList.toggle("is-invalid", p), r.classList.toggle("is-invalid", p), o && (o.textContent = p ? t("date_filter_invalid") : "", o.classList.toggle("hidden", !p));
  }
  function h() {
    _(), typeof e.onChange == "function" && e.onChange(d.getRange());
  }
  var d = {
    key: e.key,
    getRange: function() {
      return C(a, r);
    },
    renderPresets: u,
    lastSummary: null,
    renderSummary: function(p, y, v) {
      d.lastSummary = { count: p, total: y, opts: v || null }, q(e.summaryId ? document.getElementById(e.summaryId) : null, d.getRange(), p, y, v);
    },
    rerenderSummary: function() {
      d.lastSummary && d.renderSummary(d.lastSummary.count, d.lastSummary.total, d.lastSummary.opts);
    }
  };
  try {
    var g = JSON.parse(localStorage.getItem(s) || "null");
    g && typeof g == "object" && (g.from && (a.value = g.from), g.to && (r.value = g.to));
  } catch (p) {
    console.warn("[silent]", p);
  }
  return a.addEventListener("change", function() {
    l(), f(), u(), h();
  }), r.addEventListener("change", function() {
    l(), f(), u(), h();
  }), n && n.addEventListener("click", function(p) {
    var y = p.target && p.target.closest ? p.target.closest(".date-chip") : null, v = y && y.getAttribute("data-preset");
    if (v) {
      var S = M(v);
      a.value = S.from, r.value = S.to, l(), f(), u(), h();
    }
  }), i && i.addEventListener("click", function() {
    a.value = "", r.value = "", l(), f(), u(), h();
  }), l(), u(), _(), P[d.key] = d, d;
}
function ye(e) {
  return P[e] || null;
}
function ge() {
  Object.keys(P).forEach(function(e) {
    var a = P[e];
    a && (a.renderPresets(), a.rerenderSummary());
  });
}
typeof window < "u" && Object.assign(window, { DATE_RANGE_PRESETS: R, dateInputToStartTs: B, dateInputToEndTs: V, tsToDateInputValue: E, getRoundFilterTs: U, datePresetRange: M, readDateRange: C, filterEntriesByDateRange: me, renderRoundsPeriodSummary: q, dateRangeFilters: P, initDateRangeFilter: he, getDateRangeFilter: ye, refreshDateRangeFilters: ge });
function j(e) {
  return e == null ? "" : String(e).replace(/[&<>"']/g, function(a) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[a];
  });
}
function ve() {
  for (var e = arguments[0], a = Array.prototype.slice.call(arguments, 1), r = "", n = 0; n < e.length; n++)
    r += e[n], n < a.length && (r += j(a[n]));
  return r;
}
function we(e, a) {
  e && (e.innerHTML = a == null ? "" : String(a));
}
typeof window < "u" && Object.assign(window, { esc: j, html: ve, setSafeHtml: we });
var N = 3e3;
function K() {
  if (typeof document > "u" || !document.body) return null;
  var e = document.getElementById("toast-root");
  return e || (e = document.createElement("div"), e.id = "toast-root", e.className = "toast-root", e.setAttribute("aria-live", "polite"), document.body.appendChild(e)), e;
}
function z(e) {
  return e === "error" ? '<i class="fas fa-triangle-exclamation"></i>' : e === "warn" ? '<i class="fas fa-bell"></i>' : e === "info" ? '<i class="fas fa-circle-info"></i>' : '<i class="fas fa-circle-check"></i>';
}
function L(e, a, r) {
  a = a || "success", r = r || {};
  var n = parseInt(r.duration) > 0 ? parseInt(r.duration) : N;
  try {
    if (typeof document > "u" || !document.body) return null;
    var i = K();
    if (!i) return null;
    for (; i.children.length >= 3; )
      try {
        var o = i.firstChild;
        if (!o) break;
        o._pestovoDismiss && o._pestovoDismiss(!0), i.removeChild(o);
      } catch {
        break;
      }
    var s = document.createElement("div");
    s.className = "toast t-" + a + (r.clubNotification ? " t-club" : ""), s.setAttribute("role", "status");
    var f = r.html ? e == null ? "" : String(e) : W(e);
    s.innerHTML = '<span class="toast-ico">' + z(a) + '</span><span class="toast-msg">' + f + '</span><button type="button" class="toast-x" aria-label="×">×</button><span class="toast-bar"><span style="animation-duration:' + n + 'ms"></span></span>';
    var c = !1, u = function(l) {
      if (!c) {
        c = !0;
        try {
          s.classList.remove("t-show"), s.classList.add("t-hide"), setTimeout(function() {
            try {
              s.remove();
            } catch {
            }
          }, l ? 0 : 320);
        } catch {
        }
      }
    };
    return s._pestovoDismiss = u, s.addEventListener("click", function(l) {
      if (l && l.target && l.target.classList && l.target.classList.contains("toast-x")) {
        l.stopPropagation(), u(!1);
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
    }), i.appendChild(s), setTimeout(function() {
      try {
        s.classList.add("t-show");
      } catch {
      }
    }, 10), setTimeout(function() {
      u(!1);
    }, n), s;
  } catch {
    return null;
  }
}
function Se(e, a) {
  a = a || {};
  var r = (e || []).slice();
  if (r.length) {
    var n = parseInt(a.gap) > 0 ? parseInt(a.gap) : 350, i = N + n;
    r.forEach(function(o, s) {
      setTimeout(function() {
        typeof o == "string" ? L(o, a.type || "warn", a.toastOpts || {}) : L(o.msg || o.html || "", o.type || a.type || "warn", o.opts || a.toastOpts || {});
      }, s * i);
    });
  }
}
function Q(e) {
  try {
    return localStorage.getItem(e) === "1";
  } catch {
    return !1;
  }
}
function ke(e) {
  if (navigator.vibrate) {
    var a = e ?? 50;
    Q("pestovo_strong_vibration") && (Array.isArray(a) ? a = a.map(function(r, n) {
      return n % 2 === 0 ? Math.min(650, Math.max(35, Math.round((parseInt(r) || 0) * 1.45))) : Math.min(260, Math.max(20, Math.round((parseInt(r) || 0) * 0.9)));
    }) : a = Math.min(650, Math.max(70, Math.round((parseInt(a) || 50) * 1.5))));
    try {
      navigator.vibrate(a);
    } catch {
    }
  }
}
function W(e) {
  return e == null ? "" : String(e).replace(/[&<>"']/g, function(a) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[a];
  });
}
typeof window < "u" && Object.assign(window, { TOAST_DURATION_MS: N, ensureToastRoot: K, toastIconFor: z, toast: L, toastSequence: Se, isPlayerModeEnabled: Q, vib: ke, escapeHtml: W });
var b = typeof localStorage < "u" && localStorage.getItem("pestovo_lang") || "ru", m = {
  ru: {
    ui_bc997c1edb: "Управление клубом",
    ui_31e9780267: "Разделы админки",
    ui_bcef39ebdf: "Иванов Пётр",
    ui_798ff83284: "Фамилия Имя",
    ui_9626d7ac8c: "например: Иван Тестов",
    ui_c5c1c59988: "13.0 или +2.4",
    ui_9dc027291b: "🔍 Поиск: имя, email, телефон… / Search…",
    ui_d8abc3263c: "Например: Тестов Иван или RU000732",
    ui_32541c0ddf: `Лёля = Ольга
Каталина = Наталия`,
    ui_30e0a41688: "Например: 42 или дизайн",
    ui_e01f87de68: "Страницы истории PR",
    ui_372a391df1: "Развернуть счётную карточку",
    ui_cb8c5d52e1: "Минус",
    ui_ac0d11c0a3: "Плюс",
    ui_68660731cc: "Минус маркируемого",
    ui_3470822c60: "Плюс маркируемого",
    ui_0e32051f71: "Пауза / Возобновление",
    ui_1ba5263bd8: "Шаблоны оформления",
    ui_3c4ef14e00: "Текущий дизайн + 5 альтернативных шаблонов: для всего сайта, для каждой страницы и для каждого блока",
    ui_b9f1fffef4: "Как это работает",
    ui_651c92f849: `Каждый шаблон меняет оформление целиком: цвета, фон, рамки, тени, типографику, форму кнопок и бейджей,
            вид таблиц, шапки и подвала — все детали и мелочи. Ниже видно характерные отличия каждого шаблона
            от предыдущего. Выбор сохраняется в`,
    ui_881d791541: "Админ-панель → Дизайн 🎨",
    ui_d4576e5a46: "и применяется у всех игроков.",
    ui_613bd6e0c9: "Дизайн можно",
    ui_4b5926bddb: "собрать из шаблонов",
    ui_0a6792dd1e: `: выбрать базовый шаблон, а затем назначить свой шаблон
            отдельной странице (Главная, Статистика, Турниры и т.д.) или отдельному блоку (шапка, карточки,
            кнопки, таблицы, бейджи, подвал...). Конструктор — в самом низу страницы.`,
    ui_cf09d75992: "Быстрый предпросмотр любой страницы в конкретном шаблоне: добавьте к адресу",
    ui_37d7a2cb26: "(например,",
    ui_40ea39625c: "). Ничего не сохраняется.",
    ui_33aa9be74a: "Все шаблоны целиком",
    ui_83a0cd9f0a: "Один и тот же образец разметки в шести оформлениях.",
    ui_7911dda73e: "Отличия по блокам",
    ui_c2b480d644: "Каждый блок показан отдельно — видно, чем именно шаблоны различаются.",
    ui_70dbdf297a: "Матрица характерных отличий",
    ui_4568b826cb: "Конструктор: собрать дизайн из шаблонов",
    ui_1ccc4ef533: `Выберите базовый шаблон, затем — свой шаблон для любого блока. Справа сразу видно результат.
            Сохранить собранный дизайн для всего сайта можно в админ-панели.`,
    ui_f6408ec13b: "Результат сборки",
    ui_ea58bb0bc6: "Дальше",
    ui_77b6544cd7: "Открыть админ-панель",
    ui_ad94907f64: "На главную",
    ui_b60aec20f0: "Галочка гандикапа: выбор варианта",
    ui_3d8a25781e: "Зелёная галочка",
    ui_3ea256e8e5: "появляется, когда гандикап игрока",
    ui_ecb734a856: "синхронизирован и изменён",
    ui_4e3aac4cb1: `:
            при синхронизации с базой АГР России (RUSGOLF), при импорте Excel или при ручном изменении в админ-панели.
            Рядом показывается`,
    ui_5612b79e93: "дата последнего обновления",
    ui_d932268240: `гандикапа, а источник — при наведении
            (в профиле — открыто). Игроки, у которых гандикап ещё не синхронизирован, галочку`,
    ui_3c86ea8bd6: "не получают",
    ui_64ddfe38d8: "(см. карточку «Иван Кузнецов» в каждом варианте).",
    ui_ba17dc61c0: "Вариант отображается: во",
    ui_e2a152f678: "вкладке «Игроки»",
    ui_2b1f8a0919: ", в",
    ui_7e38742eb5: "личном профиле игрока",
    ui_4370f56467: "и в",
    ui_14b9794b43: "админ-панели",
    ui_5fbd949349: `(«Игроки и роли»). Ниже — живые примеры на реальных данных разметки сайта.
            Кнопка`,
    ui_da950719bc: "«Выбрать этот вариант»",
    ui_5d732dd44b: "включает его",
    ui_12d296173f: "в этом браузере",
    ui_8af581ead5: "для предпросмотра.",
    ui_f7b3462438: "Глобальный выбор для всех игроков",
    ui_0974cf527b: "— в",
    ui_3e23e0c898: "Админ-панели",
    ui_a64a2db415: `,
            вкладка`,
    ui_7c6da828ce: "«Данные» → «Стиль галочки гандикапа»",
    ui_63669f17cf: `: он сохраняется в облако и мгновенно
            применяется на всех устройствах (эта страница подхватит его при обновлении).`,
    ui_04589d0f49: "Компактная галочка",
    ui_7f8a03d69e: "— минимализм",
    ui_1c6adb3f41: "Небольшая зелёная галочка",
    ui_90641a8e61: "и дата обновления (ДД.ММ.ГГ) сразу после значения HCP. Не загромождает карточку, но статус и дата всегда на виду. В профиле — полная дата и источник обновления.",
    ui_8e6ae01d92: "Вкладка «Игроки»",
    ui_d2151bdbf0: "Личный профиль игрока",
    ui_ef4e961f6a: "Выбрать этот вариант",
    ui_5136e92f25: "Светящийся бейдж «пилюля»",
    ui_8a1f20cd03: "— максимальная заметность",
    ui_1d0841a615: "Зелёная «пилюля»",
    ui_0ad04468e5: "обновлён",
    ui_622f083bfd: "с лёгким свечением рядом с HCP. В профиле — отдельный крупный зелёный баннер «Гандикап синхронизирован» с полной датой обновления и источником (RUSGOLF / Excel / вручную).",
    ui_fdbcebcc6c: "«Верифицированный» аватар",
    ui_7f81d13850: "— как в соцсетях",
    ui_bc6cc166b2: "Зелёная галочка-«верификация» закрепляется на углу аватара игрока (как подтверждённый аккаунт), а дата обновления показывается рядом с HCP в списке и профиле. Статус виден «с первого взгляда» по аватару.",
    ui_cc8aaf7006: "Открыть вкладку «Игроки»",
    ui_af947ab16f: "Примеры — демонстрационные данные. На сайте галочка появится автоматически у всех игроков, у кого гандикап уже синхронизирован (есть дата обновления).",
    ui_d827cf9eaa: "© Пестово — подбор варианта отображения гандикапа",
    ui_43f0c259b7: "Счётные карточки на странице ввода результата (setup-round.html). Один игрок — «Счётная карточка по лункам», два и больше — «Общая карточка». Для каждой выберите вид, размер и элементы; для турнирного ввода можно задать свой вид.",
    ui_b939086787: "Эта вкладка меняет только экраны ввода счёта. Карточки на главной, в лидербордах и истории настраиваются во вкладке «Отображения счётных карточек».",
    ui_ae1ebf647f: "Гибко настройте элементы экрана, который открывается по QR-коду стартового листа. Эти параметры действуют для всех турниров и игроков; если турнирных переопределений нет, используются общие настройки ввода счёта.",
    ui_e4404ae752: "Ввод счёта и панель «Мой счёт» остаются включёнными. Для возврата к общим параметрам нажмите «Использовать настройки обычного раунда».",
    ui_828ac5a2bb: "Отмеченные элементы будут показаны на экранах ввода по турнирному QR.",
    ui_bd01c82261: "Меняйте последовательность информации, навигации по лункам и панели ввода.",
    ui_39659830f3: "Турнирные настройки сохраняются отдельно и применяются сразу на всех устройствах.",
    ui_36a643d966: "Один общий дизайн без сохранённых старых вариантов. Настройте видимость каждого элемента и порядок основных блоков; конфигурация применяется ко всем игрокам, обычным и групповым раундам.",
    ui_37b74d9a02: "Блок ввода и сохранения счёта, а также панель «Мой счёт» обязательны и не могут быть скрыты. Вкладка «Турнирный ввод счёта» задаёт отдельные переопределения для QR-раундов.",
    ui_fd846f05e5: "Выберите компоновку: она действует для всех игроков — в одиночном и групповом раунде, на телефоне и на большом экране. Вид применяется сразу после сохранения.",
    ui_c06456492c: "Цвет активной лунки, рамки счёта, кнопки «+» и кнопки подтверждения. Работает с любым видом.",
    ui_25f2120510: "Насколько крупно показывать введённый счёт. «Очень крупный» удобен на ярком солнце.",
    ui_0af9ddb0c8: "Порядок сверху вниз. Кнопки перемещения доступны для нажатия на телефоне.",
    ui_a832c196d4: "Изменения сохраняются глобально. Уже открытые экраны обновятся автоматически.",
    ui_914b6f179a: "Сохранённые сервером действия за последние 30 дней. QR-доступ без входа отмечается отдельно: личность оператора не подтверждена. Время показано в часовом поясе устройства.",
    ui_f8c420259d: "Сбои, которые приложение само отправило с устройств игроков (",
    ui_2b31c31735: "→ узел",
    ui_6b762724a8: "). Не более 20 сообщений за сессию и 3 повтора одной ошибки с устройства — список группируется по тексту. Требует правил БД с узлом",
    ui_e7ab4c0825: "Кто и когда обновил гандикап игрока: из RUSGOLF при создании раунда (ФИО, которое ввёл создатель), вручную в админке, синхронизация АГР и импорт Excel. Видно старое и новое значение.",
    ui_0429aea676: "Как получить токен сообщества",
    ui_c30c05cc7d: "Войдите в",
    ui_9eaa725bc8: "Управление сообществом",
    ui_9ff04885fb: "Работа с API",
    ui_58207ae860: "Ключи доступа",
    ui_fad2f82e70: "Нажмите",
    ui_45cc94ebe8: "«Создать ключ»",
    ui_df82e5bc7c: ", выберите права:",
    ui_b28d2cd212: "Сообщения",
    ui_c9b591fe97: "Скопируйте полученный ключ (",
    ui_57a22a6638: ") в поле ниже",
    ui_9123450c26: "Peer ID беседы",
    ui_8457bff7f2: ": откройте беседу ВК → ссылка вида",
    ui_85da1e3647: "Peer ID пользователя",
    ui_12fcfb70ef: ": числовой ID из профиля ВКонтакте",
    ui_e695053fe0: "Добавьте сообщество в беседу и",
    ui_0dd6b37fa5: "разрешите боту писать",
    ui_56e22910e6: "в настройках беседы",
    ui_4bdac71815: "Для беседы: 2000000000 + номер чата. Для личных сообщений: ID пользователя.",
    ui_fade085486: "Получателей: все игроки клуба",
    ui_aa8da22e16: "Фоновые пуши (при закрытом приложении)",
    ui_c6ba963938: `Анонсы и вызовы судьи доставляются, даже когда PWA закрыта. Требуется
                    одноразовое развёртывание Cloud Function (см.`,
    ui_eead37caf8: "и",
    ui_f0f83935aa: "URL функции vapidSetup (если регион не us-central1)",
    ui_dca5579aa0: "Создать/проверить VAPID-ключи",
    ui_821c616097: "Турниры — гибкая настройка страницы",
    ui_3954e489e4: "Компоновка, порядок и видимость элементов сохраняются для всех пользователей. Старые числовые варианты удалены; по умолчанию используются адаптивные карточки.",
    ui_18f791f55a: "Меняйте расположение активного турнира, предстоящих стартов и архива.",
    ui_979c1e906b: "Сохранённые настройки применяются к каталогу и подробной странице турнира.",
    ui_b2a1629832: "Добавьте нового игрока в систему клуба (имя, точный HCP и пол). ТИ игрока определяется его группой в стартовом протоколе.",
    ui_e15533e8fb: "Полное удаление всех игроков: список станет пустым (также удалятся их раунды, история и регистрации на турниры).",
    ui_1eb1a40bf2: "📋 Столбцы таблицы:",
    ui_4273fc6f1a: "(например",
    ui_bcacbff7a5: "или",
    ui_342a931cc4: "). Опционально можно добавить столбец",
    ui_c79219bb6a: "(муж/жен).",
    ui_afcac97610: "Загрузите файл .xlsx / .xls / .csv — игроки появятся в списке игроков сайта. Дубликаты определяются по имени и фамилии: для них можно обновить точный гандикап.",
    ui_b3a2803940: ".xlsx, .xls или .csv · столбцы: Имя, Фамилия, Точный гандикап",
    ui_545f879d01: "Загрузите таблицу Excel со списком игроков (столбцы",
    ui_546a52b7e1: `).
                    Система найдёт каждого в базе АГР России и покажет список найденных результатов — отметьте нужных и добавьте их на сайт одним кликом.`,
    ui_20212f11a2: ".xlsx, .xls или .csv · столбцы: Имя, Фамилия",
    ui_d92610877f: "Формы имён — «Наташа» = «Наталья»",
    ui_4934470186: `На сайте игрок может быть записан коротким или иным вариантом имени
                    (`,
    ui_97031dc24d: "Наташа",
    ui_842b195e2f: "Наталия",
    ui_16a747fbb9: `), а в базе АГР — полным. Выберите, как сопоставлять имена
                    при поиске и синхронизации гандикапов. Словарь форм:`,
    ui_983582571f: "Применять совпадения по форме имени автоматически",
    ui_5593de071b: "(по умолчанию выключено).",
    ui_e3c4ef05e1: `Пока флажок снят, совпадение «Наташа = Наталья» ничего не меняет само, а попадает в блок «Выберите нужного игрока».
                        Точное совпадение имени и фамилии обновляет HCP всегда — этот флажок на него не влияет.`,
    ui_2f10dc25cf: "Свои формы имён (вариант 3) — по одной в строке, например:",
    ui_cc49a355ae: "Лёля = Ольга",
    ui_53acb9a7ee: `Проверяет точный гандикап всех зарегистрированных игроков, гостей и участников раундов в базе АГР России.
                    Совпадение ищется по`,
    ui_cfcfdee185: "Фамилия + Имя",
    ui_e7b7bed99b: "и по",
    ui_e3849248aa: "Имя + Фамилия",
    ui_eaef777619: `, а также по формам имени
                    («Наташа» → «Наталья», «Наталия» — см. блок «Формы имён» выше). При однозначном совпадении HCP обновляется
                    в профиле, раундах, истории и турнирах. В конце показываются списки: обновлено / актуально / не найдено / на выбор.`,
    ui_cdc2875aeb: `Сайт АГР не разрешает прямые запросы из браузера, поэтому используется цепочка публичных CORS-прокси.
                        Если все прокси недоступны — укажите свой прокси-шаблон, где`,
    ui_3d04a4325f: "будет заменён на адрес запроса.",
    ui_1ba85ca4f6: "Экранные карточки игроков и групп настраиваются во вкладке «Отображения счётных карточек».",
    ui_79fc3f0dc8: "Таблица: место, игрок, лунки, гросс, ±, нетто, стейблфорд",
    ui_a3082d359e: "Только место, игрок, лунки, ± (минимализм)",
    ui_b35f24ac18: "Каждый игрок — карточка с крупными цифрами",
    ui_0af1e08619: "Все поля: HCP, гросс, нетто, стейблфорд, группа, ТИ",
    ui_dee1935da4: "Современный live с индикаторами и анимацией",
    ui_a83394b44d: "Разделение лидерборда турнира по полу (страница «Турниры», 3 вида)",
    ui_b89fb1b0a2: "Мужчины и девушки могут вести зачёт отдельно. Выберите один из 3 видов отображения — настройка выбирается только админом и применяется для всех.",
    ui_9cbddd9bbf: "Одна общая таблица, места среди всех игроков (как раньше)",
    ui_207283cc33: "Вкладки «Все / Мужчины / Девушки», места считаются отдельно внутри каждого пола",
    ui_735a085876: "Две таблицы рядом: «Мужчины» и «Девушки», каждая со своим зачётом",
    ui_118f80f98e: "Группы и список участников на странице «Турниры»",
    ui_96800570ef: "Активный турнир всегда открывается на live-лидерборде. Группы (дивизионы) по умолчанию видны всем — здесь их можно скрыть. Ниже — 4 варианта оформления списка участников и групп. Настройки применяются для всех.",
    ui_596c7029ad: "Блок «Активный турнир» на главной (5 видов)",
    ui_72830e585c: "Выберите один из 5 видов блока активного турнира на главной странице — с топ-3 в разных форматах. Выбирает только админ, применяется для всех пользователей. Виды удобно смотреть и с телефона, и с компьютера.",
    ui_59de0e7de6: "Создание раунда использует один компактный сценарий для всех игроков. Прежние настройки 1–5 совместимы и автоматически открывают этот сценарий; данные раундов не меняются.",
    ui_48ff68a668: "Главная страница и экран ввода счёта каждого PR. Нажмите на снимок, чтобы увеличить его и листать соседние PR.",
    ui_97c465622a: "Страницы сняты из коммитов PR с одинаковыми демонстрационными данными, в мобильном окне 430 × 1100 px. Реальные игроки и результаты не используются.",
    ui_4aa4d75229: "Как читать этот архив",
    ui_0370f1fefb: "Для слитых PR показано состояние после слияния; для закрытых без слияния — последняя версия ветки PR. Номер PR — не обязательно порядок релизов: ориентируйтесь также на дату и коммит.",
    ui_5101f428d8: "Во всех PR сравниваются страницы index.html и scorer.html. Настройки оформления из исторической базы не восстановлены: используется исходное оформление из кода. Внешние шрифты и иконки заменены локальными аналогами; некоторые значки могут отличаться. Внешние сервисы отключены. Это снимки первого экрана, а не страниц целиком. Если исторический JavaScript не запускается, показана статическая HTML-разметка с отдельной пометкой в карточке.",
    ui_d5ff61a4fa: "Если PR не менял внешний вид, снимки могут совпадать. Галерея ничего не применяет к текущему сайту и не меняет данные. Изображения содержат только демонстрационные данные и доступны как статические ресурсы сайта.",
    ui_d780fc28a8: "Номер PR, название или коммит",
    ui_af1034f05e: "Диапазон PR",
    ui_0142ff8eb9: "Все · №1–187",
    ui_93ee53cdb5: "Новые · №101–187",
    ui_c241f6db67: "Снимки",
    ui_96c52b09d0: "Оба экрана",
    ui_fcfc354fd2: "Только главная",
    ui_efa324b62e: "Только ввод счёта",
    ui_36c690d37b: "Статус PR",
    ui_0fe8ec7f51: "Все PR",
    ui_f6b34ec37f: "Только слитые",
    ui_953c2969d9: "Закрытые без слияния",
    ui_f7ca1ccfc6: "Порядок",
    ui_3bd2dc0215: "От №1 к №187",
    ui_6236dd5e17: "От №187 к №1",
    ui_05336bbf2e: "Загружаем архив…",
    ui_a7a4033657: "Закрыть",
    ui_1d471cdfa4: "Другой экран",
    ui_98cf8011c5: "Реконструкция · демонстрационные данные · 430 × 1100 px",
    ui_e07a01d59a: "Открыть оригинал",
    ui_9ce8dc7534: "PR на GitHub ↗",
    ui_f4635472cd: "Проверить права / Войти",
    ui_a726a4d98e: "Уведомления для всех игроков",
    ui_159f8996b8: "Проверка настройки…",
    ui_db491ef503: "Загрузка…",
    ui_738bc2a3c4: "История PR · 1–187",
    ui_74fc14c766: "Интеграции",
    ui_6a4154a7b4: "Отображения счётных карточек",
    ui_1b9445b0ba: "Единое оформление для всех игроков: главная, активные и завершённые раунды, лидерборды, турниры и история. Без расстояний; ти — рядом с именем. Печать и PNG не меняются.",
    ui_70cbac7057: "Для всех игроков",
    ui_ea774426cf: "Общий вид карточки",
    ui_f6bb92d043: "Пять видов одной карточки. Выберите — пример ниже обновится сразу.",
    ui_c85201ffd9: "Бланк клуба",
    ui_80945904b8: "Две девятки, как в «Поле клуба».",
    ui_b8b309415b: "Блоки по 3 лунки",
    ui_9ef5e101ef: "Крупнее, без горизонтальной прокрутки.",
    ui_2604161591: "Крупная лента",
    ui_5eed24f577: "Крупные цифры, прокрутка внутри карточки.",
    ui_f3c8e4b47f: "Вертикальный список",
    ui_0036ec360b: "Одна лунка на строку, всё по порядку.",
    ui_93e97a4adc: "Плитки",
    ui_05112402c7: "Акцент на счёте каждой лунки.",
    ui_d08d823b89: "Вид завершённых раундов",
    ui_95b75ea948: "Как общий вид",
    ui_e978047dc5: "1 · Бланк клуба",
    ui_7926130a5d: "2 · Блоки по 3 лунки",
    ui_aeba52bfb2: "3 · Крупная лента",
    ui_e2f0805e35: "4 · Вертикальный список",
    ui_d1354fcd52: "5 · Плитки",
    ui_4ba0cd97dc: "Отдельное оформление не меняет карточки активных раундов. Итоги завершённых раундов всегда видны сверху, лунки раскрываются по нажатию.",
    ui_4632084292: "Применить для всех",
    ui_abf5591727: "Вернуть предыдущий",
    ui_4e42078f83: "Оба вида сохраняются вместе. «Вернуть предыдущий» восстановит предыдущую пару настроек для всех игроков.",
    ui_bf858b74a1: "Предпросмотр для телефона",
    ui_4ab35c6031: "Демонстрационные данные · ширина до 390 px. Палочки — удары форы; красные — отдаваемые удары. «—» означает, что счёт ещё не введён. Несовпадение с маркером подсвечивается.",
    ui_f31c927b94: "Демонстрационный раунд",
    ui_6fe17b125b: "1 игрок",
    ui_6c8ca669b6: "2 игрока",
    ui_8d6dfcf06e: "4 игрока",
    ui_a0e5860a63: "Лунки",
    ui_306270531f: "18 лунок",
    ui_8ad6f5ac21: "9 лунок",
    ui_ca285db3dd: "Состояние",
    ui_be6881d53f: "Активный",
    ui_08611623e4: "Завершённый",
    ui_274b9850af: "Карточки на вводе счёта",
    ui_07b10af87d: "для всех",
    ui_c5bfa629ee: "Турнирный ввод счёта",
    ui_c1476781c7: "Элементы турнирного экрана",
    ui_54990f6075: "Порядок основных блоков",
    ui_38dd3df1fb: "Применить для всех турниров",
    ui_80e951569d: "Использовать настройки обычного раунда",
    ui_6dfeded55b: "Краткий предпросмотр",
    ui_31d879f14c: "Экран ввода счёта — гибкие настройки",
    ui_6a5e9bae78: "Вид экрана ввода — 10 вариантов",
    ui_2c1fc844a6: "Акцент",
    ui_79e251f781: "Размер цифр счёта",
    ui_01059180ff: "Элементы экрана ввода",
    ui_ad357c2171: "Применить для всех игроков",
    ui_f904239d48: "Сбросить к настройкам по умолчанию",
    ui_a5a61148ad: "— все —",
    ui_2e25784bee: "🔴 Активный",
    ui_f38626436a: "⏳ Запланированный",
    ui_9d95526c14: "✅ Завершённый",
    ui_0d60c3c52a: "Загрузка раундов…",
    ui_89bd355ac1: "Журнал действий со счётом",
    ui_9cb2510ad8: "ФИО или ID игрока",
    ui_1ba816fbaa: "Дата подтверждения",
    ui_d9132c1651: "Все 30 дней",
    ui_c2ddbf6168: "Ошибки клиентов",
    ui_8965271d3c: "Очистить",
    ui_2913d18a6c: "Журнал гандикапов",
    ui_7deb244ce4: "Игрок или кто обновил",
    ui_66d6d374ce: "Сортировка",
    ui_78df4874e9: "Сначала отстающие",
    ui_98e7d488b3: "По времени старта",
    ui_89a28116ec: "По текущей лунке",
    ui_638f8008a1: "Проверка…",
    ui_83553fb558: "Обновить статус",
    ui_c432469e67: "Компоновка страницы",
    ui_1fb247e9b6: "Карточки клуба — по умолчанию",
    ui_c038d4521f: "Лента стартов",
    ui_5abae0a639: "Компактный обзор",
    ui_60759e83ad: "Видимые элементы",
    ui_7b51a77806: "Порядок разделов каталога",
    ui_cba24a2554: "Применить страницу для всех",
    ui_8f2cb9764e: "Сбросить к умолчанию",
    ui_163a76ac41: "Открыть страницу турниров",
    ui_9ce56ee20f: "Создать игрока",
    ui_50c46937d9: "Имя и фамилия",
    ui_3019fcbf07: "Email (опционально)",
    ui_56b3cd42a3: "Точный HCP",
    ui_3ae687a699: "👨 Мужчина",
    ui_b1759eaca5: "👩 Девушка",
    ui_ebd4563f5a: "Роль",
    ui_6c7719973e: "Администратор",
    ui_8eeba5c915: "Удалить всех игроков",
    ui_ff1489805d: "Экспорт игроков в Excel",
    ui_5b297215a0: "Скачать шаблон таблицы",
    ui_1da7e9372e: "Имя",
    ui_353eafa3bb: "Фамилия",
    ui_d45e798e71: "Точный гандикап",
    ui_d06ce0270e: "Импорт игроков из Excel",
    ui_095183c100: "Выберите файл Excel",
    ui_be6156b8e4: "Найти",
    ui_826b2ede80: "Проверка гандикапа из таблицы Excel",
    ui_63885170ec: "Скачать шаблон",
    ui_b4d30cae52: "Сохранить",
    ui_69758cbb1b: "Проверить имена игроков",
    ui_5d2f8a5ca7: "Синхронизация гандикапов игроков",
    ui_af2c59669e: "Кого синхронизировать",
    ui_694548f944: "Всех игроков",
    ui_cae7d870b1: "Не найденных в прошлый раз",
    ui_1b3f5ff442: "Новых (без HCP / без прошлой синхронизации)",
    ui_2c22282914: "С устаревшими данными (старше 30 дней)",
    ui_4633a736fe: "Требующих ручного выбора",
    ui_8638145363: "Синхронизировать гандикапы",
    ui_3396400da0: "Остановить",
    ui_edf877bf49: "Настройки подключения (прокси к hcp.rusgolf.ru)",
    ui_f8649416b7: "Пример:",
    ui_fe3869f69d: "Свой прокси (необязательно)",
    ui_e5b6702ec7: "Предпросмотр:",
    ui_236d32f967: "1 · Смешанный (все вместе)",
    ui_9d90e71528: "2 · По полу (вкладки)",
    ui_68e05fd372: "3 · Раздельные таблицы",
    ui_119652e33e: "1 · Смешанный",
    ui_fb5cd66197: "2 · По полу",
    ui_f57daa47b9: "3 · Раздельные",
    ui_897c84ceb9: "Показывать группы: включено",
    ui_d8a8a12686: "Вид списка участников:",
    ui_45a32387c7: "2 · Карточки",
    ui_3ed9a1a8ec: "3 · Компактные строки",
    ui_ef33d34e09: "4 · Короткая таблица",
    ui_a914ec19c9: "1 · Подиум",
    ui_0e40d2c698: "2 · Витрина",
    ui_05bb8b7a66: "3 · Строки",
    ui_f6e44f0aa7: "4 · Тёмный",
    ui_bd4c538c77: "5 · Мини",
    ui_5c41619935: "Архив оформления · PR 1–187",
    ui_9befdd5b37: "История дизайна",
    ui_c3418ec73a: "Реконструкция, не архив продакшена.",
    ui_2449e9a501: "Версия сайта:",
    ui_93ad246ba5: "Все форматы",
    ui_f5adc4edc2: "Ввод счёта",
    ui_720b952962: "Выбор числа",
    ui_60940bd864: "Плюс / минус",
    ui_37badbe057: "Уменьшить счёт",
    ui_e45cf03864: "Увеличить счёт",
    ui_54121f46af: "Счёт",
    ui_b0e6eca51b: "Нет соединения. Вернитесь к карточке, чтобы проверить состояние сохранения счёта. После восстановления сети проверьте отправку результатов.",
    ui_1f0e24193d: "Пестово · Стартовый протокол",
    ui_5ffd06c6d9: "← Админка",
    ui_b326e2ccc9: "📐 QR-карточки:",
    ui_12da0d1a9f: "1 игрок — 1 карточка",
    ui_cfef57bde3: "2 игрока — 1 карточка (по вертикали)",
    ui_f35eb2049b: "4 игрока — 1 карточка (2×2)",
    ui_d31f327693: "QR заново",
    ui_03061be853: "Документ:",
    ui_2bd8f9ea51: "QR-карточки",
    ui_ec9bb75920: "Стартовый лист",
    ui_e922cbb358: "Печать",
    ui_e27b6a1649: "Загрузка протокола…",
    ui_54065e54bc: "⚠️ Протокол не найден",
    ui_a2bea1f4c8: "Проверьте ссылку или вернитесь в админку.",
    ui_a10539f7f6: "← Вернуться в админ-панель",
    ui_325a1d2269: "Stroke Play — все показатели",
    ui_d6e81b3942: "Gross (без HCP)",
    ui_93efc37d4c: "Net (с HCP)",
    ui_08ff4e3814: "Мой счёт: —",
    ui_be83f247cd: "Счёт игрока: —",
    ui_65530fd463: "Пауза",
    ui_1b19144ee0: "Турниры и результаты",
    ui_106957f5af: "Загрузка турниров…",
    ui_958ca6ecb7: "Активный турнир",
    ui_c115a87773: "Лидерборд обновляется автоматически",
    ui_e4c1a21426: "Предстоящие старты",
    ui_c94979019a: "Прошедшие турниры",
    ui_b2bbe98857: "Открыть меню",
    ui_ad7cd87bea: "Поиск по названию",
    brand_name: "Пестово",
    nav_home: "Главная",
    nav_round: "Играть",
    nav_leaderboard: "Результаты",
    go_home: "На главную",
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
    footer_profile_login: "Войти в профиль",
    footer_profile: "Мой профиль",
    footer_club: "© 2024 Пестово",
    tab_design: "Оформление клуба",
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
    sec_now_playing: "Сейчас на поле",
    sec_active_tournament: "Активный турнир",
    sec_my_active: "Мои активные раунды",
    continue_round: "Продолжить игру",
    sec_club_stats: "Клуб в цифрах",
    sec_course_card: "Поле клуба",
    sec_recent_results: "Последние результаты",
    all_rounds: "Все раунды",
    all_view: "Смотреть все",
    all_tournaments: "Все турниры",
    no_active_players: "Сейчас никто не играет",
    // v1.129.0 — продуктовый UX-слой: карточки live, фильтры, шаги, сеть
    pv_live_now: "LIVE",
    pv_st_scheduled: "Скоро",
    pv_st_finishing: "Финиш",
    pv_st_done: "Завершён",
    pv_to_par: "к пару",
    pv_to_par_aria: "Счёт относительно пара",
    pv_progress_aria: "Пройдено лунок",
    pv_filter_all: "Все",
    pv_filter_mine: "Мои раунды",
    pv_filter_live: "Live",
    pv_filter_empty: "По этому фильтру сейчас никого нет.",
    pv_filter_reset: "Показать все",
    pv_round_birdies: "Берди в раунде",
    pv_round_eagles: "Иглы в раунде",
    // Плитки «Клуб в цифрах» (16 штук, без сводки и раскрытия).
    st_total_rounds: "Всего раундов",
    st_active_rounds: "Сейчас играют",
    st_completed_rounds: "Завершено",
    st_players: "Игроков",
    st_best_gross: "Лучший Gross (18 лунок)",
    st_avg_gross: "Средний Gross (18 лунок)",
    st_best_topar: "Лучший счёт к пару",
    st_avg_hole: "Средний счёт на лунку",
    st_birdies: "Birdies",
    st_eagles: "Eagles",
    st_pars: "Pars",
    st_bogeys: "Bogeys",
    st_doubles: "Двойной боги и хуже",
    st_holes_played: "Лунок сыграно",
    st_players_per_round: "Игроков в раунде",
    st_rounds_30d: "Раундов за 30 дней",
    pv_lb_sort: "Сортировка по столбцу",
    pv_lb_mine: "Мой раунд",
    pv_lb_live: "Live",
    pv_lb_done: "Завершённые",
    pv_filter_group: "Фильтр раундов",
    lb_sort_topar: "Счёт к пару",
    lb_sort_gross: "Gross",
    lb_sort_stbl: "Stableford",
    lb_sort_name: "Имя",
    pv_steps_aria: "Шаги создания раунда",
    pv_recent_players: "Недавние игроки",
    pv_err_name: "Укажите имя игрока",
    pv_err_hcp: "Укажите точный гандикап",
    pv_ready: "Готово к старту",
    pv_not_ready: "Заполните имена игроков",
    pv_players_count: "Игроков",
    pv_main_nav: "Основная навигация",
    pv_skip_content: "К содержимому",
    pv_offline_title: "Нет сети",
    pv_offline_text: "Нет сети. Счёт сохранится на этом устройстве и отправится, когда связь вернётся.",
    pv_offline_retry: "Повторить",
    pv_synced: "Счёт отправлен",
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
    srv_delivery_title: "Доставка вызовов во время раунда",
    srv_delivery_sub: "Во время раунда вызов судьи или маршала уходит в Telegram и ВКонтакте. Кто именно его отправляет, выбирается ниже: браузер игрока (Cloud Functions не нужны) или сервер. Дублей не будет ни в одном из режимов: второй отправитель молчит.",
    srv_delivery_mode_label: "Кто отправляет вызовы",
    srv_delivery_mode_client: "Браузер игрока — Cloud Functions не нужны",
    srv_delivery_mode_server: "Сервер — Cloud Function onAlertCreated",
    srv_delivery_mode_client_note: "Сообщение отправляет тот, кто нажал кнопку: вызов уходит сразу, без ожидания сервера и без тарифа Blaze. Нужен один деплой правил базы: <code>firebase deploy --only database</code>.",
    srv_delivery_mode_server_note: "Сообщение отправляет Cloud Function <code>onAlertCreated</code>: нужны задеплоенные функции (<code>cd functions &amp;&amp; npm i &amp;&amp; firebase deploy --only functions</code>) и тариф с Cloud Functions. Браузер игрока при этом молчит.",
    srv_delivery_mode_saved: "Режим доставки сохранён",
    srv_delivery_mode_failed: "Не удалось сохранить режим доставки",
    srv_delivery_client_warn: '<i class="fas fa-triangle-exclamation"></i> В режиме «Браузер» токен бота и ключ ВКонтакте читаются из базы любым вошедшим, включая анонимную сессию по QR-коду: иначе браузер не смог бы отправить сообщение. Компенсация — отдельный бот только для уведомлений, добавленный лишь в группу судей, и ключ сообщества с правом «Сообщения». Такой токен не даёт доступа к данным клуба, но написать в судейский чат с его помощью можно. Токены не сохраняются на устройстве и не выводятся в консоль; режим «Сервер» полностью убирает их из браузера.',
    srv_delivery_test: "Проверить серверную доставку",
    srv_delivery_test_hint: "Кнопка нужна только в режиме «Сервер»: она прогоняет путь Cloud Function. В режиме «Браузер» настоящий вызов отправляют кнопки «Проверить Группу», «Проверить Канал» и «Проверить отправку в ВК» ниже — они идут тем же путём.",
    srv_delivery_hint: "Статус доставки каждого настоящего вызова виден в списке выше.",
    vk_delivery_note: '<i class="fas fa-shield-halved"></i> В режиме «Браузер» (по умолчанию) вызовы судьи и маршала во время раунда отправляет браузер игрока тем же способом, что и кнопка «Проверить отправку в ВК» — JSONP, VK API 5.199. Поэтому в CSP хостинга разрешён <code>script-src https://api.vk.com</code>. В режиме «Сервер» токен сообщества браузеру не виден: отправляет Cloud Function (VK API 5.131, параметры в теле запроса в формате x-www-form-urlencoded).',
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
    page_sub_live: "Одна форма создания и один экран ввода счёта для одиночного и группового раунда — игроков добавляет кнопка «Добавить игрока»",
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
    refresh_hcp_from_rusgolf: "Обновить гандикап из RUSGOLF",
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
    score_pad_par: "Пар",
    field_more: "Вызов судьи и маршала",
    undo_last_hole: "Отменить лунку",
    large_ui_btn: "Крупно",
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
    filters_search_toggle: "Поиск и фильтры",
    filters_only: "Фильтры и сортировка",
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
    solo_sub: "Пестово",
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
    auth_tab_login: "Вход",
    continue_guest: "Продолжить как гость",
    tab_rounds: "Раунды",
    tab_alerts: "Вызовы 🚨",
    tab_groups: "Группы сейчас ⏱️",
    admin_group_ops: "Смена",
    admin_group_tn: "Турниры",
    admin_group_people: "Игроки",
    admin_group_look: "Оформление",
    admin_group_system: "Система",
    tab_scores_edit: "Правка счёта",
    tab_scoreaudit: "Журнал счёта 🕒",
    tab_hcplog: "Журнал гандикапов 📈",
    tab_scorecards: "Результаты",
    tab_entrycards: "Карточки на вводе",
    tab_scoreentry_screen: "Экран игры",
    tab_tncards: "Турнирный ввод",
    tab_players: "Игроки и роли",
    tab_data: "Данные",
    tab_importexport: "Импорт/Экспорт 📊",
    tab_rusgolf: "RUSGOLF 🇷🇺",
    imp_exp_title: "Импорт и экспорт игроков (Excel)",
    imp_exp_sub: "Выгружайте список игроков в таблицу Excel и импортируйте игроков обратно: имя, фамилия и точный гандикап.",
    rg_title: "Проверка гандикапа — база АГР России",
    rg_sub: "Поиск точного гандикапа (HI) игрока в официальной базе Ассоциации гольфа России (hcp.rusgolf.ru) с возможностью добавить игрока к себе на сайт.",
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
    tn_lb_variant_title: "Вид лидерборда турнира (страница «Турниры»)",
    tn_lb_variant_sub: "Выберите один из 5 вариантов отображения live-лидерборда турнира. Настройка выбирается только админом и применяется для всех участников на странице «Турниры».",
    tn_lb_variant_1: "1 · Классика (таблица)",
    tn_lb_variant_2: "2 · Компактный",
    tn_lb_variant_3: "3 · Карточки",
    tn_lb_variant_4: "4 · Детальный",
    tn_lb_variant_5: "5 · Live-лента",
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
    tournaments_display_title: "Настройка страницы «Турниры»",
    tournaments_display_sub: "Настройте вид и порядок элементов для всех участников клуба.",
    tab_tn_manager: "Турниры 🏆",
    tab_tournaments_view: "Турниры: вид 👁",
    handicap_display_title: "Отображение страницы «Гандикапы»",
    handicap_display_sub: "Выберите один из трёх вариантов оформления калькулятора и таблиц гандикапов. Настройка применяется для всех пользователей.",
    handicap_display_variant_1: "1 · Стандарт",
    handicap_display_variant_2: "2 · Компактный",
    handicap_display_variant_3: "3 · Витрина",
    all_players_joined: "Все игроки уже вошли в раунд",
    tab_broadcasts: "Анонсы 📢",
    delete_all_rounds: "Удалить все раунды",
    delete_all_data: "Удалить всех игроков и раунды",
    delete_all_data_sub: "Полностью удаляет всех игроков и все раунды. Данные исчезнут из всех списков, статистики и автоподбора и не появятся снова. Аккаунт администратора сохраняется.",
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
    ui_bc997c1edb: "Club management",
    ui_31e9780267: "Admin sections",
    ui_bcef39ebdf: "Peter Smith",
    ui_798ff83284: "Last name First name",
    ui_9626d7ac8c: "e.g. John Smith",
    ui_c5c1c59988: "13.0 or +2.4",
    ui_9dc027291b: "🔍 Search: name, email, phone…",
    ui_d8abc3263c: "e.g. John Smith or RU000732",
    ui_32541c0ddf: `Lyolya = Olga
Catalina = Natalia`,
    ui_30e0a41688: "e.g. 42 or design",
    ui_e01f87de68: "PR history pages",
    ui_372a391df1: "Expand scorecard",
    ui_cb8c5d52e1: "Decrease score",
    ui_ac0d11c0a3: "Increase score",
    ui_68660731cc: "Decrease marked player score",
    ui_3470822c60: "Increase marked player score",
    ui_0e32051f71: "Pause / Resume",
    ui_1ba5263bd8: "Design templates",
    ui_3c4ef14e00: "The current design plus five alternative templates for the whole site, individual pages and individual sections",
    ui_b9f1fffef4: "How it works",
    ui_651c92f849: "Each template changes the full appearance: colors, backgrounds, borders, shadows, typography, buttons, badges, tables, header and footer. Compare the differences below. The selection is saved in",
    ui_881d791541: "Admin panel → Design 🎨",
    ui_d4576e5a46: "and applies to all players.",
    ui_613bd6e0c9: "You can",
    ui_4b5926bddb: "combine templates",
    ui_0a6792dd1e: ": select a base template, then override individual pages or sections such as the header, cards, buttons, tables, badges and footer. The builder is at the bottom of this page.",
    ui_cf09d75992: "To preview any page with a specific template, append to its URL",
    ui_37d7a2cb26: "(for example,",
    ui_40ea39625c: "). Nothing is saved.",
    ui_33aa9be74a: "Complete templates",
    ui_83a0cd9f0a: "The same sample layout in six designs.",
    ui_7911dda73e: "Section-by-section comparison",
    ui_c2b480d644: "Each section is shown separately so you can compare the differences.",
    ui_70dbdf297a: "Design comparison matrix",
    ui_4568b826cb: "Builder: combine design templates",
    ui_1ccc4ef533: "Select a base template, then choose a template for each section. The result appears immediately on the right. Save a site-wide design in the admin panel.",
    ui_f6408ec13b: "Your design",
    ui_ea58bb0bc6: "Next",
    ui_77b6544cd7: "Open admin panel",
    ui_ad94907f64: "Home",
    ui_b60aec20f0: "Handicap verification badge: choose a style",
    ui_3d8a25781e: "A green check mark",
    ui_3ea256e8e5: "appears when a player's handicap has been",
    ui_ecb734a856: "synchronized and updated",
    ui_4e3aac4cb1: ": through the RGA (RUSGOLF) database, an Excel import or a manual admin update. Beside it is the",
    ui_5612b79e93: "last update date",
    ui_d932268240: "and the source appears on hover (always visible in the profile). Players without a synchronized handicap",
    ui_3c86ea8bd6: "do not receive a check mark",
    ui_64ddfe38d8: "(see the Ivan Kuznetsov example in each style).",
    ui_ba17dc61c0: "The style appears on the",
    ui_e2a152f678: "Players tab",
    ui_2b1f8a0919: ", in the",
    ui_7e38742eb5: "player profile",
    ui_4370f56467: "and in the",
    ui_14b9794b43: "admin panel",
    ui_5fbd949349: "(Players and roles). Below are examples using the site's actual markup. The",
    ui_da950719bc: "Choose this style",
    ui_5d732dd44b: "button enables it",
    ui_12d296173f: "in this browser",
    ui_8af581ead5: "for preview.",
    ui_f7b3462438: "The global selection for all players",
    ui_0974cf527b: "is in the",
    ui_3e23e0c898: "Admin panel",
    ui_a64a2db415: ", under",
    ui_7c6da828ce: "Data → Handicap badge style",
    ui_63669f17cf: ": saved in the cloud and applied to all devices immediately (reload this page to update).",
    ui_04589d0f49: "Compact check mark",
    ui_7f8a03d69e: "— minimal",
    ui_1c6adb3f41: "A small green check mark",
    ui_90641a8e61: "and update date (DD.MM.YY) follow the handicap. The status stays visible without clutter. Profiles show the full date and source.",
    ui_8e6ae01d92: "Players tab",
    ui_d2151bdbf0: "Player profile",
    ui_ef4e961f6a: "Choose this style",
    ui_5136e92f25: "Glowing pill badge",
    ui_8a1f20cd03: "— highly visible",
    ui_1d0841a615: "A green pill labelled",
    ui_0ad04468e5: "updated",
    ui_622f083bfd: "with a subtle glow beside the handicap. Profiles show a larger Handicap synchronized banner with the full update date and source (RUSGOLF / Excel / manual).",
    ui_fdbcebcc6c: "Verified avatar",
    ui_7f81d13850: "— social profile style",
    ui_bc6cc166b2: "A green verification check appears on the avatar. The update date is shown next to the handicap in the list and profile, making status easy to recognize.",
    ui_cc8aaf7006: "Open Players",
    ui_af947ab16f: "Examples use demo data. On the site, the check mark appears automatically for players whose handicaps have already been synchronized and have an update date.",
    ui_d827cf9eaa: "© Pestovo — handicap badge style preview",
    ui_43f0c259b7: "Scorecards on the score-entry page (setup-round.html). One player uses a hole-by-hole scorecard; multiple players use a shared scorecard. Choose layout, size and elements for each; tournament entry can have a separate layout.",
    ui_b939086787: "This tab affects score-entry screens only. Home, leaderboard and history cards are configured under Scorecard appearance.",
    ui_ae1ebf647f: "Customize the screen opened by a starting-sheet QR code. These settings apply to all tournaments and players; regular score-entry settings are used where no tournament override is set.",
    ui_e4404ae752: "Score entry and the My score panel remain enabled. To restore shared settings, select Use regular-round settings.",
    ui_828ac5a2bb: "Checked elements appear on tournament QR score-entry screens.",
    ui_bd01c82261: "Change the order of information, hole navigation and score input.",
    ui_39659830f3: "Tournament settings are saved separately and take effect on all devices.",
    ui_36a643d966: "One shared design without saved legacy variants. Configure element visibility and section order for all players, solo and group rounds.",
    ui_37b74d9a02: "Score entry, saving and the My score panel are mandatory. Tournament score entry provides separate overrides for QR rounds.",
    ui_fd846f05e5: "Choose a layout for all players, solo and group rounds, on mobile and desktop. It takes effect after saving.",
    ui_c06456492c: "Accent for the active hole, score border, plus button and confirmation button. Works with every layout.",
    ui_25f2120510: "Choose how large entered scores appear. Extra large is useful in bright sunlight.",
    ui_0af9ddb0c8: "Top-to-bottom order. Move buttons are touch-friendly.",
    ui_a832c196d4: "Changes are saved globally. Screens that are already open update automatically.",
    ui_914b6f179a: "Server-recorded actions from the last 30 days. Unsigned QR access is marked separately: the operator's identity is not verified. Times use your device's time zone.",
    ui_f8c420259d: "Errors reported automatically by player devices (",
    ui_2b31c31735: "→ node",
    ui_6b762724a8: "). Up to 20 messages per session and 3 repeats of the same error per device; grouped by message. Database rules must include the node",
    ui_e7ab4c0825: "Who updated a handicap and when: RUSGOLF lookup during round setup (using the entered name), manual admin changes, RGA synchronization and Excel imports. Previous and new values are shown.",
    ui_0429aea676: "How to obtain a community token",
    ui_c30c05cc7d: "Go to",
    ui_9eaa725bc8: "Community management",
    ui_9ff04885fb: "API access",
    ui_58207ae860: "Access keys",
    ui_fad2f82e70: "Select",
    ui_45cc94ebe8: "Create key",
    ui_df82e5bc7c: ", then select permissions:",
    ui_b28d2cd212: "Messages",
    ui_c9b591fe97: "Copy the generated key (",
    ui_57a22a6638: ") into the field below",
    ui_9123450c26: "Conversation Peer ID",
    ui_8457bff7f2: ": open the VK conversation → the link looks like",
    ui_85da1e3647: "User Peer ID",
    ui_12fcfb70ef: ": numeric ID from the VK profile",
    ui_e695053fe0: "Add the community to the conversation and",
    ui_0dd6b37fa5: "allow the bot to send messages",
    ui_56e22910e6: "in conversation settings",
    ui_4bdac71815: "For conversations: 2000000000 + chat number. For direct messages: user ID.",
    ui_fade085486: "Recipients: all club players",
    ui_aa8da22e16: "Background push notifications (app closed)",
    ui_c6ba963938: "Announcements and referee calls can arrive even when the PWA is closed. A one-time Cloud Function deployment is required (see",
    ui_eead37caf8: "and",
    ui_f0f83935aa: "vapidSetup function URL (if the region is not us-central1)",
    ui_dca5579aa0: "Create/check VAPID keys",
    ui_821c616097: "Tournament page settings",
    ui_3954e489e4: "Layout, section order and visibility are saved for everyone. Legacy numeric variants are removed; responsive cards are the default.",
    ui_18f791f55a: "Reorder the live tournament, upcoming starts and archive.",
    ui_979c1e906b: "Saved settings apply to the tournament catalog and detail page.",
    ui_b2a1629832: "Add a player to the club system (name, handicap index and gender). The starting-sheet group determines the player's tee.",
    ui_e15533e8fb: "Permanently delete all players: the list will become empty. Their rounds, history and tournament registrations will also be deleted.",
    ui_1eb1a40bf2: "📋 Spreadsheet columns:",
    ui_4273fc6f1a: "(for example",
    ui_bcacbff7a5: "or",
    ui_342a931cc4: "). You can optionally add a column",
    ui_c79219bb6a: "(male/female).",
    ui_afcac97610: "Upload an .xlsx, .xls or .csv file to add players. Duplicates are matched by first and last name; their handicap index can be updated.",
    ui_b3a2803940: ".xlsx, .xls or .csv · columns: First name, Last name, Handicap index",
    ui_545f879d01: "Upload an Excel spreadsheet of players (columns",
    ui_546a52b7e1: "). The system searches the RGA database for each player and lists matches. Select the correct entries and add them with one click.",
    ui_20212f11a2: ".xlsx, .xls or .csv · columns: First name, Last name",
    ui_d92610877f: "Name variants — Natasha = Natalya",
    ui_4934470186: "A player's name on this site may be a short or alternative form (",
    ui_97031dc24d: "Natasha",
    ui_842b195e2f: "Natalia",
    ui_16a747fbb9: "), while the RGA database uses a full name. Choose how to match names during handicap lookup and synchronization. Name dictionary:",
    ui_983582571f: "Automatically apply name-variant matches",
    ui_5593de071b: "(disabled by default).",
    ui_e3c4ef05e1: "When unchecked, variant matches such as Natasha = Natalya require manual selection. Exact first- and last-name matches always update the handicap, regardless of this setting.",
    ui_2f10dc25cf: "Custom name variants (option 3), one per line, for example:",
    ui_cc49a355ae: "Lyolya = Olga",
    ui_53acb9a7ee: "Checks handicap indexes of registered players, guests and round participants in the RGA database. Matches by",
    ui_cfcfdee185: "Last name + First name",
    ui_e7b7bed99b: "and by",
    ui_e3849248aa: "First name + Last name",
    ui_eaef777619: ", and by name variants (Natasha → Natalya, Natalia; see Name variants above). An unambiguous match updates profiles, rounds, history and tournaments. Results are grouped as updated / current / not found / needs selection.",
    ui_cdc2875aeb: "The RGA website does not allow direct browser requests, so a chain of public CORS proxies is used. If none are available, provide a custom proxy template where",
    ui_3d04a4325f: "is replaced with the request URL.",
    ui_1ba85ca4f6: "On-screen player and group cards are configured under Scorecard appearance.",
    ui_79fc3f0dc8: "Table: place, player, holes, gross, relative to par, net, Stableford",
    ui_a3082d359e: "Place, player, holes and relative to par only",
    ui_b35f24ac18: "One card per player with large numbers",
    ui_0af1e08619: "All fields: handicap, gross, net, Stableford, group and tee",
    ui_dee1935da4: "Live feed with indicators and animation",
    ui_a83394b44d: "Tournament leaderboard by gender (three layouts)",
    ui_b89fb1b0a2: "Men and women can compete separately. The administrator selects one of three layouts for everyone.",
    ui_9cbddd9bbf: "One combined table with overall places",
    ui_207283cc33: "All / Men / Women tabs, with places calculated separately for each gender",
    ui_735a085876: "Separate Men's and Women's tables, each with its own standings",
    ui_118f80f98e: "Groups and participants on the Tournaments page",
    ui_96800570ef: "The live tournament opens on its live leaderboard. Groups (divisions) are visible to everyone by default; hide them here if needed. Four participant/group layouts are available below. Settings apply to everyone.",
    ui_596c7029ad: "Home live-tournament block (five layouts)",
    ui_72830e585c: "Choose one of five home live-tournament layouts showing the top three. Only administrators can choose; the setting applies to everyone on mobile and desktop.",
    ui_59de0e7de6: "Round creation uses one compact flow for all players. Stored legacy options 1–5 automatically open this flow; round data is unchanged.",
    ui_48ff68a668: "Home and score-entry screens for each PR. Select an image to enlarge it and browse nearby PRs.",
    ui_97c465622a: "Captured from PR commits using identical demo data in a 430 × 1100 px mobile viewport. No real players or results are used.",
    ui_4aa4d75229: "How to read this archive",
    ui_0370f1fefb: "Merged PRs show the post-merge state; closed unmerged PRs show the last branch version. PR numbers do not necessarily follow release order: also check the date and commit.",
    ui_5101f428d8: "All PRs compare index.html and scorer.html. Historical database design preferences are not restored; code defaults are used. External fonts and icons use local equivalents, so some symbols may differ. External services are disabled. These are first-screen captures, not full-page captures. If historical JavaScript cannot run, a labelled static HTML reconstruction is shown.",
    ui_d5ff61a4fa: "PRs that did not change the appearance may have identical images. This gallery does not apply settings or change data. Images contain demo data only and are served as static site resources.",
    ui_d780fc28a8: "PR number, title or commit",
    ui_af1034f05e: "PR range",
    ui_0142ff8eb9: "All · #1–187",
    ui_93ee53cdb5: "New · #101–187",
    ui_c241f6db67: "Screenshots",
    ui_96c52b09d0: "Both screens",
    ui_fcfc354fd2: "Home only",
    ui_efa324b62e: "Score entry only",
    ui_36c690d37b: "PR status",
    ui_0fe8ec7f51: "All PRs",
    ui_f6b34ec37f: "Merged only",
    ui_953c2969d9: "Closed without merge",
    ui_f7ca1ccfc6: "Order",
    ui_3bd2dc0215: "#1 to #187",
    ui_6236dd5e17: "#187 to #1",
    ui_05336bbf2e: "Loading archive…",
    ui_a7a4033657: "Close",
    ui_1d471cdfa4: "Other screen",
    ui_98cf8011c5: "Reconstruction · demo data · 430 × 1100 px",
    ui_e07a01d59a: "Open original",
    ui_9ce8dc7534: "PR on GitHub ↗",
    ui_f4635472cd: "Verify access / Sign in",
    ui_a726a4d98e: "Notifications for all players",
    ui_159f8996b8: "Checking settings…",
    ui_db491ef503: "Loading…",
    ui_738bc2a3c4: "PR history · 1–187",
    ui_74fc14c766: "Integrations",
    ui_6a4154a7b4: "Scorecard appearance",
    ui_1b9445b0ba: "One appearance for all players: home, live and completed rounds, leaderboards, tournaments and history. Distances are hidden; tees appear next to names. Print and PNG layouts are unchanged.",
    ui_70cbac7057: "For all players",
    ui_ea774426cf: "Default scorecard layout",
    ui_f6bb92d043: "Five layouts for the same scorecard. Select one to update the preview below.",
    ui_c85201ffd9: "Club scorecard",
    ui_80945904b8: "Front and back nine, like the club course card.",
    ui_b8b309415b: "Three-hole blocks",
    ui_9ef5e101ef: "Larger scores, no horizontal scrolling.",
    ui_2604161591: "Large strip",
    ui_5eed24f577: "Large numbers; scroll within the scorecard.",
    ui_f3c8e4b47f: "Vertical list",
    ui_0036ec360b: "One hole per row, in playing order.",
    ui_93e97a4adc: "Tiles",
    ui_05112402c7: "Focus on the score for each hole.",
    ui_d08d823b89: "Completed-round layout",
    ui_95b75ea948: "Use default layout",
    ui_e978047dc5: "1 · Club scorecard",
    ui_7926130a5d: "2 · Three-hole blocks",
    ui_aeba52bfb2: "3 · Large strip",
    ui_e2f0805e35: "4 · Vertical list",
    ui_d1354fcd52: "5 · Tiles",
    ui_4ba0cd97dc: "This setting does not affect live rounds. Completed-round totals remain visible at the top; tap to reveal the holes.",
    ui_4632084292: "Apply to everyone",
    ui_abf5591727: "Restore previous",
    ui_4e42078f83: "Both layouts are saved together. Restore previous restores the previous pair of settings for all players.",
    ui_bf858b74a1: "Mobile preview",
    ui_4ab35c6031: "Demo data · up to 390 px wide. Strokes indicate handicap allowances; red strokes are given back. A dash means no score has been entered. Marker disagreements are highlighted.",
    ui_f31c927b94: "Demo round",
    ui_6fe17b125b: "1 player",
    ui_6c8ca669b6: "2 players",
    ui_8d6dfcf06e: "4 players",
    ui_a0e5860a63: "Holes",
    ui_306270531f: "18 holes",
    ui_8ad6f5ac21: "9 holes",
    ui_ca285db3dd: "Status",
    ui_be6881d53f: "Active",
    ui_08611623e4: "Completed",
    ui_274b9850af: "Score-entry scorecards",
    ui_07b10af87d: "for everyone",
    ui_c5bfa629ee: "Tournament score entry",
    ui_c1476781c7: "Tournament screen elements",
    ui_54990f6075: "Main section order",
    ui_38dd3df1fb: "Apply to all tournaments",
    ui_80e951569d: "Use regular-round settings",
    ui_6dfeded55b: "Quick preview",
    ui_31d879f14c: "Score-entry screen settings",
    ui_6a5e9bae78: "Score-entry layout — 10 options",
    ui_2c1fc844a6: "Accent",
    ui_79e251f781: "Score number size",
    ui_01059180ff: "Score-entry screen elements",
    ui_ad357c2171: "Apply to all players",
    ui_f904239d48: "Reset to defaults",
    ui_a5a61148ad: "— all —",
    ui_2e25784bee: "🔴 Active",
    ui_f38626436a: "⏳ Scheduled",
    ui_9d95526c14: "✅ Completed",
    ui_0d60c3c52a: "Loading rounds…",
    ui_89bd355ac1: "Score audit log",
    ui_9cb2510ad8: "Player name or ID",
    ui_1ba816fbaa: "Confirmation date",
    ui_d9132c1651: "All 30 days",
    ui_c2ddbf6168: "Client errors",
    ui_8965271d3c: "Clear",
    ui_2913d18a6c: "Handicap history",
    ui_7deb244ce4: "Player or updated by",
    ui_66d6d374ce: "Sort order",
    ui_78df4874e9: "Behind schedule first",
    ui_98e7d488b3: "By start time",
    ui_89a28116ec: "By current hole",
    ui_638f8008a1: "Checking…",
    ui_83553fb558: "Refresh status",
    ui_c432469e67: "Page layout",
    ui_1fb247e9b6: "Club cards — default",
    ui_c038d4521f: "Starting times feed",
    ui_5abae0a639: "Compact overview",
    ui_60759e83ad: "Visible elements",
    ui_7b51a77806: "Catalog section order",
    ui_cba24a2554: "Apply page to everyone",
    ui_8f2cb9764e: "Reset to defaults",
    ui_163a76ac41: "Open tournaments",
    ui_9ce56ee20f: "Create player",
    ui_50c46937d9: "First and last name",
    ui_3019fcbf07: "Email (optional)",
    ui_56b3cd42a3: "Handicap index",
    ui_3ae687a699: "👨 Man",
    ui_b1759eaca5: "👩 Woman",
    ui_ebd4563f5a: "Role",
    ui_6c7719973e: "Administrator",
    ui_8eeba5c915: "Delete all players",
    ui_ff1489805d: "Export players to Excel",
    ui_5b297215a0: "Download spreadsheet template",
    ui_1da7e9372e: "First name",
    ui_353eafa3bb: "Last name",
    ui_d45e798e71: "Handicap index",
    ui_d06ce0270e: "Import players from Excel",
    ui_095183c100: "Choose Excel file",
    ui_be6156b8e4: "Find",
    ui_826b2ede80: "Check handicaps from a spreadsheet",
    ui_63885170ec: "Download template",
    ui_b4d30cae52: "Save",
    ui_69758cbb1b: "Check player names",
    ui_5d2f8a5ca7: "Player handicap synchronization",
    ui_af2c59669e: "Players to synchronize",
    ui_694548f944: "All players",
    ui_cae7d870b1: "Not found last time",
    ui_1b3f5ff442: "New (no handicap / not previously synchronized)",
    ui_2c22282914: "Outdated records (over 30 days old)",
    ui_4633a736fe: "Requiring manual selection",
    ui_8638145363: "Synchronize handicaps",
    ui_3396400da0: "Stop",
    ui_edf877bf49: "Connection settings (proxy for hcp.rusgolf.ru)",
    ui_f8649416b7: "Example:",
    ui_fe3869f69d: "Custom proxy (optional)",
    ui_e5b6702ec7: "Preview:",
    ui_236d32f967: "1 · Mixed (everyone)",
    ui_9d90e71528: "2 · By gender (tabs)",
    ui_68e05fd372: "3 · Separate tables",
    ui_119652e33e: "1 · Mixed",
    ui_fb5cd66197: "2 · By gender",
    ui_f57daa47b9: "3 · Separate",
    ui_897c84ceb9: "Show groups: enabled",
    ui_d8a8a12686: "Participant list layout:",
    ui_45a32387c7: "2 · Cards",
    ui_3ed9a1a8ec: "3 · Compact rows",
    ui_ef33d34e09: "4 · Short table",
    ui_a914ec19c9: "1 · Podium",
    ui_0e40d2c698: "2 · Showcase",
    ui_05bb8b7a66: "3 · Rows",
    ui_f6e44f0aa7: "4 · Dark",
    ui_bd4c538c77: "5 · Mini",
    ui_5c41619935: "Design archive · PR 1–187",
    ui_9befdd5b37: "Design history",
    ui_c3418ec73a: "Reconstruction, not production snapshots.",
    ui_2449e9a501: "Site version:",
    ui_93ad246ba5: "All formats",
    ui_f5adc4edc2: "Score input",
    ui_720b952962: "Number pad",
    ui_60940bd864: "Plus / minus",
    ui_37badbe057: "Decrease score",
    ui_e45cf03864: "Increase score",
    ui_54121f46af: "Score",
    ui_b0e6eca51b: "No connection. Return to your scorecard to check whether your score was saved. When you reconnect, check that your results have been sent.",
    ui_1f0e24193d: "Pestovo · Starting sheet",
    ui_5ffd06c6d9: "← Admin",
    ui_b326e2ccc9: "📐 QR cards:",
    ui_12da0d1a9f: "1 player per card",
    ui_cfef57bde3: "2 players per card (vertical)",
    ui_f35eb2049b: "4 players per card (2×2)",
    ui_d31f327693: "Regenerate QR codes",
    ui_03061be853: "Document:",
    ui_2bd8f9ea51: "QR cards",
    ui_ec9bb75920: "Starting sheet",
    ui_e922cbb358: "Print",
    ui_e27b6a1649: "Loading starting sheet…",
    ui_54065e54bc: "⚠️ Starting sheet not found",
    ui_a2bea1f4c8: "Check the link or return to the admin panel.",
    ui_a10539f7f6: "← Back to admin panel",
    ui_325a1d2269: "Stroke Play — all metrics",
    ui_d6e81b3942: "Gross (without handicap)",
    ui_93efc37d4c: "Net (with handicap)",
    ui_08ff4e3814: "My score: —",
    ui_be83f247cd: "Player score: —",
    ui_65530fd463: "Paused",
    ui_1b19144ee0: "Tournaments & results",
    ui_106957f5af: "Loading tournaments…",
    ui_958ca6ecb7: "Live tournament",
    ui_c115a87773: "Leaderboard updates automatically",
    ui_e4c1a21426: "Upcoming tournaments",
    ui_c94979019a: "Past tournaments",
    ui_b2bbe98857: "Open menu",
    ui_ad7cd87bea: "Search by name",
    brand_name: "Pestovo",
    nav_home: "Home",
    nav_round: "Play",
    nav_leaderboard: "Results",
    go_home: "Go to home page",
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
    footer_profile_login: "Sign in to profile",
    footer_profile: "My profile",
    footer_club: "© 2024 Pestovo",
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
    sec_now_playing: "Currently Playing",
    sec_active_tournament: "Active tournament",
    sec_my_active: "My Active Rounds",
    continue_round: "Continue Playing",
    sec_club_stats: "Club Statistics",
    sec_course_card: "Course Map",
    sec_recent_results: "Recent Results",
    all_rounds: "All Rounds",
    all_view: "View all",
    all_tournaments: "All tournaments",
    no_active_players: "No active players on course",
    // v1.129.0 — product UX layer: live cards, filters, steps, network
    pv_live_now: "LIVE",
    pv_st_scheduled: "Soon",
    pv_st_finishing: "Finishing",
    pv_st_done: "Completed",
    pv_to_par: "to par",
    pv_to_par_aria: "Score to par",
    pv_progress_aria: "Holes completed",
    pv_filter_all: "All",
    pv_filter_mine: "My rounds",
    pv_filter_live: "Live",
    pv_filter_empty: "No rounds match this filter.",
    pv_filter_reset: "Show all",
    pv_round_birdies: "Birdies in round",
    pv_round_eagles: "Eagles in round",
    st_total_rounds: "Total rounds",
    st_active_rounds: "Playing now",
    st_completed_rounds: "Completed",
    st_players: "Players",
    st_best_gross: "Best gross (18 holes)",
    st_avg_gross: "Average gross (18 holes)",
    st_best_topar: "Best score to par",
    st_avg_hole: "Average strokes per hole",
    st_birdies: "Birdies",
    st_eagles: "Eagles",
    st_pars: "Pars",
    st_bogeys: "Bogeys",
    st_doubles: "Double bogey or worse",
    st_holes_played: "Holes played",
    st_players_per_round: "Players per round",
    st_rounds_30d: "Rounds in 30 days",
    pv_lb_sort: "Sort by column",
    pv_lb_mine: "My round",
    pv_lb_live: "Live",
    pv_lb_done: "Completed",
    pv_filter_group: "Round filter",
    lb_sort_topar: "Score to par",
    lb_sort_gross: "Gross",
    lb_sort_stbl: "Stableford",
    lb_sort_name: "Name",
    pv_steps_aria: "Round setup steps",
    pv_recent_players: "Recent players",
    pv_err_name: "Enter the player name",
    pv_err_hcp: "Enter the exact handicap",
    pv_ready: "Ready to start",
    pv_not_ready: "Fill in the player names",
    pv_players_count: "Players",
    pv_main_nav: "Main navigation",
    pv_skip_content: "Skip to content",
    pv_offline_title: "Offline",
    pv_offline_text: "Offline. Scores are kept on this device and sent when the connection returns.",
    pv_offline_retry: "Retry",
    pv_synced: "Scores sent",
    course_card_sub: "18 Holes · Par 72 · All Tees (meters)",
    address_str: "📍 Pestovo, Mytishchi, Moscow Region",
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
    srv_delivery_title: "Round-time delivery",
    srv_delivery_sub: "During a round a referee or marshal call goes out to Telegram and VKontakte. Who sends it is chosen below: the player browser (no Cloud Functions required) or the server. Neither mode produces duplicates, because the other sender stays silent.",
    srv_delivery_mode_label: "Who sends the calls",
    srv_delivery_mode_client: "Player browser - no Cloud Functions required",
    srv_delivery_mode_server: "Server - Cloud Function onAlertCreated",
    srv_delivery_mode_client_note: "The person who pressed the button sends the message: the call goes out immediately, with no wait for a server and no Blaze plan. It needs one deploy of the database rules: <code>firebase deploy --only database</code>.",
    srv_delivery_mode_server_note: "The Cloud Function <code>onAlertCreated</code> sends the message: deployed functions are required (<code>cd functions &amp;&amp; npm i &amp;&amp; firebase deploy --only functions</code>) plus a plan that includes Cloud Functions. The player browser stays silent in this mode.",
    srv_delivery_mode_saved: "Delivery mode saved",
    srv_delivery_mode_failed: "Could not save the delivery mode",
    srv_delivery_client_warn: '<i class="fas fa-triangle-exclamation"></i> In Browser mode the bot token and the VK community key are readable from the database by any signed-in user, including an anonymous QR session: otherwise the browser could not send the message. The mitigation is a dedicated notification bot added only to the judges group, and a community key with the Messages permission. Such a token gives no access to club data, but it can be used to post into the judges chat. Tokens are never stored on the device and never printed to the console; Server mode removes them from the browser entirely.',
    srv_delivery_test: "Test server delivery",
    srv_delivery_test_hint: "This button is only needed in Server mode: it exercises the Cloud Function path. In Browser mode a real call is sent by the Test Group, Test Channel and Test VK Message buttons below - they follow the same path.",
    srv_delivery_hint: "The delivery status of every real call is shown in the list above.",
    vk_delivery_note: '<i class="fas fa-shield-halved"></i> In Browser mode (the default) referee and marshal calls during a round are sent by the player browser the same way as the Test VK Message button - JSONP, VK API 5.199. That is why the hosting CSP allows <code>script-src https://api.vk.com</code>. In Server mode the community token is never visible to the browser: the Cloud Function sends it (VK API 5.131, parameters as x-www-form-urlencoded in the request body).',
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
    page_sub_live: "One setup form and one score-entry screen for solo and group rounds — add players with the “Add Player” button",
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
    refresh_hcp_from_rusgolf: "Refresh handicap from RUSGOLF",
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
    score_pad_par: "Par",
    field_more: "Call referee or marshal",
    undo_last_hole: "Undo hole",
    large_ui_btn: "Large",
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
    filters_search_toggle: "Search & filters",
    filters_only: "Filters & sorting",
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
    solo_sub: "Pestovo",
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
    auth_tab_login: "Sign in",
    continue_guest: "Continue as Guest",
    tab_rounds: "Rounds",
    tab_alerts: "Alerts 🚨",
    tab_groups: "Groups now ⏱️",
    admin_group_ops: "On course",
    admin_group_tn: "Tournaments",
    admin_group_people: "Players",
    admin_group_look: "Appearance",
    admin_group_system: "System",
    tab_scores_edit: "Edit scores",
    tab_scoreaudit: "Score log 🕒",
    tab_hcplog: "Handicap log 📈",
    tab_scorecards: "Site scorecards",
    tab_entrycards: "Entry scorecards",
    tab_scoreentry_screen: "Player screen",
    tab_tncards: "Tournament entry",
    tab_players: "Players & Roles",
    tab_data: "Data",
    tab_importexport: "Import/Export 📊",
    tab_rusgolf: "RUSGOLF 🇷🇺",
    imp_exp_title: "Player Import & Export (Excel)",
    imp_exp_sub: "Export the player list to an Excel table and import players back: first name, last name and exact handicap.",
    rg_title: "Handicap Lookup — RGA Database",
    rg_sub: "Look up a player's exact Handicap Index (HI) in the official Russian Golf Association database (hcp.rusgolf.ru) and add players to your site.",
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
    tn_lb_variant_title: "Tournament leaderboard layout (Tournaments page)",
    tn_lb_variant_sub: "Choose one of 5 live leaderboard layouts. Only an admin can change it; the choice applies to every visitor of the Tournaments page.",
    tn_lb_variant_1: "1 · Classic (table)",
    tn_lb_variant_2: "2 · Compact",
    tn_lb_variant_3: "3 · Cards",
    tn_lb_variant_4: "4 · Detailed",
    tn_lb_variant_5: "5 · Live feed",
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
    tournaments_display_title: "Tournament page settings",
    tournaments_display_sub: "Configure layout, section order, and visible elements for all club members.",
    tab_tn_manager: "Tournaments 🏆",
    tab_tournaments_view: "Tournaments: layout 👁",
    handicap_display_title: "“Handicaps” page layout",
    handicap_display_sub: "Choose one of three handicap calculator and table layouts. The setting applies to all users.",
    handicap_display_variant_1: "1 · Standard",
    handicap_display_variant_2: "2 · Compact",
    handicap_display_variant_3: "3 · Showcase",
    all_players_joined: "All players have already joined the round",
    tab_broadcasts: "Announcements 📢",
    delete_all_rounds: "Delete All Rounds",
    delete_all_data: "Delete All Players & Rounds",
    delete_all_data_sub: "Permanently removes every player and every round. Data disappears from all lists, stats and autocomplete and will not reappear. Your admin account is kept.",
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
  m.ru && (m.ru.footer_club = "© " + e + " Пестово"), m.en && (m.en.footer_club = "© " + e + " Pestovo");
})();
function Y(e) {
  var a = typeof b < "u" && b ? b : "ru";
  try {
    if (m[a] && m[a][e] !== void 0)
      return m[a][e];
    if (m.ru && m.ru[e] !== void 0)
      return m.ru[e];
  } catch (r) {
    console.warn("[silent]", r);
  }
  return e;
}
function Pe() {
  b = b === "ru" ? "en" : "ru", typeof window < "u" && (window.currentLang = b), typeof localStorage < "u" && localStorage.setItem("pestovo_lang", b);
  try {
    document.documentElement.setAttribute("lang", b);
  } catch (i) {
    console.warn("[silent]", i);
  }
  if (x(), J(), typeof updateSunModeButtons == "function" && updateSunModeButtons(), typeof applyPlayerModes == "function" && applyPlayerModes(), typeof refreshOfficialCallBindings == "function" && refreshOfficialCallBindings(), typeof renderAdmGroups == "function" && renderAdmGroups(), typeof loadAdmRounds == "function" && typeof hasAdminPanelAccess == "function" && hasAdminPanelAccess()) {
    var e = document.getElementById("admin-content");
    e && !e.classList.contains("hidden") && loadAdmRounds();
  }
  if (typeof buildMobileDrawer == "function") {
    var a = document.getElementById("mobile-drawer-root"), r = a && a.classList.contains("open");
    buildMobileDrawer(), r && a && a.classList.add("open");
  }
  if (typeof initP0MobileEnhancements == "function") try {
    initP0MobileEnhancements();
  } catch (i) {
    console.warn("[silent]", i);
  }
  if (typeof toast == "function" && toast(b === "en" ? "🇬🇧 English language enabled" : "🇷🇺 Выбран русский язык", "info"), typeof loadLiveRounds == "function" && loadLiveRounds(), typeof loadRecentResults == "function" && loadRecentResults(), typeof loadLB == "function" && loadLB(), typeof loadPlayers == "function" && loadPlayers(), typeof loadStats == "function" && loadStats(), typeof loadPestovoWeather == "function" && loadPestovoWeather("nav-weather-container"), typeof showGroupSetup == "function") {
    var n = document.getElementById("group-setup") || document.getElementById("setup");
    n && !n.classList.contains("hidden") && showGroupSetup();
  }
  typeof initRoundView == "function" && typeof curRid < "u" && curRid && initRoundView(), typeof initSoloView == "function" && initSoloView(), typeof updateHcpTable == "function" && updateHcpTable(), typeof loadClubStats == "function" && loadClubStats(), typeof loadMyActiveRounds == "function" && loadMyActiveRounds("my-active-rounds-container");
}
function J() {
  typeof document > "u" || document.querySelectorAll(".lang-btn").forEach(function(e) {
    e.innerHTML = b === "en" ? "🇬🇧 EN" : "🇷🇺 RU";
  });
}
function x() {
  typeof document > "u" || (document.querySelectorAll("[data-i18n]").forEach(function(e) {
    var a = e.getAttribute("data-i18n");
    a && m[b] && m[b][a] !== void 0 && (e.tagName === "TITLE" && a !== "brand_name" ? e.textContent = m[b][a] + " — " + Y("brand_name") : e.innerHTML = m[b][a]);
  }), document.querySelectorAll("[data-i18n-placeholder]").forEach(function(e) {
    var a = e.getAttribute("data-i18n-placeholder");
    a && m[b] && m[b][a] !== void 0 && e.setAttribute("placeholder", m[b][a]);
  }), document.querySelectorAll("[data-i18n-title]").forEach(function(e) {
    var a = e.getAttribute("data-i18n-title");
    a && m[b] && m[b][a] !== void 0 && e.setAttribute("title", m[b][a]);
  }), document.querySelectorAll("[data-i18n-aria-label]").forEach(function(e) {
    var a = e.getAttribute("data-i18n-aria-label");
    a && m[b] && m[b][a] !== void 0 && e.setAttribute("aria-label", m[b][a]);
  }), typeof refreshDateRangeFilters == "function" && refreshDateRangeFilters());
}
try {
  document.documentElement && typeof document.documentElement.setAttribute == "function" && document.documentElement.setAttribute("lang", b);
} catch (e) {
  console.warn("[silent]", e);
}
try {
  x();
} catch (e) {
  console.warn("[silent]", e);
}
document.addEventListener("DOMContentLoaded", function() {
  x(), F();
});
function F() {
  if (!(typeof document > "u")) {
    var e = (/* @__PURE__ */ new Date()).getFullYear();
    document.querySelectorAll(".footer-bottom p").forEach(function(a) {
      a.innerHTML = a.innerHTML.replace(/(©|&copy;)\s*\d{4}/g, "$1 " + e).replace(/&copy;\s*\d{4}/g, "&copy; " + e);
    });
  }
}
F();
typeof window < "u" && Object.assign(window, { currentLang: b, I18N: m, t: Y, toggleLang: Pe, updateLangButtons: J, applyTranslations: x, updateFooterYear: F });
function D(e, a, r, n, i) {
  var o = !!i, s = o ? escapeHtml : function(d) {
    return String(d);
  }, f = typeof fmtTime == "function" ? fmtTime(Date.now()) : (/* @__PURE__ */ new Date()).toLocaleTimeString("ru-RU"), c = e === "referee" ? "🚨 Вызов Судьи" : "🚨 Вызов Маршала", u = o ? "<b>" : "", l = o ? "</b>" : "", _ = [];
  _.push(o ? "<b>" + c + "</b>" : c), _.push(u + "Кто вызвал:" + l + " " + s(r || "Игрок")), _.push(u + "Лунка:" + l + " №" + a), _.push(u + "Время:" + l + " " + f);
  var h = (n || []).map(function(d) {
    return String(d || "").trim();
  }).filter(Boolean);
  return h.length && _.push(u + "Состав флайта:" + l + " " + s(h.join(", "))), _.join(`
`);
}
function A(e) {
  var a = A._state || (A._state = { at: 0, cfg: null, promise: null }), r = 5 * 60 * 1e3, n = { telegram: {}, vk: {}, mode: "client", readAt: 0 };
  return !e && a.cfg && Date.now() - a.at < r ? Promise.resolve(a.cfg) : !e && a.promise ? a.promise : typeof db > "u" || !db ? Promise.resolve(n) : (a.promise = Promise.all([
    db.ref("channels").once("value").catch(function(i) {
      return console.warn("[alerts] channels read failed", i && i.message), null;
    }),
    db.ref("settings/alert_delivery_mode").once("value").catch(function() {
      return null;
    })
  ]).then(function(i) {
    var o = i[0] && i[0].val() || {}, s = o.telegram || {}, f = o.vk || {}, c = String(i[1] && i[1].val() || "client"), u = String(s.groupToken || s.botToken || "").trim(), l = String(s.groupId || s.chatId || "").trim(), _ = String(s.channelId || "").trim();
    return a.cfg = {
      telegram: {
        groupToken: u,
        groupId: l,
        // «Или использовать один и тот же бот» (подсказка в админке):
        // для канала достаточно ID, токен берём у группы.
        channelToken: String(s.channelToken || "").trim() || (_ ? u : ""),
        channelId: _
      },
      vk: {
        token: String(f.token || "").trim(),
        peerId: String(f.peerId == null ? "" : f.peerId).trim()
      },
      mode: c === "server" ? "server" : "client",
      readAt: Date.now()
    }, a.at = Date.now(), a.promise = null, a.cfg;
  }).catch(function(i) {
    return a.promise = null, console.warn("[alerts] channels unavailable", i && i.message), n;
  }), a.promise);
}
function Te(e, a, r, n, i, o, s) {
  if (e = (e || "").trim(), a = (a || "").trim(), !e || !a) {
    toast("⚠️ Укажите Bot Token и Chat ID / Username для " + (r || "Telegram"), "error");
    return;
  }
  var f = D(n, i, o, s, !0), c = typeof AbortController < "u" ? new AbortController() : null, u = c ? setTimeout(function() {
    try {
      c.abort();
    } catch (_) {
      console.warn("[silent]", _);
    }
  }, 6e3) : null, l = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: a,
      text: f,
      parse_mode: "HTML"
    })
  };
  c && (l.signal = c.signal), fetch("https://api.telegram.org/bot" + e + "/sendMessage", l).then(function(_) {
    return u && clearTimeout(u), _.json();
  }).then(function(_) {
    if (_ && _.ok)
      console.log("✅ Telegram alert delivered to " + r + ":", _.result), toast("✅ Telegram сообщение доставлено в " + (r || "чат") + "!", "success");
    else {
      var h = _ && _.description ? _.description : "Ошибка Telegram API";
      console.error("❌ Telegram Bot API Error (" + r + "):", h), toast("❌ Ошибка Telegram (" + (r || "чат") + "): " + h, "error");
    }
  }).catch(function(_) {
    u && clearTimeout(u);
    var h = _ && _.name === "AbortError", d = h ? "Таймаут соединения (6 сек)" : _ ? _.message : "Ошибка сети";
    console.error("❌ Telegram Fetch Error (" + r + "):", _), toast("❌ Ошибка сети / Таймаут Telegram: " + d, "error");
  });
}
function I(e, a, r, n, i, o) {
  if (e = (e || "").trim(), a = (a || "").trim(), !e || !a) return Promise.resolve("not_configured");
  var s = D(r, n, i, o, !0), f = typeof AbortController < "u" ? new AbortController() : null, c = f ? setTimeout(function() {
    try {
      f.abort();
    } catch (l) {
      console.warn("[silent]", l);
    }
  }, 6e3) : null, u = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: a, text: s, parse_mode: "HTML" })
  };
  return f && (u.signal = f.signal), fetch("https://api.telegram.org/bot" + e + "/sendMessage", u).then(function(l) {
    return c && clearTimeout(c), l.json();
  }).then(function(l) {
    if (l && l.ok) return "sent";
    var _ = l && l.description ? l.description : "Ошибка Telegram API";
    return console.warn("⚠️ Telegram silent send failed:", _), "error: " + _;
  }).catch(function(l) {
    c && clearTimeout(c);
    var _ = l && l.name === "AbortError";
    return console.warn("⚠️ Telegram silent send error (suppressed):", l && l.message), "error: " + (_ ? "таймаут (6 сек)" : l && l.message ? l.message : "ошибка сети");
  });
}
function Re(e, a, r, n, i, o) {
  return T(e, a, r, n, o);
}
function H(e, a, r, n) {
  return e = (e || "").trim(), a = (a || "").trim(), !e || !a ? (n || toast("⚠️ Укажите VK Access Token и Peer ID в настройках", "error"), Promise.resolve("not_configured")) : new Promise(function(i) {
    var o = "_vkCb_" + Date.now() + "_" + Math.floor(Math.random() * 1e6), s = Math.floor(Math.random() * 2e9), f = null, c = null, u = !1, l = function(d) {
      u || (u = !0, i(d));
    }, _ = function() {
      try {
        c && c.parentNode && c.parentNode.removeChild(c);
      } catch (d) {
        console.warn("[silent]", d);
      }
      try {
        delete window[o];
      } catch {
        window[o] = void 0;
      }
      f && clearTimeout(f);
    };
    window[o] = function(d) {
      if (_(), d && d.response !== void 0 && d.response)
        n || (console.log("✅ VK message sent, id:", d.response), toast("✅ Сообщение ВКонтакте доставлено!", "success")), l("sent");
      else {
        var g = d && d.error && d.error.error_code, p = d && d.error && d.error.error_msg ? d.error.error_msg : "Ошибка VK API";
        console.error("❌ VK API Error " + g + ":", p, d), n ? console.warn("⚠️ VK silent send failed (code " + g + "):", p) : toast("❌ VK API: " + p, "error"), l("error: code " + (g || "?") + ": " + p);
      }
    };
    var h = "https://api.vk.com/method/messages.send?access_token=" + encodeURIComponent(e) + "&peer_id=" + encodeURIComponent(a) + "&message=" + encodeURIComponent(r) + "&random_id=" + s + "&v=5.199&callback=" + o;
    c = document.createElement("script"), c.src = h, c.onerror = function() {
      _(), n ? console.warn("⚠️ VK JSONP network error (suppressed)") : toast("❌ Ошибка сети при отправке в VK (JSONP)", "error"), l("error: сеть/CSP (JSONP не загрузился)");
    }, f = setTimeout(function() {
      _(), n ? console.warn("⚠️ VK JSONP timeout (suppressed)") : toast("❌ Таймаут соединения с VK (10 сек)", "error"), l("error: таймаут (10 сек)");
    }, 1e4), (document.head || document.body).appendChild(c);
  });
}
function O(e, a, r, n) {
  return D(e, a, r, n, !1);
}
function Ce(e, a, r, n, i, o) {
  if (e = (e || "").trim(), a = (a || "").trim(), !e || !a) {
    toast("⚠️ Укажите VK Access Token и Peer ID в настройках", "error");
    return;
  }
  var s = O(r, n, i, o);
  H(e, a, s, !1);
}
function $(e, a, r, n, i, o) {
  if (e = (e || "").trim(), a = (a || "").trim(), !e || !a) return Promise.resolve("not_configured");
  var s = O(r, n, i, o);
  return H(e, a, s, !0);
}
function Ae(e, a, r, n, i) {
  return T(e, a, r, n, i);
}
function T(e, a, r, n, i) {
  var o = T._state || (T._state = { done: {} }), s = i ? "id:" + i : "k:" + [e, a, r, Math.floor(Date.now() / 5e3)].join("|");
  if (o.done[s]) return o.done[s].promise;
  var f = typeof pestovoCheckGlobalNotificationsEnabled == "function" ? pestovoCheckGlobalNotificationsEnabled().catch(function() {
    return !0;
  }) : Promise.resolve(!0), c = f.then(function(u) {
    return u === !1 ? { skipped: "notifications_disabled" } : A().then(function(l) {
      if (l.mode === "server")
        return typeof console < "u" && console.debug && console.debug("[alerts] delivery mode = server, browser stays silent"), { skipped: "server_mode" };
      var _ = l.telegram || {}, h = l.vk || {}, d = {}, g = {
        "telegram:group": !!(_.groupToken && _.groupId),
        "telegram:channel": !!(_.channelToken && _.channelId),
        vk: !!(h.token && h.peerId)
      }, p = [];
      return g["telegram:group"] ? p.push(I(_.groupToken, _.groupId, e, a, r, n).then(function(y) {
        d["telegram:group"] = y;
      })) : d["telegram:group"] = "not_configured", g["telegram:channel"] ? p.push(I(_.channelToken, _.channelId, e, a, r, n).then(function(y) {
        d["telegram:channel"] = y;
      })) : d["telegram:channel"] = "not_configured", g.vk ? p.push($(h.token, h.peerId, e, a, r, n).then(function(y) {
        d.vk = y;
      })) : d.vk = "not_configured", !g["telegram:group"] && !g["telegram:channel"] && !g.vk && console.warn("[alerts] в channels/ ничего не настроено — вызов никуда не отправлен"), Promise.all(p).then(function() {
        return X(i, d, g);
      });
    });
  }).catch(function(u) {
    return console.warn("[alerts] delivery failed", u && u.message), { skipped: "error", error: String(u && u.message || u).slice(0, 200) };
  });
  return o.done[s] = { promise: c, at: Date.now() }, Object.keys(o.done).forEach(function(u) {
    Date.now() - o.done[u].at > 6e4 && delete o.done[u];
  }), c;
}
function X(e, a, r) {
  var n = {
    by: "client",
    at: Date.now(),
    channels: a || {},
    configured: r || {}
  }, i = 0;
  return Object.keys(a || {}).forEach(function(o) {
    a[o] === "sent" && i++;
  }), n.sent = i, !e || typeof db > "u" || !db ? Promise.resolve(n) : db.ref("alerts/" + e + "/delivery").update(n).then(function() {
    return n;
  }).catch(function(o) {
    return console.warn("[alerts] delivery report not saved", o && o.message), n;
  });
}
typeof window < "u" && Object.assign(window, { buildOfficialCallText: D, pestovoOfficialChannels: A, sendTelegramDirectAlert: Te, sendTelegramSilentAlert: I, sendTelegramOfficialAlert: Re, vkSendMessageJsonp: H, vkBuildAlertText: O, sendVKDirectAlert: Ce, sendVKSilentAlert: $, sendVKOfficialAlert: Ae, pestovoDeliverOfficialCall: T, pestovoRecordClientDelivery: X });
export {
  ee as ADDR,
  Z as CLUB,
  re as COURSE_RATINGS,
  R as DATE_RANGE_PRESETS,
  w as HOLES,
  m as I18N,
  ae as TEES,
  te as TEE_ORDER,
  G as TIMINGS,
  N as TOAST_DURATION_MS,
  xe as TOTAL_PAR,
  x as applyTranslations,
  D as buildOfficialCallText,
  b as currentLang,
  V as dateInputToEndTs,
  B as dateInputToStartTs,
  M as datePresetRange,
  P as dateRangeFilters,
  K as ensureToastRoot,
  j as esc,
  W as escapeHtml,
  me as filterEntriesByDateRange,
  ce as fmtDate,
  le as fmtScore,
  pe as fmtTime,
  ye as getDateRangeFilter,
  U as getRoundFilterTs,
  ie as holeDist,
  oe as holeHcp,
  ne as holePar,
  de as holeResClass,
  ue as holeResName,
  se as holeTiming,
  ve as html,
  he as initDateRangeFilter,
  Q as isPlayerModeEnabled,
  be as isTodayTimestamp,
  k as normalizeTimestampMs,
  T as pestovoDeliverOfficialCall,
  A as pestovoOfficialChannels,
  X as pestovoRecordClientDelivery,
  C as readDateRange,
  ge as refreshDateRangeFilters,
  q as renderRoundsPeriodSummary,
  _e as scoreClass,
  Te as sendTelegramDirectAlert,
  Re as sendTelegramOfficialAlert,
  I as sendTelegramSilentAlert,
  Ce as sendVKDirectAlert,
  Ae as sendVKOfficialAlert,
  $ as sendVKSilentAlert,
  we as setSafeHtml,
  Y as t,
  fe as tnDateTs,
  L as toast,
  z as toastIconFor,
  Se as toastSequence,
  Pe as toggleLang,
  E as tsToDateInputValue,
  F as updateFooterYear,
  J as updateLangButtons,
  ke as vib,
  O as vkBuildAlertText,
  H as vkSendMessageJsonp
};
