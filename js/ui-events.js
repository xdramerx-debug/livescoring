// js/ui-events.js — делегирование событий вместо inline-обработчиков.
//
// Зачем. Раньше страницы держали 396 inline-обработчиков (203 в HTML и 193 в
// разметке, которую собирает JS), и script-src в firebase.json вынужденно
// содержал 'unsafe-inline'. Любой inline-обработчик — это способ исполнить
// скрипт в обход CSP, поэтому первый рубеж (экранирование, см.
// docs/CODE-REVIEW.md §4.1) им не защищён: достаточно одной неэкранированной
// подстановки в любом другом месте. Теперь inline-обработчиков ноль, и
// script-src обходится без 'unsafe-inline' (style= пока остаётся).
//
// Как. Вместо onclick="fn('id')" разметка получает
//   data-act="fn" data-arg="id"
// а один слушатель на document находит ближайший [data-act] и вызывает fn.
// Элементы, созданные позже через innerHTML, работают автоматически — слушатель
// на document, а не на конкретном узле.
//
// Атрибуты элемента:
//   data-act="имя"       — имя функции (из реестра или глобальной области)
//   data-arg, data-arg2,
//   data-arg3            — аргументы (строки, как есть из разметки)
//   data-self="1"        — первым аргументом передать сам элемент
//   data-val="1"         — последним аргументом передать значение поля
//                          (для change: значение добавляется всегда)
//   data-stop="1"        — stopPropagation (вместо event.stopPropagation() в
//                          старом обработчике)
//   data-prevent="1"     — preventDefault (вместо onclick="return false")
//   data-ev="1"          — последним аргументом передать само событие
//                          (было onclick="fn(event)")
//   data-checked="1"     — последним аргументом передать checked (было
//                          onchange="fn(this.checked)")
//   data-then="имя"      — вызвать второе действие следом (было
//                          onclick="…;fn()")
//   data-img-fail="имя"  — обработчик ошибки загрузки картинки; 'hide' и
//   data-img-ok="имя"      'hide-next' — готовые действия (спрятать саму
//                          картинку и показать следующий элемент-запас)
//
// Отдельный вид — клавиатура, чтобы клик и Enter/Space не мешали друг другу:
//   data-kd-act="имя"    — то же, что data-act, но на keydown
//   data-kd-arg          — аргументы (data-kd-arg2, data-kd-arg3)
//   data-kd-key="Enter,Space" — срабатывать только на эти клавиши; пробел
//                          пишется как Space
//   data-kd-ev="1"       — первым аргументом передать событие (было
//                          onkeydown="fn(event, id)")
// Формы слушаются отдельно: data-sub-act="имя" (+ data-sub-arg, data-sub-ev).
//
// Ошибки загрузки не всплывают, поэтому error слушается в фазе перехвата.
'use strict';

var PESTOVO_ACTIONS = Object.create(null);

/** Зарегистрировать обработчик: pestovoOnAction('имя', fn). */
function pestovoOnAction(name, fn) {
    PESTOVO_ACTIONS[name] = fn;
    return fn;
}

function pestovoActionArgs(el, kind, prefix, e) {
    var args = [];
    // Клавиатурный обработчик может попросить само событие (как было в
    // onkeydown="lbRowKey(event, id)") — но только по явному data-kd-ev.
    if (prefix === 'kd-' && el.getAttribute('data-kd-ev') === '1') args.push(e);
    else if (el.getAttribute('data-self') === '1') args.push(el);
    var names = ['data-' + prefix + 'arg', 'data-' + prefix + 'arg2', 'data-' + prefix + 'arg3'];
    for (var i = 0; i < names.length; i++) {
        var v = el.getAttribute(names[i]);
        if (v === null) break;
        args.push(v);
    }
    // change/input добавляют значение поля; data-checked заменяет его отметкой
    // (было onchange="fn(this.checked)") — вместе они не нужны.
    if (el.getAttribute('data-checked') === '1') args.push(el.checked);
    else if (kind === 'change' || kind === 'input' || el.getAttribute('data-val') === '1') args.push(el.value);
    // Для клавиатуры событие уже добавлено выше — второй раз не нужно.
    if (prefix !== 'kd-' && el.getAttribute('data-' + prefix + 'ev') === '1') args.push(e);
    return args;
}

