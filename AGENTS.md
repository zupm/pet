# AGENTS.md
## Project Overview
**PET English Exam Trainer** — a self-contained HTML application for Cambridge B1 Preliminary (PET) exam preparation. The app is a static web app built with **HTML + CSS + vanilla JavaScript**. All knowledge content (grammar, vocabulary, phrases, patterns) and exam question banks are stored in **separate, modular JSON data files** so that content can be updated, corrected, or extended without touching any application code.
Target users: learners preparing for the B1 Preliminary exam (Reading, Writing, Listening, Speaking).
Supported environments: **desktop PC browsers** and **tablets/pads** — the app must be fully usable with mouse + keyboard on desktop and touch gestures on tablet, with layouts adapted to each mode.
---
## Tech Stack & Constraints
- **HTML5 / CSS3 / Vanilla JS (ES6+)**
- Content & questions: **modular JSON files** under `data/` — loaded at runtime via `fetch` (when served over HTTP) with a `file://` fallback via mirrored `.js` registry files if needed
- Audio for Listening via `<audio>` tags with local `assets/audio/` files
- All user progress stored in `localStorage` (no server, no build step, no framework)
- Text encoding: **UTF-8**
- No external dependencies; anything used must be bundled locally
---
## Device & Input Support
The app must work in **two primary modes**:
| Mode | Target | Requirements |
|------|--------|--------------|
| **Desktop** | PC browsers ≥ 1280px | Keyboard navigation, hover states, multi-column layouts, dense information display |
| **Pad** | Tablets (iPad / Android pads), landscape & portrait, 768–1280px | Full touch support (tap targets ≥ 44×44px), no hover-only interactions, on-screen-friendly fonts (≥16px body), swipe navigation between exam questions, virtual-keyboard-safe input for Writing tasks |
Layout rules:
- Breakpoints: `≤ 767px` (phone, best-effort support), `768–1279px` (pad), `≥ 1280px` (desktop)
- Detect touch capability via `matchMedia('(hover: none)')` / `('pointer: coarse')` and set a `touch` class on `<html>` to switch interaction styles
- Exam timer and navigation bar must remain visible in both modes
- Writing textarea must work correctly with mobile/tablet virtual keyboards (no fixed overlays covering the input; auto-scroll to caret)
---
## Data Architecture (JSON Content Files)
**Core principle: content is data, not code.** Editors/content authors can update any JSON file independently — the app reads files dynamically, so no code change or rebuild is required for content updates.
### File layout
```
/
├── index.html                  # Home / dashboard (single-page app shell)
├── AGENTS.md
├── css/
│   ├── main.css               # Theme variables, desktop/pad layout, breakpoints
│   ├── components.css         # Buttons, cards, modals, flashcards, progress bars
│   └── exam.css               # Exam-taking UI (question pager, answer sheet, timer)
├── js/
│   ├── app.js                 # Page router / view manager
│   ├── dataLoader.js          # Loads & caches JSON files, validates schema
│   ├── storage.js             # localStorage progress manager (versioned)
│   ├── scoring.js             # Answer checking & score calculation
│   ├── timer.js               # Countdown per exam section, auto-save
│   ├── audio.js               # Audio player controller
│   └── pages/
│       ├── dashboard.js
│       ├── knowledge.js       # Renders lessons from JSON
│       ├── practice.js
│       ├── mockexam.js
│       ├── review.js          # Flashcards / SRS review
│       └── stats.js
├── data/
│   ├── manifest.json          # Master index of all content files (see below)
│   ├── knowledge/             # ← TEACHING CONTENT, one file per unit
│   │   ├── manifest.json      # List of knowledge units + metadata
│   │   ├── grammar-01-tenses.json
│   │   ├── grammar-02-conditionals.json
│   │   ├── grammar-03-passive.json
│   │   ├── ...
│   │   ├── vocab-education.json
│   │   ├── vocab-travel.json
│   │   ├── ...
│   │   ├── phrases-opinion.json
│   │   ├── phrases-functions.json
│   │   └── patterns-library.json
│   ├── summaries/             # Lesson summaries & cheat sheets (JSON)
│   ├── practice/              # Question banks per skill (JSON)
│   │   ├── reading.json
│   │   ├── writing.json
│   │   ├── listening.json
│   │   └── speaking.json
│   ├── review/               # Review pool definitions (optional, can derive)
│   └── mocks/
│       ├── mock-01.json       # Full mock paper (all sections)
│       ├── mock-02.json
│       └── ... (at least 6)
└── assets/
    ├── audio/                 # MP3 files for listening
    └── images/
```
### `data/manifest.json` — the content index
Every content file is registered here. Adding new content = add the JSON file + add one entry to the manifest. The app never hardcodes content file names.
```json
{
  "version": "1.4.0",
  "knowledge": [
    { "id": "grammar-01", "type": "grammar", "title": "Present Tenses", "file": "knowledge/grammar-01-tenses.json", "level": "B1" },
    { "id": "vocab-education", "type": "vocab", "title": "Education", "file": "knowledge/vocab-education.json", "topic": "education" }
  ],
  "practice": ["practice/reading.json", "practice/writing.json"],
  "mocks": ["mocks/mock-01.json", "mocks/mock-02.json"],
  "summaries": ["summaries/grammar-cheatsheet.json"]
}
```
The loader compares `manifest.json` version with a cached copy in `localStorage` and re-fetches changed files (simple cache invalidation for easy updates).
### Knowledge unit JSON schema
```json
{
  "id": "grammar-01",
  "type": "grammar",
  "title": "Present Simple vs Present Continuous",
  "objective": "Distinguish and correctly use the two present tenses at B1 level",
  "sections": [
    {
      "heading": "Form",
      "body": "Present Simple: subject + base verb (3rd person -s)...",
      "bodyZh": "一般现在时：主语 + 动词原形（第三人称加 -s）……",
      "examples": [
        { "en": "She works in a bank.", "zh": "她在银行工作。" }
      ],
      "tip": "Stative verbs (know, believe) are rarely used in continuous forms."
    }
  ],
  "commonErrors": [
    { "wrong": "I am knowing the answer.", "right": "I know the answer.", "why": "'know' is a stative verb." }
  ],
  "summary": {
    "keyPoints": ["...", "..."],
    "mustKnow": ["work(s)", "is working"]
  },
  "linkedPractice": ["grammar-01-quiz"],
  "reviewItems": ["v_edu_001", "p_op_003"]
}
```
### Vocabulary item schema
```json
{
  "id": "v_edu_001",
  "word": "graduate",
  "pos": "verb / noun",
  "phonetic": "/ˈɡrædʒueɪt/",
  "meaning": "to complete a degree; a person who has completed a degree",
  "meaningZh": "毕业（生）",
  "example": "She graduated from university last year.",
  "topic": "education"
}
```
### Question schema (shared by practice & mocks)
```json
{
  "id": "r_m1_p4_q3",
  "part": 4,
  "type": "cloze",
  "stem": "…text with __3__ gap…",
  "options": ["although", "despite", "however", "because"],
  "answer": 0,
  "explanation": "…why…",
  "audio": "assets/audio/m1_p2.mp3",
  "refScript": "l_m1_p2_s1"
}
```
- Every question **must** include `explanation`
- IDs globally unique: `{type}_{source}_{part}_{n}`
- Content editors: **never** rename an existing `id` — progress data references it
---
## App Modules (Feature Requirements)
### 1. 🏠 Dashboard (`index.html`)
- Progress overview per skill (completion %), "continue where you left off"
- Content version badge (read from `manifest.json`)
- Quick links: Knowledge / Practice / Mock Exams / Review
- Study streak & study-time stats
### 2. 📚 Knowledge (from JSON files)
- **Grammar lessons**: full B1 syllabus (tenses, conditionals, passive, reported speech, relative clauses, modals, comparatives…)
- **Vocabulary by PET topics** (Education, Travel, Environment, Work, Health, Technology, Hobbies…)
- **Phrases & collocations** grouped by function
- **Sentence pattern library** for Writing & Speaking
- **Exam format guide** for all 4 papers
- Rendered directly from the JSON units; each lesson ends with its auto summary and a link into its linked practice quiz
### 3. ✍️ Summaries
- Auto-generated summary card per lesson (from `summary` field)
- "Exam tips" callouts per question type
- Cheat-sheet pages: condensed grammar reference, writing templates (email, article, story)
### 4. 🎯 Practice (per module)
- Reading: all PET parts (multiple choice, matching, gap-fill, cloze)
- Writing: guided email + article/story with model answers and rubric checklists
- Listening: all 4 parts with audio, transcript reveal, per-question replay
- Speaking: prompt banks, sample dialogues, useful language
- Two modes: instant feedback (answer + explanation per question) and exam mode (feedback at end)
### 5. 🔁 Review System (Spaced Repetition)
- Unified pool of vocabulary, phrases, and patterns pulled from knowledge JSON files + mistakes
- Flashcards: front/back, audio, example sentences; swipe-to-answer on pad mode
- SM-2-style scheduling stored in `localStorage`
- Filters: topic, type (word/phrase/pattern), status (new/learning/mastered)
- Wrong-answer notebook: auto-collects errors from practice & mocks
### 6. 📝 Mock Examinations
- Full timed mocks from `data/mocks/*.json`: Reading 32q/50min, Writing 2 tasks/45min, Listening 25q/~35min, Speaking 12–17min
- Strict mode: countdown per paper, auto-save state (survives refresh), question flagging, answer-sheet navigation
- Report: per-part score, estimated Cambridge Scale score, pass indication (≥140)
- Per-question review with explanations and transcripts
- Section-specific drills (Reading-only, Listening-only)
- ≥ 6 full mock papers
### 7. 📊 Stats & Progress
- Score trends per skill (plain CSS/SVG charts)
- Accuracy by question type & topic
- Study time log
---
## Coding Conventions
- 2-space indentation, UTF-8, LF line endings
- No inline styles except dynamic JS values
- CSS custom properties for theming; breakpoint rules live in `main.css` only
- Semantic HTML; `<button>` not `<div onclick>`
- Accessibility: keyboard nav, `aria-label`, focus-visible, WCAG AA contrast; touch targets ≥ 44px in pad mode
- JS: only `window.APP` globals; event delegation; all fetch/JSON loading goes through `js/dataLoader.js`
- All `localStorage` access through `js/storage.js` with prefix `pet_v1_`
- **Application code must never hardcode content** — everything learner-facing comes from JSON data files
---
## Content Update Workflow
Updating content requires **no code changes**:
1. Edit or add a JSON file under `data/knowledge/`, `data/practice/`, or `data/mocks/`
2. Register new files in `data/manifest.json` (or the sub-manifest) and bump `version`
3. Validate the file against its schema (below) — the loader will log schema errors to console and skip invalid items rather than crash
4. Reload the app; the loader detects the version change and re-fetches
Rules for content editors:
- IDs are permanent — never rename or reuse an existing ID
- Every question needs an `explanation`
- Keep files small enough to edit comfortably: split large units into multiple files (e.g., `grammar-01a.json`, `grammar-01b.json`) rather than one huge file
- JSON must be valid (no comments, no trailing commas) — run `JSON.parse` or a validator before committing
---
## Testing Checklist (per feature)
- [ ] Loads with no console errors via HTTP server **and** `file://` fallback
- [ ] **Desktop**: full mock exam completable with keyboard only
- [ ] **Pad**: full mock exam completable by touch only (portrait + landscape); no tap target < 44px; Writing task usable with virtual keyboard
- [ ] Broken/missing JSON file → app degrades gracefully, shows clear message, doesn't crash
- [ ] Content update (bump manifest version) → new content loaded without app code change
- [ ] Progress persists after refresh; reset function works
- [ ] Timer correct; exam state survives refresh
- [ ] Scoring math verified against hand-computed example
- [ ] All referenced audio files exist and play
- [ ] Breakpoints 768px / 1280px render correctly
---
## Definition of Done
A feature is complete when: it works on desktop and pad (touch), content is schema-compliant JSON, every question has an explanation, progress saves/restores, invalid/missing data degrades gracefully, and all applicable checklist items pass.
---
*When adding content: prioritize question quality and explanation clarity over quantity. Every item should teach something a B1 learner could not easily infer on their own.*

