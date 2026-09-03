/* ==========================================================================
   pages/practice.js
   - Practice landing + per-skill setup (two modes: instant / exam)
   - APP.session: shared question-session engine (also used by mock exams)
   - Writing task runner (textarea, word count, model answer, checklist)
   - Speaking prompt runner
   ========================================================================== */
(function () {
  'use strict';

  var ui, data, storage, scoring;

  function deps() {
    ui = window.APP.ui;
    data = window.APP.data;
    storage = window.APP.storage;
    scoring = window.APP.scoring;
  }

  var SKILL_META = {
    reading: { icon: '📖', name: 'Reading', desc: 'All 6 PET Reading parts: signs, matching, longer texts, cloze and open cloze.' },
    writing: { icon: '✍️', name: 'Writing', desc: 'Emails, articles and stories with model answers and rubric checklists.' },
    listening: { icon: '🎧', name: 'Listening', desc: 'All 4 PET Listening parts with audio, replay and transcripts.' },
    speaking: { icon: '🗣️', name: 'Speaking', desc: 'Prompt banks for all 4 Speaking parts with useful language.' }
  };

  /* ================= landing ================= */

  function renderLanding(el) {
    deps();
    var html = '<h1 class="page-title">Practice</h1>'
      + '<p class="page-sub">Drill each skill separately. Choose instant feedback to learn as you go, or exam mode to simulate test conditions.</p>'
      + '<div class="grid grid-2">';
    Object.keys(SKILL_META).forEach(function (sk) {
      var m = SKILL_META[sk];
      html += '<a class="card clickable" href="#/practice/' + sk + '" style="text-decoration:none;color:inherit">'
        + '<h3>' + m.icon + ' ' + m.name + '</h3>'
        + '<p class="card-sub mb0">' + m.desc + '</p></a>';
    });
    html += '</div>';
    el.innerHTML = html;
  }

  /* ================= per-skill setup ================= */

  function renderSkill(el, skill) {
    deps();
    if (!SKILL_META[skill]) { el.innerHTML = '<div class="empty-state">Unknown skill.</div>'; return; }

    if (skill === 'writing') return renderWritingLanding(el);
    if (skill === 'speaking') return renderSpeakingLanding(el);

    el.innerHTML = '<div class="loading-state">Loading ' + skill + ' bank…</div>';

    data.loadPractice(skill).then(function (bank) {
      var qs = bank.questions || [];
      if (!qs.length) {
        el.innerHTML = '<div class="empty-state">No questions in this bank yet.</div>';
        return;
      }
      // group by part
      var parts = {};
      qs.forEach(function (q) {
        var p = q.part || 0;
        if (!parts[p]) parts[p] = [];
        parts[p].push(q);
      });

      var html = '<p><a href="#/practice" class="small">← Practice</a></p>'
        + '<h1 class="page-title">' + SKILL_META[skill].icon + ' ' + SKILL_META[skill].name + '</h1>'
        + '<p class="page-sub">' + SKILL_META[skill].desc + '</p>';

      html += '<div class="grid grid-cards">';
      html += '<div class="card"><h3>Full bank</h3><p class="card-sub">' + qs.length + ' questions across ' + Object.keys(parts).length + ' parts</p>'
        + '<div class="row-wrap">'
        + '<button class="btn start-btn" data-part="all" data-mode="instant">Instant feedback</button>'
        + '<button class="btn ghost start-btn" data-part="all" data-mode="exam">Exam mode</button>'
        + '</div></div>';
      Object.keys(parts).sort(function (a, b) { return a - b; }).forEach(function (p) {
        var label = partLabel(skill, p);
        html += '<div class="card"><h3>Part ' + p + '</h3><p class="card-sub">' + ui.esc(label) + ' · ' + parts[p].length + ' questions</p>'
          + '<div class="row-wrap">'
          + '<button class="btn start-btn" data-part="' + p + '" data-mode="instant">Instant feedback</button>'
          + '<button class="btn ghost start-btn" data-part="' + p + '" data-mode="exam">Exam mode</button>'
          + '</div></div>';
      });
      html += '</div>';

      el.innerHTML = html;

      el.querySelectorAll('.start-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var part = btn.getAttribute('data-part');
          var mode = btn.getAttribute('data-mode');
          var subset = part === 'all' ? qs : qs.filter(function (q) { return String(q.part) === part; });
          startQuestionSession(el, {
            skill: skill,
            bank: bank,
            questions: subset,
            mode: mode,
            title: SKILL_META[skill].name + (part === 'all' ? ' — full practice' : ' Part ' + part)
          });
        });
      });
    }).catch(function (err) {
      el.innerHTML = '<div class="empty-state">Could not load the ' + skill + ' bank: ' + ui.esc(err.message)
        + '<br><br><a class="btn ghost" href="#/practice">Back</a></div>';
    });
  }

  function partLabel(skill, part) {
    var L = {
      reading: { 1: 'Multiple choice — short texts & signs', 2: 'Matching', 3: 'Multiple choice — longer text', 4: 'Multiple-choice gap fill', 5: 'Multiple-choice cloze', 6: 'Open cloze (one word per gap)' },
      listening: { 1: 'Multiple choice with pictures', 2: 'Multiple choice — short recordings', 3: 'Gap fill (complete the notes)', 4: 'Multiple choice — longer recording' }
    };
    return (L[skill] && L[skill][part]) || 'Practice questions';
  }

  /* ================= question session engine (shared) ================= */

  function startQuestionSession(el, opts) {
    deps();

    var questions = opts.questions.slice();
    var mode = opts.mode || 'instant';
    var idx = 0;
    var answers = {};
    var flags = {};
    var finished = false;
    var startedAt = Date.now();
    var timer = null;
    var checked = {}; // instant mode: qid -> graded result

    /* --- resume support --- */
    if (opts.stateKey) {
      var saved = storage.get('session:' + opts.stateKey, null);
      if (saved && Array.isArray(saved.qids) && saved.qids.length === questions.length) {
        answers = saved.answers || {};
        flags = saved.flags || {};
        idx = Math.min(saved.idx || 0, questions.length - 1);
      }
    }

    function persistState() {
      if (!opts.stateKey || finished) return;
      storage.set('session:' + opts.stateKey, {
        qids: questions.map(function (q) { return q.id; }),
        answers: answers,
        flags: flags,
        idx: idx,
        ts: Date.now()
      });
    }

    /* --- timer --- */
    if (opts.timeLimit) {
      timer = window.APP.timer.create({
        seconds: opts.timeLimit,
        autoSaveKey: opts.stateKey || null,
        onTick: function (rem) {
          var clock = el.querySelector('.exam-clock');
          if (!clock) return;
          clock.textContent = window.APP.timer.format(rem);
          clock.classList.toggle('warn', rem <= 300 && rem > 60);
          clock.classList.toggle('danger', rem <= 60);
        },
        onExpire: function () {
          ui.toast('Time is up — submitting your answers.', 'error');
          finish(true);
        }
      });
      timer.start();
    }

    /* --- layout --- */
    function shell() {
      var html = '<div class="exam-bar">'
        + '<span class="exam-name">' + ui.esc(opts.title) + '</span>'
        + (timer ? '<span class="exam-clock">' + window.APP.timer.format(timer.remaining()) + '</span>' : '')
        + '<span class="chip" id="sessProgress"></span>'
        + '<div class="spacer"></div>'
        + '<button class="btn ghost small" id="sessExit">Exit</button>'
        + '</div>'
        + '<div id="qArea"></div>'
        + '<div class="pager">'
        + '<button class="btn ghost nav-btn" id="btnPrev">← Prev</button>'
        + '<button class="btn ghost flag-btn" id="btnFlag" aria-label="Flag question">⚑ Flag</button>'
        + '<div class="spacer"></div>'
        + '<button class="btn nav-btn" id="btnNext">Next →</button>'
        + '</div>'
        + (mode === 'exam'
          ? '<details id="sheetWrap" class="card" style="margin-bottom:14px"><summary style="cursor:pointer;font-weight:600">Answer sheet</summary><div class="sheet-grid" id="sheetGrid"></div>'
            + '<div class="center"><button class="btn success big" id="btnSubmit">Submit answers</button></div></details>'
          : '')
        + '<p class="swipe-hint">Swipe ← → to move between questions</p>';
      return html;
    }

    el.innerHTML = shell();

    el.querySelector('#sessExit').addEventListener('click', function () {
      window.APP.audio.stop();
      if (timer) timer.stop();
      persistState();
      if (opts.onExit) opts.onExit(); else renderSkill(el, opts.skill);
    });

    function audioFor(q) {
      if (!q) return null;
      if (opts.audioMap && opts.audioMap[q.id]) return opts.audioMap[q.id];
      if (q.audio || q.lines) return { src: q.audio || null, lines: q.lines || null };
      return null;
    }

    function paintQuestion() {
      window.APP.audio.stop();
      var q = questions[idx];
      var area = el.querySelector('#qArea');
      var num = idx + 1;

      var html = '<div class="q-card" id="qCard">';
      html += '<div class="q-meta"><span class="q-num">' + num + '</span>'
        + (q.part ? '<span class="chip primary">Part ' + q.part + '</span>' : '')
        + '<span class="chip">' + ui.esc(q.type || 'question') + '</span>'
        + (flags[q.id] ? '<span class="chip warning">⚑ flagged</span>' : '')
        + '</div>';

      if (q.context) html += '<div class="q-context">' + ui.esc(q.context) + '</div>';
      if (q.stem) html += '<p class="q-stem">' + renderStem(q) + '</p>';

      var au = audioFor(q);
      if (au) {
        html += '<div class="player-bar">'
          + '<button class="btn play-btn" data-qid="' + ui.escAttr(q.id) + '">▶ Play audio</button>'
          + '<button class="btn ghost stop-audio-btn">■ Stop</button>'
          + '<span class="player-status" id="playerStatus">ready</span>'
          + '<span class="player-note">' + (au.src ? 'Audio file' : 'Audio not recorded yet — browser voice is used') + '</span>'
          + '</div>';
      }

      if (q.type === 'mcq' || q.type === 'picture-mcq') {
        html += '<div class="opt-list" role="listbox">';
        (q.options || []).forEach(function (op, i) {
          var sel = answers[q.id] === i ? ' selected' : '';
          html += '<button class="opt-btn' + sel + '" data-i="' + i + '" role="option">'
            + '<span class="opt-key">' + String.fromCharCode(65 + i) + '</span><span>' + ui.esc(op) + '</span></button>';
        });
        html += '</div>';
      } else if (q.type === 'matching') {
        html += '<p class="small muted mb0" style="margin-bottom:8px">Choose the correct option (A–' + String.fromCharCode(64 + (q.options || []).length) + ') for this person/description.</p>';
        html += '<div class="opt-list">';
        (q.options || []).forEach(function (op, i) {
          var sel = answers[q.id] === i ? ' selected' : '';
          html += '<button class="opt-btn' + sel + '" data-i="' + i + '">'
            + '<span class="opt-key">' + String.fromCharCode(65 + i) + '</span><span>' + ui.esc(op) + '</span></button>';
        });
        html += '</div>';
      } else {
        var val = answers[q.id] || '';
        html += '<input type="text" class="answer-input" id="openAnswer" placeholder="Type your answer…" value="' + ui.escAttr(val) + '" autocomplete="off"> '
          + '<button class="btn small check-open-btn" style="margin-top:10px">Check</button>';
      }

      html += '<div id="fbSlot"></div></div>';
      area.innerHTML = html;

      // progress + pager state
      el.querySelector('#sessProgress').textContent = num + ' / ' + questions.length;
      el.querySelector('#btnPrev').disabled = idx === 0;
      el.querySelector('#btnNext').textContent = (idx === questions.length - 1 && mode === 'exam') ? 'Finish →' : 'Next →';
      var flagBtn = el.querySelector('#btnFlag');
      flagBtn.classList.toggle('flagged', !!flags[q.id]);
      if (mode === 'instant') flagBtn.style.display = 'none'; else flagBtn.style.display = '';

      // wire options
      area.querySelectorAll('.opt-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          if (mode === 'instant' && checked[q.id]) return;
          answers[q.id] = Number(b.getAttribute('data-i'));
          persistState();
          if (mode === 'instant') gradeInstant(q); else paintQuestion();
        });
      });

      var openInput = area.querySelector('#openAnswer');
      if (openInput) {
        openInput.addEventListener('input', function () {
          answers[q.id] = openInput.value;
          persistState();
        });
        openInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (mode === 'instant' && !checked[q.id]) gradeInstant(q);
          }
        });
        area.querySelector('.check-open-btn').addEventListener('click', function () {
          if (mode === 'instant' && !checked[q.id]) gradeInstant(q);
        });
      }

      // audio buttons
      var playBtn = area.querySelector('.play-btn');
      if (playBtn) {
        playBtn.addEventListener('click', function () {
          var au2 = audioFor(q);
          var status = area.querySelector('#playerStatus');
          if (status) status.textContent = 'playing…';
          window.APP.audio.play(au2, function () {
            if (status) status.textContent = 'finished';
          });
        });
        area.querySelector('.stop-audio-btn').addEventListener('click', function () {
          window.APP.audio.stop();
          var status = area.querySelector('#playerStatus');
          if (status) status.textContent = 'stopped';
        });
      }

      // show graded feedback again in instant mode
      if (mode === 'instant' && checked[q.id]) showFeedback(q, checked[q.id], true);

      paintSheet();
    }

    function renderStem(q) {
      // highlight gap markers like __3__ or (3)
      var s = ui.esc(q.stem);
      s = s.replace(/__(\d+)__/g, '<span class="gap-marker">($1)</span>');
      return s;
    }

    function gradeInstant(q) {
      var given = answers[q.id];
      if (given === undefined || given === null || given === '') {
        ui.toast('Choose or type an answer first.');
        return;
      }
      var res = scoring.checkAnswer(q, given);
      res.q = q;
      checked[q.id] = res;
      showFeedback(q, res, false);
      // record mistake immediately
      scoring.recordMistakes([res], { skill: opts.skill, label: opts.sourceLabel || 'practice' });
      paintSheet();
    }

    function showFeedback(q, res, rerender) {
      var slot = el.querySelector('#fbSlot');
      if (!slot) return;
      var cls = res.correct ? 'correct' : 'incorrect';
      var html = '<div class="feedback ' + cls + '">'
        + '<div class="fb-title">' + (res.correct ? '✓ Correct!' : '✗ Not quite.') + '</div>';
      if (!res.correct) html += '<div>Correct answer: <span class="fb-answer">' + ui.esc(res.correctAnswer) + '</span></div>';
      if (q.explanation) html += '<div class="fb-expl">' + ui.rich(q.explanation) + '</div>';
      var au = audioFor(q);
      if (au && au.lines) html += '<button class="btn ghost small transcript-toggle" style="margin-top:8px">Show transcript</button>';
      html += '</div>';
      slot.innerHTML = html;

      var tb = slot.querySelector('.transcript-toggle');
      if (tb) {
        tb.addEventListener('click', function () {
          var au2 = audioFor(q);
          var box = document.createElement('div');
          box.className = 'transcript-box';
          box.innerHTML = (au2.lines || []).map(function (l) {
            return typeof l === 'string' ? ui.esc(l)
              : '<span class="sp">' + ui.esc(l.speaker || '') + ':</span> ' + ui.esc(l.text);
          }).join('<br>');
          tb.replaceWith(box);
        });
      }

      // disable options after grading
      el.querySelectorAll('#qArea .opt-btn').forEach(function (b) {
        b.disabled = true;
        var i = Number(b.getAttribute('data-i'));
        if (i === Number(q.answer)) b.classList.add('correct');
        else if (i === Number(answers[q.id]) && !res.correct) b.classList.add('incorrect');
      });
      var inp = el.querySelector('#openAnswer');
      if (inp) inp.disabled = true;
    }

    function paintSheet() {
      var grid = el.querySelector('#sheetGrid');
      if (!grid) return;
      var html = '';
      questions.forEach(function (q, i) {
        var cls = 'sheet-cell';
        var a = answers[q.id];
        if (a !== undefined && a !== null && a !== '') cls += ' answered';
        if (i === idx) cls += ' current';
        if (flags[q.id]) cls += ' flagged';
        if (mode === 'instant' && checked[q.id]) cls += checked[q.id].correct ? ' correct' : ' incorrect';
        var label = i + 1;
        if (q.type === 'mcq' || q.type === 'matching' || q.type === 'picture-mcq') {
          if (a !== undefined && a !== null && a !== '') label = String.fromCharCode(65 + Number(a));
        } else if (a) {
          label = '•';
        }
        html += '<button class="' + cls + '" data-i="' + i + '" aria-label="Question ' + (i + 1) + '">' + label + '</button>';
      });
      grid.innerHTML = html;
      grid.querySelectorAll('.sheet-cell').forEach(function (c) {
        c.addEventListener('click', function () {
          idx = Number(c.getAttribute('data-i'));
          persistState();
          paintQuestion();
        });
      });
    }

    /* --- navigation --- */
    function go(delta) {
      var next = idx + delta;
      if (next < 0) return;
      if (next >= questions.length) {
        if (mode === 'exam') confirmSubmit();
        return;
      }
      idx = next;
      persistState();
      paintQuestion();
      var card = el.querySelector('#qCard');
      if (card) card.classList.add(delta > 0 ? 'swipe-left' : 'swipe-right');
    }

    el.querySelector('#btnPrev').addEventListener('click', function () { go(-1); });
    el.querySelector('#btnNext').addEventListener('click', function () { go(1); });
    el.querySelector('#btnFlag').addEventListener('click', function () {
      var q = questions[idx];
      flags[q.id] = !flags[q.id];
      persistState();
      paintQuestion();
    });

    var submitBtn = el.querySelector('#btnSubmit');
    if (submitBtn) submitBtn.addEventListener('click', confirmSubmit);

    function confirmSubmit() {
      var missing = questions.filter(function (q) {
        var a = answers[q.id];
        return a === undefined || a === null || a === '';
      }).length;
      var msg = missing > 0
        ? 'You have ' + missing + ' unanswered question' + (missing > 1 ? 's' : '') + '. Submit anyway?'
        : 'Submit your answers?';
      ui.confirmModal('Submit?', msg, function () { finish(false); });
    }

    /* --- swipe + keyboard --- */
    var touchX = null;
    el.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      var target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON')) return;
      if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    }, { passive: true });

    function keyHandler(e) {
      if (finished) { document.removeEventListener('keydown', keyHandler); return; }
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (/^[1-9]$/.test(e.key)) {
        var q = questions[idx];
        if (q && (q.type === 'mcq' || q.type === 'matching' || q.type === 'picture-mcq')) {
          var i = Number(e.key) - 1;
          if (i < (q.options || []).length && !(mode === 'instant' && checked[q.id])) {
            answers[q.id] = i;
            persistState();
            if (mode === 'instant') gradeInstant(q); else paintQuestion();
          }
        }
      }
    }
    document.addEventListener('keydown', keyHandler);

    /* --- finish & results --- */
    function finish(auto) {
      if (finished) return;
      finished = true;
      window.APP.audio.stop();
      if (timer) { timer.stop(); timer.clearSaved(); }
      if (opts.stateKey) storage.remove('session:' + opts.stateKey);
      document.removeEventListener('keydown', keyHandler);

      var summary = scoring.scoreQuestions(questions, answers);
      summary.parts = scoring.byPart(summary.results);
      summary.timeSpent = Math.round((Date.now() - startedAt) / 1000);
      summary.auto = !!auto;
      scoring.recordMistakes(summary.results, { skill: opts.skill, label: opts.sourceLabel || 'practice' });

      paintResults(summary);
      if (opts.onResult) opts.onResult(summary);
    }

    function paintResults(summary) {
      var scale = scoring.scaleEstimate(summary.pct);
      var pass = scale >= scoring.PASS_SCALE;
      var html = '<div class="card score-hero ' + (pass ? 'pass' : 'fail') + '">'
        + '<div class="score-big">' + summary.correct + '/' + summary.max + '</div>'
        + '<div>' + summary.pct + '% · estimated Cambridge Scale <strong>' + scale + '</strong> '
        + (pass ? '<span class="chip success">on track to pass</span>' : '<span class="chip danger">below pass line (140)</span>') + '</div>'
        + '<div class="small muted">' + summary.answered + ' answered · time ' + window.APP.timer.format(summary.timeSpent) + '</div>'
        + '</div>';

      if (summary.parts.length > 1) {
        html += '<table class="part-breakdown"><thead><tr><th>Part</th><th>Score</th><th>%</th></tr></thead><tbody>';
        summary.parts.forEach(function (p) {
          var pp = p.max ? Math.round((p.correct / p.max) * 100) : 0;
          html += '<tr><td>Part ' + p.part + '</td><td>' + p.correct + '/' + p.max + '</td><td>' + pp + '%</td></tr>';
        });
        html += '</tbody></table>';
      }

      html += '<div class="row-wrap" style="margin:14px 0">'
        + '<button class="btn" id="btnRetry">Try again</button>'
        + '<button class="btn ghost" id="btnBack">' + (opts.onExit ? 'Back' : 'Back to ' + SKILL_META[opts.skill].name) + '</button>'
        + '<a class="btn ghost" href="#/review">Review mistakes</a>'
        + '</div>';

      html += '<h2 class="section-title">Question review</h2>';
      summary.results.forEach(function (r, i) {
        var q = r.q;
        var cls = r.correct === true ? 'correct' : (r.unanswered ? 'unanswered' : 'incorrect');
        html += '<div class="review-item ' + cls + '">'
          + '<div class="q-meta"><span class="q-num">' + (i + 1) + '</span>'
          + (q.part ? '<span class="chip">Part ' + q.part + '</span>' : '')
          + '<span class="chip ' + (r.correct ? 'success' : 'danger') + '">' + (r.correct ? '✓ correct' : (r.unanswered ? '— skipped' : '✗ wrong')) + '</span></div>';
        if (q.context) html += '<div class="q-context small">' + ui.esc(q.context) + '</div>';
        if (q.stem) html += '<p class="mb0"><strong>' + ui.esc(q.stem) + '</strong></p>';
        html += '<div class="small" style="margin-top:6px">Your answer: <strong>' + ui.esc(formatGiven(q, r.given)) + '</strong>'
          + (r.correct ? '' : ' · Correct: <strong style="color:var(--c-success)">' + ui.esc(r.correctAnswer) + '</strong>') + '</div>';
        if (q.explanation) html += '<div class="small muted" style="margin-top:4px">' + ui.rich(q.explanation) + '</div>';
        var au = audioFor(q);
        if (au && au.lines) {
          html += '<details style="margin-top:6px"><summary class="small" style="cursor:pointer">Transcript</summary><div class="transcript-box">'
            + au.lines.map(function (l) {
              return typeof l === 'string' ? ui.esc(l) : '<span class="sp">' + ui.esc(l.speaker || '') + ':</span> ' + ui.esc(l.text);
            }).join('<br>') + '</div></details>';
        }
        html += '</div>';
      });

      el.innerHTML = html;

      el.querySelector('#btnRetry').addEventListener('click', function () {
        answers = {}; flags = {}; checked = {}; idx = 0; finished = false; startedAt = Date.now();
        el.innerHTML = shell();
        wireShell();
        if (timer) { /* fresh timer on retry */ }
        paintQuestion();
      });
      el.querySelector('#btnBack').addEventListener('click', function () {
        if (opts.onExit) opts.onExit(); else renderSkill(el, opts.skill);
      });
    }

    function wireShell() {
      el.querySelector('#sessExit').addEventListener('click', function () {
        window.APP.audio.stop();
        if (opts.onExit) opts.onExit(); else renderSkill(el, opts.skill);
      });
      el.querySelector('#btnPrev').addEventListener('click', function () { go(-1); });
      el.querySelector('#btnNext').addEventListener('click', function () { go(1); });
      el.querySelector('#btnFlag').addEventListener('click', function () {
        var q = questions[idx];
        flags[q.id] = !flags[q.id];
        persistState();
        paintQuestion();
      });
      var sb = el.querySelector('#btnSubmit');
      if (sb) sb.addEventListener('click', confirmSubmit);
    }

    function formatGiven(q, given) {
      if (given === undefined || given === null || given === '') return '(none)';
      if (q.type === 'mcq' || q.type === 'matching' || q.type === 'picture-mcq') {
        var i = Number(given);
        return String.fromCharCode(65 + i) + (q.options && q.options[i] !== undefined ? ' — ' + q.options[i] : '');
      }
      return String(given);
    }

    paintQuestion();
  }

  /* ================= writing ================= */

  function renderWritingLanding(el) {
    deps();
    el.innerHTML = '<div class="loading-state">Loading writing tasks…</div>';
    data.loadPractice('writing').then(function (bank) {
      var tasks = bank.tasks || bank.questions || [];
      var html = '<p><a href="#/practice" class="small">← Practice</a></p>'
        + '<h1 class="page-title">✍️ Writing</h1>'
        + '<p class="page-sub">Part 1 is always an email (about 100 words). In Part 2 you choose an article or a story (about 100 words). Write, check the rubric, then compare with the model answer.</p>';
      if (!tasks.length) {
        html += '<div class="empty-state">No writing tasks yet.</div>';
        el.innerHTML = html;
        return;
      }
      html += '<div class="grid grid-cards">';
      tasks.forEach(function (t, i) {
        html += '<a class="card clickable" href="#/practice/writing/' + i + '" style="text-decoration:none;color:inherit">'
          + '<div class="card-header"><h3 class="mb0">' + ui.esc(t.title || 'Task ' + (i + 1)) + '</h3>'
          + '<span class="chip ' + (t.part === 1 ? 'primary' : 'accent') + '">Part ' + (t.part || '?') + '</span></div>'
          + '<p class="card-sub mb0">' + ui.esc(t.type || 'task') + ' · ~' + (t.words || 100) + ' words</p></a>';
      });
      html += '</div>';
      el.innerHTML = html;
    }).catch(function (err) {
      el.innerHTML = '<div class="empty-state">Could not load writing tasks: ' + ui.esc(err.message) + '</div>';
    });
  }

  function renderWritingTask(el, idxStr) {
    deps();
    data.loadPractice('writing').then(function (bank) {
      var tasks = bank.tasks || bank.questions || [];
      var task = tasks[Number(idxStr)];
      if (!task) { el.innerHTML = '<div class="empty-state">Task not found. <a href="#/practice/writing">Back</a></div>'; return; }
      runWritingTask(el, task, function () {
        var p = storage.getProgress();
        p.lastActivity = { route: '#/practice/writing/' + idxStr, title: 'Writing: ' + (task.title || 'task'), ts: Date.now() };
        storage.setProgress(p);
        storage.touchStudy(10);
      });
    }).catch(function (err) {
      el.innerHTML = '<div class="empty-state">Could not load task: ' + ui.esc(err.message) + '</div>';
    });
  }

  /* Shared by practice + mock exams */
  function runWritingTask(el, task, onDone) {
    var draftKey = 'draft:' + task.id;
    var draft = storage.get(draftKey, '');
    var target = task.words || 100;

    var html = '<p><a href="#/practice/writing" class="small">← Writing tasks</a></p>'
      + '<h1 class="page-title">' + ui.esc(task.title || 'Writing task') + '</h1>'
      + '<div class="writing-task">'
      + '<div class="row-wrap">'
      + '<span class="chip ' + (task.part === 1 ? 'primary' : 'accent') + '">Part ' + (task.part || '?') + '</span>'
      + '<span class="chip">' + ui.esc(task.type || 'task') + '</span>'
      + '<span class="chip">about ' + target + ' words</span>'
      + '</div>';
    if (task.rubric) html += '<p class="lesson-body">' + ui.rich(task.rubric) + '</p>';
    if (task.inputText) {
      html += '<div class="q-context"><strong>Read this ' + (task.part === 1 ? 'email' : 'text') + ':</strong><br><br>' + ui.esc(task.inputText) + '</div>';
    }
    if (Array.isArray(task.points) && task.points.length) {
      html += '<p class="mb0"><strong>Content points — cover all ' + task.points.length + ':</strong></p><ul class="keypoint-list">';
      task.points.forEach(function (pt) { html += '<li>' + ui.esc(pt) + '</li>'; });
      html += '</ul>';
    }
    html += '<label class="field" for="writingArea"><span>Your answer</span></label>'
      + '<textarea id="writingArea" class="writing-input" placeholder="Write your answer here…">' + ui.esc(draft) + '</textarea>'
      + '<div class="word-count" id="wc"></div>'
      + '<div class="row-wrap" style="margin-top:12px">'
      + '<button class="btn" id="btnModel">Show model answer</button>'
      + '<button class="btn ghost" id="btnClearDraft">Clear draft</button>'
      + '</div>'
      + '<div id="modelSlot"></div>'
      + '<div id="checkSlot" style="margin-top:14px"></div>'
      + '</div>';

    el.innerHTML = html;

    var ta = el.querySelector('#writingArea');
    var wc = el.querySelector('#wc');

    function countWords() {
      var t = ta.value.trim();
      return t ? t.split(/\s+/).length : 0;
    }

    function updateCount() {
      var n = countWords();
      wc.textContent = n + ' words (target ~' + target + ')';
      wc.className = 'word-count' + (n >= target * 0.8 && n <= target * 1.3 ? ' ok' : (n > target * 1.3 ? ' over' : ''));
    }

    ta.addEventListener('input', function () {
      storage.set(draftKey, ta.value);
      updateCount();
    });
    ta.addEventListener('focus', function () {
      // keep caret visible with virtual keyboards
      window.setTimeout(function () { ta.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 250);
    });
    updateCount();

    el.querySelector('#btnClearDraft').addEventListener('click', function () {
      ui.confirmModal('Clear draft?', 'Your saved draft for this task will be deleted.', function () {
        ta.value = '';
        storage.remove(draftKey);
        updateCount();
      });
    });

    el.querySelector('#btnModel').addEventListener('click', function () {
      var slot = el.querySelector('#modelSlot');
      if (slot.innerHTML) { slot.innerHTML = ''; return; }
      var m = '<div class="card" style="margin-top:14px;border-color:var(--c-success)"><h3>Model answer</h3>';
      if (task.model) m += '<div class="lesson-body">' + ui.rich(task.model) + '</div>';
      if (task.modelZh && storage.getSettings().showZh !== false) m += '<div class="muted small">' + ui.esc(task.modelZh) + '</div>';
      if (task.modelNotes) m += '<div class="tip-box">💡 <div>' + ui.rich(task.modelNotes) + '</div></div>';
      m += '</div>';
      slot.innerHTML = m;
    });

    // rubric checklist
    var checklist = Array.isArray(task.checklist) && task.checklist.length ? task.checklist : [
      'All content points are covered',
      'The organisation is clear (paragraphs / linking words)',
      'Vocabulary is appropriate for the topic',
      'Grammar is mostly accurate (B1 level)',
      'The length is about ' + target + ' words'
    ];
    var cs = el.querySelector('#checkSlot');
    var chtml = '<div class="card"><h3>Self-check</h3><ul class="checklist">';
    checklist.forEach(function (c, i) {
      chtml += '<li><input type="checkbox" id="ck' + i + '"><label for="ck' + i + '">' + ui.esc(c) + '</label></li>';
    });
    chtml += '</ul><button class="btn success" id="btnDone">Mark task complete</button>'
      + ' <span class="small muted" id="doneNote"></span></div>';
    cs.innerHTML = chtml;

    cs.querySelector('#btnDone').addEventListener('click', function () {
      var n = countWords();
      if (n < 20) { ui.toast('Write your answer first (at least a few sentences).', 'error'); return; }
      var boxes = cs.querySelectorAll('input[type=checkbox]');
      var ticks = 0;
      boxes.forEach(function (b) { if (b.checked) ticks++; });
      var pct = Math.round((ticks / boxes.length) * 100);
      if (onDone) onDone({ words: n, checklistPct: pct });
      ui.toast('Task recorded — nice work! (' + pct + '% checklist)', 'success');
      cs.querySelector('#doneNote').textContent = 'Recorded ✓';
    });
  }

  /* ================= speaking ================= */

  function renderSpeakingLanding(el) {
    deps();
    data.loadPractice('speaking').then(function (bank) {
      var parts = bank.parts || [];
      var html = '<p><a href="#/practice" class="small">← Practice</a></p>'
        + '<h1 class="page-title">🗣️ Speaking</h1>'
        + '<p class="page-sub">The Speaking paper has 4 parts and takes 10–12 minutes with another candidate. Work through each part below: read the prompts, use the timer, and practise the useful language out loud.</p>';
      if (!parts.length) {
        html += '<div class="empty-state">No speaking prompts yet.</div>';
        el.innerHTML = html;
        return;
      }
      parts.forEach(function (pt) {
        html += '<div class="card" style="margin-bottom:14px">'
          + '<h3>Part ' + pt.part + ' — ' + ui.esc(pt.name || '') + '</h3>'
          + '<p class="card-sub">' + ui.esc(pt.desc || '') + (pt.time ? ' · about ' + pt.time : '') + '</p>';
        if (pt.useful && pt.useful.length) {
          html += '<details><summary class="small" style="cursor:pointer;font-weight:600">Useful language</summary><ul class="keypoint-list">';
          pt.useful.forEach(function (u) { html += '<li>' + ui.rich(u) + '</li>'; });
          html += '</ul></details>';
        }
        (pt.prompts || []).forEach(function (pr, i) {
          html += '<div class="card" style="background:var(--c-surface-2);box-shadow:none;margin-top:10px">'
            + '<div class="row-wrap"><strong>Prompt ' + (i + 1) + '</strong>'
            + '<button class="btn ghost small speak-prompt" data-text="' + ui.escAttr(pr.q || pr) + '">🔊 Listen</button>'
            + '<button class="btn small timer-prompt" data-sec="' + (pr.prep || 30) + '">⏱ ' + (pr.prep || 30) + 's timer</button></div>'
            + '<p class="mb0">' + ui.esc(typeof pr === 'string' ? pr : pr.q) + '</p>'
            + (pr.followUps ? '<p class="small muted mb0">Follow-ups: ' + ui.esc(pr.followUps) + '</p>' : '')
            + '<div class="timer-slot small muted"></div>'
            + '</div>';
        });
        html += '</div>';
      });
      el.innerHTML = html;

      el.querySelectorAll('.speak-prompt').forEach(function (b) {
        b.addEventListener('click', function () { window.APP.audio.speak(b.getAttribute('data-text')); });
      });
      el.querySelectorAll('.timer-prompt').forEach(function (b) {
        b.addEventListener('click', function () {
          var slot = b.closest('.card').querySelector('.timer-slot');
          var secs = Number(b.getAttribute('data-sec')) || 30;
          var t = window.APP.timer.create({
            seconds: secs,
            onTick: function (rem) { slot.textContent = '⏱ ' + window.APP.timer.format(rem); },
            onExpire: function () { slot.textContent = '⏱ Time! Well done.'; }
          });
          t.start();
        });
      });
    }).catch(function (err) {
      el.innerHTML = '<div class="empty-state">Could not load speaking prompts: ' + ui.esc(err.message) + '</div>';
    });
  }

  window.APP = window.APP || {};
  window.APP.pages = window.APP.pages || {};
  window.APP.pages.practice = {
    renderLanding: renderLanding,
    renderSkill: renderSkill,
    renderWritingTask: renderWritingTask,
    runWritingTask: runWritingTask,
    startQuestionSession: startQuestionSession,
    partLabel: partLabel
  };
})();
