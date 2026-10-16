// js/ui-events.js — делегирование событий вместо inline-обработчиков.
//
// Зачем. В firebase.json CSP отдаёт script-src с 'unsafe-inline': страницы
// держат 163 onclick= в HTML и столько же в разметке, которую собирает JS.
// Любой inline-обработчик — это способ исполнить скрипт в обход CSP, поэтому
// первый рубеж (экранирование, см. docs/CODE-REVIEW.md §4.1) им не защищён:
// достаточно одной неэкранированной подстановки в любом другом месте.
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
//   data-img-fail="имя"  — обработчик ошибки загрузки картинки; 'hide' и
//   data-img-ok="имя"      'hide-next' — готовые действия (спрятать саму
//                          картинку и показать следующий элемент-запас)
//
// Ошибки загрузки не всплывают, поэтому error слушается в фазе перехвата.
'use strict';

var PESTOVO_ACTIONS = Object.create(null);

/** Зарегистрировать обработчик: pestovoOnAction('имя', fn). */
function pestovoOnAction(name, fn) {
    PESTOVO_ACTIONS[name] = fn;
    return fn;
}

function pestovoActionArgs(el, kind) {
    var args = [];
    if (el.getAttribute('data-self') === '1') args.push(el);
    var names = ['data-arg', 'data-arg2', 'data-arg3'];
    for (var i = 0; i < names.length; i++) {
        var v = el.getAttribute(names[i]);
        if (v === null) break;
        args.push(v);
    }
    if (kind === 'change' || el.getAttribute('data-val') === '1') args.push(el.value);
    return args;
}

function pestovoResolve(name) {
    if (typeof PESTOVO_ACTIONS[name] === 'function') return PESTOVO_ACTIONS[name];
    if (typeof window[name] === 'function') return window[name];
    return null;
}

function pestovoHandleAction(kind, e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || el.disabled) return;
    if (el.getAttribute('data-prevent') === '1' && e.preventDefault) e.preventDefault();
    if (el.getAttribute('data-stop') === '1' && e.stopPropagation) e.stopPropagation();
    var fn = pestovoResolve(el.getAttribute('data-act'));
    if (!fn) {
        if (window.console) console.warn('[ui-events] нет обработчика:', el.getAttribute('data-act'));
        return;
    }
    fn.apply(el, pestovoActionArgs(el, kind));
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

if (typeof window !== 'undefined') {
    window.pestovoOnAction = pestovoOnAction;
    window.PESTOVO_ACTIONS = PESTOVO_ACTIONS;
}
