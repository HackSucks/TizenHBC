/* On-screen keyboard for terminal input and text fields. */
(function (window, document) {
  'use strict';

  var HBC = window.HBC = window.HBC || {};
  var U = HBC.Util;

  var elKeyboard = U.$('keyboard');
  var elRows = U.$('kbRows');
  var elTitle = U.$('kbTitle');
  var elValue = U.$('kbValue');
  var elLayer = U.$('kbLayer');

  var isOpen = false;
  var opts = null;
  var mode = 'terminal';
  var buf = '';
  var pos = 0;
  var layer = 'letters';
  var shift = false;
  var ctrl = false;
  var alt = false;
  var rowIndex = 0;
  var colIndex = 0;
  var keyRows = [];
  var keyNodes = [];

  var TERM_ROW = [
    { label: 'Esc', code: '\x1b', kind: 'special', small: true },
    { label: 'Tab', code: '\t', kind: 'special', small: true },
    { label: 'Ctrl', kind: 'mod', mod: 'ctrl', small: true },
    { label: 'Alt', kind: 'mod', mod: 'alt', small: true },
    { label: '◀', code: '\x1b[D', kind: 'special' },
    { label: '▲', code: '\x1b[A', kind: 'special' },
    { label: '▼', code: '\x1b[B', kind: 'special' },
    { label: '▶', code: '\x1b[C', kind: 'special' },
    { label: 'Home', code: '\x1b[H', kind: 'special', small: true },
    { label: 'End', code: '\x1b[F', kind: 'special', small: true },
    { label: 'PgUp', code: '\x1b[5~', kind: 'special', small: true },
    { label: 'PgDn', code: '\x1b[6~', kind: 'special', small: true }
  ];

  var FKEYS = [
    { label: 'F1', code: '\x1bOP', kind: 'special', small: true },
    { label: 'F2', code: '\x1bOQ', kind: 'special', small: true },
    { label: 'F3', code: '\x1bOR', kind: 'special', small: true },
    { label: 'F4', code: '\x1bOS', kind: 'special', small: true },
    { label: 'F5', code: '\x1b[15~', kind: 'special', small: true },
    { label: 'F6', code: '\x1b[17~', kind: 'special', small: true },
    { label: 'F7', code: '\x1b[18~', kind: 'special', small: true },
    { label: 'F8', code: '\x1b[19~', kind: 'special', small: true },
    { label: 'F9', code: '\x1b[20~', kind: 'special', small: true },
    { label: 'F10', code: '\x1b[21~', kind: 'special', small: true }
  ];

  var TEXT_ROW = [
    { label: '◀', kind: 'textmove', move: -1, small: true },
    { label: '▶', kind: 'textmove', move: 1, small: true },
    { label: 'Home', kind: 'textpos', to: 0, small: true },
    { label: 'End', kind: 'textpos', to: -1, small: true },
    { label: 'Clear', kind: 'textclear', small: true }
  ];

  function makeChar(label, code) {
    return { label: label, code: code, kind: 'char' };
  }

  function lettersRow(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) out.push(makeChar(str.charAt(i), str.charAt(i)));
    return out;
  }

  function symbolsRows() {
    return [
      lettersRow('1234567890'),
      [makeChar('-', '-'), makeChar('=', '='), makeChar('[', '['), makeChar(']', ']'),
       makeChar('\\', '\\'), makeChar(';', ';'), makeChar("'", "'"), makeChar(',', ','),
       makeChar('.', '.'), makeChar('/', '/')],
      [makeChar('`', '`'), makeChar('~', '~'), makeChar('!', '!'), makeChar('@', '@'),
       makeChar('#', '#'), makeChar('$', '$'), makeChar('%', '%'), makeChar('^', '^'),
       makeChar('&', '&'), makeChar('*', '*'), makeChar('(', '('), makeChar(')', ')')],
      null,
      null
    ];
  }

  function lettersRows() {
    return [
      lettersRow('qwertyuiop'),
      lettersRow('asdfghjkl'),
      lettersRow('zxcvbnm'),
      null,
      null
    ];
  }

  function bottomRow() {
    return [
      { label: 'Shift', kind: 'shift', wide: true, small: true },
      { label: layer === 'letters' ? '123' : 'ABC', kind: 'layer', small: true },
      { label: 'Space', kind: 'char', code: ' ', space: true },
      { label: '⌫', kind: 'backspace', small: true },
      { label: '⏎', kind: 'enter', small: true },
      { label: 'Close', kind: 'close', small: true }
    ];
  }

  function buildRows() {
    var base = layer === 'letters' ? lettersRows() : symbolsRows();
    var rows = [];
    var i;
    for (i = 0; i < base.length; i++) rows.push(base[i]);
    rows[3] = bottomRow();
    if (mode === 'terminal') {
      rows[4] = TERM_ROW;
      rows[5] = FKEYS;
    } else {
      rows[4] = TEXT_ROW;
    }
    return rows;
  }

  function keyLabel(key) {
    if (key.kind === 'char' && layer === 'letters' && shift && /[a-z]/.test(key.label)) {
      return key.label.toUpperCase();
    }
    return key.label;
  }

  function render() {
    var rows = buildRows();
    keyRows = rows;
    keyNodes = [];
    U.clear(elRows);

    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (!row) continue;
      var rowEl = U.create('div', 'kbRow');
      var nodes = [];
      for (var c = 0; c < row.length; c++) {
        var key = row[c];
        var cls = 'key';
        if (key.wide) cls += ' wide';
        if (key.space) cls += ' space';
        if (key.small) cls += ' small';
        var node = U.create('div', cls, keyLabel(key));
        if (key.kind === 'mod' && key.mod === 'ctrl' && ctrl) U.addClass(node, 'on');
        if (key.kind === 'mod' && key.mod === 'alt' && alt) U.addClass(node, 'on');
        if (key.kind === 'shift' && shift) U.addClass(node, 'on');
        node.setAttribute('data-r', String(r));
        node.setAttribute('data-c', String(c));
        (function (rowIndexValue, colIndexValue) {
          U.on(node, 'click', function () {
            rowIndex = rowIndexValue;
            colIndex = colIndexValue;
            applyFocus();
            activate();
          });
        })(r, c);
        rowEl.appendChild(node);
        nodes.push(node);
      }
      elRows.appendChild(rowEl);
      keyNodes.push(nodes);
    }

    if (rowIndex >= keyNodes.length) rowIndex = keyNodes.length - 1;
    if (rowIndex < 0) rowIndex = 0;
    if (colIndex >= keyNodes[rowIndex].length) colIndex = keyNodes[rowIndex].length - 1;
    if (colIndex < 0) colIndex = 0;
    applyFocus();
    updateDisplay();
  }

  function applyFocus() {
    var r, c;
    for (r = 0; r < keyNodes.length; r++) {
      for (c = 0; c < keyNodes[r].length; c++) {
        U.toggleClass(keyNodes[r][c], 'focus', r === rowIndex && c === colIndex);
      }
    }
    var node = keyNodes[rowIndex] && keyNodes[rowIndex][colIndex];
    if (node && node.scrollIntoView) {
      try { node.scrollIntoView(false); } catch (e) {}
    }
  }

  function updateDisplay() {
    elTitle.textContent = (opts && opts.title) || (mode === 'terminal' ? 'Terminal Keyboard' : 'Keyboard');
    elLayer.textContent = (mode === 'terminal' ? 'PTY · ' : '') + layer + (shift ? ' · shift' : '') + (ctrl ? ' · ctrl' : '') + (alt ? ' · alt' : '');

    if (mode === 'terminal') {
      elValue.innerHTML = '<span style="color:#7fa8b8">remote keys are sent to the program</span>';
      return;
    }

    var safe = U.escapeHtml(buf);
    var before = safe.substring(0, pos);
    var after = safe.substring(pos);
    elValue.innerHTML = before + '<span class="caret"></span>' + after;
  }

  function currentKey() {
    var row = keyRows[rowIndex];
    return row ? row[colIndex] : null;
  }

  function moveFocus(dx, dy) {
    if (dy !== 0) {
      var target = rowIndex + dy;
      if (target < 0 || target >= keyNodes.length || !keyNodes[target].length) return;
      var node = keyNodes[rowIndex][colIndex];
      var rect = node.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var best = 0;
      var bestDist = 1e9;
      for (var i = 0; i < keyNodes[target].length; i++) {
        var r2 = keyNodes[target][i].getBoundingClientRect();
        var d = Math.abs((r2.left + r2.width / 2) - cx);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      rowIndex = target;
      colIndex = best;
      applyFocus();
      if (HBC.Audio) HBC.Audio.sfx('move');
      return;
    }

    var row = keyNodes[rowIndex];
    if (!row || !row.length) return;
    colIndex += dx;
    if (colIndex < 0) colIndex = row.length - 1;
    if (colIndex >= row.length) colIndex = 0;
    applyFocus();
    if (HBC.Audio) HBC.Audio.sfx('move');
  }

  function sendTerminal(text) {
    if (!text) return;
    if (opts && opts.onKey) opts.onKey(text);
    if (HBC.Audio) HBC.Audio.sfx('pop');
  }

  function controlCode(ch) {
    var code = ch.charCodeAt(0);
    if (ch === ' ' || ch === '@') return '\x00';
    if (ch >= 'a' && ch <= 'z') return String.fromCharCode(code - 96);
    if (ch >= 'A' && ch <= 'Z') return String.fromCharCode(code - 64);
    if (ch === '[') return '\x1b';
    if (ch === '\\') return '\x1c';
    if (ch === ']') return '\x1d';
    if (ch === '^') return '\x1e';
    if (ch === '_') return '\x1f';
    return ch;
  }

  function insertChar(ch) {
    if (mode === 'terminal') {
      var out = ch;
      if (ctrl) out = controlCode(ch);
      if (alt) out = '\x1b' + out;
      sendTerminal(out);
      if (shift) shift = false;
      ctrl = false;
      alt = false;
      updateDisplay();
      renderMods();
      return;
    }
    buf = buf.substring(0, pos) + ch + buf.substring(pos);
    pos += ch.length;
    if (opts && opts.onText) opts.onText(buf);
    updateDisplay();
    if (HBC.Audio) HBC.Audio.sfx('pop');
  }

  function backspace() {
    if (mode === 'terminal') {
      sendTerminal('\x7f');
      return;
    }
    if (pos > 0) {
      buf = buf.substring(0, pos - 1) + buf.substring(pos);
      pos--;
      if (opts && opts.onText) opts.onText(buf);
      updateDisplay();
    }
  }

  function activate() {
    var key = currentKey();
    if (!key) return;
    var kind = key.kind;

    if (kind === 'char') {
      var ch = key.code;
      if (layer === 'letters' && shift && /[a-z]/.test(ch)) ch = ch.toUpperCase();
      insertChar(ch);
      return;
    }
    if (kind === 'special') { sendTerminal(key.code); return; }
    if (kind === 'shift') { shift = !shift; render(); return; }
    if (kind === 'layer') { layer = layer === 'letters' ? 'symbols' : 'letters'; shift = false; render(); return; }
    if (kind === 'mod') {
      if (key.mod === 'ctrl') ctrl = !ctrl;
      if (key.mod === 'alt') alt = !alt;
      renderMods();
      return;
    }
    if (kind === 'backspace') { backspace(); return; }
    if (kind === 'enter') {
      if (mode === 'terminal') sendTerminal('\r');
      else {
        if (opts && opts.onSubmit) opts.onSubmit(buf);
        close();
      }
      return;
    }
    if (kind === 'close') { close(); return; }
    if (kind === 'textmove') { pos = U.clamp(pos + key.move, 0, buf.length); updateDisplay(); return; }
    if (kind === 'textpos') { pos = key.to < 0 ? buf.length : 0; updateDisplay(); return; }
    if (kind === 'textclear') { buf = ''; pos = 0; if (opts && opts.onText) opts.onText(buf); updateDisplay(); return; }
  }

  function renderMods() {
    for (var r = 0; r < keyNodes.length; r++) {
      for (var c = 0; c < keyNodes[r].length; c++) {
        var key = keyRows[r] && keyRows[r][c];
        if (!key) continue;
        if (key.kind === 'shift') U.toggleClass(keyNodes[r][c], 'on', shift);
        if (key.kind === 'mod' && key.mod === 'ctrl') U.toggleClass(keyNodes[r][c], 'on', ctrl);
        if (key.kind === 'mod' && key.mod === 'alt') U.toggleClass(keyNodes[r][c], 'on', alt);
      }
    }
    updateDisplay();
  }

  function open(options) {
    opts = options || {};
    mode = opts.mode === 'text' ? 'text' : 'terminal';
    buf = opts.value || '';
    pos = buf.length;
    layer = 'letters';
    shift = false;
    ctrl = false;
    alt = false;
    rowIndex = 0;
    colIndex = 0;
    isOpen = true;
    U.removeClass(elKeyboard, 'hidden');
    render();
    if (HBC.Audio) HBC.Audio.sfx('select');
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    U.addClass(elKeyboard, 'hidden');
    var callback = opts && opts.onClose;
    opts = null;
    if (callback) callback();
  }

  function handleRemote(action, ev) {
    if (!isOpen) return false;
    if (action === 'up') { moveFocus(0, -1); return true; }
    if (action === 'down') { moveFocus(0, 1); return true; }
    if (action === 'left') { moveFocus(-1, 0); return true; }
    if (action === 'right') { moveFocus(1, 0); return true; }
    if (action === 'enter') { activate(); return true; }
    if (action === 'back' || action === 'exit' || action === 'green') { close(); return true; }
    if (action === 'space') { insertChar(' '); return true; }
    if (action === 'tab') { if (mode === 'terminal') sendTerminal('\t'); return true; }
    if (action === 'backspace') { backspace(); return true; }
    if (action === 'digit') {
      var ch = ev && ev.key ? ev.key : '';
      if (ch && ch.length === 1) insertChar(ch);
      return true;
    }
    return true;
  }

  function typeChar(ch) {
    if (!isOpen || !ch) return;
    if (mode === 'terminal') sendTerminal(ch);
    else insertChar(ch);
  }

  HBC.Keyboard = {
    open: open,
    close: close,
    isOpen: function () { return isOpen; },
    mode: function () { return mode; },
    handleRemote: handleRemote,
    typeChar: typeChar
  };
})(window, document);
