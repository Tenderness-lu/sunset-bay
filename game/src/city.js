// Sunset Bay city: a procedural sun-soaked coastal city.
// Grid streets, varied buildings with lit windows, sidewalks, palms, the beach,
// the ocean, a canal bridge on the north edge, the marina, streetlights and traffic lights.

(function () {
  'use strict';

  var C = SB.CONFIG;
  var rng = SB.rng;

  // Street centre lines (both axes).
  var STREETS = [-180, -120, -60, 0, 60, 120, 180];
  var PALETTE = [0xe8b48a, 0xf2e3c6, 0x7fb3a8, 0xd97b6c, 0x9db8c8, 0xe8d29a, 0xc9a0b4, 0x8fa3c7];
  var NEON = [0xff2e88, 0x2effd6, 0xffd23e, 0x7b5cff];

  function windowTexture() {
    var cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 256;
    var g = cv.getContext('2d');
    g.fillStyle = '#cfc4ae';
    g.fillRect(0, 0, 128, 256);
    for (var y = 8; y < 248; y += 18) {
      for (var x = 8; x < 120; x += 16) {
        var lit = rng.next() < 0.45;
        g.fillStyle = lit ? '#ffd98a' : '#2c3a4a';
        g.fillRect(x, y, 10, 12);
      }
    }
    var tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function box(w, h, d, color, x, y, z, opts) {
    opts = opts || {};
    var mat = new THREE.MeshLambertMaterial({ color: color });
    if (opts.emissive) mat.emissive = new THREE.Color(opts.emissive);
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (opts.ry) m.rotation.y = opts.ry;
    return m;
  }

  SB.city = {
    scene: null,
    colliders: [], // {minX, maxX, minZ, maxZ}
    streetLines: STREETS,
    buildings: [],

    build: function (scene) {
      this.scene = scene;
      this.colliders = [];
      this.buildings = [];
      var winTex = windowTexture();

      // --- sky, sun, fog ---
      scene.background = new THREE.Color(0xff9e63);
      scene.fog = new THREE.Fog(0xf7a56b, 160, 720);
      var sun = new THREE.Mesh(
        new THREE.CircleGeometry(34, 32),
        new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false })
      );
      sun.position.set(-520, 90, -40);
      sun.lookAt(0, 60, 0);
      scene.add(sun);

      // --- ground, beach, ocean, canal ---
      var ground = new THREE.Mesh(
        new THREE.PlaneGeometry(1100, 1100),
        new THREE.MeshLambertMaterial({ color: 0x8a9a5b })
      );
      ground.rotation.x = -Math.PI / 2;
      scene.add(ground);

      var beach = new THREE.Mesh(
        new THREE.PlaneGeometry(120, 460),
        new THREE.MeshLambertMaterial({ color: 0xe8d29a })
      );
      beach.rotation.x = -Math.PI / 2;
      beach.position.set(-270, 0.02, 0);
      scene.add(beach);

      var ocean = new THREE.Mesh(
        new THREE.PlaneGeometry(560, 1100),
        new THREE.MeshLambertMaterial({ color: 0x2a6f9e })
      );
      ocean.rotation.x = -Math.PI / 2;
      ocean.position.set(-610, 0.01, 0);
      scene.add(ocean);

      var canal = new THREE.Mesh(
        new THREE.PlaneGeometry(460, 34),
        new THREE.MeshLambertMaterial({ color: 0x2a6f9e })
      );
      canal.rotation.x = -Math.PI / 2;
      canal.position.set(0, 0.015, -227);
      scene.add(canal);

      // --- roads and sidewalks ---
      var roadMat = new THREE.MeshLambertMaterial({ color: 0x33363b });
      var walkMat = new THREE.MeshLambertMaterial({ color: 0x9a9a92 });
      STREETS.forEach(function (s) {
        var r1 = new THREE.Mesh(new THREE.PlaneGeometry(460, C.streetWidth), roadMat);
        r1.rotation.x = -Math.PI / 2;
        r1.position.set(0, 0.03, s);
        scene.add(r1);
        var r2 = new THREE.Mesh(new THREE.PlaneGeometry(C.streetWidth, 460), roadMat);
        r2.rotation.x = -Math.PI / 2;
        r2.position.set(s, 0.03, 0);
        scene.add(r2);
        // Sidewalks flank each road.
        [[0, s - 7.5, 460, 3], [0, s + 7.5, 460, 3], [s - 7.5, 0, 3, 460], [s + 7.5, 0, 3, 460]].forEach(function (p) {
          var w = new THREE.Mesh(new THREE.PlaneGeometry(p[2], p[3]), walkMat);
          w.rotation.x = -Math.PI / 2;
          w.position.set(p[0], 0.04, p[1]);
          scene.add(w);
        });
      });

      // --- dashed centre lines (one instanced mesh) ---
      var dashGeo = new THREE.PlaneGeometry(3, 0.5);
      var dashMat = new THREE.MeshBasicMaterial({ color: 0xf5e9c8 });
      var dashes = [];
      STREETS.forEach(function (s) {
        for (var d = -222; d <= 222; d += 8) {
          dashes.push([d, s, 0]);
          dashes.push([s, d, 1]);
        }
      });
      var dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
      var m4 = new THREE.Matrix4();
      var q = new THREE.Quaternion();
      var eu = new THREE.Euler();
      dashes.forEach(function (p, i) {
        eu.set(-Math.PI / 2, 0, p[2] ? Math.PI / 2 : 0);
        q.setFromEuler(eu);
        m4.compose(new THREE.Vector3(p[0], 0.05, p[1]), q, new THREE.Vector3(1, 1, 1));
        dashMesh.setMatrixAt(i, m4);
      });
      scene.add(dashMesh);

      // --- buildings, one or two per block ---
      var blockCentres = [-150, -90, -30, 30, 90, 150];
      var self = this;
      blockCentres.forEach(function (bx) {
        blockCentres.forEach(function (bz) {
          var distCentre = Math.sqrt(bx * bx + bz * bz);
          var tall = distCentre < 90 ? 1 : 0.4;
          var count = rng.next() < 0.55 ? 2 : 1;
          for (var i = 0; i < count; i++) {
            var w = rng.range(14, 26);
            var d = rng.range(14, 26);
            var h = rng.range(9, 26) + tall * rng.range(8, 34);
            var ox = count === 1 ? 0 : (i === 0 ? -11 : 11);
            var oz = count === 1 ? 0 : (i === 0 ? -11 : 11);
            var x = bx + ox;
            var z = bz + oz;
            var tex = winTex.clone();
            tex.needsUpdate = true;
            tex.repeat.set(Math.max(1, Math.round(w / 9)), Math.max(1, Math.round(h / 11)));
            var mat = new THREE.MeshLambertMaterial({ color: rng.pick(PALETTE), map: tex });
            var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            b.position.set(x, h / 2, z);
            scene.add(b);
            // Roof cap and a neon sign on some buildings.
            var roof = box(w + 0.6, 0.8, d + 0.6, 0x4a3f35, x, h + 0.4, z);
            scene.add(roof);
            if (rng.next() < 0.35) {
              var sign = box(0.6, 3.2, 6, 0x222222, x + w / 2 + 0.4, h * 0.7, z, { emissive: rng.pick(NEON) });
              scene.add(sign);
            }
            self.buildings.push(b);
            self.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
          }
        });
      });

      // --- trees inside the blocks, so no lot is bare dirt ---
      var trunkMat2 = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
      var leafMat2 = new THREE.MeshLambertMaterial({ color: 0x4e9e57 });
      blockCentres.forEach(function (bx) {
        blockCentres.forEach(function (bz) {
          [[-17, -17], [17, 17], [-17, 17]].forEach(function (o) {
            if (rng.next() < 0.45) return;
            var tx = bx + o[0] + rng.range(-2, 2);
            var tz = bz + o[1] + rng.range(-2, 2);
            var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 2.6, 6), trunkMat2);
            trunk.position.set(tx, 1.3, tz);
            scene.add(trunk);
            var crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 0), leafMat2);
            crown.position.set(tx, 3.6, tz);
            scene.add(crown);
            self.colliders.push({ minX: tx - 0.4, maxX: tx + 0.4, minZ: tz - 0.4, maxZ: tz + 0.4 });
          });
        });
      });

      // --- the north bridge over the canal (drivable causeway) ---
      var deck = box(20, 1, 46, 0x3a3d42, 0, 0.5, -227);
      scene.add(deck);
      var railL = box(0.8, 1.2, 46, 0x777777, -10, 1.6, -227);
      var railR = box(0.8, 1.2, 46, 0x777777, 10, 1.6, -227);
      scene.add(railL);
      scene.add(railR);
      this.colliders.push({ minX: -11, maxX: -9, minZ: -250, maxZ: -204 });
      this.colliders.push({ minX: 9, maxX: 11, minZ: -250, maxZ: -204 });
      // Bridge pillars in the water.
      [-240, -227, -214].forEach(function (z) {
        scene.add(box(3, 6, 3, 0x666666, -6, -1, z));
        scene.add(box(3, 6, 3, 0x666666, 6, -1, z));
      });

      // --- marina docks and boats (south-west, on the beach) ---
      var dockMat = new THREE.MeshLambertMaterial({ color: 0x8a6b45 });
      [[-238, 90], [-238, 130]].forEach(function (p) {
        var dock = new THREE.Mesh(new THREE.PlaneGeometry(26, 4), dockMat);
        dock.rotation.x = -Math.PI / 2;
        dock.position.set(p[0], 0.06, p[1]);
        scene.add(dock);
      });
      [[-252, 104], [-250, 138], [-256, 76]].forEach(function (p, i) {
        var hull = box(4, 1.6, 12, i === 1 ? 0xf2f2f2 : 0xd94f3d, p[0], 0.8, p[1]);
        scene.add(hull);
        var mast = box(0.3, 9, 0.3, 0x5a4632, p[0], 5.5, p[1]);
        scene.add(mast);
      });

      // --- palm trees along the beach and Ocean Drive ---
      var trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5c38 });
      var leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
      function palm(x, z) {
        var g = new THREE.Group();
        var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 6), trunkMat);
        trunk.position.y = 3.5;
        trunk.rotation.z = rng.range(-0.08, 0.08);
        g.add(trunk);
        for (var i = 0; i < 6; i++) {
          var leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.5, 4), leafMat);
          leaf.position.y = 7.2;
          leaf.rotation.z = Math.PI / 2.6;
          leaf.rotation.y = (i / 6) * Math.PI * 2;
          leaf.position.x = Math.cos((i / 6) * Math.PI * 2) * 1.4;
          leaf.position.z = Math.sin((i / 6) * Math.PI * 2) * 1.4;
          g.add(leaf);
        }
        g.position.set(x, 0, z);
        scene.add(g);
      }
      for (var px = -224; px <= 224; px += 28) palm(-222, px);
      [-180, -60, 60, 180].forEach(function (s) {
        palm(s - 9.5, -150);
        palm(s + 9.5, 90);
      });

      // --- streetlights at intersections ---
      var poleMat = new THREE.MeshLambertMaterial({ color: 0x2f3337 });
      var lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffe9a0 });
      STREETS.forEach(function (sx) {
        STREETS.forEach(function (sz) {
          if ((sx + sz) % 120 !== 0) return;
          var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), poleMat);
          pole.position.set(sx + 8, 3.5, sz + 8);
          scene.add(pole);
          var arm = box(3, 0.18, 0.18, 0x2f3337, sx + 6.6, 6.9, sz + 8);
          scene.add(arm);
          var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampMat);
          lamp.position.set(sx + 5.2, 6.8, sz + 8);
          scene.add(lamp);
        });
      });

      // --- traffic lights (cycle green/red slowly) ---
      this.trafficLights = [];
      [[-60, -60], [60, 60], [0, -120], [120, 0], [-120, 120]].forEach(function (p) {
        var g = new THREE.Group();
        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 5.4, 6), poleMat);
        pole.position.y = 2.7;
        g.add(pole);
        var head = box(0.7, 1.9, 0.7, 0x1c1c1c, 0, 5.6, 0);
        g.add(head);
        var red = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
        red.position.set(0, 6.1, 0.4);
        g.add(red);
        var green = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0x22ff66 }));
        green.position.set(0, 5.2, 0.4);
        g.add(green);
        g.position.set(p[0] + 8.5, 0, p[1] + 8.5);
        scene.add(g);
        self.trafficLights.push({ red: red, green: green, phase: rng.next() * 6 });
      });
    },

    update: function (dt, time) {
      // Traffic lights blink between red and green.
      if (!this.trafficLights) return;
      this.trafficLights.forEach(function (t) {
        var on = Math.floor(time / 6 + t.phase) % 2 === 0;
        t.red.visible = !on;
        t.green.visible = on;
      });
    },

    // Is (x, z) on a road (within a street strip)?
    isOnRoad: function (x, z) {
      for (var i = 0; i < STREETS.length; i++) {
        var s = STREETS[i];
        if (Math.abs(x - s) <= C.streetWidth / 2 + 1) return true;
        if (Math.abs(z - s) <= C.streetWidth / 2 + 1) return true;
      }
      return false;
    },

    // Push a circle (x, z, radius) out of every building collider and the world edge.
    // Returns the corrected {x, z} and whether a hit happened.
    collideCircle: function (x, z, r) {
      var hit = false;
      var cols = this.colliders;
      for (var i = 0; i < cols.length; i++) {
        var c = cols[i];
        var cx = Math.max(c.minX, Math.min(x, c.maxX));
        var cz = Math.max(c.minZ, Math.min(z, c.maxZ));
        var dx = x - cx;
        var dz = z - cz;
        var d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          hit = true;
          if (d2 > 0.0001) {
            var d = Math.sqrt(d2);
            x = cx + (dx / d) * r;
            z = cz + (dz / d) * r;
          } else {
            // Centre inside the box: push out along the smallest penetration axis.
            var pl = x - (c.minX - r);
            var pr = (c.maxX + r) - x;
            var pt = z - (c.minZ - r);
            var pb = (c.maxZ + r) - z;
            var m = Math.min(pl, pr, pt, pb);
            if (m === pl) x = c.minX - r;
            else if (m === pr) x = c.maxX + r;
            else if (m === pt) z = c.minZ - r;
            else z = c.maxZ + r;
          }
        }
      }
      // World bounds: ocean to the west, city edge elsewhere.
      if (x < -320) { x = -320; hit = true; }
      if (x > 260) { x = 260; hit = true; }
      if (z < -260) { z = -260; hit = true; }
      if (z > 260) { z = 260; hit = true; }
      return { x: x, z: z, hit: hit };
    },
  };
})();
