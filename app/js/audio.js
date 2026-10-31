/* Music + synthesized HBC-style interface sounds.

   Samsung TVs only give a web app one or two hardware media pipelines, so the
   intro and the background loop share ONE <audio> element and swap its source.
   (Two preloaded elements made the second one steal the pipeline, which is why
   the intro used to stay silent.) */
(function (window) {
  'use strict';

  var HBC = window.HBC = window.HBC || {};
  var U = HBC.Util;

  var SRC = { intro: 'res/audio/intro.mp3', bgm: 'res/audio/bgm.mp3' };
  var VOL = { intro: 0.85, bgm: 0.34, bgmDucked: 0.11 };

  var music = null;
  var current = '';
  var ctx = null;
  var introWanted = false;
  var bgmWanted = false;
  var ducked = false;
  var fadeTimer = null;
  var introListener = null;

  function musicEnabled() {
    return !HBC.Settings || HBC.Settings.music !== false;
  }
  function sfxEnabled() {
    return !HBC.Settings || HBC.Settings.sfx !== false;
  }

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (Ctor) ctx = new Ctor();
    } catch (e) { ctx = null; }
    return ctx;
  }

  /* ── The shared music element ─────────────────────────────────────────── */

  function ensureMusic() {
    if (music) return music;
    music = new Audio();
    music.preload = 'auto';
    U.on(music, 'ended', function () {
      if (current === 'bgm' && bgmWanted) {
        /* Native loop should have prevented this; restart by hand if the
           platform ignored it. */
        try { music.currentTime = 0; } catch (e) {}
        tryPlay();
      }
    });
    U.on(music, 'error', function () {
      /* One quiet retry: some TV pipelines fail the first load while busy. */
      if (!music._retried && current) {
        music._retried = true;
        var kind = current;
        current = '';
        window.setTimeout(function () {
          load(kind);
          if (kind === 'intro' && introWanted) attemptIntro();
          else if (kind === 'bgm' && bgmWanted) tryPlay();
        }, 400);
      }
    });
    return music;
  }

  function load(kind) {
    var el = ensureMusic();
    if (current === kind) return el;
    cancelFade();
    try { el.pause(); } catch (e) {}
    current = kind;
    el._retried = false;
    el.loop = (kind === 'bgm');
    el.src = SRC[kind];
    try { el.load(); } catch (e2) {}
    return el;
  }

  function tryPlay() {
    var el = music;
    if (!el) return;
    try {
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function cancelFade() {
    if (fadeTimer) {
      window.clearInterval(fadeTimer);
      fadeTimer = null;
    }
  }

  function fade(to, ms, done) {
    var el = music;
    cancelFade();
    if (!el) { if (done) done(); return; }
    var from = el.volume;
    var start = new Date().getTime();
    fadeTimer = window.setInterval(function () {
      var t = (new Date().getTime() - start) / ms;
      if (t >= 1) {
        cancelFade();
        el.volume = U.clamp(to, 0, 1);
        if (done) done();
        return;
      }
      el.volume = U.clamp(from + (to - from) * t, 0, 1);
    }, 50);
  }

  /* ── Intro ────────────────────────────────────────────────────────────── */

  /* Start the intro track from 0. cb(true|false) says whether sound is really
     coming out; false means the platform blocked autoplay and the first key
     press will have to start it (see unlock). */
  function attemptIntro(cb) {
    var el = music;
    if (!el || current !== 'intro') { if (cb) cb(false); return; }
    var settled = false;
    function settle(ok) {
      if (settled) return;
      settled = true;
      el.removeEventListener('playing', onPlaying);
      if (cb) cb(ok);
    }
    function onPlaying() { settle(true); }
    el.addEventListener('playing', onPlaying, false);
    el.volume = VOL.intro;
    try { el.currentTime = 0; } catch (e) { /* metadata not loaded yet: it starts at 0 anyway */ }
    try {
      var p = el.play();
      if (p && p.then) {
        p.then(function () { window.setTimeout(function () { settle(!el.paused); }, 120); },
               function () { settle(false); });
      }
    } catch (e2) {
      settle(false);
      return;
    }
    window.setTimeout(function () { settle(!el.paused && el.currentTime > 0); }, 1500);
  }

  function playIntro(cb) {
    introWanted = true;
    introListener = cb || null;
    if (!musicEnabled()) { if (cb) cb(false); return; }
    load('intro');
    attemptIntro(function (ok) {
      if (!ok) return notifyIntro(false);
      notifyIntro(true);
    });
  }

  function notifyIntro(ok) {
    var cb = introListener;
    if (cb) cb(ok);
  }

  function stopIntro(ms) {
    introWanted = false;
    if (!music || current !== 'intro') return;
    fade(0, ms || 500, function () {
      try { music.pause(); } catch (e) {}
    });
  }

  /* Time of the intro track for visual sync, or -1 when it is not audible. */
  function introTime() {
    if (!music || current !== 'intro' || music.paused || music.ended) return -1;
    if (music.readyState < 2) return -1;
    return music.currentTime;
  }

  function seek(sec) {
    if (!music || current !== 'intro') return;
    try { music.currentTime = sec; } catch (e) {}
  }

  /* ── Background music ─────────────────────────────────────────────────── */

  function startBgm() {
    bgmWanted = true;
    introWanted = false;
    if (!musicEnabled()) return;
    load('bgm');
    music.volume = 0;
    tryPlay();
    fade(ducked ? VOL.bgmDucked : VOL.bgm, 900);
  }

  function stopBgm(ms) {
    bgmWanted = false;
    if (!music || current !== 'bgm') return;
    fade(0, ms || 400, function () {
      try { music.pause(); } catch (e) {}
    });
  }

  function setDucked(on) {
    ducked = !!on;
    if (music && bgmWanted && current === 'bgm') fade(ducked ? VOL.bgmDucked : VOL.bgm, 350);
  }

  /* First user gesture: browsers that block autoplay allow play() now. */
  function unlock() {
    var c = ensureCtx();
    if (c && c.state === 'suspended' && c.resume) {
      try { c.resume(); } catch (e) {}
    }
    if (!music || !musicEnabled()) return;
    if (introWanted && current === 'intro' && music.paused) {
      attemptIntro(function (ok) { if (ok) notifyIntro(true); });
    } else if (bgmWanted && current === 'bgm' && music.paused) {
      tryPlay();
    }
  }

  function init() {
    ensureMusic();
  }

  /* ── Synthesized interface sounds ─────────────────────────────────────── */

  function beep(freq, endFreq, dur, type, gain, delay) {
    if (!sfxEnabled()) return;
    var c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended' && c.resume) {
      try { c.resume(); } catch (e) {}
    }
    var t0 = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq && osc.frequency.exponentialRampToValueAtTime) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  var noiseBuf = null;
  function noise(dur, gain) {
    if (!sfxEnabled()) return;
    var c = ensureCtx();
    if (!c) return;
    if (!noiseBuf) {
      /* One shared 0.3 s buffer instead of allocating a new one per call. */
      var len = Math.floor(c.sampleRate * 0.3);
      noiseBuf = c.createBuffer(1, len, c.sampleRate);
      var data = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    var src = c.createBufferSource();
    var g = c.createGain();
    g.gain.value = gain || 0.05;
    src.buffer = noiseBuf;
    src.connect(g);
    g.connect(c.destination);
    src.start(0);
  }

  function sfx(name) {
    if (!sfxEnabled()) return;
    if (name === 'move') beep(620, 760, 0.055, 'sine', 0.06);
    else if (name === 'select') { beep(880, 1180, 0.075, 'sine', 0.09); beep(1320, 1560, 0.06, 'sine', 0.05, 0.05); }
    else if (name === 'back') beep(440, 300, 0.09, 'sine', 0.07);
    else if (name === 'launch') {
      beep(420, 1260, 0.32, 'sine', 0.10);
      beep(630, 1890, 0.30, 'triangle', 0.05, 0.04);
      noise(0.20, 0.035);
    } else if (name === 'error') {
      beep(180, 120, 0.22, 'square', 0.07);
      beep(140, 90, 0.26, 'square', 0.05, 0.10);
    } else if (name === 'pop') {
      beep(900, 1400, 0.035, 'sine', 0.035);
    } else if (name === 'boot') {
      beep(220, 880, 0.55, 'sine', 0.07);
      beep(440, 1320, 0.50, 'triangle', 0.035, 0.10);
    }
  }

  function refreshSettings() {
    if (!musicEnabled()) {
      stopBgm(200);
      stopIntro(200);
    } else if (bgmWanted && music && music.paused && current === 'bgm') {
      tryPlay();
    }
  }

  HBC.Audio = {
    init: init,
    unlock: unlock,
    playIntro: playIntro,
    stopIntro: stopIntro,
    introTime: introTime,
    seek: seek,
    startBgm: startBgm,
    stopBgm: stopBgm,
    setDucked: setDucked,
    sfx: sfx,
    refreshSettings: refreshSettings
  };
})(window);
