/* ==========================================================================
   storage.js - localStorage manager (all app persistence goes through here)
   Prefix: pet_v1_  |  Schema version: 1
   ========================================================================== */
(function () {
  'use strict';

  var PREFIX = 'pet_v1_';
  var SCHEMA_VERSION = 1;

  function supported() {
    try {
      var k = PREFIX + '__test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  var mem = {}; // in-memory fallback when localStorage is unavailable
  var ok = supported();

  function read(key) {
    var raw = ok ? window.localStorage.getItem(PREFIX + key) : (mem[key] || null);
    if (raw === null || raw === undefined) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[storage] corrupt value for', key, e);
      return null;
    }
  }

  function write(key, value) {
    var raw = JSON.stringify(value);
    if (ok) {
      try {
        window.localStorage.setItem(PREFIX + key, raw);
        return true;
      } catch (e) {
        console.warn('[storage] write failed for', key, e);
        mem[key] = raw;
        return false;
      }
    }
    mem[key] = raw;
    return true;
  }

  var storage = {
    get: function (key, fallback) {
      var v = read(key);
      return v === null ? (fallback === undefined ? null : fallback) : v;
    },
    set: function (key, value) {
      return write(key, value);
    },
    remove: function (key) {
      if (ok) window.localStorage.removeItem(PREFIX + key);
      delete mem[key];
    },
    /* ---- namespaced helpers ---- */
    getProgress: function () {
      return storage.get('progress', {
        schema: SCHEMA_VERSION,
        skills: { reading: {}, writing: {}, listening: {}, speaking: {} },
        lastActivity: null, // { route, title, ts }
        streak: { days: 0, lastDay: null },
        studySecondsByDay: {}, // 'YYYY-MM-DD': seconds
        completedUnits: {}, // knowledgeUnitId: ts
        mockResults: [], // { mockId, skill, score, max, scale, ts }
        practiceResults: [] // { bank, part, score, max, ts, mode }
      });
    },
    setProgress: function (p) { return storage.set('progress', p); },

    getMistakes: function () { return storage.get('mistakes', {}); }, // qid -> record
    setMistakes: function (m) { return storage.set('mistakes', m); },

    getSrs: function () { return storage.get('srs', {}); }, // cardId -> sm2 state
    setSrs: function (s) { return storage.set('srs', s); },

    getExamState: function () { return storage.get('examState', null); },
    setExamState: function (s) { return storage.set('examState', s); },
    clearExamState: function () { storage.remove('examState'); },

    getSettings: function () {
      return storage.get('settings', {
        uiLanguage: 'en', // 'en' | 'zh-en' (show Chinese hints)
        showZh: true,
        autoPlayAudio: true,
        voiceRate: 1
      });
    },
    setSettings: function (s) { return storage.set('settings', s); },

    getCacheMeta: function () { return storage.get('cacheMeta', null); },
    setCacheMeta: function (m) { return storage.set('cacheMeta', m); },

    /* Record a study day for streak + time tracking */
    touchStudy: function (seconds) {
      var p = storage.getProgress();
      var today = new Date();
      var day = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');
      p.studySecondsByDay = p.studySecondsByDay || {};
      p.studySecondsByDay[day] = (p.studySecondsByDay[day] || 0) + (seconds || 1);
      // trim to last 90 days
      var keys = Object.keys(p.studySecondsByDay).sort();
      while (keys.length > 90) { delete p.studySecondsByDay[keys.shift()]; }
      // streak
      var streak = p.streak || { days: 0, lastDay: null };
      if (streak.lastDay !== day) {
        var yest = new Date(today.getTime() - 86400000);
        var yDay = yest.getFullYear() + '-' +
          String(yest.getMonth() + 1).padStart(2, '0') + '-' +
          String(yest.getDate()).padStart(2, '0');
        streak.days = (streak.lastDay === yDay) ? streak.days + 1 : 1;
        streak.lastDay = day;
      }
      p.streak = streak;
      storage.setProgress(p);
    },

    /* Full reset (used by dashboard settings) */
    resetAll: function () {
      if (!ok) { mem = {}; return; }
      var toRemove = [];
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) toRemove.push(k);
      }
      toRemove.forEach(function (k) { window.localStorage.removeItem(k); });
    }
  };

  window.APP = window.APP || {};
  window.APP.storage = storage;
})();
