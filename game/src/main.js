// Sunset Bay main: renderer, player on foot, chase camera, game loop,
// menus, save/load, and the ?shot= scene setups used for screenshots.

(function () {
  'use strict';

  var C = SB.CONFIG;
  var SAVE_KEY = 'sunsetbay-save-v1';

  var renderer = null;
  var scene = null;
  var camera = null;
  var clock = { last: 0 };
  var camYaw = Math.PI;
  var camPitch = 0.32;
  var camDist = 9;
  var camYawOffset = 0; // drag offset while driving, decays back to the car
  var saveTimer = 0;
  var playerMesh = null;

  // The player on foot: position (feet), facing, vertical speed.
  var player = {
    position: new THREE.Vector3(0, 0, 150),
    heading: 0,
    vy: 0,
    onGround: true,
    walkPhase: 0,
  };

  function buildPlayerMesh() {
    var g = new THREE.Group();
    var jacket = new THREE.MeshLambertMaterial({ color: 0xff7b24 });
    var skin = new THREE.MeshLambertMaterial({ color: 0xe0ac69 });
    var pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.78, 0.34), jacket);
    body.position.y = 1.06;
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
    head.position.y = 1.66;
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.1, 12), new THREE.MeshLambertMaterial({ color: 0x222831 }));
    cap.position.y = 1.86;
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.66, 0.24), pants);
    legL.position.set(-0.15, 0.33, 0);
    var legR = legL.clone();
    legR.position.x = 0.15;
    // A pistol in the right hand when armed.
    var gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.38, 1.0, 0.3);
    gun.name = 'pistol';
    gun.visible = false;
    g.add(body);
    g.add(head);
    g.add(cap);
    g.add(legL);
    g.add(legR);
    g.add(gun);
    g.userData.legL = legL;
    g.userData.legR = legR;
    g.userData.gun = gun;
    return g;
  }

  function resetWorld() {
    // Clear traffic/police/missions, keep the city.
    SB.traffic.cars.slice().forEach(function (car) { SB.vehicles.removeCar(car); });
    SB.traffic.cars = [];
    SB.traffic.pedestrians.slice().forEach(function (ped) {
      if (ped.mesh.parent) ped.mesh.parent.remove(ped.mesh);
    });
    SB.traffic.pedestrians = [];
    SB.police.removeAll();
    SB.missions.reset();
    // Parked cars: remove the player's old ones and respawn fresh.
    SB.vehicles.list.slice().forEach(function (car) {
      if (!car.isPolice) SB.vehicles.removeCar(car);
    });
    SB.vehicles.playerCar = null;
    SB.vehicles.spawnParkedCars(scene);
    SB.traffic.spawn(scene);
  }

  function applyShotSetup(shot) {
    // Scene presets for screenshots (and play-testing): ?shot=chase|street|mission|menu
    if (shot === 'menu') return;
    SB.main.startGame(false, true);
    if (shot === 'chase') {
      var car = SB.vehicles.list.find(function (c) { return !c.isPolice && c.parked; });
      if (car) {
        car.mesh.position.set(0, 0, 60);
        car.heading = Math.PI;
        car.mesh.rotation.y = Math.PI;
        SB.vehicles.enterCar(car);
        car.speed = 18;
      }
      SB.autoDrive = true; // keep the car moving for the screenshot
      SB.state.wanted = 3;
      SB.state.lastCrimeAt = SB.state.time;
      SB.police.spawnPolice();
      SB.missions.start(1);
    } else if (shot === 'street') {
      // On a sidewalk beside Ocean Drive, looking down the street at the traffic.
      player.position.set(53, 0, 10);
      player.heading = 0;
      camYaw = Math.PI;
      camPitch = 0.25;
      SB.missions.start(0);
    } else if (shot === 'mission') {
      // On the sand by the marina, facing the green pickup marker and the docks.
      player.position.set(-230, 0, 100);
      player.heading = -0.62;
      camYaw = 2.52;
      camPitch = 0.25;
      SB.state.weapon = 'pistol';
      SB.missions.start(0);
    }
  }

  SB.main = {
    player: player,
    camera: null,
    renderer: null,

    playerPosition: function () {
      if (SB.state.inCar) {
        var c = SB.state.inCar.mesh.position;
        return { x: c.x, y: c.y, z: c.z };
      }
      return { x: player.position.x, y: player.position.y, z: player.position.z };
    },

    gunPosition: function () {
      var p = this.playerPosition();
      var heading = SB.state.inCar ? SB.state.inCar.heading : player.heading;
      return new THREE.Vector3(
        p.x + Math.sin(heading) * 0.6,
        (p.y || 0) + 1.4,
        p.z + Math.cos(heading) * 0.6
      );
    },

    hidePlayerMesh: function () { if (playerMesh) playerMesh.visible = false; },
    showPlayerMesh: function () {
      if (playerMesh) {
        playerMesh.visible = true;
        playerMesh.position.copy(player.position);
      }
    },

    init: function () {
      var canvas = document.getElementById('game-canvas');
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.outputEncoding = THREE.sRGBEncoding;
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
      this.camera = camera;
      this.renderer = renderer;
      SB.city.scene = scene;

      // Warm sunset lighting: low sun over the ocean, soft sky fill.
      var hemi = new THREE.HemisphereLight(0xffb37a, 0x4a5a6a, 0.75);
      scene.add(hemi);
      var sun = new THREE.DirectionalLight(0xffd9a0, 1.15);
      sun.position.set(-300, 140, 80);
      scene.add(sun);

      SB.city.build(scene);
      playerMesh = buildPlayerMesh();
      playerMesh.position.copy(player.position);
      scene.add(playerMesh);
      SB.vehicles.spawnParkedCars(scene);
      SB.traffic.spawn(scene);
      SB.combat.init(scene);
      SB.hud.init();

      window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });

      // Menu buttons.
      document.getElementById('start-btn').addEventListener('click', function () { SB.main.startGame(false); });
      document.getElementById('continue-btn').addEventListener('click', function () { SB.main.startGame(true); });
      document.getElementById('resume-btn').addEventListener('click', function () { SB.main.togglePause(); });
      document.getElementById('restart-btn').addEventListener('click', function () { SB.main.restartDay(); });
      document.getElementById('retry-btn').addEventListener('click', function () { SB.main.respawn(); });
      document.getElementById('freeroam-btn').addEventListener('click', function () { SB.main.freeRoam(); });
      var save = this.loadGame();
      document.getElementById('continue-btn').style.display = save ? '' : 'none';

      // Screenshot scene setups (?shot=chase|street|mission|menu).
      var params = new URLSearchParams(window.location.search);
      var shot = params.get('shot');
      if (shot) {
        applyShotSetup(shot);
      } else {
        SB.hud.showStart();
      }

      // Expose the game for play-testing and debugging.
      window.SB = SB;
      window.__sunsetBay = { state: SB.state, player: player, missions: SB.missions };

      clock.last = performance.now();
      requestAnimationFrame(this.loop.bind(this));
    },

    startGame: function (fromSave, silent) {
      var st = SB.state;
      if (fromSave) {
        var save = this.loadGame();
        if (save) {
          st.money = save.money;
          st.health = 100;
          st.missionIndex = save.missionIndex;
          player.position.set(save.x, 0, save.z);
          st.wanted = 0;
        }
      } else {
        st.money = C.startMoney;
        st.health = C.startHealth;
        st.missionIndex = 0;
        st.wanted = 0;
        st.kills = 0;
        st.carsStolen = 0;
        st.packagesDelivered = 0;
        player.position.set(0, 0, 150);
        player.heading = Math.PI;
      }
      st.mode = 'playing';
      st.missionState = 'idle';
      st.inCar = null;
      st.weapon = 'fists';
      st.ammo = C.pistolMag;
      st.freeRoam = false;
      SB.vehicles.playerCar = null;
      this.showPlayerMesh();
      SB.hud.hideAllScreens();
      SB.hud.show();
      SB.hud.setObjective('SUNSET BAY', 'Marla Vane has work for you. Follow the green marker.');
      if (!silent) SB.audio.init();
      SB.missions.start(st.missionIndex);
      SB.hud.toast('Welcome back to Sunset Bay, Rook.');
    },

    restartDay: function () {
      resetWorld();
      SB.main.startGame(false);
    },

    respawn: function () {
      var st = SB.state;
      st.deaths++;
      st.health = 100;
      st.money = Math.max(0, st.money - 200);
      st.wanted = 0;
      SB.police.removeAll();
      if (SB.state.inCar) SB.vehicles.exitCar();
      player.position.set(0, 0, 150);
      player.heading = Math.PI;
      this.showPlayerMesh();
      st.mode = 'playing';
      SB.hud.hideAllScreens();
      SB.hud.show();
      SB.hud.toast('You woke up at Bay General. -$200 hospital bill.');
      SB.missions.start(st.missionIndex);
    },

    freeRoam: function () {
      var st = SB.state;
      st.freeRoam = true;
      st.mode = 'playing';
      st.missionState = 'done';
      SB.hud.hideAllScreens();
      SB.hud.show();
      SB.hud.setObjective('FREE ROAM', 'The bay is yours. Steal cars, dodge the law, enjoy the sunset.');
    },

    winGame: function () {
      var st = SB.state;
      st.mode = 'won';
      st.missionState = 'done';
      var stats = 'Money: ' + SB.util.fmtMoney(st.money) + '<br>Cars stolen: ' + st.carsStolen +
        ' · Packages delivered: ' + st.packagesDelivered + '<br>Deaths: ' + st.deaths;
      SB.hud.showWin(stats);
      SB.audio.setEngine(0, false);
      SB.audio.setSiren(false);
      this.saveGame();
    },

    gameOver: function () {
      var st = SB.state;
      st.mode = 'over';
      var stats = 'Money: ' + SB.util.fmtMoney(st.money) + '<br>Jobs done: ' + st.missionIndex + ' of 3';
      SB.hud.showOver('The Bay City PD finally caught up with you.', stats);
      SB.audio.setEngine(0, false);
      SB.audio.setSiren(false);
    },

    togglePause: function () {
      var st = SB.state;
      if (st.mode === 'playing') {
        st.mode = 'paused';
        SB.hud.showPause();
        this.saveGame();
      } else if (st.mode === 'paused') {
        st.mode = 'playing';
        SB.hud.hidePause();
      }
    },

    saveGame: function () {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
          money: SB.state.money,
          missionIndex: SB.state.missionIndex,
          x: player.position.x,
          z: player.position.z,
        }));
      } catch (e) { /* storage unavailable: play on without saving */ }
    },

    loadGame: function () {
      try {
        var raw = localStorage.getItem(SAVE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },

    // ---- per-frame updates ----

    updatePlayerOnFoot: function (dt) {
      var input = SB.input.moveAxis();
      var running = SB.input.down('ShiftLeft') || SB.input.down('ShiftRight');
      var speed = running ? C.runSpeed : C.walkSpeed;
      // Move relative to the camera yaw.
      var fwdX = -Math.sin(camYaw);
      var fwdZ = -Math.cos(camYaw);
      var rightX = Math.cos(camYaw);
      var rightZ = -Math.sin(camYaw);
      var mx = fwdX * input.y + rightX * input.x;
      var mz = fwdZ * input.y + rightZ * input.x;
      var len = Math.sqrt(mx * mx + mz * mz);
      if (len > 0.01) {
        mx /= len;
        mz /= len;
        var targetHeading = Math.atan2(mx, mz);
        player.heading = SB.util.angleLerp(player.heading, targetHeading, Math.min(1, dt * 10));
        var nx = player.position.x + mx * speed * dt;
        var nz = player.position.z + mz * speed * dt;
        var hit = SB.city.collideCircle(nx, nz, C.playerRadius);
        player.position.x = hit.x;
        player.position.z = hit.z;
        player.walkPhase += dt * speed * 1.6;
      }
      // Jump and gravity.
      if (SB.input.pressed('Space') && player.onGround) {
        player.vy = C.jumpSpeed;
        player.onGround = false;
      }
      player.vy -= C.gravity * dt;
      player.position.y += player.vy * dt;
      if (player.position.y <= 0) {
        player.position.y = 0;
        player.vy = 0;
        player.onGround = true;
      }
      // Mesh follows the player.
      playerMesh.position.copy(player.position);
      playerMesh.rotation.y = player.heading;
      var swing = len > 0.01 ? Math.sin(player.walkPhase) * 0.55 : 0;
      playerMesh.userData.legL.rotation.x = swing;
      playerMesh.userData.legR.rotation.x = -swing;
      playerMesh.userData.gun.visible = SB.state.weapon === 'pistol';
      // Health regen, slow, when not wanted.
      if (SB.state.wanted === 0 && SB.state.health > 0 && SB.state.health < 100) {
        SB.state.health = Math.min(100, SB.state.health + 1.5 * dt);
      }
    },

    updateCamera: function (dt) {
      var delta = SB.input.mouseDelta();
      camYaw -= delta.x * 0.004;
      camPitch = SB.util.clamp(camPitch + delta.y * 0.003, 0.08, 1.1);
      var st = SB.state;
      var target;
      var dist = camDist;
      if (st.inCar) {
        var car = st.inCar;
        // Chase cam: drift back behind the car, mouse drag offsets it.
        camYawOffset = SB.util.lerp(camYawOffset, 0, Math.min(1, dt * 0.9));
        var wantYaw = car.heading + Math.PI + camYawOffset;
        camYaw = SB.util.angleLerp(camYaw, wantYaw, Math.min(1, dt * 3.2));
        target = car.mesh.position.clone();
        target.y = 1.8;
        dist = 12.5;
      } else {
        target = player.position.clone();
        target.y = 1.7;
        dist = 8.5;
      }
      var off = new THREE.Vector3(
        Math.sin(camYaw) * Math.cos(camPitch),
        Math.sin(camPitch),
        Math.cos(camYaw) * Math.cos(camPitch)
      ).multiplyScalar(dist);
      var pos = target.clone().add(off);
      // Keep the camera out of buildings: clamp it above the ground.
      if (pos.y < 0.6) pos.y = 0.6;
      camera.position.lerp(pos, Math.min(1, dt * 14));
      camera.lookAt(target);
    },

    updateInteraction: function () {
      var st = SB.state;
      // E: enter/exit cars, or retry a failed mission at its marker.
      if (SB.input.pressed('KeyE')) {
        if (st.inCar) {
          SB.vehicles.exitCar();
        } else if (SB.missions.tryRetry()) {
          // retried
        } else {
          var p = this.playerPosition();
          var car = SB.vehicles.nearestCar(p.x, p.z, 3.6);
          if (car) SB.vehicles.enterCar(car);
        }
      }
      // Weapons: 1 fists, 2 pistol, R reload, click/F to attack.
      if (SB.input.pressed('Digit1')) { st.weapon = 'fists'; SB.hud.toast('Fists'); }
      if (SB.input.pressed('Digit2')) { st.weapon = 'pistol'; SB.hud.toast('Pistol ready — click to shoot'); }
      if (SB.input.pressed('KeyR')) SB.combat.reload();
      if (st.mode === 'playing' && !st.inCar) {
        if (SB.input.consumeClick()) {
          if (st.weapon === 'pistol') SB.combat.shoot();
          else SB.combat.punch();
        } else if (SB.input.pressed('KeyF')) {
          SB.combat.punch();
        }
      } else {
        SB.input.consumeClick();
      }
      // Hint line: what E does right now.
      if (!st.inCar) {
        var p2 = this.playerPosition();
        var near = SB.vehicles.nearestCar(p2.x, p2.z, 3.6);
        if (near) SB.hud.setHint(near.parked ? 'Press E to steal this car' : 'Press E to jack this car');
        else if (SB.missions.retryArmed) SB.hud.setHint('Press E at the marker to retry the job');
        else SB.hud.setHint('');
      } else {
        SB.hud.setHint('E — get out · W/S drive · Shift — handbrake');
      }
    },

    loop: function (now) {
      requestAnimationFrame(this.loop.bind(this));
      var dt = Math.min(0.05, (now - clock.last) / 1000 || 0.016);
      clock.last = now;
      var st = SB.state;

      if (st.mode === 'playing') {
        st.time += dt;
        if (SB.input.pressed('Escape')) { this.togglePause(); }
        if (st.inCar) SB.vehicles.updatePlayerCar(dt);
        else this.updatePlayerOnFoot(dt);
        this.updateCamera(dt);
        this.updateInteraction();
        SB.traffic.update(dt, st.time);
        SB.police.update(dt);
        SB.combat.update(dt);
        SB.missions.update(dt);
        SB.city.update(dt, st.time);
        SB.audio.update(dt);
        SB.hud.update();
        saveTimer += dt;
        if (saveTimer > 15) { saveTimer = 0; this.saveGame(); }
        if (st.health <= 0) this.gameOver();
      } else if (st.mode === 'menu') {
        // Slow orbit behind the start screen.
        var t = now * 0.00005;
        camera.position.set(Math.sin(t) * 160, 55, Math.cos(t) * 160);
        camera.lookAt(0, 8, 0);
        SB.city.update(dt, st.time);
        SB.traffic.update(dt, st.time);
      } else if (st.mode === 'paused' || st.mode === 'over' || st.mode === 'won') {
        if (st.mode === 'paused' && SB.input.pressed('Escape')) this.togglePause();
      }

      SB.input.endFrame();
      renderer.render(scene, camera);
    },
  };

  // Boot once the page (and three.js) has loaded.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { SB.main.init(); });
  } else {
    SB.main.init();
  }
})();
