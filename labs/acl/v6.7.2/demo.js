// ACL Case Lab — demo mode data (6.7): a few complete ACL constructs to watch step by step, and the short line shown as each
// step plays. Pure data and functions: app.mjs drives the model and the page. Every preset is a full case (all measurements),
// so each step can play from the state the previous one left, exactly as the walkthrough does.
import {GRAFTS,FIXATIONS,BUTTONS,evaluate,tibialTrim} from './engine.js';
import {createCase,updateCaseValue,stepsForCase,sanitizeCase,materializeCase,portalPassage,plannedTibialInsertion} from './workflow.js';
import {recommendedStepDuration} from './model-sequences.js';

// Nate's five (Sept 26 2026): hamstring with flexible reaming, all-inside RapidEase, BTB outside-in, BTB trans-tibial and quad
// tendon low-profile — between them flexible, all-inside (RR), outside-in, trans-tibial and low-profile, soft tissue and bone
// blocks. Values follow the walkthrough's own ranges; each builds with no fit errors (tests/demo.test.mjs).
export const DEMOS=[
  {id:'hamstring_flexible',title:'Hamstring · flexible reaming',subtitle:'Folded graft · flexible femoral reaming, G-Lok · straight tibial tunnel, Biosteon screw',
   plan:{graft:'folded','femur.technique':'flexible','tibia.technique':'straight','femur.fixation':'glok','tibia.fixation':'biosteon'},
   values:{graftDiameter:9,graftLength:100,'femur.loop':15,'femur.ttl':36,'femur.socket':32,'femur.diameter':9,'tibia.ttl':40,'tibia.diameter':9,'tibia.boneQuality':'normal','tibia.screwDiameter':9,'tibia.screwLength':28}},
  {id:'all_inside_rapidease',title:'All-inside · RapidEase',subtitle:'RapidEase allograft · VersiTomic RR sockets · Open Loop buttons, ABS on the tibia',
   plan:{graft:'rapidease','femur.technique':'retrograde','tibia.technique':'retrograde','femur.fixation':'open_loop','tibia.fixation':'open_loop_abs'},
   values:{graftDiameter:9,graftLength:67,'femur.ttl':35,'femur.socket':25,'femur.diameter':9,'tibia.ttl':40,'tibia.socket':25,'tibia.diameter':9,'tibia.button':'abs11'}},
  {id:'btb_outside_in',title:'BTB · outside-in',subtitle:'Bone–tendon–bone · outside-in femur, screw from the lateral side · Titanium Wedge screws',
   plan:{graft:'btb','femur.technique':'outside_in','tibia.technique':'straight','femur.fixation':'wedge','tibia.fixation':'wedge'},
   values:{graftDiameter:10,graftLength:95,femoralPlugLength:20,tibialPlugLength:25,'femur.ttl':35,'femur.diameter':10,'tibia.ttl':40,'tibia.diameter':10,'femur.screwDiameter':8,'femur.screwLength':20,'tibia.screwDiameter':8,'tibia.screwLength':20}},
  {id:'btb_transtibial',title:'BTB · trans-tibial',subtitle:'Bone–tendon–bone · tibia first, femur through it · Open Loop, Biosteon screw',
   plan:{graft:'btb','femur.technique':'transtibial','femur.fixation':'open_loop','tibia.fixation':'biosteon'},
   values:{graftDiameter:10,graftLength:100,femoralPlugLength:20,tibialPlugLength:25,'femur.ttl':45.2,'femur.socket':25,'tibia.ttl':45,'tibia.diameter':10,'tibia.boneQuality':'normal','tibia.screwDiameter':9,'tibia.screwLength':23}},
  {id:'quad_low_profile',title:'Quad tendon · low-profile',subtitle:'All-soft-tissue quad · low-profile AM-portal socket, QuadCinch · RR tibial socket, ABS',
   plan:{graft:'quad_soft','femur.technique':'low_profile','tibia.technique':'retrograde','femur.fixation':'quadcinch','tibia.fixation':'quadcinch_abs'},
   values:{graftDiameter:10,graftLength:70,'femur.ttl':38,'femur.socket':25,'femur.diameter':10,'tibia.ttl':40,'tibia.socket':25,'tibia.diameter':10,'tibia.button':'abs11'}}
];

