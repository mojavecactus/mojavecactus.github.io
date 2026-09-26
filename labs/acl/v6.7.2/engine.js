import {GRAFTS,FIXATIONS,TECHNIQUES,BUTTONS,FIXED_LOOPS,SCREWS,RR_REAMERS,XL,SOURCES,canonicalGraftId} from './catalog.js';
export {GRAFTS,FIXATIONS,TECHNIQUES,BUTTONS,FIXED_LOOPS,SCREWS,RR_REAMERS,SOURCES,canonicalGraftId};
const finite = n => typeof n === 'number' && Number.isFinite(n);
const near = (a,b) => Math.abs(a-b)<1e-7;
const isObject = x => x && typeof x === 'object' && !Array.isArray(x);
const fm = n => Number(n.toFixed(2)).toString();
const sideName = s => s === 'femur' ? 'Femoral' : 'Tibial';
const graftById = id => GRAFTS.find(x=>x.id===canonicalGraftId(id));
const linkedState = state => ['femur','tibia'].every(side=>state?.[side]?.technique==='transtibial');
export const FIXED_JOINT_SPAN_MM=22;
// Team rule (Sept 25 2026): a titanium screw is flagged only when at least half of its length sits against soft tendon.
export const SCREW_SOFT_TISSUE_LIMIT=.5;
// Case helpers use only supplied measurements; render defaults stay internal.
export function plannedFemoralInsertion(caseOrState){
  const state=isObject(caseOrState?.values)?caseOrState.values:caseOrState,data=state?.femur;
  if(!isObject(data))return null;
  if(data.fixation==='glok'&&graftById(state.graft)?.family==='folded'){
    if(!finite(data.ttl)||!finite(data.loop))return null;
    return data.ttl-data.loop+(finite(state.foldHeight)?state.foldHeight:4);
  }
  const depth=data.technique==='outside_in'||(data.technique==='retrograde'&&data.blownCortex)?data.ttl:data.socket;
  return finite(depth)?depth:null;
}
// Prepared length is end to end: bone plugs are already included.
export function plannedTibialInsertion(caseOrState){
  const state=isObject(caseOrState?.values)?caseOrState.values:caseOrState,insertion=plannedFemoralInsertion(state);
  return finite(state?.graftLength)&&finite(insertion)?state.graftLength-insertion-FIXED_JOINT_SPAN_MM:null;
}
export function tibialTrim(caseOrState){
  const state=isObject(caseOrState?.values)?caseOrState.values:caseOrState,family=graftById(state?.graft)?.family,raw=plannedTibialInsertion(state);
  const empty={graftInsertion:null,rawGraftInsertion:null,inBoneGraftInsertion:null,graftOutsideBone:null,bonePlugOutside:null,retainedBonePlugLength:null,softTissueOutside:null,plannedBoneTrim:null,plannedSoftTissueTrim:null,trimAmount:null,trimKind:null,eligible:false};
  if(!['btb','folded'].includes(family)||!finite(raw)||!finite(state?.tibia?.ttl)||(family==='btb'&&!finite(state.tibialPlugLength)))return empty;
  const data=state.tibia,ttl=data.ttl,block=family==='btb'?state.tibialPlugLength:0,outside=Math.max(0,raw-ttl);
  const through=['straight','transtibial'].includes(data.technique)||(data.technique==='retrograde'&&data.blownCortex);
  const boneEligible=family==='btb'&&ttl>0&&block>0&&outside>1e-7&&outside<block-1e-7;
  const softEligible=family==='folded'&&through&&ttl>0&&outside>1e-7;
  const plannedBoneTrim=boneEligible?outside:0,plannedSoftTissueTrim=softEligible?outside:0;
  return {graftInsertion:raw,rawGraftInsertion:raw,inBoneGraftInsertion:Math.min(raw,ttl),graftOutsideBone:outside,bonePlugOutside:Math.min(Math.max(0,block),outside),retainedBonePlugLength:Math.max(0,block-outside),softTissueOutside:Math.max(0,outside-Math.max(0,block)),plannedBoneTrim,plannedSoftTissueTrim,trimAmount:plannedBoneTrim+plannedSoftTissueTrim,trimKind:boneEligible?'bone':softEligible?'soft-tissue':null,eligible:boneEligible||softEligible};
}
const fixationById = id => FIXATIONS.find(x=>x.id===id);
const positive = x => finite(x) && x>0;

export function createDefaultState(graftId='folded') {
  const graft=graftById(graftId)?.id || 'folded';
  const state={schema:1,graft,graftDiameter:8,graftLength:71,jointSpan:FIXED_JOINT_SPAN_MM,foldHeight:4,flipAllowance:7,
    femoralPlugLength:20,femoralPlugDiameter:9,tibialPlugLength:20,tibialPlugDiameter:9,
    femur:{technique:'flexible',fixation:'glok',ttl:35,socket:31,diameter:9,aperture:4.5,graftInsertion:24,loop:15,screwDiameter:8,screwLength:23,button:'abs11',xl:false,xlTiming:'before',blownCortex:false,apertureOverride:false,plugDiameterOverride:false,boneQuality:'normal'},
    tibia:{technique:'straight',fixation:'biosteon',ttl:40,socket:40,diameter:9,aperture:9,graftInsertion:25,loop:15,screwDiameter:9,screwLength:28,button:'abs11',xl:false,xlTiming:'before',blownCortex:false,apertureOverride:false,plugDiameterOverride:false,boneQuality:'normal'}};
  // These are illustrative starting measurements, not clinical recommendations.
  if(graft==='rapidease'||graft==='quad_soft') {
    state.graftDiameter=9; state.graftLength=67;
    Object.assign(state.femur,{technique:'retrograde',fixation:graft==='rapidease'?'open_loop':'quadcinch',socket:25,graftInsertion:20,diameter:9});
    Object.assign(state.tibia,{technique:'retrograde',fixation:graft==='rapidease'?'open_loop_abs':'quadcinch_abs',socket:25,graftInsertion:20,diameter:9,aperture:4.5});
  }
  if(graft==='qtb') {
    state.graftDiameter=9;state.graftLength=72;
    Object.assign(state.femur,{fixation:'quadcinch',socket:30,graftInsertion:25});
    Object.assign(state.tibia,{fixation:'biosteon',graftInsertion:20,screwDiameter:8,screwLength:23});
  }
  if(graft.startsWith('btb')) {
    state.graftDiameter=9;state.graftLength=67;
    Object.assign(state.femur,{fixation:'biosteon',socket:25,graftInsertion:20,screwDiameter:8,screwLength:23});
    Object.assign(state.tibia,{graftInsertion:20,screwDiameter:8,screwLength:23});
  }
  state.femur.graftInsertion=plannedFemoralInsertion(state);state.tibia.graftInsertion=plannedTibialInsertion(state);
  return state;
}

