#!/usr/bin/env node
/* ==========================================================================
   validate.js - content QA for the PET Trainer data files.
   Usage: node tools/validate.js
   Checks: JSON validity, manifest consistency, question schemas,
   global ID uniqueness, explanation presence, refScript resolution.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');

let errors = [];
let warnings = [];

function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

function readJSON(rel) {
  const p = path.join(DATA, rel);
  if (!fs.existsSync(p)) { err('missing file: ' + rel); return null; }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    err('invalid JSON in ' + rel + ': ' + e.message);
    return null;
  }
}

const seenIds = new Map(); // id -> file
function claimId(id, where) {
  if (!id) return;
  if (seenIds.has(id)) {
    err('duplicate id "' + id + '" in ' + where + ' (first seen in ' + seenIds.get(id) + ')');
  } else {
    seenIds.set(id, where);
  }
}

function checkQuestion(q, where) {
  if (!q || typeof q !== 'object') { err('non-object question in ' + where); return; }
  if (!q.id) { err('question without id in ' + where); return; }
  claimId(q.id, where);
  if (!q.type) err('question missing type: ' + q.id);
  if (!q.explanation) err('question missing explanation: ' + q.id);
  if (q.type === 'mcq' || q.type === 'picture-mcq' || q.type === 'matching') {
    if (!Array.isArray(q.options) || q.options.length < 2) err('bad options: ' + q.id);
    if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= (q.options || []).length) {
      err('answer index out of range: ' + q.id);
    }
  } else if (q.type === 'cloze') {
    if (typeof q.answer !== 'string' || !q.answer.trim()) err('cloze needs string answer: ' + q.id);
  }
}

function checkQuestionList(list, where) {
  if (!Array.isArray(list)) { err('questions must be an array in ' + where); return; }
  list.forEach(function (q) { checkQuestion(q, where); });
}

/* ---------- master manifest ---------- */
const manifest = readJSON('manifest.json');
if (!manifest) {
  console.error(errors.join('\n'));
  process.exit(1);
}
if (!manifest.version) err('manifest.json missing version');
if (!Array.isArray(manifest.knowledge)) err('manifest.json: knowledge must be an array');
if (!Array.isArray(manifest.practice)) err('manifest.json: practice must be an array');
if (!Array.isArray(manifest.mocks)) err('manifest.json: mocks must be an array');
if (!Array.isArray(manifest.summaries)) warn('manifest.json: summaries missing (optional)');

/* ---------- knowledge ---------- */
(manifest.knowledge || []).forEach(function (meta) {
  if (!meta.id || !meta.file || !meta.type) { err('bad knowledge entry: ' + JSON.stringify(meta)); return; }
  claimId(meta.id, 'manifest.json (knowledge)');
  const unit = readJSON(meta.file);
  if (!unit) return;
  if (unit.id !== meta.id) err('knowledge id mismatch: manifest ' + meta.id + ' vs file ' + unit.id);
  if (!unit.title) err('knowledge unit missing title: ' + meta.file);
  const hasSections = Array.isArray(unit.sections);
  const hasItems = Array.isArray(unit.items);
  if (!hasSections && !hasItems) err('knowledge unit needs sections or items: ' + meta.file);
  if (hasItems) {
    unit.items.forEach(function (it) {
      if (!it.id) { err('item without id in ' + meta.file); return; }
      claimId(it.id, meta.file);
    });
  }
});

/* knowledge sub-manifest (optional) */
if (fs.existsSync(path.join(DATA, 'knowledge', 'manifest.json'))) {
  const sub = readJSON('knowledge/manifest.json');
  if (sub && Array.isArray(sub.groups)) {
    const known = new Set((manifest.knowledge || []).map(function (m) { return m.id; }));
    sub.groups.forEach(function (g) {
      (g.order || []).forEach(function (id) {
        if (!known.has(id)) warn('knowledge/manifest.json references unknown unit: ' + id);
      });
    });
  }
}

/* ---------- practice ---------- */
(manifest.practice || []).forEach(function (file) {
  const bank = readJSON(file);
  if (!bank) return;
  if (Array.isArray(bank.questions)) checkQuestionList(bank.questions, file);
  if (Array.isArray(bank.tasks)) {
    bank.tasks.forEach(function (t) {
      if (!t.id) { err('writing task without id in ' + file); return; }
      claimId(t.id, file);
      if (!t.rubric) warn('writing task without rubric: ' + t.id);
    });
  }
  if (Array.isArray(bank.parts)) {
    bank.parts.forEach(function (p) {
      if (!p.part) warn('speaking part without number in ' + file);
    });
  }
  if (bank.scripts && typeof bank.scripts === 'object') {
    Object.keys(bank.scripts).forEach(function (k) {
      if (!Array.isArray(bank.scripts[k])) err('script must be an array: ' + file + ':' + k);
    });
  }
});

/* ---------- mocks ---------- */
(manifest.mocks || []).forEach(function (file) {
  const mock = readJSON(file);
  if (!mock) return;
  if (!mock.id) err('mock missing id: ' + file);
  if (!mock.sections || typeof mock.sections !== 'object') { err('mock missing sections: ' + file); return; }
  if (!mock.timings) warn('mock missing timings: ' + file);
  ['reading', 'listening'].forEach(function (sk) {
    const sec = mock.sections[sk];
    if (sec && sec.questions) checkQuestionList(sec.questions, file + ':' + sk);
  });
  const lis = mock.sections.listening;
  if (lis && Array.isArray(lis.questions)) {
    lis.questions.forEach(function (q) {
      if (q.refScript && (!lis.scripts || !lis.scripts[q.refScript])) {
        err('unresolved refScript ' + q.refScript + ' in ' + file);
      }
      if (!q.refScript && !q.lines && !q.audio) {
        warn('listening question has no audio source: ' + q.id);
      }
    });
  }
  const wr = mock.sections.writing;
  if (wr && Array.isArray(wr.tasks)) {
    wr.tasks.forEach(function (t) {
      if (!t.id) err('mock writing task without id: ' + file);
      else claimId(t.id, file);
    });
  }
});

/* ---------- summaries ---------- */
(manifest.summaries || []).forEach(function (file) {
  const s = readJSON(file);
  if (!s) return;
  if (!s.title) err('summary missing title: ' + file);
  if (!Array.isArray(s.blocks)) err('summary missing blocks: ' + file);
});

/* ---------- report ---------- */
console.log('Checked ' + seenIds.size + ' unique IDs.');
if (warnings.length) {
  console.log('\nWARNINGS (' + warnings.length + '):');
  warnings.forEach(function (w) { console.log('  - ' + w); });
}
if (errors.length) {
  console.log('\nERRORS (' + errors.length + '):');
  errors.forEach(function (e) { console.log('  - ' + e); });
  process.exit(1);
}
console.log('All content checks passed.');
