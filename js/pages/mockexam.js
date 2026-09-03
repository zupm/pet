/* ==========================================================================
   pages/mockexam.js - full timed mock exams from data/mocks/*.json
   - per-paper countdown, auto-save, flagging, answer sheet
   - report with per-part scores, Cambridge Scale estimate, pass line
   - section-specific drills (Reading-only, Listening-only, …)
   ========================================================================== */
(function () {
  'use strict';

  var ui, data, storage, scoring, practicePage;

  function deps() {
    ui = window.APP.ui;
    data = window.APP.data;
    storage = window.APP.storage;
    scoring = window.APP.scoring;
    practicePage = window.APP.pages.practice;
  }

  var SECTION_META = {
    reading: { icon: '📖', name: 'Reading', time: 45 * 60, desc: '6 parts · 32 questions' },
    writing: { icon: '✍️', name: 'Writing', time: 45 * 60, desc: '2 tasks (email + article/story)' },
    listening: { icon: '🎧', name: 'Listening', time: 30 * 60, desc: '4 parts · 25 questions' },
    speaking: { icon: '🗣️', name: 'Speaking', time: 12 * 60, desc: '4 parts · 10–12 minutes' }
  };

  /* ---------- list ---------- */

  function renderList(el) {
    deps();
    var entries = data.mockEntries();
    var p = storage.getProgress();

    var html = '<h1 class="page-title">Mock Exams</h1>'
      + '<p class="page-sub">Full timed papers under real exam conditions. Your state auto-saves, so you can safely refresh the page mid-exam. Scores are estimated on the Cambridge Scale (pass: 140+).</p>';

    if (!entries.length) {
      html += '<div class="empty-state">No mock papers registered in data/manifest.json yet.</div>';
      el.innerHTML = html;
      return;
    }

    html += '<div class="grid grid-cards">';
    entries.forEach(function (m) {
      var best = bestScale(p, m.id);
      var attempts = countAttempts(p, m.id);
      var resume = resumeInfo(m.id);
      var label = m.id.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      html += '<div class="card">'
        + '<div class="card-header"><h3 class="mb0">' + ui.esc(label) + '</h3>'
        + (best !== null ? '<span class="chip ' + (best >= scoring.PASS_SCALE ? 'success' : 'danger') + '">best ' + best + '</span>' : '<span class="chip">not attempted</span>')
        + '</div>'
        + '<p class="card-sub">' + attempts + ' section attempt' + (attempts === 1 ? '' : 's')
        + (resume ? ' · in progress: ' + resume : '') + '</p>'
        + '<div class="row-wrap">'
        + '<a class="btn" href="#/mock/' + ui.esc(m.id) + '">Open paper</a>'
        + '<a class="btn ghost small" href="#/mock/' + ui.esc(m.id) + '/reading" title="Reading-only drill">📖 drill</a>'
        + '<a class="btn ghost small" href="#/mock/' + ui.esc(m.id) + '/listening" title="Listening-only drill">🎧 drill</a>'
        + '</div></div>';
    });
    html += '</div>';
    el.innerHTML = html;
  }

  function bestScale(p, mockId) {
    var best = null;
    (p.mockResults || []).forEach(function (r) {
      if (r.mockId === mockId && typeof r.scale === 'number') {
        if (best === null || r.scale > best) best = r.scale;
      }
    });
    return best;
  }

  function countAttempts(p, mockId) {
    var n = 0;
    (p.mockResults || []).forEach(function (r) { if (r.mockId === mockId) n++; });
    return n;
  }

  function resumeInfo(mockId) {
    var skills = ['reading', 'listening'];
    for (var i = 0; i < skills.length; i++) {
      var s = storage.get('session:' + mockId + '-' + skills[i], null);
      if (s) return skills[i];
    }
    return null;
  }

  /* ---------- mock home ---------- */

  function renderMock(el, mockId) {
    deps();
    var entry = null;
    data.mockEntries().forEach(function (m) { if (m.id === mockId) entry = m; });
    if (!entry) {
      el.innerHTML = '<div class="empty-state">Unknown mock exam. <a href="#/mocks">Back to list</a></div>';
      return;
    }
    el.innerHTML = '<div class="loading-state">Loading ' + ui.esc(mockId) + '…</div>';
    data.loadMock(entry.file).then(function (mock) {
      paintHome(el, entry, mock);
    }).catch(function (err) {
      el.innerHTML = '<div class="empty-state">Could not load this paper: ' + ui.esc(err.message)
        + '<br><br><a class="btn ghost" href="#/mocks">Back to mock list</a></div>';
    });
  }

  function paintHome(el, entry, mock) {
    var p = storage.getProgress();
    var html = '<p><a href="#/mocks" class="small">← All mock exams</a></p>'
      + '<h1 class="page-title">' + ui.esc(mock.title || mock.id) + '</h1>'
      + '<p class="page-sub">' + ui.esc(mock.description || 'Full B1 Preliminary practice paper.') + '</p>';

    html += '<div class="grid grid-2">';
    ['reading', 'writing', 'listening', 'speaking'].forEach(function (sk) {
      var meta = SECTION_META[sk];
      var sec = mock.sections && mock.sections[sk];
      var count = sec ? ((sec.questions || sec.tasks || sec.parts || []).length) : 0;
      var last = latestResult(p, mock.id, sk);
      var resumable = (sk === 'reading' || sk === 'listening') && storage.get('session:' + mock.id + '-' + sk, null);
      var timeMin = Math.round(((mock.timings && mock.timings[sk]) || meta.time) / 60);
      html += '<div class="card">'
        + '<div class="card-header"><h3 class="mb0">' + meta.icon + ' ' + meta.name + '</h3>'
        + '<span class="chip">' + timeMin + ' min</span></div>'
        + '<p class="card-sub">' + meta.desc + ' · ' + count + ' item' + (count === 1 ? '' : 's') + '</p>'
        + (last ? '<p class="small" style="margin-top:0">Last result: <strong>' + last.correct + '/' + last.max + '</strong> (' + last.pct + '%'
          + (typeof last.scale === 'number' ? ', scale ' + last.scale : '') + ') ' + ui.dateStr(last.ts) + '</p>' : '')
        + '<div class="row-wrap">'
        + '<a class="btn" href="#/mock/' + ui.esc(mock.id) + '/' + sk + '">' + (resumable ? 'Resume' : 'Start') + '</a>'
        + '</div></div>';
    });
    html += '</div>';

    var scales = ['reading', 'writing', 'listening', 'speaking']
      .map(function (sk) { var r = latestResult(p, mock.id, sk); return (r && typeof r.scale === 'number') ? r.scale : null; })
      .filter(function (s) { return s !== null; });
    if (scales.length) {
      var avg = Math.round(scales.reduce(function (a, b) { return a + b; }, 0) / scales.length);
      html += '<div class="card" style="margin-top:16px"><div class="row-wrap">'
        + '<div><div class="small muted">Overall estimate (' + scales.length + '/4 sections with scale scores)</div>'
        + '<strong style="font-size:22px">Cambridge Scale ' + avg + '</strong> '
        + (avg >= scoring.PASS_SCALE ? '<span class="chip success">on track to pass</span>' : '<span class="chip danger">below pass line</span>')
        + '</div><div class="spacer"></div>'
        + '<span class="small muted">Pass = 140+ (B1) · 160+ = distinction (B2)</span>'
        + '</div></div>';
    }

    el.innerHTML = html;
  }

  function latestResult(p, mockId, skill) {
    var best = null;
    (p.mockResults || []).forEach(function (r) {
      if (r.mockId === mockId && r.skill === skill) {
        if (!best || r.ts > best.ts) best = r;
      }
    });
    return best;
  }

  /* ---------- section runners ---------- */

  function renderSection(el, mockId, skill) {
    deps();
    var entry = null;
    data.mockEntries().forEach(function (m) { if (m.id === mockId) entry = m; });
    if (!entry) { el.innerHTML = '<div class="empty-state">Unknown mock exam.</div>'; return; }

    el.innerHTML = '<div class="loading-state">Loading paper…</div>';
    data.loadMock(entry.file).then(function (mock) {
      var sec = mock.sections && mock.sections[skill];
      if (!sec) {
        el.innerHTML = '<div class="empty-state">This paper has no ' + skill + ' section.</div>';
        return;
      }
      if (skill === 'reading' || skill === 'listening') runQuestionSection(el, mock, skill, sec);
      else if (skill === 'writing') runWritingSection(el, mock, sec);
      else if (skill === 'speaking') runSpeakingSection(el, mock, sec);
    }).catch(function (err) {
      el.innerHTML = '<div class="empty-state">Could not load paper: ' + ui.esc(err.message) + '</div>';
    });
  }

  function runQuestionSection(el, mock, skill, sec) {
    var qs = sec.questions || [];
    if (!qs.length) { el.innerHTML = '<div class="empty-state">No questions in this section.</div>'; return; }

    var timeLimit = (mock.timings && mock.timings[skill]) || SECTION_META[skill].time;

    var audioMap = null;
    if (skill === 'listening') {
      audioMap = {};
      qs.forEach(function (q) {
        var lines = q.lines || (q.refScript && sec.scripts ? sec.scripts[q.refScript] : null);
        if (lines || q.audio) audioMap[q.id] = { src: q.audio || null, lines: lines || [] };
      });
    }

    var saved = storage.get('session:' + mock.id + '-' + skill, null);
    if (!saved) {
      var introHtml = '<div class="exam-intro card">'
        + '<h1 class="page-title mt0">' + SECTION_META[skill].icon + ' ' + ui.esc(mock.title) + ' — ' + SECTION_META[skill].name + '</h1>'
        + '<dl>'
        + '<dt>Questions</dt><dd>' + qs.length + '</dd>'
        + '<dt>Time allowed</dt><dd>' + Math.round(timeLimit / 60) + ' minutes</dd>'
        + '<dt>Rules</dt><dd>Strict exam mode: no feedback until the end. Answers auto-save; you can refresh safely. Flag questions to revisit them.</dd>'
        + '</dl>'
        + '<div class="row-wrap">'
        + '<button class="btn big" id="beginBtn">Begin section</button>'
        + '<a class="btn ghost" href="#/mock/' + ui.esc(mock.id) + '">Back</a>'
        + '</div></div>';
      el.innerHTML = introHtml;
      el.querySelector('#beginBtn').addEventListener('click', begin);
      return;
    }
    begin();

    function begin() {
      practicePage.startQuestionSession(el, {
        skill: skill,
        title: (mock.title || mock.id) + ' · ' + SECTION_META[skill].name,
        questions: qs,
        mode: 'exam',
        timeLimit: timeLimit,
        stateKey: mock.id + '-' + skill,
        audioMap: audioMap,
        sourceLabel: mock.id,
        onExit: function () { renderMock(el, mock.id); },
        onResult: function (summary) {
          scoring.logMockResult({
            mockId: mock.id,
            skill: skill,
            title: (mock.title || mock.id) + ' — ' + SECTION_META[skill].name,
            route: '#/mock/' + mock.id,
            correct: summary.correct,
            max: summary.max,
            pct: summary.pct,
            scale: scoring.scaleEstimate(summary.pct),
            parts: summary.parts,
            ts: Date.now()
          });
        }
      });
    }
  }

  function runWritingSection(el, mock, sec) {
    var tasks = sec.tasks || [];
    if (!tasks.length) { el.innerHTML = '<div class="empty-state">No writing tasks in this section.</div>'; return; }

    var i = 0;
    var doneCount = 0;

    function step() {
      if (i >= tasks.length) { finish(); return; }
      var task = tasks[i];
      var header = '<div class="exam-bar"><span class="exam-name">' + ui.esc(mock.title) + ' · Writing</span>'
        + '<span class="chip">Task ' + (i + 1) + ' of ' + tasks.length + '</span>'
        + '<div class="spacer"></div>'
        + '<a class="btn ghost small" href="#/mock/' + ui.esc(mock.id) + '">Save & exit</a></div>';
      el.innerHTML = header;
      var holder = document.createElement('div');
      el.appendChild(holder);
      practicePage.runWritingTask(holder, task, function () {
        doneCount++;
        i++;
        window.setTimeout(step, 600);
      });
      var back = holder.querySelector('a.small');
      if (back) { back.textContent = '← Exit writing'; back.setAttribute('href', '#/mock/' + mock.id); }
    }

    function finish() {
      var pct = Math.round((doneCount / tasks.length) * 100);
      scoring.logMockResult({
        mockId: mock.id,
        skill: 'writing',
        title: (mock.title || mock.id) + ' — Writing',
        route: '#/mock/' + mock.id,
        correct: doneCount,
        max: tasks.length,
        pct: pct,
        scale: scoring.scaleEstimate(pct),
        parts: [],
        ts: Date.now()
      });
      el.innerHTML = '<div class="card center" style="max-width:560px;margin:40px auto">'
        + '<h2>Writing section complete</h2>'
        + '<p>You completed ' + doneCount + ' of ' + tasks.length + ' tasks.</p>'
        + '<div class="row-wrap" style="justify-content:center">'
        + '<a class="btn" href="#/mock/' + ui.esc(mock.id) + '">Back to paper</a>'
        + '</div></div>';
    }

    step();
  }

  function runSpeakingSection(el, mock, sec) {
    var parts = sec.parts || [];
    if (!parts.length) { el.innerHTML = '<div class="empty-state">No speaking content in this section.</div>'; return; }

    var html = '<div class="exam-bar"><span class="exam-name">' + ui.esc(mock.title) + ' · Speaking</span>'
      + '<span class="chip">about 10–12 minutes</span>'
      + '<div class="spacer"></div>'
      + '<a class="btn ghost small" href="#/mock/' + ui.esc(mock.id) + '">Exit</a></div>';
    html += '<p class="page-sub">In the real exam you speak with another candidate and two examiners. Here: answer each prompt out loud, time yourself, and use the useful language.</p>';

    parts.forEach(function (pt) {
      html += '<div class="card" style="margin-bottom:14px"><h3>Part ' + pt.part + ' — ' + ui.esc(pt.name || '') + '</h3>'
        + '<p class="card-sub">' + ui.esc(pt.desc || '') + (pt.time ? ' · ' + pt.time : '') + '</p>';
      if (pt.useful && pt.useful.length) {
        html += '<details><summary class="small" style="cursor:pointer;font-weight:600">Useful language</summary><ul class="keypoint-list">';
        pt.useful.forEach(function (u) { html += '<li>' + ui.rich(u) + '</li>'; });
        html += '</ul></details>';
      }
      (pt.prompts || []).forEach(function (pr, i) {
        var text = typeof pr === 'string' ? pr : pr.q;
        html += '<div class="card" style="background:var(--c-surface-2);box-shadow:none;margin-top:10px">'
          + '<div class="row-wrap"><strong>Prompt ' + (i + 1) + '</strong>'
          + '<button class="btn ghost small sp-speak" data-text="' + ui.escAttr(text) + '">🔊 Listen</button>'
          + '<button class="btn small sp-timer" data-sec="' + (pr.prep || 60) + '">⏱ ' + (pr.prep || 60) + 's</button></div>'
          + '<p class="mb0">' + ui.esc(text) + '</p>'
          + (pr.image ? '<img src="' + ui.escAttr(pr.image) + '" alt="Speaking picture" style="max-width:100%;border-radius:8px;margin-top:8px">' : '')
          + (pr.followUps ? '<p class="small muted mb0">Follow-ups: ' + ui.esc(pr.followUps) + '</p>' : '')
          + '<div class="timer-slot small muted"></div></div>';
      });
      html += '</div>';
    });

    html += '<div class="center"><button class="btn success big" id="speakDone">Mark Speaking section complete</button></div>';

    el.innerHTML = html;

    el.querySelectorAll('.sp-speak').forEach(function (b) {
      b.addEventListener('click', function () { window.APP.audio.speak(b.getAttribute('data-text')); });
    });
    el.querySelectorAll('.sp-timer').forEach(function (b) {
      b.addEventListener('click', function () {
        var slot = b.closest('.card').querySelector('.timer-slot');
        var t = window.APP.timer.create({
          seconds: Number(b.getAttribute('data-sec')) || 60,
          onTick: function (rem) { slot.textContent = '⏱ ' + window.APP.timer.format(rem); },
          onExpire: function () { slot.textContent = '⏱ Time!'; }
        });
        t.start();
      });
    });

    el.querySelector('#speakDone').addEventListener('click', function () {
      scoring.logMockResult({
        mockId: mock.id,
        skill: 'speaking',
        title: (mock.title || mock.id) + ' — Speaking',
        route: '#/mock/' + mock.id,
        correct: 1,
        max: 1,
        pct: 100,
        scale: null,
        parts: [],
        ts: Date.now()
      });
      ui.toast('Speaking section recorded.', 'success');
      renderMock(el, mock.id);
    });
  }

  window.APP = window.APP || {};
  window.APP.pages = window.APP.pages || {};
  window.APP.pages.mockexam = {
    renderList: renderList,
    renderMock: renderMock,
    renderSection: renderSection
  };
})();
