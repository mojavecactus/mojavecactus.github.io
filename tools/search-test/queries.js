// Search regression query sets (P1 / P9 / P22 and a no-regression sample).
// SPECIAL: queries whose behaviour the change is meant to fix — each carries an expectation checked by run.js --expect.
// SAMPLE: common rep terms (family names, product words, part numbers). Their top-10 is recorded in the baseline (--out);
//         any change vs the baseline is printed for review (not a failure unless --strict).
const TT_BAD = ['002674', '002680', '002675', '002681'];              // Left/Right trochlea & talus grafts that "tt" hit first
const REAMER_11 = ['0234109111', '0234108110', '0234111110'];         // the 11.0mm reamers "10mm reamer" returned
const REAMER_10 = ['0234109110', '0234111100'];                       // the 10.0mm RetroReamer and Low Profile reamer
const words = (t) => String(t || '').toUpperCase().split(/[^A-Z0-9#]+/);
module.exports = {
  SPECIAL: [
    // P1 plural
    { q: 'shaver' }, { q: 'shavers', expect: (r, all) => r.n >= Math.floor(all['shaver'].n * 0.9) || 'shavers ' + r.n + ' vs shaver ' + all['shaver'].n },
    { q: 'drill' }, { q: 'drills', expect: (r, all) => r.n >= Math.floor(all['drill'].n * 0.9) || 'drills ' + r.n + ' vs drill ' + all['drill'].n },
    { q: 'omega anchor' }, { q: 'omega anchors', expect: (r, all) => r.n >= all['omega anchor'].n - 1 || 'omega anchors ' + r.n + ' vs ' + all['omega anchor'].n },
    // Nate, 2026-09-24: the G-Force guide rods by the name reps use
    { q: 'suture passing guide rod', expect: (r) => (r.n === 2 && ['86PS1000', '86PS1000S'].every(s => r.top.includes(s))) || 'suture passing guide rod: ' + r.n + ' hits, top ' + r.top.slice(0, 3).join(' ') },
    { q: 'screws' }, { q: 'cannulas' }, { q: 'reamers' }, { q: 'wands' }, { q: 'passers' }, { q: 'boxes' },
    // P9 short / sized
    { q: 'tt', expect: (r, all, raw) => (!r.top.some(s => TT_BAD.includes(s)) && r.skus.every(s => /(^|[^A-Z0-9])TT([^A-Z0-9]|$)/i.test(raw(s)))) || 'tt: a hit without the whole word TT, or trochlea/talus' },
    { q: 'ss', expect: (r, all, raw) => r.skus.every(s => /(^|[^A-Z0-9])SS([^A-Z0-9]|$)/i.test(raw(s))) || 'ss: a hit without the whole word SS (Assy/Tissue class)' },
    { q: 'oca', expect: (r, all, raw) => r.skus.every(s => /(^|[^A-Z0-9])OCA/i.test(raw(s))) || 'oca: a hit where OCA is inside a word (trocar class)' },
    { q: '#2', expect: (r, all, raw) => (r.n < 400 && r.skus.every(s => /#2(?![\d-])/.test(raw(s)))) || '#2: ' + r.n + ' hits or a hit without #2' },
    { q: '#2-0' }, { q: '2-0' }, { q: '#0' }, { q: '#5' },
    // the 10.0mm reamers lead; 11.0mm reamers never match on their title (a RetroReamer whose spec text says "10mm safety reference" may follow)
    { q: '10mm reamer', expect: (r) => (REAMER_10.every(s => r.top.slice(0, 3).includes(s)) && !r.skus.some(s => REAMER_11.slice(1).includes(s)) && r.skus.indexOf('0234109111') > 2) || '10mm reamer: ' + r.top.join(',') },
    { q: '4mm shaver', expect: (r, all) => (r.n > 0 && r.n === all['4.0mm shaver'].n) || '4mm shaver ' + r.n + ' vs 4.0mm ' + all['4.0mm shaver'].n },
    { q: '4.0mm shaver' }, { q: '4 mm shaver' }, { q: '2.3mm drill' }, { q: '2.3 drill' }, { q: 'iconix 2.3' }, { q: 'omega 4.75' }, { q: 'omega 6.5' },
    { q: '8x20' }, { q: '2.4x11.3' }, { q: '9mm biosteon' }, { q: 'g-lok 20' }, { q: '36"' },
    // part numbers (must not change)
    { q: '3910500580', expect: (r) => (r.top[0] === '3910500580') || 'top ' + r.top[0] },
    { q: '3910-500-580', expect: (r) => (r.top[0] === '3910500580') || 'top ' + r.top[0] },
    { q: '0242200025', expect: (r) => (r.top[0] === '242200025') || 'top ' + r.top[0] },
    { q: '242200025', expect: (r) => (r.top[0] === '242200025') || 'top ' + r.top[0] },
    { q: '0295724120' }, { q: 'CAT00227' }, { q: 'cat02438' }, { q: '86PS0410' }, { q: '3910500' }, { q: '500580' }, { q: '234-118-006' },
    // P22 fuzzy
    { q: 'fiberwire', expect: (r) => r.fuzzy === true || 'fiberwire not flagged fuzzy' },
    { q: 'nanotak', expect: (r) => r.fuzzy === true || 'nanotak not flagged fuzzy' },
    { q: 'zzzz', expect: (r) => r.n === 0 || 'zzzz found ' + r.n },
    // aliases / special handling that must keep working
    { q: 'ff' }, { q: 'pt' }, { q: 'xb' }, { q: 'avk' }, { q: 'bio' }, { q: 'locked' }, { q: 'non sliding' }, { q: 'sliding' }, { q: 'nonsliding' }
  ],
  SAMPLE: [
    'iconix', 'alphavent', 'omega', 'nanotack', 'cinchlock', 'knotilus', 'knotilus+', 'intraline', 'twinloop', 'wedge', 'gravity', 'g-lok',
    'procinch', 'sharpshooter', 'air+', 'flowport', 'dri-lok', 'samurai', 'serfas', 'crossfire', 'crossflow', 'formula', 'tomcat',
    'versitomic', 'retroreamer', 'biosteon', 'g-force', 'champion', 'slingshot', 'injector', 'nanopass', 'phoenix', 'microfx',
    'prochondrix', 'graftjacket', 'evergen', 'alamo', 'allosource', 'fastpack', 'flexband', 'inspace', 'prozip', 'xbraid',
    'force fiber', 'guardian', 'adaptable', 'reelx', 'anchor', 'knotless', 'drill guide', 'obturator', 'cannula', 'punch tap',
    'awl', 'passer', 'suture', 'tape', 'needle', 'bur', 'wand', 'probe', 'tubing', 'reamer', 'screw', 'button', 'tendon',
    'meniscus', 'hip', 'acl', 'dc guide', 'xbraid tt 1.4', 'knotilus+ 2.9', 'cinchlock ss', 'nanotack tt', 'alphavent knotless',
    'biocomposite', 'peek', 'titanium', 'day-use tubing', '90-s', 'hook', 'trocar', 'tap', 'pin', 'guide pin', 'k-wire', 'loop',
    'whip stitch', 'hard bone', 'soft bone', 'drill 2.3', 'iconix 1.4', 'dermis', 'allograft', 'tray', 'handpiece', 'footswitch'
  ],
  // bucket-chip + facet snapshots (P25/P26/P27 verification): [query, bucket]
  FACETS: [['iconix', 'Implants'], ['anchor', 'Implants'], ['screw', 'Implants'], ['reamer', 'Disposables'], ['guide', 'Instruments'],
           ['suture', 'Suture'], ['xbraid', 'Suture'], ['shaver', 'Arthroscopy'], ['cannula', 'Disposables'], ['passer', 'Disposables']]
};
