/* BuyTrigger CRM — counter for buytrigger.club and buytrigger.club/join/
 *
 * What it does: counts a visit, the three top-bar buttons, the join form
 * (started / sent) and how far people read. Sends each event to crm-ingest.
 * No cookie. No storage. No library. Nothing that identifies a person.
 * The join form keeps working exactly as before: this script never calls
 * preventDefault and never touches the form's action.
 *
 * Install: put this file at /crm-track.js in the Newsroom repo and add
 *   <script src="/crm-track.js" defer></script>
 * before </body> in index.html and join/index.html. Set ENDPOINT below.
 *
 * Optional hooks the page may provide (all fall back gracefully):
 *   data-crm="join|login|substack|checkout_monthly|checkout_yearly" on a link
 *   data-edition-id="…" on any element (the Newsroom edition on screen), or
 *   window.BT_EDITION_ID, or <meta name="bt-edition" content="…">
 *   <input type="checkbox" name="consent"> in the join form
 */
(function () {
  'use strict';
  var ENDPOINT = 'https://brzawmbpwkdundruicca.supabase.co/functions/v1/crm-ingest'; // ← the CRM project's function URL
  if (!window.navigator || !window.document) return;
  if (window.__btCrmLoaded) return;
  window.__btCrmLoaded = true;

  // ---- what we know about this visit --------------------------------------
  var loc = window.location;
  var params = {};
  try {
    var q = new URLSearchParams(loc.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (k) {
      var v = q.get(k); if (v) params[k] = v.slice(0, 80);
    });
  } catch (e) {}

  var page = (loc.pathname || '/').replace(/index\.html$/, '');
  if (page.length > 1 && !/\/$/.test(page) && /\/join$/.test(page)) page += '/';

  var tz = null, lang = null;
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) {}
  try { lang = navigator.language || null; } catch (e) {}

  function device() {
    var w = window.innerWidth || 0;
    var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 1);
    if (w && w < 700) return 'phone';
    if (touch && w < 1100) return 'tablet';
    return 'desktop';
  }

  function editionId() {
    try {
      // The Newsroom's edition picker: a chosen edition's id, or in "today so
      // far" mode the newest edition listed (the front page as of that edition).
      var sel = document.getElementById('edition-select');
      if (sel && sel.options && sel.options.length) {
        if (sel.value && sel.value !== '__day') return String(sel.value).slice(0, 40);
        for (var i = 0; i < sel.options.length; i++) {
          var v = sel.options[i].value;
          if (v && v !== '__day') return String(v).slice(0, 40);
        }
      }
      var el = document.querySelector('[data-edition-id]');
      if (el && el.getAttribute('data-edition-id')) return el.getAttribute('data-edition-id').slice(0, 40);
      if (window.BT_EDITION_ID) return String(window.BT_EDITION_ID).slice(0, 40);
      var m = document.querySelector('meta[name="bt-edition"]');
      if (m && m.content) return m.content.slice(0, 40);
    } catch (e) {}
    return null;
  }

  function base() {
    var b = {
      page: page,
      referrer: document.referrer || '',
      tz: tz, lang: lang,
      device: device(),
      vw: window.innerWidth || null,
      local_hour: new Date().getHours(),
      edition_id: editionId()
    };
    for (var k in params) b[k] = params[k];
    return b;
  }

  // ---- sending ------------------------------------------------------------
  // text/plain so sendBeacon needs no preflight; the function parses JSON.
  function send(payload) {
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        var ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }));
        if (ok) return;
      }
    } catch (e) {}
    try {
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, mode: 'cors',
        headers: { 'content-type': 'text/plain' } }).catch(function () {});
    } catch (e) {}
  }

  function event(name, extra) {
    var p = base(); p.kind = 'event'; p.event = name;
    if (extra) for (var k in extra) p[k] = extra[k];
    send(p);
  }

  // ---- carry the source tags from the front page to the join page ---------
  // Substack/YouTube/… land on "/", then press JOIN → "/join/". Without this
  // the join page would look like it came from the Newsroom. Internal links
  // to /join/ get the same utm_ tags appended, once.
  function carryTags() {
    if (!Object.keys(params).length) return;
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      try {
        var u = new URL(a.getAttribute('href'), loc.href);
        if (u.hostname.replace(/^www\./, '') !== loc.hostname.replace(/^www\./, '')) continue;
        if (!/\/join\/?$/.test(u.pathname)) continue;
        if (u.searchParams.get('utm_source')) continue;
        for (var k in params) u.searchParams.set(k, params[k]);
        a.setAttribute('href', u.toString());
      } catch (e) {}
    }
  }

  // ---- classify a clicked link -------------------------------------------
  function classify(a) {
    var tag = (a.getAttribute('data-crm') || '').toLowerCase();
    if (tag === 'join') return 'click_join';
    if (tag === 'login') return 'click_login';
    if (tag === 'substack') return 'click_substack';
    if (tag === 'free_database') return 'click_free_database';
    if (tag === 'checkout_monthly') return 'click_checkout_monthly';
    if (tag === 'checkout_yearly') return 'click_checkout_yearly';
    var href = (a.getAttribute('href') || '').toLowerCase();
    if (!href) return null;
    if (/\/join\/?(\?|#|$)/.test(href)) return 'click_join';
    if (href.indexOf('dashboard.buytrigger.club/free') !== -1) return 'click_free_database';
    if (href.indexOf('dashboard.buytrigger.club') !== -1) return 'click_login';
    if (href.indexOf('substack.com') !== -1) return 'click_substack';
    if (href.indexOf('mightynetworks.com') !== -1 || href.indexOf('mn.co') !== -1) {
      var t = (a.textContent || '').toLowerCase();
      if (/month/.test(t)) return 'click_checkout_monthly';
      if (/year|annual/.test(t)) return 'click_checkout_yearly';
      return 'click_checkout_yearly';
    }
    return null;
  }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var name = classify(a);
    if (name) event(name);
  }, true);

  // ---- the join form ------------------------------------------------------
  function joinForm() {
    var forms = document.querySelectorAll('form');
    for (var i = 0; i < forms.length; i++) {
      if (forms[i].querySelector('input[type="email"]')) return forms[i];
    }
    return null;
  }

  var form = joinForm();
  if (form) {
    var started = false;
    form.addEventListener('focusin', function () {
      if (started) return; started = true;
      event('form_started');
    });
    form.addEventListener('submit', function () {
      var emailEl = form.querySelector('input[type="email"]');
      var nameEl = form.querySelector('input[name="name"]') || form.querySelector('input[type="text"]:not([name^="_"])');
      var trapEl = form.querySelector('input[name="_gotcha"]');
      var consentEl = form.querySelector('input[type="checkbox"][name*="consent" i]');
      var email = emailEl ? emailEl.value.trim() : '';
      var name = nameEl ? nameEl.value.trim() : '';
      // Mirror the page's own checks: count only what the page will actually send.
      if (trapEl && trapEl.value) return;                               // spam trap filled
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;   // page will refuse it
      var p = base();
      p.kind = 'lead';
      p.email = email;
      p.name = name;
      if (consentEl) p.consent = !!consentEl.checked;
      send(p);            // the lead (the function also records form_submit)
      // The page's own handler sends to Formspree as before; nothing here stops it.
    });
  }

  // ---- time on page and how far they read ---------------------------------
  var t0 = Date.now(), scrollMax = 0, left = false;
  function measureScroll() {
    try {
      var doc = document.documentElement;
      var total = Math.max(doc.scrollHeight, document.body.scrollHeight) - window.innerHeight;
      var pct = total <= 0 ? 100 : Math.min(100, Math.round(((window.scrollY || doc.scrollTop) / total) * 100));
      if (pct > scrollMax) scrollMax = pct;
    } catch (e) {}
  }
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return; ticking = true;
    setTimeout(function () { measureScroll(); ticking = false; }, 250);
  }, { passive: true });

  function leave() {
    if (left) return; left = true;
    measureScroll();
    event('leave', { seconds: Math.round((Date.now() - t0) / 1000), scroll_max: scrollMax });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') leave(); });
  window.addEventListener('pagehide', leave);

  // ---- go -----------------------------------------------------------------
  function start() {
    carryTags();
    measureScroll();
    event('page_view');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
