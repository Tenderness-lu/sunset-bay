// Sunset Bay configuration: every tunable number and the shared game state.
// One global namespace, SB, holds the world so each system file can reach it.

var SB = SB || {};

(function () {
  'use strict';

  SB.CONFIG = {
    // City layout: streets run on a grid, blocks between them hold buildings.
    streetSpacing: 60, // distance between street centre lines
    streetWidth: 12,
    cityHalf: 210, // city spans -210..210 on x and z
    blockHalf: 21, // buildings sit inside a block of this half-size
    // The beach is west of the city (x < -210), the ocean beyond it.
    beachX: -210,
    oceanX: -330,
    // The highway bridge crosses the bay on the north edge.
    bridgeZ: -210,
    bridgeHalfWidth: 9,

    // Player on foot.
    walkSpeed: 6,
    runSpeed: 10,
    jumpSpeed: 8,
    gravity: 22,
    playerRadius: 0.7,
    playerHeight: 1.8,

    // Driving (arcade physics, units per second).
    carAccel: 20,
    carBrake: 34,
    carMaxSpeed: 38,
    carMaxReverse: 13,
    carSteer: 1.9,
    carGrip: 6.5,

    // Population.
    trafficCars: 14,
    pedestrians: 24,
    maxPolice: 5,

    // Wanted system.
    wantedDecayDelay: 25, // seconds without a crime before stars start to fall
    wantedDecayEvery: 9, // seconds per star lost while hiding

    // Combat.
    pistolDamage: 34,
    pistolMag: 12,
    pistolRange: 90,
    punchDamage: 20,
    punchRange: 2.4,

    // Missions.
    mission2TimeLimit: 150,
    mission3SurviveTime: 60,

    // Starting state.
    startMoney: 250,
    startHealth: 100,
  };

  // The live game state. main.js owns the loop; the systems below read and write it.
  SB.state = {
    mode: 'menu', // menu | playing | paused | over | won
    time: 0,
    money: SB.CONFIG.startMoney,
    health: SB.CONFIG.startHealth,
    wanted: 0,
    lastCrimeAt: -999,
    weapon: 'fists', // fists | pistol
    ammo: SB.CONFIG.pistolMag,
    ammoReserve: Infinity,
    inCar: null, // the car object the player drives, or null
    missionIndex: 0, // 0..2 active, 3 = all done
    missionState: 'idle', // idle | active | done
    missionTimer: 0,
    kills: 0,
    carsStolen: 0,
    packagesDelivered: 0,
    deaths: 0,
    freeRoam: false,
    muted: false,
  };

  // A tiny seeded random so the city layout is the same every load.
  SB.rng = (function () {
    var seed = 1337;
    function next() {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    return {
      next: next,
      range: function (a, b) { return a + (b - a) * next(); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      int: function (a, b) { return Math.floor(a + (b - a + 1) * next()); },
    };
  })();

  SB.util = {
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    dist2d: function (ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); },
    angleLerp: function (a, b, t) {
      var d = b - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return a + d * t;
    },
    fmtMoney: function (n) { return '$' + Math.round(n).toLocaleString('en-US'); },
  };
})();
