/* Application bootstrap, settings persistence and global input routing. */
(function (window, document) {
  'use strict';

  var HBC = window.HBC = window.HBC || {};
  var U = HBC.Util;

  var STORAGE_KEY = 'hbc.settings';

  var DEFAULTS = {
    serviceUrl: 'http://127.0.0.1:2325',
    catalogUrl: 'https://raw.githubusercontent.com/HackSucks/THBC-Programs/main/programs.json',
    music: true,
    sfx: true,
    view: 'grid',
    fx: 'auto',
    avOffset: 100,
    autoStart: true,
    srvDir: '/opt/usr/home/owner/share/hbc-srv'
  };

  var settings = null;
  var bridgeWasOnline = false;
  var catalogLoading = false;
  var statusTimer = null;
  var booted = false;

  function copyDefaults() {
    var out = {};
    for (var k in DEFAULTS) if (DEFAULTS.hasOwnProperty(k)) out[k] = DEFAULTS[k];
    return out;
  }

  function normalizeSettings(raw) {
    var out = copyDefaults();
    if (!raw || typeof raw !== 'object') return out;
    if (typeof raw.serviceUrl === 'string' && U.trim(raw.serviceUrl)) out.serviceUrl = U.trim(raw.serviceUrl);
    if (typeof raw.catalogUrl === 'string' && U.trim(raw.catalogUrl)) out.catalogUrl = U.trim(raw.catalogUrl);
    out.music = raw.music !== false;
    out.sfx = raw.sfx !== false;
    out.view = raw.view === 'list' ? 'list' : 'grid';
    out.autoStart = raw.autoStart !== false;
    if (typeof raw.srvDir === 'string' && U.trim(raw.srvDir)) out.srvDir = U.trim(raw.srvDir);
    out.fx = (raw.fx === 'full' || raw.fx === 'low') ? raw.fx : 'auto';
    if (typeof raw.avOffset === 'number' && raw.avOffset >= 0 && raw.avOffset <= 1000) out.avOffset = raw.avOffset;
    return out;
  }

  function loadSettings() {
    return normalizeSettings(U.storageGet(STORAGE_KEY, null));
  }

  function saveSettings() {
    if (!settings) return;
    HBC.Settings = settings;
    U.storageSet(STORAGE_KEY, settings);
    if (HBC.Audio) HBC.Audio.refreshSettings();
    if (HBC.Fx) HBC.Fx.setMode(settings.fx);
  }

  function resetSettings() {
    settings = copyDefaults();
    HBC.Settings = settings;
    U.storageSet(STORAGE_KEY, settings);
    if (HBC.Audio) HBC.Audio.refreshSettings();
    if (HBC.Fx) HBC.Fx.setMode(settings.fx);
    if (HBC.Main) HBC.Main.setView(settings.view);
  }

  function exitApp() {
    if (HBC.Audio) {
      HBC.Audio.stopBgm(200);
      HBC.Audio.stopIntro(200);
    }
    try {
      if (window.tizen && window.tizen.application) {
        window.tizen.application.getCurrentApplication().exit();
        return;
      }
    } catch (e) {}
    try { window.close(); } catch (e2) {}
  }

  function refreshCatalog() {
    if (!HBC.Catalog) return;
    if (catalogLoading) {
      HBC.Toast.show('Catalog refresh already running.');
      return;
    }
    catalogLoading = true;
    HBC.Toast.show('Refreshing catalog…', 15000);
    HBC.Catalog.refresh(function (err) {
      catalogLoading = false;
      if (err) {
        HBC.Toast.show('Catalog refresh failed: ' + err);
        if (HBC.Audio) HBC.Audio.sfx('error');
        return;
      }
      HBC.Main.render();
      HBC.Main.refreshStatus();
      if (HBC.Main.overlay() === 'catalog') HBC.Main.openCatalog();
      HBC.Toast.show('Catalog updated.');
      if (HBC.Audio) HBC.Audio.sfx('select');
    });
  }

  function reloadCatalog() {
    if (!HBC.Catalog || catalogLoading) return;
    catalogLoading = true;
    HBC.Catalog.load(function () {
      catalogLoading = false;
      if (HBC.Main) {
        HBC.Main.render();
        HBC.Main.refreshStatus();
      }
    });
  }

  function routeRemote(action, ev) {
    if (HBC.Dialog && HBC.Dialog.isOpen()) {
      return HBC.Dialog.handleRemote(action, ev);
    }
    if (HBC.Keyboard && HBC.Keyboard.isOpen()) {
      if (HBC.Keyboard.handleRemote(action, ev)) return true;
    }
    if (HBC.Menu && HBC.Menu.isOpen()) {
      return HBC.Menu.handleRemote(action, ev);
    }
    if (HBC.Terminal && HBC.Terminal.isOpen()) {
      if (HBC.Terminal.handleRemote(action, ev)) return true;
    }
    if (HBC.Main && HBC.Main.isOverlayOpen()) {
      return HBC.Main.handleRemote(action, ev);
    }
    if (HBC.Intro && !HBC.Intro.isStarted()) {
      return HBC.Intro.handleRemote(action, ev);
    }
    if (HBC.Main) return HBC.Main.handleRemote(action, ev);
    return false;
  }

  function pollStatus() {
    if (!HBC.Bridge) return;
    HBC.Bridge.status(function () {
      if (HBC.Main) HBC.Main.refreshStatus();
    });
  }

  function boot() {
    if (booted) return;
    booted = true;

    settings = loadSettings();
    HBC.Settings = settings;
    if (HBC.Fx) HBC.Fx.setMode(settings.fx);

    if (HBC.Audio) HBC.Audio.init();
    if (HBC.Terminal) HBC.Terminal.init();
    if (HBC.Main) HBC.Main.init();
    if (HBC.Remote) {
      HBC.Remote.init();
      HBC.Remote.setHandler(routeRemote);
    }
    if (HBC.Intro) HBC.Intro.init();

    if (HBC.Bridge) {
      HBC.Bridge.onStatusChange = function (online) {
        if (HBC.Main) HBC.Main.refreshStatus();
        if (online && !bridgeWasOnline) {
          bridgeWasOnline = true;
          reloadCatalog();
        } else if (!online) {
          bridgeWasOnline = false;
        }
      };
    }

    if (HBC.Catalog) {
      HBC.Catalog.load(function () {
        if (HBC.Main) {
          HBC.Main.render();
          HBC.Main.refreshStatus();
        }
      });
    }

    if (HBC.Main) {
      HBC.Main.render();
      HBC.Main.refreshStatus();
    }

    if (HBC.Intro) HBC.Intro.show();

    pollStatus();
    statusTimer = window.setInterval(pollStatus, 30000);

    U.on(window, 'online', function () { pollStatus(); });
    U.on(window, 'offline', function () { if (HBC.Main) HBC.Main.refreshStatus(); });
  }

  HBC.App = {
    boot: boot,
    exit: exitApp,
    refreshCatalog: refreshCatalog,
    reloadCatalog: reloadCatalog,
    saveSettings: saveSettings,
    resetSettings: resetSettings,
    settings: function () { return settings; },
    defaults: function () { return copyDefaults(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, false);
  } else {
    boot();
  }
})(window, document);
