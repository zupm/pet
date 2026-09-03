/* ==========================================================================
   pages/stats.js - score trends, accuracy by part, study-time charts
   (plain SVG, no libraries).
   ========================================================================== */
(function () {
  'use strict';

  var ui, storage;

  function deps() {
    ui = window.APP.ui;
    storage = window.APP.storage;
  }

  var SKILL_COLORS = { reading: '#2563eb', writing: '#7c3aed', listening: '#16a34a', speaking: '#d97706' };

  function render(el) {
    deps();
    var p = storage.getProgress();
    var results = (p.practiceResults || []).concat(p.mockResults || [])
      .sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });

    var html = '<h1 class="page-title">Stats & Progress</h1>'
      + '<p class="page-sub">How your preparation is going. All data is stored locally in your browser.</p>';

    var streak = (p.streak && p.streak.days) || 0;
    var totalSec = 0;
    Object.keys(p.studySecondsByDay || {}).forEach(function (d) { totalSec += p.studySecondsByDay[d]; });
    var scored = results.filter(function (r) { typeof r.pct === 'number'; });
    var avgPct = scored.length ? Math.round(scored.reduce(function (a, r) { return a + r.pct; }, 0) / scored.length) : 0;

    html += '<div class="grid grid-4" style="margin-bottom:20px">'
      + tile(String(results.length), 'attempts logged')
      + tile(avgPct + '%', 'average score')
      + tile(fmtMin(totalSec), 'total study time')
      + tile(String(streak), 'day streak')
      + '</div>';

    html += '<h2 class="section-title">Score trends</h2>';
    if (!scored.length) {
      html += '<div class="empty-state">Complete a practice session or mock section to see trends here.</div>';
    } else {
      html += '<div class="card">' + legend() + trendChart(scored) + '</div>';
    }

    html += '<h2 class="section-title">Accuracy by exam part</h2>';
    var partAgg = {};
    (p.mockResults || []).forEach(function (r) {
      (r.parts || []).forEach(function (pt) {
        var key = r.skill + ' P' + pt.part;
        if (!partAgg[key]) partAgg[key] = { key: key, skill: r.skill, part: pt.part, correct: 0, max: 0 };
        partAgg[key].correct += pt.correct;
        partAgg[key].max += pt.max;
      });
    });
    var partKeys = Object.keys(partAgg);
    if (!partKeys.length) {
      html += '<div class="empty-state">Finish a mock section to unlock per-part accuracy.</div>';
    } else {
      html += '<div class="card">';
      partKeys.sort().forEach(function (k) {
        var a = partAgg[k];
        var pct = a.max ? Math.round((a.correct / a.max) * 100) : 0;
        html += '<div style="margin:10px 0"><div class="progress-label"><span>' + ui.esc(a.skill) + ' · Part ' + a.part + '</span><span>' + a.correct + '/' + a.max + ' (' + pct + '%)</span></div>'
          + '<div class="progress ' + (pct >= 75 ? 'success' : pct >= 50 ? 'warning' : 'danger') + '"><span style="width:' + pct + '%"></span></div></div>';
      });
      html += '</div>';
    }

    html += '<h2 class="section-title">Study time — last 14 days</h2>';
    html += '<div class="card">' + studyChart(p.studySecondsByDay || {}) + '</div>';

    html += '<h2 class="section-title">Recent results</h2>';
    if (!results.length) {
      html += '<div class="empty-state">Nothing recorded yet.</div>';
    } else {
      html += '<div class="card" style="overflow-x:auto"><table class="part-breakdown"><thead><tr><th>When</th><th>Activity</th><th>Score</th><th>%</th><th>Scale</th></tr></thead><tbody>';
      results.slice(-15).reverse().forEach(function (r) {
        html += '<tr><td class="small">' + ui.dateStr(r.ts) + '</td><td>' + ui.esc(r.title || r.skill || '') + '</td>'
          + '<td>' + (r.correct !== undefined ? r.correct + '/' + r.max : '—') + '</td>'
          + '<td>' + (typeof r.pct === 'number' ? r.pct + '%' : '—') + '</td>'
          + '<td>' + (typeof r.scale === 'number' ? r.scale : '—') + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    el.innerHTML = html;
  }

  function tile(v, l) {
    return '<div class="card stat-tile"><div class="stat-num">' + ui.esc(v) + '</div><div class="stat-label">' + ui.esc(l) + '</div></div>';
  }

  function fmtMin(sec) {
    var m = Math.round(sec / 60);
    if (m < 60) return m + 'm';
    return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  }

  function legend() {
    var h = '<div class="row-wrap" style="margin-bottom:10px">';
    Object.keys(SKILL_COLORS).forEach(function (s) {
      h += '<span class="chip" style="background:' + SKILL_COLORS[s] + '18;color:' + SKILL_COLORS[s] + '">● ' + s + '</span>';
    });
    return h + '</div>';
  }

  /* Multi-series line chart over the last 40 scored results */
  function trendChart(results) {
    var W = 720, H = 220, PAD = 30;
    var bySkill = {};
    results.slice(-40).forEach(function (r, i) {
      if (!bySkill[r.skill]) bySkill[r.skill] = [];
      bySkill[r.skill].push({ x: i, y: r.pct });
    });
    var n = Math.min(results.length, 40);
    function X(i) { return PAD + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD * 2)); }
    function Y(pct) { return H - PAD - (pct / 100) * (H - PAD * 2); }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto" role="img" aria-label="Score trend chart">';
    [0, 25, 50, 75, 100].forEach(function (g) {
      svg += '<line x1="' + PAD + '" y1="' + Y(g) + '" x2="' + (W - PAD) + '" y2="' + Y(g) + '" stroke="#dbe2ee" stroke-width="1"/>';
      svg += '<text x="4" y="' + (Y(g) + 4) + '" font-size="10" fill="#8b96ab">' + g + '</text>';
    });
    svg += '<line x1="' + PAD + '" y1="' + Y(40) + '" x2="' + (W - PAD) + '" y2="' + Y(40) + '" stroke="#dc2626" stroke-dasharray="6 4" stroke-width="1.5"/>';
    svg += '<text x="' + (W - PAD - 150) + '" y="' + (Y(40) - 6) + '" font-size="10" fill="#dc2626">pass line (scale 140 ≈ 40%)</text>';
    Object.keys(bySkill).forEach(function (s) {
      var pts = bySkill[s];
      var path = pts.map(function (pt, i) { return (i ? 'L' : 'M') + X(pt.x).toFixed(1) + ' ' + Y(pt.y).toFixed(1); }).join(' ');
      svg += '<path d="' + path + '" fill="none" stroke="' + (SKILL_COLORS[s] || '#333') + '" stroke-width="2.5"/>';
      pts.forEach(function (pt) {
        svg += '<circle cx="' + X(pt.x).toFixed(1) + '" cy="' + Y(pt.y).toFixed(1) + '" r="3.5" fill="' + (SKILL_COLORS[s] || '#333') + '"/>';
      });
    });
    svg += '</svg>';
    return svg;
  }

  function studyChart(byDay) {
    var days = [];
    var now = new Date();
    for (var i = 13; i >= 0; i--) {
      var d = new Date(now.getTime() - i * 86400000);
      var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      days.push({ key: key, label: String(d.getDate()), sec: byDay[key] || 0 });
    }
    var max = Math.max.apply(null, days.map(function (d) { return d.sec; }).concat([60]));
    var W = 720, H = 160, PAD = 24;
    var bw = (W - PAD * 2) / days.length;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto" role="img" aria-label="Study time chart">';
    days.forEach(function (d, i) {
      var h = Math.round((d.sec / max) * (H - PAD * 2));
      var x = PAD + i * bw + 4;
      var y = H - PAD - h;
      svg += '<rect x="' + x.toFixed(1) + '" y="' + y + '" width="' + (bw - 8).toFixed(1) + '" height="' + h + '" rx="4" fill="' + (d.sec ? '#2563eb' : '#eef2f9') + '"/>';
      svg += '<text x="' + (x + (bw - 8) / 2).toFixed(1) + '" y="' + (H - 8) + '" font-size="10" fill="#8b96ab" text-anchor="middle">' + d.label + '</text>';
    });
    svg += '</svg>';
    return svg;
  }

  window.APP = window.APP || {};
  window.APP.pages = window.APP.pages || {};
  window.APP.pages.stats = { render: render };
})();
