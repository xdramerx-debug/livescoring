/* Mouse-only depth for the decorative course relief; the page needs no JS to render it. */
(function () {
    'use strict';
    var scene = document.querySelector('.relief-scene');
    if (!scene || !window.matchMedia) return;
    var motion = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    var frame = 0;
    var x = 0;
    var y = 0;
    function reset() {
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
        scene.style.removeProperty('--scene-x');
        scene.style.removeProperty('--scene-y');
    }
    scene.addEventListener('pointermove', function (event) {
        if (!motion.matches || event.pointerType !== 'mouse' || document.body.classList.contains('battery-saver')) return;
        x = event.clientX;
        y = event.clientY;
        if (frame) return;
        frame = window.requestAnimationFrame(function () {
            frame = 0;
            var bounds = scene.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return;
            scene.style.setProperty('--scene-x', (3 * (.5 - (y - bounds.top) / bounds.height)).toFixed(2) + 'deg');
            scene.style.setProperty('--scene-y', (4 * ((x - bounds.left) / bounds.width - .5)).toFixed(2) + 'deg');
        });
    }, { passive: true });
    scene.addEventListener('pointerleave', reset);
    scene.addEventListener('pointercancel', reset);
    if (motion.addEventListener) motion.addEventListener('change', reset);
})();
