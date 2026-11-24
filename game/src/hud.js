// Sunset Bay HUD: health, money, wanted stars, objective, speed, minimap,
// toasts, menus, damage flash, and the localStorage save.

(function () {
  'use strict';

  var SAVE_KEY = 'sunsetbay-save-v1';
  var minimap = null;
  var mctx = null;
  var toastTimer = null;

  function el(id) { return document.getElementById(id); }

  SB.hud = {
    init: function () {
      minimap = el('minimap');
      mctx = minimap.getContext('2d');
    },

    show: function () { el('hud').classList.remove('hidden'); },
    hide: function () { el('hud').classList.add('hidden'); },

    setObjective: function (title, sub) {
      var o = el('objective');
      o.innerHTML = '';
      var t = document.createElement('div');
      t.textContent = title;
      o.appendChild(t);
      if (sub) {
        var s = document.createElement('small');
        s.textContent = sub;
        o.appendChild(s);
      }
    },

    toast: function (message) {
      var t = el('toast');
      t.textContent = message;
      t.style.opacity = '1';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.style.opacity = '0'; }, 3400);
    },

    flashDamage: function () {
      var v = el('vignette');
      v.style.opacity = '1';
      setTimeout(function () { v.style.opacity = '0'; }, 180);
    },

    setHint: function (text) { el('hint').textContent = text || ''; },

    update: function () {
      var st = SB.state;
      el('health-bar').style.width = Math.max(0, st.health) + '%';
      el('health-bar').style.background = st.health > 50
        ? 'linear-gradient(90deg,#37d67a,#9be15d)'
        : st.health > 25 ? 'linear-gradient(90deg,#f39c12,#f5d76e)' : 'linear-gradient(90deg,#e74c3c,#ff7b7b)';
      el('money').textContent = SB.util.fmtMoney(st.money);
      var stars = '';
      for (var i = 0; i < 5; i++) {
        stars += '<span class="' + (i < st.wanted ? '' : 'star-off') + '">★</span>';
      }
      el('hud-top-right').innerHTML = stars;
      // Speedometer (car) or weapon/ammo (on foot).
      var sp = el('speedo');
      if (st.inCar) {
        var kmh = Math.round(Math.abs(st.inCar.speed) * 3.2);
        sp.innerHTML = kmh + ' <small>km/h</small>';
      } else if (st.weapon === 'pistol') {
        sp.innerHTML = 'PISTOL <small>' + st.ammo + ' / ' + SB.CONFIG.pistolMag + '</small>';
      } else {
        sp.innerHTML = 'FISTS';
      }
      el('crosshair').classList.toggle('hidden', st.weapon !== 'pistol' || !!st.inCar);
      // Mission timer.
      if (st.missionState === 'active' && SB.missions.current && (SB.missions.current.timeLimit || SB.missions.current.survive)) {
        var t = Math.max(0, Math.ceil(st.missionTimer));
        var mm = Math.floor(t / 60);
        var ss = ('0' + (t % 60)).slice(-2);
        this.setObjective(SB.missions.current.title, 'Time left: ' + mm + ':' + ss + ' — ' + SB.missions.current.brief);
      }
      this.drawMinimap();
    },

    drawMinimap: function () {
      if (!mctx) return;
      var S = 190;
      var W = 560; // world span shown: -280..280
      function px(x) { return ((x + 280) / W) * S; }
      function pz(z) { return ((z + 280) / W) * S; }
      mctx.clearRect(0, 0, S, S);
      mctx.fillStyle = '#12283a';
      mctx.fillRect(0, 0, S, S);
      // Beach strip on the west edge (the ocean lies beyond the map's span).
      mctx.fillStyle = '#d9c48a';
      mctx.fillRect(0, 0, px(-210), S);
      // Roads.
      mctx.strokeStyle = '#5a6068';
      mctx.lineWidth = 4;
      SB.city.streetLines.forEach(function (s) {
        mctx.beginPath(); mctx.moveTo(px(-210), pz(s)); mctx.lineTo(px(210), pz(s)); mctx.stroke();
        mctx.beginPath(); mctx.moveTo(px(s), pz(-210)); mctx.lineTo(px(s), pz(210)); mctx.stroke();
      });
      // Buildings (faint blocks).
      mctx.fillStyle = 'rgba(200,200,210,.35)';
      SB.city.buildings.forEach(function (b) {
        var w = b.geometry.parameters.width;
        var d = b.geometry.parameters.depth;
        mctx.fillRect(px(b.position.x - w / 2), pz(b.position.z - d / 2), Math.max(2, (w / W) * S), Math.max(2, (d / W) * S));
      });
      // Mission waypoint.
      if (SB.missions.markerPos) {
        var mx = px(SB.missions.markerPos.x);
        var my = pz(SB.missions.markerPos.z);
        mctx.fillStyle = '#39ff88';
        mctx.beginPath();
        mctx.arc(mx, my, 6, 0, Math.PI * 2);
        mctx.fill();
        mctx.strokeStyle = '#fff';
        mctx.lineWidth = 2;
        mctx.stroke();
      }
      // Traffic (yellow), police (flashing red/blue), player (white arrow).
      SB.traffic.cars.forEach(function (car) {
        if (car.driver !== 'traffic') return;
        mctx.fillStyle = '#f2c14e';
        mctx.fillRect(px(car.mesh.position.x) - 2, pz(car.mesh.position.z) - 2, 4, 4);
      });
      var blink = Math.floor(SB.state.time * 4) % 2 === 0;
      SB.police.cars.forEach(function (car) {
        mctx.fillStyle = blink ? '#ff2222' : '#2244ff';
        mctx.beginPath();
        mctx.arc(px(car.mesh.position.x), pz(car.mesh.position.z), 4, 0, Math.PI * 2);
        mctx.fill();
      });
      var p = SB.main.playerPosition();
      var heading = SB.main.player.heading;
      if (SB.state.inCar) heading = SB.state.inCar.heading;
      mctx.save();
      mctx.translate(px(p.x), pz(p.z));
      mctx.rotate(Math.PI - heading); // canvas "up" is world -z; heading 0 faces +z
      mctx.fillStyle = '#fff';
      mctx.beginPath();
      mctx.moveTo(0, -7);
      mctx.lineTo(5, 6);
      mctx.lineTo(-5, 6);
      mctx.closePath();
      mctx.fill();
      mctx.restore();
    },

    // ---- screens ----
    showStart: function () {
      el('start-screen').classList.remove('hidden');
      el('pause-screen').classList.add('hidden');
      el('over-screen').classList.add('hidden');
      el('win-screen').classList.add('hidden');
      this.hide();
    },
    showPause: function () {
      el('pause-screen').classList.remove('hidden');
    },
    hidePause: function () {
      el('pause-screen').classList.add('hidden');
    },
    showOver: function (text, stats) {
      el('over-text').textContent = text;
      el('over-stats').innerHTML = stats;
      el('over-screen').classList.remove('hidden');
      this.hide();
    },
    showWin: function (stats) {
      el('win-stats').innerHTML = stats;
      el('win-screen').classList.remove('hidden');
      this.hide();
    },
    hideAllScreens: function () {
      el('start-screen').classList.add('hidden');
      el('pause-screen').classList.add('hidden');
      el('over-screen').classList.add('hidden');
      el('win-screen').classList.add('hidden');
    },
  };
})();
