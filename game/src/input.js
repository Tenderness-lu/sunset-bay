// Sunset Bay input: keyboard state, mouse-drag camera orbit, click-to-shoot.

(function () {
  'use strict';

  var keys = {};
  var mouse = { down: false, dx: 0, dy: 0, moved: false };
  var clicked = false;
  var pressed = {}; // keys pressed since last frame (edge-triggered)

  window.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; mouse.down = false; });

  var canvas = document.getElementById('game-canvas');
  canvas.addEventListener('mousedown', function (e) {
    mouse.down = true;
    mouse.moved = false;
    if (e.button === 0 && SB.state.mode === 'playing') clicked = true;
  });
  window.addEventListener('mouseup', function () { mouse.down = false; });
  window.addEventListener('mousemove', function (e) {
    if (!mouse.down) return;
    mouse.dx += e.movementX || 0;
    mouse.dy += e.movementY || 0;
    if (Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0) > 0) mouse.moved = true;
  });
  // Keep the page from selecting text while dragging.
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  SB.input = {
    down: function (code) { return !!keys[code]; },
    pressed: function (code) { return !!pressed[code]; },
    // WASD / arrows as a -1..1 pair, relative to the camera.
    moveAxis: function () {
      var x = 0, y = 0;
      if (keys.KeyW || keys.ArrowUp) y += 1;
      if (keys.KeyS || keys.ArrowDown) y -= 1;
      if (keys.KeyA || keys.ArrowLeft) x -= 1;
      if (keys.KeyD || keys.ArrowRight) x += 1;
      return { x: x, y: y };
    },
    mouseDelta: function () {
      var d = { x: mouse.dx, y: mouse.dy };
      mouse.dx = 0;
      mouse.dy = 0;
      return d;
    },
    mouseDown: function () { return mouse.down; },
    consumeClick: function () {
      var c = clicked;
      clicked = false;
      return c;
    },
    endFrame: function () { pressed = {}; },
  };
})();
