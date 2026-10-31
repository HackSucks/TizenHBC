/* Tizen Homebrew Channel — small ES5 utilities. */
(function (window, document) {
  'use strict';

  var HBC = window.HBC = window.HBC || {};

  function $(id) { return document.getElementById(id); }

  function $$(selector, root) {
    var list = (root || document).querySelectorAll(selector);
    var out = [];
    for (var i = 0; i < list.length; i++) out.push(list[i]);
    return out;
  }

  function create(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function addClass(node, cls) {
    if (!node) return;
    if ((' ' + node.className + ' ').indexOf(' ' + cls + ' ') < 0) {
      node.className = node.className ? node.className + ' ' + cls : cls;
    }
  }

  function removeClass(node, cls) {
    if (!node) return;
    var parts = node.className ? node.className.split(/\s+/) : [];
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] && parts[i] !== cls) out.push(parts[i]);
    }
    node.className = out.join(' ');
  }

  function hasClass(node, cls) {
    return !!node && (' ' + node.className + ' ').indexOf(' ' + cls + ' ') >= 0;
  }

  function toggleClass(node, cls, on) {
    if (on) addClass(node, cls); else removeClass(node, cls);
  }

  function on(node, event, fn, capture) {
    if (!node) return;
    if (node.addEventListener) node.addEventListener(event, fn, !!capture);
    else if (node.attachEvent) node.attachEvent('on' + event, fn);
  }

  function stop(event) {
    if (!event) return;
    if (event.preventDefault) event.preventDefault();
    if (event.stopPropagation) event.stopPropagation();
    event.returnValue = false;
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBytes(bytes) {
    var n = Number(bytes);
    if (!n || n < 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
    return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function nowTime() {
    var d = new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function utf8ToB64(str) {
    return window.btoa(unescape(encodeURIComponent(String(str))));
  }

  function b64ToUtf8(b64) {
    return decodeURIComponent(escape(window.atob(b64)));
  }

  function b64ToBytes(b64) {
    var bin = window.atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToB64(bytes) {
    var s = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return window.btoa(s);
  }

  function xhr(method, url, body, cb, timeout) {
    var x = new XMLHttpRequest();
    var finished = false;
    var payload = null;

    function finish(err, data, status) {
      if (finished) return;
      finished = true;
      if (cb) cb(err, data, status);
    }

    try {
      x.open(method, url, true);
    } catch (e) {
      finish('open failed: ' + e.message, null, 0);
      return;
    }

    x.timeout = timeout || 8000;
    if (body && typeof body === 'object') {
      payload = JSON.stringify(body);
      try { x.setRequestHeader('Content-Type', 'application/json'); } catch (e1) {}
    } else {
      payload = body || null;
    }
    try { x.setRequestHeader('X-HBC', '1'); } catch (e2) {}

    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      var data = null;
      try { data = JSON.parse(x.responseText); } catch (e3) { data = x.responseText; }
      if (x.status >= 200 && x.status < 300) finish(null, data, x.status);
      else finish('HTTP ' + x.status, data, x.status);
    };
    x.ontimeout = function () { finish('timeout', null, 0); };
    x.onerror = function () { finish('network error', null, 0); };

    try { x.send(payload); } catch (e4) { finish('send failed: ' + e4.message, null, 0); }
  }

  function storageGet(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function clamp(value, min, max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  function repeat(str, count) {
    var out = '';
    for (var i = 0; i < count; i++) out += str;
    return out;
  }

  function trim(str) { return String(str || '').replace(/^\s+|\s+$/g, ''); }

  function safeUrl(url) {
    var value = trim(url);
    if (/^https?:\/\//i.test(value)) return value;
    return '';
  }

  function inlineMarkdown(text) {
    var out = text;
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    out = out.replace(/\*([^*]+)\*/g, '<i>$1</i>');
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (m, label, url) {
      var safe = safeUrl(url.replace(/&amp;/g, '&'));
      if (!safe) return label;
      return '<a href="' + escapeHtml(safe) + '" target="_blank" rel="noopener">' + label + '</a>';
    });
    return out;
  }

  /* Tiny Markdown renderer: headings, lists, fenced code, links, inline code,
     bold/italic and rules. Input is escaped first, so README content cannot
     inject HTML. */
  function markdown(text) {
    if (!text) return '';
    var lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var inCode = false;
    var code = [];
    var inList = false;
    var i;

    function closeList() {
      if (inList) { out.push('</div>'); inList = false; }
    }

    for (i = 0; i < lines.length; i++) {
      var raw = lines[i];
      if (/^\s*```/.test(raw)) {
        if (inCode) {
          out.push('<pre>' + escapeHtml(code.join('\n')) + '</pre>');
          code = [];
          inCode = false;
        } else {
          closeList();
          inCode = true;
        }
        continue;
      }
      if (inCode) { code.push(raw); continue; }

      var line = escapeHtml(raw);
      if (/^\s*$/.test(line)) { closeList(); out.push(''); continue; }
      if (/^\s*(---|___|\*\*\*)\s*$/.test(line)) { closeList(); out.push('<hr class="md-hr">'); continue; }

      var h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) {
        closeList();
        var level = h[1].length;
        out.push('<h' + level + '>' + inlineMarkdown(h[2]) + '</h' + level + '>');
        continue;
      }

      var li = line.match(/^\s*[-*+]\s+(.*)$/);
      if (li) {
        if (!inList) { out.push('<div class="md-list">'); inList = true; }
        out.push('<div class="md-li">• ' + inlineMarkdown(li[1]) + '</div>');
        continue;
      }
      closeList();
      out.push('<div>' + inlineMarkdown(line) + '</div>');
    }
    if (inCode) out.push('<pre>' + escapeHtml(code.join('\n')) + '</pre>');
    closeList();
    return out.join('\n');
  }

  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }


  /* ── Effects level ─────────────────────────────────────────────────────
     2 = full, 1 = reduced, 0 = minimal. "auto" starts at full and steps down
     when the TV cannot keep up; it never steps back up during a session. */
  var Fx = (function () {
    var mode = 'auto';
    var level = 2;
    var samples = 0;
    var total = 0;
    var listeners = [];
    var inited = false;

    function notify() {
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](level); } catch (e) {}
      }
    }

    function setMode(next) {
      var m = (next === 'full' || next === 'low') ? next : 'auto';
      if (m === mode && inited) return;
      inited = true;
      mode = m;
      samples = 0;
      total = 0;
      level = mode === 'low' ? 0 : 2;
      notify();
    }

    /* Feed frame durations (ms) of a continuously animated scene. */
    function report(ms) {
      if (mode !== 'auto' || level === 0 || ms <= 0 || ms > 1000) return;
      samples++;
      total += ms;
      if (samples >= 45) {
        var avg = total / samples;
        samples = 0;
        total = 0;
        if (avg > 52) {
          level--;
          notify();
        }
      }
    }

    return {
      setMode: setMode,
      report: report,
      level: function () { return level; },
      mode: function () { return mode; },
      onChange: function (fn) { listeners.push(fn); }
    };
  })();

  /* ── Custom scroll bars ─────────────────────────────────────────────────
     Tizen's native scroll bars are tiny and cannot take focus. These draw a
     track + thumb next to a scrollable element so the position is always
     visible, and a "focus" state when the remote is controlling it. */
  var Scroll = (function () {
    var all = [];

    function setT(node, value) {
      node.style.webkitTransform = value;
      node.style.transform = value;
    }

    function attach(el) {
      if (!el) return null;
      if (el._sb) return el._sb;
      var host = el.offsetParent || el.parentNode;
      var track = create('div', 'sbar');
      var thumb = create('div', 'sbarThumb');
      track.appendChild(thumb);
      host.appendChild(track);
      var sb = { el: el, track: track, thumb: thumb, lastH: -1 };
      el._sb = sb;
      all.push(el);
      on(el, 'scroll', function () { update(el); });
      return sb;
    }

    function update(el) {
      var sb = attach(el);
      if (!sb) return;
      var ch = el.clientHeight;
      var sh = el.scrollHeight;
      if (!ch || sh <= ch + 2) {
        sb.track.style.display = 'none';
        sb.visible = false;
        return;
      }
      sb.visible = true;
      var tr = sb.track;
      tr.style.display = 'block';
      tr.style.left = (el.offsetLeft + el.offsetWidth - tr.offsetWidth - 4) + 'px';
      tr.style.top = (el.offsetTop + 4) + 'px';
      tr.style.height = Math.max(0, el.offsetHeight - 8) + 'px';
      var arrow = tr.offsetWidth * 1.25;
      var room = tr.clientHeight - arrow * 2;
      var th = Math.max(room * ch / sh, tr.clientHeight * 0.1);
      var maxScroll = sh - ch;
      var frac = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
      if (frac < 0) frac = 0;
      if (frac > 1) frac = 1;
      if (Math.abs(th - sb.lastH) > 0.5) {
        sb.thumb.style.height = th + 'px';
        sb.lastH = th;
      }
      sb.thumb.style.top = arrow + 'px';
      setT(sb.thumb, 'translate3d(0,' + Math.round((room - th) * frac) + 'px,0)');
    }

    function can(el) {
      return !!el && el.scrollHeight > el.clientHeight + 2;
    }

    function atTop(el) { return el.scrollTop <= 1; }
    function atBottom(el) { return el.scrollTop + el.clientHeight >= el.scrollHeight - 2; }

    function by(el, dy) {
      if (!el) return;
      el.scrollTop += dy;
      update(el);
    }

    function setFocus(el, focused) {
      var sb = attach(el);
      if (!sb) return;
      toggleClass(sb.track, 'focus', !!focused);
      toggleClass(el, 'scrollFocus', !!focused);
    }

    function step(el) {
      return Math.max(24, Math.round((el.clientHeight || window.innerHeight * 0.3) * 0.34));
    }

    return {
      attach: attach,
      update: update,
      can: can,
      atTop: atTop,
      atBottom: atBottom,
      by: by,
      page: function (el, dir) { by(el, dir * Math.round((el.clientHeight || 100) * 0.85)); },
      line: function (el, dir) { by(el, dir * step(el)); },
      setFocus: setFocus,
      updateAll: function () { for (var i = 0; i < all.length; i++) update(all[i]); }
    };
  })();

  on(window, 'resize', function () { Scroll.updateAll(); });

  HBC.Fx = Fx;
  HBC.Scroll = Scroll;

  HBC.Util = {
    $: $,
    $$: $$,
    create: create,
    addClass: addClass,
    removeClass: removeClass,
    hasClass: hasClass,
    toggleClass: toggleClass,
    on: on,
    stop: stop,
    escapeHtml: escapeHtml,
    formatBytes: formatBytes,
    pad2: pad2,
    nowTime: nowTime,
    utf8ToB64: utf8ToB64,
    b64ToUtf8: b64ToUtf8,
    b64ToBytes: b64ToBytes,
    bytesToB64: bytesToB64,
    xhr: xhr,
    storageGet: storageGet,
    storageSet: storageSet,
    clamp: clamp,
    repeat: repeat,
    trim: trim,
    markdown: markdown,
    clear: clear
  };
})(window, document);
