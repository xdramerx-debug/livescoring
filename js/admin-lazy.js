// js/admin-lazy.js — отложенная загрузка тяжёлых вкладок админки.
// На первом экране (вход + «Вызовы») не парсим турнирный менеджер,
// Excel, RUSGOLF и конструктор карточек. Скрипты размечены в admin.html
// как <script type="text/plain" data-admin-lazy="группа" data-admin-src="…">.
(function (root) {
    'use strict';

    var loaded = {};
    var loading = {};
    var injectedSrc = {};

    var TAB_GROUPS = {
        scores: ['scoreedit'],
        scoreaudit: ['scoreaudit'],
        hcplog: ['hcplog'],
        groups: ['groups'],
        tnmanager: ['xlsx', 'rgclient', 'tnm'],
        // В карточке «Игроки и роли» есть кнопка «Удалить всех игроков» —
        // она живёт в js/admin-groups.js, поэтому группа грузится и здесь.
        players: ['players', 'display', 'groups'],
        importexport: ['xlsx', 'importexport'],
        rusgolf: ['xlsx', 'players', 'rgclient', 'rusgolf'],
        // «Управление данными»: удаление (js/admin-groups.js) и бэкап/CSV
        // (js/admin-exports.js) раньше не грузились вовсе — кнопки были
        // мёртвыми: клик писал «нет обработчика» и ничего не происходил.
        data: ['display', 'groups', 'importexport'],
        scorecards: ['display'],
        entrycards: ['display', 'entry'],
        tncards: ['display'],
        scoreentry: ['display'],
        tournamentsview: ['display'],
        design: ['design'],
        broadcasts: ['broadcasts']
    };

    function nodesFor(group) {
        try {
            return Array.prototype.slice.call(root.document.querySelectorAll('script[data-admin-lazy="' + group + '"]'));
        } catch (e) {
            return [];
        }
    }

    function inject(src) {
        return new Promise(function (resolve, reject) {
            if (!src) { resolve(); return; }
            if (src.indexOf('xlsx') !== -1 && root.XLSX) { resolve(); return; }
            var key = src.split('?')[0];
            if (injectedSrc[key]) { resolve(); return; }
            injectedSrc[key] = true;
            var s = root.document.createElement('script');
            s.src = src;
            s.async = false;
            s.onload = function () { resolve(); };
            s.onerror = function () {
                reject(new Error('Не удалось загрузить ' + src));
            };
            root.document.head.appendChild(s);
        });
    }

    function loadGroup(name) {
        if (loaded[name]) return Promise.resolve();
        if (loading[name]) return loading[name];
        if (name === 'xlsx' && root.XLSX) {
            loaded[name] = true;
            return Promise.resolve();
        }
        var nodes = nodesFor(name);
        var chain = Promise.resolve();
        nodes.forEach(function (node) {
            var src = node.getAttribute('data-admin-src') || '';
            chain = chain.then(function () { return inject(src); });
        });
        loading[name] = chain.then(function () {
            loaded[name] = true;
            loading[name] = null;
        }).catch(function (err) {
            loading[name] = null;
            throw err;
        });
        return loading[name];
    }

    function loadGroups(names) {
        return (names || []).reduce(function (chain, name) {
            return chain.then(function () { return loadGroup(name); });
        }, Promise.resolve());
    }

    function ensureTab(tab) {
        return loadGroups(TAB_GROUPS[tab] || []);
    }

    root.pestovoEnsureAdminGroup = loadGroup;
    root.pestovoEnsureAdminTab = ensureTab;
    root.pestovoAdminLazyGroups = TAB_GROUPS;
})(typeof window !== 'undefined' ? window : this);
