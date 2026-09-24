// P41 glyph inventory: lists every emoji / pictographic symbol in the bundle and index.html — literal characters,
// HTML numeric entities (&#x1F4AC; / &#9733;) and JS \u escapes (incl. surrogate pairs). Read-only.
//   node tools/nav-test/emoji-scan.js [repo] [--json] [--check]
// --check: exit 1 if any glyph is not on the KEEP list below. Catalog screens use the line-icon set (ICON in the bundle);
// what remains is cycle count / F&A (untouched by design), the shared pull-to-refresh arrow, Android's menu glyph in the
// install steps and the feedback form's "Sent" tick.
const fs = require('fs'), path = require('path');
const ARGS = process.argv.slice(2), CHECK = ARGS.indexOf('--check') > -1, JSON_OUT = ARGS.indexOf('--json') > -1;
const R = ARGS.filter(a => !/^--/.test(a))[0] || path.resolve(__dirname, '../..');
const KEEP = [ // [glyph, a piece of the source line it sits on]
  ['\u2713', "'Saved \\u2713'"], ['\u2713', 'On the Field Ops list'], ['\u2713', "b.innerHTML = '&#x2713;'"], ['\u2713', 'Overdraft resolved'],
  ['\u2713', "'sent \\u2713'"], ['\u2713', "'Sent \\u2713'"], ['\u2197', 'Open in Google Sheets'], ['\u26A1', 'cc-torch'], ['\u2795', 'Add a teammate'],
  ['\u2795', 'New Territory'], ['\u21BB', 'Refresh territories'], ['\u21BB', "ind.id = 'ptr'"], ['\u21BB', 'fa2-rf'], ['\u{1F4E6}', 'No counts yet'],
  ['\u{1F4CB}', 'fops-ic'], ['\u26A0', 'fops-warn'], ['\u25B2', 'k-arrows'], ['\u25BC', 'k-arrows'], ['\u270E', 'k-edit'], ['\u2705', 'Nothing on hand'],
  ['\u{1F4D2}', 'No events yet'], ['\u22EE', 'Open the browser menu'], ['\u2713', "' saved ✓'"]
];
const APP = /<script src="(app[^"]*\.js)"/.exec(fs.readFileSync(R + '/index.html', 'utf8'))[1];
// symbols that are UI glyphs (not typography like — · › ’ “ ” – × ° ± ≤ ≥ ″ β → ←)
const TYPO = new Set([0x2014, 0x2013, 0x00B7, 0x203A, 0x2019, 0x2018, 0x201C, 0x201D, 0x2026, 0x00D7, 0x00B0, 0x00B1, 0x2264, 0x2265, 0x2033, 0x03B2, 0x2192, 0x2190, 0x00AE, 0x2122, 0x00A0, 0x2032, 0x00B5, 0x2212, 0x2022, 0x00E9, 0x00F6, 0x00FC, 0x2011, 0x2248, 0x00BD, 0x00BC, 0x00BE]);
function isGlyph(cp) {
  if (TYPO.has(cp)) return false;
  return (cp >= 0x1F000 && cp <= 0x1FAFF) || (cp >= 0x2600 && cp <= 0x27BF) || (cp >= 0x2300 && cp <= 0x23FF) ||
    (cp >= 0x2190 && cp <= 0x21FF) || (cp >= 0x2B00 && cp <= 0x2BFF) || cp === 0x2715 || cp === 0x2713 || cp === 0x2139 || cp === 0x22EE || cp === 0x22EF || (cp >= 0x25A0 && cp <= 0x25FF);
}
const NAMES = { 0x1F4AC: 'speech bubble', 0x1F50D: 'magnifier', 0x1F4E6: 'package', 0x1F4F5: 'no phones', 0x2795: 'heavy plus', 0x26A0: 'warning', 0x2606: 'white star', 0x2605: 'black star',
  0x2197: 'NE arrow', 0x2715: 'multiplication x', 0x2713: 'check', 0x21BB: 'clockwise arrow', 0x23F0: 'alarm clock', 0x1F4CA: 'bar chart', 0x2139: 'info', 0x2B50: 'star', 0x1F4CB: 'clipboard', 0x1F4F7: 'camera',
  0x1F4C4: 'page', 0x1F4E4: 'outbox', 0x1F4E5: 'inbox', 0x1F4CD: 'pin', 0x1F504: 'arrows', 0x1F512: 'lock', 0x1F4DD: 'memo', 0x2705: 'check mark button', 0x274C: 'cross mark', 0x1F6AB: 'prohibited', 0x2B06: 'up arrow', 0x2B07: 'down arrow', 0x25B2: 'up triangle', 0x25BC: 'down triangle', 0x21E7: 'up white arrow', 0x2630: 'trigram', 0x2699: 'gear', 0x1F5D1: 'wastebasket', 0x270E: 'pencil', 0x270F: 'pencil', 0x1F4DA: 'books', 0x1F4D6: 'book', 0x1F4E7: 'email', 0x1F517: 'link', 0x1F4F1: 'phone', 0x1F50E: 'magnifier R', 0x1F4C8: 'chart up', 0x1F4C9: 'chart down', 0x1F552: 'clock', 0x23F3: 'hourglass', 0x1F4A1: 'bulb', 0x2B55: 'circle', 0x25CF: 'black circle', 0x25CB: 'white circle' };
