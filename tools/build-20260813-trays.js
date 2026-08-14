// One-shot transform — Aug 13 2026 evening session
// 1) Add 4 shaver handpieces under Capital / "Shaver handpieces"
// 2) Move CrossFire 2 + CrossFlow consoles, footswitches, hand control to cat Capital (fams unchanged)
// 3) Add hand-control photo to 0350220000
// 4) New card CAT02145 PAHRS II tray (green Pivot) with Associated instruments (12)
// 5) New card 242200000 Silver hip arthroscopy instrument tray with Associated instruments (23)
// 6) Add the 19 hip-kit instruments that had no cards
// 7) Recompute D.counts
const fs = require("fs");
global.window = {};
require("/home/claude/repo/data.js");
const D = window.TOOLBOX;

const SRC_KIT = "Stryker Hip Arthroscopy Instruments Kit 0242200000 contents sheet (Aug 2026)";
const SRC_CF2 = "CrossFire 2 brochure 1000904462 Rev A (2023)";

// ---- 2) cat moves ----
const MOVE = ["0475100000", "0475100100", "0450000000", "0450000500", "0350220000"];
let moved = 0;
D.items.forEach(it => { if (MOVE.includes(it.sku)) { it.cat = "Capital"; moved++; } });
if (moved !== 5) throw new Error("expected 5 cat moves, got " + moved);

// ---- 3) hand control photo ----
const hc = D.items.find(i => i.sku === "0350220000");
if (hc.imgs) throw new Error("0350220000 unexpectedly already has imgs");
hc.imgs = ["img/crossflow-hand-control.jpg"];

// ---- 1) handpieces ----
const HP = [
  { sku: "0375708500", name: "Formula 180 shaver handpiece",
    specs: [["Hand control buttons", "Yes"], ["Suction", "Controlled at handpiece — simultaneous with buttons"], ["Blade recognition", "RFID — CrossFire 2 auto-optimizes settings per cutter/bur"]],
    note: "Runs Formula and CrossBlade cutters and burs (see Shaver Blades). Simultaneous control of buttons and suction from the handpiece.",
    imgs: ["img/handpiece-375708500.jpg"] },
  { sku: "0375704500", name: "Formula shaver handpiece, with buttons",
    specs: [["Hand control buttons", "Yes"], ["Suction", "Controlled at handpiece — simultaneous with buttons"], ["Blade recognition", "RFID — CrossFire 2 auto-optimizes settings per cutter/bur"]],
    note: "Alternate button placement to the Formula 180; buttons and suction still run together from the handpiece.",
    imgs: ["img/handpiece-375704500.jpg"] },
  { sku: "0375701500", name: "Formula shaver handpiece, no buttons",
    specs: [["Hand control buttons", "None"], ["Suction", "Controlled at handpiece"], ["Blade recognition", "RFID — CrossFire 2 auto-optimizes settings per cutter/bur"]],
    note: "For surgeons who run the shaver from the footswitch — suction control stays at the handpiece.",
    imgs: ["img/handpiece-375701500.jpg"] },
  { sku: "0275601500", name: "Small joint shaver handpiece",
    specs: [["Hand control buttons", "None — foot-control operated"], ["Blade compatibility", "Small joint cutters and burs, 2.0–3.5mm"]],
    note: "Low-profile handpiece for access into tighter joints.",
    imgs: ["img/handpiece-275601500.jpg"] },
];
HP.forEach(h => D.items.push({ cat: "Capital", fam: "Shaver handpieces", sku: h.sku, name: h.name,
  specs: h.specs, note: h.note, imgs: h.imgs, src: SRC_CF2, uom: "Each" }));