// Разрешённые клавиши — через запятую, пробел пишется как Space:
// data-kd-key="Enter,Space". Без атрибута срабатывает любая клавиша.
function pestovoKeyMatches(spec, key) {
    var list = spec.split(',');
    for (var i = 0; i < list.length; i++) {
        if (list[i] === 'Space' ? key === ' ' : list[i] === key) return true;
    }
    return false;
}

function pestovoResolve(name) {
    if (typeof PESTOVO_ACTIONS[name] === 'function') return PESTOVO_ACTIONS[name];
    if (typeof window[name] === 'function') return window[name];
    return null;
}

function pestovoHandleAction(kind, e, prefix) {
    prefix = prefix || '';
    var attr = 'data-' + prefix + 'act';
    var el = e.target && e.target.closest ? e.target.closest('[' + attr + ']') : null;
    if (!el || el.disabled) return;
    var keySpec = el.getAttribute('data-' + prefix + 'key');
    if (keySpec && !(e && pestovoKeyMatches(keySpec, e.key))) return;
    if (el.getAttribute('data-prevent') === '1' && e.preventDefault) e.preventDefault();
    if (el.getAttribute('data-stop') === '1' && e.stopPropagation) e.stopPropagation();
    var fn = pestovoResolve(el.getAttribute(attr));
    if (!fn) {
        if (window.console) console.warn('[ui-events] нет обработчика:', el.getAttribute(attr));
        return;
    }
    fn.apply(el, pestovoActionArgs(el, kind, prefix, e));
    var then = el.getAttribute('data-' + prefix + 'then');
    if (then) {
        var fn2 = pestovoResolve(then);
        if (fn2) fn2();
    }
}

function pestovoHandleImageFail(img) {
    var mode = img.getAttribute('data-img-fail');
    if (!mode) return;
    if (mode === 'hide') { img.style.display = 'none'; return; }
    if (mode === 'hide-next') {
        img.style.display = 'none';
        if (img.nextElementSibling) img.nextElementSibling.style.display = 'flex';
        return;
    }
    var fn = pestovoResolve(mode);
    if (fn) fn(img);
}

if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', function (e) { pestovoHandleAction('click', e); });
    document.addEventListener('change', function (e) { pestovoHandleAction('change', e); });
    document.addEventListener('input', function (e) { pestovoHandleAction('input', e); });
    // Клавиатура: атрибуты с префиксом kd- (onkeydown="fn(event, id)" →
    // data-kd-act="fn" data-kd-arg="id"), событие приходит первым аргументом.
    document.addEventListener('keydown', function (e) { pestovoHandleAction('keydown', e, 'kd-'); });
    // Формы: data-sub-act="fn", событие просится атрибутом data-sub-ev.
    document.addEventListener('submit', function (e) { pestovoHandleAction('submit', e, 'sub-'); });
    document.addEventListener('error', function (e) {
        var el = e.target;
        if (el && el.tagName === 'IMG') pestovoHandleImageFail(el);
    }, true);
    document.addEventListener('load', function (e) {
        var el = e.target;
        if (!el || el.tagName !== 'IMG') return;
        var name = el.getAttribute('data-img-ok');
        if (!name) return;
        var fn = pestovoResolve(name);
        if (fn) fn(el);
    }, true);
}

// Готовые действия: пустое (заглушка для ссылок-превью) и печать страницы.
pestovoOnAction('noop', function () {});
pestovoOnAction('pestovoPrint', function () { if (typeof window.print === 'function') window.print(); });
pestovoOnAction('pestovoCloseWindow', function () { if (typeof window.close === 'function') window.close(); });

// Мелкие действия, которые раньше жили прямо в onclick= как JS-выражения.
pestovoOnAction('pestovoClickElement', function (id) {
    var el = document.getElementById(id);
    if (el && typeof el.click === 'function') el.click();
});
pestovoOnAction('pestovoRemoveElement', function (id) {
    var el = document.getElementById(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
});
// Закрытие по фону: срабатывает, только если клик был по самому фону, а не по
// содержимому модального окна (было onclick="if(event.target===this)close()").
pestovoOnAction('pestovoBackdrop', function (name, ev) {
    if (ev && ev.target !== this) return;
    var fn = pestovoResolve(name);
    if (fn) fn();
});
// Ещё несколько выражений, которые жили прямо в onclick= в HTML.
pestovoOnAction('pestovoReload', function () { window.location.reload(); });
pestovoOnAction('pestovoGo', function (href) { window.location.href = href; });
pestovoOnAction('pestovoHideElement', function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
});
// Спрятать сам фон, но только если клик был по нему (было
// onclick="if(event.target===this){this.style.display='none';}").
pestovoOnAction('pestovoHideSelf', function (ev) {
    if (ev && ev.target !== this) return;
    this.style.display = 'none';
});

