/* ==========================================================================
   pages/review.js - spaced repetition (SM-2) flashcard system.
   Pool = vocabulary/phrases/patterns from knowledge JSON + mistakes.
   ========================================================================== */
(function () {
  'use strict';

  var ui, data, storage;

  function deps() {
    ui = window.APP.ui;
    data = window.APP.data;
    storage = window.APP.storage;
  }

  var DAY = 86400000;

  /* ---------- pool construction ---------- */

  function buildPool() {
    var entries = data.knowledgeEntries().filter(function (m) {
      return m.type === 'vocab' || m.type === 'phrases' || m.type === 'patterns';
    });
    var cards = [];
    return Promise.all(entries.map(function (meta) {
      return data.loadKnowledgeUnit(meta).catch(function () { return null; });
    })).then(function (units) {
      units.forEach(function (unit, i) {
        if (!unit || !Array.isArray(unit.items)) return;
        var meta = entries[i];
        unit.items.forEach(function (it) {
          if (!it.id) return;
          var kind = meta.type === 'vocab' ? 'word' : (meta.type === 'phrases' ? 'phrase' : 'pattern');
          cards.push({
            id: it.id,
            kind: kind,
            topic: it.topic || unit.topic || meta.topic || unit.id,
            unitId: unit.id,
            front: it.word || it.phrase || it.pattern || it.id,
            phonetic: it.phonetic || null,
            pos: it.pos || null,
            back: it.meaning || '',
            backZh: it.meaningZh || null,
            example: it.example || null,
            exampleZh: it.exampleZh || null
          });
        });
      });
      // mistakes become cards too
      var mistakes = storage.getMistakes();
      Object.keys(mistakes).forEach(function (qid) {
        var m = mistakes[qid];
        cards.push({
          id: 'mistake:' + qid,
          kind: 'mistake',
          topic: m.skill || 'exam',
          unitId: m.source || 'mistakes',
          front: (m.stem || qid) + ' — ?',
          back: 'Correct answer: ' + m.correctAnswer,
          example: m.given ? 'Your answer was: ' + m.given : null
        });
      });
      return cards;
    });
  }

  /* ---------- SM-2 ---------- */

  function srsState(cardId) {
    var srs = storage.getSrs();
    return srs[cardId] || null;
  }

  function cardStatus(state) {
    if (!state) return 'new';
    if (state.reps >= 4) return 'mastered';
    return 'learning';
  }

  /* quality: 1 = Again, 3 = Hard, 4 = Good, 5 = Easy */
  function sm2(cardId, quality) {
    var srs = storage.getSrs();
    var s = srs[cardId] || { ef: 2.5, reps: 0, interval: 0, due: Date.now() };
    if (quality < 3) {
      s.reps = 0;
      s.interval = 0;
      s.due = Date.now() + 10 * 60000; // 10 minutes
    } else {
      s.reps += 1;
      if (s.reps === 1) s.interval = 1;
      else if (s.reps === 2) s.interval = 3;
      else s.interval = Math.round(s.interval * s.ef);
      s.due = Date.now() + s.interval * DAY;
    }
    s.ef = Math.max(1.3, s.ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    s.last = Date.now();
    srs[cardId] = s;
    storage.setSrs(srs);
    return s;
  }

  function queueOf(cards, filter) {
    var now = Date.now();
    return cards.filter(function (c) {
      var s = srsState(c.id);
      var status = cardStatus(s);
      if (filter.status && filter.status !== 'all' && status !== filter.status) return false;
      if (filter.kind && filter.kind !== 'all' && c.kind !== filter.kind) return false;
      if (filter.topic && filter.topic !== 'all' && c.topic !== filter.topic) return false;
      // due = never seen OR due time passed
      if (filter.mode === 'due') return !s || s.due <= now;
      return true;
    });
  }

  /* ---------- overview ---------- */

  function renderOverview(el) {
    deps();
    el.innerHTML = '<div class="loading-state">Building review pool…</div>';
    buildPool().then(function (cards) {
      var now = Date.now();
      var due = 0, learned = 0, mastered = 0;
      cards.forEach(function (c) {
        var s = srsState(c.id);
        var st = cardStatus(s);
        if (!s || s.due <= now) due++;
        if (st === 'learning') learned++;
        if (st === 'mastered') mastered++;
      });

      var html = '<h1 class="page-title">Review</h1>'
        + '<p class="page-sub">Spaced repetition over every word, phrase and pattern in the Knowledge bank — plus every question you have ever got wrong. Cards are scheduled with an SM-2 algorithm.</p>';

      html += '<div class="grid grid-4" style="margin-bottom:16px">'
        + tile(String(cards.length), 'total cards')
        + tile(String(due), 'due now')
        + tile(String(learned), 'learning')
        + tile(String(mastered), 'mastered')
        + '</div>';

      html += '<div class="grid grid-cards">'
        + '<div class="card"><h3>🎴 Study due cards</h3><p class="card-sub">The core daily session: everything the scheduler says you should see today.</p>'
        + '<button class="btn" id="btnDue"' + (due ? '' : ' disabled') + '>Start session (' + due + ')</button></div>'
        + '<div class="card"><h3>🆕 Preview new cards</h3><p class="card-sub">Meet cards you have never studied before.</p>'
        + '<button class="btn ghost" id="btnNew">Start session</button></div>'
        + '<div class="card"><h3>📇 Browse all cards</h3><p class="card-sub">Filter by topic, type and status.</p>'
        + '<a class="btn ghost" href="#/review/browse">Browse</a></div>'
        + '<div class="card"><h3>📓 Mistake notebook</h3><p class="card-sub">Questions you got wrong in practice and mocks.</p>'
        + '<a class="btn ghost" href="#/review/mistakes">Open</a></div>'
        + '</div>';

      el.innerHTML = html;
      var bd = el.querySelector('#btnDue');
      if (bd) bd.addEventListener('click', function () { window.location.hash = '#/review/session/due'; });
      el.querySelector('#btnNew').addEventListener('click', function () { window.location.hash = '#/review/session/new'; });
    }).catch(function (err) {
      el.innerHTML = '<div class="empty-state">Could not build the review pool: ' + ui.esc(err.message) + '</div>';
    });
  }

  function tile(v, l) {
    return '<div class="card stat-tile"><div class="stat-num">' + ui.esc(v) + '</div><div class="stat-label">' + ui.esc(l) + '</div></div>';
  }

  /* ---------- session ---------- */

  function renderSession(el, mode) {
    deps();
    el.innerHTML = '<div class="loading-state">Preparing cards…</div>';
    buildPool().then(function (cards) {
      var filter = { mode: mode === 'new' ? 'all' : 'due', status: mode === 'new' ? 'new' : 'all', kind: 'all', topic: 'all' };
      var queue = queueOf(cards, filter);
      // cap + shuffle
      queue = shuffle(queue).slice(0, 30);
      if (!queue.length) {
        el.innerHTML = '<div class="empty-state">Nothing to review right now — the scheduler is happy. 🎉<br><br>'
          + '<a class="btn" href="#/review">Back to Review</a></div>';
        return;
      }

      var idx = 0;
      var flipped = false;
      var reviewed = 0;

      function paint() {
        if (idx >= queue.length) { done(); return; }
        var c = queue[idx];
        var showZh = storage.getSettings().showZh !== false;
        flipped = false;

        var html = '<div class="exam-bar"><span class="exam-name">Review session</span>'
          + '<span class="chip">' + (idx + 1) + ' / ' + queue.length + '</span>'
          + '<span class="chip ' + kindChip(c.kind) + '">' + ui.esc(c.kind) + '</span>'
          + '<div class="spacer"></div>'
          + '<button class="btn ghost small" id="rvExit">Exit</button></div>';

        html += '<div class="flashcard-stage"><div class="flashcard" id="fc" role="button" tabindex="0" aria-label="Flashcard, press to flip">'
          + '<div class="flashcard-face front">'
          + '<div class="flashcard-word">' + ui.esc(c.front) + '</div>'
          + (c.phonetic ? '<div class="flashcard-phonetic">' + ui.esc(c.phonetic) + '</div>' : '')
          + (c.pos ? '<span class="chip">' + ui.esc(c.pos) + '</span>' : '')
          + '<button class="btn ghost small" id="fcSay" style="margin-top:8px">🔊 Listen</button>'
          + '<div class="flashcard-hint">Tap card (or press Space) to reveal</div>'
          + '</div>'
          + '<div class="flashcard-face back">'
          + '<div style="font-size:20px;font-weight:600">' + ui.esc(c.back) + '</div>'
          + (c.backZh && showZh ? '<div class="muted">' + ui.esc(c.backZh) + '</div>' : '')
          + (c.example ? '<div class="example-block" style="text-align:left"><div class="ex-en">' + ui.esc(c.example) + '</div>'
            + (c.exampleZh && showZh ? '<div class="ex-zh">' + ui.esc(c.exampleZh) + '</div>' : '') + '</div>' : '')
          + '</div>'
          + '</div></div>';

        html += '<div class="rate-row" id="rateRow" style="display:none">'
          + '<button class="btn danger" data-q="1">Again</button>'
          + '<button class="btn secondary" data-q="3">Hard</button>'
          + '<button class="btn" data-q="4">Good</button>'
          + '<button class="btn success" data-q="5">Easy</button>'
          + '</div>'
          + '<p class="swipe-hint">Swipe left/right to move; tap card to flip</p>';

        el.innerHTML = html;

        var fc = el.querySelector('#fc');
        fc.addEventListener('click', function (e) {
          if (e.target.closest('#fcSay')) return;
          flip();
        });
        fc.addEventListener('keydown', function (e) {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
        });
        el.querySelector('#fcSay').addEventListener('click', function () {
          window.APP.audio.speak(c.front);
        });
        el.querySelector('#rvExit').addEventListener('click', function () {
          window.location.hash = '#/review';
        });
        el.querySelectorAll('#rateRow .btn').forEach(function (b) {
          b.addEventListener('click', function () {
            sm2(c.id, Number(b.getAttribute('data-q')));
            reviewed++;
            idx++;
            paint();
          });
        });
      }

      function flip() {
        var fc = el.querySelector('#fc');
        if (!fc) return;
        flipped = !flipped;
        fc.classList.toggle('flipped', flipped);
        if (flipped) el.querySelector('#rateRow').style.display = 'flex';
      }

      function done() {
        storage.touchStudy(3);
        el.innerHTML = '<div class="card center" style="max-width:560px;margin:40px auto">'
          + '<h2>Session complete</h2>'
          + '<p>You reviewed ' + reviewed + ' card' + (reviewed === 1 ? '' : 's') + '. The scheduler has updated all due dates.</p>'
          + '<div class="row-wrap" style="justify-content:center">'
          + '<a class="btn" href="#/review">Back to Review</a>'
          + '<a class="btn ghost" href="#/review/session/due">Another session</a>'
          + '</div></div>';
      }

      // swipe navigation between cards
      var touchX = null;
      el.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
      el.addEventListener('touchend', function (e) {
        if (touchX === null) return;
        var dx = e.changedTouches[0].clientX - touchX;
        touchX = null;
        if (Math.abs(dx) > 70 && idx < queue.length) {
          if (dx < 0) { /* next without rating = treat as Again later; just skip display */ idx++; paint(); }
          else { flip(); }
        }
      }, { passive: true });

      paint();
    }).catch(function (err) {
      el.innerHTML = '<div class="empty-state">Could not start session: ' + ui.esc(err.message) + '</div>';
    });
  }

  function kindChip(kind) {
    return kind === 'word' ? 'success' : kind === 'phrase' ? 'accent' : kind === 'pattern' ? 'warning' : 'danger';
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- browse ---------- */

  function renderBrowse(el) {
    deps();
    el.innerHTML = '<div class="loading-state">Loading cards…</div>';
    buildPool().then(function (cards) {
      var topics = ['all'];
      cards.forEach(function (c) { if (topics.indexOf(c.topic) === -1) topics.push(c.topic); });

      var html = '<p><a href="#/review" class="small">← Review</a></p>'
        + '<h1 class="page-title">Card browser</h1>'
        + '<div class="card" style="margin-bottom:14px"><div class="form-row">'
        + '<label class="field mb0"><span>Type</span><select id="fKind">'
        + '<option value="all">All types</option><option value="word">Words</option><option value="phrase">Phrases</option><option value="pattern">Patterns</option><option value="mistake">Mistakes</option>'
        + '</select></label>'
        + '<label class="field mb0"><span>Status</span><select id="fStatus">'
        + '<option value="all">All statuses</option><option value="new">New</option><option value="learning">Learning</option><option value="mastered">Mastered</option>'
        + '</select></label>'
        + '<label class="field mb0"><span>Topic</span><select id="fTopic">'
        + topics.map(function (t) { return '<option value="' + ui.escAttr(t) + '">' + (t === 'all' ? 'All topics' : ui.esc(t)) + '</option>'; }).join('')
        + '</select></label>'
        + '</div></div>'
        + '<div id="cardList"></div>';

      el.innerHTML = html;

      function repaint() {
        var filter = {
          mode: 'all',
          kind: el.querySelector('#fKind').value,
          status: el.querySelector('#fStatus').value,
          topic: el.querySelector('#fTopic').value
        };
        var list = queueOf(cards, filter).slice(0, 200);
        var box = el.querySelector('#cardList');
        if (!list.length) { box.innerHTML = '<div class="empty-state">No cards match these filters.</div>'; return; }
        var h = '<div class="grid grid-cards">';
        list.forEach(function (c) {
          var s = srsState(c.id);
          var st = cardStatus(s);
          h += '<div class="card">'
            + '<div class="card-header"><h3 class="mb0" style="font-size:17px">' + ui.esc(c.front) + '</h3>'
            + '<span class="chip ' + kindChip(c.kind) + '">' + ui.esc(c.kind) + '</span></div>'
            + '<p class="mb0 small">' + ui.esc(c.back) + '</p>'
            + (c.example ? '<p class="small muted mb0">e.g. ' + ui.esc(c.example) + '</p>' : '')
            + '<div class="row-wrap" style="margin-top:8px"><span class="chip">' + ui.esc(c.topic) + '</span>'
            + '<span class="chip ' + (st === 'mastered' ? 'success' : st === 'learning' ? 'warning' : '') + '">' + st + '</span>'
            + (s && s.due ? '<span class="chip">due ' + ui.dateStr(s.due) + '</span>' : '')
            + '<button class="btn ghost small say" data-say="' + ui.escAttr(c.front) + '">🔊</button>'
            + '</div></div>';
        });
        h += '</div>';
        box.innerHTML = h;
        box.querySelectorAll('.say').forEach(function (b) {
          b.addEventListener('click', function () { window.APP.audio.speak(b.getAttribute('data-say')); });
        });
      }

      ['#fKind', '#fStatus', '#fTopic'].forEach(function (sel) {
        el.querySelector(sel).addEventListener('change', repaint);
      });
      repaint();
    }).catch(function (err) {
      el.innerHTML = '<div class="empty-state">Could not load cards: ' + ui.esc(err.message) + '</div>';
    });
  }

  /* ---------- mistake notebook ---------- */

  function renderMistakes(el) {
    deps();
    var mistakes = storage.getMistakes();
    var keys = Object.keys(mistakes).sort(function (a, b) { return (mistakes[b].ts || 0) - (mistakes[a].ts || 0); });

    var html = '<p><a href="#/review" class="small">← Review</a></p>'
      + '<h1 class="page-title">Mistake notebook</h1>'
      + '<p class="page-sub">Every question you got wrong is collected here automatically. Getting it right in a later practice or mock removes it.</p>';

    if (!keys.length) {
      html += '<div class="empty-state">No mistakes recorded. Either you are perfect, or you haven\'t practised yet. 😉</div>';
      el.innerHTML = html;
      return;
    }

    keys.forEach(function (k) {
      var m = mistakes[k];
      html += '<div class="review-item incorrect">'
        + '<div class="q-meta"><span class="chip primary">' + ui.esc(m.skill || '?') + '</span>'
        + (m.part ? '<span class="chip">Part ' + m.part + '</span>' : '')
        + '<span class="chip">' + ui.esc(m.source || '') + '</span>'
        + '<span class="chip">' + ui.dateStr(m.ts) + '</span></div>'
        + '<p class="mb0">' + ui.esc(m.stem || m.qid) + '</p>'
        + '<div class="small" style="margin-top:6px">Your answer: <strong>' + ui.esc(m.given || '(none)') + '</strong> · Correct: <strong style="color:var(--c-success)">' + ui.esc(m.correctAnswer) + '</strong></div>'
        + '</div>';
    });

    html += '<div class="row-wrap" style="margin-top:14px">'
      + '<a class="btn" href="#/review/session/due">Review them as flashcards</a>'
      + '<button class="btn danger ghost" id="clearMistakes">Clear notebook</button></div>';

    el.innerHTML = html;
    el.querySelector('#clearMistakes').addEventListener('click', function () {
      ui.confirmModal('Clear mistake notebook?', 'All recorded mistakes will be removed.', function () {
        storage.setMistakes({});
        renderMistakes(el);
      });
    });
  }

  window.APP = window.APP || {};
  window.APP.pages = window.APP.pages || {};
  window.APP.pages.review = {
    renderOverview: renderOverview,
    renderSession: renderSession,
    renderBrowse: renderBrowse,
    renderMistakes: renderMistakes
  };
})();