// ---- 6) hip-kit instruments (19 new) ----
const KIT = [
  ["242200007", "Hip biter, 15° up"],
  ["242200006", "Hip biter, straight"],
  ["242200018", "Hip curette, 20°"],
  ["242200015", "Hip suture grasper"],
  ["242200011", "Hip suture passer, left"],
  ["242200012", "Hip suture passer, right"],
  ["242200013", "Hip suture passer, straight"],
  ["242200014", "Hip suture passer, 35° up"],
  ["242200020", "Hip tissue liberator, 20°"],
  ["242200019", "Hip rasp, 30° up"],
  ["242200016", "Hip suture cutter"],
  ["242200001", "5.5mm slotted cannula"],
  ["242200002", "6.5mm slotted cannula"],
  ["242200005", "6.5mm cannulated switching stick"],
  ["242200003", "4.0mm cannulated switching stick"],
  ["242200022", "Curved hip probe"],
  ["242200017", "Hip knot pusher"],
  ["242200023", "Microfracture pick, straight"],
  ["242000112", "TAG hip instrumentation tray"],
];
KIT.forEach(([sku, name]) => {
  if (D.items.some(i => i.sku === sku)) throw new Error("kit sku already exists: " + sku);
  const it = { cat: "Instruments", fam: "Arthroscopic manual instruments", sku, name, sub: "Hip",
    specs: [["Type", name], ["Kit", "Silver hip tray kit 242200000"]], src: SRC_KIT, uom: "Each" };
  if (sku === "242200022") it.warn = "Do not run the curved probe down a FlowPort cannula — it will pass with force but will not come back out; freeing it requires removing the whole cannula.";
  D.items.push(it);
});

// ---- 4) PAHRS II tray card ----
const PAHRS_PARTS = ["CAT00599", "CAT00778", "CAT00792", "00CAT01371", "00CAT01372", "CAT01515",
  "00CAT01518", "00CAT01860", "00CAT01861", "00CAT02064", "00CAT02065", "CAT01856"];
D.items.push({ cat: "Instruments", fam: "Instrument trays", sku: "CAT02145",
  name: "PAHRS II instrument tray (green Pivot tray)",
  specs: [["Type", "Hip access (Pivot) instrument tray"], ["Capacity", "12 instruments"],
    ["Ordering", "Tray PN gets the tray only — instruments purchased separately"]],
  imgs: ["img/tray-pahrs2-cat02145.jpg", "img/tray-pahrs2-contents.jpg"],
  parts: PAHRS_PARTS, plabel: "Associated instruments", instr: { incl: [] },
  src: "PAHRS II instrument tray 00CAT02145 contents sheet (Aug 2026)", uom: "Each" });

// ---- 5) Silver hip tray card ----
const SILVER_PARTS = ["242200007", "242200006", "242200018", "242200009", "242200008", "242200010",
  "242200015", "242200011", "242200012", "242200013", "242200020", "242200019", "242200014",
  "242200016", "242200001", "242200005", "242200002", "242200022", "242200017", "242200021",
  "242200023", "242200003", "242000112"];
D.items.push({ cat: "Instruments", fam: "Instrument trays", sku: "242200000",
  name: "Silver hip arthroscopy instrument tray",
  specs: [["Type", "Hip arthroscopy manual instruments kit — silver tray"], ["Capacity", "23 instruments"],
    ["Ordering", "Kit PN 242200000 ships with all 23 instruments; each is also orderable individually"]],
  imgs: ["img/tray-hip-242200000.jpg", "img/tray-hip-contents.jpg"],
  parts: SILVER_PARTS, plabel: "Associated instruments", instr: { incl: [] },
  src: SRC_KIT, uom: "Kit" });

// ---- 7) recompute counts (cat-only, matches existing formula) ----
const counts = {};
D.catOrder.forEach(c => { counts[c] = D.items.filter(i => i.cat === c).length; });
Object.keys(D.counts).forEach(k => { if (!(k in counts)) counts[k] = D.items.filter(i => i.cat === k).length; });
D.counts = counts;

fs.writeFileSync("/home/claude/repo/data.js", "window.TOOLBOX=" + JSON.stringify(D) + ";");
console.log("written. items:", D.items.length, "counts:", JSON.stringify(D.counts));
