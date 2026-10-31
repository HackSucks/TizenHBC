/* xterm.js terminal + hbc-srv session plumbing. */
(function (window, document) {
  'use strict';

  var HBC = window.HBC = window.HBC || {};
  var U = HBC.Util;

  var layer = U.$('terminalLayer');
  var host = U.$('terminal');
  var elTitle = U.$('termTitle');
  var elState = U.$('termState');
  var btnKb = U.$('btnKb');
  var btnHide = U.$('btnHide');
  var btnKill = U.$('btnKill');
  var btnClose = U.$('btnClose');

  var term = null;
  var fit = null;
  var session = null;
  var since = 0;
  var running = false;
  var hidden = false;
  var program = null;
  var pollTimer = null;
  var pollFails = 0;
  var decoder = null;
  var visible = false;
  var exitCode = null;
  var headerIndex = -1;
  var headerNodes = [];

  var THEME = {
    background: '#000000',
    foreground: '#d8f4ff',
    cursor: '#7fe3ff',
    cursorAccent: '#001018',
    selection: 'rgba(90, 200, 255, 0.35)',
    black: '#000000',
    red: '#ff6b7a',
    green: '#7dffb0',
    yellow: '#ffd166',
    blue: '#6fb8ff',
    magenta: '#d79bff',
    cyan: '#7fe3ff',
    white: '#eaf8ff',
    brightBlack: '#5a7d8c',
    brightRed: '#ff9aa6',
    brightGreen: '#a6ffd0',
    brightYellow: '#ffe08a',
    brightBlue: '#9fd0ff',
    brightMagenta: '#e6c2ff',
    brightCyan: '#b6f2ff',
    brightWhite: '#ffffff'
  };

  function initDecoder() {
    if (window.TextDecoder) {
      try { decoder = new TextDecoder('utf-8'); } catch (e) { decoder = null; }
    }
  }

  function ensureTerm() {
    if (term) return;
    if (!window.Terminal) {
      host.innerHTML = '<div style="color:#ff9aa6;padding:2vh 2vw;font-size:2.2vh">xterm.js failed to load.</div>';
      return;
    }
    initDecoder();
    term = new window.Terminal({
      convertEol: false,
      cursorBlink: false,
      cursorStyle: 'block',
      scrollback: 2000,
      fontSize: Math.max(15, Math.round(window.innerHeight * 0.022)),
      fontFamily: "'HBCMono', 'DejaVu Sans Mono', 'Liberation Mono', monospace",
      fontWeight: '400',
      fontWeightBold: '700',
      lineHeight: 1.0,
      letterSpacing: 0,
      allowTransparency: false,
      theme: THEME
    });
    if (window.FitAddon && window.FitAddon.FitAddon) {
      fit = new window.FitAddon.FitAddon();
      term.loadAddon(fit);
    }
    term.open(host);

    term.onData(function (data) {
      if (session && running) HBC.Bridge.input(session, data, function () {});
    });

    try { term.focus(); } catch (e) {}
  }

  function doFit() {
    if (!term) return;
    if (fit) {
      try { fit.fit(); } catch (e) {}
    }
    if (session && term.cols && term.rows) {
      HBC.Bridge.resize(session, term.cols, term.rows, function () {});
    }
  }

  function setState(text, color) {
    elState.textContent = text;
    elState.style.color = color || '#7fd8a0';
  }

  /* The xterm textarea normally owns every arrow/Enter key so the PTY gets
     them. The header buttons therefore need an explicit focus mode: while it
     is active the textarea is blurred and the remote drives the buttons. */
  function renderHeaderFocus() {
    for (var i = 0; i < headerNodes.length; i++) {
      U.toggleClass(headerNodes[i], 'focus', i === headerIndex);
    }
  }

  function focusHeader(index) {
    if (!headerNodes.length) return;
    headerIndex = typeof index === 'number' ? index : 0;
    if (headerIndex < 0) headerIndex = 0;
    if (headerIndex >= headerNodes.length) headerIndex = headerNodes.length - 1;
    try { if (term) term.blur(); } catch (e) {}
    renderHeaderFocus();
    if (HBC.Audio) HBC.Audio.sfx('move');
  }

  function leaveHeader() {
    if (headerIndex < 0) return;
    headerIndex = -1;
    renderHeaderFocus();
    try { if (term) term.focus(); } catch (e) {}
  }

  function activateHeader() {
    var node = headerNodes[headerIndex];
    if (!node) return;
    leaveHeader();
    if (HBC.Audio) HBC.Audio.sfx('select');
    node.click();
  }

  function writeText(text) {
    if (term) term.write(text);
  }

  function resetTerm() {
    if (term) {
      try { term.reset(); } catch (e) {}
    }
  }

  function sendInput(text) {
    if (!text) return;
    if (session && running) {
      HBC.Bridge.input(session, text, function () {});
    } else {
      writeText(text);
    }
  }

  function stopPoll() {
    if (pollTimer) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function poll() {
    if (!session) return;
    HBC.Bridge.poll(session, since, function (err, data) {
      if (!session) return;
      if (err || !data) {
        pollFails++;
        if (pollFails >= 8) {
          running = false;
          setState('connection lost', '#ff9aa6');
          writeText('\r\n\x1b[31m[hbc-srv connection lost]\x1b[0m\r\n');
          return;
        }
        pollTimer = window.setTimeout(poll, 250);
        return;
      }
      pollFails = 0;
      if (data.b64) {
        var bytes = U.b64ToBytes(data.b64);
        if (decoder) writeText(decoder.decode(bytes, { stream: true }));
        else writeText(U.b64ToUtf8(data.b64));
        since = data.next;
      } else if (typeof data.next === 'number') {
        since = data.next;
      }
      if (data.done) {
        running = false;
        exitCode = typeof data.code === 'number' ? data.code : 0;
        if (decoder) {
          var tail = decoder.decode();
          if (tail) writeText(tail);
        }
        setState('exited (' + exitCode + ')', exitCode === 0 ? '#7fd8a0' : '#ffcf7a');
        writeText('\r\n\x1b[90m[process exited with code ' + exitCode + ']\x1b[0m\r\n');
        if (HBC.Audio) HBC.Audio.sfx('back');
        return;
      }
      pollTimer = window.setTimeout(poll, 65);
    });
  }

  function open(prog) {
    if (running) {
      HBC.Toast.show('A program is already running. Close it first.');
      return;
    }
    program = prog;
    visible = true;
    hidden = false;
    running = false;
    session = null;
    since = 0;
    exitCode = null;
    pollFails = 0;
    headerIndex = -1;
    renderHeaderFocus();
    U.removeClass(layer, 'hidden');
    elTitle.textContent = prog.name || 'Terminal';
    setState('starting…', '#9fd8ea');
    if (HBC.Audio) {
      HBC.Audio.sfx('launch');
      HBC.Audio.setDucked(true);
    }
    ensureTerm();
    resetTerm();
    doFit();
    if (!term) {
      setState('terminal unavailable', '#ff9aa6');
      return;
    }
    term.focus();

    if (!HBC.Bridge.isOnline()) {
      running = false;
      setState('hbc-srv offline', '#ff9aa6');
      writeText('\x1b[1;36mTizen Homebrew Channel\x1b[0m\r\n\r\n');
      writeText('\x1b[33mThe companion service is not reachable at ' + U.escapeHtml(HBC.Bridge.base()) + '\x1b[0m\r\n\r\n');
      writeText('Install and start \x1b[1mhbc-srv\x1b[0m on the TV, then try again:\r\n');
      writeText('  \x1b[36msh tools/install-hbc.sh --tv <TV-IP>\x1b[0m\r\n\r\n');
      writeText('The widget itself is working; only program execution needs the service.\r\n');
      return;
    }

    HBC.Bridge.run(prog, term.cols || 80, term.rows || 24, function (err, data) {
      if (err || !data || !data.session) {
        running = false;
        setState('launch failed', '#ff9aa6');
        writeText('\r\n\x1b[31mFailed to launch ' + U.escapeHtml(prog.name || prog.id) + ': ' + U.escapeHtml(err || 'no session') + '\x1b[0m\r\n');
        return;
      }
      session = data.session;
      running = true;
      since = 0;
      setState('running · ' + (data.command || prog.id), '#7fd8a0');
      doFit();
      poll();
      if (prog.keyboard) {
        window.setTimeout(function () {
          if (running && visible && !hidden) toggleKeyboard(true);
        }, 900);
      }
    });
  }

  function toggleKeyboard(forceOpen) {
    if (!visible) return;
    if (HBC.Keyboard.isOpen()) {
      HBC.Keyboard.close();
      try { if (term) term.focus(); } catch (e) {}
      return;
    }
    if (forceOpen === false) return;
    try { if (term) term.blur(); } catch (e) {}
    HBC.Keyboard.open({
      mode: 'terminal',
      title: (program ? program.name : 'Terminal') + ' keyboard',
      onKey: function (text) { sendInput(text); },
      onClose: function () { try { if (term) term.focus(); } catch (e) {} }
    });
  }

  function hide() {
    if (!visible) return;
    leaveHeader();
    if (HBC.Keyboard.isOpen()) HBC.Keyboard.close();
    hidden = true;
    U.addClass(layer, 'hidden');
    if (HBC.Audio) HBC.Audio.setDucked(false);
    HBC.Toast.show('Program is still running. Press OK on it in the channel to return.');
  }

  function show() {
    if (!visible) return;
    hidden = false;
    U.removeClass(layer, 'hidden');
    if (HBC.Audio) HBC.Audio.setDucked(true);
    doFit();
    try { if (term) term.focus(); } catch (e) {}
  }

  /* Yes/no dialog that doesn't lose the remote to xterm: blur the terminal
     first (see terminalOwnsKey in remote.js), and hand focus back afterwards
     unless the terminal was closed or hidden in the meantime. */
  function ask(title, text, yesLabel, noLabel, cb) {
    try { if (term) term.blur(); } catch (e) {}
    HBC.Dialog.confirm(title, text, yesLabel, noLabel, function (yes) {
      if (cb) cb(yes);
      if (visible && !hidden && !HBC.Keyboard.isOpen()) {
        try { if (term) term.focus(); } catch (e) {}
      }
    });
  }

  function kill() {
    if (session && running) {
      HBC.Bridge.kill(session, function () {});
    }
    stopPoll();
    running = false;
    setState('stopped', '#ffcf7a');
    writeText('\r\n\x1b[33m[killed]\x1b[0m\r\n');
  }

  function close(force) {
    headerIndex = -1;
    renderHeaderFocus();
    if (running && !force) {
      ask('Program still running', 'Kill the program and close the terminal?', 'Kill & close', 'Cancel', function (yes) {
        if (yes) close(true);
        else { try { if (term) term.focus(); } catch (e) {} }
      });
      return;
    }
    if (running && force) {
      HBC.Bridge.kill(session, function () {});
      running = false;
    }
    stopPoll();
    session = null;
    visible = false;
    hidden = false;
    U.addClass(layer, 'hidden');
    if (HBC.Keyboard.isOpen()) HBC.Keyboard.close();
    if (HBC.Audio) HBC.Audio.setDucked(false);
    if (HBC.Main && HBC.Main.refreshStatus) HBC.Main.refreshStatus();
    try { if (term) term.blur(); } catch (e) {}
  }

  function handleRemote(action, ev) {
    if (!visible || hidden) return false;

    if (HBC.Keyboard.isOpen()) return false; /* keyboard gets it first */

    /* Header buttons have their own focus ring. */
    if (headerIndex >= 0) {
      if (action === 'left') {
        focusHeader((headerIndex + headerNodes.length - 1) % headerNodes.length);
        return true;
      }
      if (action === 'right') {
        focusHeader((headerIndex + 1) % headerNodes.length);
        return true;
      }
      if (action === 'enter') { activateHeader(); return true; }
      if (action === 'up') return true;
      if (action === 'down' || action === 'back' || action === 'tools') {
        leaveHeader();
        return true;
      }
      if (action === 'exit') { leaveHeader(); close(); return true; }
      return true;
    }

    /* Tools (or Up once the program has exited) moves focus to the header.
       Up stays with the PTY while a program is running so shell history and
       full-screen apps keep working. */
    if (action === 'tools' || (action === 'up' && !running)) {
      focusHeader(headerNodes.length - 1);
      return true;
    }

    /* BACK/EXIT leave the terminal and return to the channel. Info/Menu still
       open the terminal actions menu. */
    if (action === 'back' || action === 'exit') { close(); return true; }
    if (action === 'info' || action === 'menu') { openMenu(); return true; }
    if (action === 'green') { toggleKeyboard(true); return true; }
    if (action === 'red') { toggleKeyboard(true); return true; }
    if (action === 'yellow') { hide(); return true; }
    if (action === 'blue') {
      ask('Kill program', 'Stop ' + (program ? program.name : 'this program') + '?', 'Kill', 'Cancel', function (yes) {
        if (yes) kill();
      });
      return true;
    }
    if (action === 'up') { sendInput('\x1b[A'); return true; }
    if (action === 'down') { sendInput('\x1b[B'); return true; }
    if (action === 'right') { sendInput('\x1b[C'); return true; }
    if (action === 'left') { sendInput('\x1b[D'); return true; }
    if (action === 'enter') { sendInput('\r'); return true; }
    if (action === 'space') { sendInput(' '); return true; }
    if (action === 'tab') { sendInput('\t'); return true; }
    if (action === 'backspace') { sendInput('\x7f'); return true; }
    if (action === 'chup') { if (term) term.scrollPages(-1); return true; }
    if (action === 'chdown') { if (term) term.scrollPages(1); return true; }
    if (action === 'playpause') { sendInput('\x1b'); return true; }
    if (action === 'digit' && ev && ev.key) { sendInput(ev.key); return true; }
    return false;
  }

  function openMenu() {
    /* xterm keeps its hidden input focused; if we don't let go of it, every
       Up/Down/Enter the menu needs is instead claimed as terminal input
       (see terminalOwnsKey in remote.js) and the menu never sees it. */
    try { if (term) term.blur(); } catch (e) {}
    HBC.Menu.openTerminal({
      running: running,
      keyboard: HBC.Keyboard.isOpen(),
      onResume: function () { try { if (term) term.focus(); } catch (e) {} },
      onKeyboard: function () { toggleKeyboard(true); },
      onHide: function () { hide(); },
      onKill: function () {
        ask('Kill program', 'Stop ' + (program ? program.name : 'this program') + '?', 'Kill', 'Cancel', function (yes) {
          if (yes) kill();
        });
      },
      onClose: function () {
        if (running) {
          ask('Close terminal', 'The program is still running. Kill it and close?', 'Kill & close', 'Keep running', function (yes) {
            if (yes) close(true); else hide();
          });
        } else {
          close(true);
        }
      }
    });
  }

  function init() {
    headerNodes = [btnKb, btnHide, btnKill, btnClose];
    U.on(btnKb, 'click', function () { toggleKeyboard(true); });
    U.on(btnHide, 'click', function () { hide(); });
    U.on(btnKill, 'click', function () {
      ask('Kill program', 'Stop ' + (program ? program.name : 'this program') + '?', 'Kill', 'Cancel', function (yes) {
        if (yes) kill();
      });
    });
    U.on(btnClose, 'click', function () { close(); });
    U.on(window, 'resize', function () { if (visible) doFit(); });
    U.on(document, 'visibilitychange', function () {
      if (!document.hidden && visible) doFit();
    });
  }

  HBC.Terminal = {
    init: init,
    open: open,
    close: close,
    hide: hide,
    show: show,
    kill: kill,
    toggleKeyboard: toggleKeyboard,
    sendInput: sendInput,
    handleRemote: handleRemote,
    isOpen: function () { return visible && !hidden; },
    isRunning: function () { return running; },
    isHidden: function () { return visible && hidden; },
    headerFocused: function () { return headerIndex >= 0; },
    hasSession: function () { return !!session; },
    program: function () { return program; },
    state: function () { return elState.textContent; }
  };
})(window, document);
