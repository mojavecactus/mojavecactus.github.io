import {anteriorPortal} from './model-paths.js';
const clamp=x=>Math.max(0,Math.min(1,Number.isFinite(+x)?+x:0));
export function resolveModelWorkflow(input,preview=null){
 if(!input?.active)return {active:false,stage:'review',route:'through_tibia',progress:1,preview:false,prepared:true,showPrepared:false,femur:{measured:true,pin:false,reamed:true,cortexReamed:true,reamProgress:1,passed:true,fixed:true},tibia:{measured:true,pin:false,reamed:true,cortexReamed:true,reamProgress:1,passed:true,fixed:true},trimmed:false,trimming:false};
 const completed=new Set(Array.isArray(input.completed)?input.completed:[]),stage=String(input.stage||'plan'),previewStage=preview?.stage,progress=preview?clamp(preview.progress):0;
 const done=id=>completed.has(id)&&previewStage!==id;
 const result={active:true,stage,route:input.passage||'through_tibia',progress,preview:!!preview,previewStage:previewStage||null,completed:[...completed],prepared:done('prep')||!!input.graftPrepared};
 for(const side of ['femur','tibia']){
  const reamed=done(`${side}_ream`)||done('linked_ream'),passed=done(`pass_${side}`),fixed=done(`fix_${side}`);
  result[side]={measured:done(`${side}_measure`),pin:(done(`${side}_pin`)||done('linked_pin'))&&!reamed||side==='femur'&&(done('femur_flexible_pin')||done('femur_low_profile_pin'))&&!(input.corticalPassageRequired?done('femur_cortex_ream'):reamed),reamed,cortexReamed:side==='femur'&&done('femur_cortex_ream'),cortexReaming:side==='femur'&&previewStage==='femur_cortex_ream',reamProgress:reamed?1:[`${side}_ream`,'linked_ream'].includes(previewStage)?progress:0,passed,fixed,measuring:previewStage===`${side}_measure`,pinning:previewStage===`${side}_pin`||side==='femur'&&['femur_flexible_pin','femur_low_profile_pin'].includes(previewStage)||previewStage==='linked_pin',reaming:[`${side}_ream`,'linked_ream'].includes(previewStage),passing:previewStage===`pass_${side}`,fixing:previewStage===`fix_${side}`};
 }
 if(result.route!=='all_inside'&&result.femur.passed)result.tibia.passed=true;
 result.showPrepared=result.prepared&&stage==='prep'&&previewStage!=='prep';
 result.xlAttached=done('xl_femur');result.xlPreview=previewStage==='xl_femur';result.trimmed=done('trim_tibia');result.trimming=previewStage==='trim_tibia';
 return result;
}

export function graftAppearance(id){
 if(id==='rapidease')return {family:'rapidease',name:'Presutured quadruple bundle',strands:4,profile:'round',stitches:true};
 if(id==='quad_soft'||id==='qtb')return {family:id==='qtb'?'qtb':'quad',name:id==='qtb'?'Quad tendon with one bone block':'Quad tendon ribbon',strands:1,profile:'quad-ribbon',stitches:true};
 if(id==='btb'||id==='btb_allo'||id==='btb_auto')return {family:'btb',name:'Tendon strap with two bone blocks',strands:1,profile:'btb-strap',stitches:false};
 return {family:'folded',name:'Folded soft-tissue strands',strands:2,profile:'round',stitches:false};
}

