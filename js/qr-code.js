// Local, dependency-free QR image generation for print and offline-capable pages.
// js/vendor/qrcode-generator-1.4.4.js and its UTF-8 extension must load first.
(function (root) {
    'use strict';

    function dataUrl(payload, targetSize) {
        var generator = root && root.qrcode;
        if (typeof generator !== 'function') return '';
        try {
            var qr = generator(0, 'M');
            qr.addData(String(payload == null ? '' : payload));
            qr.make();
            var modules = qr.getModuleCount();
            var size = Math.max(96, Math.min(1200, parseInt(targetSize, 10) || 320));
            var cell = Math.max(2, Math.floor(size / (modules + 4)));
            return qr.createDataURL(cell, cell * 2);
        } catch (error) {
            console.warn('[qr] local generation failed', error);
            return '';
        }
    }

    root.PestovoQr = { dataUrl: dataUrl };
})(typeof window !== 'undefined' ? window : globalThis);
