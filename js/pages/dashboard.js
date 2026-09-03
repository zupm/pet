/* ==========================================================================
   pages/dashboard.js - home screen: progress overview, continue,
   quick links, streak & study time, settings.
   ========================================================================== */
(function () {
  'use strict';

  var ui, data, storage;

  function deps() {
    ui = window.APP.ui;
    data = window.APP.data;
    storage = window.APP.storage;
  }

  function fmtMinutes(sec) {
    var m = Math.round((sec || 0) / 60);
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  }

  function totalStudySeconds(p) {
    var t = 0;
    Object.keys(p.studySecondsByDay || {}).forEach(function (d) { t += p.studySecondsByDay[d]; });
    return t;
  }

  function render(el) {
    deps();
    var p = storage.getProgress();
    var version = data.version();
    var mistakes = storage.getMistakes();
    var mistakeCount = Object.keys(mistakes).length;

    var srs = storage.getSrs();
    var now = Date.now();
    var due = 0;
    Object.keys(srs).forEach(function (k) {
      if (srs[k].due <= now) due++;
    });

    var last = p.lastActivity;
    var streak = p.streak || { days: 0 };

    var html = '';
    html += '<h1 class="page-title">Dashboard</h1>';
    html += '<p class="page-sub">Cambridge B1 Preliminary (PET) preparation — Reading, Writing, Listening & Speaking. '
         + '<span class="chip primary">Content v' + ui.esc(version) + '</span></p>';

    if (last && last.title) {
      html += '<div class="card" style="margin-bottom:16px">'
           + '<div class="row-wrap"><div><div class="small muted">Continue where you left off</div>'
           + '<strong>' + ui.esc(last.title) + '</strong></div>'
           + '<div class="spacer"></div>'
           + '<a class="btn" href="' + ui.esc(last.route || '#/dashboard') + '">Continue</a></div></div>';
    }

    html += '<div class="grid grid-4" style="margin-bottom:16px">';
    html += tile(String(streak.days || 0), 'day streak');
    html += tile(fmtMinutes(totalStudySeconds(p)), 'study time');
    html += tile(String(due), 'cards due for review');
    html += tile(String(mistakeCount), 'mistakes to fix');
    html += '</div>';

    html += '<h2 class="section-title">Your skills</h2>';
    html += '<div class="grid grid-2">';
    html += skillCard('reading', '📖 Reading', '6 parts · 32 questions · 45 min', p);
    html += skillCard('writing', '✍️ Writing', 'Email + article/story · 45 min', p);
    html += skillCard('listening', '🎧 Listening', '4 parts · 25 questions · ~30 min', p);
    html += skillCard('speaking', '🗣️ Speaking', '4 parts · 10–12 min', p);
    html += '</div>';

    html += '<h2 class="section-title">Jump in</h2>';
    html += '<div class="grid grid-cards">'
         + quickLink('#/knowledge', '📚 Knowledge', 'Grammar, vocabulary, phrases & patterns')
         + quickLink('#/practice', '🎯 Practice', 'Per-skill drills with instant feedback')
         + quickLink('#/mocks', '📝 Mock Exams', 'Full timed papers with scoring')
         + quickLink('#/review', '🔁 Review', 'Flashcards & your mistake notebook')
         + '</div>';

    html += '<h2 class="section-title">Settings</h2>';
    html += '<div class="card"><div class="row-wrap">'
         + '<label class="row" style="gap:8px"><input type="checkbox" id="setShowZh"> Show Chinese hints (中文提示)</label>'
         + '<div class="spacer"></div>'
         + '<button class="btn danger small" id="btnReset">Reset all progress</button>'
         + '</div></div>';

    el.innerHTML = html;

    var zh = el.querySelector('#setShowZh');
    var s = storage.getSettings();
    zh.checked = s.showZh !== false;
    zh.addEventListener('change', function () {
      s.showZh = zh.checked;
      storage.setSettings(s);
    });

    el.querySelector('#btnReset').addEventListener('click', function () {
      ui.confirmModal('Reset all progress?', 'This deletes every score, flashcard schedule and mistake record. Content files are not affected.', function () {
        storage.resetAll();
        ui.toast('All progress has been reset.', 'success');
        render(el);
      });
    });
  }

  function tile(value, label) {
    return '<div class="card stat-tile"><div class="stat-num">' + ui.esc(value) + '</div>'
         + '<div class="stat-label">' + ui.esc(label) + '</div></div>';
  }

  function quickLink(href, title, sub) {
    return '<a class="card clickable" href="' + href + '" style="text-decoration:none;color:inherit">'
         + '<h3>' + title + '</h3><p class="card-sub mb0">' + sub + '</p></a>';
  }

  function resultCount(p, skill) {
    var n = 0;
    (p.practiceResults || []).forEach(function (r) { if (r.skill === skill) n++; });
    (p.mockResults || []).forEach(function (r) { if (r.skill === skill) n++; });
    return n;
  }

  function bestPct(p, skill) {
    var best = null;
    function consider(r) {
      if (r.skill === skill && typeof r.pct === 'number') {
        if (best === null || r.pct > best) best = r.pct;
      }
    }
    (p.practiceResults || []).forEach(consider);
    (p.mockResults || []).forEach(consider);
    return best;
  }

  function skillCard(skill, iconTitle, desc, p) {
    var attempts = resultCount(p, skill);
    var best = bestPct(p, skill);
    var pct = best !== null ? best : (attempts ? 40 : 0);
    pct = Math.max(0, Math.min(100, pct));
    var barClass = pct >= 75 ? 'success' : (pct >= 40 ? 'warning' : '');
    return '<a class="card clickable" href="#/practice/' + skill + '" style="text-decoration:none;color:inherit">'
      + '<div class="card-header"><h3 class="mb0">' + iconTitle + '</h3>'
      + '<span class="chip">' + attempts + ' attempts</span></div>'
      + '<p class="card-sub">' + desc + '</p>'
      + '<div class="progress-label"><span>Best score</span><span>' + pct + '%</span></div>'
      + '<div class="progress ' + barClass + '"><span style="width:' + pct + '%"></span></div>'
      + '</a>';
  }

  window.APP = window.APP || {};
  window.APP.pages = window.APP.pages || {};
  window.APP.pages.dashboard = { render: render };
})();