function scan(file, label) {
  const lines = fs.readFileSync(file, 'utf8').split('\n'); const out = [];
  lines.forEach((ln, i) => {
    const hits = [];
    for (const ch of ln) { const cp = ch.codePointAt(0); if (cp > 0x7F && isGlyph(cp)) hits.push({ cp, how: 'char' }); }
    ln.replace(/&#x([0-9a-f]+);|&#(\d+);/gi, (m, h, d) => { const cp = h ? parseInt(h, 16) : +d; if (isGlyph(cp)) hits.push({ cp, how: 'entity ' + m }); return m; });
    ln.replace(/\\u(d8[0-9a-f]{2})\\u(dc[0-9a-f]{2})|\\u([0-9a-f]{4})/gi, (m, hi, lo, one) => {
      const cp = hi ? ((parseInt(hi, 16) - 0xD800) * 0x400 + (parseInt(lo, 16) - 0xDC00) + 0x10000) : parseInt(one, 16);
      if (isGlyph(cp)) hits.push({ cp, how: 'escape ' + m }); return m; });
    hits.forEach(h => {
      const col = ln.indexOf(h.how.startsWith('char') ? String.fromCodePoint(h.cp) : h.how.split(' ')[1]);
      const ctx = ln.slice(Math.max(0, col - 70), col + 50).replace(/\s+/g, ' ');
      out.push({ file: label, line: i + 1, cp: 'U+' + h.cp.toString(16).toUpperCase(), glyph: String.fromCodePoint(h.cp), name: NAMES[h.cp] || '', how: h.how, ctx });
    });
  });
  return out;
}
const all = scan(R + '/' + APP, APP).concat(scan(R + '/index.html', 'index.html'));
const byGlyph = {};
all.forEach(h => { (byGlyph[h.glyph + ' ' + h.cp + ' ' + h.name] = byGlyph[h.glyph + ' ' + h.cp + ' ' + h.name] || []).push(h.file.replace(/^app-.*\.js$/, 'app') + ':' + h.line); });
const LINES = {}; [APP, 'index.html'].forEach(f => { LINES[f] = fs.readFileSync(R + '/' + f, 'utf8').split('\n'); });
const bad = all.filter(h => !KEEP.some(([g, ctx]) => g === h.glyph && LINES[h.file][h.line - 1].indexOf(ctx) > -1));
if (JSON_OUT) { console.log(JSON.stringify(all, null, 1)); return; }
console.log('# ' + all.length + ' glyph occurrences\n');
Object.keys(byGlyph).sort().forEach(k => console.log(k.padEnd(28) + ' ' + byGlyph[k].join(', ')));
console.log('\n# detail');
all.forEach(h => console.log(h.file.replace(/^app-.*\.js$/, 'app') + ':' + h.line + '  ' + h.glyph + ' ' + h.cp + ' (' + h.how + ')  …' + h.ctx + '…'));
if (CHECK) {
  console.log('\n' + (bad.length ? 'FAIL ' + bad.length + ' glyph(s) not on the keep list:\n' + bad.map(h => '  ' + h.file + ':' + h.line + ' ' + h.glyph + ' …' + h.ctx + '…').join('\n')
    : 'PASS every glyph is on the keep list (' + all.length + ' of ' + KEEP.length + ' kept places)'));
  process.exit(bad.length ? 1 : 0);
}
