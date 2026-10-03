// ============================================================
// TN-MGR-IO — экспорт/импорт системы турниров
// ------------------------------------------------------------
// PDF: печать отдельного окна («Сохранить как PDF») — тот же приём,
//      что в js/protocol.js и js/tournament-public.js; QR-коды
//      дожидаются загрузки картинок перед печатью.
// Excel: SheetJS (грузится на admin.html из CDN) с CSV-fallback.
// Импорт: xlsx/xls/csv/tsv файл или вставленная таблица.
// ============================================================
var TnMgrIO = (function (root) {
    'use strict';

    function core() { return root.TnMgrCore; }
    function doc() { return root.document; }
    function en() { return root.currentLang === 'en'; }
    function notify(message, type) {
        if (typeof root.toast === 'function') root.toast(message, type || 'info');
        else if (type === 'error') console.error('[tn-mgr]', message);
        else console.log('[tn-mgr]', message);
    }

    // ----------------------------------------------------------
    // QR
    // ----------------------------------------------------------
    function qrUrl(payload, size) {
        return core().qrImageUrl(payload, size || 320);
    }

    /** Ждёт загрузки всех QR-картинок (или таймаута), затем вызывает cb. */
    function waitForImages(docRef, cb, timeoutMs) {
        var images = docRef ? Array.prototype.slice.call(docRef.querySelectorAll('img[data-qr]')) : [];
        var pending = images.filter(function (img) { return !img.complete; });
        if (!pending.length) { cb(); return; }
        var done = false;
        var finish = function () {
            if (done) return;
            done = true;
            cb();
        };
        var left = pending.length;
        pending.forEach(function (img) {
            var onDone = function () {
                img.removeEventListener('load', onDone);
                img.removeEventListener('error', onDone);
                left--;
                if (left <= 0) finish();
            };
            img.addEventListener('load', onDone);
            img.addEventListener('error', onDone);
        });
        setTimeout(finish, timeoutMs || 3500);
    }

    // ----------------------------------------------------------
    // PDF (печать)
    // ----------------------------------------------------------
    /**
     * Открывает документ в новом окне и запускает печать.
     * html — готовый документ из TnMgrCore.*Html().
     */
    function printHtml(html, options) {
        var opts = options || {};
        var win = null;
        try {
            win = root.open('', '_blank');
        } catch (e) { win = null; }
        if (!win) {
            notify(en() ? '❌ Allow pop-ups to export PDF' : '❌ Разрешите всплывающие окна для экспорта PDF', 'error');
            return false;
        }
        win.document.open();
        win.document.write(html);
        win.document.close();
        var start = function () {
            waitForImages(win.document, function () {
                try { win.focus(); win.print(); } catch (e) { /* пользователь напечатает вручную */ }
            }, opts.timeout || 3500);
        };
        if (opts.delay) setTimeout(start, opts.delay);
        else start();
        return true;
    }

    // ----------------------------------------------------------
    // EXCEL / CSV
    // ----------------------------------------------------------
    function download(filename, content, mime) {
        try {
            var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var link = doc().createElement('a');
            link.href = url;
            link.download = filename;
            doc().body.appendChild(link);
            link.click();
            doc().body.removeChild(link);
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
            return true;
        } catch (e) {
            notify('❌ ' + e.message, 'error');
            return false;
        }
    }

    function timestampSuffix() {
        try { return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'); } catch (e) { return ''; }
    }

    /**
     * Выгрузка Excel. sheets = [{ name, rows }].
     * Если SheetJS недоступен — выгружаем CSV (первый лист).
     */
    function exportExcel(filename, sheets) {
        var list = (sheets || []).filter(function (sheet) { return sheet && sheet.rows && sheet.rows.length; });
        if (!list.length) { notify(en() ? 'Nothing to export' : 'Нет данных для выгрузки', 'warn'); return false; }
        var name = filename || ('pestovo-' + timestampSuffix());
        if (typeof root.XLSX !== 'undefined' && root.XLSX) {
            try {
                var book = root.XLSX.utils.book_new();
                list.forEach(function (sheet, index) {
                    var ws = root.XLSX.utils.aoa_to_sheet(sheet.rows);
                    root.XLSX.utils.book_append_sheet(book, ws, (sheet.name || ('Лист' + (index + 1))).slice(0, 31));
                });
                root.XLSX.writeFile(book, name + '.xlsx');
                notify(en() ? '✅ Excel file saved' : '✅ Файл Excel сохранён', 'success');
                return true;
            } catch (e) {
                notify('⚠️ Excel: ' + e.message, 'warn');
            }
        }
        var csv = core().csvFromRows(list[0].rows);
        download(name + '.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
        notify(en() ? '✅ CSV file saved (Excel library unavailable)' : '✅ Файл CSV сохранён (библиотека Excel недоступна)', 'success');
        return true;
    }

    // ----------------------------------------------------------
    // ИМПОРТ
    // ----------------------------------------------------------
    function readFile(file, mode) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onerror = function () { reject(new Error('Не удалось прочитать файл')); };
            reader.onload = function (event) { resolve(mode === 'array' ? event.target.result : event.target.result); };
            if (mode === 'array') reader.readAsArrayBuffer(file);
            else reader.readAsText(file, 'utf-8');
        });
    }

    /**
     * Читает xlsx/xls/csv/tsv и возвращает массив строк (aoa) для
     * TnMgrCore.parseParticipants(). Ошибка — отклонённый промис.
     */
    function readTableFile(file) {
        var name = String(file && file.name || '').toLowerCase();
        var isExcel = /\.(xlsx|xls|ods)$/.test(name);
        if (isExcel) {
            if (typeof root.XLSX === 'undefined' || !root.XLSX) {
                return Promise.reject(new Error(en()
                    ? 'Excel library not loaded (check internet)'
                    : 'Библиотека Excel не загрузилась (проверьте интернет)'));
            }
            return readFile(file, 'array').then(function (buffer) {
                var book = root.XLSX.read(new Uint8Array(buffer), { type: 'array' });
                var first = book.SheetNames[0];
                return first ? root.XLSX.utils.sheet_to_json(book.Sheets[first], { header: 1, defval: '', blankrows: false }) : [];
            });
        }
        return readFile(file, 'text').then(function (text) {
            return core().parseDelimited(text);
        });
    }

    return {
        qrUrl: qrUrl, waitForImages: waitForImages, printHtml: printHtml,
        download: download, exportExcel: exportExcel,
        readTableFile: readTableFile, readFile: readFile, timestampSuffix: timestampSuffix
    };
})(typeof window !== 'undefined' ? window : this);
