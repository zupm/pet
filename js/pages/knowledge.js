/* ==========================================================================
   pages/knowledge.js - renders lessons, vocabulary, phrases, patterns,
   exam guide and summaries directly from JSON knowledge units.
   ========================================================================== */
(function () {
  'use strict';

  var ui, data, storage;

  function deps() {
    ui = window.APP.ui;
    data = window.APP.data;
    storage = window.APP.storage;
  }

  var TYPE_LABELS = {
    grammar: 'Grammar',
    vocab: 'Vocabulary',
    phrases: 'Phrases',
    patterns: 'Patterns',
    guide: 'Exam Guide',
    summary: 'Summary'
  };

  function typeChip(type) {
    var cls = type === 'grammar' ? 'primary'
      : type === 'vocab' ? 'success'
      : type === 'phrases' ? 'accent'
      : type === 'patterns' ? 'warning'
      : '';
    return '<span class="chip ' + cls + '">' + ui.esc(TYPE_LABELS[type] || type) + '</span>';
  }

  /* ---------- list view ---------- */

  function lessonGroupsHtml(groups, p) {
    var html = '';
    ['grammar', 'vocab', 'phrases', 'patterns', 'guide'].forEach(function (t) {
      if (!groups[t]) return;
      html += '<h2 class="section-title">' + TYPE_LABELS[t] + '</h2>';
      html += '<div class="grid grid-cards">';
      groups[t].forEach(function (meta) {
        var done = p.completedUnits && p.completedUnits[meta.id];
        html += '<a class="card clickable" href="#/knowledge/' + ui.esc(meta.id) + '" style="text-decoration:none;color:inherit">'
          + '<div class="card-header"><h3 class="mb0">' + ui.esc(meta.title) + '</h3>' + typeChip(meta.type) + '</div>'
          + (meta.description ? '<p class="card-sub">' + ui.esc(meta.description) + '</p>' : '')
          + '<div class="row-wrap small muted">'
          + (meta.level ? '<span class="chip">Level ' + ui.esc(meta.level) + '</span>' : '')
          + (done ? '<span class="chip success">✓ Studied</span>' : '')
          + '</div></a>';
      });
      html += '</div>';
    });
    return html;
  }

  function renderList(el) {
    deps();
    var entries = data.knowledgeEntries();
    var p = storage.getProgress();

    el.innerHTML = '<h1 class="page-title">Knowledge</h1>'
      + '<p class="page-sub">Everything you need for B1 Preliminary — grammar, vocabulary, phrases, sentence patterns and the exam format. All content loads from JSON data files.</p>'
      + '<div id="knGroups"><div class="loading-state">Loading lessons…</div></div>'
      + '<div id="knSums"></div>';

    var groups = {};
    entries.forEach(function (meta) {
      var t = meta.type || 'other';
      if (!groups[t]) groups[t] = [];
      groups[t].push(meta);
    });

    var box = el.querySelector('#knGroups');
    box.innerHTML = lessonGroupsHtml(groups, p)
      || '<div class="empty-state">No knowledge files registered in data/manifest.json yet.</div>';

    data.loadSummaries().then(function (sums) {
      if (!sums.length) return;
      var html = '<h2 class="section-title">📋 Summaries & Cheat Sheets</h2><div class="grid grid-cards">';
      sums.forEach(function (s, i) {
        html += '<a class="card clickable" href="#/knowledge/summary/' + i + '" style="text-decoration:none;color:inherit">'
          + '<div class="card-header"><h3 class="mb0">' + ui.esc(s.title || 'Summary ' + (i + 1)) + '</h3>' + typeChip('summary') + '</div>'
          + (s.description ? '<p class="card-sub">' + ui.esc(s.description) + '</p>' : '')
          + '</a>';
      });
      html += '</div>';
      el.querySelector('#knSums').innerHTML = html;
    }).catch(function () {
      el.querySelector('#knSums').innerHTML =
        '<div class="empty-state">Summaries unavailable (missing or invalid file).</div>';
    });
  }

  /* ---------- unit detail ---------- */

  function findMeta(id) {
    var found = null;
    data.knowledgeEntries().forEach(function (m) { if (m.id === id) found = m; });
    return found;
  }

  function practiceLinkFor(type) {
    if (type === 'grammar') return '#/practice/reading';
    if (type === 'phrases') return '#/practice/speaking';
    if (type === 'patterns') return '#/practice/writing';
    if (type === 'vocab') return '#/review';
    return '#/practice';
  }

  function renderUnit(el, id) {
    deps();
    var meta = findMeta(id);
    if (!meta) {
      el.innerHTML = '<div class="empty-state">Unknown lesson: ' + ui.esc(id) + '. <a href="#/knowledge">Back to Knowledge</a></div>';
      return;
    }

    el.innerHTML = '<div class="loading-state">Loading "' + ui.esc(meta.title) + '"…</div>';

    data.loadKnowledgeUnit(meta).then(function (unit) {
      paintUnit(el, meta, unit);
      var p = storage.getProgress();
      p.completedUnits = p.completedUnits || {};
      if (!p.completedUnits[unit.id]) {
        p.completedUnits[unit.id] = Date.now();
        storage.setProgress(p);
      }
      storage.touchStudy(2);
    }).catch(function (err) {
      el.innerHTML = '<div class="empty-state">Could not load this lesson (' + ui.esc(err.message) + '). '
        + 'Check that the file exists and is valid JSON.<br><br><a class="btn ghost" href="#/knowledge">Back to Knowledge</a></div>';
    });
  }

  function paintUnit(el, meta, unit) {
    var showZh = storage.getSettings().showZh !== false;
    var html = '';

    html += '<p><a href="#/knowledge" class="small">← All lessons</a></p>';
    html += '<h1 class="page-title">' + ui.esc(unit.title) + '</h1>';
    html += '<p class="page-sub">' + typeChip(unit.type || meta.type);
    if (unit.objective) html += ' &nbsp;' + ui.esc(unit.objective);
    html += '</p>';

    (unit.sections || []).forEach(function (sec) {
      html += '<div class="card" style="margin-bottom:14px"><h3>' + ui.esc(sec.heading || '') + '</h3>';
      if (sec.body) html += '<div class="lesson-body">' + ui.rich(sec.body) + '</div>';
      if (sec.bodyZh && showZh) html += '<div class="lesson-body muted small">' + ui.esc(sec.bodyZh) + '</div>';
      (sec.examples || []).forEach(function (ex) {
        html += '<div class="example-block"><div class="ex-en">' + ui.esc(ex.en) + '</div>';
        if (ex.zh && showZh) html += '<div class="ex-zh">' + ui.esc(ex.zh) + '</div>';
        html += '</div>';
      });
      if (sec.tip) html += '<div class="tip-box">💡 <div>' + ui.rich(sec.tip) + '</div></div>';
      html += '</div>';
    });

    if (Array.isArray(unit.items) && unit.items.length) {
      var isWord = (unit.type === 'vocab');
      html += '<div class="card" style="margin-bottom:14px"><h3>' + (isWord ? 'Words in this unit' : 'Items') + ' (' + unit.items.length + ')</h3>';
      html += '<div class="grid grid-2">';
      unit.items.forEach(function (it) {
        html += '<div class="card" style="box-shadow:none;background:var(--c-surface-2)">';
        html += '<div class="row-wrap"><strong>' + ui.esc(it.word || it.phrase || it.pattern || it.id) + '</strong>';
        if (it.pos) html += '<span class="chip">' + ui.esc(it.pos) + '</span>';
        if (it.phonetic) html += '<span class="muted small">' + ui.esc(it.phonetic) + '</span>';
        html += '<button class="btn ghost small say-btn" data-say="' + ui.escAttr(it.word || it.phrase || it.pattern || '') + '" aria-label="Listen">🔊</button></div>';
        if (it.meaning) html += '<div>' + ui.esc(it.meaning) + '</div>';
        if (it.meaningZh && showZh) html += '<div class="muted small">' + ui.esc(it.meaningZh) + '</div>';
        if (it.example) {
          html += '<div class="example-block"><div class="ex-en">' + ui.esc(it.example) + '</div>'
            + (it.exampleZh && showZh ? '<div class="ex-zh">' + ui.esc(it.exampleZh) + '</div>' : '') + '</div>';
        }
        html += '</div>';
      });
      html += '</div></div>';
    }

    if (Array.isArray(unit.commonErrors) && unit.commonErrors.length) {
      html += '<div class="card" style="margin-bottom:14px"><h3>Common errors</h3>';
      html += '<table class="error-table"><thead><tr><th>Wrong</th><th>Right</th><th>Why</th></tr></thead><tbody>';
      unit.commonErrors.forEach(function (er) {
        html += '<tr><td class="wrong">' + ui.esc(er.wrong) + '</td><td class="right">' + ui.esc(er.right) + '</td><td>' + ui.esc(er.why || '') + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    if (unit.summary) {
      html += '<div class="card" style="margin-bottom:14px;border-color:var(--c-success);"><h3>📌 Lesson summary</h3>';
      if (unit.summary.keyPoints && unit.summary.keyPoints.length) {
        html += '<ul class="keypoint-list">';
        unit.summary.keyPoints.forEach(function (k) { html += '<li>' + ui.rich(k) + '</li>'; });
        html += '</ul>';
      }
      if (unit.summary.mustKnow && unit.summary.mustKnow.length) {
        html += '<div class="row-wrap"><span class="small muted">Must know:</span>';
        unit.summary.mustKnow.forEach(function (m) { html += '<span class="chip success">' + ui.esc(m) + '</span>'; });
        html += '</div>';
      }
      html += '</div>';
    }

    html += '<div class="row-wrap">'
      + '<a class="btn" href="' + practiceLinkFor(unit.type || meta.type) + '">Practice this →</a>'
      + '<a class="btn ghost" href="#/review">Review flashcards</a>'
      + '</div>';

    el.innerHTML = html;

    el.querySelectorAll('.say-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        window.APP.audio.speak(b.getAttribute('data-say'));
      });
    });
  }

  /* ---------- summary detail ---------- */

  function renderSummary(el, idx) {
    deps();
    data.loadSummaries().then(function (sums) {
      var s = sums[Number(idx)];
      if (!s) {
        el.innerHTML = '<div class="empty-state">Summary not found. <a href="#/knowledge">Back</a></div>';
        return;
      }
      var showZh = storage.getSettings().showZh !== false;
      var html = '<p><a href="#/knowledge" class="small">← All lessons</a></p>';
      html += '<h1 class="page-title">' + ui.esc(s.title) + '</h1>';
      if (s.description) html += '<p class="page-sub">' + ui.esc(s.description) + '</p>';

      (s.blocks || []).forEach(function (b) {
        html += '<div class="card" style="margin-bottom:14px">';
        if (b.heading) html += '<h3>' + ui.esc(b.heading) + '</h3>';
        if (b.body) html += '<div class="lesson-body">' + ui.rich(b.body) + '</div>';
        if (b.bodyZh && showZh) html += '<div class="lesson-body muted small">' + ui.esc(b.bodyZh) + '</div>';
        if (Array.isArray(b.items)) {
          html += '<ul class="keypoint-list">';
          b.items.forEach(function (it) { html += '<li>' + ui.rich(it) + '</li>'; });
          html += '</ul>';
        }
        if (b.tip) html += '<div class="tip-box">💡 <div>' + ui.rich(b.tip) + '</div></div>';
        html += '</div>';
      });

      el.innerHTML = html;
    }).catch(function (err) {
      el.innerHTML = '<div class="empty-state">Could not load summaries: ' + ui.esc(err.message) + '</div>';
    });
  }

  window.APP = window.APP || {};
  window.APP.pages = window.APP.pages || {};
  window.APP.pages.knowledge = {
    renderList: renderList,
    renderUnit: renderUnit,
    renderSummary: renderSummary
  };
})();