// Safety bounds protect the rendering pipeline; zero/negative values remain visible
// and are rejected by evaluate. These are not anatomical or device size limits.
export const INPUT_BOUNDS={length:[-100,300],diameter:[-50,50],graftLength:[-100,600],allowance:[-50,100]};
export function sanitizeState(input) {
  const original=isObject(input)?input:{};
  const state=createDefaultState(original.graft);
  const inputIssues=[];
  const inputLinked=['femur','tibia'].every(side=>(original[side]?.technique??state[side].technique)==='transtibial');
  const prior=Array.isArray(original._inputIssues)?original._inputIssues.filter(x=>isObject(x)&&typeof x.path==='string'&&typeof x.actual==='string'&&typeof x.reason==='string'&&finite(x.replacement)):[];
  function readNumber(value,fallback,path,bounds) {
    if(value===undefined)return fallback;
    const converted=(typeof value==='number'||(typeof value==='string'&&value.trim()!==''))?Number(value):NaN;
    if(!Number.isFinite(converted)) {
      inputIssues.push({path,actual:String(value),replacement:fallback,reason:'not a finite number'});
      return fallback;
    }
    const clipped=Math.min(bounds[1],Math.max(bounds[0],converted));
    if(clipped!==converted)inputIssues.push({path,actual:String(converted),replacement:clipped,reason:`outside display bounds ${bounds[0]}–${bounds[1]} mm`});
    else {
      const previous=prior.find(x=>x.path===path&&x.replacement===clipped);
      if(previous)inputIssues.push(previous);
    }
    return clipped;
  }
  if(typeof original.graft==='string')state.graft=canonicalGraftId(original.graft);
  for(const key of ['graftDiameter','graftLength','foldHeight','flipAllowance','femoralPlugLength','tibialPlugLength']) {
    const bounds=key.includes('Diameter')?INPUT_BOUNDS.diameter:key==='graftLength'?INPUT_BOUNDS.graftLength:['foldHeight','flipAllowance'].includes(key)?INPUT_BOUNDS.allowance:INPUT_BOUNDS.length;
    state[key]=readNumber(original[key],state[key],key,bounds);
  }
  for(const side of ['femur','tibia']) {
    const raw=isObject(original[side])?original[side]:{};
    for(const key of ['technique','fixation','button','boneQuality','xlTiming'])if(typeof raw[key]==='string')state[side][key]=raw[key];
    if(typeof raw.xl==='boolean')state[side].xl=raw.xl;
    if(typeof raw.blownCortex==='boolean')state[side].blownCortex=raw.blownCortex;
    if(typeof raw.apertureOverride==='boolean')state[side].apertureOverride=raw.apertureOverride;
    if(typeof raw.plugDiameterOverride==='boolean')state[side].plugDiameterOverride=raw.plugDiameterOverride;
    for(const key of ['ttl','socket','diameter','aperture','graftInsertion','loop','screwDiameter','screwLength']) {
      const bounds=['diameter','aperture','screwDiameter'].includes(key)?INPUT_BOUNDS.diameter:INPUT_BOUNDS.length;
      const derived=(inputLinked&&side==='femur'&&key==='diameter')||key==='graftInsertion'||(key==='socket'&&((side==='tibia'&&['straight','transtibial'].includes(state[side].technique))||(side==='femur'&&state[side].technique==='outside_in')))||(key==='socket'&&state[side].technique==='retrograde'&&state[side].blownCortex);
      if(!derived)state[side][key]=readNumber(raw[key],state[side][key],`${side}.${key}`,bounds);
    }
  }
  if(linkedState(state))state.femur.diameter=state.tibia.diameter;
  if(state.femur.technique==='outside_in'){
    state.femur.socket=state.femur.ttl;
    if(fixationById(state.femur.fixation)&&!allowedFixations(state.graft,'femur',state).includes(state.femur.fixation))state.femur.fixation='';
  }
  if(['straight','transtibial'].includes(state.tibia.technique)){state.tibia.socket=state.tibia.ttl;state.tibia.blownCortex=false;}
  for(const side of ['femur','tibia']) {
    if(state[side].technique==='retrograde'&&state[side].blownCortex)state[side].socket=state[side].ttl;
    const raw=isObject(original[side])?original[side]:{};
    const nominal=nominalAperture(state,side);
    // Legacy saved custom openings are retained as explicit overrides, not erased.
    if(typeof raw.blownCortex!=='boolean' && raw.aperture!==undefined && finite(nominal) && !near(state[side].aperture,nominal)) {
      state[side].apertureOverride=true;
      state._migrationNotes??=[];
      state._migrationNotes.push({side,message:`Saved ${state[side].aperture} mm opening was preserved as an explicit cortical-opening override; nominal passage is ${nominal} mm.`});
    }
    if(!state[side].blownCortex && !state[side].apertureOverride && finite(nominal))state[side].aperture=nominal;
  }
  // Each bone block takes the prepared graft diameter unless that block's diameter is set separately (Sept 25 2026).
  const family=graftById(state.graft)?.family,blocks={femur:family==='btb',tibia:family==='btb'||state.graft==='qtb'};
  for(const side of ['femur','tibia']){
    const key=side==='femur'?'femoralPlugDiameter':'tibialPlugDiameter';
    if(!blocks[side])state[side].plugDiameterOverride=false;
    else state[key]=state[side].plugDiameterOverride?readNumber(original[key],state.graftDiameter,key,INPUT_BOUNDS.diameter):state.graftDiameter;
  }
  for(const side of ['femur','tibia'])if(side!=='femur'||!state[side].blownCortex||fixationById(state[side].fixation)?.kind!=='integrated')state[side].xl=false;
  state.jointSpan=FIXED_JOINT_SPAN_MM;
  state.femur.graftInsertion=plannedFemoralInsertion(state);
  state.tibia.graftInsertion=plannedTibialInsertion(state);
  if(inputIssues.length)state._inputIssues=inputIssues;
  return state;
}

export function nominalAperture(state,side) {
  const data=state?.[side];
  if(!data||!['femur','tibia'].includes(side))return null;
  if(data.technique==='retrograde'){const reamer=RR_REAMERS.find(x=>near(x.diameter,Number(data.diameter)));return reamer?(side==='tibia'?4.5:reamer.shaft):null;}
  if(side==='tibia'&&['straight','transtibial'].includes(data.technique))return finite(Number(data.diameter))?Number(data.diameter):null;
  if(side==='femur'&&data.technique==='outside_in')return finite(data.diameter)?data.diameter:null;
  if(side==='femur'&&fixationById(data.fixation)?.kind==='integrated')return 4.5;
  if(side==='femur'&&['flexible','low_profile','transtibial'].includes(data.technique)&&fixationById(data.fixation)?.kind==='screw'&&!(Number(data.socket)>=Number(data.ttl)))return 2.4;
  if(side==='femur'&&(data.technique==='outside_in'||(finite(Number(data.socket))&&finite(Number(data.ttl))&&Number(data.socket)>=Number(data.ttl))))return finite(Number(data.diameter))?Number(data.diameter):null;
  return null;
}

