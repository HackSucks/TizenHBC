/* Toast, modal dialog and the HBC Home menu. */
(function (window, document) {
  'use strict';

  var HBC = window.HBC = window.HBC || {};
  var U = HBC.Util;

  var toastEl = U.$('toast');
  var toastTimer = null;

  var dialogEl = U.$('dialog');
  var dialogTitle = U.$('dialogTitle');
  var dialogText = U.$('dialogText');
  var dialogButtons = U.$('dialogButtons');
  var dialogIcon = U.$('dialogIcon');
  var dialogActive = false;
  var dialogIndex = 0;
  var dialogItems = [];
  var dialogCb = null;

  var menuEl = U.$('menu');
  var menuList = U.$('menuList');
  var menuFoot = U.$('menuFoot');
  var menuActive = false;
  var menuIndex = 0;
  var menuItems = [];
  var menuTerminal = null;
  var menuCloseCb = null;

  function showToast(text, ms) {
    if (!toastEl) return;
    toastEl.textContent = text;
    U.addClass(toastEl, 'show');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      U.removeClass(toastEl, 'show');
      toastTimer = null;
    }, ms || 2600);
  }

  function clearDialog() {
    U.clear(dialogButtons);
    dialogItems = [];
    dialogActive = false;
    U.addClass(dialogEl, 'hidden');
  }

  function renderDialogFocus() {
    for (var i = 0; i < dialogItems.length; i++) {
      U.toggleClass(dialogItems[i], 'focus', i === dialogIndex);
    }
  }

  function showDialog(title, text, buttons, cb, icon) {
    dialogTitle.textContent = title || '';
    dialogText.textContent = text || '';
    dialogIcon.src = icon || 'res/img/dlg_confirm.png';
    U.clear(dialogButtons);
    dialogItems = [];
    dialogCb = cb || null;
    dialogIndex = 0;
    for (var i = 0; i < buttons.length; i++) {
      (function (idx) {
        var b = buttons[idx];
        var node = U.create('div', 'wiiBtn small' + (b.focus ? ' focus' : ''), b.label);
        node.setAttribute('data-value', b.value);
        U.on(node, 'click', function () {
          var value = b.value;
          clearDialog();
          if (dialogCb) dialogCb(value);
        });
        dialogButtons.appendChild(node);
        dialogItems.push(node);
      })(i);
    }
    dialogActive = true;
    try {
      var a = document.activeElement;
      if (a && a !== document.body && a.blur) a.blur();
    } catch (e) {}
    U.removeClass(dialogEl, 'hidden');
    dialogText.scrollTop = 0;
    HBC.Scroll.update(dialogText);
    renderDialogFocus();
    if (HBC.Audio) HBC.Audio.sfx('select');
  }

  function confirm(title, text, yesLabel, noLabel, cb) {
    showDialog(title, text, [
      { label: yesLabel || 'Yes', value: 'yes', focus: true },
      { label: noLabel || 'No', value: 'no' }
    ], function (value) { if (cb) cb(value === 'yes'); });
  }

  function alert(title, text, cb) {
    showDialog(title, text, [
      { label: 'OK', value: 'ok', focus: true }
    ], function () { if (cb) cb(); });
  }

  function dialogRemote(action) {
    if (!dialogActive) return false;
    if (action === 'left') {
      dialogIndex = (dialogIndex + dialogItems.length - 1) % dialogItems.length;
      renderDialogFocus();
      if (HBC.Audio) HBC.Audio.sfx('move');
      return true;
    }
    if (action === 'right') {
      dialogIndex = (dialogIndex + 1) % dialogItems.length;
      renderDialogFocus();
      if (HBC.Audio) HBC.Audio.sfx('move');
      return true;
    }
    if (action === 'enter') {
      var node = dialogItems[dialogIndex];
      if (!node) return true;
      var value = node.getAttribute('data-value');
      clearDialog();
      if (HBC.Audio) HBC.Audio.sfx('select');
      if (dialogCb) dialogCb(value);
      return true;
    }
    if ((action === 'up' || action === 'down') && HBC.Scroll.can(dialogText)) {
      HBC.Scroll.line(dialogText, action === 'up' ? -1 : 1);
      return true;
    }
    if (action === 'chup' || action === 'chdown') {
      HBC.Scroll.page(dialogText, action === 'chup' ? -1 : 1);
      return true;
    }
    if (action === 'back' || action === 'exit') {
      clearDialog();
      if (HBC.Audio) HBC.Audio.sfx('back');
      if (dialogCb) dialogCb('cancel');
      return true;
    }
    return true;
  }

  /* ── Home menu ───────────────────────────────────────────────────────── */

  function clearMenu() {
    U.clear(menuList);
    menuItems = [];
    menuActive = false;
    menuTerminal = null;
    U.addClass(menuEl, 'hidden');
  }

  function renderMenuFocus() {
    for (var i = 0; i < menuItems.length; i++) {
      U.toggleClass(menuItems[i], 'focus', i === menuIndex);
    }
  }

  function buildMenu(items) {
    U.clear(menuList);
    menuItems = [];
    menuIndex = 0;
    for (var i = 0; i < items.length; i++) {
      (function (idx) {
        var item = items[idx];
        var node = U.create('div', 'menuItem', item.label);
        U.on(node, 'click', function () {
          if (item.action) item.action();
        });
        menuList.appendChild(node);
        menuItems.push(node);
      })(i);
    }
    menuActive = true;
    U.removeClass(menuEl, 'hidden');
    renderMenuFocus();
  }

  function openMain() {
    menuTerminal = null;
    var items = [];

    /* A terminal can be hidden while its program keeps running. Offer the way
       back (and a way to close it) right from the channel menu. */
    if (HBC.Terminal && HBC.Terminal.isHidden()) {
      items.push({ label: 'Return to Terminal', action: function () {
        closeMenu();
        HBC.Terminal.show();
      } });
      items.push({ label: HBC.Terminal.isRunning() ? 'Close Terminal…' : 'Close Terminal', action: function () {
        closeMenu();
        HBC.Terminal.close();
      } });
    }

    items.push(
      { label: 'Resume', action: function () { closeMenu(); } },
      { label: 'Program Info', action: function () { closeMenu(); if (HBC.Main) HBC.Main.openSelectedDetail(); } },
      { label: 'Programs', action: function () { closeMenu(); if (HBC.CatalogUI) HBC.CatalogUI.open(); } },
      { label: 'Settings', action: function () { closeMenu(); if (HBC.SettingsUI) HBC.SettingsUI.open(); } },
      { label: 'Refresh Catalog', action: function () { closeMenu(); if (HBC.App) HBC.App.refreshCatalog(); } },
      { label: 'About', action: function () { closeMenu(); if (HBC.Main) HBC.Main.openAbout(); } },
      { label: 'Exit to TV', action: function () {
        closeMenu();
        confirm('Exit to TV', 'Close the Homebrew Channel and return to the TV?', 'Exit', 'Cancel', function (yes) {
          if (yes && HBC.App) HBC.App.exit();
        });
      } }
    );
    menuFoot.textContent = 'Arrows move · OK select · BACK close';
    buildMenu(items);
    if (HBC.Audio) HBC.Audio.sfx('select');
  }

  function openTerminal(opts) {
    menuTerminal = opts || {};
    opts = opts || {};
    var items = [
      { label: opts.running ? 'Close Terminal…' : 'Close Terminal', action: function () { closeMenu(); if (menuTerminal && menuTerminal.onClose) menuTerminal.onClose(); } },
      { label: 'Return to Channel', action: function () { closeMenu(); if (menuTerminal && menuTerminal.onHide) menuTerminal.onHide(); } },
      { label: 'Resume', action: function () { closeMenu(); if (menuTerminal && menuTerminal.onResume) menuTerminal.onResume(); } },
      { label: opts.keyboard ? 'Hide Keyboard' : 'Show Keyboard', action: function () { closeMenu(); if (menuTerminal && menuTerminal.onKeyboard) menuTerminal.onKeyboard(); } }
    ];
    if (opts.running) {
      items.push({ label: 'Kill Program', action: function () { closeMenu(); if (menuTerminal && menuTerminal.onKill) menuTerminal.onKill(); } });
    }
    menuFoot.textContent = 'Arrows move · OK select · BACK resume';
    buildMenu(items);
    if (HBC.Audio) HBC.Audio.sfx('select');
  }

  function closeMenu() {
    clearMenu();
  }

  function menuRemote(action) {
    if (!menuActive) return false;
    if (action === 'up') {
      menuIndex = (menuIndex + menuItems.length - 1) % menuItems.length;
      renderMenuFocus();
      if (HBC.Audio) HBC.Audio.sfx('move');
      return true;
    }
    if (action === 'down') {
      menuIndex = (menuIndex + 1) % menuItems.length;
      renderMenuFocus();
      if (HBC.Audio) HBC.Audio.sfx('move');
      return true;
    }
    if (action === 'enter') {
      var item = menuItems[menuIndex];
      if (!item) return true;
      if (HBC.Audio) HBC.Audio.sfx('select');
      item.click();
      return true;
    }
    if (action === 'back' || action === 'exit') {
      closeMenu();
      if (HBC.Audio) HBC.Audio.sfx('back');
      if (menuTerminal && menuTerminal.onResume) menuTerminal.onResume();
      return true;
    }
    return true;
  }

  HBC.Toast = { show: showToast };

  HBC.Dialog = {
    confirm: confirm,
    alert: alert,
    show: showDialog,
    handleRemote: dialogRemote,
    isOpen: function () { return dialogActive; }
  };

  HBC.Menu = {
    open: openMain,
    openTerminal: openTerminal,
    close: closeMenu,
    handleRemote: menuRemote,
    isOpen: function () { return menuActive; }
  };
})(window, document);