// Переключить класс hidden у элемента: замена onclick с getElementById(…).
pestovoOnAction('pestovoToggleHidden', function (id) {
    var el = document.getElementById(id);
    if (el && el.classList) el.classList.toggle('hidden');
});
// Очистить поле и вызвать второе действие: замена onclick="…value='';load()".
pestovoOnAction('pestovoClearValue', function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
});
// Вызвать fn(true)/fn(false): в атрибуте булево значение — строка, поэтому
// приводим его здесь, а не в самой функции.
pestovoOnAction('pestovoRunBool', function (name, v) {
    var fn = pestovoResolve(name);
    if (fn) fn(v === 'true');
});

// Показать/спрятать поле по значению select: замена onchange с var c=…
pestovoOnAction('pestovoToggleClass', function (targetId, cls, expected, value) {
    var c = document.getElementById(targetId);
    if (c && c.classList) c.classList.toggle(cls, value !== expected);
});

if (typeof window !== 'undefined') {
    window.pestovoOnAction = pestovoOnAction;
    window.PESTOVO_ACTIONS = PESTOVO_ACTIONS;
}

/* ─────────────────────── ПОДПИСИ ПОЛЕЙ ───────────────────────
   <label> без for рядом с полем — не подпись, а просто текст: скринридер
   не назовёт поле, а тап по подписи не поставит в него курсор. В разметке
   таких пар было больше шестидесяти (форма входа, гандикап, слоты игроков
   в раунде — часть рисуется из шаблонов JS, часть руками в HTML).
   Связываем сами: label ищет первый контрол правее себя в том же блоке и
   получает for=его id. Работает и для разметки, появившейся после загрузки,
   поэтому наблюдаем за добавленными узлами (без записи в DOM, если связь
   уже есть, — иначе получился бы цикл, как у #setup в v1.129.0). */
var PESTOVO_FIELD_SEQ = 0;
function pestovoLinkLabels(root) {
    var scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || !scope.querySelectorAll) return 0;
    var labels = scope.querySelectorAll('label:not([for])');
    var linked = 0;
    for (var i = 0; i < labels.length; i++) {
        var label = labels[i];
        if (label.control) continue;                       // label уже обёртка поля
        if (label.querySelector('input,select,textarea')) continue;
        var node = label.nextElementSibling;
        var control = null;
        while (node && !control) {
            if (/^(INPUT|SELECT|TEXTAREA)$/.test(node.tagName)) control = node;
            else control = node.querySelector('input,select,textarea');
            node = node.nextElementSibling;
        }
        if (!control) continue;
        if (!control.id) control.id = 'pv-field-' + (++PESTOVO_FIELD_SEQ);
        label.setAttribute('for', control.id);
        linked++;
    }
    return linked;
}
if (typeof document !== 'undefined') {
    pestovoLinkLabels(document);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { pestovoLinkLabels(document); });
    }
    if (typeof MutationObserver === 'function') {
        var labelPending = false;
        var observer = new MutationObserver(function (list) {
            for (var i = 0; i < list.length; i++) {
                var added = list[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    var node = added[j];
                    if (node.nodeType !== 1) continue;
                    if (node.tagName === 'LABEL' || (node.querySelector && node.querySelector('label:not([for])'))) {
                        if (!labelPending) {
                            labelPending = true;
                            (window.requestAnimationFrame || window.setTimeout)(function () {
                                labelPending = false;
                                pestovoLinkLabels(document);
                            }, 16);
                        }
                        break;
                    }
                }
            }
        });
        observer.observe(document.documentElement || document, { childList: true, subtree: true });
    }
    if (typeof window !== 'undefined') window.pestovoLinkLabels = pestovoLinkLabels;
}
