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
     * Печать из скрытого iframe — запасной путь, когда браузер блокирует
     * всплывающие окна. Раньше в этом случае печаталась сама страница админки,
     * а она в @media print скрывает весь свой контент: пользователь получал
     * пустой лист вместо карточки.
     */
    function printInFrame(html, opts) {
        var d = doc();
        if (!d || !d.body) return false;
        var frame = d.getElementById('tnm-print-frame');
        if (!frame) {
            frame = d.createElement('iframe');
            frame.id = 'tnm-print-frame';
            frame.setAttribute('aria-hidden', 'true');
            frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;visibility:hidden';
            d.body.appendChild(frame);
        }
        var fdoc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
        if (!fdoc) return false;
        fdoc.open();
        fdoc.write(html);
        fdoc.close();
        var start = function () {
            waitForImages(fdoc, function () {
                try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { /* печать вручную */ }
            }, opts.timeout || 3500);
        };
        if (opts.delay) setTimeout(start, opts.delay);
        else start();
        return true;
    }

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
        if (!win) return printInFrame(html, opts);
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

    /** Это файл таблицы Excel (xlsx/xls/ods)? */
    function isExcelFile(fileOrName) {
        var name = String((fileOrName && fileOrName.name) || fileOrName || '').toLowerCase();
        return /\.(xlsx|xls|ods)$/.test(name);
    }

    /** Загружена ли библиотека Excel (SheetJS). */
    function excelAvailable() {
        return typeof root.XLSX !== 'undefined' && !!root.XLSX;
    }

    function excelLibraryError() {
        return new Error(en()
            ? 'Excel library not loaded (check internet)'
            : 'Библиотека Excel не загрузилась (проверьте интернет)');
    }

    /**
     * Все листы книги: [{ name, rows }]. Пустые листы отбрасываем, но порядок
     * листов сохраняем — импорт участников смотрит каждый лист, а не только
     * первый (организаторы часто кладут состав на отдельную вкладку).
     */
    function workbookSheets(book) {
        var names = (book && book.SheetNames) || [];
        var sheets = [];
        names.forEach(function (name, index) {
            var sheet = book.Sheets ? book.Sheets[name] : null;
            if (!sheet) return;
            var rows = [];
            try {
                rows = root.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
            } catch (e) {
                rows = [];
            }
            rows = (rows || []).filter(function (row) {
                return (row || []).some(function (cell) { return root.TnMgrCore.trim(cell) !== ''; });
            });
            if (!rows.length) return;
            sheets.push({ name: String(name || ('Лист ' + (index + 1))), rows: rows });
        });
        return sheets;
    }

    /**
     * Читает xlsx/xls/ods/csv/tsv и возвращает ВСЕ листы книги
     * ([{ name, rows }]) для TnMgrCore.parseWorkbook(). Ошибка — отклонённый промис.
     */
    function readWorkbookFile(file) {
        if (isExcelFile(file)) {
            if (!excelAvailable()) return Promise.reject(excelLibraryError());
            return readFile(file, 'array').then(function (buffer) {
                var book = root.XLSX.read(new Uint8Array(buffer), { type: 'array' });
                var sheets = workbookSheets(book);
                if (!sheets.length) {
                    throw new Error(en() ? 'No data rows found in the file' : 'В файле не найдено строк с данными');
                }
                return sheets;
            });
        }
        return readFile(file, 'text').then(function (text) {
            var rows = core().parseDelimited(text);
            return rows.length ? [{ name: String(file && file.name || ''), rows: rows }] : [];
        });
    }

    /**
     * Первый непустой лист файла как обычная таблица (aoa) — для вызовов,
     * которым нужна плоская таблица. Для импорта участников используйте
     * readWorkbookFile: он читает все листы.
     */
    function readTableFile(file) {
        return readWorkbookFile(file).then(function (sheets) {
            return sheets.length ? sheets[0].rows : [];
        });
    }

    return {
        qrUrl: qrUrl, waitForImages: waitForImages, printHtml: printHtml,
        download: download, exportExcel: exportExcel,
        isExcelFile: isExcelFile, excelAvailable: excelAvailable,
        readWorkbookFile: readWorkbookFile, readTableFile: readTableFile,
        readFile: readFile, timestampSuffix: timestampSuffix
    };
})(typeof window !== 'undefined' ? window : this);
