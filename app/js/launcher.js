/* Starts the hbc-srv companion from inside the app.

   A web widget cannot spawn processes, so this uses the root shell that a
   Tizen-HBC TV exposes on localhost:2323: the start command is sent to it as
   the body of a padded POST (see sendBody for why), once, then once more if
   hbc-srv still is not answering. The shell itself is never switched on or off.
   The command is written to survive after this app exits (nohup, own session,
   no stdin). The shell is a raw line-based TCP service, so the request is an
   HTTP POST whose *body* is the command line: the shell chokes on the request
   line and headers, then runs the body.

   Called from the intro shortly after the logo appears, from Settings, and from
   the "start it for me" prompts. */
(function (window) {
  'use strict';

  var HBC = window.HBC = window.HBC || {};
  var U = HBC.Util;

  var SHELL = 'http://127.0.0.1:2323/';
  var busy = false;

  function safePath(p) {
    return String(p || '').replace(/[^A-Za-z0-9_\/.\-]/g, '');
  }

  function servicePort() {
    var m = /:(\d+)/.exec((HBC.Bridge && HBC.Bridge.base()) || '');
    return m ? m[1] : '2325';
  }

  /* Where this widget's bundled hbc-srv folder lives on the TV, taken from our
     own URL (file:///opt/usr/apps/<pkg>/res/wgt/index.html). Empty if unknown. */
  function ownDir() {
    try {
      if (window.location && window.location.protocol === 'file:') {
        var path = decodeURIComponent(window.location.pathname || '');
        path = path.substring(0, path.lastIndexOf('/'));
        if (path) return path + '/hbc-srv';
      }
    } catch (e) {}
    return '';
  }

  function scriptDirs() {
    var out = [];
    var own = ownDir();
    if (own) out.push(own);
    var user = safePath(HBC.Settings && HBC.Settings.srvDir);
    if (user) out.push(user);
    out.push('/opt/usr/apps/tizenhbc01/res/wgt/hbc-srv',
      '/opt/usr/home/owner/apps_rw/tizenhbc01/res/wgt/hbc-srv',
      '/home/owner/apps_rw/tizenhbc01/res/wgt/hbc-srv',
      '/opt/usr/home/owner/share/hbc-srv');
    return out;
  }

  /* UEP blocks `sh <file>` for any unsigned script run directly from disk - both
     launch.sh and hbc-srv.sh trip it. The bypass (found by testing on-device): feed
     the script's own TEXT to `/bin/sh -c`, with the real path only as $0, so no
     unsigned file is ever the thing actually executed. $0 still makes the script's
     own `dirname "$0"` resolve correctly. This replaces launch.sh entirely - the
     widget now talks to hbc-srv.sh directly. */

  /* Find hbc-srv.sh and run it through the bypass above. hbc-srv.sh's own start
     case is the guard against duplicates (pid file + port check), and it logs to
     /tmp/hbc-launch.log - read that first when a start attempt fails. */
  function buildCommand() {
    return 'D=""; for d in ' + scriptDirs().join(' ') + '; do ' +
      '[ -f "$d/hbc-srv.sh" ] && D="$d" && break; done; ' +
      '[ -n "$D" ] && { S="$(command -v setsid)"; HBC_PORT=' + servicePort() +
      ' $S /bin/sh -c "$(cat "$D/hbc-srv.sh")" "$D/hbc-srv.sh" start ' +
      '</dev/null >>/tmp/hbc-launch.log 2>&1 & } || ' +
      'echo "hbc-srv.sh not found in any known folder" >> /tmp/hbc-launch.log';
  }

  /* The shell on 2323 is a terminal: it echoes everything back, so the browser
     sees garbage instead of HTTP and drops the connection within milliseconds -
     and the shell kills a session that drops before it has run the line (measured
     on-device: it needs ~60 ms; a cold TV loses that race). Chromium does not read
     the response while it is still uploading a body, and the shell stops reading
     once its echo backs up, so a large padded body keeps the connection open for
     as long as we like. The command goes first in the body, the padding after it.
     The body is a plain text/plain POST (a "simple" request, no CORS preflight).
     We abort the upload ourselves once hbc-srv answers or after a few seconds;
     the command itself is detached (setsid, own session) and does not care. */
  var HOLD_MS = 6000;
  var PAD_BYTES = 1200000;
  var pad = null;
  var shellXhr = null;
  var shellTimer = 0;

  function padding() {
    if (pad === null) {
      var chunk = '#AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      while (chunk.length < PAD_BYTES) chunk += chunk;
      pad = chunk.substring(0, PAD_BYTES) + '\n';
    }
    return pad;
  }

  function abortShell() {
    if (shellTimer) { window.clearTimeout(shellTimer); shellTimer = 0; }
    var x = shellXhr;
    shellXhr = null;
    if (x) { try { x.abort(); } catch (e) {} }
  }

  function sendBody(command) {
    abortShell();
    try {
      var x = new XMLHttpRequest();
      x.open('POST', SHELL, true);
      x.setRequestHeader('Content-Type', 'text/plain');
      x.onerror = x.ontimeout = x.onload = function () {};
      shellXhr = x;
      x.send('\n' + command + '\n' + padding());
      shellTimer = window.setTimeout(abortShell, HOLD_MS);
    } catch (e) {}
  }

  /* Starting a .NET service on a TV takes a while (hbc-srv.sh itself allows it up
     to 30 s). One attempt, a real window to come up, and only then one more -
     hbc-srv.sh's own start case guards against duplicates, but not while the
     first instance is still opening its port, so there is no rapid retrying. */
  function sendShell(command, cb) {
    sendBody(command);
    waitOnline(20, function (ok) {
      if (ok) { abortShell(); cb(true); return; }
      sendBody(command);
      waitOnline(35, function (ok2) {
        abortShell();
        cb(ok2);
      });
    });
  }

  function waitOnline(tries, cb) {
    var n = 0;
    (function check() {
      HBC.Bridge.status(function (err) {
        if (!err) { cb(true); return; }
        if (++n >= tries) { cb(false); return; }
        window.setTimeout(check, 1000);
      }, 1200);
    })();
  }

  function finish(ok, quiet, cb) {
    busy = false;
    if (HBC.Toast && !quiet) {
      HBC.Toast.show(ok ? 'hbc-srv started.' :
        'Could not start hbc-srv. On the TV run: cat /tmp/hbc-launch.log', 4200);
    } else if (ok && HBC.Toast) {
      HBC.Toast.show('hbc-srv online.', 2200);
    }
    if (ok && HBC.Main) HBC.Main.refreshStatus();
    if (cb) cb(ok);
  }

  /* auto = true when started by the intro: respects the "Start hbc-srv
     automatically" setting and stays quiet on failure. */
  function ensure(auto, cb) {
    if (busy) { if (cb) cb(false); return; }
    if (auto && HBC.Settings && HBC.Settings.autoStart === false) { if (cb) cb(false); return; }
    busy = true;
    HBC.Bridge.status(function (err) {
      if (!err) { busy = false; if (cb) cb(true); return; }
      var command = buildCommand();

      /* The shell on 2323 is left exactly as the user set it up: it is never
         switched on or off from here (it cannot be probed reliably - it only
         answers with an echo - so a "was it already on?" check cannot be trusted). */
      sendShell(command, function (ok) { finish(ok, auto, cb); });
    }, 1200);
  }

  HBC.Launcher = {
    ensure: ensure,
    isBusy: function () { return busy; }
  };
})(window);
