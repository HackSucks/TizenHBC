/* The HBC intro, modelled frame by frame on a screen recording of the Wii one.

   Timeline (seconds, measured from the reference video and intro.mp3):
     0.00 - 0.35   plain white screen
     0.35 - 2.70   a body of blue water rises up the screen (smoothstep),
                   its surface is a slow, large rolling wave
     2.70 - 4.20   the water holds and gently bobs; bubbles begin to rise
     4.20          first strong drum hit of the track: a ~0.2 s pale-cyan flash
                   and the logo is simply there (no zoom, no pulsing afterwards)
     4.65          Exit / Start fade in
     5.70          hbc-srv is started (deliberately NOT on the flash frame: the
                   network/process work used to hitch the very frame that
                   mattered)
     ...           the scene keeps flowing until the track ends (31 s), then it
                   fades out and replays until Start is pressed.

   Everything that moves is drawn into ONE canvas (water, bubbles and the flash
   overlay), so the flash costs one fillRect instead of a full-screen DOM layer
   with its own opacity animation. The logo is a pre-decoded image whose opacity
   is flipped in the same frame as the flash.

   The picture follows the audio clock when sound is playing, so it stays in
   sync even if the TV stutters; with no sound it runs on its own clock with
   identical timing. */
(function (window, document) {
  'use strict';

  var HBC = window.HBC = window.HBC || {};
  var U = HBC.Util;

  var RISE_START = 0.35;
  var RISE_END = 2.7;
  var BUBBLES_AT = 2.6;
  var LOGO_AT = 4.2;         /* flash + logo (strong drum hit in intro.mp3) */
  var UI_DELAY = 0.45;       /* buttons appear this long after the logo */
  var SERVICE_DELAY = 1500;  /* ms after the logo before hbc-srv is started */
  var FLASH_LEN = 0.2;
  var FLASH_PEAK = 0.82;
  var DURATION = 31.05;

  var LEVEL_END = 0.232;     /* resting surface height (fraction of screen from top) */

  var elIntro = U.$('intro');
  var elWater = U.$('introWater');
  var elCenter = U.$('introCenter');
  var elWrap = U.$('logoWrap');
  var elLogo = U.$('introLogo');
  var elButtons = U.$('introButtons');
  var elHint = U.$('introHint');
  var btnExit = U.$('btnExit');
  var btnStart = U.$('btnStart');
  var cursorBox = U.$('introCursorBox');

  var focusIndex = 1;
  var started = false;
  var buttons = [];
  var uiShown = false;

  /* run state */
  var running = false;
  var rafId = 0;
  var waiting = false;
  var waitTimer = 0;
  var serviceTimer = 0;
  var usingAudio = false;
  var t = 0;
  var lastNow = 0;
  var lastDraw = 0;
  var logoStarted = false;
  var logoShown = false;
  var flashStart = -1;      /* performance clock (ms) of the flash, -1 = none */
  var holdSince = -1;
  var spawnAcc = 0;
  var lastTeff = 0;
  var lastWrapOpacity = -1;

  /* water */
  var wctx = null;
  var W = 0;
  var H = 0;
  var grad = null;
  var bubbleImgs = [];
  var bubbles = [];

  /* ── helpers ──────────────────────────────────────────────────────────── */

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function smooth(a, b, x) {
    var k = clamp01((x - a) / (b - a));
    return k * k * (3 - 2 * k);
  }

  function setT(node, value) {
    node.style.webkitTransform = value;
    node.style.transform = value;
  }

  function avLatency() {
    var ms = HBC.Settings && typeof HBC.Settings.avOffset === 'number' ? HBC.Settings.avOffset : 100;
    return ms / 1000;
  }

  /* ── buttons / cursor ─────────────────────────────────────────────────── */

  function positionCursor() {
    var node = buttons[focusIndex];
    if (!node || !cursorBox) return;
    var rect = node.getBoundingClientRect();
    var cw = cursorBox.offsetWidth || window.innerWidth * 0.1;
    var ch = cursorBox.offsetHeight || window.innerWidth * 0.1;
    var left = rect.left + rect.width * 0.72 - cw * 0.45;
    var top = rect.top - ch * 0.55;
    setT(cursorBox, 'translate3d(' + Math.round(left) + 'px,' + Math.round(top) + 'px,0)');
  }

  function setFocus(index, silent) {
    focusIndex = index;
    U.toggleClass(btnExit, 'focus', index === 0);
    U.toggleClass(btnStart, 'focus', index === 1);
    positionCursor();
    if (!silent && HBC.Audio) HBC.Audio.sfx('move');
  }

  function showUi() {
    if (uiShown) return;
    uiShown = true;
    U.addClass(elButtons, 'show');
    U.addClass(elHint, 'show');
    U.addClass(cursorBox, 'show');
    positionCursor();
  }

  function activate() {
    if (focusIndex === 0) exit();
    else start();
  }

  function start() {
    if (started) return;
    started = true;
    if (HBC.Audio) {
      HBC.Audio.sfx('boot');
      HBC.Audio.stopIntro(700);
    }
    U.addClass(elIntro, 'out');
    var fade = U.$('fade');
    U.addClass(fade, 'on');
    window.setTimeout(function () {
      U.addClass(elIntro, 'hidden');
      U.removeClass(fade, 'on');
      stopLoop();
      if (HBC.Main) HBC.Main.enter();
      if (HBC.Audio) HBC.Audio.startBgm();
    }, 620);
  }

  function exit() {
    if (started) return;
    started = true;
    if (HBC.Audio) HBC.Audio.stopIntro(450);
    var fade = U.$('fade');
    U.addClass(fade, 'on');
    window.setTimeout(function () {
      if (HBC.App) HBC.App.exit();
    }, 520);
  }

  function handleRemote(action) {
    if (started) return;
    if (action === 'back' || action === 'exit') {
      HBC.Dialog.confirm('Exit', 'Leave the Homebrew Channel?', 'Exit', 'Stay', function (yes) {
        if (yes) exit();
      });
      return;
    }
    if (!uiShown) {
      /* Buttons appear with the logo; OK before that skips ahead to it. */
      if (action === 'enter') skipToLogo();
      return;
    }
    if (action === 'left' || action === 'up') { setFocus(0); return; }
    if (action === 'right' || action === 'down') { setFocus(1); return; }
    if (action === 'enter') { activate(); return; }
  }

  /* Jump to the logo, keeping sound and picture together. */
  function skipToLogo() {
    var target = LOGO_AT - 0.05;
    if (usingAudio && HBC.Audio && HBC.Audio.seek) HBC.Audio.seek(target);
    t = target;
    resetTimeline();
  }

  /* ── water ────────────────────────────────────────────────────────────── */

  function loadImages() {
    for (var i = 1; i <= 3; i++) {
      (function (idx) {
        var img = new Image();
        img.onload = function () { bubbleImgs[idx - 1] = img; };
        img.src = 'res/img/bubble' + idx + '.png';
      })(i);
    }
    /* decode the big logo up front so showing it later costs nothing */
    if (elLogo) {
      var pre = new Image();
      pre.src = elLogo.getAttribute('src');
      if (pre.decode) { try { pre.decode(); } catch (e) {} }
    }
  }

  function sizeWater() {
    if (!elWater) return;
    var level = HBC.Fx ? HBC.Fx.level() : 2;
    if (level <= 0) {
      elWater.style.display = 'none';
      wctx = null;
      U.addClass(elIntro, 'flat');
      return;
    }
    U.removeClass(elIntro, 'flat');
    elWater.style.display = 'block';
    W = level >= 2 ? 640 : 427;
    H = Math.round(W * 9 / 16);
    elWater.width = W;
    elWater.height = H;
    wctx = elWater.getContext ? elWater.getContext('2d') : null;
    if (!wctx) return;
    /* Colours sampled from the reference: the gradient is fixed to the screen,
       light cyan-blue under the surface, deep blue at the bottom. */
    grad = wctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.00, '#1f9ccf');
    grad.addColorStop(0.10, '#178ec3');
    grad.addColorStop(0.28, '#229ace');
    grad.addColorStop(0.48, '#2296cb');
    grad.addColorStop(0.62, '#1385ba');
    grad.addColorStop(0.78, '#0276aa');
    grad.addColorStop(0.90, '#006ca2');
    grad.addColorStop(1.00, '#006ca2');
  }

  function spawnBubble() {
    if (!bubbleImgs.length || bubbles.length >= 22) return;
    var img = bubbleImgs[Math.floor(Math.random() * bubbleImgs.length)];
    if (!img) return;
    var size = H * (0.018 + Math.random() * 0.04);
    bubbles.push({
      img: img,
      x: Math.random() * W,
      y: H + size,
      size: size,
      vy: H * (0.05 + Math.random() * 0.11),
      sway: Math.random() * 6.28,
      alpha: 0.3 + Math.random() * 0.4
    });
  }

  /* Rolling surface: three slow sines, returns -1..1 */
  function wave(u, T, shift) {
    var TAU = 6.2832;
    var v = u + shift;
    return 0.55 * Math.sin(v * TAU * 0.9 + 0.8 + T * 0.45) +
           0.30 * Math.sin(v * TAU * 2.1 + 2.0 - T * 0.7) +
           0.15 * Math.sin(v * TAU * 4.3 + T * 1.1);
  }

  var STEPS = 64;

  function surfacePath(c, base, amp, T, shift, lift) {
    c.beginPath();
    c.moveTo(0, H + 2);
    for (var i = 0; i <= STEPS; i++) {
      var u = i / STEPS;
      c.lineTo(u * W, base - lift + wave(u, T, shift) * amp);
    }
    c.lineTo(W, H + 2);
    c.closePath();
  }

  function drawWater(dt, level, flashA, bubblesOn, fade) {
    if (!wctx) return;
    var c = wctx;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = '#f9fbfb';
    c.fillRect(0, 0, W, H);

    if (level < 1.03) {
      var amp = H * 0.034;
      var base = H * level;

      /* paler back sheet, a little higher and out of phase */
      c.fillStyle = 'rgba(70,170,220,0.3)';
      surfacePath(c, base, amp * 0.9, t * 0.8 + 3.1, 0.31, H * 0.010);
      c.fill();

      /* the water body */
      c.fillStyle = grad;
      surfacePath(c, base, amp, t, 0, 0);
      c.fill();

      /* thin light ripple lines just under the surface */
      c.lineWidth = Math.max(1.5, H * 0.006);
      c.lineCap = 'round';
      for (var r = 0; r < 2; r++) {
        c.strokeStyle = r ? 'rgba(150,220,248,0.32)' : 'rgba(170,230,252,0.5)';
        c.beginPath();
        var from = r ? 0.42 : 0.08;
        var to = r ? 0.93 : 0.58;
        var drop = H * (r ? 0.075 : 0.045);
        for (var i = 0; i <= 24; i++) {
          var u = from + (to - from) * i / 24;
          var y = base + drop + wave(u, t * 0.9 + r, r ? 0.17 : 0.05) * amp * 0.8;
          if (i === 0) c.moveTo(u * W, y); else c.lineTo(u * W, y);
        }
        c.stroke();
      }

      /* bubbles, only inside the water */
      if (bubblesOn) {
        spawnAcc += dt * 5;
        while (spawnAcc > 1) { spawnAcc -= 1; spawnBubble(); }
      }
      for (var b = bubbles.length - 1; b >= 0; b--) {
        var bb = bubbles[b];
        bb.y -= bb.vy * dt;
        bb.x += Math.sin(bb.sway + t * 1.3) * 5 * dt;
        if (bb.y < base + H * 0.05) { bubbles.splice(b, 1); continue; }
        c.globalAlpha = bb.alpha * fade;
        c.drawImage(bb.img, bb.x - bb.size / 2, bb.y - bb.size / 2, bb.size, bb.size);
      }
      c.globalAlpha = 1;
    }

    if (flashA > 0.01) {
      c.fillStyle = 'rgba(210,250,255,' + flashA.toFixed(3) + ')';
      c.fillRect(0, 0, W, H);
    }
  }

  /* ── timeline ─────────────────────────────────────────────────────────── */

  function resetTimeline() {
    lastTeff = -1;
    flashStart = -1;
    if (logoShown) hideLogo();
  }

  function showLogo() {
    logoShown = true;
    lastWrapOpacity = 1;
    elWrap.style.opacity = 1;
  }

  function hideLogo() {
    logoShown = false;
    lastWrapOpacity = 0;
    elWrap.style.opacity = 0;
  }

  function frame(now) {
    if (!running) return;
    rafId = window.requestAnimationFrame(frame);
    if (!now) now = new Date().getTime();
    var rawDt = lastNow ? (now - lastNow) : 16;
    lastNow = now;
    if (waiting) return;

    var dt = Math.min(0.1, rawDt / 1000);
    if (HBC.Fx) HBC.Fx.report(rawDt);

    /* clock: audio when audible, otherwise our own */
    var at = (HBC.Audio && usingAudio) ? HBC.Audio.introTime() : -1;
    var prev = t;
    if (at >= 0) t = at; else t += dt;
    if (t < prev - 0.5) resetTimeline();

    var teff = (at >= 0) ? t - avLatency() : t;

    /* the flash + logo: same frame, once */
    if (teff >= LOGO_AT && lastTeff < LOGO_AT && teff < LOGO_AT + 1.5) {
      flashStart = now;
      showLogo();
      onLogoAppears();
    } else if (teff >= LOGO_AT && !logoShown && teff < DURATION) {
      showLogo();     /* seeked / realigned / stalled past the hit: logo without flash */
      onLogoAppears();
    }
    if (logoShown && !uiShown && teff >= LOGO_AT + UI_DELAY) showUi();
    lastTeff = teff;

    /* hold + outro + replay */
    var outro = 1;
    if (teff >= DURATION + 0.1 || (HBC.Audio && usingAudio && at < 0 && t > DURATION - 1)) {
      if (holdSince < 0) holdSince = now;
      var held = (now - holdSince) / 1000;
      outro = 1 - clamp01((held - 0.8) / 1.0);
      if (held > 2.2) { restart(); return; }
    }

    var flashA = 0;
    if (flashStart >= 0) {
      var age = (now - flashStart) / 1000;
      if (age < FLASH_LEN) flashA = FLASH_PEAK * (1 - age / FLASH_LEN);
      else flashStart = -1;
    }

    /* water level: smoothstep rise, then a slow bob */
    var rise = smooth(RISE_START, RISE_END, teff);
    var level = 1.05 - rise * (1.05 - LEVEL_END) + 0.017 * Math.sin(teff * 1.15) * rise;

    /* Draw at ~30 fps (~20 when reduced), but never skip a flash frame. */
    var fxLevel = HBC.Fx ? HBC.Fx.level() : 2;
    var minGap = fxLevel >= 2 ? 30 : 48;
    if (flashA > 0 || now - lastDraw >= minGap) {
      var wdt = lastDraw ? Math.min(0.12, (now - lastDraw) / 1000) : dt;
      lastDraw = now;
      /* the outro washes everything back to white */
      drawWater(wdt, level, Math.max(flashA, 0), teff >= BUBBLES_AT, outro);
      if (outro < 1 && wctx) {
        wctx.fillStyle = 'rgba(249,251,251,' + (1 - outro).toFixed(3) + ')';
        wctx.fillRect(0, 0, W, H);
      }
    }

    if (logoShown && outro < 1) {
      elWrap.style.opacity = outro.toFixed(3);
      lastWrapOpacity = outro;
    } else if (logoShown && lastWrapOpacity !== 1) {
      elWrap.style.opacity = 1;
      lastWrapOpacity = 1;
    }
  }

  /* The companion service is brought up shortly after the logo: starting it on
     the flash frame used to stall the TV exactly when the flash had to land. */
  function onLogoAppears() {
    if (logoStarted) return;
    logoStarted = true;
    if (serviceTimer) window.clearTimeout(serviceTimer);
    serviceTimer = window.setTimeout(function () {
      serviceTimer = 0;
      if (HBC.Launcher) HBC.Launcher.ensure(true);
    }, SERVICE_DELAY);
  }

  function restart() {
    holdSince = -1;
    t = 0;
    lastDraw = 0;
    resetTimeline();
    bubbles.length = 0;
    if (HBC.Audio) {
      HBC.Audio.playIntro(onAudio);
    }
    /* keep running on our own clock until/unless audio confirms */
    usingAudio = false;
  }

  function onAudio(ok) {
    if (!running) return;
    if (waiting) {
      waiting = false;
      if (waitTimer) { window.clearTimeout(waitTimer); waitTimer = 0; }
      usingAudio = !!ok;
      t = 0;
      lastNow = 0;
      resetTimeline();
      return;
    }
    if (ok && !usingAudio) {
      /* sound started late (first key press on a TV that blocks autoplay):
         realign the picture with it */
      usingAudio = true;
      t = 0;
      holdSince = -1;
      resetTimeline();
    }
  }

  function startLoop() {
    if (running) return;
    running = true;
    lastNow = 0;
    rafId = window.requestAnimationFrame(frame);
  }

  function stopLoop() {
    running = false;
    if (rafId && window.cancelAnimationFrame) window.cancelAnimationFrame(rafId);
    rafId = 0;
    if (waitTimer) { window.clearTimeout(waitTimer); waitTimer = 0; }
    bubbles.length = 0;   /* serviceTimer is left alone: hbc-srv still has to start */
  }

  /* ── init / show ──────────────────────────────────────────────────────── */

  function init() {
    buttons = [btnExit, btnStart];
    U.on(btnExit, 'click', function () { setFocus(0, true); exit(); });
    U.on(btnStart, 'click', function () { setFocus(1, true); start(); });
    U.on(btnExit, 'mouseenter', function () { if (uiShown) setFocus(0); });
    U.on(btnStart, 'mouseenter', function () { if (uiShown) setFocus(1); });
    U.on(window, 'resize', positionCursor);
    loadImages();
    sizeWater();
    if (HBC.Fx) HBC.Fx.onChange(sizeWater);
    setFocus(1, true);
  }

  function show() {
    U.removeClass(elIntro, 'hidden');
    U.removeClass(elIntro, 'out');
    started = false;
    uiShown = false;
    U.removeClass(elButtons, 'show');
    U.removeClass(elHint, 'show');
    U.removeClass(cursorBox, 'show');
    setFocus(1, true);

    t = 0;
    holdSince = -1;
    usingAudio = false;
    resetTimeline();
    hideLogo();
    startLoop();

    /* Wait (briefly) for the audio verdict so picture and sound start together. */
    waiting = true;
    if (waitTimer) window.clearTimeout(waitTimer);
    waitTimer = window.setTimeout(function () {
      if (waiting) onAudio(false);
    }, 1800);
    if (HBC.Audio) HBC.Audio.playIntro(onAudio);
    else onAudio(false);
    window.setTimeout(positionCursor, 120);
  }

  HBC.Intro = {
    init: init,
    show: show,
    start: start,
    exit: exit,
    handleRemote: handleRemote,
    isStarted: function () { return started; }
  };
})(window, document);
