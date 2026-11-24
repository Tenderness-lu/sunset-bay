// Sunset Bay vehicles: low-poly car factory and arcade driving.
// Cars are boxes and cylinders only — body, cabin, wheels, lights — in many colours.

(function () {
  'use strict';

  var C = SB.CONFIG;
  var CAR_COLORS = [0xd94f3d, 0x3d7bd9, 0xf2c14e, 0x7ac74f, 0xe8e8e8, 0x222831, 0x9b59b6, 0x14b8a6, 0xd97b29];
  var rng = SB.rng;

  function box(w, h, d, color, x, y, z, opts) {
    opts = opts || {};
    var mat = new THREE.MeshLambertMaterial({ color: color });
    if (opts.emissive) mat.emissive = new THREE.Color(opts.emissive);
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  }

  SB.vehicles = {
    list: [], // every car in the world
    playerCar: null,

    // Build one car mesh. opts: { color, police }.
    makeCar: function (opts) {
      opts = opts || {};
      var color = opts.police ? 0x1a1a1a : (opts.color !== undefined ? opts.color : rng.pick(CAR_COLORS));
      var g = new THREE.Group();
      var body = box(2.0, 0.62, 4.4, color, 0, 0.62, 0);
      g.add(body);
      var cabin = box(1.7, 0.55, 2.2, opts.police ? 0xf2f2f2 : 0x1c2733, 0, 1.18, -0.2);
      g.add(cabin);
      // Headlights and taillights.
      g.add(box(0.4, 0.18, 0.1, 0xfff2c0, -0.65, 0.7, 2.22, { emissive: 0xffedb0 }));
      g.add(box(0.4, 0.18, 0.1, 0xfff2c0, 0.65, 0.7, 2.22, { emissive: 0xffedb0 }));
      g.add(box(0.4, 0.18, 0.1, 0xff2222, -0.65, 0.7, -2.22, { emissive: 0xaa0000 }));
      g.add(box(0.4, 0.18, 0.1, 0xff2222, 0.65, 0.7, -2.22, { emissive: 0xaa0000 }));
      if (opts.police) {
        var bar = box(1.4, 0.16, 0.5, 0x222222, 0, 1.55, -0.2);
        g.add(bar);
        var red = box(0.6, 0.18, 0.52, 0xff2222, -0.35, 1.55, -0.2, { emissive: 0xff0000 });
        var blue = box(0.6, 0.18, 0.52, 0x2244ff, 0.35, 1.55, -0.2, { emissive: 0x0022ff });
        g.add(red);
        g.add(blue);
        g.userData.lightRed = red;
        g.userData.lightBlue = blue;
      }
      // Wheels.
      var wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
      var wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
      [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]].forEach(function (p) {
        var w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(p[0], 0.38, p[1]);
        g.add(w);
      });
      var car = {
        mesh: g,
        heading: 0,
        speed: 0,
        isPolice: !!opts.police,
        parked: !opts.police,
        driver: opts.police ? 'police' : null,
        color: color,
        radius: 2.3,
        steer: 0,
        smoke: 0,
      };
      g.userData.car = car;
      return car;
    },

    addCar: function (car, x, z, heading) {
      car.mesh.position.set(x, 0, z);
      car.heading = heading || 0;
      car.mesh.rotation.y = car.heading;
      SB.city.scene.add(car.mesh);
      this.list.push(car);
      return car;
    },

    removeCar: function (car) {
      var i = this.list.indexOf(car);
      if (i >= 0) this.list.splice(i, 1);
      if (car.mesh.parent) car.mesh.parent.remove(car.mesh);
      if (this.playerCar === car) this.playerCar = null;
    },

    // Parked cars along the streets for the player to steal.
    spawnParkedCars: function (scene) {
      var spots = [];
      SB.city.streetLines.forEach(function (s) {
        [-150, -90, -30, 30, 90, 150].forEach(function (t) {
          if (rng.next() < 0.5) spots.push([s + 4.6, t + rng.range(-8, 8), Math.PI / 2]);
          if (rng.next() < 0.5) spots.push([t + rng.range(-8, 8), s + 4.6, 0]);
        });
      });
      var placed = 0;
      spots.forEach(function (sp) {
        if (placed >= 16) return;
        var c = SB.vehicles.makeCar({});
        SB.vehicles.addCar(c, sp[0], sp[1], sp[2]);
        placed++;
      });
    },

    // Nearest car within range of (x, z), or null.
    nearestCar: function (x, z, range) {
      var best = null;
      var bestD = range;
      this.list.forEach(function (c) {
        if (c.isPolice) return;
        var d = SB.util.dist2d(x, z, c.mesh.position.x, c.mesh.position.z);
        if (d < bestD) { bestD = d; best = c; }
      });
      return best;
    },

    // Player enters a car (stealing it is a crime unless it is theirs).
    enterCar: function (car) {
      var st = SB.state;
      if (car.parked || car.driver === 'traffic') {
        st.wanted = Math.min(5, st.wanted + 1);
        st.lastCrimeAt = st.time;
        st.carsStolen++;
        SB.hud.toast('Car stolen! The cops noticed. +1 wanted star');
      }
      if (car.driver === 'traffic') {
        // Yank the driver out: they flee on foot.
        SB.traffic.spawnFleeingDriver(car.mesh.position.x, car.mesh.position.z);
        car.driver = null;
      }
      car.parked = false;
      car.driver = 'player';
      this.playerCar = car;
      st.inCar = car;
      SB.main.hidePlayerMesh();
      SB.audio.click();
      SB.hud.toast('Press E to get out · Shift is the handbrake');
    },

    exitCar: function () {
      var st = SB.state;
      var car = this.playerCar;
      if (!car) return;
      car.driver = null;
      car.parked = true;
      car.speed = 0;
      this.playerCar = null;
      st.inCar = null;
      var p = SB.main.player;
      p.position.set(
        car.mesh.position.x + Math.sin(car.heading + Math.PI / 2) * 2.2,
        0,
        car.mesh.position.z + Math.cos(car.heading + Math.PI / 2) * 2.2
      );
      p.heading = car.heading;
      SB.main.showPlayerMesh();
    },

    // Arcade driving for the player's car.
    updatePlayerCar: function (dt) {
      var car = this.playerCar;
      if (!car) return;
      // Screenshot mode (?shot=chase) drives itself.
      var input = SB.autoDrive ? { x: 0, y: 1 } : SB.input.moveAxis();
      var handbrake = SB.input.down('ShiftLeft') || SB.input.down('ShiftRight');
      var accel = input.y > 0 ? C.carAccel : input.y < 0 ? -C.carBrake : 0;
      if (car.speed > 0.5 && input.y < 0) accel = -C.carBrake; // brake while moving forward
      if (car.speed < -0.5 && input.y > 0) accel = C.carAccel;
      car.speed += accel * dt;
      // Drag and grip.
      var drag = handbrake ? 2.2 : 0.55;
      car.speed -= car.speed * drag * dt;
      car.speed = SB.util.clamp(car.speed, -C.carMaxReverse, C.carMaxSpeed);
      if (Math.abs(car.speed) < 0.05 && input.y === 0) car.speed = 0;
      // Steering scales with speed; handbrake lets the tail slide.
      var steerTarget = -input.x * C.carSteer * (handbrake ? 1.6 : 1);
      car.steer = SB.util.lerp(car.steer, steerTarget, Math.min(1, dt * 8));
      var speedFactor = SB.util.clamp(Math.abs(car.speed) / 12, 0, 1);
      car.heading += car.steer * speedFactor * (car.speed >= 0 ? 1 : -1) * dt * (handbrake ? 1.5 : 1);
      var nx = car.mesh.position.x + Math.sin(car.heading) * car.speed * dt;
      var nz = car.mesh.position.z + Math.cos(car.heading) * car.speed * dt;
      var hit = SB.city.collideCircle(nx, nz, 1.7);
      if (hit.hit && Math.abs(car.speed) > 12) {
        SB.audio.crash();
        SB.state.health = Math.max(0, SB.state.health - 4);
        SB.hud.flashDamage();
        car.speed *= 0.35;
      }
      car.mesh.position.x = hit.x;
      car.mesh.position.z = hit.z;
      car.mesh.rotation.y = car.heading;
      // Body roll and pitch for feel.
      car.mesh.rotation.z = SB.util.lerp(car.mesh.rotation.z, -car.steer * 0.06 * speedFactor, Math.min(1, dt * 6));
      car.mesh.rotation.x = SB.util.lerp(car.mesh.rotation.x, -0.02 * (car.speed / C.carMaxSpeed), Math.min(1, dt * 6));
      // Bump into other cars and pedestrians.
      this.list.forEach(function (other) {
        if (other === car) return;
        var d = SB.util.dist2d(car.mesh.position.x, car.mesh.position.z, other.mesh.position.x, other.mesh.position.z);
        var min = car.radius + other.radius - 0.6;
        if (d < min && d > 0.01) {
          var push = (min - d) / 2;
          var dx = (other.mesh.position.x - car.mesh.position.x) / d;
          var dz = (other.mesh.position.z - car.mesh.position.z) / d;
          car.mesh.position.x -= dx * push;
          car.mesh.position.z -= dz * push;
          if (other.driver !== 'player') {
            other.mesh.position.x += dx * push;
            other.mesh.position.z += dz * push;
          }
          if (Math.abs(car.speed) > 10) {
            car.speed *= 0.6;
            SB.audio.crash();
            if (other.driver === 'traffic') SB.police.commitCrime(1, 'You rammed a driver!');
          }
        }
      });
      // Running over pedestrians.
      SB.traffic.pedestrians.forEach(function (ped) {
        if (!ped.alive) return;
        var d = SB.util.dist2d(car.mesh.position.x, car.mesh.position.z, ped.mesh.position.x, ped.mesh.position.z);
        if (d < 2.0 && Math.abs(car.speed) > 3) {
          SB.traffic.knockDown(ped);
          SB.police.commitCrime(1, 'You hit a pedestrian!');
        }
      });
      SB.audio.setEngine(Math.abs(car.speed) / C.carMaxSpeed, true);
    },
  };
})();
