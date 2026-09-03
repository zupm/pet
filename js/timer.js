/* ==========================================================================
   timer.js - countdown timers for exam sections, with serialize/restore
   for auto-save (state survives refresh).
   ========================================================================== */
(function () {
  'use strict';

  /* Create a countdown timer.
     opts: { seconds, onTick(remainingSeconds), onExpire(), autoSaveKey }
     When autoSaveKey is set, remaining time is persisted to storage so a
     refresh restores the countdown. */
  function create(opts) {
    var total = Math.max(0, opts.seconds | 0);
    var remaining = total;
    var interval = null;
    var lastTickAt = null;
    var expiredFired = false;
    var storage = window.APP.storage;

    // restore persisted time if present
    if (opts.autoSaveKey && storage) {
      var saved = storage.get('timer:' + opts.autoSaveKey, null);
      if (saved && typeof saved.remaining === 'number' && saved.remaining >= 0) {
        remaining = Math.min(total, saved.remaining);
      }
    }

    function persist() {
      if (opts.autoSaveKey && storage) {
        storage.set('timer:' + opts.autoSaveKey, { remaining: remaining, total: total, ts: Date.now() });
      }
    }

    function tick() {
      var now = Date.now();
      var elapsed = lastTickAt ? Math.round((now - lastTickAt) / 1000) : 1;
      lastTickAt = now;
      remaining = Math.max(0, remaining - Math.max(1, elapsed));
      if (opts.onTick) opts.onTick(remaining);
      persist();
      if (remaining <= 0 && !expiredFired) {
        expiredFired = true;
        stop();
        if (opts.onExpire) opts.onExpire();
      }
    }

    function start() {
      if (interval) return;
      lastTickAt = Date.now();
      interval = window.setInterval(tick, 1000);
      if (opts.onTick) opts.onTick(remaining);
    }

    function stop() {
      if (interval) { window.clearInterval(interval); interval = null; }
    }

    return {
      start: start,
      stop: stop,
      pause: stop,
      resume: start,
      remaining: function () { return remaining; },
      total: function () { return total; },
      clearSaved: function () {
        if (opts.autoSaveKey && storage) storage.remove('timer:' + opts.autoSaveKey);
      },
      destroy: function () { stop(); }
    };
  }

  function format(seconds) {
    var s = Math.max(0, seconds | 0);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    function pad(n) { return String(n).padStart(2, '0'); }
    return h > 0 ? h + ':' + pad(m) + ':' + pad(sec) : pad(m) + ':' + pad(sec);
  }

  window.APP = window.APP || {};
  window.APP.timer = { create: create, format: format };
})();
