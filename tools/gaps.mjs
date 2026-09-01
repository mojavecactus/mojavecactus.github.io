#!/usr/bin/env node
// tools/gaps.mjs — content-gap report for SM ToolBox (run after decrypt-data.mjs).
//   node tools/gaps.mjs            -> prints Markdown to stdout
//   node tools/gaps.mjs out.md     -> writes it to a file
// Lists: cards with no content yet, SKUs with no barcode mapping (by family), duplicate names,
// items with a warn but no note, families with a single item. Nothing here is a verify FAIL;
// it is the tracked backlog for catalogue work.
import { readFileSync, writeFileSync } from 'fs';
const R = process.cwd();
global.window = {};
new Function('window', readFileSync(R + '/data.js', 'utf8'))(global.window);
new Function('window', readFileSync(R + '/gtin.js', 'utf8'))(global.window);
const D = global.window.TOOLBOX, G = global.window.TBX_GTIN || {}, G14 = global.window.TBX_GTIN14 || {};
const nrm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const all = [...D.items.map(i => ({ ...i, _k: 'item' })), ...D.probes.map(i => ({ ...i, _k: 'probe', fam: 'SERFAS · ' + i.fam })), ...D.shavers.map(i => ({ ...i, _k: 'shaver', fam: 'Shaver · ' + (i.fam || 'Formula') }))];
const vis = all.filter(i => !i.hidden);
const mapped = new Set([...Object.values(G), ...Object.values(G14)].map(nrm));
const byFam = (list) => { const m = {}; list.forEach(i => (m[i.fam] = m[i.fam] || []).push(i)); return Object.entries(m).sort((a, b) => b[1].length - a[1].length); };
const L = [];
L.push('# SM ToolBox — content gaps', '', 'Data built ' + D.built + ' · ' + vis.length + ' visible records', '');
const nb = vis.filter(i => !(i.specs && i.specs.length) && !i.note && !i.bp && !(i.imgs && i.imgs.length));
L.push('## Not built yet (' + nb.length + ')', '', 'Part number and description only — no specs, note, images or best practice.', '');
byFam(nb).forEach(([f, arr]) => { L.push('- **' + f + '** (' + arr.length + ')'); arr.forEach(i => L.push('  - `' + i.sku + '` ' + i.name)); });
const un = vis.filter(i => !mapped.has(nrm(i.sku)));
L.push('', '## No barcode mapping (' + un.length + ')', '', 'Scanning these packages lands on the teach screen. Learned pairs from phones close this list over time.', '');
byFam(un).forEach(([f, arr]) => L.push('- **' + f + '** (' + arr.length + '): ' + arr.map(i => '`' + i.sku + '`').join(' ')));
const nm = {}; vis.forEach(i => (nm[i.name] = nm[i.name] || []).push(i.sku));
const dups = Object.entries(nm).filter(([, v]) => v.length > 1);
L.push('', '## Duplicate names (' + dups.length + ')', '', 'Two part numbers with the same card title — usually legacy vs current SKU; worth a "replaces" note.', '');
dups.forEach(([k, v]) => L.push('- ' + k + ' → ' + v.map(s => '`' + s + '`').join(', ')));
const wn = vis.filter(i => i.warn && !i.note && !(i.specs && i.specs.length));
if (wn.length) { L.push('', '## Warning but no content (' + wn.length + ')', ''); wn.forEach(i => L.push('- `' + i.sku + '` ' + i.name + ' — ' + i.warn)); }
const fam1 = byFam(D.items.filter(i => !i.hidden)).filter(([, a]) => a.length === 1);
L.push('', '## Single-item families (' + fam1.length + ')', '', 'One card carries the whole family; fine if intentional, a hint if siblings are missing.', '');
fam1.forEach(([f, a]) => L.push('- ' + f + ' — `' + a[0].sku + '`'));
const out = L.join('\n') + '\n';
if (process.argv[2]) { writeFileSync(process.argv[2], out); console.log('wrote ' + process.argv[2]); } else process.stdout.write(out);
