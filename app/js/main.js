/* The channel grid, program details, settings and catalog overlays. */
(function (window, document) {
  'use strict';

  var HBC = window.HBC = window.HBC || {};
  var U = HBC.Util;

  var elMain = U.$('main');
  var elGrid = U.$('grid');
  var elCursor = U.$('cursor');
  var elCursorBox = U.$('cursorBox');
  var elStatusText = U.$('statusText');
  var elIcoService = U.$('icoService');
  var elIcoNet = U.$('icoNet');
  var elArrowPrev = U.$('arrowPrev');
  var elArrowNext = U.$('arrowNext');

  var elDetail = U.$('detail');
  var elDetailTitle = U.$('detailTitle');
  var elDetailArt = U.$('detailArt');
  var elDetailName = U.$('detailName');
  var elDetailAuthor = U.$('detailAuthor');
  var elDetailBadges = U.$('detailBadges');
  var elDetailDesc = U.$('detailDesc');
  var elDetailReadme = U.$('detailReadme');
  var elDetailButtons = U.$('detailButtons');

  var elSettings = U.$('settings');
  var elSettingsList = U.$('settingsList');

  var elCatalog = U.$('catalog');
  var elCatalogList = U.$('catalogList');

  var GRID_COLS = 4;
  var GRID_ROWS = 5;
  var LIST_ROWS = 5;

  var view = 'grid';
  var page = 0;
  var col = 0;
  var row = 0;
  var selectedId = '';
  var tiles = [];
  var entered = false;
  var activeOverlay = '';

  var detailProgram = null;
  var detailButtons = [];
  var detailIndex = 0;
  var detailBusy = false;
  var detailToken = 0;
  var detailZone = 'buttons';   /* 'buttons' | 'text' */
  var detailHint = U.$('detailHint');

  var settingsRows = [];
  var settingsIndex = 0;

  var catalogRows = [];
  var catalogIndex = 0;

  /* ── Grid helpers ─────────────────────────────────────────────────────── */

  function cols() { return view === 'list' ? 1 : GRID_COLS; }
  function rows() { return GRID_ROWS; }
  function pageSize() { return cols() * rows(); }

  function programList() {
    return HBC.Catalog ? HBC.Catalog.programs() : [];
  }

  function pageCount() {
    var n = programList().length;
    var size = pageSize();
    return Math.max(1, Math.ceil(n / size));
  }

  function clampPage() {
    var max = pageCount();
    if (page >= max) page = max - 1;
    if (page < 0) page = 0;
  }

  function selectedProgram() {
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].program && tiles[i].program.id === selectedId) return tiles[i].program;
    }
    return HBC.Catalog ? HBC.Catalog.find(selectedId) : null;
  }

  function focusTile() {
    for (var i = 0; i < tiles.length; i++) {
      U.toggleClass(tiles[i].node, 'focus', tiles[i].program.id === selectedId);
    }
  }

  function positionCursor() {
    if (!elCursor || !entered) return;
    var node = null;
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].program.id === selectedId) { node = tiles[i].node; break; }
    }
    if (!node) { U.removeClass(elCursorBox, 'show'); return; }
    var rect = node.getBoundingClientRect();
    var cw = elCursorBox.offsetWidth || window.innerWidth * 0.09;
    var left = rect.left - cw * 0.34;
    var top = rect.top + rect.height * 0.30;
    if (left < 0) left = 4;
    if (top < 0) top = 4;
    var tf = 'translate3d(' + Math.round(left) + 'px,' + Math.round(top) + 'px,0)';
    elCursorBox.style.webkitTransform = tf;
    elCursorBox.style.transform = tf;
    U.addClass(elCursorBox, 'show');
  }

  function updateArrows() {
    var total = pageCount();
    if (elArrowPrev) {
      U.toggleClass(elArrowPrev, 'show', page > 0);
      U.toggleClass(elArrowPrev, 'pulse', page > 0);
    }
    if (elArrowNext) {
      U.toggleClass(elArrowNext, 'show', page < total - 1);
      U.toggleClass(elArrowNext, 'pulse', page < total - 1);
    }
  }

  function setSelection(index) {
    var list = programList();
    var start = page * pageSize();
    var max = Math.min(pageSize(), Math.max(0, list.length - start)) - 1;
    if (max < 0) max = 0;
    if (index < 0) index = 0;
    if (index > max) index = max;
    col = index % cols();
    row = Math.floor(index / cols());
    var p = list[start + index];
    selectedId = p ? p.id : '';
    focusTile();
    positionCursor();
  }

  function selectProgram(program) {
    if (!program) return;
    var list = programList();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === program.id) {
        page = Math.floor(i / pageSize());
        selectedId = program.id;
        col = i % cols();
        row = Math.floor((i % pageSize()) / cols());
        return;
      }
    }
  }

  function applyArt(node, program) {
    var url = HBC.Catalog.iconFor(program);
    if (!url) return;
    var img = new Image();
    img.onload = function () {
      node.style.backgroundImage = 'url("' + url + '")';
      var placeholder = node.parentNode ? node.parentNode.querySelector('.noart') : null;
      if (placeholder) U.addClass(placeholder, 'hidden');
    };
    img.onerror = function () {};
    img.src = url;
  }

  function tileSubtitle(program) {
    if (program.builtin) return 'Built in';
    var bits = [];
    if (program.author) bits.push(program.author);
    if (program.language === 'csharp') bits.push('C#');
    else if (program.language) bits.push('Native');
    if (program.installed) bits.push('Installed');
    return bits.join(' · ');
  }

  function makeTile(program, index) {
    var isList = view === 'list';
    var node = U.create('div', 'tile' + (isList ? ' list' : ''));
    node.style.left = (isList ? 0 : (index % cols()) * (100 / cols())) + '%';
    node.style.top = Math.floor(index / cols()) * (100 / rows()) + '%';
    node.setAttribute('data-id', program.id);

    if (!program.installed && !program.builtin) U.addClass(node, 'uninstalled');

    var art = U.create('div', 'art');
    node.appendChild(art);
    var noart = U.create('div', 'noart', program.name || program.id);
    node.appendChild(noart);
    applyArt(art, program);

    if (!program.builtin && !program.installed) {
      var badge = U.create('div', 'badge', '↓');
      badge.title = 'Not installed';
      node.appendChild(badge);
    }

    if (isList) {
      var meta = U.create('div', 'listMeta');
      meta.appendChild(U.create('div', 'listName', program.name || program.id));
      meta.appendChild(U.create('div', 'listSub', tileSubtitle(program)));
      node.appendChild(meta);
    }

    U.on(node, 'click', function () {
      selectedId = program.id;
      col = index % cols();
      row = Math.floor(index / cols());
      focusTile();
      positionCursor();
      activate();
    });
    U.on(node, 'mouseenter', function () {
      if (activeOverlay) return;
      selectedId = program.id;
      col = index % cols();
      row = Math.floor(index / cols());
      focusTile();
      positionCursor();
      if (HBC.Audio) HBC.Audio.sfx('move');
    });

    return node;
  }

  function render() {
    if (!elGrid) return;
    clampPage();
    U.clear(elGrid);
    tiles = [];

    var list = programList();
    var size = pageSize();
    var start = page * size;
    var items = list.slice(start, start + size);

    if (!items.length) {
      var empty = U.create('div', 'emptyGrid', 'No programs yet. Press BLUE to refresh the catalog.');
      elGrid.appendChild(empty);
    }

    for (var i = 0; i < items.length; i++) {
      var node = makeTile(items[i], i);
      elGrid.appendChild(node);
      tiles.push({ node: node, program: items[i] });
    }

    if (!selectedId && items.length) selectedId = items[0].id;
    var found = false;
    for (var j = 0; j < tiles.length; j++) {
      if (tiles[j].program.id === selectedId) { found = true; break; }
    }
    if (!found && items.length) {
      selectedId = items[0].id;
      col = 0;
      row = 0;
    }

    focusTile();
    updateArrows();
    positionCursor();
    refreshStatus();
  }

  function renderWithSlide(direction) {
    if (!elGrid) return;
    var cls = direction < 0 ? 'slide-left' : 'slide-right';
    U.addClass(elGrid, cls);
    window.setTimeout(function () {
      render();
      U.removeClass(elGrid, 'slide-left');
      U.removeClass(elGrid, 'slide-right');
    }, 135);
  }

  function goToPage(target) {
    var total = pageCount();
    if (target < 0) target = total - 1;
    if (target >= total) target = 0;
    if (target === page) return;
    var direction = target > page ? 1 : -1;
    page = target;
    setSelection(row * cols() + col);
    renderWithSlide(direction);
    if (HBC.Audio) HBC.Audio.sfx('move');
  }

  function moveSelection(dx, dy) {
    var total = pageCount();
    if (total <= 1 && dx === 0 && dy === 0) return;
    var c = col + dx;
    var r = row + dy;

    if (dx < 0 && c < 0) {
      if (page > 0) { page--; c = cols() - 1; }
      else { page = total - 1; c = cols() - 1; }
      r = row;
      setSelection(r * cols() + c);
      renderWithSlide(-1);
      if (HBC.Audio) HBC.Audio.sfx('move');
      return;
    }
    if (dx > 0 && c >= cols()) {
      if (page < total - 1) { page++; c = 0; }
      else { page = 0; c = 0; }
      r = row;
      setSelection(r * cols() + c);
      renderWithSlide(1);
      if (HBC.Audio) HBC.Audio.sfx('move');
      return;
    }
    if (dy < 0 && r < 0) {
      if (page > 0) { page--; r = rows() - 1; }
      else { page = total - 1; r = rows() - 1; }
      setSelection(r * cols() + c);
      renderWithSlide(-1);
      if (HBC.Audio) HBC.Audio.sfx('move');
      return;
    }
    if (dy > 0 && r >= rows()) {
      if (page < total - 1) { page++; r = 0; }
      else { page = 0; r = 0; }
      setSelection(r * cols() + c);
      renderWithSlide(1);
      if (HBC.Audio) HBC.Audio.sfx('move');
      return;
    }

    col = c;
    row = r;
    setSelection(row * cols() + col);
    if (HBC.Audio) HBC.Audio.sfx('move');
  }

  /* ── Status line ──────────────────────────────────────────────────────── */

  function refreshStatus() {
    if (!elStatusText) return;
    var list = programList();
    var installed = 0;
    for (var i = 0; i < list.length; i++) if (list[i].installed) installed++;
    var online = HBC.Bridge ? HBC.Bridge.isOnline() : false;
    var net = (typeof navigator === 'undefined') || navigator.onLine !== false;
    var parts = [];
    parts.push('<span class="' + (online ? 'good' : 'warn') + '">' +
      (online ? 'hbc-srv online' : 'hbc-srv offline') + '</span>');
    parts.push('Page ' + (page + 1) + '/' + pageCount() + ' · ' + list.length + ' entries');
    if (installed) parts.push(installed + ' installed');
    parts.push(U.nowTime());
    elStatusText.innerHTML = parts.join('<br>');
    U.toggleClass(elIcoService, 'on', online);
    U.toggleClass(elIcoNet, 'on', net);
  }

  /* ── Overlay plumbing ─────────────────────────────────────────────────── */

  function hideOverlays() {
    U.addClass(elDetail, 'hidden');
    U.addClass(elSettings, 'hidden');
    U.addClass(elCatalog, 'hidden');
    activeOverlay = '';
  }

  function closeOverlay() {
    if (!activeOverlay) return;
    hideOverlays();
    detailProgram = null;
    detailBusy = false;
    if (HBC.Audio) HBC.Audio.sfx('back');
  }

  /* ── Program details ──────────────────────────────────────────────────── */

  function addBadge(text, cls) {
    var b = U.create('div', 'badge' + (cls ? ' ' + cls : ''), text);
    elDetailBadges.appendChild(b);
  }

  function detailButtonList(program) {
    var buttons = [];
    if (program.builtin === 'programs') {
      buttons.push({ label: 'Open', action: 'open-catalog' });
    } else if (program.builtin === 'settings') {
      buttons.push({ label: 'Open', action: 'open-settings' });
    } else if (!program.builtin) {
      if (program.installed) {
        buttons.push({ label: 'Launch', action: 'launch' });
        buttons.push({ label: 'Uninstall', action: 'uninstall' });
      } else {
        buttons.push({ label: detailBusy ? 'Installing…' : 'Install', action: 'install' });
      }
    }
    buttons.push({ label: 'Close', action: 'close' });
    return buttons;
  }

  function renderDetailButtons() {
    if (!elDetailButtons || !detailProgram) return;
    U.clear(elDetailButtons);
    detailButtons = [];
    var defs = detailButtonList(detailProgram);
    for (var i = 0; i < defs.length; i++) {
      (function (def) {
        var node = U.create('div', 'wiiBtn small', def.label);
        if (detailBusy && def.action === 'install') U.addClass(node, 'disabled');
        U.on(node, 'click', function () { runDetailAction(def.action); });
        elDetailButtons.appendChild(node);
        detailButtons.push({ node: node, action: def.action });
      })(defs[i]);
    }
    if (detailIndex >= detailButtons.length) detailIndex = detailButtons.length - 1;
    if (detailIndex < 0) detailIndex = 0;
    for (var j = 0; j < detailButtons.length; j++) {
      U.toggleClass(detailButtons[j].node, 'focus', detailZone === 'buttons' && j === detailIndex);
    }
    updateDetailScroll();
  }

  /* Refresh the scroll bar and the hint line under the buttons. */
  function updateDetailScroll() {
    if (!elDetailReadme) return;
    HBC.Scroll.update(elDetailReadme);
    var scrollable = HBC.Scroll.can(elDetailReadme);
    if (!scrollable && detailZone === 'text') detailZone = 'buttons';
    HBC.Scroll.setFocus(elDetailReadme, scrollable && detailZone === 'text');
    if (!detailHint) return;
    if (!scrollable) detailHint.textContent = '◀ ▶ Buttons · OK select · BACK close';
    else if (detailZone === 'text') detailHint.textContent = '▲ ▼ Scroll text · OK next page · ◀ ▶ or past the end: back to buttons';
    else detailHint.textContent = '◀ ▶ Buttons · OK select · ▲ Scroll the text · CH ▲▼ page · BACK close';
  }

  function setDetailZone(zone) {
    if (zone === 'text' && !HBC.Scroll.can(elDetailReadme)) zone = 'buttons';
    if (zone === detailZone) return;
    detailZone = zone;
    renderDetailButtons();
    if (HBC.Audio) HBC.Audio.sfx('move');
  }

  function openDetail(program) {
    if (!program) return;
    detailProgram = program;
    detailIndex = 0;
    detailBusy = false;
    detailZone = 'buttons';
    activeOverlay = 'detail';
    U.removeClass(elDetail, 'hidden');
    U.addClass(elSettings, 'hidden');
    U.addClass(elCatalog, 'hidden');

    elDetailTitle.textContent = program.name || 'Program';
    elDetailName.textContent = program.name || program.id;
    elDetailAuthor.textContent = (program.author || 'Unknown') +
      (program.version ? '  ·  v' + program.version : '');
    elDetailDesc.textContent = program.description || '';

    U.clear(elDetailBadges);
    if (program.builtin) addBadge('Built in', 'dim');
    if (program.language === 'csharp') addBadge('C#', '');
    else if (program.language) addBadge('Native', '');
    if (program.runtime === 'dotnet') addBadge('.NET', 'dim');
    else if (program.runtime === 'elf') addBadge('ELF', 'dim');
    if (program.terminal) addBadge('Terminal', 'alt');
    if (program.keyboard) addBadge('Keyboard', 'alt');
    if (!program.builtin) addBadge(program.installed ? 'Installed' : 'Not installed',
      program.installed ? 'good' : 'bad');

    elDetailArt.style.backgroundImage = '';
    var icon = HBC.Catalog.iconFor(program);
    if (icon) elDetailArt.style.backgroundImage = 'url("' + icon + '")';

    elDetailReadme.innerHTML = '<div class="readmeLoading">Loading README…</div>';
    elDetailReadme.scrollTop = 0;
    renderDetailButtons();

    var token = ++detailToken;
    HBC.Catalog.readme(program, function (text) {
      if (token !== detailToken || detailProgram !== program) return;
      if (!text) {
        elDetailReadme.innerHTML = '<div class="readmeLoading">No README available.</div>';
        updateDetailScroll();
        return;
      }
      elDetailReadme.innerHTML = U.markdown(text);
      elDetailReadme.scrollTop = 0;
      updateDetailScroll();
    });

    if (HBC.Audio) HBC.Audio.sfx('select');
  }

  function openSelectedDetail() {
    openDetail(selectedProgram());
  }

  function openAbout() {
    var about = HBC.Catalog ? HBC.Catalog.find('about') : null;
    if (about) openDetail(about);
    else HBC.Toast.show('About page unavailable.');
  }

  function runDetailAction(action) {
    var program = detailProgram;
    if (!program) return;
    if (action === 'close') { closeOverlay(); return; }
    if (action === 'open-catalog') { closeOverlay(); openCatalog(); return; }
    if (action === 'open-settings') { closeOverlay(); openSettings(); return; }
    if (action === 'launch') { closeOverlay(); launchProgram(program); return; }
    if (action === 'install') { installProgram(program); return; }
    if (action === 'uninstall') {
      HBC.Dialog.confirm('Uninstall ' + (program.name || program.id),
        'Remove the installed files for this program?', 'Uninstall', 'Cancel', function (yes) {
          if (!yes) return;
          HBC.Catalog.uninstall(program, function (err) {
            if (err) {
              HBC.Toast.show('Uninstall failed: ' + err);
              if (HBC.Audio) HBC.Audio.sfx('error');
              return;
            }
            HBC.Toast.show(program.name + ' uninstalled.');
            render();
            if (detailProgram === program) openDetail(program);
          });
        });
    }
  }

  function installProgram(program) {
    if (detailBusy) return;
    if (!HBC.Bridge || !HBC.Bridge.isOnline()) {
      HBC.Dialog.alert('hbc-srv offline',
        'Installing programs needs the hbc-srv companion service. Open Settings and choose Start hbc-srv now, then try again.',
        function () {});
      return;
    }
    detailBusy = true;
    renderDetailButtons();
    HBC.Toast.show('Installing ' + program.name + '…', 60000);
    HBC.Catalog.install(program, function (err) {
      detailBusy = false;
      if (err) {
        HBC.Toast.show('Install failed: ' + err);
        if (HBC.Audio) HBC.Audio.sfx('error');
        renderDetailButtons();
        return;
      }
      HBC.Toast.show(program.name + ' installed.');
      if (HBC.Audio) HBC.Audio.sfx('select');
      render();
      if (detailProgram === program) openDetail(program);
    });
  }

  function detailRemote(action, ev) {
    var text = elDetailReadme;
    if (action === 'up') {
      if (detailZone === 'buttons') setDetailZone('text');
      else if (!HBC.Scroll.atTop(text)) { HBC.Scroll.line(text, -1); if (HBC.Audio) HBC.Audio.sfx('pop'); }
      return true;
    }
    if (action === 'down') {
      if (detailZone === 'text') {
        if (HBC.Scroll.atBottom(text)) setDetailZone('buttons');
        else { HBC.Scroll.line(text, 1); if (HBC.Audio) HBC.Audio.sfx('pop'); }
      }
      return true;
    }
    if (action === 'left' || action === 'right') {
      if (detailZone === 'text') { setDetailZone('buttons'); return true; }
      var n = detailButtons.length;
      if (!n) return true;
      detailIndex = (detailIndex + (action === 'left' ? n - 1 : 1)) % n;
      renderDetailButtons();
      if (HBC.Audio) HBC.Audio.sfx('move');
      return true;
    }
    if (action === 'enter') {
      if (detailZone === 'text') {
        if (HBC.Scroll.atBottom(text)) setDetailZone('buttons');
        else HBC.Scroll.page(text, 1);
        return true;
      }
      var b = detailButtons[detailIndex];
      if (b) runDetailAction(b.action);
      return true;
    }
    if (action === 'back' || action === 'exit') {
      if (detailZone === 'text') { setDetailZone('buttons'); return true; }
      closeOverlay();
      return true;
    }
    if (action === 'chup') { HBC.Scroll.page(text, -1); return true; }
    if (action === 'chdown') { HBC.Scroll.page(text, 1); return true; }
    if (action === 'green' && detailProgram && !detailProgram.builtin) {
      if (detailProgram.installed) runDetailAction('launch');
      else runDetailAction('install');
      return true;
    }
    if (action === 'red') { closeOverlay(); return true; }
    return true;
  }

  /* ── Settings ─────────────────────────────────────────────────────────── */

  var SETTINGS_DEFS = [
    { key: 'serviceUrl', kind: 'text', label: 'Service URL', hint: 'hbc-srv address, default http://127.0.0.1:2325' },
    { key: 'catalogUrl', kind: 'text', label: 'Catalog URL', hint: 'Programs JSON manifest used by Refresh Catalog' },
    { key: 'music', kind: 'toggle', label: 'Music', hint: 'Intro and background music' },
    { key: 'autoStart', kind: 'toggle', label: 'Start hbc-srv automatically', hint: 'Launch the companion service when the intro logo appears' },
    { key: 'srvDir', kind: 'text', label: 'hbc-srv folder', hint: 'Used only if the copy bundled in the app is not found' },
    { key: 'sfx', kind: 'toggle', label: 'Sound effects', hint: 'Cursor, select and launch sounds' },
    { key: 'view', kind: 'choice', label: 'Channel view', hint: 'Grid tiles or list rows', values: ['grid', 'list'], names: ['Grid', 'List'] },
    { key: 'fx', kind: 'choice', label: 'Effects', hint: 'Auto lowers animation detail if the TV struggles', values: ['auto', 'full', 'low'], names: ['Auto', 'Full', 'Low'] },
    { key: 'avOffset', kind: 'choice', label: 'Intro A/V sync', hint: 'Delay the intro flashes if they come before the beat', values: [0, 50, 100, 150, 200, 250, 300, 400], format: 'ms' },
    { action: 'startsrv', label: 'Start hbc-srv now', hint: 'Start the companion service through the TV shell' },
    { action: 'check', label: 'Check service', hint: 'Ping hbc-srv and show its status' },
    { action: 'refresh', label: 'Refresh catalog', hint: 'Download the latest programs manifest' },
    { action: 'about', label: 'About this channel', hint: 'Version, controls, fonts and licenses' },
    { action: 'reset', label: 'Reset settings', hint: 'Restore the default URLs and options' }
  ];

  function settingValue(def) {
    if (def.action) {
      if (def.action === 'about') return 'Open';
      return 'Run';
    }
    var value = HBC.Settings ? HBC.Settings[def.key] : '';
    if (def.kind === 'toggle') return value === false ? 'Off' : 'On';
    if (def.kind === 'choice') {
      var vals = def.values || [];
      for (var k = 0; k < vals.length; k++) {
        if (vals[k] === value) return def.names ? def.names[k] : (value + (def.format ? ' ' + def.format : ''));
      }
      return String(value);
    }
    return value || '';
  }

  function settingValueClass(def) {
    if (def.action) return 'action';
    if (def.kind === 'toggle') return HBC.Settings && HBC.Settings[def.key] === false ? 'off' : 'on';
    return '';
  }

  function renderSettings() {
    if (!elSettingsList) return;
    U.clear(elSettingsList);
    settingsRows = [];
    for (var i = 0; i < SETTINGS_DEFS.length; i++) {
      (function (def, index) {
        var node = U.create('div', 'settingRow');
        var meta = U.create('div', 'settingMeta');
        meta.appendChild(U.create('div', 'settingLabel', def.label));
        meta.appendChild(U.create('div', 'settingHint', def.hint || ''));
        node.appendChild(meta);
        var value = U.create('div', 'settingValue' + (settingValueClass(def) ? ' ' + settingValueClass(def) : ''),
          settingValue(def));
        node.appendChild(value);
        U.on(node, 'click', function () {
          settingsIndex = index;
          renderSettingsFocus();
          activateSetting();
        });
        elSettingsList.appendChild(node);
        settingsRows.push({ node: node, def: def, value: value });
      })(SETTINGS_DEFS[i], i);
    }
    if (settingsIndex >= settingsRows.length) settingsIndex = settingsRows.length - 1;
    if (settingsIndex < 0) settingsIndex = 0;
    renderSettingsFocus();
  }

  function renderSettingsFocus() {
    for (var i = 0; i < settingsRows.length; i++) {
      U.toggleClass(settingsRows[i].node, 'focus', i === settingsIndex);
    }
    var rowNode = settingsRows[settingsIndex] && settingsRows[settingsIndex].node;
    if (rowNode && rowNode.scrollIntoView) {
      try { rowNode.scrollIntoView(false); } catch (e) {}
    }
    HBC.Scroll.update(elSettingsList);
  }

  function saveSettings() {
    if (HBC.App && HBC.App.saveSettings) HBC.App.saveSettings();
  }

  function changeSetting(dir) {
    var item = settingsRows[settingsIndex];
    if (!item) return;
    var def = item.def;
    if (def.kind === 'toggle') {
      HBC.Settings[def.key] = HBC.Settings[def.key] === false;
      saveSettings();
      renderSettings();
      if (HBC.Audio) HBC.Audio.sfx('move');
      return;
    }
    if (def.kind === 'choice') {
      var values = def.values || [];
      var at = 0;
      for (var i = 0; i < values.length; i++) if (values[i] === HBC.Settings[def.key]) at = i;
      at = (at + (dir < 0 ? values.length - 1 : 1)) % values.length;
      HBC.Settings[def.key] = values[at];
      saveSettings();
      if (def.key === 'view') setView(values[at]);
      if (def.key === 'fx' && HBC.Fx) HBC.Fx.setMode(values[at]);
      renderSettings();
      if (HBC.Audio) HBC.Audio.sfx('move');
    }
  }

  function editTextSetting(def) {
    HBC.Keyboard.open({
      mode: 'text',
      title: def.label,
      value: HBC.Settings[def.key] || '',
      onSubmit: function (text) {
        HBC.Settings[def.key] = U.trim(text);
        saveSettings();
        renderSettings();
        HBC.Toast.show(def.label + ' saved.');
      }
    });
  }

  function activateSetting() {
    var item = settingsRows[settingsIndex];
    if (!item) return;
    var def = item.def;
    if (def.kind === 'text') { editTextSetting(def); return; }
    if (def.kind === 'toggle' || def.kind === 'choice') { changeSetting(1); return; }
    if (def.action === 'startsrv') {
      HBC.Toast.show('Starting hbc-srv…', 20000);
      HBC.Launcher.ensure(false, function () { refreshStatus(); });
      return;
    }
    if (def.action === 'check') {
      HBC.Toast.show('Checking hbc-srv…');
      HBC.Bridge.status(function (err, data) {
        if (err) {
          HBC.Toast.show('hbc-srv is offline at ' + HBC.Bridge.base());
          if (HBC.Audio) HBC.Audio.sfx('error');
        } else {
          HBC.Toast.show('hbc-srv online · ' + ((data && data.version) || 'unknown version'));
          if (HBC.Audio) HBC.Audio.sfx('select');
        }
        refreshStatus();
      });
      return;
    }
    if (def.action === 'refresh') { closeOverlay(); if (HBC.App) HBC.App.refreshCatalog(); return; }
    if (def.action === 'about') { closeOverlay(); openAbout(); return; }
    if (def.action === 'reset') {
      HBC.Dialog.confirm('Reset settings', 'Restore all settings to their defaults?', 'Reset', 'Cancel', function (yes) {
        if (!yes) return;
        if (HBC.App && HBC.App.resetSettings) HBC.App.resetSettings();
        renderSettings();
        setView(HBC.Settings.view);
        HBC.Toast.show('Settings reset.');
      });
    }
  }

  function openSettings() {
    activeOverlay = 'settings';
    settingsIndex = 0;
    U.removeClass(elSettings, 'hidden');
    U.addClass(elDetail, 'hidden');
    U.addClass(elCatalog, 'hidden');
    renderSettings();
    if (HBC.Audio) HBC.Audio.sfx('select');
  }

  function settingsRemote(action) {
    if (action === 'up') {
      settingsIndex = (settingsIndex + settingsRows.length - 1) % settingsRows.length;
      renderSettingsFocus();
      if (HBC.Audio) HBC.Audio.sfx('move');
      return true;
    }
    if (action === 'down') {
      settingsIndex = (settingsIndex + 1) % settingsRows.length;
      renderSettingsFocus();
      if (HBC.Audio) HBC.Audio.sfx('move');
      return true;
    }
    if (action === 'left') { changeSetting(-1); return true; }
    if (action === 'right') { changeSetting(1); return true; }
    if (action === 'enter') { activateSetting(); return true; }
    if (action === 'back' || action === 'exit') { closeOverlay(); return true; }
    if (action === 'chup') { HBC.Scroll.page(elSettingsList, -1); return true; }
    if (action === 'chdown') { HBC.Scroll.page(elSettingsList, 1); return true; }
    return true;
  }

  /* ── Catalog overlay ──────────────────────────────────────────────────── */

  function catalogPrograms() {
    var list = programList();
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (!list[i].builtin) out.push(list[i]);
    }
    return out;
  }

  function renderCatalog() {
    if (!elCatalogList) return;
    U.clear(elCatalogList);
    catalogRows = [];
    var list = catalogPrograms();
    if (!list.length) {
      elCatalogList.appendChild(U.create('div', 'emptyGrid', 'No programs in the catalog. Use Refresh Catalog in Settings.'));
      return;
    }
    for (var i = 0; i < list.length; i++) {
      (function (program, index) {
        var node = U.create('div', 'catRow');
        var art = U.create('div', 'catArt');
        node.appendChild(art);
        applyArt(art, program);

        var meta = U.create('div', 'catMeta');
        meta.appendChild(U.create('div', 'catName', program.name || program.id));
        meta.appendChild(U.create('div', 'catDesc', program.description || tileSubtitle(program)));
        node.appendChild(meta);

        var state = U.create('div', 'catState' + (program.installed ? '' : ' no'),
          program.installed ? 'Installed' : 'Available');
        node.appendChild(state);

        U.on(node, 'click', function () {
          catalogIndex = index;
          renderCatalogFocus();
          openDetail(program);
        });
        elCatalogList.appendChild(node);
        catalogRows.push({ node: node, program: program });
      })(list[i], i);
    }
    if (catalogIndex >= catalogRows.length) catalogIndex = catalogRows.length - 1;
    if (catalogIndex < 0) catalogIndex = 0;
    renderCatalogFocus();
  }

  function renderCatalogFocus() {
    for (var i = 0; i < catalogRows.length; i++) {
      U.toggleClass(catalogRows[i].node, 'focus', i === catalogIndex);
    }
    var rowNode = catalogRows[catalogIndex] && catalogRows[catalogIndex].node;
    if (rowNode && rowNode.scrollIntoView) {
      try { rowNode.scrollIntoView(false); } catch (e) {}
    }
    HBC.Scroll.update(elCatalogList);
  }

  function openCatalog() {
    activeOverlay = 'catalog';
    catalogIndex = 0;
    U.removeClass(elCatalog, 'hidden');
    U.addClass(elDetail, 'hidden');
    U.addClass(elSettings, 'hidden');
    renderCatalog();
    if (HBC.Audio) HBC.Audio.sfx('select');
  }

  function catalogRemote(action) {
    if (!catalogRows.length) {
      if (action === 'back' || action === 'exit') closeOverlay();
      return true;
    }
    if (action === 'up') {
      catalogIndex = (catalogIndex + catalogRows.length - 1) % catalogRows.length;
      renderCatalogFocus();
      if (HBC.Audio) HBC.Audio.sfx('move');
      return true;
    }
    if (action === 'down') {
      catalogIndex = (catalogIndex + 1) % catalogRows.length;
      renderCatalogFocus();
      if (HBC.Audio) HBC.Audio.sfx('move');
      return true;
    }
    if (action === 'enter') {
      var item = catalogRows[catalogIndex];
      if (item) openDetail(item.program);
      return true;
    }
    if (action === 'back' || action === 'exit') { closeOverlay(); return true; }
    if (action === 'chup') { HBC.Scroll.page(elCatalogList, -1); return true; }
    if (action === 'chdown') { HBC.Scroll.page(elCatalogList, 1); return true; }
    if (action === 'green') {
      var row = catalogRows[catalogIndex];
      if (row) {
        if (row.program.installed) launchProgram(row.program);
        else openDetail(row.program);
      }
      return true;
    }
    return true;
  }

  /* ── Program launch ───────────────────────────────────────────────────── */

  function launchProgram(program) {
    if (!program) return;
    if (program.builtin === 'programs') { openCatalog(); return; }
    if (program.builtin === 'settings') { openSettings(); return; }
    if (program.builtin) { openDetail(program); return; }

    if (!program.installed) { openDetail(program); return; }

    if (HBC.Terminal.isHidden() && HBC.Terminal.hasSession()) {
      HBC.Terminal.show();
      return;
    }

    if (program.terminal === false) {
      if (!HBC.Bridge.isOnline()) {
        HBC.Dialog.alert('hbc-srv offline',
          'Starting programs needs the hbc-srv companion service. Open Settings and choose Start hbc-srv now, then try again.',
          function () {});
        return;
      }
      HBC.Toast.show('Starting ' + program.name + '…');
      HBC.Bridge.run(program, 80, 24, function (err, data) {
        if (err) {
          HBC.Toast.show('Launch failed: ' + err);
          if (HBC.Audio) HBC.Audio.sfx('error');
          return;
        }
        HBC.Toast.show(program.name + ' started.');
      });
      return;
    }

    HBC.Terminal.open(program);
  }

  function activate() {
    var program = selectedProgram();
    if (!program) return;
    if (HBC.Terminal.isHidden() && HBC.Terminal.hasSession()) {
      HBC.Terminal.show();
      return;
    }
    if (HBC.Audio) HBC.Audio.sfx('select');
    launchProgram(program);
  }

  function setView(next) {
    var value = next === 'list' ? 'list' : 'grid';
    if (value === view) return;
    view = value;
    if (HBC.Settings) HBC.Settings.view = value;
    if (elGrid) U.toggleClass(elGrid, 'listMode', view === 'list');
    var keep = selectedId;
    page = 0;
    clampPage();
    if (keep) selectProgram(HBC.Catalog.find(keep));
    render();
  }

  /* ── Remote routing for the channel and its overlays ──────────────────── */

  function handleRemote(action, ev) {
    if (activeOverlay === 'detail') return detailRemote(action, ev);
    if (activeOverlay === 'settings') return settingsRemote(action, ev);
    if (activeOverlay === 'catalog') return catalogRemote(action, ev);

    if (!entered) return false;

    if (action === 'left') { moveSelection(-1, 0); return true; }
    if (action === 'right') { moveSelection(1, 0); return true; }
    if (action === 'up') { moveSelection(0, -1); return true; }
    if (action === 'down') { moveSelection(0, 1); return true; }
    if (action === 'enter') { activate(); return true; }
    if (action === 'back' || action === 'exit') {
      HBC.Menu.open();
      return true;
    }
    if (action === 'menu' || action === 'info') {
      HBC.Menu.open();
      return true;
    }
    if (action === 'red') { openSelectedDetail(); return true; }
    if (action === 'green') { activate(); return true; }
    if (action === 'yellow' || action === 'playpause') {
      setView(view === 'grid' ? 'list' : 'grid');
      if (HBC.App && HBC.App.saveSettings) HBC.App.saveSettings();
      HBC.Toast.show(view === 'grid' ? 'Grid view' : 'List view');
      return true;
    }
    if (action === 'blue') { if (HBC.App) HBC.App.refreshCatalog(); return true; }
    if (action === 'chup') { goToPage(page - 1); return true; }
    if (action === 'chdown') { goToPage(page + 1); return true; }
    if (action === 'digit' && ev && ev.key) {
      var n = parseInt(ev.key, 10);
      if (n >= 1 && n <= 9) {
        var target = n - 1;
        if (target < pageCount()) {
          page = target;
          setSelection(0);
          renderWithSlide(1);
        }
      }
      return true;
    }
    return false;
  }

  /* ── Bubbles ──────────────────────────────────────────────────────────────
     Drawn on a half-resolution canvas, without rotation, and only while the
     channel grid itself is what the person is looking at: no overlay, no
     terminal, no intro. The effects level (HBC.Fx) trims the count further. */

  var canvas = U.$('bubbles');
  var bctx = null;
  var bubbleImgs = [];
  var bubbles = [];
  var lastFrame = 0;
  var lastRaf = 0;
  var spawnAcc = 0;
  var cleared = true;
  var SCALE = 0.5;

  function loadBubbles() {
    for (var i = 1; i <= 3; i++) {
      (function (idx) {
        var img = new Image();
        img.onload = function () { bubbleImgs[idx - 1] = img; };
        img.src = 'res/img/bubble' + idx + '.png';
      })(i);
    }
  }

  function resizeBubbles() {
    if (!canvas) return;
    canvas.width = Math.round(window.innerWidth * SCALE);
    canvas.height = Math.round(window.innerHeight * SCALE);
    bctx = canvas.getContext ? canvas.getContext('2d') : null;
    cleared = false;
  }

  function maxBubbles() {
    var level = HBC.Fx ? HBC.Fx.level() : 2;
    return level >= 2 ? 22 : (level === 1 ? 10 : 0);
  }

  function spawnBubble() {
    if (!bubbleImgs.length || !canvas) return;
    var img = bubbleImgs[Math.floor(Math.random() * bubbleImgs.length)];
    if (!img) return;
    var h = canvas.height;
    var size = h * (0.035 + Math.random() * 0.075);
    bubbles.push({
      img: img,
      x: Math.random() * canvas.width,
      y: h + size,
      size: size,
      vy: -(h * (0.012 + Math.random() * 0.022)),
      drift: (Math.random() - 0.5) * 0.35,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.16 + Math.random() * 0.32
    });
  }

  function bubblesVisible() {
    if (!entered || activeOverlay) return false;
    if (HBC.Terminal && HBC.Terminal.isOpen()) return false;
    if (HBC.Menu && HBC.Menu.isOpen()) return false;
    return true;
  }

  function bubbleFrame(time) {
    window.requestAnimationFrame(bubbleFrame);
    if (!bctx || !canvas) return;
    var raw = lastRaf ? time - lastRaf : 0;
    lastRaf = time;

    if (!bubblesVisible()) {
      if (!cleared) { bctx.clearRect(0, 0, canvas.width, canvas.height); cleared = true; }
      return;
    }
    cleared = false;
    if (HBC.Fx && raw > 0) HBC.Fx.report(raw);

    var cap = maxBubbles();
    if (!cap) {
      if (bubbles.length) { bubbles.length = 0; bctx.clearRect(0, 0, canvas.width, canvas.height); }
      return;
    }
    if (time - lastFrame < 42) return;     /* ~24 fps is plenty for slow bubbles */
    var dt = Math.min(0.1, (time - lastFrame) / 1000) || 0.042;
    lastFrame = time;
    spawnAcc += dt;
    if (spawnAcc > 0.9 && bubbles.length < cap) { spawnAcc = 0; spawnBubble(); }

    bctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i];
      b.y += b.vy * dt;
      b.phase += dt * 0.7;
      b.x += Math.sin(b.phase) * b.drift * 15 * dt;
      if (b.y < -b.size * 1.5) { bubbles.splice(i, 1); continue; }
      bctx.globalAlpha = b.alpha;
      bctx.drawImage(b.img, b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
    }
    bctx.globalAlpha = 1;
  }

  /* ── Init ─────────────────────────────────────────────────────────────── */

  function init() {
    view = (HBC.Settings && HBC.Settings.view === 'list') ? 'list' : 'grid';
    if (elGrid) U.toggleClass(elGrid, 'listMode', view === 'list');
    U.on(window, 'resize', function () {
      resizeBubbles();
      positionCursor();
    });
    U.on(window, 'online', refreshStatus);
    U.on(window, 'offline', refreshStatus);
    loadBubbles();
    resizeBubbles();
    if (window.requestAnimationFrame) window.requestAnimationFrame(bubbleFrame);
    render();
  }

  function enter() {
    entered = true;
    if (elMain) U.removeClass(elMain, 'hidden');
    render();
    window.setTimeout(function () {
      positionCursor();
    }, 120);
  }

  HBC.Main = {
    init: init,
    enter: enter,
    render: render,
    refreshStatus: refreshStatus,
    openSelectedDetail: openSelectedDetail,
    openAbout: openAbout,
    openDetail: openDetail,
    openCatalog: openCatalog,
    openSettings: openSettings,
    closeOverlay: closeOverlay,
    setView: setView,
    handleRemote: handleRemote,
    isOverlayOpen: function () { return !!activeOverlay; },
    overlay: function () { return activeOverlay; },
    selected: selectedProgram,
    view: function () { return view; }
  };

  HBC.CatalogUI = {
    open: openCatalog,
    close: closeOverlay,
    isOpen: function () { return activeOverlay === 'catalog'; }
  };

  HBC.SettingsUI = {
    open: openSettings,
    close: closeOverlay,
    isOpen: function () { return activeOverlay === 'settings'; }
  };
})(window, document);
