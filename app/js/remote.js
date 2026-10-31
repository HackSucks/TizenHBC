/* Samsung TV remote support (full + slim) and keyboard fallback. */
(function (window, document) {
  'use strict';

  var HBC = window.HBC = window.HBC || {};
  var U = HBC.Util;

  var handler = null;
  var lastAction = '';
  var lastTime = 0;
  var REPEAT_MS = 75;

  var KEY_ACTIONS = {
    13: 'enter',
    37: 'left',
    38: 'up',
    39: 'right',
    40: 'down',
    10009: 'back',
    10182: 'exit',
    403: 'red',
    404: 'green',
    405: 'yellow',
    406: 'blue',
    457: 'info',
    18: 'menu',
    10133: 'menu',
    10135: 'tools',
    10252: 'playpause',
    415: 'play',
    19: 'pause',
    413: 'stop',
    412: 'rew',
    417: 'ff',
    427: 'chup',
    428: 'chdown',
    447: 'volup',
    448: 'voldown',
    449: 'mute',
    458: 'guide',
    10225: 'search',
    189: 'minus'
  };

  var REGISTER = [
    'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
    'MediaRewind', 'MediaFastForward',
    'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
    'Info', 'Menu', 'Tools', 'Exit',
    'ChannelUp', 'ChannelDown', 'VolumeUp', 'VolumeDown', 'VolumeMute',
    'Guide', 'Search'
  ];

  function registerTizenKeys() {
    if (!window.tizen || !window.tizen.tvinputdevice) return;
    var dev = window.tizen.tvinputdevice;
    if (dev.registerKeyBatch) {
      try { dev.registerKeyBatch(REGISTER); return; } catch (e) {}
    }
    for (var i = 0; i < REGISTER.length; i++) {
      try { dev.registerKey(REGISTER[i]); } catch (e2) {}
    }
  }

  function actionFor(ev) {
    var code = ev.keyCode || ev.which || 0;
    if (KEY_ACTIONS[code]) return KEY_ACTIONS[code];
    if (code >= 48 && code <= 57) return 'digit';
    var key = ev.key || '';
    if (key === 'Enter') return 'enter';
    if (key === 'Escape') return 'back';
    if (key === 'ArrowLeft') return 'left';
    if (key === 'ArrowRight') return 'right';
    if (key === 'ArrowUp') return 'up';
    if (key === 'ArrowDown') return 'down';
    if (key === ' ') return 'space';
    if (key === 'Tab') return 'tab';
    if (key === 'Backspace') return 'backspace';
    return '';
  }

  function isPrintable(ev) {
    var key = ev.key;
    if (!key) {
      var code = ev.keyCode || ev.which;
      return code >= 32 && code < 127;
    }
    return key.length === 1;
  }

  function terminalOwnsKey(ev, action) {
    if (!HBC.Terminal || !HBC.Terminal.isOpen()) return false;
    if (HBC.Keyboard && HBC.Keyboard.isOpen()) return false;
    if ((HBC.Dialog && HBC.Dialog.isOpen()) || (HBC.Menu && HBC.Menu.isOpen())) return false;
    /* Header navigation is driven by terminal.js, not the PTY. */
    if (HBC.Terminal.headerFocused && HBC.Terminal.headerFocused()) return false;
    if (action === 'tools') return false;
    if (action === 'up' && !HBC.Terminal.isRunning()) return false;
    var active = document.activeElement;
    var cls = active && active.className ? ' ' + active.className + ' ' : '';
    if (cls.indexOf(' xterm-helper-textarea ') < 0) return false;
    if (isPrintable(ev)) return true;
    return action === 'left' || action === 'right' || action === 'up' ||
      action === 'down' || action === 'enter' || action === 'backspace' ||
      action === 'tab' || action === 'space';
  }

  function onKeyDown(ev) {
    var action = actionFor(ev);

    if (HBC.Audio) HBC.Audio.unlock();

    /* The virtual keyboard owns all input while it is open, including
       printable keys from a physical keyboard. */
    if (HBC.Keyboard && HBC.Keyboard.isOpen()) {
      if (action && HBC.Keyboard.handleRemote(action, ev)) {
        U.stop(ev);
        return;
      }
      if (isPrintable(ev) && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
        HBC.Keyboard.typeChar(ev.key);
        U.stop(ev);
        return;
      }
      if (action) {
        U.stop(ev);
        return;
      }
    }

    if (!action) return;

    /* xterm's focused textarea already turns arrows, Enter, Tab, Backspace,
       Space and printable keys into PTY input. Do not send them twice. */
    if (terminalOwnsKey(ev, action)) return;

    if (!handler) return;

    var now = new Date().getTime();
    if ((action === 'up' || action === 'down' || action === 'left' ||
         action === 'right' || action === 'digit') &&
        action === lastAction && (now - lastTime) < REPEAT_MS) {
      U.stop(ev);
      return;
    }
    lastAction = action;
    lastTime = now;

    U.stop(ev);
    handler(action, ev);
  }

  function init() {
    registerTizenKeys();
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('click', function () { if (HBC.Audio) HBC.Audio.unlock(); }, false);
  }

  function setHandler(fn) { handler = fn; }

  HBC.Remote = {
    init: init,
    setHandler: setHandler
  };
})(window, document);
