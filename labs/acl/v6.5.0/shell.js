/* Case Labs page shell (ACL Case Lab): the section menu under the "Case Labs" title, the help card, the arrival from ToolBox
   and the way back to it. No case logic lives here (app.mjs owns the case, the sheet and the model).
   body[data-home] = the ToolBox address ("" hides the way back). One Reduce Motion rule: no animation, same navigation. */
(function () {
  'use strict';
  var root = document.documentElement, body = document.body;
  var home = body.getAttribute('data-home');
  if (home === null) home = '../../';
  var back = document.getElementById('back'), title = document.getElementById('title'), menu = document.getElementById('sitemenu');
  var help = document.getElementById('help'), helpOk = document.getElementById('help-ok');
  function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  // ---- arrival: html.lab-enter was set in <head> when ToolBox handed over (the "Case Labs" wordmark is centred on the same
  // dark stage ToolBox ended on); lab.css plays the rest. Drop the class once it is over (Reduce Motion: at once).
  var entering = root.classList.contains('lab-enter');
  if (entering) {
    // ends with the last arrival animation (the view buttons fading in), however late the first frame comes; 4 s at most
    var arrived = function (e) { if (e && !(e.animationName === 'lab-fade-in' && e.target && e.target.id === 'hud')) return; root.classList.remove('lab-enter'); document.removeEventListener('animationend', arrived); };
    if (reduced()) arrived(); else { document.addEventListener('animationend', arrived); setTimeout(arrived, 4000); }
  }
  // a page restored from the back/forward cache must never keep a half-finished exit
  addEventListener('pageshow', function (e) { if (e.persisted) { root.classList.remove('lab-leaving', 'lab-enter'); leaving = null; } });

  if (!home) { if (back) back.hidden = true; }
  else if (back) back.setAttribute('href', home);

  // ---- leaving for ToolBox: the case is saved on this device (Resume brings it back); the lab drops away first
  var leaving = null;
  function toToolbox(e) {
    if (!home) return;
    if (e) e.preventDefault();
    if (leaving) return; // a second tap must not queue a second history.back()
    closeMenu(true); showHelp(false);
    var sameOrigin = false;
    try { var from = document.referrer && new URL(document.referrer); sameOrigin = !!(from && from.origin === location.origin && !from.pathname.startsWith(location.pathname)); } catch (x) {}
    var go = function () { if (sameOrigin && history.length > 1) history.back(); else location.href = home; };
    if (reduced()) { leaving = true; go(); return; }
    try { sessionStorage.setItem('tbx_from_lab', String(Date.now())); } catch (x) {}
    root.classList.add('lab-leaving');
    leaving = setTimeout(go, 380);
  }
  // leaving through the back/forward cache: drop the pending exit so a later Forward cannot replay it
  addEventListener('pagehide', function () { if (leaving && leaving !== true) clearTimeout(leaving); leaving = null; });
  if (back) back.addEventListener('click', toToolbox);

  // ---- help card: once on a device's first visit (after the arrival), and from the menu
  var helpFrom = null;
  function showHelp(on) {
    if (!help || help.hidden === !on) return;
    if (on) { helpFrom = document.activeElement; help.hidden = false; try { helpOk.focus({ preventScroll: true }); } catch (x) {} return; }
    help.hidden = true; store('acl_lab_help_v1', '1'); // seen only once it was actually shown
    var to = helpFrom && document.contains(helpFrom) && helpFrom !== document.body ? helpFrom : title; helpFrom = null;
    if (to && (help.contains(document.activeElement) || document.activeElement === document.body)) { try { to.focus({ preventScroll: true }); } catch (x) {} }
  }
  if (helpOk) helpOk.addEventListener('click', function () { showHelp(false); });
  document.addEventListener('pointerdown', function (e) { if (help && !help.hidden && !help.contains(e.target) && !e.target.closest('[data-section="help"]')) showHelp(false); }, true);
  if (help && !store('acl_lab_help_v1')) setTimeout(function () { if (!document.hidden && help.hidden && !root.classList.contains('lab-leaving')) showHelp(true); }, entering && !reduced() ? 1500 : 700);

  // ---- section menu under the title
  if (!title || !menu) return;
  if (!home) { var tb = menu.querySelector('[data-section="toolbox"]'); if (tb) tb.hidden = true; }
  function openMenu() {
    menu.hidden = false; title.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(function () { menu.classList.add('open'); });
    var first = menu.querySelector('[role^="menuitem"]:not([hidden])'); if (first) first.focus({ preventScroll: true });
  }
  function closeMenu(now) {
    if (menu.hidden) return;
    title.setAttribute('aria-expanded', 'false'); menu.classList.remove('open');
    if (now || reduced()) menu.hidden = true; else setTimeout(function () { if (!menu.classList.contains('open')) menu.hidden = true; }, 180);
  }
  title.addEventListener('click', function (e) { e.stopPropagation(); if (menu.hidden) openMenu(); else closeMenu(); });
  menu.addEventListener('click', function (e) {
    var item = e.target.closest('[data-section]'); if (!item) return;
    var s = item.getAttribute('data-section');
    if (s === 'toolbox') toToolbox(e);
    else if (s === 'help') { closeMenu(true); showHelp(true); }
    else { closeMenu(); title.focus(); }
  });
  document.addEventListener('pointerdown', function (e) { if (!menu.hidden && !e.target.closest('#sitemenu,#title')) closeMenu(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && help && !help.hidden) { showHelp(false); return; }
    if (menu.hidden) return;
    if (e.key === 'Escape') { closeMenu(); title.focus(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      var items = [].slice.call(menu.querySelectorAll('[role^="menuitem"]:not([hidden])')), i = items.indexOf(document.activeElement);
      if (!items.length) return;
      items[i < 0 ? (e.key === 'ArrowDown' ? 0 : items.length - 1) : (i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); e.preventDefault();
    }
  });
})();
