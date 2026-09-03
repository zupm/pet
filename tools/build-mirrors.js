#!/usr/bin/env node
/* ==========================================================================
   build-mirrors.js - generates mirrored .js registry files for every
   JSON file under data/, enabling the app to run from file:// without
   a web server. Run this after editing any content JSON:

     node tools/build-mirrors.js

   Mirror format (data/<path>.js):
     window.PET_DATA = window.PET_DATA || {};
     window.PET_DATA["<path>.json"] = { ... };
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const DATA = path.resolve(__dirname, '..', 'data');
let count = 0;
let failures = 0;

function walk(dir, rel) {
  fs.readdirSync(dir).forEach(function (name) {
    const full = path.join(dir, name);
    const relPath = rel ? rel + '/' + name : name;
    const st = fs.statSync(full);
    if (st.isDirectory()) { walk(full, relPath); return; }
    if (!name.endsWith('.json')) return;
    try {
      const raw = fs.readFileSync(full, 'utf8');
      const obj = JSON.parse(raw); // validate before mirroring
      const js = '/* Generated mirror of ' + relPath + ' - do not edit by hand.\n'
        + '   Regenerate with: node tools/build-mirrors.js */\n'
        + 'window.PET_DATA = window.PET_DATA || {};\n'
        + 'window.PET_DATA[' + JSON.stringify(relPath) + '] = '
        + JSON.stringify(obj) + ';\n';
      fs.writeFileSync(full.replace(/\.json$/, '.js'), js, 'utf8');
      count++;
    } catch (e) {
      failures++;
      console.error('mirror failed for ' + relPath + ': ' + e.message);
    }
  });
}

walk(DATA, '');
console.log('Mirrored ' + count + ' JSON file(s).');
if (failures) {
  console.error(failures + ' mirror(s) failed.');
  process.exit(1);
}
