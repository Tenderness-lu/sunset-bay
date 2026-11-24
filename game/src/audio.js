// Sunset Bay sound: every sound is synthesized with WebAudio, no audio files.
// Engine hum, police sirens, gunshots, pickup chimes and a simple bass loop.

(function () {
  'use strict';

  var ctx = null;
  var master = null;
  var engineOsc = null;
  var engineGain = null;
  var engineFilter = null;
  var sirenOsc = null;
  var sirenGain = null;
  var sirenTimer = 0;
  var musicTimer = 0;
  var musicStep = 0;
  var musicOn = false;

  // The bass line: a moody sunset-drive loop (A minor, 96 bpm, 8 steps a bar).
  var BASS_NOTES = [55, 0, 55, 65.41, 49, 0, 55, 82.41, 55, 0, 55, 65.41, 58.27, 0, 49, 73.42];

  function ensureContext() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
      return false;
    }
    return true;
  }

  function noiseBuffer(seconds) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || SB.state.muted) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  SB.audio = {
    init: function () {
      if (!ensureContext()) return;
      // Engine: a sawtooth through a low-pass filter, pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a triangle wave whose pitch alternates hi/lo.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      musicOn = true;
    },

    setEngine: function (speed01, driving) {
      if (!ctx || !engineGain) return;
      var target = driving ? 0.05 + 0.10 * speed01 : 0;
      engineGain.gain.setTargetAtTime(SB.state.muted ? 0 : target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(48 + 130 * speed01, ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(350 + 900 * speed01, ctx.currentTime, 0.1);
    },

    setSiren: function (on) {
      if (!ctx || !sirenGain) return;
      sirenGain.gain.setTargetAtTime(on && !SB.state.muted ? 0.045 : 0, ctx.currentTime, 0.2);
    },

    update: function (dt) {
      if (!ctx || SB.state.muted) return;
      // Siren wail: alternate 750 / 1050 Hz every 0.45 s.
      if (sirenGain && sirenGain.gain.value > 0.005) {
        sirenTimer += dt;
        if (sirenTimer > 0.45) {
          sirenTimer = 0;
          sirenOsc.frequency.value = sirenOsc.frequency.value > 900 ? 750 : 1050;
        }
      }
      // Music: one bass note every 0.31 s while playing.
      if (musicOn) {
        musicTimer += dt;
        if (musicTimer >= 0.3125) {
          musicTimer -= 0.3125;
          var f = BASS_NOTES[musicStep % BASS_NOTES.length];
          musicStep++;
          if (f > 0) blip(f, 0.28, 'triangle', 0.16);
          if (musicStep % 4 === 0) blip(120, 0.12, 'sine', 0.22, 45); // kick thump
        }
      }
    },

    gunshot: function () {
      if (!ctx || SB.state.muted) return;
      var t = ctx.currentTime;
      var src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.16);
      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3200, t);
      filter.frequency.exponentialRampToValueAtTime(300, t + 0.14);
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t);
      blip(160, 0.08, 'square', 0.12, 60);
    },

    punch: function () {
      if (!ctx || SB.state.muted) return;
      var t = ctx.currentTime;
      var src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.09);
      var filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 300;
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t);
    },

    pickup: function () {
      blip(660, 0.12, 'sine', 0.25);
      setTimeout(function () { blip(990, 0.2, 'sine', 0.25); }, 110);
    },

    missionDone: function () {
      var notes = [523, 659, 784, 1047];
      notes.forEach(function (f, i) {
        setTimeout(function () { blip(f, 0.25, 'triangle', 0.25); }, i * 130);
      });
    },

    missionFail: function () {
      blip(220, 0.4, 'sawtooth', 0.2, 110);
      setTimeout(function () { blip(165, 0.5, 'sawtooth', 0.2, 82); }, 180);
    },

    crash: function () {
      if (!ctx || SB.state.muted) return;
      var t = ctx.currentTime;
      var src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.25);
      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t);
    },

    click: function () { blip(880, 0.06, 'square', 0.12); },

    setMuted: function (m) {
      SB.state.muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
  };
})();