// The guide distinguishes normal/hard bone from a specific BTB tibial soft-bone exception.
function biosteonCandidates(state,graft,side,result) {
  const data=state[side];
  if(data.fixation!=='biosteon')return null;
  if(graft.id==='qtb'&&result.bonePlug)return {candidates:[],reason:'This BTB/soft-tissue guide does not establish QTB bone-block sizing; no automatic BTB extrapolation is made.'};
  const btb=graft.family==='btb';
  if(data.boneQuality==='soft'&&!(btb&&side==='tibia'))return {candidates:[],reason:'The guide provides a softer-bone adjustment only for BTB tibial diameter. No numeric recommendation is inferred for this case.'};
  if(!['normal','soft'].includes(data.boneQuality))return {candidates:[],reason:'Select normal/hard or softer bone to identify the applicable guide statement.'};
  const base=btb?(side==='femur'?data.diameter:result.plugDiameter):(side==='femur'?data.diameter:state.graftDiameter);
  const range=btb?(data.boneQuality==='soft'?[base-1,base]:[base-2,base-1]):[base,base+1];
  const lengths=side==='femur'?[23]:btb?[23,28]:[28,35];
  if(!btb&&data.diameter<6)return {candidates:[],range,lengths,reason:'The guide explicitly rejects a 6 mm screw in a 5 mm femoral tunnel. No Biosteon size is inferred for this sub-6 mm reamed path.'};
  const catalogCandidates=SCREWS.filter(x=>x.family==='biosteon'&&x.diameter>=range[0]-1e-7&&x.diameter<=range[1]+1e-7&&lengths.includes(x.length));
  const candidates=catalogCandidates.filter(x=>x.length<=data.ttl+1e-7&&x.length<=data.socket+1e-7).map(x=>({...x,label:`${x.diameter} × ${x.length} mm`,patch:{[side]:{screwDiameter:x.diameter,screwLength:x.length}},...(btb&&side==='tibia'?{matchesBlockLength:near(x.length,result.plugLength)}:{})}));
  const removed=catalogCandidates.length-candidates.length;
  const reference=btb?(side==='femur'?'tunnel':'bone-block'):(side==='femur'?'tunnel':'prepared graft');
  let reason=`${fm(base)} mm ${reference}: guide diameter range ${fm(range[0])}–${fm(range[1])} mm; guide length ${lengths.join(' or ')} mm. `;
  if(!catalogCandidates.length)reason+='No published Biosteon size pair matches that range. ';
  if(removed)reason+=`${removed} catalog option${removed===1?' was':'s were'} excluded because length exceeds the entered total tunnel or reamed depth. `;
  if(btb&&side==='tibia')reason+=`The guide generally matches length to the ${fm(result.plugLength)} mm bone block; ${candidates.some(x=>x.matchesBlockLength)?'matching candidates are identified.':'no listed candidate matches that block length exactly, so length needs review.'} `;
  return {candidates,range,lengths,reason,source:SOURCES.biosteonSizing};
}

export function allowedFixations(graft,side,state){
  const id=canonicalGraftId(typeof graft==='string'?graft:graft?.id),definition=graftById(id);
  if(!definition||!['femur','tibia'].includes(side))return [];
  let choices;
  if(id==='qtb')choices=side==='femur'?['quadcinch']:['biosteon','wedge'];
  else if(definition.family==='folded')choices=side==='femur'?['glok','procinch_st','procinch_rt','biosteon']:['biosteon'];
  else if(definition.family==='rapidease')choices=side==='femur'?['open_loop','biosteon']:['open_loop_abs','biosteon'];
  else if(definition.family==='quad')choices=side==='femur'?['quadcinch','biosteon']:['quadcinch_abs','biosteon'];
  else choices=side==='femur'?['open_loop','biosteon','wedge']:['biosteon','wedge'];
  const data=(state?.values||state)?.[side];
  if(side==='femur'&&data?.technique==='outside_in')return definition.family==='btb'?['biosteon','wedge']:['biosteon'];
  if(side==='tibia'&&data?.technique==='retrograde')choices=choices.filter(id=>fixationById(id)?.kind==='abs'||(id==='biosteon'&&data.blownCortex));
  return choices;
}
export function allowedTechniques(graft,side,state) {
  const definition=graftById(typeof graft==='string'?graft:graft?.id);
  if(!definition||!TECHNIQUES[side])return [];
  const other=state?.[side==='femur'?'tibia':'femur'];
  return TECHNIQUES[side].filter(x=>!(side==='tibia'&&['folded','btb'].includes(definition.family)&&x.id==='retrograde')&&!(x.id==='retrograde'&&other?.technique==='retrograde'&&!definition.allInside)).map(x=>x.id);
}

// Interference-screw seating (team rule, Sept 25 2026). Beside a bone block the screw is seated flush with the block where it
// fits: femur, head at the block's joint-side end unless the reamed socket is too short for that; tibia, head at the block's
// outer end (the trimmed end when it projects) unless the screw would then reach the joint. It is never proud of the tunnel
// aperture. Without a block it sits flush with the aperture. Axial positions are mm from the joint aperture.
// An outside-in femoral tunnel takes its screw from the lateral side, outside in (Nate, Sept 26 2026): it is seated like a
// tibial screw, head at the block's outer end or flush with the lateral cortex.
export const screwFromOutside=(side,data)=>side==='tibia'||data?.technique==='outside_in';
export function screwSeat(side,data,insertion,plugLength,bonePlug){
  const length=data.screwLength;
  if(!screwFromOutside(side,data)){
    const block=Math.max(0,insertion-plugLength),head=bonePlug?Math.min(block,Math.max(0,data.socket-length)):0;
    return {span:[head,head+length],head,flushWithBlock:!!bonePlug&&near(head,block),flushWithAperture:near(head,0)};
  }
  const block=Math.min(insertion,data.ttl),head=bonePlug?Math.min(data.ttl,Math.max(length,block)):data.ttl;
  return {span:[head-length,head],head,flushWithBlock:!!bonePlug&&near(head,block),flushWithAperture:near(head,data.ttl)};
}

