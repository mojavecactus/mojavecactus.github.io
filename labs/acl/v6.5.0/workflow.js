import {createDefaultState,sanitizeState,allowedFixations,allowedTechniques,nominalAperture,GRAFTS,FIXATIONS,TECHNIQUES,BUTTONS,canonicalGraftId,plannedFemoralInsertion,plannedTibialInsertion,tibialTrim} from './engine.js';

export {plannedFemoralInsertion,plannedTibialInsertion,tibialTrim};
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const sides=['femur','tibia'];
export const AVERAGE_JOINT_SPAN_MM=22;
export const AVERAGE_JOINT_SPAN_SOURCE={label:'Fixed teaching average: 22 mm at 90°',detail:'Rounded study mean; individual measurements vary.',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC9042781/',doi:'10.1016/j.asmr.2021.11.006',citation:'Dwyer et al., Arthrosc Sports Med Rehabil. 2022;4:e479–e486, Table 2',mean:21.9,standardDeviation:2.7,range:[16,32],sampleSize:100,context:'Intra-articular distance at 90° in BPTB autograft / anteromedial-portal reconstructions; not a universal or patient-specific measurement.'};
const reference=createDefaultState();
const globalNumbers=Object.keys(reference).filter(k=>!['schema','jointSpan'].includes(k)&&typeof reference[k]==='number');
const sideNumbers=Object.keys(reference.femur).filter(k=>typeof reference.femur[k]==='number');
const numericPaths=[...globalNumbers,...sides.flatMap(side=>sideNumbers.map(key=>side+'.'+key))];
const planPaths=['graft','femur.technique','tibia.technique','femur.fixation','tibia.fixation'];
const inputPaths=new Set([...numericPaths.filter(p=>!p.endsWith('.graftInsertion')),...planPaths,...sides.flatMap(side=>['button','xl','xlTiming','blownCortex','apertureOverride','plugDiameterOverride','boneQuality'].map(key=>side+'.'+key))]);
const FLAGS=['xl','blownCortex','apertureOverride','plugDiameterOverride'];
// Team starting sizes (Sept 25 2026): the usual prepared sizes, filled in when a graft is chosen. Every value stays editable,
// and each bone block takes the graft diameter until its own diameter is set.
export const STARTING_SIZES=Object.freeze({
  btb:Object.freeze({graftLength:95,graftDiameter:10,femoralPlugLength:20,tibialPlugLength:25}),
  quad_soft:Object.freeze({graftLength:70,graftDiameter:10}),
  qtb:Object.freeze({graftLength:90,graftDiameter:10,tibialPlugLength:20}),
  rapidease:Object.freeze({graftLength:70,graftDiameter:10}),
  folded:Object.freeze({graftLength:110,graftDiameter:8})
});
const get=(record,path)=>path.split('.').reduce((value,key)=>value?.[key],record);
function set(record,path,value){const keys=path.split('.');if(keys.length===1)record[keys[0]]=value;else record[keys[0]][keys[1]]=value;}
function present(value){return finite(value)||(typeof value==='string'&&value.trim()!=='');}
function definition(value){return GRAFTS.find(x=>x.id===canonicalGraftId(value));}
function separateFemoralCortex(draft){return ['flexible','low_profile'].includes(draft.values.femur.technique)&&FIXATIONS.find(x=>x.id===draft.values.femur.fixation)?.kind==='integrated';}
function linked(draft){return sides.every(side=>draft.values[side].technique==='transtibial');}
function allInside(draft){return !!definition(draft.values.graft)?.allInside&&sides.every(side=>draft.values[side].technique==='retrograde');}
// Decision 2026-09-24: an intact tibial RR socket has only its small cortical opening, so the graft cannot come up the
// tibia. Every such case passes the graft through the AM portal (femoral end, then tibial end), whatever the femoral
// technique. A blown tibial cortex is a full tunnel again, so non-RR femurs return to through-tibia passage.
export function portalPassage(input){const draft=object(input?.values)?input:createCase();return allInside(draft)||(draft.values.tibia.technique==='retrograde'&&!draft.values.tibia.blownCortex&&!linked(draft));}
function plug(draft,side){return definition(draft.values.graft)?.family==='btb'||(draft.values.graft==='qtb'&&side==='tibia');}

export function createCase(){
  const values={graft:''};
  for(const key of globalNumbers)values[key]=null;
  for(const side of sides){values[side]={technique:'',fixation:'',button:'',xl:false,xlTiming:'before',blownCortex:false,apertureOverride:false,plugDiameterOverride:false,boneQuality:''};for(const key of sideNumbers)values[side][key]=null;}
  return {schema:2,values,completed:[],currentStep:'plan',notes:'',replanningTibialFixation:false};
}
const step=(id,label,kind,side)=>({id,label,kind,...(side?{side}:{})});
export function stepsForCase(input){
  const draft=object(input?.values)?input:createCase();
  const start=[step('plan','Choose the plan','plan')];
  start.push(step('prep','Prepare and size the graft','prep'));
  if(linked(draft)){
    start.push(step('linked_pin','Pass one 2.4 mm pin through tibia and femur','pin'),step('tibia_measure','Measure the tibial path','measure','tibia'),step('femur_measure','Measure the femoral path','measure','femur'),step('linked_ream','Ream tibia and femur in one pass','ream'));
  }else{
    if(draft.values.femur.technique==='flexible')start.push(step('femur_flexible_pin','Pass the 2.4 mm flexible guide pin','pin','femur'));
    if(draft.values.femur.technique==='low_profile')start.push(step('femur_low_profile_pin','Pass the 2.4 mm low-profile guide pin','pin','femur'));
    if(draft.values.femur.technique==='outside_in')start.push(step('femur_pin','Place the 2.4 mm outside-in guide pin','pin','femur'));
    start.push(step('femur_measure','Measure the femoral path','measure','femur'));
    start.push(step('femur_ream','Ream the femoral socket','ream','femur'));
    if(separateFemoralCortex(draft))start.push(step('femur_cortex_ream','Ream the 4.5 mm cortical passage','ream','femur'));
    start.push(step('tibia_measure','Measure the tibial path','measure','tibia'));
    if(draft.values.tibia.technique==='straight')start.push(step('tibia_pin','Place the tibial guide pin','pin','tibia'));
    start.push(step('tibia_ream','Ream the tibial path','ream','tibia'));
  }
  const xl=draft.values.femur.xl&&draft.values.femur.blownCortex&&FIXATIONS.find(x=>x.id===draft.values.femur.fixation)?.kind==='integrated';
  if(xl&&draft.values.femur.xlTiming!=='after')start.push(step('xl_femur','Attach G-Lok XL before passage','accessory','femur'));
  start.push(step('pass_femur',portalPassage(draft)?'Pass the femoral end through the AM portal':'Pass the graft through tibia into femur','pass','femur'));
  if(xl&&draft.values.femur.xlTiming==='after')start.push(step('xl_femur','Attach G-Lok XL after femoral passage','accessory','femur'));
  if(portalPassage(draft))start.push(step('pass_tibia','Pass the tibial end through the AM portal','pass','tibia'));
  if(FIXATIONS.find(x=>x.id===draft.values.femur.fixation)?.kind==='screw')start.push(step('fix_femur','Fix the femoral end','fix','femur'));
  start.push(step('fix_tibia','Fix the tibial end','fix','tibia'));
  const trim=tibialTrim(draft);
  if(trim.trimAmount>0)start.push(step('trim_tibia',trim.trimKind==='bone'?'Trim the projecting tibial bone block':'Trim the projecting tibial graft','trim','tibia'));
  start.push(step('review','Review the completed construct','review'));
  return start;
}

function materializeValues(values){
  const raw=object(values)?values:{};
  const state=createDefaultState(definition(raw.graft)?.id||'folded');
  for(const path of numericPaths){const value=get(raw,path);if(!path.endsWith('.graftInsertion')&&finite(value))set(state,path,value);}
  for(const side of sides){
    const data=object(raw[side])?raw[side]:{};
    if(TECHNIQUES[side].some(x=>x.id===data.technique))state[side].technique=data.technique;
    if(FIXATIONS.some(x=>x.id===data.fixation))state[side].fixation=data.fixation;
    if(BUTTONS.some(x=>x.id===data.button))state[side].button=data.button;
    for(const key of FLAGS)if(typeof data[key]==='boolean')state[side][key]=data[key];
    if(['before','after'].includes(data.xlTiming))state[side].xlTiming=data.xlTiming;
    if(['normal','soft'].includes(data.boneQuality))state[side].boneQuality=data.boneQuality;
  }
  state.jointSpan=AVERAGE_JOINT_SPAN_MM;
  return sanitizeState(state);
}
// Numeric fallbacks exist only for the internal geometry/engine. UI inputs must use draft.values.
export function materializeCase(draft){return materializeValues(draft?.values);}

export function requiredPathsForStep(input,id){
  const draft=object(input?.values)?input:createCase();
  if(!stepsForCase(draft).some(x=>x.id===id))return [];
  if(id==='plan')return planPaths.filter(path=>!(draft.replanningTibialFixation&&path==='tibia.fixation'));
  if(id==='prep'){
    const paths=['graftLength','graftDiameter'];
    for(const side of sides){if(plug(draft,side)){const prefix=side==='femur'?'femoral':'tibial';paths.push(prefix+'PlugLength');if(draft.values[side].plugDiameterOverride)paths.push(prefix+'PlugDiameter');}if(draft.values[side].fixation==='glok')paths.push(side+'.loop');}
    return paths;
  }
  if(id==='linked_ream')return ['tibia.diameter'];
  if(id==='femur_cortex_ream')return draft.values.femur.blownCortex||draft.values.femur.apertureOverride?['femur.aperture']:[];
  for(const side of sides){
    if(id===side+'_measure')return [side+'.ttl'];
    if(id===side+'_ream'){
      const through=(side==='tibia'&&['straight','transtibial'].includes(draft.values[side].technique))||(side==='femur'&&['outside_in','transtibial'].includes(draft.values[side].technique))||(draft.values[side].technique==='retrograde'&&draft.values[side].blownCortex);
      const paths=[...(through?[]:[side+'.socket']),side+'.diameter'];
      if(side==='tibia'&&draft.replanningTibialFixation)paths.push('tibia.fixation');
      const materialized=materializeValues(draft.values);
      // A missing measured reamer diameter must not be replaced by the hidden example for gating.
      const needsMeasuredHead=['retrograde','outside_in'].includes(draft.values[side].technique)||(side==='tibia'&&['straight','transtibial'].includes(draft.values[side].technique));
      const nominal=needsMeasuredHead&&!finite(draft.values[side].diameter)?null:nominalAperture(materialized,side);
      if(!(side==='femur'&&separateFemoralCortex(draft))&&(draft.values[side].blownCortex||draft.values[side].apertureOverride||nominal===null))paths.push(side+'.aperture');
      return paths;
    }
    if(id==='fix_'+side){
      const kind=FIXATIONS.find(x=>x.id===draft.values[side].fixation)?.kind;
      if(kind==='screw')return [side+'.screwDiameter',side+'.screwLength'];
      if(kind==='abs')return [side+'.button'];
      return [];
    }
  }
  return [];
}
const fieldNames={graft:'a graft preparation',graftLength:'prepared graft length',graftDiameter:'prepared graft diameter',jointSpan:'joint span',femoralPlugLength:'femoral bone-block length',femoralPlugDiameter:'femoral bone-block diameter',tibialPlugLength:'tibial bone-block length',tibialPlugDiameter:'tibial bone-block diameter'};
const sideNames={technique:'reaming method',fixation:'primary fixation',ttl:'total tunnel length',socket:'reamed depth',diameter:'reamed diameter',aperture:'cortical opening',graftInsertion:'graft insertion',loop:'fixed-loop size',button:'ABS button',screwDiameter:'screw diameter',screwLength:'screw length'};
function fieldName(path){if(fieldNames[path])return fieldNames[path];const [side,key]=path.split('.');return `${side==='femur'?'femoral':'tibial'} ${sideNames[key]||key}`;}
function valueAt(draft,path){return get(draft.values,path);}
export function missingForStep(input,id){
  const draft=object(input?.values)?input:createCase();
  return requiredPathsForStep(draft,id).filter(path=>!present(valueAt(draft,path))).map(path=>`${planPaths.includes(path)||path.endsWith('.button')?'Choose':'Enter'} ${fieldName(path)}.`);
}

function normalize(input){
  const out=createCase(),issues=[];
  const raw=object(input)?input:{},values=object(raw.values)?raw.values:{};
  const readNumeric=(value,path)=>{
    if(value===undefined||value===null||value===''||(typeof value==='string'&&!value.trim()))return null;
    const n=(typeof value==='number'||typeof value==='string')?Number(value):NaN;
    if(finite(n))return n;
    issues.push({path,message:`${fieldName(path)} was not a finite number and was left blank.`});return null;
  };
  const inputLinked=sides.every(side=>values[side]?.technique==='transtibial');
  for(const path of numericPaths)if(!(inputLinked&&(path==='femur.diameter'||path.endsWith('.socket')||path.endsWith('.aperture')))&&!path.endsWith('.graftInsertion'))set(out.values,path,readNumeric(get(values,path),path));
  function readChoice(value,known,path,empty=''){
    if(value===undefined||value===null||value==='')return empty;
    if(typeof value==='string'&&known.includes(value))return value;
    issues.push({path,message:`Unsupported ${fieldName(path)} was left blank.`});return empty;
  }
  out.values.graft=readChoice(canonicalGraftId(values.graft),GRAFTS.map(x=>x.id),'graft');
  for(const side of sides){
    const data=object(values[side])?values[side]:{};
    out.values[side].technique=readChoice(data.technique,TECHNIQUES[side].map(x=>x.id),side+'.technique');
    out.values[side].fixation=readChoice(data.fixation,FIXATIONS.map(x=>x.id),side+'.fixation');
    out.values[side].button=readChoice(data.button,BUTTONS.map(x=>x.id),side+'.button');
    out.values[side].xlTiming=readChoice(data.xlTiming,['before','after'],side+'.xlTiming','before');
    out.values[side].boneQuality=readChoice(data.boneQuality,['normal','soft'],side+'.boneQuality','');
    for(const key of FLAGS){
      if(typeof data[key]==='boolean')out.values[side][key]=data[key];
      else if(data[key]!==undefined)issues.push({path:side+'.'+key,message:`Invalid ${key==='xl'?'XL accessory':key==='plugDiameterOverride'?'bone-block diameter':'cortical enlargement'} flag was reset.`});
    }
  }
  if(definition(out.values.graft))for(const side of sides){
    if(out.values[side].fixation&&!allowedFixations(out.values.graft,side,out.values).includes(out.values[side].fixation)){
      out.values[side].fixation='';issues.push({path:side+'.fixation',message:`The previous ${side} fixation is outside this graft’s supported plan; choose its replacement.`});
    }
    if(out.values[side].technique&&!allowedTechniques(out.values.graft,side).includes(out.values[side].technique)){
      out.values[side].technique='';issues.push({path:side+'.technique',message:`The previous ${side} reaming method is outside this graft’s supported plan; choose its replacement.`});
    }
  }
  if(sides.every(side=>out.values[side].technique==='retrograde')&&!definition(out.values.graft)?.allInside){out.values.tibia.technique='';issues.push({path:'tibia.technique',message:'All-inside is outside this graft’s supported plan; choose a tibial method.'});}
  if(sides.some(side=>out.values[side].technique==='transtibial')&&!linked(out)){
    const other=sides.find(side=>out.values[side].technique!=='transtibial');out.values[other].technique='';issues.push({path:other+'.technique',message:'Trans-tibial is linked; select it for both bones or choose a different method.'});
  }
  // A bone block follows the graft diameter unless its own diameter is set; a side without a block keeps no block values.
  for(const side of sides){
    const key=(side==='femur'?'femoral':'tibial')+'PlugDiameter';
    if(!plug(out,side)){out.values[side].plugDiameterOverride=false;out.values[key]=null;}
    else if(!out.values[side].plugDiameterOverride)out.values[key]=out.values.graftDiameter;
  }
  for(const side of sides){
    if(out.values[side].xl&&(side!=='femur'||!out.values[side].blownCortex||FIXATIONS.find(f=>f.id===out.values[side].fixation)?.kind!=='integrated')){
      out.values[side].xl=false;
      issues.push({path:side+'.xl',message:'XL is available with an integrated femoral button when the cortex is blown.'});
    }
  }
  if(['outside_in','transtibial'].includes(out.values.femur.technique))out.values.femur.socket=out.values.femur.ttl;
  if(['straight','transtibial'].includes(out.values.tibia.technique)){out.values.tibia.blownCortex=false;out.values.tibia.socket=out.values.tibia.ttl;}
  if(linked(out)){
    out.values.femur.diameter=out.values.tibia.diameter;
    for(const side of sides){out.values[side].aperture=out.values.tibia.diameter;out.values[side].apertureOverride=false;}
  }
  for(const side of sides){
    if(linked(out))continue;
    const rawSide=values[side];
    if(object(rawSide)&&typeof rawSide.blownCortex!=='boolean'&&typeof rawSide.apertureOverride!=='boolean'&&finite(out.values[side].aperture)){
      const nominal=nominalAperture(materializeValues(out.values),side);
      if(finite(nominal)&&Math.abs(out.values[side].aperture-nominal)>1e-7){out.values[side].apertureOverride=true;issues.push({path:side+'.aperture',message:'Saved cortical opening retained as a measured override.'});}
    }
  }
  if(values.jointSpan!==undefined&&values.jointSpan!==AVERAGE_JOINT_SPAN_MM)issues.push({path:'jointSpan',message:`The model uses a fixed ${AVERAGE_JOINT_SPAN_MM} mm reference joint span; the older entered value was not retained.`});
  out.notes=typeof raw.notes==='string'?raw.notes.slice(0,10000):'';
  if(raw.schema!==undefined&&raw.schema!==2)issues.push({path:'schema',message:'This workflow uses a schema 2 case. Only recognized case fields were retained.'});
  const requested=Array.isArray(raw.completed)?raw.completed:[];
  out.replanningTibialFixation=raw.replanningTibialFixation===true&&out.values.tibia.technique==='retrograde'&&!out.values.tibia.fixation&&requested.includes('tibia_measure');
  const steps=stepsForCase(out);
  for(let i=0;i<requested.length;i++){
    if(!steps[i]||requested[i]!==steps[i].id||missingForStep(out,steps[i].id).length){issues.push({path:'completed',message:'Completion history was limited to the verified consecutive steps.'});break;}
    out.completed.push(steps[i].id);
  }
  if(out.replanningTibialFixation&&!out.completed.includes('tibia_measure'))return normalize({...raw,replanningTibialFixation:false});
  const requestedIndex=steps.findIndex(x=>x.id===raw.currentStep),unlocked=Math.min(out.completed.length,steps.length-1);
  out.currentStep=requestedIndex>=0&&requestedIndex<=unlocked?steps[requestedIndex].id:steps[unlocked].id;
  if(issues.length)out.importIssues=issues;
  return out;
}
export function sanitizeCase(input){return normalize(input);}

export function canCompleteStep(input,id){
  const draft=normalize(input),steps=stepsForCase(draft),index=steps.findIndex(x=>x.id===id),missing=missingForStep(draft,id);
  if(index<0)return {ok:false,missing:['This step is not part of the selected plan.']};
  if(index>draft.completed.length)missing.unshift('Complete the preceding steps first.');
  return {ok:missing.length===0,missing};
}
export function completeStep(input,id){
  const draft=normalize(input),steps=stepsForCase(draft),index=steps.findIndex(x=>x.id===id);
  if(!canCompleteStep(draft,id).ok)return draft;
  if(!draft.completed.includes(id))draft.completed.push(id);
  draft.currentStep=steps[Math.min(index+1,steps.length-1)].id;
  return draft;
}
export function goToStep(input,id){
  const draft=normalize(input),steps=stepsForCase(draft),index=steps.findIndex(x=>x.id===id);
  if(index>=0&&index<=draft.completed.length)draft.currentStep=id;
  return draft;
}
function ownerOf(draft,path){
  if(planPaths.includes(path))return 'plan';
  if(!path.includes('.')||path.endsWith('.loop'))return 'prep';
  const [side,key]=path.split('.');
  if(key==='ttl')return side+'_measure';
  if(key==='plugDiameterOverride')return 'prep';
  if(key==='xl'||key==='xlTiming')return draft.values.femur.xl&&draft.values.femur.xlTiming!=='after'?'xl_femur':'pass_femur';
  if(side==='femur'&&['aperture','blownCortex','apertureOverride'].includes(key)&&separateFemoralCortex(draft))return 'femur_cortex_ream';
  if(['socket','diameter','graftInsertion','aperture','blownCortex','apertureOverride'].includes(key))return linked(draft)?'linked_ream':side+'_ream';
  return 'fix_'+side;
}
export function updateCaseValue(input,path,value){
  if(path.startsWith('values.'))path=path.slice(7);
  if(!inputPaths.has(path))throw new Error('Unknown case field: '+path);
  const draft=normalize(input),oldCompleted=[...draft.completed],oldCurrent=draft.currentStep,oldValues=JSON.stringify(draft.values),oldGraft=draft.values.graft;
  set(draft.values,path,value);
  const [changedSide,changedKey]=path.split('.');
  // choosing a different graft loads that graft's starting sizes (blocks follow the graft diameter again)
  if(path==='graft'&&definition(value)&&definition(value).id!==oldGraft){
    const sizes=STARTING_SIZES[definition(value).id]||{};
    for(const key of ['graftLength','graftDiameter','femoralPlugLength','tibialPlugLength'])draft.values[key]=finite(sizes[key])?sizes[key]:null;
    for(const side of sides)draft.values[side].plugDiameterOverride=false;
  }
  // setting a block diameter separately starts from the graft diameter it was following
  if(sides.includes(changedSide)&&changedKey==='plugDiameterOverride'&&value===true)draft.values[(changedSide==='femur'?'femoral':'tibial')+'PlugDiameter']=draft.values.graftDiameter;
  if(sides.includes(changedSide)&&changedKey==='blownCortex'){
    if(value===true)draft.values[changedSide].aperture=draft.values[changedSide].diameter;
    if(value===false){draft.values[changedSide].apertureOverride=false;draft.values[changedSide].aperture=nominalAperture(materializeValues(draft.values),changedSide);}
  }
  if(sides.includes(changedSide)&&changedKey==='apertureOverride'&&value===false&&!draft.values[changedSide].blownCortex)draft.values[changedSide].aperture=nominalAperture(materializeValues(draft.values),changedSide);
  if(path.endsWith('.technique')){
    const side=path.split('.')[0],other=side==='femur'?'tibia':'femur';
    if(value==='transtibial')draft.values[other].technique='transtibial';
    else if(draft.values[other].technique==='transtibial')draft.values[other].technique='';
    if(value==='retrograde'&&draft.values[other].technique==='retrograde'&&!definition(draft.values.graft)?.allInside)draft.values[other].technique='';
  }
  // Invalidate the field's owning step and every dependent step, while retaining measurements.
  const lateTibialFixation=draft.values.tibia.technique==='retrograde'&&oldCompleted.includes('tibia_measure')&&['tibia.fixation','tibia.blownCortex'].includes(path);
  if(lateTibialFixation)draft.replanningTibialFixation=!allowedFixations(draft.values.graft,'tibia',draft.values).includes(draft.values.tibia.fixation);
  const clean=normalize(draft),steps=stepsForCase(clean),owner=lateTibialFixation?'tibia_ream':ownerOf(clean,path),ownerIndex=steps.findIndex(x=>x.id===owner);
  if(JSON.stringify(clean.values)===oldValues)return normalize({...clean,completed:oldCompleted,currentStep:oldCurrent});
  clean.completed=[];
  for(let i=0;i<Math.max(0,ownerIndex);i++){
    if(oldCompleted[i]!==steps[i].id||missingForStep(clean,steps[i].id).length)break;
    clean.completed.push(steps[i].id);
  }
  clean.currentStep=steps[Math.min(Math.max(0,ownerIndex),clean.completed.length,steps.length-1)].id;
  return clean;
}
export function workflowForCase(input){
  const draft=normalize(input),steps=stepsForCase(draft),index=steps.findIndex(x=>x.id===draft.currentStep),current=steps[index],completed=draft.completed.filter(id=>steps.findIndex(x=>x.id===id)<=index);
  return {stage:current.id,side:current.side||null,completed,active:true,passage:portalPassage(draft)?'all_inside':linked(draft)?'transtibial':'through_tibia',progress:1,graftPrepared:completed.includes('prep')};
}