// the whole case for a preset, the way the walkthrough records it (plan first, then every measurement), at the plan step
export function buildDemoCase(preset){
  let draft=createCase();
  for(const [path,value] of Object.entries(preset.plan))draft=updateCaseValue(draft,path,value);
  for(const [side,on] of Object.entries(preset.blown||{}))draft=updateCaseValue(draft,side+'.blownCortex',on);
  for(const [path,value] of Object.entries(preset.values))draft=updateCaseValue(draft,path,value);
  return sanitizeCase({...draft,currentStep:'plan',completed:[]});
}
// the case as it stands when step `index` begins: every earlier step done
export function demoCaseAt(base,index){
  const steps=stepsForCase(base),i=Math.max(0,Math.min(steps.length-1,index));
  return {...structuredClone(base),currentStep:steps[i].id,completed:steps.slice(0,i).map(s=>s.id)};
}

const f=x=>typeof x==='number'&&Number.isFinite(x)?Number(x.toFixed(1)).toString():'—';
const fixation=id=>FIXATIONS.find(x=>x.id===id);
// short names for the captions and the closing card
const APPROACH={retrograde:'VersiTomic RR socket',flexible:'flexible reaming',outside_in:'outside-in tunnel',low_profile:'low-profile AM-portal socket',transtibial:'trans-tibial',straight:'straight tunnel'};
const FIX={glok:'G-Lok fixed loop',procinch_st:'ProCinch ST button',procinch_rt:'ProCinch RT button',procinch_abs:'ProCinch + ABS button',open_loop:'ProCinch Open Loop button',open_loop_abs:'ProCinch Open Loop + ABS button',quadcinch:'QuadCinch button',quadcinch_abs:'QuadCinch + ABS button'};
const GRAFT_NAME={folded:['Folded soft-tissue graft','folded soft-tissue graft'],rapidease:['RapidEase allograft','RapidEase allograft'],quad_soft:['Quad tendon autograft (all soft tissue)','quad tendon autograft'],qtb:['Quad tendon with a tibial bone block','quad tendon graft'],btb:['BTB graft','BTB graft']};
const graftName=(g,mid=false)=>GRAFT_NAME[g?.id]?.[mid?1:0]||g?.label||'Graft';
const upper=x=>x.charAt(0).toUpperCase()+x.slice(1);
// an ABS button by size and face: "Concave round 11 mm" → "11 mm concave", "Flat oval 8 × 12 mm" → "8 × 12 mm flat oval"
function absButton(id){const b=BUTTONS.find(x=>x.id===id),m=/^(.*?) (\d.*mm)$/.exec(b?.label||'');return m?`${m[2]} ${m[1].replace(/ round$/,'').toLowerCase()}`:'';}
// `brief`: no sizes (the plan line)
function fixationPhrase(side,d,brief=false){
  const fx=fixation(d.fixation);if(!fx)return '';
  if(fx.kind==='screw')return brief?`${d.fixation==='wedge'?'Titanium Wedge':'Biosteon'} screw`:`${d.fixation==='wedge'?'Titanium Wedge':'Biosteon'} ${f(d.screwDiameter)} × ${f(d.screwLength)} mm screw`;
  if(fx.kind==='abs'){const b=absButton(d.button);return FIX[d.fixation]+(b&&!brief?` (${b})`:'');}
  return FIX[d.fixation]||fx.label;
}
// the walkthrough's step names, except the two ends (nothing is chosen or reviewed in a demo)
const DEMO_TITLE={plan:'The plan',review:'The finished construct'};
// A short line for the step as it plays: what happens, with this case's numbers. Kept to a sentence or two.
export function demoCaption(stepId,draft){
  const v=draft.values,fe=v.femur,ti=v.tibia,g=GRAFTS.find(x=>x.id===v.graft),linked=fe.technique==='transtibial'&&ti.technique==='transtibial';
  const steps=stepsForCase(draft),step=steps.find(s=>s.id===stepId),title=DEMO_TITLE[stepId]||step?.label||'';
  const button=['integrated','abs'].includes(fixation(fe.fixation)?.kind);
  const text=(()=>{switch(stepId){
    case 'plan':{const fx=`Femur: ${fixationPhrase('femur',fe,true)}. Tibia: ${fixationPhrase('tibia',ti,true)}.`;
      if(linked)return `${graftName(g)}, trans-tibial: the tibial tunnel first, then the femoral socket through it. ${fx}`;
      if(fe.technique==='retrograde'&&ti.technique==='retrograde')return `${graftName(g)}, all-inside with VersiTomic RR sockets. ${fx}`;
      return `${graftName(g)}. Femur: ${APPROACH[fe.technique]}, ${fixationPhrase('femur',fe,true)}. Tibia: ${APPROACH[ti.technique]}, ${fixationPhrase('tibia',ti,true)}.`;}
    case 'prep':{const size=`${f(v.graftDiameter)} × ${f(v.graftLength)} mm`;
      if(g?.family==='btb')return `The bone–tendon–bone graft, ${size}, with ${f(v.femoralPlugLength)} mm femoral and ${f(v.tibialPlugLength)} mm tibial bone blocks — shown beside the knee.`;
      if(g?.id==='qtb')return `The quad tendon with a ${f(v.tibialPlugLength)} mm tibial bone block, ${size}, QuadCinch at the femoral end — shown beside the knee.`;
      if(g?.family==='quad')return `The quad tendon, all soft tissue, prepared with QuadCinch at its fixation ends: ${size} — shown beside the knee.`;
      if(g?.family==='rapidease')return `The presutured RapidEase quadruple-strand allograft with its preparation loops: ${size} — shown beside the knee.`;
      return `The soft-tissue graft folded over its ${fe.fixation==='glok'?'G-Lok fixed loop ('+f(fe.loop)+' mm)':(FIX[fe.fixation]||'fixation').replace(/ button$/,'')+' loop'}: ${size} — shown beside the knee.`;}
    case 'femur_flexible_pin':return 'Through the anteromedial portal, the curved guide aims the 2.4 mm flexible pin at the femoral ACL footprint; the pin is drilled through the femur.';
    case 'femur_low_profile_pin':return 'The straight 2.4 mm pin goes in through the anteromedial portal and is drilled out the lateral femoral cortex (in deep flexion; shown at 90°).';
    case 'femur_pin':return linked?'Up the reamed tibial tunnel, the offset aimer hooks the back wall; the 2.4 mm pin is drilled into the femur and out the anterolateral cortex.':'The outside-in 2.4 mm guide pin is drilled from the lateral femoral cortex into the joint at the femoral footprint.';
    case 'femur_measure':return fe.technique==='flexible'?`A guide slides over the pin from outside the lateral femur down to bone: the femoral tunnel measures ${f(fe.ttl)} mm.`:fe.technique==='outside_in'?`Read off the placed pin: the femoral tunnel is ${f(fe.ttl)} mm from the joint to the lateral cortex.`:linked?`Measured along the femoral pin: ${f(fe.ttl)} mm from the joint to the lateral cortex.`:`The femoral path measures ${f(fe.ttl)} mm from the joint to the lateral cortex.`;
    case 'femur_ream':
      if(linked)return `The tibial tunnel's ${f(ti.diameter)} mm reamer goes up that tunnel over the femoral pin and reams the femoral socket ${f(fe.socket)} mm deep.`;
      if(fe.technique==='retrograde')return `The RetroReamer enters from the lateral femur, opens its cutting tooth in the joint and reams back toward the cortex: ${f(fe.socket)} mm deep, ${f(fe.diameter)} mm wide.`;
      if(fe.technique==='outside_in')return `The femoral tunnel is reamed over the outside-in pin, ${f(fe.diameter)} mm wide through its full ${f(fe.ttl)} mm.`;
      return `The ${fe.technique==='flexible'?'flexible':'low-profile'} reamer follows the pin in through the anteromedial portal and reams the femoral socket: ${f(fe.socket)} mm deep, ${f(fe.diameter)} mm wide.`;
    case 'femur_cortex_ream':return `A 4.5 mm reamer passes over the same pin${linked?', up the tibial tunnel and socket,':''} through the lateral cortex for the button. Then the pin comes out.`;
    case 'xl_femur':return fe.xlTiming==='after'?'The G-Lok XL accessory is added from outside the knee, on the lateral cortex.':'The G-Lok XL accessory is attached to the femoral button so the two pass together.';
    case 'tibia_measure':return linked?`The tibial aimer sits on the ACL footprint; the tunnel will run ${f(ti.ttl)} mm up from the anteromedial tibia.`:`The tibial path measures ${f(ti.ttl)} mm from the anteromedial tibia to the joint.`;
    case 'tibia_pin':return linked?'The 2.4 mm guide pin is drilled up from the anteromedial tibia — medial to the tubercle, above the pes — into the joint at the footprint.':'The 2.4 mm guide pin is drilled from the anteromedial tibia up to the tibial ACL footprint.';
    case 'tibia_ream':
      if(ti.technique==='retrograde')return ti.blownCortex?`The RetroReamer reams the tibial tunnel through to the cortex, ${f(ti.diameter)} mm wide.`:`The RetroReamer opens in the joint and reams the tibial socket back toward the cortex: ${f(ti.socket)} mm deep, ${f(ti.diameter)} mm wide.`;
      return `The tibial tunnel is reamed over the pin, ${f(ti.diameter)} mm wide through its ${f(ti.ttl)} mm${linked?'. The femoral socket is reamed through it later, with the same reamer':''}.`;
    case 'pass_femur':{
      if(portalPassage(draft))return fixation(fe.fixation)?.kind==='screw'?'The graft comes in through the anteromedial portal and is pushed into the femoral socket, ready for the screw.':'Through the anteromedial portal, the button passes the femoral socket and flips on the lateral cortex; the tails then draw the graft into the socket.';
      if(fe.fixation==='glok')return `The G-Lok button and graft travel up the tibia, across the joint and through the femur; the button flips on the lateral cortex at the fixed ${f(fe.loop)} mm loop.`;
      if(button)return 'The button leads the graft up the tibial tunnel and flips on the lateral femoral cortex; tensioning the tails draws the graft into the socket.';
      return `The graft is pulled up the tibial tunnel, across the joint and into the femoral tunnel${g?.family==='btb'?', bone block first':''}.`;}
    case 'pass_tibia':return 'The tibial end comes in through the same portal and is seated in the tibial socket.';
    case 'fix_femur':return fe.technique==='outside_in'?`From the lateral side, outside in, a ${fixationPhrase('femur',fe)} fixes the femoral end${g?.family==='btb'?' beside the bone block':''}, flush with the cortex.`:`The femoral end is fixed with a ${fixationPhrase('femur',fe)}${g?.family==='btb'?' beside the bone block':''}.`;
    case 'fix_tibia':{const kind=fixation(ti.fixation)?.kind;
      if(kind==='screw')return `The tibial end is fixed with a ${fixationPhrase('tibia',ti)}${g?.family==='btb'||g?.id==='qtb'?' beside the bone block':''}.`;
      // the ABS button goes onto the loops outside the knee and is cinched down to the bone (Nate, Sept 26 2026)
      if(kind==='abs'){const b=absButton(ti.button),concave=BUTTONS.find(x=>x.id===ti.button)?.shape==='concave';return `The ${b?b+' ':''}ABS button goes onto the loops outside the knee, then is cinched down to the tibial cortex${concave?', its prominence seated in the cortical hole':''}.`;}
      return `The tibial end is fixed: ${fixationPhrase('tibia',ti)}.`;}
    case 'trim_tibia':{const t=tibialTrim(draft),bone=t?.trimKind==='bone';return `The projecting ${bone?'bone block':'graft'} is trimmed flush with the tibial cortex${Number.isFinite(t?.trimAmount)?`: ${f(t.trimAmount)} mm comes off`:''}.`;}
    case 'review':return `The ${graftName(g,true)}, held by a ${fixationPhrase('femur',fe)} in the femur and a ${fixationPhrase('tibia',ti)} in the tibia.`;
    default:return '';
  }})();
  return {title,text};
}
// the closing card: what was built, in a few facts
export function demoSummary(draft){
  const v=draft.values,g=GRAFTS.find(x=>x.id===v.graft),state=materializeCase(draft),ev=evaluate(state);
  // the tibial figure the walkthrough shows: inside the bone after any trim (bone blocks and folded grafts), else as planned
  const tibia=['btb','folded'].includes(g?.family)?tibialTrim(draft)?.inBoneGraftInsertion:plannedTibialInsertion(draft);
  return [['Graft',`${graftName(g)} · ${f(v.graftDiameter)} × ${f(v.graftLength)} mm`],['Femur',`${upper(APPROACH[v.femur.technique])} · ${fixationPhrase('femur',v.femur)}`],['Tibia',`${upper(APPROACH[v.tibia.technique])} · ${fixationPhrase('tibia',v.tibia)}`],['Graft in bone',`femur ${f(ev.sides.femur.graftInsertion)} mm · tibia ${f(tibia)} mm`]];
}

