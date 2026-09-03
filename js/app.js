/* ==========================================================================
   app.js - page router / view manager + shared UI helpers.
   The only globals live under window.APP.
   ========================================================================== */
(function () {
  'use strict';

  window.APP = window.APP || {};
  window.APP.pages = window.APP.pages || {};

  /* ================= UI helpers ================= */

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* Safe rich text: escape everything, then allow **bold**, `code`,
     and line breaks. Content is authored by us in JSON files. */
  function rich(s) {
    var h = esc(s);
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/\n/g, '<br>');
    return h;
  }

  function toast(msg, kind) {
    var root = document.getElementById('toastRoot');
    if (!root) return;
    var t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    root.appendChild(t);
    window.setTimeout(function () { t.remove(); }, 3200);
  }

  function confirmModal(title, body, onYes) {
    var root = document.getElementById('modalRoot');
    root.innerHTML = '<div class="modal-backdrop" id="mbk">'
      + '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">'
      + '<h2>' + esc(title) + '</h2>'
      + '<p>' + esc(body) + '</p>'
      + '<div class="modal-actions">'
      + '<button class="btn ghost" id="mNo">Cancel</button>'
      + '<button class="btn danger" id="mYes">Confirm</button>'
      + '</div></div></div>';
    var close = function () { root.innerHTML = ''; };
    root.querySelector('#mNo').addEventListener('click', close);
    root.querySelector('#mbk').addEventListener('click', function (e) {
      if (e.target.id === 'mbk') close();
    });
    root.querySelector('#mYes').addEventListener('click', function () {
      close();
      if (onYes) onYes();
    });
    root.querySelector('#mYes').focus();
  }

  function dateStr(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  window.APP.ui = {
    esc: esc,
    escAttr: esc,
    rich: rich,
    toast: toast,
    confirmModal: confirmModal,
    dateStr: dateStr
  };

  /* ================= router ================= */

  var view = null;

  function parseHash() {
    var h = window.location.hash || '#/dashboard';
    if (h === '#' || h === '#/') h = '#/dashboard';
    var parts = h.replace(/^#\//, '').split('/').map(decodeURIComponent);
    return parts;
  }

  function setNav(active) {
    document.querySelectorAll('.app-nav a').forEach(function (a) {
      var key = a.getAttribute('data-nav');
      a.classList.toggle('active', key === active);
    });
  }

  function route() {
    var parts = parseHash();
    var p0 = parts[0] || 'dashboard';
    var pages = window.APP.pages;

    window.APP.audio.stop();
    var nav = document.getElementById('appNav');
    if (nav) nav.classList.remove('open');
    window.scrollTo(0, 0);

    try {
      if (p0 === 'dashboard' || p0 === '') {
        setNav('dashboard');
        pages.dashboard.render(view);
      } else if (p0 === 'knowledge') {
        setNav('knowledge');
        if (parts[1] === 'summary') pages.knowledge.renderSummary(view, parts[2] || 0);
        else if (parts[1]) pages.knowledge.renderUnit(view, parts[1]);
        else pages.knowledge.renderList(view);
      } else if (p0 === 'practice') {
        setNav('practice');
        if (!parts[1]) pages.practice.renderLanding(view);
        else if (parts[1] === 'writing' && parts[2] !== undefined) pages.practice.renderWritingTask(view, parts[2]);
        else pages.practice.renderSkill(view, parts[1]);
      } else if (p0 === 'mocks') {
        setNav('mocks');
        pages.mockexam.renderList(view);
      } else if (p0 === 'mock') {
        setNav('mocks');
        if (parts[2]) pages.mockexam.renderSection(view, parts[1], parts[2]);
        else pages.mockexam.renderMock(view, parts[1]);
      } else if (p0 === 'review') {
        setNav('review');
        if (parts[1] === 'session') pages.review.renderSession(view, parts[2] || 'due');
        else if (parts[1] === 'browse') pages.review.renderBrowse(view);
        else if (parts[1] === 'mistakes') pages.review.renderMistakes(view);
        else pages.review.renderOverview(view);
      } else if (p0 === 'stats') {
        setNav('stats');
        pages.stats.render(view);
      } else {
        setNav('');
        view.innerHTML = '<div class="empty-state">Page not found: ' + esc(window.location.hash) + '<br><br><a class="btn" href="#/dashboard">Go to Dashboard</a></div>';
      }
    } catch (err) {
      console.error('[app] route error', err);
      view.innerHTML = '<div class="empty-state">Something went wrong rendering this page.<br><code>'
        + esc(err.message) + '</code><br><br><a class="btn" href="#/dashboard">Go to Dashboard</a></div>';
    }
  }

  /* ================= boot ================= */

  function detectTouch() {
    var touch = window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches;
    document.documentElement.classList.toggle('touch', touch);
  }

  function studyTicker() {
    window.setInterval(function () {
      if (document.visibilityState === 'visible') {
        window.APP.storage.touchStudy(60);
      }
    }, 60000);
  }

  function boot() {
    view = document.getElementById('view');
    detectTouch();
    window.addEventListener('hashchange', route);
    try {
      window.matchMedia('(hover: none), (pointer: coarse)').addEventListener('change', detectTouch);
    } catch (e) { /* older browsers: ignore */ }

    var navToggle = document.getElementById('navToggle');
    if (navToggle) {
      navToggle.addEventListener('click', function () {
        var nav = document.getElementById('appNav');
        var open = nav.classList.toggle('open');
        navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    window.APP.data.init().then(function (manifest) {
      var fv = document.getElementById('footerVersion');
      if (fv && manifest && manifest.version) fv.textContent = 'PET Trainer · content v' + manifest.version;
      route();
    }).catch(function (err) {
      view.innerHTML = '<div class="empty-state">'
        + '<h2>Could not load the content index</h2>'
        + '<p>' + esc(err.message) + '</p>'
        + '<p class="small">If you opened this page directly from disk (file://), make sure the mirrored .js data files exist '
        + '(run <code>node tools/build-mirrors.js</code>). If serving over HTTP, check that <code>data/manifest.json</code> exists.</p>'
        + '</div>';
    });

    studyTicker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
