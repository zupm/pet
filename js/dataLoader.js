/* ==========================================================================
   dataLoader.js - loads & caches all JSON content.
   - Primary transport: fetch() (HTTP serving)
   - Fallback for file:// : mirrored .js registry files that live next to
     each JSON file (one .js per .json) and register content on PET_DATA
   - Version-aware localStorage cache (manifest.version drives invalidation)
   - Light schema validation; invalid items are logged and skipped
   ========================================================================== */
(function () {
  'use strict';

  var DATA_ROOT = 'data/';
  var memory = {};           // path -> parsed JSON
  var pending = {};          // path -> Promise
  var masterManifest = null;
  var scriptRegistry = null; // window.PET_DATA lazily

  function isFileProtocol() {
    return window.location.protocol === 'file:';
  }

  function storage() { return window.APP && window.APP.storage; }

  /* ---------- cache ---------- */

  function cacheVersion() {
    var s = storage();
    var meta = s ? s.getCacheMeta() : null;
    return meta ? meta.version : null;
  }

  function cacheBump(version) {
    var s = storage();
    if (!s) return;
    if (cacheVersion() !== version) {
      // version changed: drop all cached file contents
      var meta = s.getCacheMeta() || { version: null, files: {} };
      Object.keys(meta.files || {}).forEach(function (p) { s.remove('cache:' + p); });
    }
    s.setCacheMeta({ version: version, files: meta.files || {} });
  }

  function cacheGet(path) {
    var s = storage();
    if (!s) return null;
    var meta = s.getCacheMeta();
    if (!meta || !meta.files || !meta.files[path]) return null;
    return s.get('cache:' + path, null);
  }

  function cacheSet(path, value) {
    var s = storage();
    if (!s) return;
    try {
      s.set('cache:' + path, value);
      var meta = s.getCacheMeta() || { version: null, files: {} };
      meta.files[path] = true;
      s.setCacheMeta(meta);
    } catch (e) { /* cache is best-effort */ }
  }

  /* ---------- mirror (.js) fallback ---------- */

  function mirrorPath(jsonPath) {
    return DATA_ROOT + jsonPath.replace(/\.json$/, '.js');
  }

  function loadMirror(jsonPath) {
    return new Promise(function (resolve, reject) {
      window.PET_DATA = window.PET_DATA || {};
      if (window.PET_DATA[jsonPath]) { resolve(window.PET_DATA[jsonPath]); return; }
      var script = document.createElement('script');
      script.src = mirrorPath(jsonPath);
      script.onload = function () {
        if (window.PET_DATA && window.PET_DATA[jsonPath]) resolve(window.PET_DATA[jsonPath]);
        else reject(new Error('Mirror loaded but no data registered: ' + jsonPath));
      };
      script.onerror = function () {
        reject(new Error('Data file unavailable (fetch and mirror both failed): ' + jsonPath));
      };
      document.head.appendChild(script);
    });
  }

  /* ---------- core load ---------- */

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return res.json();
    });
  }

  function loadJSON(jsonPath) {
    // jsonPath is relative to data/
    if (memory[jsonPath]) return Promise.resolve(memory[jsonPath]);
    if (pending[jsonPath]) return pending[jsonPath];

    var cached = cacheGet(jsonPath);
    if (cached !== null) {
      memory[jsonPath] = cached;
      return Promise.resolve(cached);
    }

    var url = DATA_ROOT + jsonPath;
    var p;
    if (isFileProtocol()) {
      p = loadMirror(jsonPath);
    } else {
      p = fetchJSON(url).catch(function () {
        // fetch failed (offline/blocked): try mirror too
        return loadMirror(jsonPath);
      });
    }

    pending[jsonPath] = p.then(function (data) {
      memory[jsonPath] = data;
      delete pending[jsonPath];
      if (!isFileProtocol()) cacheSet(jsonPath, data);
      return data;
    }).catch(function (err) {
      delete pending[jsonPath];
      console.error('[dataLoader]', err.message);
      throw err;
    });

    return pending[jsonPath];
  }

  /* ---------- validation ---------- */

  function validate(kind, obj, path) {
    // returns { ok, errors[] } ; callers skip invalid items rather than crash
    var errors = [];
    function need(cond, msg) { if (!cond) errors.push(msg); }

    if (!obj || typeof obj !== 'object') return { ok: false, errors: ['not an object'] };

    if (kind === 'knowledge-unit') {
      need(typeof obj.id === 'string', 'missing id');
      need(typeof obj.title === 'string', 'missing title');
      need(Array.isArray(obj.sections), 'sections must be an array');
    } else if (kind === 'question-list') {
      need(Array.isArray(obj.questions), 'questions must be an array');
    } else if (kind === 'mock') {
      need(typeof obj.id === 'string', 'missing id');
      need(obj.sections && typeof obj.sections === 'object', 'missing sections');
    } else if (kind === 'vocab') {
      need(Array.isArray(obj.items), 'items must be an array');
    }

    if (errors.length) {
      console.warn('[dataLoader] schema errors in ' + path + ':', errors.join('; '));
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function filterQuestions(questions, path) {
    // keep valid questions; every question must have explanation
    var seen = {};
    var out = [];
    (questions || []).forEach(function (q) {
      if (!q || typeof q !== 'object') return;
      if (!q.id) { console.warn('[dataLoader] question without id skipped in ' + path); return; }
      if (seen[q.id]) { console.warn('[dataLoader] duplicate question id skipped: ' + q.id); return; }
      if (!q.explanation) {
        console.warn('[dataLoader] question missing explanation: ' + q.id + ' (' + path + ')');
      }
      seen[q.id] = true;
      out.push(q);
    });
    return out;
  }

  /* ---------- public API ---------- */

  var api = {
    /* Load master manifest; call once at boot */
    init: function () {
      return loadJSON('manifest.json').then(function (m) {
        masterManifest = m;
        if (m && m.version) cacheBump(m.version);
        return m;
      });
    },

    manifest: function () { return masterManifest; },

    version: function () { return masterManifest ? masterManifest.version : '?'; },

    load: loadJSON,

    /* knowledge: merged list of {meta, unit} from master manifest */
    loadKnowledgeUnit: function (meta) {
      return loadJSON(meta.file).then(function (unit) {
        var v = validate('knowledge-unit', unit, meta.file);
        if (!v.ok) {
          // still return if minimally usable; page renders defensively
          unit = unit || {};
          if (!unit.id) unit.id = meta.id;
          if (!unit.title) unit.title = meta.title || meta.id;
          if (!Array.isArray(unit.sections)) unit.sections = [];
        }
        return unit;
      });
    },

    knowledgeEntries: function () {
      return (masterManifest && masterManifest.knowledge) || [];
    },

    /* practice bank for a skill: reading/writing/listening/speaking */
    loadPractice: function (skill) {
      var files = (masterManifest && masterManifest.practice) || [];
      var file = null;
      files.forEach(function (f) {
        if (f.indexOf(skill + '.json') !== -1) file = f;
      });
      if (!file) return Promise.resolve({ skill: skill, questions: [], tasks: [] });
      return loadJSON(file).then(function (bank) {
        if (bank.questions) bank.questions = filterQuestions(bank.questions, file);
        return bank;
      });
    },

    /* list of mock metas from master manifest */
    mockEntries: function () {
      var files = (masterManifest && masterManifest.mocks) || [];
      return files.map(function (f) {
        var m = f.match(/mock-(\d+)/);
        return { file: f, num: m ? Number(m[1]) : 0, id: 'mock-' + (m ? m[1] : 'x') };
      }).sort(function (a, b) { return a.num - b.num; });
    },

    loadMock: function (file) {
      return loadJSON(file).then(function (mock) {
        var v = validate('mock', mock, file);
        if (!v.ok) mock = mock || {};
        // sanitize question lists per section
        Object.keys(mock.sections || {}).forEach(function (sk) {
          var sec = mock.sections[sk];
          if (sec && sec.questions) sec.questions = filterQuestions(sec.questions, file + ':' + sk);
        });
        return mock;
      });
    },

    loadSummaries: function () {
      var files = (masterManifest && masterManifest.summaries) || [];
      return Promise.all(files.map(function (f) {
        return loadJSON(f).catch(function () {
          console.warn('[dataLoader] summary unavailable: ' + f);
          return null;
        });
      })).then(function (list) { return list.filter(Boolean); });
    }
  };

  window.APP = window.APP || {};
  window.APP.data = api;
})();
