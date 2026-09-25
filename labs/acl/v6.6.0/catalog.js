// Nominal catalog dimensions transcribed from the research register on 2026-09-24.
// A catalog match identifies an item, not current orderability or clinical suitability.
export const SOURCES = {
  scope: null, // user-defined scope rules have no public source page (reference.html is internal, not shipped)
  procinch: 'https://stryker.highspot.com/items/66f6ff47cbab12f1d158d622',
  quad: 'https://stryker.highspot.com/items/66df4dc7a106d1e666d3728d',
  quadPrep: 'https://stryker.highspot.com/items/66f5b7e04a0fb298de55c120',
  glok: 'https://stryker.highspot.com/items/66f58c1d37881198bcdc7e34',
  glokChart: 'https://stryker.highspot.com/items/5da9d5bba2e3a9634aa24889',
  rr: 'https://stryker.highspot.com/items/632ce17dc7cc948bbd27dc07',
  rr105: 'https://accessgudid.nlm.nih.gov/devices/10810128463918',
  biosteon: 'https://stryker.highspot.com/items/69dfe6274bd385dd48e27291',
  biosteonSizing: 'https://stryker.highspot.com/items/5da9d53ec79c52440875f22a',
  wedge: 'https://stryker.highspot.com/items/5da9d528c247915a8d058395',
  openLoop: 'https://stryker.highspot.com/items/6622aaaa59a237f6318c229f',
  stRt: 'https://stryker.highspot.com/items/67323358d8892a38d22bd543',
  rapidease: 'https://sportsmedtoolbox.com/#/pn/4564SC'
};
export const GRAFTS = [
  {id:'folded',label:'Folded soft tissue graft',family:'folded',origin:'Allograft or autograft',allInside:false,description:'Soft tissue folded over a fixation loop.'},
  {id:'rapidease',label:'RapidEase quadruple-strand allograft',family:'rapidease',origin:'Allograft',allInside:true,sku:'4564SC',source:SOURCES.rapidease,description:'Presutured quadrupled construct with preparation loops.'},
  {id:'quad_soft',label:'Quad autograft · all soft tissue',family:'quad',origin:'Autograft',allInside:true,description:'QuadCinch preparation at the soft-tissue fixation ends.'},
  {id:'qtb',label:'Quad tendon + tibial bone block (QTB)',family:'quad',origin:'Autograft',allInside:true,description:'Femoral QuadCinch soft-tissue end; tibial bone block with screw.'},
  {id:'btb',label:'BTB Graft',family:'btb',origin:'Allograft or autograft',allInside:false,description:'Bone–tendon–bone with separately measured block lengths.'}
];
export function canonicalGraftId(id) {const aliases={folded_allo:'folded',folded_auto:'folded',btb_allo:'btb',btb_auto:'btb'};return Object.hasOwn(aliases,id)?aliases[id]:id;}
export const FIXATIONS = [
  {id:'glok',label:'G-Lok fixed loop',kind:'integrated',source:SOURCES.glok},
  {id:'procinch_st',label:'ProCinch ST · standard tensioning',kind:'integrated',sku:'0234102090',source:SOURCES.stRt},
  {id:'procinch_rt',label:'ProCinch RT · reverse tensioning',kind:'integrated',sku:'0234102060',source:SOURCES.stRt},
  {id:'procinch_abs',label:'ProCinch no button + ABS',kind:'abs',sku:'0234102061',source:SOURCES.procinch},
  {id:'open_loop',label:'ProCinch Open Loop with button',kind:'integrated',sku:'0234102065',source:SOURCES.openLoop},
  {id:'open_loop_abs',label:'ProCinch Open Loop + ABS',kind:'abs',sku:'0234102066',source:SOURCES.openLoop},
  {id:'quadcinch',label:'QuadCinch with button',kind:'integrated',sku:'0234102067',source:SOURCES.quad},
  {id:'quadcinch_abs',label:'QuadCinch no button + ABS',kind:'abs',sku:'0234102068',source:SOURCES.quad},
  {id:'biosteon',label:'Biosteon interference screw',kind:'screw',source:SOURCES.biosteon},
  {id:'wedge',label:'Titanium Wedge interference screw',kind:'screw',source:SOURCES.wedge}
];
export const TECHNIQUES = {
  femur:[{id:'retrograde',label:'Retrograde · VersiTomic RR'},{id:'flexible',label:'Flexible reaming'},{id:'outside_in',label:'Outside-in'},{id:'low_profile',label:'Low-profile · AM portal'},{id:'transtibial',label:'Trans-tibial · linked'}],
  tibia:[{id:'retrograde',label:'Retrograde · VersiTomic RR'},{id:'straight',label:'Straight reaming'},{id:'transtibial',label:'Trans-tibial · linked'}]
};
export const BUTTONS = [
  {id:'abs11',label:'Concave round 11 mm',sku:'0234100001',shape:'concave',outerDiameter:11,projection:3.5,thickness:1.3,suggested:[4,7],source:SOURCES.procinch},
  {id:'abs14',label:'Concave round 14 mm',sku:'0234100002',shape:'concave',outerDiameter:14,projection:6.5,thickness:1.2,suggested:[7,9],source:SOURCES.procinch},
  {id:'abs20',label:'Concave round 20 mm',sku:'0234100003',shape:'concave',outerDiameter:20,projection:9,thickness:1.2,suggested:[9,12],source:SOURCES.procinch},
  {id:'flat_oval',label:'Flat oval 8 × 12 mm',sku:'0234100004',shape:'flat',width:8,length:12,projection:0,thickness:1.6,suggested:[4,7],source:SOURCES.procinch},
  {id:'flat14',label:'Flat round 14 mm',sku:'0234100005',shape:'flat',outerDiameter:14,projection:0,thickness:1.6,suggested:[7,9],thicknessProvisional:true,source:SOURCES.procinch}
];
export const FIXED_LOOPS = [15,20,25,30,35,40,45,50];
export const SCREWS = [
  ...[[6,23,'160'],[7,23,'161'],[8,23,'162'],[9,23,'163'],[10,23,'170'],[6,28,'168'],[7,28,'164'],[8,28,'165'],[9,28,'166'],[10,28,'167'],[11,28,'172'],[12,28,'173'],[9,35,'177'],[10,35,'178'],[11,35,'179'],[12,35,'180']].map(([diameter,length,suffix])=>({family:'biosteon',diameter,length,sku:'0234010'+suffix,source:SOURCES.biosteon})),
  ...[[7,20,'0234010051'],[7,25,'0234010052'],[7,30,'0234030042'],[8,20,'0234010053'],[8,25,'0234010054'],[8,30,'0234030045'],[9,20,'0234010055'],[9,25,'0234010056'],[9,30,'0234030048'],[10,20,'0234030049'],[10,25,'0234030050'],[10,30,'0234030051']].map(([diameter,length,sku])=>({family:'wedge',diameter,length,sku,source:SOURCES.wedge}))
];
export const RR_REAMERS = [
  ...[[6,'060'],[6.5,'065'],[7,'070'],[7.5,'075'],[8,'080'],[8.5,'085'],[9,'090'],[9.5,'095'],[10,'110']].map(([diameter,suffix])=>({diameter,head:diameter,shaft:4.5,sku:'0234109'+suffix,available:true,source:SOURCES.rr})),
  {diameter:10.5,head:10.5,shaft:4.5,sku:'0234109105',available:false,availability:'Stryker ordering availability not verified; regulatory listing only',source:SOURCES.rr105},
  {diameter:11,head:11,shaft:6,sku:'0234109111',available:true,source:SOURCES.rr},
  {diameter:12,head:12,shaft:6,sku:'0234109112',available:true,source:SOURCES.rr}
];
export const XL = {sku:'0234100016',label:'G-Lok XL',compatible:['glok','procinch_st','procinch_rt','quadcinch'],source:SOURCES.glok,passageWidth:5,exactDimensionsVerified:false,describedAperture:[6,10]};