export function evaluate(input) {
  const state=sanitizeState(input),graft=graftById(state.graft)||{id:state.graft,label:'Unknown graft preparation',family:'unknown',allInside:false};
  const issues=[],recommendations=[],products=[],sides={};
  const add=(id,level,title,message,side)=>issues.push({id,level,title,message,...(side?{side}:{})});
  const advise=(id,title,detail,side,source,patch,candidates)=>recommendations.push({id,title,detail,...(side?{side}:{}),...(source?{source}:{}),...(patch?{patch}:{}),...(candidates?{candidates}:{})});
  for(const issue of state._inputIssues||[])add('input-'+issue.path,'error','Measurement needs correction',`${issue.path}: ${issue.actual} is ${issue.reason}. The illustration uses ${issue.replacement} mm until corrected.`,issue.path.startsWith('femur.')?'femur':issue.path.startsWith('tibia.')?'tibia':undefined);
  for(const note of state._migrationNotes||[])add(`${note.side}-aperture-migration`,'info','Saved cortical opening preserved',note.message,note.side);
  if(graft.family==='unknown')add('unknown-graft','error','Unknown graft choice','Select one of the five supported preparations. Imported unsupported choices are not automatically replaced.');
  for(const [key,label] of [['graftDiameter','Prepared graft diameter'],['graftLength','Prepared graft length'],['jointSpan','Joint span']])if(!positive(state[key]))add('positive-'+key,'error',`${label} must be positive`,'The entered value is retained; the model uses only display safeguards.');
  if((state.femur.technique==='transtibial')!==(state.tibia.technique==='transtibial'))add('linked-transtibial','error','Trans-tibial is a linked workflow','Select trans-tibial on both bones; femoral access passes through the tibial tunnel.');
  const allInside=state.femur.technique==='retrograde'&&state.tibia.technique==='retrograde';
  if(allInside&&!graft.allInside)add('all-inside-scope','error','All-inside is outside this preparation’s scope','This sandbox supports all-inside only for quad autograft and quadruple-strand RapidEase.');
  if(graft.id==='qtb')add('qtb-orientation','info','QTB orientation is fixed','QuadCinch prepares the femoral soft-tissue end. The tibial bone block is fixed with Biosteon or Titanium Wedge.');
  if(graft.id==='rapidease') {
    products.push({side:'graft',label:'RapidEase quadruple strand',sku:'4564SC',detail:'50–70 mm length · 9–13 mm diameter',source:SOURCES.rapidease});
    if(state.graftLength<50||state.graftLength>70||state.graftDiameter<9||state.graftDiameter>13)add('rapid-catalog-envelope','warning','RapidEase entry is outside the catalog sizes','Catalog sizes are 50–70 mm length and 9–13 mm diameter. The entered values are retained.');
  }
  for(const side of ['femur','tibia']) {
    const data=state[side],label=sideName(side),fix=fixationById(data.fixation),abs=fix?.kind==='abs',integrated=fix?.kind==='integrated',screw=fix?.kind==='screw';
    const bonePlug=graft.family==='btb'||(graft.id==='qtb'&&side==='tibia');
    const plugLength=bonePlug?state[side==='femur'?'femoralPlugLength':'tibialPlugLength']:0;
    const plugDiameter=bonePlug?state[side==='femur'?'femoralPlugDiameter':'tibialPlugDiameter']:0;
    const glok=data.fixation==='glok'&&side==='femur'&&graft.family==='folded';
    const insertion=side==='femur'?plannedFemoralInsertion(state):plannedTibialInsertion(state);
    const minSocket=glok?insertion+state.flipAllowance:null;
    const inBoneGraftInsertion=Math.min(insertion,data.ttl),graftOutsideBone=Math.max(0,insertion-data.ttl),bonePlugOutside=bonePlug?Math.min(Math.max(0,plugLength),graftOutsideBone):0,retainedBonePlugLength=bonePlug?Math.max(0,plugLength-graftOutsideBone):0,softTissueOutside=Math.max(0,graftOutsideBone-(bonePlug?Math.max(0,plugLength):0));
    const trim=side==='tibia'?tibialTrim(state):null,plannedBoneTrim=trim?.plannedBoneTrim||0,plannedSoftTissueTrim=trim?.plannedSoftTissueTrim||0,trimAmount=trim?.trimAmount||0,trimKind=trim?.trimKind||null;
    const insertionForFit=trimAmount>0?inBoneGraftInsertion:insertion;
    const rr=data.technique==='retrograde'?RR_REAMERS.find(x=>near(x.diameter,data.diameter)):null;
    const catalogScrew=screw?SCREWS.find(x=>x.family===data.fixation&&near(x.diameter,data.screwDiameter)&&near(x.length,data.screwLength)):null;
    let fixationSku=fix?.sku||null;
    if(data.fixation==='glok')fixationSku=FIXED_LOOPS.includes(data.loop)?'0234101'+String(data.loop).padStart(3,'0'):null;
    if(screw)fixationSku=catalogScrew?.sku||null;
    let buttonSpec=abs?BUTTONS.find(x=>x.id===data.button)||null:integrated?{id:data.fixation,sku:fixationSku,label:fix.label,shape:'integrated',width:4,length:13,projection:0,thickness:1.5,thicknessProvisional:true,source:fix.source}:null;
    if(buttonSpec)buttonSpec={...buttonSpec,xl:data.xl};
    const bridge=data.ttl-data.socket;
    const loopGap=data.ttl-insertion;
    const nominal=nominalAperture(state,side);
    // Axial overlap describes this illustration only; no clinical engagement threshold is inferred.
    const seat=screw?screwSeat(side,data,insertion,plugLength,bonePlug):null,screwAxialSpan=seat?seat.span:null;
    const plugAxialSpan=bonePlug?[insertion-plugLength,insertion]:null;
    const screwPlugOverlap=screw&&bonePlug?Math.max(0,Math.min(screwAxialSpan[1],plugAxialSpan[1])-Math.max(screwAxialSpan[0],plugAxialSpan[0])):null;
    sides[side]={...data,graftInsertion:insertion,rawGraftInsertion:insertion,inBoneGraftInsertion,graftOutsideBone,bonePlugOutside,retainedBonePlugLength,softTissueOutside,plannedBoneTrim,plannedSoftTissueTrim,trimAmount,trimKind,bridge,minSocket,aperture:data.aperture,nominalAperture:nominal,shaftDiameter:rr?.shaft??null,reamerSku:rr?.sku??null,fixationLabel:fix?.label||'Unknown fixation',fixationSku,buttonSpec,bonePlug,plugLength,plugDiameter,loopGap,screwPlugOverlap,screwAxialSpan,screwSeat:seat?{head:seat.head,flushWithBlock:seat.flushWithBlock,flushWithAperture:seat.flushWithAperture}:null,plugAxialSpan,availableScrewLengths:[...new Set(SCREWS.filter(x=>x.family===data.fixation&&near(x.diameter,data.screwDiameter)).map(x=>x.length))].sort((a,b)=>a-b)};
    if(!['before','after'].includes(data.xlTiming))add(`${side}-xl-timing`,'error','Unknown XL timing','Choose before or after femoral passage.',side);
    if(data.technique==='retrograde'&&data.blownCortex&&data.aperture<data.diameter-1e-7)add(`${side}-blown-aperture`,'error',`${label} opening is smaller than the through-reamed path`,`${fm(data.diameter)} mm open-blade withdrawal makes a full-diameter cortical path; the ${fm(data.aperture)} mm entered opening is smaller.`,side);
    if(!['normal','soft'].includes(data.boneQuality))add(`${side}-bone-quality`,'error','Unknown bone-quality choice','Select normal/hard or softer bone. An imported unknown choice is not assumed to be normal.',side);
    if((data.blownCortex||data.apertureOverride)&&finite(nominal)&&data.aperture<nominal-1e-7)add(`${side}-aperture-below-nominal`,'error',`${label} opening is below the selected instrument passage`,`${fm(data.aperture)} mm entered opening is smaller than the ${fm(nominal)} mm nominal path. An enlargement override cannot reduce the instrument diameter.`,side);
    if(!allowedFixations(graft.id,side,state).includes(data.fixation))add(`${side}-fixation-scope`,'error',`${label} fixation is outside the supported plan`,'Choose a fixation supported for this graft end.',side);
    if(!allowedTechniques(graft.id,side).includes(data.technique))add(`${side}-technique-scope`,'error',`${label} reaming is outside this preparation’s scope`,'Choose a supported method for this graft and bone.',side);
    for(const [key,title] of [['ttl','total tunnel length'],['socket','reamed socket depth'],['diameter','reamed diameter'],['aperture','cortical opening']])if(!positive(data[key]))add(`${side}-positive-${key}`,'error',`${label} ${title} must be positive`,'Zero or negative measurements cannot describe a physical construct. The scene remains available for correction.',side);
    if(inBoneGraftInsertion<20-1e-7)add(`${side}-insertion-minimum`,'error',`${label} insertion is below 20 mm`,`${fm(inBoneGraftInsertion)} mm within bone is below the 20 mm planning minimum by ${fm(20-inBoneGraftInsertion)} mm.`,side);
    if(!positive(insertion))add(`${side}-insertion-positive`,'error',`${label} graft insertion is not positive`,glok?'The selected loop, total tunnel and graft-fold height produce no positive graft engagement.':'Enter the planned graft length within this bone.',side);
    if(insertionForFit>data.socket+1e-7)add(`${side}-insertion-socket`,'error',`${label} graft exceeds the socket`,`${fm(insertionForFit)} mm insertion exceeds ${fm(data.socket)} mm reamed depth.`,side);
    if(insertion>data.ttl+1e-7&&!trimAmount)add(`${side}-insertion-ttl`,'error',`${label} graft extends past the cortex`,`${fm(insertion)} mm insertion exceeds ${fm(data.ttl)} mm total tunnel length.`,side);
    if(side==='tibia'&&graft.family==='btb'&&graftOutsideBone>0){
      if(softTissueOutside>1e-7)add('tibia-trim-tendon','error','Tibial projection reaches the soft tendon',`${fm(graftOutsideBone)} mm projects beyond the cortex, including ${fm(softTissueOutside)} mm of soft tissue. Bone-only trimming cannot resolve this length.`,side);
      else if(retainedBonePlugLength<=1e-7)add('tibia-trim-entire-block','error','Trimming would remove the entire tibial block',`${fm(graftOutsideBone)} mm projects beyond the cortex and no tibial bone block would remain within the tunnel.`,side);
    }
    if(data.socket>data.ttl+1e-7)add(`${side}-socket-overrun`,'error',`${label} socket extends past the cortex`,`${fm(data.socket)} mm depth exceeds the ${fm(data.ttl)} mm bone path by ${fm(data.socket-data.ttl)} mm.`,side);
    if(data.aperture>data.diameter+1e-7)add(`${side}-aperture-enlarged`,'warning',`${label} outer opening exceeds the socket diameter`,'The separately entered enlarged cortical opening is shown as measured; it does not change the socket diameter.',side);
    if(state.graftDiameter>data.diameter+1e-7)add(`${side}-graft-diameter`,'error',`${label} graft is wider than the reamed path`,`${fm(state.graftDiameter)} mm measured prepared graft diameter exceeds ${fm(data.diameter)} mm reamed diameter.`,side);
    if(data.technique==='retrograde') {
      if(!rr)add(`${side}-rr-size`,'error',`${label} RR size has no catalog match`,`No documented VersiTomic RR head matches ${fm(data.diameter)} mm. Do not infer a shaft diameter from an unavailable size.`,side);
      else {
        products.push({side,label:'VersiTomic RR',sku:rr.sku,detail:`${rr.diameter} mm head · ${rr.shaft} mm shaft`,source:rr.source});
        if(data.aperture<rr.shaft-1e-7)add(`${side}-rr-aperture`,'error',`${label} opening is smaller than the RR shaft`,`${rr.diameter} mm head uses a ${rr.shaft} mm shaft. The actual cortical opening must account for that path.`,side);
      }
      if(bridge<=0&&!data.blownCortex)add(`${side}-rr-no-bridge`,'error',`${label} retrograde socket has no remaining bridge`,'The entered reaming depth reaches or passes the far cortex; this is not a contained socket.',side);
    }
    if(side==='tibia'&&['straight','transtibial'].includes(data.technique)&&(data.socket<data.ttl-1e-7||data.aperture<data.diameter-1e-7))add(`${side}-full-tunnel-shape`,'warning','Straight tibial tunnel dimensions need review','A conventional through-reamed tunnel has reamed depth equal to total tunnel length and an outer opening at the reamed diameter. Your independently entered geometry is retained.',side);
    if(bonePlug) {
      if(!positive(plugLength)||!positive(plugDiameter))add(`${side}-plug-positive`,'error',`${label} bone-block dimensions must be positive`,'Enter the independently measured plug length and diameter.',side);
      if(plugDiameter>data.diameter+1e-7)add(`${side}-plug-diameter`,'error',`${label} bone block exceeds the reamed diameter`,`${fm(plugDiameter)} mm plug does not fit within the ${fm(data.diameter)} mm modeled path.`,side);
      if(plugLength>insertion+1e-7)add(`${side}-plug-insertion`,'error',`${label} bone block exceeds the entered insertion`,'The model places the block at the graft end; this insertion would leave part of the block outside the bone aperture.',side);
    }
    if(glok) {
      if(!FIXED_LOOPS.includes(data.loop))add(`${side}-glok-loop-catalog`,'error','G-Lok loop is not a catalog size','Available fixed loops are 15–50 mm in 5 mm increments. The entered loop remains unchanged.',side);
      if(state.foldHeight<0||state.flipAllowance<=0)add(`${side}-glok-allowance`,'error','G-Lok allowances need correction','Graft-fold height cannot be negative and flip allowance must be positive.',side);
      if(data.socket<minSocket-1e-7)add(`${side}-glok-flip-space`,'error','G-Lok socket lacks flip allowance',`The scoped calculation gives ${fm(insertion)} mm graft engagement plus ${fm(state.flipAllowance)} mm flip allowance = ${fm(minSocket)} mm minimum socket.`,side);
      if(minSocket>data.ttl+1e-7)add(`${side}-glok-min-ttl`,'error','G-Lok calculated socket exceeds the total tunnel','This loop and fold/flip allowance cannot fit inside the entered bone path.',side);
      if(data.socket<minSocket&&minSocket>0&&minSocket<=data.ttl)advise(`${side}-glok-socket`,'Chart-derived minimum socket',`${fm(minSocket)} mm follows only the G-Lok calculation for the entered loop and allowances.`,side,SOURCES.glokChart,{[side]:{socket:minSocket}});
    }
    if(integrated) {
      if(data.aperture<4.5-1e-7)add(`${side}-button-passage`,'error',`${label} button-passage opening is below 4.5 mm`,'The cortical opening must accommodate the 4.5 mm button-passage path.',side);
      if(data.aperture>4.5+1e-7&&!data.xl)add(`${side}-button-enlarged-path`,'warning','G-Lok XL may be required','G-Lok XL may be required',side);
      if(side==='femur'&&data.blownCortex&&!data.xl)advise('femur-xl','G-Lok XL may be required','Add a G-Lok XL accessory to the existing femoral button.',side,SOURCES.glok,{femur:{xl:true}});
      if(data.aperture>=13&&!data.xl)add(`${side}-button-footprint`,'error',`${label} opening spans the whole button length`,'A 13 mm button cannot bridge a circular opening of this diameter in the simplified model.',side);
      if(loopGap<0)add(`${side}-negative-loop-gap`,'error','The modeled suspension gap is negative','The graft end extends beyond the button’s cortical plane.',side);
    }
    if(abs) {
      if(!buttonSpec)add(`${side}-abs-selection`,'error','Select a known ABS button','This imported button choice is not in the reviewed catalog.',side);
      else {
        const span=buttonSpec.outerDiameter??buttonSpec.width;
        if(buttonSpec.projection>0&&buttonSpec.projection>=data.aperture-1e-7)add(`${side}-abs-projection`,'error','Concave ABS projection does not clear the opening',`${buttonSpec.projection} mm projection must be smaller than the actual ${fm(data.aperture)} mm cortical opening.`,side);
        if(data.aperture>=span-1e-7)add(`${side}-abs-footprint`,'error','ABS footprint does not surround the opening',`${fm(data.aperture)} mm opening reaches the button’s ${span} mm narrow footprint. Cortical support cannot be inferred.`,side);
        if(!(data.technique==='retrograde'&&!data.blownCortex&&bridge>0)&&(data.aperture<buttonSpec.suggested[0]||data.aperture>buttonSpec.suggested[1]))add(`${side}-abs-suggested`,'warning','ABS is outside the brochure’s suggested range',`Brochure suggestion: ${buttonSpec.suggested[0]}–${buttonSpec.suggested[1]} mm tunnel. This is advisory, separate from projection clearance and cortical support.`,side);
        products.push({side,label:buttonSpec.label,sku:buttonSpec.sku,detail:`${buttonSpec.projection?buttonSpec.projection+' mm projection · ':''}${buttonSpec.thickness} mm rim`,source:buttonSpec.source});
      }
      const candidates=BUTTONS.filter(b=>b.projection<data.aperture&&(b.outerDiameter??b.width)>data.aperture&&data.aperture>=b.suggested[0]&&data.aperture<=b.suggested[1]);
      if(candidates.length)advise(`${side}-abs-candidates`,'ABS sizes to review',`${candidates.map(b=>b.label).join('; ')} clear the entered opening and lie within brochure suggested ranges. `,side,SOURCES.procinch);
    }
    if(data.xl) {
      if(side!=='femur'||!integrated||abs)add(`${side}-xl-scope`,'error','XL is a femoral integrated-button accessory','XL is not standalone fixation and is not paired with ABS in this sandbox.',side);
      if(side==='femur'&&integrated&&data.xlTiming==='before'&&data.aperture<XL.passageWidth-1e-7)add(`${side}-xl-passage`,'error','Preattached XL is wider than the cortical opening',`The ${XL.passageWidth} mm XL passage width exceeds the ${fm(data.aperture)} mm cortical opening.`,side);
      products.push({side,label:'G-Lok XL accessory',sku:XL.sku,detail:data.xlTiming==='after'?'Attach after femoral passage':'Attach before femoral passage',source:XL.source});
    }
    if(screw) {
      const softEnd=Math.max(0,Math.min(data.ttl,insertion-plugLength)),screwSoftTissueOverlap=bonePlug?Math.max(0,Math.min(screwAxialSpan[1],softEnd)-Math.max(screwAxialSpan[0],0)):0;
      const screwSpan=Math.max(0,screwAxialSpan[1]-screwAxialSpan[0]),screwSoftTissueShare=screwSpan>1e-7?screwSoftTissueOverlap/screwSpan:0;
      sides[side].screwSoftTissueOverlap=screwSoftTissueOverlap;sides[side].screwSoftTissueShare=screwSoftTissueShare;
      if(data.fixation==='wedge'&&graft.family==='btb'&&screwSoftTissueOverlap>1e-7&&screwSoftTissueShare>=SCREW_SOFT_TISSUE_LIMIT-1e-9){
        const share=`${fm(screwSoftTissueOverlap)} of ${fm(screwSpan)} mm (${Math.round(screwSoftTissueShare*100)}%)`;
        add(`${side}-screw-tendon`,'warning',`${label} titanium screw sits against soft tendon`,`${share} of the modeled screw is against soft tendon. Biosteon screw may be recommended.`,side);
        advise(`${side}-wedge-soft-tissue`,'Biosteon screw may be recommended',`${share} of the titanium screw is against soft tissue.`,side,SOURCES.scope,{[side]:{fixation:'biosteon'}});recommendations.at(-1).ruleSource='user';
      }
      if(bonePlug&&positive(plugLength)&&positive(data.screwLength)) {
        if(screwPlugOverlap<=1e-7)add(`${side}-screw-plug-overlap`,'warning',`${label} screw and bone block do not overlap in this model`,`The modeled screw occupies ${fm(screwAxialSpan[0])}–${fm(screwAxialSpan[1])} mm and the block ${fm(plugAxialSpan[0])}–${fm(plugAxialSpan[1])} mm from the joint aperture. Review insertion depth and screw placement.`,side);
        else if(screwPlugOverlap<plugLength-1e-7)add(`${side}-screw-plug-overlap`,'info',`${label} screw overlaps ${fm(screwPlugOverlap)} mm of the ${fm(plugLength)} mm block`,`The screw is seated flush with the ${side==='tibia'?'outer':screwFromOutside(side,data)?'lateral':'joint-side'} end of the block where it fits and is never proud of the tunnel opening. Review the intended screw placement for this partial overlap.`,side);
      }
      if(!positive(data.screwDiameter)||!positive(data.screwLength))add(`${side}-screw-positive`,'error','Screw measurements must be positive','Enter the surgeon-selected diameter and length.',side);
      if(!catalogScrew) {
        add(`${side}-screw-catalog`,'error',`${label} screw size is not a catalog pair`,`${fix.label}: ${fm(data.screwDiameter)} × ${fm(data.screwLength)} mm has no reviewed SKU.`,side);
        if(sides[side].availableScrewLengths.length)advise(`${side}-catalog-lengths`,'Available lengths at this diameter',`${sides[side].availableScrewLengths.join(', ')} mm are cataloged at ${fm(data.screwDiameter)} mm diameter.`,side,fix.source);
      }
      if(data.screwLength>data.ttl+1e-7)add(`${side}-screw-length`,'error',`${label} screw exceeds the total bone path`,`${fm(data.screwLength)} mm screw exceeds the ${fm(data.ttl)} mm total tunnel by ${fm(data.screwLength-data.ttl)} mm. The model shows that amount projecting beyond the bone path.`,side);
      if(data.screwLength>data.socket+1e-7)add(`${side}-screw-socket`,'error',`${label} screw exceeds entered reamed depth`,`${fm(data.screwLength)} mm screw exceeds the ${fm(data.socket)} mm entered reamed depth by ${fm(data.screwLength-data.socket)} mm. Confirm the intended prepared path; no additional reaming is inferred.`,side);
      if(bonePlug&&data.screwLength>plugLength+1e-7)add(`${side}-screw-plug`,'warning',`${label} screw is longer than the bone block`,'Review the intended screw position and tendon transition. No automatic screw-length substitution is made.',side);
      if(data.fixation==='biosteon') {
        const choice=biosteonCandidates(state,graft,side,sides[side]);
        sides[side].screwCandidates=choice?.candidates||[];
        if(choice)advise(`${side}-biosteon-guide`,choice.candidates.length?'Guide-based Biosteon options':'Biosteon sizing needs review',`${choice.reason}`,side,SOURCES.biosteonSizing,choice.candidates.length===1?choice.candidates[0].patch:undefined,choice.candidates);

      }
    }
    if(side==='tibia'&&data.fixation==='wedge'){
      const candidates=SCREWS.filter(x=>x.family==='wedge'&&x.diameter>=data.diameter-2&&x.diameter<=data.diameter-1&&x.length<data.socket&&x.length<=data.ttl).map(x=>({...x,label:`${x.diameter} × ${x.length} mm`,patch:{tibia:{screwDiameter:x.diameter,screwLength:x.length}}}));
      sides.tibia.screwCandidates=candidates;
      advise('tibia-wedge-guide','Titanium sizing options',`Your tibial sizing rule: 1–2 mm smaller than the ${fm(data.diameter)} mm tunnel, strictly shorter than the ${fm(data.socket)} mm socket, and no longer than the ${fm(data.ttl)} mm total tunnel. These options match catalog size pairs.`,side,SOURCES.wedge,undefined,candidates);
      recommendations.at(-1).catalogOnly=false;recommendations.at(-1).kind='sizing';recommendations.at(-1).ruleSource='user';
    }
    if(fix)products.push({side,label:fix.label,sku:fixationSku,detail:screw?`${fm(data.screwDiameter)} × ${fm(data.screwLength)} mm`:data.fixation==='glok'?`${fm(data.loop)} mm fixed loop`:undefined,source:fix.source});
  }
  const requiredGraftLength=sides.femur.graftInsertion+state.jointSpan+sides.tibia.graftInsertion;
  const graftLengthDifference=state.graftLength-requiredGraftLength;
  if(graftLengthDifference<-.05)add('graft-too-short','error','Prepared graft is shorter than the modeled path',`${fm(state.graftLength)} mm available versus ${fm(requiredGraftLength)} mm required by the entered insertions and joint span (${fm(-graftLengthDifference)} mm short). Bone plugs are included in the prepared length.`);
  else if(graftLengthDifference>.05)add('graft-length-surplus','warning','Prepared graft length is not fully assigned',`${fm(graftLengthDifference)} mm remains beyond the entered femoral insertion, joint span and tibial insertion. Review the measured prepared construct and insertion plan; extra length is not automatically consumed.`);
  if(graft.family==='btb'&&state.femoralPlugLength+state.tibialPlugLength>=state.graftLength)add('btb-tendon-budget','error','Bone blocks consume the prepared graft length','The total prepared length must include a positive tendon segment between the two blocks.');
  if(graft.id==='qtb'&&state.tibialPlugLength>=state.graftLength)add('qtb-tendon-budget','error','Tibial block consumes the prepared graft length','The measured QTB construct must include the tendon segment as well as the block.');
  const {fieldIssues,fieldLimits,hardwareStatus}=fieldFeedback(state,sides,issues);
  return {state,graft,allInside,issues,sides,requiredGraftLength,graftLengthDifference,recommendations,products,fieldIssues,fieldLimits,hardwareStatus};
}