// ---- pacing. A step shows its line, waits a moment, plays its animation (the walkthrough's own Preview) and holds on the
// result; a step with little to watch stays up long enough to read its line.
export const PACE={lead:650,hold:1700,read0:1200,perWord:240,still:3800};
// the animation length the model uses for this step (0: plan and review have none)
export function animationFor(stepId,draft){
  if(['plan','review','harvest'].includes(stepId))return 0;
  const side=stepId.startsWith('tibia')||stepId.endsWith('tibia')?'tibia':'femur';
  return recommendedStepDuration(stepId,draft?.values?.[side]?.technique,draft?.values?.[side]?.fixation);
}
export function readingTime(text){const words=String(text||'').trim().split(/\s+/).filter(Boolean).length;return PACE.read0+words*PACE.perWord;}
// {lead, anim, total, plays} in ms. Reduced motion: the model shows each result at once, so only the reading time counts.
export function stepTiming(stepId,draft,caption,{reduced=false}={}){
  const anim=animationFor(stepId,draft),read=readingTime(caption?.text);
  if(!anim)return {lead:0,anim:0,total:Math.max(PACE.still,read),plays:false};
  return {lead:PACE.lead,anim,total:Math.max(PACE.lead+(reduced?0:anim)+PACE.hold,read),plays:true};
}
// the whole run, for the chooser: step count and about how long it takes
export function demoLength(preset){
  const base=buildDemoCase(preset),steps=stepsForCase(base);
  const ms=steps.reduce((sum,step,i)=>{const d=demoCaseAt(base,i);return sum+stepTiming(step.id,d,demoCaption(step.id,d)).total;},0);
  const half=Math.max(1,Math.round(ms/30000)/2),whole=Math.floor(half);
  return {steps:steps.length,ms,minutes:`${whole}${half>whole?'½':''} min`,label:`${steps.length} steps · about ${whole}${half>whole?'½':''} min`};
}

