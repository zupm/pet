# PET English Exam Trainer

A self-contained web app for Cambridge B1 Preliminary (PET) exam preparation —
Reading, Writing, Listening and Speaking. Pure HTML + CSS + vanilla JavaScript;
all teaching content and question banks live in modular JSON files under `data/`.

## Quick start

Serve the folder over HTTP (recommended):

    python3 -m http.server 8000

then open http://localhost:8000

You can also open `index.html` directly from disk (`file://`); the app falls
back to the mirrored `.js` registry files next to each JSON file.

## Features

- Dashboard: progress per skill, streak, study time, continue-where-you-left-off
- Knowledge: 8 grammar units, 6 vocabulary topics, phrases, sentence patterns,
  exam format guide, summaries & cheat sheets — all rendered from JSON
- Practice: per-skill drills (all exam parts), instant-feedback or exam mode
- Mock exams: 6 full timed papers (Reading 32q/45min, Writing 2 tasks/45min,
  Listening 25q/30min, Speaking), auto-save, flagging, answer sheet,
  per-part report with Cambridge Scale estimate (pass: 140+)
- Review: SM-2 spaced repetition flashcards over the whole vocabulary/phrase
  bank plus an automatic mistake notebook
- Stats: score trends (SVG charts), accuracy by exam part, study-time log

## Content files

Everything learner-facing is data. To add or edit content:

1. Edit/add a JSON file under `data/knowledge/`, `data/practice/` or `data/mocks/`
2. Register new files in `data/manifest.json` and bump `version`
3. Validate: `node tools/validate.js`
4. Regenerate file:// mirrors: `node tools/build-mirrors.js`
5. Reload the app — the loader detects the version change and re-fetches

Rules: question IDs are permanent (never rename), every question needs an
`explanation`, JSON must be valid.

## Audio

Listening tasks play `assets/audio/*.mp3` when the files exist; until they are
recorded, the app reads the transcripts aloud with the browser's speech
synthesis, so every listening exercise works out of the box.

## Layout

    index.html          app shell
    css/                theme, components, exam UI
    js/                 router, loader, storage, scoring, timer, audio, pages
    data/               manifest + knowledge / practice / mocks / summaries
    assets/audio/       listening recordings (optional)
    tools/              validate.js, build-mirrors.js
