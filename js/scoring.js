/* ==========================================================================
   scoring.js - answer checking, score calculation, Cambridge Scale
   estimation, mistake notebook, result logging.
   ========================================================================== */
(function () {
  'use strict';

  var PASS_SCALE = 140;

  /* Normalize free-text answers: lowercase, trim, collapse whitespace.
     Trailing sentence punctuation is ignored. */
  function normalize(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.!?;,:]+$/g, '')
      .trim();
  }

  /* Check one question. Returns { correct, correctAnswer, given } */
  function checkAnswer(q, given) {
    if (q === null || typeof q !== 'object') return { correct: false, correctAnswer: '', given: given };

    // writing/speaking are not machine-scored
    if (q.type === 'writing' || q.type === 'speaking') {
      return { correct: null, correctAnswer: null, given: given, manual: true };
    }

    if (given === undefined || given === null || given === '') {
      return { correct: false, correctAnswer: describeAnswer(q), given: given, unanswered: true };
    }

    var correct = false;

    if (q.type === 'mcq' || q.type === 'matching' || q.type === 'picture-mcq') {
      var want = Number(q.answer);
      var got = Number(given);
      correct = !isNaN(want) && want === got;
    } else {
      // open text: cloze / gap-fill / listening completion
      var targets = [q.answer].concat(q.answerAlt || []);
      var normGiven = normalize(given);
      correct = targets.some(function (t) { return normalize(t) === normGiven; });
    }

    return { correct: correct, correctAnswer: describeAnswer(q), given: given };
  }

  /* Human-readable correct answer for feedback */
  function describeAnswer(q) {
    if (q.type === 'mcq' || q.type === 'picture-mcq') {
      var i = Number(q.answer);
      return (q.options && q.options[i] !== undefined) ? q.options[i] : String(i);
    }
    if (q.type === 'matching') {
      var j = Number(q.answer);
      if (q.options && q.options[j] !== undefined) {
        return String.fromCharCode(65 + j) + ' — ' + q.options[j];
      }
      return String.fromCharCode(65 + j);
    }
    var alts = (q.answerAlt || []);
    return alts.length ? q.answer + ' / ' + alts.join(' / ') : String(q.answer);
  }

  /* Score a list of questions given an answers map (qid -> answer) */
  function scoreQuestions(questions, answers) {
    var results = [];
    var correct = 0;
    var answered = 0;
    questions.forEach(function (q) {
      var given = answers ? answers[q.id] : undefined;
      var res = checkAnswer(q, given);
      res.q = q;
      if (given !== undefined && given !== null && given !== '') answered++;
      if (res.correct === true) correct++;
      results.push(res);
    });
    return {
      results: results,
      correct: correct,
      max: questions.length,
      answered: answered,
      pct: questions.length ? Math.round((correct / questions.length) * 100) : 0
    };
  }

  /* Group results by part for breakdown tables */
  function byPart(results) {
    var map = {};
    var order = [];
    results.forEach(function (r) {
      var p = r.q.part !== undefined ? r.q.part : 0;
      if (!map[p]) { map[p] = { part: p, correct: 0, max: 0 }; order.push(p); }
      map[p].max++;
      if (r.correct === true) map[p].correct++;
    });
    return order.map(function (p) { return map[p]; });
  }

  /* Linear estimate of Cambridge Scale score (120-170) from percentage.
     Official conversion is IRT-based; this is a transparent estimate. */
  function scaleEstimate(pct) {
    var clamped = Math.max(0, Math.min(100, pct || 0));
    return Math.round(120 + (clamped / 100) * 50);
  }

  /* ---------- mistake notebook ---------- */

  function recordMistakes(results, source) {
    var st = window.APP.storage;
    var mistakes = st.getMistakes();
    var changed = false;
    results.forEach(function (r) {
      if (r.correct === false && r.q) {
        mistakes[r.q.id] = {
          qid: r.q.id,
          skill: source.skill || 'reading',
          source: source.label || 'practice',
          part: r.q.part,
          stem: (r.q.stem || r.q.context || '').slice(0, 140),
          correctAnswer: describeAnswer(r.q),
          given: r.given === undefined ? '' : String(r.given),
          ts: Date.now()
        };
        changed = true;
      }
      // a later correct answer clears the mistake
      if (r.correct === true && r.q && mistakes[r.q.id]) {
        delete mistakes[r.q.id];
        changed = true;
      }
    });
    if (changed) st.setMistakes(mistakes);
  }

  /* ---------- result logging ---------- */

  function logPracticeResult(record) {
    var st = window.APP.storage;
    var p = st.getProgress();
    p.practiceResults = p.practiceResults || [];
    p.practiceResults.push(record);
    if (p.practiceResults.length > 200) p.practiceResults = p.practiceResults.slice(-200);
    p.lastActivity = { route: record.route || '', title: record.title || '', ts: Date.now() };
    st.setProgress(p);
    st.touchStudy(5);
  }

  function logMockResult(record) {
    var st = window.APP.storage;
    var p = st.getProgress();
    p.mockResults = p.mockResults || [];
    p.mockResults.push(record);
    if (p.mockResults.length > 120) p.mockResults = p.mockResults.slice(-120);
    p.lastActivity = { route: record.route || '', title: record.title || '', ts: Date.now() };
    st.setProgress(p);
    st.touchStudy(10);
  }

  window.APP = window.APP || {};
  window.APP.scoring = {
    PASS_SCALE: PASS_SCALE,
    normalize: normalize,
    checkAnswer: checkAnswer,
    describeAnswer: describeAnswer,
    scoreQuestions: scoreQuestions,
    byPart: byPart,
    scaleEstimate: scaleEstimate,
    recordMistakes: recordMistakes,
    logPracticeResult: logPracticeResult,
    logMockResult: logMockResult
  };
})();
