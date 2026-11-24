// Sunset Bay missions: three chained jobs from fixer Marla Vane.
// 1) First Pickup — collect a package at the marina.
// 2) Hot Delivery — timed run to the north bridge with the police on your tail.
// 3) The Getaway — survive a four-star wanted level or reach the hideout.

(function () {
  'use strict';

  var C = SB.CONFIG;

  var MISSIONS = [
    {
      title: 'JOB 1 — FIRST PICKUP',
      brief: 'Marla needs a package from the marina docks. Go to the green marker and press E to pick it up.',
      waypoint: { x: -238, z: 110 },
      reward: 500,
    },
    {
      title: 'JOB 2 — HOT DELIVERY',
      brief: 'The package goes to the north bridge — fast. The cops are already onto you. Deliver it before the timer runs out.',
      waypoint: { x: 0, z: -227 },
      reward: 1200,
      timeLimit: C.mission2TimeLimit,
      startWanted: 2,
    },
    {
      title: 'JOB 3 — THE GETAWAY',
      brief: 'Four stars. The whole Bay City PD is coming. Survive 60 seconds — or reach the hideout at the south docks.',
      waypoint: { x: -238, z: 190 },
      reward: 3000,
      startWanted: 4,
      survive: C.mission3SurviveTime,
    },
  ];

  var marker = null; // the floating waypoint beacon (mesh)
  var markerLight = null;
  var packageMesh = null;

  function makeMarker(scene) {
    // A tall glowing beacon + a floating ring, easy to spot across the city.
    var g = new THREE.Group();
    var beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.y = 30;
    g.add(beam);
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.25, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x39ff88 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.2;
    g.add(ring);
    markerLight = new THREE.PointLight(0x39ff88, 1.2, 30);
    markerLight.position.y = 4;
    g.add(markerLight);
    scene.add(g);
    return g;
  }

  SB.missions = {
    current: null, // the active mission definition
    markerPos: null, // {x, z} of the waypoint

    list: MISSIONS,

    start: function (index) {
      var st = SB.state;
      var m = MISSIONS[index];
      if (!m) return;
      st.missionIndex = index;
      st.missionState = 'active';
      st.missionTimer = m.timeLimit || m.survive || 0;
      this.current = m;
      this.markerPos = { x: m.waypoint.x, z: m.waypoint.z };
      if (!marker) marker = makeMarker(SB.city.scene);
      marker.visible = true;
      marker.position.set(m.waypoint.x, 0, m.waypoint.z);
      if (m.startWanted) {
        st.wanted = Math.max(st.wanted, m.startWanted);
        st.lastCrimeAt = st.time;
      }
      if (index === 0 && !packageMesh) {
        packageMesh = new THREE.Mesh(
          new THREE.BoxGeometry(1, 0.7, 1),
          new THREE.MeshLambertMaterial({ color: 0x8a5a2b, emissive: 0x332200 })
        );
        packageMesh.position.set(m.waypoint.x, 0.6, m.waypoint.z);
        SB.city.scene.add(packageMesh);
      }
      SB.hud.setObjective(m.title, m.brief);
      SB.hud.toast('New job: ' + m.title);
      SB.audio.pickup();
    },

    // Called every frame while a mission is active.
    update: function (dt) {
      var st = SB.state;
      if (st.missionState !== 'active' || !this.current) return;
      var m = this.current;
      if (marker) {
        marker.rotation.y += dt * 1.2;
        marker.children[1].position.y = 1.2 + Math.sin(st.time * 3) * 0.4;
      }
      if (m.timeLimit) {
        st.missionTimer -= dt;
        if (st.missionTimer <= 0) {
          this.fail('Too slow — the buyer walked away.');
          return;
        }
      }
      if (m.survive) {
        st.missionTimer -= dt;
        if (st.missionTimer <= 0) {
          this.complete('You outlasted the whole Bay City PD.');
          return;
        }
      }
      // Reaching the marker completes pickup/delivery jobs — and the hideout ends the getaway early.
      var p = SB.main.playerPosition();
      var d = SB.util.dist2d(p.x, p.z, m.waypoint.x, m.waypoint.z);
      if (d < 4.5) {
        if (st.missionIndex === 0) this.complete('Package secured. Marla is impressed.');
        else if (st.missionIndex === 1) this.complete('Delivered. Clean work, Rook.');
        else if (st.missionIndex === 2) this.complete('You slipped into the hideout. The trail is cold.');
      }
    },

    complete: function (message) {
      var st = SB.state;
      var m = this.current;
      st.money += m.reward;
      st.packagesDelivered++;
      st.missionState = 'done';
      if (marker) marker.visible = false;
      if (packageMesh && st.missionIndex === 0) {
        packageMesh.visible = false;
      }
      SB.audio.missionDone();
      SB.hud.toast(message + '  +' + SB.util.fmtMoney(m.reward));
      SB.hud.setObjective('JOB DONE', message);
      SB.main.saveGame();
      var next = st.missionIndex + 1;
      var self = this;
      setTimeout(function () {
        if (SB.state.mode !== 'playing') return;
        if (next < MISSIONS.length) self.start(next);
        else SB.main.winGame();
      }, 2600);
    },

    fail: function (message) {
      var st = SB.state;
      st.missionState = 'idle';
      // Leave the marker up so the player can walk back and retry.
      if (marker) marker.visible = true;
      SB.audio.missionFail();
      SB.hud.toast(message + ' — try the job again');
      SB.hud.setObjective('JOB FAILED', 'Press E at the marker to retry this job.');
      var self = this;
      // Retry by walking back to the marker and pressing E.
      this.retryArmed = true;
    },

    // E at a failed mission's marker restarts it.
    tryRetry: function () {
      var st = SB.state;
      if (!this.retryArmed || !this.current) return false;
      var p = SB.main.playerPosition();
      var m = this.current;
      if (SB.util.dist2d(p.x, p.z, m.waypoint.x, m.waypoint.z) < 4.5) {
        this.retryArmed = false;
        this.start(st.missionIndex);
        return true;
      }
      return false;
    },

    reset: function () {
      if (marker) marker.visible = false;
      if (packageMesh) packageMesh.visible = false;
      this.current = null;
      this.markerPos = null;
      this.retryArmed = false;
    },
  };
})();