// ---- the player. Steps play one after another (lead-in, animation, hold) with pause, back and next. Time arrives through
// tick(ms) — animation frames in the page, a plain count in the tests — so nothing here reads a clock. io draws:
//   io.count, io.show(index) → timing (puts that step on the model and its line on screen), io.animate(ms), io.pause(),
//   io.resume(), io.cancel(), io.render(status, stepChanged), io.finish()
// Back and Next keep the play state (paused stays paused on the new step, like chapters in a video).
export function createDemoPlayer(io){
  let index=-1,playing=false,done=false,elapsed=0,timing=null,started=false;
  const status=()=>({index,count:io.count,playing,done,elapsed,total:timing?.total||0,fraction:done?1:timing?.total?Math.min(1,elapsed/timing.total):0,animating:!!timing&&started&&!done&&elapsed<timing.lead+timing.anim});
  function go(i){io.cancel();index=Math.max(0,Math.min(io.count-1,i));done=false;elapsed=0;started=false;timing=io.show(index);io.render(status(),true);}
  function finish(){done=true;playing=false;io.finish();io.render(status(),false);}
  const player={
    start(){playing=true;go(0);},
    tick(ms){
      if(!playing||done||!timing)return;
      elapsed+=Math.max(0,Math.min(Number(ms)||0,120)); // a stalled frame (tab away, busy phone) never skips a step
      if(!started&&timing.plays&&elapsed>=timing.lead){started=true;io.animate(timing.anim);}
      if(elapsed>=timing.total){if(index<io.count-1)go(index+1);else finish();return;}
      io.render(status(),false);
    },
    play(){if(playing)return;playing=true;if(done){go(0);return;}if(started)io.resume();io.render(status(),false);},
    pause(){if(!playing)return;playing=false;if(started)io.pause();io.render(status(),false);},
    toggle(){if(playing)player.pause();else player.play();},
    next(){if(done)return;if(index<io.count-1)go(index+1);else finish();},
    back(){go(done?io.count-1:index-1);},
    status
  };
  return player;
}
