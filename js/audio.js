/* ==========================================================================
   audio.js - audio controller for Listening tasks.
   Primary: HTMLAudioElement with local assets/audio/*.mp3 files.
   Fallback: Web Speech API (speechSynthesis) reads the transcript lines,
   so Listening stays fully functional even before MP3s are recorded.
   ========================================================================== */
(function () {
  'use strict';

  var currentAudio = null;   // HTMLAudioElement in use
  var speaking = false;
  var listeners = [];

  function emit(state, detail) {
    listeners.forEach(function (fn) {
      try { fn(state, detail); } catch (e) { /* listener error ignored */ }
    });
  }

  function settings() {
    return window.APP.storage ? window.APP.storage.getSettings() : { voiceRate: 1 };
  }

  function hasSpeech() {
    return 'speechSynthesis' in window;
  }

  function pickVoice() {
    if (!hasSpeech()) return null;
    var voices = window.speechSynthesis.getVoices() || [];
    var en = voices.filter(function (v) { return /^en/i.test(v.lang); });
    var preferred = en.filter(function (v) { return /GB/i.test(v.lang); });
    return preferred[0] || en[0] || voices[0] || null;
  }

  /* Speak transcript lines sequentially.
     lines: [{ speaker, text }] or [string] */
  function speakLines(lines, onDone) {
    if (!hasSpeech() || !lines || !lines.length) {
      if (onDone) onDone();
      return;
    }
    stopAll();
    speaking = true;
    emit('start', { mode: 'speech' });

    var rate = settings().voiceRate || 1;
    var idx = 0;

    function next() {
      if (idx >= lines.length || !speaking) {
        if (speaking) {
          speaking = false;
          emit('end', { mode: 'speech' });
          if (onDone) onDone();
        }
        return;
      }
      var line = lines[idx++];
      var text = typeof line === 'string' ? line : line.text;
      if (!text) { next(); return; }
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-GB';
      var voice = pickVoice();
      if (voice) u.voice = voice;
      u.rate = rate;
      u.onend = next;
      u.onerror = next;
      window.speechSynthesis.speak(u);
    }

    next();
  }

  /* Play a question's audio.
     item: { src: 'assets/audio/x.mp3' (optional), lines: [...] (fallback) } */
  function play(item, onDone) {
    stopAll();
    if (item && item.src) {
      var a = new Audio(item.src);
      currentAudio = a;
      emit('start', { mode: 'audio', src: item.src });
      a.addEventListener('ended', function () {
        currentAudio = null;
        emit('end', { mode: 'audio' });
        if (onDone) onDone();
      });
      a.addEventListener('error', function () {
        currentAudio = null;
        // graceful fallback to speech synthesis
        if (item.lines && item.lines.length) {
          speakLines(item.lines, onDone);
        } else {
          emit('error', { src: item.src });
          if (onDone) onDone();
        }
      });
      var p = a.play();
      if (p && p.catch) p.catch(function () { /* fallback handled via error event */ });
    } else if (item && item.lines) {
      speakLines(item.lines, onDone);
    } else {
      emit('error', { reason: 'no-audio-source' });
      if (onDone) onDone();
    }
  }

  function stopAll() {
    if (currentAudio) {
      try { currentAudio.pause(); } catch (e) { /* noop */ }
      currentAudio.src = '';
      currentAudio = null;
    }
    if (hasSpeech()) window.speechSynthesis.cancel();
    if (speaking) {
      speaking = false;
      emit('end', { mode: 'speech' });
    }
  }

  /* Speak a single word/phrase (flashcards, vocab) */
  function speak(text) {
    if (!hasSpeech() || !text) return;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    var voice = pickVoice();
    if (voice) u.voice = voice;
    u.rate = settings().voiceRate || 1;
    window.speechSynthesis.speak(u);
  }

  function onState(fn) { listeners.push(fn); }

  window.APP = window.APP || {};
  window.APP.audio = {
    play: play,
    speakLines: speakLines,
    speak: speak,
    stop: stopAll,
    onState: onState,
    supported: hasSpeech()
  };
})();
