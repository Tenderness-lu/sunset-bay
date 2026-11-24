// Sunset Bay combat: fists and a pistol.
// Pistol shots are hitscan raycasts from the camera with a tracer and muzzle flash.

(function () {
  'use strict';

  var C = SB.CONFIG;
  var raycaster = null;
  var tracer = null;
  var tracerLife = 0;
  var flash = null;
  var flashLife = 0;
  var shootCooldown = 0;
  var punchCooldown = 0;

  function ensureFx(scene) {
    if (!raycaster) raycaster = new THREE.Raycaster();
    if (!tracer) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8 }));
      tracer.visible = false;
      scene.add(tracer);
    }
    if (!flash) {
      flash = new THREE.PointLight(0xffc860, 0, 18);
      scene.add(flash);
    }
  }

  SB.combat = {
    init: function (scene) { ensureFx(scene); },

    update: function (dt) {
      shootCooldown = Math.max(0, shootCooldown - dt);
      punchCooldown = Math.max(0, punchCooldown - dt);
      if (tracerLife > 0) {
        tracerLife -= dt;
        if (tracerLife <= 0) tracer.visible = false;
      }
      if (flashLife > 0) {
        flashLife -= dt;
        if (flashLife <= 0) flash.intensity = 0;
      }
    },

    // Fire the pistol at whatever the camera looks at.
    shoot: function () {
      var st = SB.state;
      if (st.weapon !== 'pistol' || shootCooldown > 0) return;
      if (st.ammo <= 0) {
        SB.hud.toast('Click — empty! Press R to reload');
        shootCooldown = 0.35;
        return;
      }
      st.ammo--;
      shootCooldown = 0.22;
      SB.audio.gunshot();
      var scene = SB.city.scene;
      ensureFx(scene);
      var camera = SB.main.camera;
      var origin = camera.position.clone();
      var dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      raycaster.set(origin, dir);
      raycaster.far = C.pistolRange;
      // Targets: pedestrians and police cars (their meshes).
      var targets = [];
      SB.traffic.pedestrians.forEach(function (ped) {
        if (ped.alive) targets.push(ped.mesh);
      });
      SB.police.cars.forEach(function (car) { targets.push(car.mesh); });
      SB.traffic.cars.forEach(function (car) { targets.push(car.mesh); });
      var hits = raycaster.intersectObjects(targets, true);
      var end = origin.clone().add(dir.clone().multiplyScalar(C.pistolRange));
      if (hits.length > 0) {
        var hit = hits[0];
        end = hit.point.clone();
        // Walk up to the object that owns game data.
        var obj = hit.object;
        while (obj && !obj.userData.ped && !obj.userData.car) obj = obj.parent;
        if (obj && obj.userData.ped) {
          SB.traffic.knockDown(obj.userData.ped);
          SB.police.commitCrime(1, 'You shot someone!');
        } else if (obj && obj.userData.car && obj.userData.car.isPolice) {
          SB.police.commitCrime(1, 'You shot at the police!');
          SB.hud.toast('Police car hit — they are not happy');
        }
      }
      // Tracer line from the player's gun to the hit point.
      var from = SB.main.gunPosition();
      var pos = tracer.geometry.attributes.position;
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, end.x, end.y, end.z);
      pos.needsUpdate = true;
      tracer.visible = true;
      tracerLife = 0.07;
      flash.position.copy(from);
      flash.intensity = 3;
      flashLife = 0.06;
      // Noise scares the crowd.
      SB.traffic.scareNear(from.x, from.z, 25);
      if (st.ammo === 0) SB.hud.toast('Magazine empty — press R to reload');
    },

    punch: function () {
      var st = SB.state;
      if (punchCooldown > 0) return;
      punchCooldown = 0.45;
      SB.audio.punch();
      var p = SB.main.playerPosition();
      var heading = SB.main.player.heading;
      var fx = p.x + Math.sin(heading) * 1.6;
      var fz = p.z + Math.cos(heading) * 1.6;
      SB.traffic.pedestrians.forEach(function (ped) {
        if (!ped.alive) return;
        var d = SB.util.dist2d(fx, fz, ped.mesh.position.x, ped.mesh.position.z);
        if (d < C.punchRange) {
          SB.traffic.knockDown(ped);
          SB.police.commitCrime(1, 'You beat someone up!');
        }
      });
    },

    reload: function () {
      var st = SB.state;
      if (st.weapon !== 'pistol' || st.ammo === C.pistolMag) return;
      st.ammo = C.pistolMag;
      SB.audio.click();
      SB.hud.toast('Pistol reloaded');
    },
  };
})();
