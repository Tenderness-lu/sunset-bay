// Sunset Bay police: the wanted system and the Bay City PD.
// Crimes raise the wanted level; police cars spawn, chase and ram the player.
// The heat falls when the player lays low and stays out of sight.

(function () {
  'use strict';

  var C = SB.CONFIG;

  SB.police = {
    cars: [],

    commitCrime: function (stars, message) {
      var st = SB.state;
      st.wanted = Math.min(5, st.wanted + stars);
      st.lastCrimeAt = st.time;
      if (message) SB.hud.toast(message + ' +' + stars + ' wanted star' + (stars > 1 ? 's' : ''));
    },

    spawnPolice: function () {
      var st = SB.state;
      var want = Math.min(st.wanted, C.maxPolice);
      while (this.cars.length < want) {
        var car = SB.vehicles.makeCar({ police: true });
        var p = SB.main.playerPosition();
        var angle = Math.random() * Math.PI * 2;
        var x = p.x + Math.sin(angle) * 90;
        var z = p.z + Math.cos(angle) * 90;
        // Snap the spawn onto the nearest street so police start on a road.
        var nearX = SB.city.streetLines.reduce(function (a, s) { return Math.abs(s - x) < Math.abs(a - x) ? s : a; }, 0);
        var nearZ = SB.city.streetLines.reduce(function (a, s) { return Math.abs(s - z) < Math.abs(a - z) ? s : a; }, 0);
        if (Math.abs(x - nearX) < Math.abs(z - nearZ)) x = nearX; else z = nearZ;
        var clamped = SB.city.collideCircle(x, z, 2);
        SB.vehicles.addCar(car, clamped.x, clamped.z, Math.atan2(p.x - clamped.x, p.z - clamped.z));
        car.speed = 12;
        this.cars.push(car);
        SB.hud.toast('Bay City PD is on you!');
      }
      // Extra stars beyond the cap just make the existing cars faster.
    },

    removeAll: function () {
      var self = this;
      this.cars.slice().forEach(function (car) {
        SB.vehicles.removeCar(car);
      });
      this.cars = [];
    },

    update: function (dt) {
      var st = SB.state;
      // Wanted decay: lay low, stay out of sight, and the heat falls.
      if (st.wanted > 0 && st.time - st.lastCrimeAt > C.wantedDecayDelay) {
        var nearest = 999;
        this.cars.forEach(function (car) {
          var p = SB.main.playerPosition();
          nearest = Math.min(nearest, SB.util.dist2d(p.x, p.z, car.mesh.position.x, car.mesh.position.z));
        });
        if (nearest > 45) {
          st.wantedTimer = (st.wantedTimer || 0) + dt;
          if (st.wantedTimer > C.wantedDecayEvery) {
            st.wantedTimer = 0;
            st.wanted--;
            SB.hud.toast('Heat is cooling off… ' + st.wanted + ' star' + (st.wanted === 1 ? '' : 's'));
            if (st.wanted === 0) this.removeAll();
          }
        } else {
          st.wantedTimer = 0;
        }
      }
      this.spawnPolice();
      var p = SB.main.playerPosition();
      var playerCar = SB.vehicles.playerCar;
      var self = this;
      this.cars.forEach(function (car) {
        // Chase: steer toward the player, grid-style — chase the larger axis first.
        var dx = p.x - car.mesh.position.x;
        var dz = p.z - car.mesh.position.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        var wantHeading;
        if (Math.abs(dx) > Math.abs(dz)) wantHeading = Math.atan2(Math.sign(dx), 0);
        else wantHeading = Math.atan2(0, Math.sign(dz));
        // Blend in a direct heading when close, so police can ram.
        if (dist < 30) wantHeading = Math.atan2(dx, dz);
        car.heading = SB.util.angleLerp(car.heading, wantHeading, Math.min(1, dt * 1.6));
        var maxSpeed = 16 + st.wanted * 3.2;
        car.speed = SB.util.lerp(car.speed, maxSpeed, Math.min(1, dt * 0.8));
        var nx = car.mesh.position.x + Math.sin(car.heading) * car.speed * dt;
        var nz = car.mesh.position.z + Math.cos(car.heading) * car.speed * dt;
        var hit = SB.city.collideCircle(nx, nz, 1.7);
        if (hit.hit) {
          // Stuck on a building: swing around.
          car.heading += Math.PI / 2;
          car.speed *= 0.5;
        }
        car.mesh.position.x = hit.x;
        car.mesh.position.z = hit.z;
        car.mesh.rotation.y = car.heading;
        // Flashing light bar.
        var phase = Math.floor(st.time * 6) % 2 === 0;
        if (car.mesh.userData.lightRed) {
          car.mesh.userData.lightRed.visible = phase;
          car.mesh.userData.lightBlue.visible = !phase;
        }
        // Ram the player.
        if (dist < 3.2) {
          if (playerCar) {
            playerCar.speed *= 0.55;
            st.health = Math.max(0, st.health - 6 * dt);
            SB.hud.flashDamage();
            if (Math.random() < dt * 2) SB.audio.crash();
          } else {
            st.health = Math.max(0, st.health - 10 * dt);
            SB.hud.flashDamage();
            // Shove the player away from the ram.
            var pp = SB.main.player;
            pp.position.x += (dx / (dist || 1)) * -2 * dt * 10;
            pp.position.z += (dz / (dist || 1)) * -2 * dt * 10;
          }
        }
      });
      SB.audio.setSiren(st.wanted > 0 && this.cars.length > 0);
    },
  };
})();
