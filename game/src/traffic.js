// Sunset Bay traffic: cars that drive the street grid and pedestrians on the sidewalks.
// Traffic follows the roads, turns at intersections, and slows for the car ahead.
// Pedestrians stroll, flee from danger, and can be knocked down (a crime).

(function () {
  'use strict';

  var C = SB.CONFIG;
  var rng = SB.rng;
  var STREETS = [-180, -120, -60, 0, 60, 120, 180];
  var SHIRT_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0xfd79a8];

  SB.traffic = {
    cars: [], // traffic cars (driver 'traffic')
    pedestrians: [],

    spawn: function (scene) {
      // Traffic cars start spread over the grid, driving along a street.
      for (var i = 0; i < C.trafficCars; i++) {
        var car = SB.vehicles.makeCar({});
        var street = rng.pick(STREETS);
        var along = rng.range(-200, 200);
        var horizontal = rng.next() < 0.5;
        var heading = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
        var x = horizontal ? along : street + (rng.next() < 0.5 ? 3 : -3);
        var z = horizontal ? street + (rng.next() < 0.5 ? 3 : -3) : along;
        car.driver = 'traffic';
        car.parked = false;
        car.speed = rng.range(6, 11);
        // Face along the street the car is on.
        if (horizontal) car.heading = Math.abs(Math.sin(heading)) > 0.5 ? heading : 0;
        else car.heading = Math.abs(Math.cos(heading)) > 0.5 ? heading : Math.PI / 2;
        SB.vehicles.addCar(car, x, z, car.heading);
        car.targetSpeed = car.speed;
        this.cars.push(car);
      }
      // Pedestrians start on sidewalks.
      for (var j = 0; j < C.pedestrians; j++) {
        this.spawnPedestrian(rng.range(-200, 200), rng.range(-200, 200));
      }
    },

    spawnPedestrian: function (x, z) {
      var g = new THREE.Group();
      var shirt = new THREE.MeshLambertMaterial({ color: rng.pick(SHIRT_COLORS) });
      var skin = new THREE.MeshLambertMaterial({ color: 0xe0ac69 });
      var pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
      var body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), shirt);
      body.position.y = 1.05;
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
      head.position.y = 1.65;
      var legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.22), pants);
      legL.position.set(-0.14, 0.33, 0);
      var legR = legL.clone();
      legR.position.x = 0.14;
      g.add(body);
      g.add(head);
      g.add(legL);
      g.add(legR);
      g.userData.legL = legL;
      g.userData.legR = legR;
      var ped = {
        mesh: g,
        heading: rng.range(0, Math.PI * 2),
        speed: rng.range(1.2, 2.4),
        alive: true,
        fleeing: false,
        target: null,
        walkPhase: rng.range(0, 6),
      };
      g.position.set(x, 0, z);
      g.userData.ped = ped;
      SB.city.scene.add(g);
      this.pedestrians.push(ped);
      return ped;
    },

    // A driver yanked from their car runs away on foot.
    spawnFleeingDriver: function (x, z) {
      var ped = this.spawnPedestrian(x, z);
      ped.fleeing = true;
      ped.speed = 5;
      ped.target = { x: x + rng.range(-40, 40), z: z + rng.range(-40, 40) };
    },

    knockDown: function (ped) {
      if (!ped.alive) return;
      ped.alive = false;
      ped.mesh.rotation.x = Math.PI / 2;
      ped.mesh.position.y = 0.3;
      SB.state.kills++;
      setTimeout(function () {
        if (ped.mesh.parent) ped.mesh.parent.remove(ped.mesh);
        var i = SB.traffic.pedestrians.indexOf(ped);
        if (i >= 0) SB.traffic.pedestrians.splice(i, 1);
        SB.traffic.spawnPedestrian(rng.range(-200, 200), rng.range(-200, 200));
      }, 9000);
    },

    // Pedestrians near a gunshot or a speeding car run away from it.
    scareNear: function (x, z, radius) {
      this.pedestrians.forEach(function (ped) {
        if (!ped.alive) return;
        var d = SB.util.dist2d(x, z, ped.mesh.position.x, ped.mesh.position.z);
        if (d < radius) {
          ped.fleeing = true;
          ped.speed = 4.5;
          var away = Math.atan2(ped.mesh.position.x - x, ped.mesh.position.z - z);
          ped.target = {
            x: ped.mesh.position.x + Math.sin(away) * 50,
            z: ped.mesh.position.z + Math.cos(away) * 50,
          };
        }
      });
    },

    update: function (dt, time) {
      var self = this;
      // --- traffic cars ---
      this.cars.forEach(function (car) {
        if (car.driver !== 'traffic') return; // stolen cars stop being traffic
        // Slow down for a car ahead on the same street.
        var ahead = 999;
        self.cars.forEach(function (other) {
          if (other === car || other.driver === 'player') return;
          var dx = other.mesh.position.x - car.mesh.position.x;
          var dz = other.mesh.position.z - car.mesh.position.z;
          var forward = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
          var side = Math.abs(Math.cos(car.heading) * dx - Math.sin(car.heading) * dz);
          if (forward > 0 && forward < 16 && side < 3) ahead = Math.min(ahead, forward);
        });
        var playerCar = SB.vehicles.playerCar;
        if (playerCar) {
          var dx = playerCar.mesh.position.x - car.mesh.position.x;
          var dz = playerCar.mesh.position.z - car.mesh.position.z;
          var forward = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
          var side = Math.abs(Math.cos(car.heading) * dx - Math.sin(car.heading) * dz);
          if (forward > 0 && forward < 16 && side < 3) ahead = Math.min(ahead, forward);
        }
        var target = ahead < 16 ? Math.max(0, (ahead - 8) * 0.8) : car.targetSpeed;
        car.speed = SB.util.lerp(car.speed, target, Math.min(1, dt * 2));
        var nx = car.mesh.position.x + Math.sin(car.heading) * car.speed * dt;
        var nz = car.mesh.position.z + Math.cos(car.heading) * car.speed * dt;
        // At an intersection, sometimes turn onto the crossing street.
        var nearX = STREETS.reduce(function (a, s) { return Math.abs(s - nx) < Math.abs(a - nx) ? s : a; }, STREETS[0]);
        var nearZ = STREETS.reduce(function (a, s) { return Math.abs(s - nz) < Math.abs(a - nz) ? s : a; }, STREETS[0]);
        if (Math.abs(nx - nearX) < 1.2 && Math.abs(nz - nearZ) < 1.2 && rng.next() < dt * 0.25) {
          car.heading += rng.pick([-Math.PI / 2, Math.PI / 2]);
          // Snap onto the new street centre line.
          if (Math.abs(Math.sin(car.heading)) > 0.5) nz = nearZ + (rng.next() < 0.5 ? 3 : -3);
          else nx = nearX + (rng.next() < 0.5 ? 3 : -3);
        }
        var hit = SB.city.collideCircle(nx, nz, 1.7);
        car.mesh.position.x = hit.x;
        car.mesh.position.z = hit.z;
        if (hit.hit) car.heading += Math.PI / 2 * dt * 2; // nudge away from a wall
        car.mesh.rotation.y = car.heading;
      });

      // --- pedestrians ---
      this.pedestrians.forEach(function (ped) {
        if (!ped.alive) return;
        ped.walkPhase += dt * (ped.fleeing ? 10 : 6);
        if (!ped.target || SB.util.dist2d(ped.mesh.position.x, ped.mesh.position.z, ped.target.x, ped.target.z) < 3) {
          if (ped.fleeing) {
            ped.fleeing = false;
            ped.speed = rng.range(1.2, 2.4);
          }
          // Pick a new stroll target on a nearby sidewalk.
          var street = rng.pick(STREETS);
          var along = rng.range(-200, 200);
          ped.target = rng.next() < 0.5
            ? { x: along, z: street + (rng.next() < 0.5 ? 8 : -8) }
            : { x: street + (rng.next() < 0.5 ? 8 : -8), z: along };
        }
        var dx = ped.target.x - ped.mesh.position.x;
        var dz = ped.target.z - ped.mesh.position.z;
        var want = Math.atan2(dx, dz);
        ped.heading = SB.util.angleLerp(ped.heading, want, Math.min(1, dt * 4));
        var nx = ped.mesh.position.x + Math.sin(ped.heading) * ped.speed * dt;
        var nz = ped.mesh.position.z + Math.cos(ped.heading) * ped.speed * dt;
        var hit = SB.city.collideCircle(nx, nz, 0.6);
        ped.mesh.position.x = hit.x;
        ped.mesh.position.z = hit.z;
        ped.mesh.rotation.y = ped.heading;
        // Walking leg swing.
        var swing = Math.sin(ped.walkPhase) * 0.5;
        ped.mesh.userData.legL.rotation.x = swing;
        ped.mesh.userData.legR.rotation.x = -swing;
      });
    },
  };
})();