function fieldFeedback(state,sides,issues) {
  const sharedReamer=linkedState(state);
  const fieldIssues={},fieldLimits={},hardwareStatus={femur:{buttonInvalid:false,screwInvalid:false,reasons:[]},tibia:{buttonInvalid:false,screwInvalid:false,reasons:[]}};
  const put=(paths,issue)=>{
    if(sharedReamer&&paths.includes('femur.diameter'))paths=[...paths,'tibia.diameter'];
    for(const path of paths) {
      if(!fieldIssues[path])fieldIssues[path]=[];
      if(!fieldIssues[path].some(x=>x.id===issue.id))fieldIssues[path].push({id:issue.id,level:issue.level,message:issue.message});
    }
  };
  const limit=(path,min,max,hint)=>fieldLimits[path]={...(finite(min)?{min}:{}),...(finite(max)?{max}:{}),...(hint?{hint}:{})};
  limit('graftDiameter',0.1,Math.min(state.femur.diameter,state.tibia.diameter),'Prepared graft diameter must fit both reamed paths; measure with its attachment material.');
  limit('graftLength',Math.max(0.1,sides.femur.graftInsertion+state.jointSpan+20),600,'Prepared length includes all bone blocks, counted once.');
  limit('jointSpan',FIXED_JOINT_SPAN_MM,FIXED_JOINT_SPAN_MM,'Fixed joint span: 22 mm.');
  limit('foldHeight',0,100,'G-Lok chart uses 4 mm; this is fold height, not graft diameter.');
  limit('flipAllowance',0.1,100,'Published G-Lok flip allowance is 7 mm.');
  for(const side of ['femur','tibia']) {
    const d=state[side],r=sides[side],prefix=side==='femur'?'femoral':'tibial',fix=fixationById(d.fixation),isScrew=fix?.kind==='screw',isButton=['integrated','abs'].includes(fix?.kind);
    const femoralPaths=sides.femur.minSocket!==null?['femur.ttl','femur.loop','foldHeight']:['femur.socket',...((state.femur.technique==='outside_in'||(state.femur.technique==='retrograde'&&state.femur.blownCortex))?['femur.ttl']:[])];
    const insertionPaths=side==='tibia'?['tibia.graftInsertion','graftLength',...femoralPaths]:femoralPaths;
    const catalog=SCREWS.filter(x=>x.family===d.fixation);
    const maxInsertion=Math.min(d.socket,d.ttl,state.graftLength-state.jointSpan-(side==='femur'?20:sides.femur.graftInsertion));
    const minimumSocket=Math.max(0.1,side==='femur'&&r.minSocket===null?20:r.trimAmount>0?r.inBoneGraftInsertion:r.graftInsertion,r.minSocket??0,isScrew?d.screwLength:0);
    limit(`${side}.ttl`,Math.max(0.1,d.socket,r.trimAmount>0?r.inBoneGraftInsertion:r.graftInsertion,isScrew?d.screwLength:0),300,'Total bone path must contain socket, insertion and any screw length.');
    limit(`${side}.socket`,((side==='tibia'&&['straight','transtibial'].includes(d.technique))||(side==='femur'&&d.technique==='outside_in')||(d.technique==='retrograde'&&d.blownCortex))?d.ttl:minimumSocket,d.ttl,r.minSocket!==null?`G-Lok minimum is ${fm(r.minSocket)} mm; socket cannot exceed total tunnel.`:'Entered reamed depth must contain the planned insertion and screw path.');
    limit(`${side}.graftInsertion`,r.bonePlug?Math.max(20,r.plugLength):20,maxInsertion,'The 20 mm planning minimum applies. Insertion cannot exceed reamed depth, total bone path or the available graft-length budget.');
    limit(`${side}.diameter`,Math.max(0.1,state.graftDiameter,r.bonePlug?r.plugDiameter:0),50,'Reamed diameter must accommodate the prepared graft and any bone plug.');
    const buttonSpan=r.buttonSpec?.outerDiameter??r.buttonSpec?.width;
    const projection=r.buttonSpec?.projection||0;
    limit(`${side}.aperture`,Math.max(0.1,r.nominalAperture??0,r.shaftDiameter??0,projection,d.technique==='retrograde'&&d.blownCortex?d.diameter:0,d.xl&&d.xlTiming==='before'?XL.passageWidth:0),fix?.kind==='abs'?buttonSpan:50,fix?.kind==='abs'?`Opening must be strictly larger than the ${projection} mm projection, and smaller than the ${buttonSpan} mm narrow footprint. `:r.nominalAperture!==null?`Nominal passage is ${fm(r.nominalAperture)} mm; edit only when cortical opening is enlarged.`:'No universal nominal passage is established for this instrument/construct.');
    limit(`${side}.loop`,15,50,'G-Lok catalog loops: 15, 20, 25, 30, 35, 40, 45, 50 mm.');
    limit(`${side}.screwLength`,catalog.length?Math.min(...catalog.map(x=>x.length)):0.1,Math.min(d.ttl,d.socket),'Screw length must be a published catalog pair and fit the entered bone and reamed path.');
    limit(`${side}.screwDiameter`,catalog.length?Math.min(...catalog.map(x=>x.diameter)):0.1,catalog.length?Math.max(...catalog.map(x=>x.diameter)):50,'Use a published diameter/length pair. Guide suggestions do not overwrite the surgeon-selected size.');
    limit(prefix+'PlugLength',0.1,Math.min(r.graftInsertion,d.socket,d.ttl),'The entire plug must fit within the entered bone insertion.');
    const ownBlock=r.bonePlug&&!!d.plugDiameterOverride;
    if(ownBlock)limit(prefix+'PlugDiameter',0.1,d.diameter,'Set separately for this block; it must fit the reamed diameter.');
    else limit(prefix+'PlugDiameter',state.graftDiameter,state.graftDiameter,'Bone-block diameter follows the prepared graft diameter.');
    const mapping={
      'fixation-scope':[`${side}.fixation`], 'technique-scope':[`${side}.technique`], 'bone-quality':[`${side}.boneQuality`],
      'insertion-positive':insertionPaths, 'insertion-minimum':[...insertionPaths,`${side}.ttl`],
      'trim-tendon':[...insertionPaths,`${side}.ttl`,prefix+'PlugLength'], 'trim-entire-block':[...insertionPaths,`${side}.ttl`,prefix+'PlugLength'],
      'insertion-socket':[...insertionPaths,`${side}.socket`],
      'insertion-ttl':[...insertionPaths,`${side}.ttl`],
      'socket-overrun':[`${side}.socket`,`${side}.ttl`],
      'aperture-enlarged':[`${side}.aperture`],
      'aperture-below-nominal':[`${side}.aperture`], 'blown-aperture':[`${side}.aperture`,`${side}.diameter`], 'xl-timing':[`${side}.xlTiming`],
      'graft-diameter':['graftDiameter',`${side}.diameter`],
      'ttl-reference':[`${side}.ttl`],
      'rr-size':[`${side}.diameter`], 'rr-ordering':[`${side}.diameter`],
      'rr-aperture':[`${side}.aperture`,`${side}.diameter`],
      'rr-no-bridge':[`${side}.socket`,`${side}.ttl`], 'rr-bridge':[`${side}.socket`,`${side}.ttl`],
      'full-tunnel-shape':[`${side}.socket`,`${side}.aperture`],
      'plug-diameter':[ownBlock?prefix+'PlugDiameter':'graftDiameter',`${side}.diameter`],
      'plug-insertion':[prefix+'PlugLength',...insertionPaths],
      'glok-loop-catalog':[`${side}.loop`], 'glok-allowance':['foldHeight','flipAllowance'],
      'glok-chart-assumption':['foldHeight','flipAllowance'],
      'glok-flip-space':[`${side}.socket`,`${side}.loop`],
      'glok-min-ttl':[`${side}.loop`,`${side}.ttl`,'foldHeight','flipAllowance'],
      'button-passage':[`${side}.aperture`], 'button-enlarged-path':[`${side}.aperture`],
      'button-footprint':[`${side}.aperture`], 'negative-loop-gap':insertionPaths,
      'abs-selection':[`${side}.button`], 'abs-projection':[`${side}.button`,`${side}.aperture`],
      'abs-footprint':[`${side}.button`,`${side}.aperture`], 'abs-suggested':[`${side}.button`,`${side}.aperture`],
      'xl-passage':[`${side}.xl`,`${side}.xlTiming`,`${side}.aperture`], 'xl-scope':[`${side}.xl`], 'xl-compatibility':[`${side}.xl`], 'xl-aperture':[`${side}.aperture`],
      'screw-tendon':[`${side}.screwLength`,`${side}.fixation`,prefix+'PlugLength',...insertionPaths],
      'screw-catalog':[`${side}.screwDiameter`,`${side}.screwLength`],
      'screw-length':[`${side}.screwLength`,`${side}.ttl`],
      'screw-socket':[`${side}.screwLength`,`${side}.socket`],
      'screw-plug':[`${side}.screwLength`,prefix+'PlugLength'],
      'screw-plug-overlap':[`${side}.screwLength`,prefix+'PlugLength',...insertionPaths]
    };
    for(const issue of issues.filter(x=>x.side===side)) {
      const suffix=issue.id.startsWith(side+'-')?issue.id.slice(side.length+1):'';
      if(mapping[suffix])put(mapping[suffix],issue);
      if(suffix.startsWith('positive-'))put([side+'.'+suffix.slice(9)],issue);
      if(suffix==='plug-positive')put(['Length','Diameter'].filter(key=>state[prefix+'Plug'+key]<=0).map(key=>key==='Diameter'&&!ownBlock?'graftDiameter':prefix+'Plug'+key),issue);
      if(suffix==='screw-positive')put(['screwLength','screwDiameter'].filter(key=>d[key]<=0).map(key=>side+'.'+key),issue);
      const buttonPhysical=['blown-aperture','xl-passage','aperture-below-nominal','rr-aperture','button-passage','button-footprint','abs-projection','abs-footprint','negative-loop-gap','insertion-ttl','glok-flip-space','glok-min-ttl'];
      const screwPhysical=['screw-positive','screw-length','screw-socket'];
      if(isButton&&issue.level==='error'&&buttonPhysical.includes(suffix)) {hardwareStatus[side].buttonInvalid=true;hardwareStatus[side].reasons.push(issue.message);}
      if(isScrew&&((issue.level==='error'&&screwPhysical.includes(suffix))||(suffix==='screw-plug-overlap'&&r.screwPlugOverlap===0))) {hardwareStatus[side].screwInvalid=true;hardwareStatus[side].reasons.push(issue.message);}
    }
    r.screwProtrusion=isScrew?Math.max(0,d.screwLength-d.ttl):0;
    r.hardwareStatus=hardwareStatus[side];
  }
  const globalMap={
    'unknown-graft':['graft'],'graft-diameter-range':['graftDiameter'],
    'linked-transtibial':['femur.technique','tibia.technique'],
    'all-inside-scope':['graft','femur.technique','tibia.technique'],
    'rapid-catalog-envelope':['graftLength','graftDiameter'],
    'graft-too-short':['graftLength','jointSpan','femur.graftInsertion','tibia.graftInsertion'],
    'graft-length-surplus':['graftLength','jointSpan','femur.graftInsertion','tibia.graftInsertion'],
    'btb-tendon-budget':['graftLength','femoralPlugLength','tibialPlugLength'],
    'qtb-tendon-budget':['graftLength','tibialPlugLength']
  };
  for(const issue of issues) {
    if(globalMap[issue.id])put(globalMap[issue.id],issue);
    if(issue.id.startsWith('positive-'))put([issue.id.slice(9)],issue);
    if(issue.id.startsWith('input-'))put([issue.id.slice(6)],issue);
  }
  return {fieldIssues,fieldLimits,hardwareStatus};
}