export function graftCrossSections(id,diameter){
 const r=diameter/2,appearance=graftAppearance(id);
 if(appearance.family==='folded')return [-1,1].map(sign=>({x:sign*r*.51,y:0,rx:r*.49,ry:r*.49}));
 if(appearance.family==='rapidease'){const strand=r*(Math.SQRT2-1);return [[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>({x:x*strand,y:y*strand,rx:strand,ry:strand}));}
 return [{x:0,y:0,rx:r,ry:r*(appearance.family==='btb'?.38:.56)}];
}

export const medialPortal=anteriorPortal;

// Educational centerline only: the free end stays outside the medial portal
// after femoral seating, then returns to the joint and enters the tibial socket.
// Every intermediate path preserves the entered length without stretching it.
export function allInsideCenterline({femoralTip,femoralEntry,tibialEntry,tibialTip,length},fraction=0){
 const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t),add=(a,b)=>a.map((x,i)=>x+b[i]),distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i])),pathLength=points=>points.slice(1).reduce((sum,p,i)=>sum+distance(p,points[i]),0),p=clamp(fraction),portal=medialPortal(femoralEntry,tibialEntry),fLength=distance(femoralTip,femoralEntry),direction=femoralTip.map((x,i)=>(x-femoralEntry[i])/(fLength||1)),near=femoralEntry.map((x,i)=>x-direction[i]*18),approach=distance(femoralEntry,near)+distance(near,portal),available=Math.max(0,length-fLength),outsideLength=Math.max(0,available-approach);
 // The free end follows the anterior notch corridor; short grafts stop along
 // that corridor instead of drawing an impossible full-length portal segment.
 const outside=available>=approach?add(portal,[0,-outsideLength,0]):available<=18?mix(femoralEntry,near,available/18):mix(near,portal,(available-18)/Math.max(1e-8,distance(near,portal))),jointMid=mix(femoralEntry,tibialEntry,.5),route=[outside,portal,tibialEntry,tibialTip],routeLengths=route.slice(1).map((point,i)=>distance(point,route[i])),totalTravel=routeLengths.reduce((sum,value)=>sum+value,0);let travel=p*totalTravel,segment=0;while(segment<2&&travel>routeLengths[segment]){travel-=routeLengths[segment];segment++;}const local=routeLengths[segment]>1e-8?Math.min(1,travel/routeLengths[segment]):1,end=mix(route[segment],route[segment+1],local);
 if(p===0){if(available<=18)return [femoralTip,femoralEntry,outside];if(available<approach)return [femoralTip,femoralEntry,near,outside];return [femoralTip,femoralEntry,near,portal,outside];}
 const points=segment===0?[femoralTip,femoralEntry,near,portal,end]:segment===1?[femoralTip,femoralEntry,mix(near,femoralEntry,local),mix(portal,jointMid,local),end]:[femoralTip,femoralEntry,femoralEntry,jointMid,tibialEntry,end];
 const index=3,base=[...points[index]];
 // Extra free graft bows in front of the joint, never out through the medial condyle.
 if(pathLength(points)<length-1e-8){const offset=amount=>{points[index]=add(base,[0,-amount,-amount*.08]);return pathLength(points);};let lo=0,hi=Math.max(1,length);while(offset(hi)<length)hi*=2;for(let i=0;i<45;i++){const mid=(lo+hi)/2;if(offset(mid)<length)lo=mid;else hi=mid;}offset((lo+hi)/2);}
 else if(pathLength(points)>length+1e-8){const origin=[...points[index]],toward=mix(points[index-1],points[index+1],.5),offset=t=>{points[index]=mix(toward,origin,t);return pathLength(points);};let lo=0,hi=1;for(let i=0;i<45;i++){const mid=(lo+hi)/2;if(offset(mid)<length)lo=mid;else hi=mid;}offset((lo+hi)/2);}
 return points;
}

// A flexible blind socket retains its pin bore until the separate button pass.
// A screw socket reamed through the bone already creates a full-size exit.
export function modelCorticalOpening({technique,fixation,socketDepth,ttl,socketDiameter,apertureDiameter,workflowActive,cortexReamed}){
 if(['flexible','low_profile'].includes(technique)&&workflowActive&&!cortexReamed){
  if(['biosteon','wedge'].includes(fixation)&&socketDepth>=ttl)return socketDiameter;
  return 2.4;
 }
 return apertureDiameter;
}
