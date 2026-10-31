/* HTTP bridge to the optional hbc-srv companion service. */
(function (window) {
  'use strict';

  var HBC = window.HBC = window.HBC || {};
  var U = HBC.Util;

  var DEFAULT_URL = 'http://127.0.0.1:2325';
  var online = false;
  var lastStatus = null;

  function base() {
    var url = (HBC.Settings && HBC.Settings.serviceUrl) || DEFAULT_URL;
    url = U.trim(url);
    while (url.length > 1 && url.charAt(url.length - 1) === '/') url = url.substring(0, url.length - 1);
    return url;
  }

  function setOnline(value, status) {
    online = !!value;
    lastStatus = status || null;
    if (HBC.Bridge.onStatusChange) HBC.Bridge.onStatusChange(online, lastStatus);
  }

  function status(cb, timeout) {
    U.xhr('GET', base() + '/status', null, function (err, data) {
      if (err) setOnline(false, null);
      else setOnline(true, data);
      if (cb) cb(err, data);
    }, timeout || 2200);
  }

  function installed(cb) {
    U.xhr('GET', base() + '/programs', null, function (err, data) {
      if (cb) cb(err, data);
    }, 5000);
  }

  function catalog(cb) {
    U.xhr('GET', base() + '/catalog', null, function (err, data) {
      if (cb) cb(err, data);
    }, 5000);
  }

  function saveCatalog(json, cb) {
    U.xhr('POST', base() + '/catalog', { json: json }, function (err, data) {
      if (cb) cb(err, data);
    }, 8000);
  }

  function run(program, cols, rows, cb) {
    var body = { id: program.id, cols: cols, rows: rows };
    if (program.args && program.args.length) body.args = program.args;
    U.xhr('POST', base() + '/run', body, function (err, data) {
      if (cb) cb(err, data);
    }, 12000);
  }

  function poll(session, since, cb) {
    U.xhr('GET', base() + '/session/' + encodeURIComponent(session) + '?since=' + since,
      null, function (err, data) {
        if (cb) cb(err, data);
      }, 8000);
  }

  function input(session, text, cb) {
    U.xhr('POST', base() + '/session/' + encodeURIComponent(session) + '/input',
      { b64: U.utf8ToB64(text) }, function (err, data) {
        if (cb) cb(err, data);
      }, 5000);
  }

  function resize(session, cols, rows, cb) {
    U.xhr('POST', base() + '/session/' + encodeURIComponent(session) + '/resize',
      { cols: cols, rows: rows }, function (err, data) {
        if (cb) cb(err, data);
      }, 4000);
  }

  function kill(session, cb) {
    U.xhr('POST', base() + '/session/' + encodeURIComponent(session) + '/kill',
      {}, function (err, data) {
        if (cb) cb(err, data);
      }, 5000);
  }

  function install(program, cb) {
    var source = program.bundled ? 'bundle' : 'remote';
    var body = { id: program.id, source: source, program: program };
    if (program.baseUrl) body.baseUrl = program.baseUrl;
    U.xhr('POST', base() + '/install', body, function (err, data) {
      if (cb) cb(err, data);
    }, 120000);
  }

  function uninstall(id, cb) {
    U.xhr('POST', base() + '/uninstall', { id: id }, function (err, data) {
      if (cb) cb(err, data);
    }, 15000);
  }

  function readProgram(id, cb) {
    U.xhr('GET', base() + '/program/' + encodeURIComponent(id), null, function (err, data) {
      if (cb) cb(err, data);
    }, 8000);
  }

  HBC.Bridge = {
    DEFAULT_URL: DEFAULT_URL,
    base: base,
    status: status,
    installed: installed,
    catalog: catalog,
    saveCatalog: saveCatalog,
    run: run,
    poll: poll,
    input: input,
    resize: resize,
    kill: kill,
    install: install,
    uninstall: uninstall,
    readProgram: readProgram,
    isOnline: function () { return online; },
    lastStatus: function () { return lastStatus; },
    onStatusChange: null
  };
})(window);
