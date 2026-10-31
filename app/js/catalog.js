/* Program catalog: bundled JSON + SamPwn-Programs manifest + installed state. */
(function (window) {
  'use strict';

  var HBC = window.HBC = window.HBC || {};
  var U = HBC.Util;

  var DEFAULT_CATALOG_URL = 'https://raw.githubusercontent.com/HackSucks/SamPwn-Programs/main/programs.json';
  var BUILTIN_IDS = { welcome: 1, programs: 1, settings: 1, about: 1 };

  var catalog = null;
  var programs = [];
  var installedMap = {};
  var loaded = false;
  var lastError = '';

  var BUILTINS = [
    {
      id: 'welcome',
      name: 'Welcome',
      author: 'Tizen Homebrew Channel',
      version: '1.0.0',
      builtin: 'welcome',
      description: 'Start here. Learn how programs are installed and launched.',
      terminal: false,
      keyboard: false,
      icon: 'res/icons/welcome.png',
      readmeText: [
        '# Welcome to the Tizen Homebrew Channel!',
        '',
        'I hope you had a safe journey on the seas here.',
        '',
        '## Launching programs',
        '',
        'Programs are C# (.dll, run with `dotnet`) or native ARM ELF executables. Terminal programs open an xterm.js 24-bit ANSI terminal. Programs that need text input also get the on-screen keyboard.',
        '',
        '## Installing programs',
        '',
        'Open **Programs** from the channel or the Home menu, pick an entry, and choose **Install**. The companion `hbc-srv` service downloads the files into `/opt/usr/home/hbc/programs/<id>`, verifies their SHA-256 hashes, and writes `program.json` plus the program README.',
        '',
        'If the service is offline, the channel still works as a browser of the bundled catalog. Launching a program will explain what is missing.',
        '',
        '## Controls',
        '',
        '- Arrows: move selection',
        '- OK / Enter: start or open',
        '- BACK: Home menu',
        '- Green / F2: toggle the virtual keyboard in a terminal',
        '- Red: program info',
        '- Yellow: switch grid/list view',
        '- Blue: refresh the catalog',
        '',
        'Both the slim Samsung Smart Remote and the full remote work. Every action is reachable with arrows, OK and BACK alone.',
        '',
        '## Credits',
        '',
        'Original Wii Homebrew Channel art and fonts: Team Twiizers (GPL-2.0). Tizen port and companion service: NVMe'
      ].join('\n')
    },
    {
      id: 'programs',
      name: 'Programs',
      author: 'THBC-Programs',
      version: '1.0.0',
      builtin: 'programs',
      description: 'Browse and install programs from the Programs catalog.',
      terminal: false,
      keyboard: false,
      icon: 'res/icons/programs.png',
      readmeText: [
        '# Programs',
        '',
        'The catalog is a JSON document published by the THBC repository. Each entry records:',
        '',
        '- the program directory and README',
        '- whether it is C# or native code',
        '- the exact `.dll` or ELF entry point',
        '- whether it is a terminal program',
        '- whether it needs a keyboard',
        '',
        'Use **Refresh catalog** in the Home menu to pull the latest manifest.'
      ].join('\n')
    },
    {
      id: 'settings',
      name: 'Settings',
      author: 'Tizen Homebrew Channel',
      version: '1.0.0',
      builtin: 'settings',
      description: 'Service URL, catalog URL, music, sounds and view mode.',
      terminal: false,
      keyboard: false,
      icon: 'res/icons/settings.png'
    },
    {
      id: 'about',
      name: 'About',
      author: 'Tizen Homebrew Channel',
      version: '1.0.0',
      builtin: 'about',
      description: 'About this port, its controls, licenses and credits.',
      terminal: false,
      keyboard: false,
      icon: 'res/icons/about.png',
      readmeText: [
        '# Tizen Homebrew Channel',
        '',
        'A Homebrew provider channel for Tizen TVs that mimicks the look and feel of the Wii Homebrew Channel.',
        '',
        '## Runtime',
        '',
        '- Widget: HTML,CSS,JavaScript.',
        '- Terminal: xterm.js',
        '- Programs: C# (.NET Core 3.1) or native ARM ELF',
        '- Companion: `hbc-srv`, a localhost-only HTTP + PTY service',
        '',
        '## Licenses',
        '',
        'The original Homebrew Channel assets (logo, background, bubbles, buttons, cursor and Droid fonts) come from the GPL-2.0 open-source release by Team Twiizers. The widget and companion service are distributed under GPL-2.0 as well. See `COPYING`.',
        '',
        '## Fonts and logo',
        '',
        'The channel UI uses Droid Sans / Droid Sans Bold, the redistributable substitute shipped with the open-source Homebrew Channel (the original interface font, Horatio D Medium, is commercial).',
        '',
        'The "the Tizen Homebrew Channel" logo is real text set in **Ubuntu** (Ubuntu Font Licence 1.0), whose letterforms match the original HBC wordmark, rather than a re-used bitmap. `tools/gen-logo.py` regenerates it.',
        '',
      ].join('\n')
    }
  ];

  function resolveUrl(relative, baseUrl) {
    if (!relative) return '';
    if (/^https?:\/\//i.test(relative)) return relative;
    if (!baseUrl) return relative;
    var b = baseUrl;
    if (b.charAt(b.length - 1) !== '/') b += '/';
    return b + relative.replace(/^\.?\//, '');
  }

  function normalizeProgram(p, baseUrl) {
    if (!p) return null;
    var out = {};
    var k;
    for (k in p) if (p.hasOwnProperty(k)) out[k] = p[k];

    out.id = U.trim(out.id || out.dir || out.name || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    if (!out.id) return null;
    out.name = out.name || out.id;
    out.author = out.author || 'Unknown';
    out.version = out.version || '';
    out.description = out.description || '';
    out.language = (out.language || (out.runtime === 'dotnet' ? 'csharp' : 'native')).toLowerCase();
    out.runtime = (out.runtime || (out.language === 'csharp' ? 'dotnet' : 'elf')).toLowerCase();
    out.terminal = out.terminal !== false;
    out.keyboard = out.keyboard === true;
    out.output = out.output || (out.terminal ? 'terminal' : 'log');
    out.dir = out.dir || out.id;
    out.baseUrl = out.baseUrl || baseUrl || '';
    out.iconUrl = out.icon ? resolveUrl(out.icon, out.baseUrl) : '';
    out.readmeUrl = out.readme ? resolveUrl(out.readme, out.baseUrl) : '';
    out.entryUrl = out.entry ? resolveUrl(out.entry, out.baseUrl) : '';
    out.installed = !!out.installed;
    out.builtin = out.builtin || '';
    return out;
  }

  function normalizeCatalog(json) {
    if (!json || !json.programs || !json.programs.length) return null;
    var out = {
      schema: json.schema || 'tizen-hbc/catalog@1',
      name: json.name || 'Programs',
      updated: json.updated || '',
      baseUrl: json.baseUrl || '',
      installRoot: json.installRoot || '/opt/usr/home/hbc/programs',
      programs: []
    };
    var list = json.programs || [];
    for (var i = 0; i < list.length; i++) {
      var p = normalizeProgram(list[i], out.baseUrl);
      if (p) out.programs.push(p);
    }
    return out;
  }

  function rebuild() {
    programs = [];
    var seen = {};
    var i;
    for (i = 0; i < BUILTINS.length; i++) {
      if (seen[BUILTINS[i].id]) continue;
      seen[BUILTINS[i].id] = 1;
      programs.push(BUILTINS[i]);
    }
    var list = catalog && catalog.programs ? catalog.programs : [];
    for (i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || seen[p.id]) continue;
      seen[p.id] = 1;
      p.installed = !!installedMap[p.id];
      if (installedMap[p.id]) {
        p.installPath = installedMap[p.id].installPath || p.installPath;
        if (installedMap[p.id].readme && !p.readmeText) p.readmeText = installedMap[p.id].readme;
      }
      programs.push(p);
    }
  }

  function setInstalled(list) {
    installedMap = {};
    if (list && list.length) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].id) installedMap[list[i].id] = list[i];
      }
    }
    rebuild();
  }

  function setCatalog(json) {
    var normalized = normalizeCatalog(json);
    if (!normalized) return false;
    catalog = normalized;
    rebuild();
    return true;
  }

  function loadBundled(cb) {
    U.xhr('GET', 'res/programs.json', null, function (err, data) {
      if (!err) setCatalog(data);
      if (cb) cb(err, catalog);
    }, 8000);
  }

  function loadCached() {
    var cached = U.storageGet('hbc.catalog', null);
    if (cached) setCatalog(cached);
  }

  function load(cb) {
    loadCached();
    loadBundled(function () {
      if (HBC.Bridge && HBC.Bridge.isOnline()) {
        HBC.Bridge.installed(function (err, data) {
          if (!err && data && data.installed) setInstalled(data.installed);
          if (HBC.Bridge.catalog) {
            HBC.Bridge.catalog(function (err2, data2) {
              if (!err2 && data2 && data2.catalog) {
                setCatalog(data2.catalog);
                setInstalled(data2.installed || []);
              }
              loaded = true;
              if (cb) cb();
            });
          } else {
            loaded = true;
            if (cb) cb();
          }
        });
      } else {
        loaded = true;
        if (cb) cb();
      }
    });
  }

  function refresh(cb) {
    var url = (HBC.Settings && HBC.Settings.catalogUrl) || DEFAULT_CATALOG_URL;
    lastError = '';
    U.xhr('GET', url, null, function (err, data) {
      if (err) {
        lastError = String(err);
        if (cb) cb(err, null);
        return;
      }
      if (!setCatalog(data)) {
        lastError = 'invalid catalog JSON';
        if (cb) cb(lastError, null);
        return;
      }
      U.storageSet('hbc.catalog', data);
      if (HBC.Bridge && HBC.Bridge.isOnline()) HBC.Bridge.saveCatalog(data, function () {});
      rebuild();
      if (cb) cb(null, catalog);
    }, 12000);
  }

  function find(id) {
    for (var i = 0; i < programs.length; i++) {
      if (programs[i].id === id) return programs[i];
    }
    return null;
  }

  function iconFor(program) {
    if (!program) return '';
    if (program.iconUrl) return program.iconUrl;
    if (program.builtin) return 'res/icons/' + program.builtin + '.png';
    return 'res/icons/' + program.id + '.png';
  }

  function isBuiltin(program) {
    return !!(program && program.builtin);
  }

  function readme(program, cb) {
    if (!program) { cb(''); return; }
    if (program.readmeText) { cb(program.readmeText); return; }
    if (HBC.Bridge && HBC.Bridge.isOnline() && program.installed) {
      HBC.Bridge.readProgram(program.id, function (err, data) {
        if (!err && data && data.readme) { cb(data.readme); return; }
        if (program.readmeUrl) fetchReadme(program.readmeUrl, cb);
        else cb(program.description || '');
      });
      return;
    }
    if (program.readmeUrl) {
      fetchReadme(program.readmeUrl, function (text) {
        if (text || !program.bundled) { cb(text || program.description || ''); return; }
        fetchReadme('res/programs/' + program.id + '/README.md', function (fallback) {
          cb(fallback || program.description || '');
        });
      });
      return;
    }
    cb(program.description || '');
  }

  function fetchReadme(url, cb) {
    U.xhr('GET', url, null, function (err, data) {
      if (err) { cb(''); return; }
      if (typeof data === 'string') cb(data);
      else cb(String(data || ''));
    }, 10000);
  }

  function install(program, cb) {
    if (!program || program.builtin) { if (cb) cb('builtin'); return; }
    if (!HBC.Bridge || !HBC.Bridge.isOnline()) { if (cb) cb('service offline'); return; }
    HBC.Bridge.install(program, function (err, data) {
      if (err) { if (cb) cb(err); return; }
      if (data && data.program) {
        installedMap[program.id] = data.program;
        program.installed = true;
        rebuild();
      }
      if (cb) cb(null, data);
    });
  }

  function uninstall(program, cb) {
    if (!program || program.builtin) { if (cb) cb('builtin'); return; }
    if (!HBC.Bridge || !HBC.Bridge.isOnline()) { if (cb) cb('service offline'); return; }
    HBC.Bridge.uninstall(program.id, function (err, data) {
      if (err) { if (cb) cb(err); return; }
      delete installedMap[program.id];
      program.installed = false;
      rebuild();
      if (cb) cb(null, data);
    });
  }

  HBC.Catalog = {
    DEFAULT_CATALOG_URL: DEFAULT_CATALOG_URL,
    load: load,
    refresh: refresh,
    find: find,
    programs: function () { return programs; },
    catalog: function () { return catalog; },
    installed: function () { return installedMap; },
    iconFor: iconFor,
    isBuiltin: isBuiltin,
    readme: readme,
    install: install,
    uninstall: uninstall,
    setInstalled: setInstalled,
    isLoaded: function () { return loaded; },
    lastError: function () { return lastError; }
  };
})(window);
