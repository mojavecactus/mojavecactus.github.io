import {GRAFTS,FIXATIONS,TECHNIQUES,BUTTONS,FIXED_LOOPS,allowedFixations,allowedTechniques,nominalAperture,evaluate,tibialTrim,plannedFemoralInsertion} from './engine.js';
import {createCase,sanitizeCase,stepsForCase,materializeCase,requiredPathsForStep,missingForStep,canCompleteStep,updateCaseValue,completeStep,goToStep,workflowForCase,plannedTibialInsertion,AVERAGE_JOINT_SPAN_SOURCE} from './workflow.js';
import {DEMOS,buildDemoCase,demoCaseAt,demoCaption,demoSummary,demoLength,stepTiming,createDemoPlayer} from './demo.js';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>typeof x==='number'&&Number.isFinite(x)?Number(x.toFixed(2)).toString():'—';
const cap=s=>s==='femur'?'Femoral':s==='tibia'?'Tibial':'Graft';
const STORAGE='acl-case-lab-v3';
let draft=createCase(),state,evaluation,model,steps=[],busy=false,pdfBusy=false,saveTimer,toastTimer,modelFrame,revision=0,previewRun=0,view='anterior',attempted=false,savedCase=null;
const XRAY_OPACITY=.28,settings={labels:true,orientation:true,opacity:XRAY_OPACITY,activeSide:'femur',lean:false,spacious:false}; // (lean, spacious: the demo's label style)
// demo mode (below): its own cases on the model while it is open; the case being edited is left alone
const demo={on:false,phase:null,preset:null,base:null,steps:[],player:null,caption:null,segs:[],shown:[],raf:0,last:0,from:null,camera:null,scroll:0,measured:0,speed:1,guard:0,labels:true};
try{demo.labels=localStorage.getItem('acl_demo_labels')!=='0';}catch{}
let modelBroken=false,resolveModel,rejectModel;const modelReady=new Promise((res,rej)=>{resolveModel=res;rejectModel=rej;});modelReady.catch(()=>{});
try{const raw=localStorage.getItem(STORAGE);if(raw)savedCase=sanitizeCase(JSON.parse(raw));}catch{}
$('#resume-banner').hidden=!savedCase?.values?.graft;
function get(path,obj=draft.values){return path.split('.').reduce((o,k)=>o?.[k],obj);}
function current(){return steps.find(s=>s.id===draft.currentStep)||steps[0];}
function graft(){return GRAFTS.find(g=>g.id===draft.values.graft);}
function toast(message,action){clearTimeout(toastTimer);const el=$('#toast');el.textContent=message;if(action){const b=document.createElement('button');b.type='button';b.className='toast-act';b.textContent=action.label;b.addEventListener('click',()=>{const focused=el.contains(document.activeElement);clearTimeout(toastTimer);el.hidden=true;action.run(focused);});el.append(b);}el.hidden=false;toastTimer=setTimeout(()=>el.hidden=true,action?6500:4300);}
function save(){clearTimeout(saveTimer);if(!draft.values.graft)return;saveTimer=setTimeout(()=>{try{localStorage.setItem(STORAGE,JSON.stringify(draft));$('#save-status').textContent='Case saved on this device';}catch{$('#save-status').textContent='Export to save this case';}},200);}
function source(url,label='Source ↗'){return typeof url==='string'&&/^(https?:\/\/|\.\/)/.test(url)?`<a href="${esc(url)}" target="_blank" rel="noopener">${label}</a>`:'';}
function options(items,value,placeholder='Choose…'){return `<option value="">${placeholder}</option>`+items.map(item=>`<option value="${esc(item.id)}"${String(item.id)===String(value)?' selected':''}>${esc(item.label)}</option>`).join('');}
function select(path,label,items,help=''){return `<div class="field" data-field="${path}"><label for="field-${path.replaceAll('.','-')}">${label}</label><select id="field-${path.replaceAll('.','-')}" data-path="${path}"${path==='graft'?'':' '+(!draft.values.graft?'disabled':'')}>${options(items,get(path))}</select>${help?`<p class="help">${help}</p>`:''}<div class="field-feedback" aria-live="polite"></div></div>`;}
function number(path,label,min,max,step=1,help='',readonly=false,derived){const value=path==='tibia.graftInsertion'?derived:(derived??get(path)),known=typeof value==='number'&&Number.isFinite(value),id='field-'+path.replaceAll('.','-');return `<div class="measurement${readonly?' readonly':''}" data-measurement="${path}"><div class="measurement-heading"><label for="${id}">${label}</label><div class="number-unit"><input id="${id}" type="number" inputmode="decimal" step="${step}" data-path="${path}" value="${known?value:''}" placeholder="—" aria-label="${label}, millimeters" aria-describedby="${id}-feedback"${readonly?' readonly aria-readonly="true"':''}><span>mm</span></div></div>${!readonly?`<input type="range" min="${known?Math.min(min,value):min}" max="${known?Math.max(max,value):max}" step="${step}" value="${known?value:min}" data-path="${path}" data-min="${min}" data-max="${max}" aria-label="${label} slider"><div class="range-captions"><span>${min} mm</span><span>${max} mm</span></div>`:''}${help?`<p class="help">${help}</p>`:''}${!known&&!readonly?'<p class="help empty-range">Slide or type a measurement.</p>':''}<div class="field-feedback" id="${id}-feedback" aria-live="polite"></div></div>`;}
function facts(items){return `<div class="stage-facts">${items.map(([label,value])=>`<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}</div>`;}
function note(title,text){return `<div class="procedure-note"><strong>${title}</strong><p>${text}</p></div>`;}
function isLinked(){return ['femur','tibia'].every(side=>draft.values[side].technique==='transtibial');}
function isGlok(){return draft.values.femur.fixation==='glok'&&graft()?.family==='folded';}
function known(path){const value=get(path);if(path==='femur.diameter'&&isLinked())return known('tibia.diameter');if(path.endsWith('.socket')){const side=path.split('.')[0],d=draft.values[side];if((side==='tibia'&&['straight','transtibial'].includes(d.technique))||d.technique==='outside_in'||(d.technique==='retrograde'&&d.blownCortex))return known(side+'.ttl');}if(path==='tibia.graftInsertion')return Number.isFinite(derivedTibia());if(path.endsWith('PlugDiameter')&&!draft.values[path.startsWith('femoral')?'femur':'tibia'].plugDiameterOverride)return known('graftDiameter');if(path==='jointSpan'||path==='foldHeight'||path==='flipAllowance')return true;if(path==='femur.graftInsertion')return Number.isFinite(plannedFemoralInsertion(draft));if(path.endsWith('.aperture')){const side=path.split('.')[0];if(!draft.values[side].blownCortex&&!draft.values[side].apertureOverride&&known(side+'.diameter')&&nominalAperture(state,side)!==null)return true;}return value!==null&&value!==undefined&&value!=='';}
function visibleIssues(){const map=new Map();for(const [path,list] of Object.entries(evaluation.fieldIssues||{}))for(const issue of list){if(!map.has(issue.id))map.set(issue.id,[]);map.get(issue.id).push(path);}return evaluation.issues.filter(issue=>{const paths=map.get(issue.id);if(paths?.length)return paths.every(known);if(!draft.values.graft)return false;return ['fix_femur','fix_tibia','review'].includes(draft.currentStep)&&issue.level!=='error';});}
function prepText(){return ({folded:'Record the prepared folded soft-tissue construct. Its strands fold over the selected fixation loop.',rapidease:'Record the dimensions of the supplied presutured quadruple-strand graft and its prepared attachment loops.',quad:'Record the prepared quad tendon construct with its QuadCinch fixation end.',btb:'Record the tendon construct and each bone block separately.'})[graft()?.family]||'';}
function renderPlan(){
 const selected=graft();let out=select('graft','Graft & preparation',GRAFTS,selected?.description||'Choose the graft to begin. No graft or hardware is placed in the knee yet.');
 if(!selected)return '<div class="demo-invite"><div><b>New to the lab?</b><span>Watch a whole ACL construct built, step by step.</span></div><button type="button" class="btn" data-demo-open>▶ Watch a demo</button></div>'+out+note('Start with the plan','Reaming and fixation choices appear after you select a graft.');
 out+='<h3 class="step-subtitle">Reaming approach</h3>';
 for(const side of ['femur','tibia'])out+=select(side+'.technique',cap(side),TECHNIQUES[side].filter(t=>allowedTechniques(state.graft,side,state).includes(t.id)));
 if(draft.values.tibia.technique==='retrograde')out+=tibialCortexPlan();
 out+='<h3 class="step-subtitle">Planned primary fixation</h3>';
 for(const side of ['femur','tibia'])out+=fixationChoice(side);
 if(draft.values.femur.technique==='transtibial')out+=note('Trans-tibial sequence','Tibia first: drill the 2.4 mm guide pin up from the anteromedial tibia to the ACL footprint and ream the tibial tunnel over it. Then pass the offset femoral aimer up that tunnel with the knee at about 90°, drill the femoral pin out through the anterolateral femur, and ream the femoral socket through the tibial tunnel with the same reamer. A femoral button also needs the 4.5 mm cortical pass. The graft goes up the tibial tunnel.');
 else if(draft.values.femur.technique==='retrograde'&&draft.values.tibia.technique==='retrograde')out+=note('All-inside sequence','Prepare both sockets, bring the graft through the anterior-medial portal into the joint, seat the femoral end, then seat the tibial end.');
 else if(draft.values.tibia.technique==='retrograde'&&!draft.values.tibia.blownCortex)out+=note('AM-portal graft passage','The tibial RR socket keeps its cortex, so the graft cannot come up the tibia. After both sides are prepared, pass the femoral end through the anterior-medial portal, then seat the tibial end.');
 else out+=note('Independent tunnel preparation','The walkthrough prepares the femoral side, then the tibial side. Graft passage follows through the tibial tunnel.');
 return out;
}
function fixationChoice(side){return select(side+'.fixation',cap(side)+' fixation',FIXATIONS.filter(f=>allowedFixations(state.graft,side,state).includes(f.id)));}
function tibialCortexPlan(){const d=draft.values.tibia;return `<div class="cortex-control"><div class="cortex-heading"><span>Tibial cortex</span><button type="button" data-cortex="tibia" aria-pressed="${!!d.blownCortex}">Blown cortex${d.blownCortex?' · on':''}</button></div><p class="help">${draft.values.graft==='qtb'?'The tibial bone block requires screw fixation. With retrograde reaming, Biosteon is available only when the cortex is breached.':'An intact retrograde tibial socket uses ProCinch with ABS. Biosteon becomes available if the cortex is breached.'}</p></div>`;}

function renderXLControls(){const fix=FIXATIONS.find(x=>x.id===draft.values.femur.fixation),d=draft.values.femur;if(fix?.kind!=='integrated'||!d.blownCortex||d.technique==='outside_in')return '';return `<div class="xl-controls"><label class="checkbox-field"><input type="checkbox" data-path="femur.xl"${d.xl?' checked':''}>Add G-Lok XL</label>${!d.xl?'<p class="xl-recommendation">G-Lok XL may be required.</p>':''}${d.xl?select('femur.xlTiming','When to add G-Lok XL',[{id:'before',label:'Before femoral button passage'},{id:'after',label:'After femoral button passage'}],d.xlTiming==='after'?'Attach from outside the knee on the lateral cortex.':'Attach to the regular button so the assembly passes together.'):''}</div>`;}
function renderXLStep(){return renderXLControls()+note(draft.values.femur.xlTiming==='after'?'Add XL on the lateral cortex':'Prepare the button + XL assembly',draft.values.femur.xlTiming==='after'?'The femoral button has passed and flipped. Add the XL accessory from outside the knee on the lateral side.':'Attach the XL accessory to the regular femoral button. The combined assembly will travel with the graft in the next step.');}
function derivedTibia(){return ['btb','folded'].includes(graft()?.family)?(tibialTrim(draft)?.inBoneGraftInsertion??null):plannedTibialInsertion(draft);}
function renderPrep(){
 const blocks=graft()?.family==='btb'||graft()?.id==='qtb';
 let out=note(graft()?.label||'Graft preparation',prepText())+number('graftDiameter',blocks?'Graft / bone-block diameter':'Prepared graft diameter',5,15,.5,blocks?'Also sets each bone block unless that block is set separately below.':'The sized graft envelope stays independent of tunnel length.')+number('graftLength','Prepared graft length',30,150,1,graft()?.family==='btb'?'End to end, including any bone blocks.':'End to end.');
 for(const side of ['femur','tibia'])if(evaluation.sides[side].bonePlug){const prefix=side==='femur'?'femoral':'tibial',own=!!draft.values[side].plugDiameterOverride;out+=`<h3 class="step-subtitle">${cap(side)} bone block</h3>`+number(prefix+'PlugLength','Bone-block length',10,45)+`<label class="checkbox-field"><input type="checkbox" data-path="${side}.plugDiameterOverride"${own?' checked':''}>Set a different block diameter</label>`+number(prefix+'PlugDiameter','Bone-block diameter',5,15,.5,own?'Set separately for this block.':'Matches the graft diameter.',!own,own?undefined:draft.values.graftDiameter);}
 if(graft()?.family==='btb')out+=note('Bone-block preparation','Femoral end up: one 2 mm hole, 40% of the block length from the tip (8 mm for a 20 mm block), for the ProCinch tensioning loop when selected. Tibial end: two 2 mm holes at one-third and two-thirds of the block length, with #2 control sutures.');
 if(isGlok())out+=select('femur.loop','G-Lok fixed loop',FIXED_LOOPS.map(n=>({id:n,label:n+' mm'})),'Select the actual loop used for preparation; its size affects subsequent engagement.');
 return out+note('Fixed reference joint span',`${fmt(state.jointSpan)} mm at 90° flexion. Used for the graft-length balance. ${source(AVERAGE_JOINT_SPAN_SOURCE.url,'Average joint-span study ↗')}`);
}
function renderMeasure(side){
 const flexible=side==='femur'&&draft.values.femur.technique==='flexible',outsideIn=side==='femur'&&draft.values.femur.technique==='outside_in';
 return (isLinked()?(side==='tibia'?note('Tibial tunnel first','Set the tibial aimer on the ACL tibial footprint and read the tunnel length. Its pin enters the anteromedial tibia, medial to the tibial tubercle and above the pes anserinus, and runs steeply up to the footprint.'):note('Measure along the femoral pin','The femoral pin runs from the notch out through the anterolateral femur. Record the femoral length along it; the socket is reamed through the tibial tunnel next.')):'')+(flexible?note('Measure over the flexible pin','Bring the measuring guide in from outside the lateral femur, slide it over the pin down to bone, then record the total femoral tunnel length.'): '')+(outsideIn?note('Measure off the pin','Read the tunnel length off the placed outside-in guide pin, from the joint to the lateral cortex. No separate measuring guide.'):'')+number(side+'.ttl','Total '+side+' tunnel length',20,80,1,flexible?'Pin placed first → guide against lateral cortex → read the total tunnel length.':outsideIn?'Read off the pin: joint aperture to lateral cortex.':isLinked()&&side==='femur'?'Enter the measured aperture-to-cortex length along the pin.':`Enter the measured aperture-to-cortex length. The ${side==='femur'?'35':'40'} mm reference positions the unprepared bone; it is not an entered measurement.`)+note('Measurement only',flexible?'The pin stays in place for the flexible reamer. No graft-sized socket has been reamed yet.':outsideIn?'Preview marks the pin in 5 mm steps out to the lateral cortex. The bone remains unreamed until the reaming step.':'Preview draws the measured path. The bone remains unreamed until the reaming step.');
}
function renderCortexReam(){const flexible=draft.values.femur.technique==='flexible';return note('Perforate the lateral cortex',isLinked()?'The femoral socket is already reamed. Pass the 4.5 mm reamer over the same 2.4 mm pin, up through the tibial tunnel and the socket, and through the lateral cortex to allow later button passage. Withdraw the reamer and remove the pin after this pass.':`The graft-sized socket is already reamed. Pass the ${flexible?'flexible':'low-profile'} 4.5 mm reamer over the same 2.4 mm guide pin again, through the lateral cortex, to allow later button passage. Withdraw the reamer and remove the pin after this pass.`)+facts([['Cortical reamer','4.5 mm'],['Guide pin','2.4 mm'],['Total femoral tunnel',fmt(draft.values.femur.ttl)+' mm'],['Graft socket',fmt(state.femur.socket)+' × '+fmt(state.femur.diameter)+' mm']])+renderCortexControls('femur');}

function trimSummary(){
 const family=graft()?.family;if(!['btb','folded'].includes(family))return '';
 const t=tibialTrim(draft);if(!t||!Number.isFinite(t.graftOutsideBone))return '';
 const trimmed=draft.completed.includes('trim_tibia'),bone=family==='btb',amount=t.trimAmount??t.plannedBoneTrim??0;
 let out=facts([['Remaining tibial graft',fmt(t.graftInsertion)+' mm'],['Graft inside tibia',fmt(t.inBoneGraftInsertion)+' mm'],[trimmed?(bone?'Bone trimmed':'Graft trimmed'):(bone?'Bone outside cortex':'Graft outside cortex'),fmt(bone?t.bonePlugOutside:t.graftOutsideBone)+' mm'],...(bone?[[trimmed?'Bone block retained':'Bone retained after trim',fmt(t.retainedBonePlugLength)+' mm']]:[])]);
 if(amount>0)out+=note(trimmed?'Tibial graft trimmed':'Trim after tibial fixation',trimmed?`${fmt(amount)} mm of projecting ${bone?'bone':'soft tissue'} was trimmed flush with the tibial cortex around the tunnel.`:`${fmt(amount)} mm of ${bone?'bone':'soft tissue'} projects beyond the tibial cortex. Trim the excess after tibial fixation.`);
 return out;
}

function renderTrim(){const bone=graft()?.family==='btb';return note(bone?'Trim the projecting tibial bone block':'Trim the projecting soft-tissue graft',`With tibial fixation complete, cut the projecting ${bone?'bone':'soft tissue'} down along the tibia, flush with the bone surface around the tunnel (not square to the tunnel).`)+`<div data-trim-summary>${trimSummary()}</div>`;}

function renderCortexControls(side){const data=draft.values[side],nominal=known(side+'.diameter')?nominalAperture(state,side):null,locked=!data.blownCortex&&!data.apertureOverride&&nominal!==null;return `<div class="cortex-control"><div class="cortex-heading"><span>Outer cortex</span>${side==='tibia'&&['straight','transtibial'].includes(data.technique)?'':`<button type="button" data-cortex="${side}" aria-pressed="${!!data.blownCortex}">Blown cortex${data.blownCortex?' · on':''}</button>`}</div>${side==='femur'?renderXLControls():''}<label class="checkbox-field"><input type="checkbox" data-path="${side}.apertureOverride"${data.apertureOverride?' checked':''}>Set a different cortical opening</label>${number(side+'.aperture','Cortical opening',2,20,.5,data.blownCortex?'Starts at the reamer diameter; adjust to the measured opening.':locked?`${fmt(nominal)} mm cortical opening.`:'Enter the cortical opening.',locked,locked?nominal:undefined)}</div>`;}
function renderReam(side){
 const data=draft.values[side],glok=side==='femur'&&isGlok(),fullDepth=(side==='tibia'&&['straight','transtibial'].includes(data.technique))||data.technique==='outside_in'||(data.technique==='retrograde'&&data.blownCortex),separateCortex=side==='femur'&&['flexible','low_profile','transtibial'].includes(data.technique)&&FIXATIONS.find(f=>f.id===data.fixation)?.kind==='integrated',tt=isLinked();
 let out=(tt?note(side==='tibia'?'Ream the tibial tunnel':'Ream through the tibial tunnel',side==='tibia'?'Ream over the guide pin from the anteromedial tibia up to the footprint. The femoral socket is reamed later through this tunnel with the same reamer.':'Advance the reamer over the femoral pin up the tibial tunnel and ream the femoral socket to the depth below. It is the tibial tunnel’s reamer, so the socket takes that diameter.'):'')+facts([['Measured tunnel',fmt(data.ttl)+' mm'],['Technique',TECHNIQUES[side].find(t=>t.id===data.technique)?.label||'—']])+number(side+'.socket','Reamed socket / tunnel depth',0,80,1,fullDepth?(data.technique==='retrograde'?'The open cutting tooth reams through to the cortex.':'This method reams the full tunnel length.'):'Depth measured from the joint aperture.',fullDepth,fullDepth?data.ttl:undefined)+(tt&&side==='femur'?number('femur.diameter','Reamed diameter',5,15,.5,'Same reamer as the tibial tunnel — it passes up through it.',true,draft.values.tibia.diameter):number(side+'.diameter','Reamed diameter',5,15,.5,data.technique==='retrograde'?'VersiTomic RR cutting diameter.':tt?'Tibial tunnel reamer; the femoral socket is reamed with it too.':'Reamer diameter.'));
 if(!separateCortex)out+=renderCortexControls(side);
 if(side==='tibia'){
  if(data.technique==='retrograde')out+=fixationChoice('tibia');
  out+=number('tibia.graftInsertion','Calculated graft within tibia',0,60,1,'Prepared length − femoral seating depth − 22 mm joint span. Excess beyond an open tibial tunnel is shown separately. At least 20 mm is preferred in each bone.',true,derivedTibia());
  if(derivedTibia()===null)out+='<p class="help">Calculated once the prepared graft length, femoral seating depth and tibial tunnel length are entered.</p>';
  out+=`<div data-trim-summary>${trimSummary()}</div>`;
 }else{
  out+=`<div data-femoral-seating>${femoralSeating()}</div>`;
 }
 return out;
}
function femoralSeating(){return facts([['Femoral graft seating',fmt(plannedFemoralInsertion(draft))+' mm']])+note(isGlok()?'Fixed-loop seating':'Graft seats to the socket depth',isGlok()?'G-Lok engagement follows total tunnel − fixed loop + 4 mm fold height. The fixed loop does not shorten.':'The prepared graft advances to the femoral socket end. Changing the socket depth updates the remaining graft available for the tibia.');}

function renderPin(id){
 if(id==='femur_flexible_pin'||id==='femur_low_profile_pin'){const flexible=id==='femur_flexible_pin';return note(flexible?'Flexible guide pin':'Low-profile guide pin',flexible?'Pass the 2.4 mm flexible guide pin through the anterior-medial portal into the joint, then into the femoral target. The curved guide approaches through the joint; it does not enter through the medial condyle. Measure before reaming.':'Drill the straight 2.4 mm guide pin in through the anterior-medial portal and straight through the femur, out through the lateral cortex. It is drilled in deep flexion; the model stays at 90°, so it shows the straight pin through the femur. Measure before reaming.')+facts([['Guide pin',flexible?'2.4 mm':'2.4 mm · straight'],['Next','Measure the femoral path']]);}
 if(isLinked()&&id==='tibia_pin')return note('Tibial guide pin','With the tibial aimer on the ACL tibial footprint, drill the 2.4 mm guide pin up from the anteromedial tibia — medial to the tibial tubercle, above the pes anserinus — into the joint at the footprint.')+facts([['Pin diameter','2.4 mm'],['Next','Ream the tibial tunnel']]);
 if(isLinked()&&id==='femur_pin')return note('Femoral pin through the tibial tunnel','Pass the offset femoral aimer up the reamed tibial tunnel with the knee at about 90° and hook its tongue on the back wall. Drill the 2.4 mm eyelet pin into the femur and out through the anterolateral cortex and thigh, then withdraw the aimer. The pin stays for measuring and reaming.')+facts([['Pin diameter','2.4 mm'],['Access','Through the tibial tunnel'],['Next','Measure the femoral path']]);
 const side=id==='femur_pin'?'femur':'tibia';return note('2.4 mm guide pin',side==='femur'?'Place the outside-in guide pin first, from the lateral femoral cortex toward the joint. Measure the path before reaming.':'Place the 2.4 mm tibial guide pin. The straight reamer advances over this pin; the pin remains visible during reaming.')+facts([['Pin diameter','2.4 mm'],['Next',side==='femur'?'Measure the femoral path':'Ream over the pin']]);
}

function renderPass(id){const d=draft.values,inside=(d.femur.technique==='retrograde'&&d.tibia.technique==='retrograde')||(d.tibia.technique==='retrograde'&&!d.tibia.blownCortex),screw=['biosteon','wedge'].includes(d.femur.fixation);return note(id==='pass_tibia'?'Seat the tibial end':inside?'Pass into the femoral socket':'Pass the graft through the tibia',id==='pass_tibia'?'The free end enters through the same anterior-medial portal and seats into the tibial socket. It does not pass through the narrow outer-cortex hole.':inside?(screw?'The prepared graft enters from the front through the anterior-medial portal into the joint and is advanced into the femoral socket for screw fixation. The tibial end remains outside its socket for the next step.':'The prepared graft enters from the front through the anterior-medial portal into the joint. The button passes and flips on the lateral femoral cortex; tensioning the ProCinch tails then draws the graft to the socket end. The tibial end remains outside its socket for the next step.'):isGlok()?'The G-Lok button and graft travel together at a fixed loop length. Once the button flips, the loop remains the selected length.':FIXATIONS.find(f=>f.id===draft.values.femur.fixation)?.kind==='integrated'?'Pass the button up through the tunnels and flip it on the lateral cortex while the graft trails in the tibial tunnel. Tension the ProCinch tails to draw the graft up to the femoral socket end.':'The prepared graft advances up the tibial tunnel, across the joint and into the femoral socket before screw fixation.')+facts([['Prepared graft',fmt(draft.values.graftDiameter)+' × '+fmt(draft.values.graftLength)+' mm'],['Joint reference',fmt(state.jointSpan)+' mm'],['Femoral insertion',fmt(evaluation.sides.femur.graftInsertion)+' mm'],['Tibial graft in bone',fmt(derivedTibia())+' mm']]);}
function candidateMarkup(side){
 const titanium=draft.values[side]?.fixation==='wedge';
 if(!titanium&&!draft.values[side]?.boneQuality)return '<p class="help">Choose bone quality to see guide-based sizing options. You can also enter the selected screw size directly.</p>';
 const index=evaluation.recommendations.findIndex(r=>r.id===side+(titanium?'-wedge-guide':'-biosteon-guide')),rec=evaluation.recommendations[index];if(!rec)return '';
 return `<div class="inline-suggestions"><h3 class="step-subtitle">${titanium?(rec.catalogOnly?'Titanium catalog options':'Titanium sizing options'):'Biosteon guide options'}</h3><p class="help">${esc(rec.detail)}</p><div class="candidate-list">${(rec.candidates||[]).map((c,i)=>{const on=draft.values[side].screwDiameter===c.diameter&&draft.values[side].screwLength===c.length;return `<button type="button" class="candidate${on?' selected':''}" data-candidate="${i}" data-rec="${index}"><span><b>${esc(c.label)}</b><small>${esc(c.sku)}</small></span><span>${on?'Selected':'Apply'}</span></button>`;}).join('')}</div>${source(rec.source,titanium?'Titanium catalog ↗':'Sizing guide ↗')}</div>`;
}
function renderFix(side){const d=draft.values[side],fix=FIXATIONS.find(f=>f.id===d.fixation);let out=(side==='tibia'&&d.technique==='retrograde'?fixationChoice(side):'')+note(cap(side)+' fixation',esc(fix?.label||'Select primary fixation.'));if(fix?.kind==='screw')out+=(d.fixation==='biosteon'?select(side+'.boneQuality','Bone quality for guide options',[{id:'normal',label:'Normal / hard bone'},{id:'soft',label:'Softer bone'}]):'')+number(side+'.screwDiameter','Screw diameter',6,12,1,'The entered size remains selected until you explicitly apply a suggestion.')+number(side+'.screwLength','Screw length',20,35,1)+`<div id="active-suggestions">${candidateMarkup(side)}</div>`;if(fix?.kind==='abs'){out+=select(side+'.button','Attachable button',BUTTONS);const spec=BUTTONS.find(b=>b.id===d.button);if(spec)out+=`<div class="button-dimensions">${spec.outerDiameter?spec.outerDiameter+' mm outer diameter':spec.width+' × '+spec.length+' mm footprint'} · ${spec.projection?spec.projection+' mm central projection':'flat profile'} · ${spec.thickness} mm rim.<br>Measured cortical opening: ${fmt(state[side].aperture)} mm.</div>`;out+='<button class="button subtle" type="button" data-go-step="'+side+'_ream'+'">Edit cortical opening →</button>';}
if(fix?.kind==='screw'&&side==='femur'&&d.technique==='outside_in')out+=note('Screw from the lateral side','Inserted outside in from the lateral femoral cortex'+(evaluation.sides[side].bonePlug?', seated flush with the outer end of the bone block and never proud of the lateral opening.':', seated flush with the lateral cortex.'));
else if(fix?.kind==='screw'&&evaluation.sides[side].bonePlug)out+=note('Screw seating',side==='femur'?'Seated flush with the joint-side end of the bone block where the socket allows, and never proud of the tunnel opening.':'Seated flush with the outer end of the bone block, and never proud of the tunnel opening.');
if(d.fixation==='biosteon'&&graft()?.family==='btb')out+=note('Tap before the screw','The Biosteon sizing guide recommends tapping the tunnel before inserting a Biosteon screw with a BTB graft. Tap size is at surgeon discretion; the Biosteon HA/PLLA tap is line-to-line with the screw size. No tap is added to this case.');
if(side==='femur'&&d.xl)out+=facts([['G-Lok XL',d.xlTiming==='after'?'Added after button passage':'Attached before button passage']]);
if(d.fixation==='glok')out+=facts([['Fixed loop',fmt(d.loop)+' mm'],['Femoral engagement',fmt(evaluation.sides.femur.graftInsertion)+' mm']]);if(side==='tibia')out+=`<div data-trim-summary>${trimSummary()}</div>`;const ready=requiredPathsForStep(draft,current().id).every(known);if(ready&&evaluation.sides[side].fixationSku)out+=`<div class="part-preview"><span>Selected ${cap(side).toLowerCase()} assembly</span><code>${esc(evaluation.sides[side].fixationSku)}</code></div>`;return out;}
function renderReview(){return note('Construct walkthrough complete','Review the entered measurements and fit checks. Earlier steps can be reopened from Case sequence; changing a measurement reopens the affected steps.')+facts([['Graft',graft()?.label||'—'],['Prepared size',fmt(draft.values.graftDiameter)+' × '+fmt(draft.values.graftLength)+' mm'],['Femoral tunnel',fmt(draft.values.femur.ttl)+' mm'],['Tibial tunnel',fmt(draft.values.tibia.ttl)+' mm']])+`<div data-trim-summary>${trimSummary()}</div><div class="product-grid">${evaluation.products.map(p=>`<article class="product-card"><span class="product-side">${cap(p.side)}</span><h3>${esc(p.label)}</h3><div class="sku">${p.sku?'Part '+esc(p.sku):'Size requires review'}</div><p>${esc(p.detail||'')}</p>${source(p.source)}</article>`).join('')}</div>`;}
// trans-tibial: the tibial tunnel first, then the femur through it
const TT_DESCRIPTIONS={tibia_measure:'Set the tibial aimer on the ACL footprint and read the tunnel length before drilling.',tibia_pin:'Drill the 2.4 mm guide pin up from the anteromedial tibia to the ACL footprint.',tibia_ream:'Ream the tibial tunnel over the pin. The same reamer makes the femoral socket later.',femur_pin:'Through the tibial tunnel with the offset aimer, drill the 2.4 mm pin into the femur and out the anterolateral cortex.',femur_measure:'Measure the femoral path along the pin before choosing the socket depth.',femur_ream:'Ream the femoral socket over the pin through the tibial tunnel to its depth.',femur_cortex_ream:'Ream over the same pin with the 4.5 mm reamer, up through the tibial tunnel, to open the lateral cortex for the button.'};
const descriptions={plan:'Choose the graft, reaming approaches and planned fixation. The knee starts unprepared.',prep:'Record the completed graft preparation. The prepared graft and femoral button are shown beside the knee.',femur_measure:'Measure the femoral tunnel before choosing its reamed depth.',femur_pin:'Place the outside-in 2.4 mm guide pin before measuring or reaming.',femur_low_profile_pin:'Drill the straight 2.4 mm guide pin through the femur before measuring or reaming.',femur_flexible_pin:'Pass the 2.4 mm flexible guide pin through the AM portal before measuring or reaming.',femur_cortex_ream:'Ream over the same pin again with the 4.5 mm reamer to perforate the lateral cortex for later button passage.',trim_tibia:'Trim the calculated tibial graft overhang after fixation.',xl_femur:'Add the G-Lok XL accessory at the selected point in femoral button passage.',femur_ream:'Enter the femoral reaming dimensions, then use Preview to animate or Next to continue.',tibia_measure:'Measure the tibial tunnel before choosing its reamed depth.',tibia_pin:'Preview the tibial guide-pin route before reaming.',tibia_ream:'Enter the tibial reaming dimensions, then use Preview to animate or Next to continue.',pass_femur:'With both sides prepared, advance the graft along the selected passage route.',pass_tibia:'Seat the second graft end into the tibial socket.',fix_femur:'Confirm the selected femoral implant and preview its seating.',fix_tibia:'Confirm the selected tibial implant and preview its seating.',review:'Review the completed construct and any measurement or product concerns.'};
function renderFields(){const id=current().id;$('#step-fields').innerHTML=id==='plan'?renderPlan():id==='prep'?renderPrep():id==='xl_femur'?renderXLStep():id==='trim_tibia'?renderTrim():id==='femur_cortex_ream'?renderCortexReam():id.endsWith('_measure')?renderMeasure(id.split('_')[0]):id.endsWith('_ream')?renderReam(id.split('_')[0]):id.endsWith('_pin')?renderPin(id):id.startsWith('pass_')?renderPass(id):id.startsWith('fix_')?renderFix(id.split('_')[1]):renderReview();}
function renderNavigation(){const step=current(),index=steps.indexOf(step),completed=draft.completed.includes(step.id),check=canCompleteStep(draft,step.id);$('#step-heading').textContent=step.label;$('#step-description').textContent=step.id==='femur_measure'&&draft.values.femur.technique==='flexible'?'Measure over the placed pin from the outside lateral cortex.':step.id==='femur_measure'&&draft.values.femur.technique==='outside_in'?'Read the tunnel length off the placed pin before reaming.':(isLinked()&&TT_DESCRIPTIONS[step.id])||descriptions[step.id]||'';$('#step-eyebrow').textContent='STEP '+String(index+1).padStart(2,'0')+(completed?' · COMPLETE':'');$('#step-count').textContent=`${index+1} / ${steps.length}`;$('#progress-bar').style.transform='scaleX('+(draft.completed.length/steps.length)+')';$('#case-map-summary').textContent=graft()?.label||'No plan yet';$('#step-list').innerHTML=steps.map((s,i)=>{const unlocked=draft.completed.includes(s.id)||i===draft.completed.length;return `<li><button type="button" data-go-step="${s.id}"${unlocked?'':' disabled'} class="${draft.completed.includes(s.id)?'is-complete':''}"${s.id===step.id?' aria-current="step"':''}>${esc(s.label)}</button></li>`;}).join('');$('#previous-step').disabled=index===0||busy;$('#preview-step').hidden=['plan','review'].includes(step.id);$('#preview-step').disabled=busy||!check.ok;$('#preview-step').textContent=busy?'Playing…':'▶ Preview';$('#complete-step').disabled=false;$('#complete-step').textContent=step.id==='review'?(completed?'Download PDF ↗':'Complete & download PDF ↗'):'Next →';if(attempted&&!check.ok){$('#step-validation').hidden=false;$('#step-validation').innerHTML='<b>Complete these entries first:</b>'+check.missing.map(m=>'<p>'+esc(m)+'</p>').join('');}else $('#step-validation').hidden=true;$('#scene-stage-label').textContent=step.label;$('#scene-stage-status').textContent=busy?'Previewing this step':draft.completed.length?`${Math.min(draft.completed.length,index+1)} completed · ${step.id==='review'?'review':'step by step'}`:'Unprepared reference knee';$('#editor-summary').textContent=!draft.values.graft?'No graft or measurements selected':completed?'Step completed · measurements remain editable':check.ok?'Preview the step or continue with Next':'Enter the remaining case details';}
function syncFields(){for(const input of $$('[data-path]')){let value=get(input.dataset.path);if(input.readOnly){if(input.dataset.path.endsWith('PlugDiameter'))value=draft.values.graftDiameter;else if(input.dataset.path.endsWith('.socket'))value=state[input.dataset.path.split('.')[0]].ttl;else if(input.dataset.path==='tibia.graftInsertion')value=derivedTibia();else if(input.dataset.path==='femur.graftInsertion'&&isGlok())value=evaluation.sides.femur.graftInsertion;else if(input.dataset.path.endsWith('.aperture'))value=nominalAperture(state,input.dataset.path.split('.')[0]);}if(input.type==='checkbox')input.checked=!!value;else if(input.type==='range'){const entered=typeof value==='number'&&Number.isFinite(value);input.disabled=false;input.min=entered?Math.min(Number(input.dataset.min),value):input.dataset.min;input.max=entered?Math.max(Number(input.dataset.max),value):input.dataset.max;input.value=entered?value:input.min;}else if(input!==document.activeElement||input.readOnly)input.value=value??'';}}
function syncCortex(){for(const side of ['femur','tibia']){const wrap=$(`[data-measurement="${side}.aperture"]`);if(!wrap)continue;const nominal=known(side+'.diameter')?nominalAperture(state,side):null,locked=!draft.values[side].blownCortex&&!draft.values[side].apertureOverride&&nominal!==null,input=wrap.querySelector('input[type=number]');input.readOnly=locked;input.setAttribute('aria-readonly',String(locked));wrap.classList.toggle('readonly',locked);if(locked)input.value=nominal;else if(input!==document.activeElement)input.value=draft.values[side].aperture??'';for(const node of wrap.querySelectorAll('input[type=range],.range-captions,.empty-range'))node.hidden=locked;const help=wrap.querySelector('.help');if(help)help.textContent=locked?`${fmt(nominal)} mm cortical opening.`:draft.values[side].blownCortex?'Starts at the reamer diameter; adjust to the measured opening.':'Enter the cortical opening.';}}
function feedback(){const visible=visibleIssues(),ids=new Set(visible.map(i=>i.id));for(const wrap of $$('[data-measurement],[data-field]')){const path=wrap.dataset.measurement||wrap.dataset.field,list=(evaluation.fieldIssues?.[path]||[]).filter(i=>ids.has(i.id)),errors=list.filter(i=>i.level==='error'),warnings=list.filter(i=>i.level==='warning');wrap.classList.toggle('is-invalid',!!errors.length);wrap.classList.toggle('is-warning',!errors.length&&!!warnings.length);for(const input of wrap.querySelectorAll('input,select'))input.setAttribute('aria-invalid',errors.length?'true':'false');const box=wrap.querySelector('.field-feedback');if(box)box.innerHTML=[...new Set((errors.length?errors:warnings).map(i=>i.message))].slice(0,2).map(m=>`<p><span>!</span> ${esc(m)}</p>`).join('');const range=wrap.querySelector('[type=range]');if(range){const limits=evaluation.fieldLimits?.[path]||{},min=Number(range.min),max=Number(range.max),pct=n=>Math.max(0,Math.min(100,(n-min)/(max-min||1)*100));const safe=known(path)&&visible.some(i=>(evaluation.fieldIssues?.[path]||[]).some(j=>j.id===i.id));range.style.setProperty('--safe-start',safe&&limits.min!==undefined?pct(limits.min)+'%':'0%');range.style.setProperty('--safe-end',safe&&limits.max!==undefined?pct(limits.max)+'%':'100%');}const empty=wrap.querySelector('.empty-range');if(empty)empty.hidden=known(path);}
const id=current().id;let relevant=visible.filter(i=>i.level==='error');if(id!=='review'){const paths=new Set($$('[data-path]').map(n=>n.dataset.path));relevant=relevant.filter(i=>[...paths].some(p=>(evaluation.fieldIssues[p]||[]).some(j=>j.id===i.id)));}else relevant=visible;$('#step-fit').innerHTML=relevant.length?`<div class="section-title"><h3>${id==='review'?'Fit & product review':'Check these measurements'}</h3></div>`+relevant.map(i=>`<div class="issue ${i.level}"><span class="issue-icon">${i.level==='error'?'!':'i'}</span><div><b>${esc(i.title)}</b><p>${esc(i.message)}</p></div></div>`).join(''):id==='review'?'<div class="step-complete-note">No measurement conflicts found.</div>':'';
const suggestions=$('#active-suggestions');if(suggestions)suggestions.innerHTML=candidateMarkup(id.split('_')[1]);}
function record(){const g=graft();$('#record-title').textContent=g?.label||'No plan selected';const pair=(name,value)=>`<dt>${esc(name)}</dt><dd>${esc(value)}</dd>`;$('#case-record-content').innerHTML=!g?'<p class="case-record-content empty-note">The case record fills in as you enter measurements and complete steps.</p>':`<div class="case-record-grid"><section><h3>Graft preparation</h3><dl>${pair('Graft',g.label)}${pair('Prepared diameter',fmt(draft.values.graftDiameter)+' mm')}${pair('Prepared length',fmt(draft.values.graftLength)+' mm')}${pair('Fixed reference joint span',fmt(state.jointSpan)+' mm')}</dl></section>${['femur','tibia'].map(side=>`<section><h3>${cap(side)}</h3><dl>${pair('Approach',TECHNIQUES[side].find(t=>t.id===draft.values[side].technique)?.label||'Not selected')}${pair('Planned fixation',FIXATIONS.find(f=>f.id===draft.values[side].fixation)?.label||'Not selected')}${pair('Total tunnel',fmt(draft.values[side].ttl)+' mm')}${pair('Reamed depth / diameter',fmt(known(side+'.socket')?state[side].socket:null)+' / '+fmt(draft.values[side].diameter)+' mm')}${pair('Graft in bone',known(side+'.graftInsertion')?fmt(side==='tibia'?derivedTibia():evaluation.sides[side].graftInsertion)+' mm':'Not entered')}</dl></section>`).join('')}</div>`;}
function modelNotes(snapshot){
 const warnings=(snapshot?.anatomyWarnings||[]).filter(w=>w.side==='linked'?(known('femur.ttl')&&known('tibia.ttl')):known(w.side+'.ttl')).map(w=>w.message);
 const contacts=['femur','tibia'].flatMap(side=>{const h=snapshot?.hardware?.[side];return h?.softTissueFlag?[`${cap(side)} titanium screw: ${fmt(h.softTissueOverlap)} of ${fmt(h.length)} mm (${Math.round((h.softTissueShare||0)*100)}%) is against soft tissue. Biosteon screw may be recommended.`]:[];});
 return {warnings,contacts};
}
function showModelWarnings(snapshot){
 const {warnings,contacts}=modelNotes(snapshot);
 const box=$('#geometry-warning');box.hidden=!warnings.length&&!contacts.length;box.textContent=[...contacts,...warnings].join(' ');
}
// While the prep step is open and its sizes are entered, show that prepared graft beside the knee (no hidden defaults).
function viewWorkflow(d){const w=workflowForCase(d);if(w.stage==='prep'&&!w.graftPrepared&&canCompleteStep(d,'prep').ok)w.graftPrepared=true;return w;}
function modelUpdate(){cancelAnimationFrame(modelFrame);if(demo.on)return;modelFrame=requestAnimationFrame(()=>{if(!model||demo.on)return;try{settings.workflow=viewWorkflow(draft);model.update(state,evaluation,settings);showModelWarnings(model.getSnapshot());}catch(error){modelFailure(error);}});}
function refresh(structural=false,shouldSave=true){steps=stepsForCase(draft);state=materializeCase(draft);evaluation=evaluate(state);state=evaluation.state;if(structural)renderFields();syncFields();syncCortex();renderNavigation();feedback();record();for(const box of $$('[data-trim-summary]'))box.innerHTML=trimSummary();for(const box of $$('[data-femoral-seating]'))box.innerHTML=femoralSeating();modelUpdate();if(shouldSave)save();}
function edit(path,value){if(busy)stopPreview();const before=draft.completed.length;draft=updateCaseValue(draft,path,value);revision++;attempted=false;if(draft.completed.length<before)toast('Updated. Affected steps are reopened so the scene can be rebuilt.');}
function setView(name){view=name;settings.activeSide=name==='tibia'?'tibia':name==='detail'?'femur':settings.activeSide;$$('[data-view]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.view===name));b.tabIndex=b.dataset.view===name?0:-1;});$('#scene-title').textContent=({detail:'Femoral tunnel detail',anterior:'Straight on · femoral notch',tibia:'Tibial tunnel detail',side:'Lateral view'})[name]||'Straight on · femoral notch';model?.setOptions(settings);model?.setView(name);}
// A new step opens in Straight on with its fields from the top; the sheet keeps the height the user left it at.
function focusStep(){clearMeasurementGuide();const step=current();settings.activeSide=step.side||'femur';setView('anterior');$('#step-heading').focus({preventScroll:true});$('#sb').scrollTop=0;}
function stopPreview(){previewRun++;model?.cancelAnimation();busy=false;}
async function perform(advance){
 clearMeasurementGuide();const step=current();
 if(advance){
  stopPreview();attempted=true;
  const check=canCompleteStep(draft,step.id);
  if(!check.ok){renderNavigation();$('#step-validation').scrollIntoView({block:'nearest',behavior:'smooth'});return;}
  draft=completeStep(draft,step.id);revision++;attempted=false;refresh(true);
  if(step.id==='review')exportCase();else focusStep();
  return;
 }
 if(busy)return;
 attempted=true;const check=canCompleteStep(draft,step.id);
 if(!check.ok){renderNavigation();$('#step-validation').scrollIntoView({block:'nearest',behavior:'smooth'});return;}
 const token=revision,run=++previewRun;busy=true;renderNavigation();
 try{
  if(model&&!['plan','review'].includes(step.id)){
   cancelAnimationFrame(modelFrame);settings.workflow=workflowForCase(draft);model.update(state,evaluation,settings);
   const result=await model.animateStep();
   if(result?.cancelled){if(run===previewRun&&revision===token)toast('Preview stopped. Use Next to continue.');return;}
   if(run===previewRun&&revision===token){showModelWarnings(model.getSnapshot());toast('Preview finished. Use Next to continue.');$('#scene-stage-status').textContent='Preview complete · ready for Next';}
  }
 }catch(error){if(run===previewRun){toast('Animation unavailable; you can still continue with Next.');console.error(error);}}
 finally{if(run===previewRun){busy=false;renderNavigation();if(revision===token&&model?.getSnapshot()?.workflow?.preview)$('#scene-stage-status').textContent='Preview complete · ready for Next';}}
}
async function exportCase(){
 if(pdfBusy)return;pdfBusy=true;$('#export-button').disabled=true;
 const snapshot=structuredClone(draft);
 try{
  if(!model?.captureFinalImage)throw new Error('The 3D viewer must be ready before exporting its measured construct image.');
  stopPreview();clearMeasurementGuide();cancelAnimationFrame(modelFrame);
  const snapshotState=materializeCase(snapshot),snapshotEvaluation=evaluate(snapshotState),snapshotSettings={...settings,workflow:workflowForCase(snapshot)};
  model.update(snapshotEvaluation.state,snapshotEvaluation,snapshotSettings);
  const allReady=stepsForCase(snapshot).every(step=>missingForStep(snapshot,step.id).length===0);
  const notes=modelNotes(window.aclGeometry);
  const viewerImage=await model.captureFinalImage({final:allReady});
  if(!viewerImage?.dataUrl)throw new Error('The measured construct image could not be captured.');
  const {buildCaseReport}=await import('./case-report.js');
  const bytes=await buildCaseReport(snapshot,{viewerImage,viewerNotes:[...notes.contacts,...notes.warnings]});
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download='ACL-case-'+new Date().toISOString().slice(0,10)+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
  toast('Case PDF downloaded with the measured construct image, products and steps.');
 }catch(error){console.error('Case PDF failed',error);toast('PDF export needs a ready 3D image. '+(error?.message||'Please retry after the viewer loads.'));}
 finally{pdfBusy=false;$('#export-button').disabled=false;modelUpdate();renderNavigation();}
}

let measurementGuideTimer;
function clearMeasurementGuide(){clearTimeout(measurementGuideTimer);settings.measurementGuide=null;model?.setMeasurementGuide?.(null);}
function showMeasurementGuide(path){clearTimeout(measurementGuideTimer);const value=get(path);if(!/^(femur|tibia)\.(ttl|socket|diameter|aperture)$/.test(path)||!Number.isFinite(value)){clearMeasurementGuide();return;}settings.measurementGuide={path,value,...(path==='tibia.diameter'&&isLinked()&&!known('femur.socket')?{shared:false}:{})};settings.activeSide=path.split('.')[0];model?.setMeasurementGuide?.(settings.measurementGuide);}
function dismissMeasurementGuideSoon(){clearTimeout(measurementGuideTimer);measurementGuideTimer=setTimeout(clearMeasurementGuide,2400);}
document.addEventListener('focusin',e=>{if(e.target.matches('input[data-path]:not([readonly])'))showMeasurementGuide(e.target.dataset.path);});
document.addEventListener('focusout',e=>{if(e.target.matches('input[data-path]'))dismissMeasurementGuideSoon();});
document.addEventListener('pointerup',dismissMeasurementGuideSoon);
document.addEventListener('pointercancel',dismissMeasurementGuideSoon);
document.addEventListener('pointerdown',e=>{const el=e.target;if(el.matches('input[type=range][data-path]')&&!known(el.dataset.path)){edit(el.dataset.path,Number(el.value));refresh();}if(el.matches('input[data-path]:not([readonly])'))showMeasurementGuide(el.dataset.path);});
document.addEventListener('input',e=>{const el=e.target;if(!el.matches('input[data-path]:not([type=checkbox])')||el.readOnly)return;const value=el.value.trim()===''?null:Number(el.value);if(value!==null&&!Number.isFinite(value))return;edit(el.dataset.path,value);showMeasurementGuide(el.dataset.path);refresh();dismissMeasurementGuideSoon();});
document.addEventListener('change',e=>{const el=e.target;if(!el.matches('[data-path]'))return;if(el.type==='number'||el.type==='range')return;let value=el.type==='checkbox'?el.checked:el.value;if(el.dataset.path.endsWith('.loop'))value=value===''?null:Number(value);edit(el.dataset.path,value);refresh(true);});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;if(b.dataset.demoOpen!==undefined)openDemo();if(b.dataset.goStep){stopPreview();draft=goToStep(draft,b.dataset.goStep);revision++;attempted=false;refresh(true);$('.case-map').open=false;focusStep();}if(b.dataset.view)setView(b.dataset.view);if(b.dataset.cortex){const side=b.dataset.cortex;edit(side+'.blownCortex',!draft.values[side].blownCortex);refresh(true);}if(b.dataset.candidate!==undefined){const rec=evaluation.recommendations[Number(b.dataset.rec)],candidate=rec?.candidates?.[Number(b.dataset.candidate)];if(candidate){for(const [side,values] of Object.entries(candidate.patch||{}))for(const [key,value] of Object.entries(values))edit(side+'.'+key,value);refresh(true);toast('Selected guide size applied.');}}});
$('#complete-step').addEventListener('click',()=>{if(!canCompleteStep(draft,current().id).ok&&sheet.state()==='peek')sheet.set('half');perform(true);});$('#preview-step').addEventListener('click',()=>{sheet.forPreview();perform(false);});$('#previous-step').addEventListener('click',()=>{const index=steps.findIndex(s=>s.id===draft.currentStep);if(index>0){stopPreview();draft=goToStep(draft,steps[index-1].id);revision++;attempted=false;refresh(true);focusStep();}});
$('#new-case').addEventListener('click',()=>{clearTimeout(saveTimer);stopPreview();$('.case-map').open=false;if(draft.values.graft){savedCase=structuredClone(draft);try{localStorage.setItem(STORAGE,JSON.stringify(savedCase));}catch{}$('#resume-banner').hidden=false;}clearMeasurementGuide();draft=createCase();revision++;attempted=false;refresh(true,false);setView('anterior');$('#sb').scrollTop=0;sheet.set(sheet.state()==='peek'?'half':sheet.state());toast(savedCase?'New empty case. The previous case is under Resume.':'New empty case.');});
$('#resume-case').addEventListener('click',()=>{if(!savedCase)return;stopPreview();draft=sanitizeCase(savedCase);revision++;attempted=false;$('#resume-banner').hidden=true;refresh(true);focusStep();toast('Saved case resumed.');});
// Clear: the saved case leaves this device (Undo in the toast for a few seconds). A case already started this visit is the one
// the device keeps (save() wrote it over the saved one), so it stays; only the case behind Resume goes.
$('#clear-case').addEventListener('click',()=>{if(!savedCase)return;const cleared=savedCase,banner=$('#resume-banner'),focused=banner.contains(document.activeElement);savedCase=null;banner.hidden=true;if(!draft.values.graft){try{localStorage.removeItem(STORAGE);}catch{}}if(focused)$('#step-heading').focus({preventScroll:true});toast('Saved case cleared.',{label:'Undo',run:refocus=>{if(savedCase)return;savedCase=cleared;if(!draft.values.graft){try{localStorage.setItem(STORAGE,JSON.stringify(cleared));}catch{}}banner.hidden=false;if(refocus)$('#resume-case').focus({preventScroll:true});}});});
$('#export-button').addEventListener('click',exportCase);
$('#lenses').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const tabs=$$('#lenses [data-view]'),i=tabs.indexOf(document.activeElement),n=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;e.preventDefault();tabs[n].focus();setView(tabs[n].dataset.view);});
// ---- display chips and the floating view buttons
const pressed=(id,on)=>$('#'+id).setAttribute('aria-pressed',String(!!on));
for(const key of ['labels','orientation'])$('#'+key+'-toggle').addEventListener('click',()=>{settings[key]=!settings[key];pressed(key+'-toggle',settings[key]);model?.setOptions(settings);});
$('#xray-toggle').addEventListener('click',()=>{const on=$('#xray-toggle').getAttribute('aria-pressed')!=='true';pressed('xray-toggle',on);settings.opacity=on?XRAY_OPACITY:1;model?.setOptions(settings);});
$('#legend-toggle').addEventListener('click',()=>{const on=$('#legend').hidden;$('#legend').hidden=!on;pressed('legend-toggle',on);});
$('#zoom-in').addEventListener('click',()=>model?.zoomBy(1.2));$('#zoom-out').addEventListener('click',()=>model?.zoomBy(1/1.2));$('#zoom-reset').addEventListener('click',()=>{model?.resetZoom();model?.setView(demo.on?'anterior':view);});
// the stage never scrolls: focus or find-in-page can nudge a clipped box, so snap it back
$('#app').addEventListener('scroll',()=>{const a=$('#app');if(a.scrollTop||a.scrollLeft){a.scrollTop=0;a.scrollLeft=0;}});

// ---- the walkthrough sheet. Phones: a sheet in front of the knee — peek (the step and its buttons), half (the fields with the
// knee still in view above) and full (typing). Drag or tap its handle; a number field opens it fully and closing the keyboard
// puts it back. Landscape phones and screens from 860 px dock it on the right. On phones the knee is framed above the half-open
// sheet and holds still while the sheet moves: lowering it uncovers more of the model, raising it covers the lower part.
const sheet=(()=>{
 const el=$('#sheet'),grab=$('#grab'),sb=$('#sb'),top=$('.sh-top'),app=$('#app'),hud=$('#hud'),head=$('#top');
 const DOCKED='(min-width:860px) and (min-height:541px), (orientation:landscape) and (max-height:540px)';
 const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches,docked=()=>matchMedia(DOCKED).matches;
 const KEYED='#sb input[type=number]:not([readonly]),#sb input[type=text]';
 let state='half',auto=null,drag=null,settle=0;
 function metrics(){const H=Math.max(1,el.offsetHeight),sab=$('#sabm')?.offsetHeight||0,peek=Math.min(H,26+top.offsetHeight+sab),half=Math.min(H,Math.max(peek+150,Math.round(H*.56)));return {H,peek,half,full:H};}
 const visible=(s,m)=>s==='full'?m.full:s==='peek'?m.peek:m.half;
 function insets(){
  const h=head.offsetHeight,own=!demo.on;if(own)document.documentElement.style.setProperty('--topH',h+'px'); // (in demo mode the demo card owns the page's layout variables)
  if(docked()){if(own){app.style.setProperty('--sheet-vis','0px');app.style.removeProperty('--toast-at');hud.classList.remove('away');}const left=el.offsetLeft;return {top:h,right:Math.max(0,app.clientWidth-left+8),bottom:0,left:0};} // (its laid-out place: the panel may be sliding in)
  const m=metrics(),vis=visible(state==='full'?'half':state,m);if(own){app.style.setProperty('--sheet-vis',vis+'px');app.style.setProperty('--toast-at',(state==='full'?(($('#sabm')?.offsetHeight||0)+16):vis+16)+'px');hud.classList.toggle('away',state==='full');}return {top:h,right:0,bottom:vis,left:0};
 }
 function set(s,{animate=true}={}){
  document.documentElement.style.setProperty('--topH',head.offsetHeight+'px');state=s;el.dataset.state=s;grab.setAttribute('aria-expanded',String(s!=='peek'));grab.setAttribute('aria-label',s==='peek'?'Show more of the walkthrough':'Show more of the knee');grab.title=s==='peek'?'':'Arrow up / down to resize';
  if(docked()){clearTimeout(settle);el.style.transform='';sb.style.height='';place();return;}
  const m=metrics(),vis=visible(s,m),height=Math.max(60,vis-26)+'px',to=`translateY(${Math.max(0,m.H-vis)}px)`;
  if((!animate||reduced())&&el.style.transform!==to)el.classList.add('drag'); // (a move already under way to the same place carries on)
  if(vis-26>sb.offsetHeight||!animate)sb.style.height=height;
  el.style.transform=to;
  clearTimeout(settle);settle=setTimeout(()=>{if(drag)return;sb.style.height=height;el.classList.remove('drag');},animate&&!reduced()?360:0);
  place();
 }
 // the model's frame follows the sheet — except in demo mode, where the demo card sets it
 function place(){if(demo.on){demoLayout();return;}model?.setInsets(insets(),fitInsets(),anchorInsets());}
 // the knee's size is fitted once to the area left above the peeking sheet (phones) or beside the panel
 function fitInsets(){const i=insets();if(docked())return i;return {...i,bottom:metrics().peek};}
 // …and centred where the half-open sheet leaves it, whatever the sheet's state (the sheet only uncovers or covers the model)
 function anchorInsets(){const i=insets();if(docked())return i;return {...i,bottom:metrics().half};}
 // a tap on the handle: peek ⇄ half; from full it drops to half
 const toggled=()=>state==='peek'?'half':state==='half'?'peek':'half';
 function forPreview(){if(!docked()&&state==='full')set('half');}
 // dragging: the handle and the sticky step header (not its buttons)
 function down(e){if(docked()||e.button>0||drag)return;if(e.currentTarget!==grab&&e.target.closest('button,a,input,select,label,summary'))return;
  clearTimeout(settle);drag={id:e.pointerId,node:e.currentTarget,y0:e.clientY,t0:performance.now(),base:new DOMMatrixReadOnly(getComputedStyle(el).transform).m42,m:metrics(),moved:false};
  try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}el.classList.add('drag');sb.style.height=Math.max(60,drag.m.H-26)+'px';}
 function move(e){if(!drag||e.pointerId!==drag.id)return;const dy=e.clientY-drag.y0;if(Math.abs(dy)>5)drag.moved=true;if(!drag.moved)return;el.style.transform=`translateY(${Math.min(drag.m.H-drag.m.peek,Math.max(0,drag.base+dy))}px)`;}
 function up(e){if(!drag||e.pointerId!==drag.id)return;const d=drag;drag=null;el.classList.remove('drag');const dy=e.clientY-d.y0,dt=performance.now()-d.t0,y=Math.min(d.m.H-d.m.peek,Math.max(0,d.base+dy));
  if(!d.moved){if(d.node===grab){auto=null;set(toggled());}else set(state==='peek'?'half':state);return;}
  auto=null;
  const v=dy/Math.max(1,dt),halfY=d.m.H-d.m.half;let s;
  if(v>.45)s=y>halfY-8?'peek':'half';else if(v<-.45)s=y<halfY+8?'full':'half';else s=[['full',0],['half',halfY],['peek',d.m.H-d.m.peek]].reduce((a,b)=>Math.abs(b[1]-y)<Math.abs(a[1]-y)?b:a)[0];
  set(s);}
 for(const node of [grab,top]){node.addEventListener('pointerdown',down);node.addEventListener('pointermove',move);node.addEventListener('pointerup',up);node.addEventListener('pointercancel',up);}
 grab.addEventListener('keydown',e=>{if(e.key==='ArrowUp'){e.preventDefault();set(state==='peek'?'half':'full');}if(e.key==='ArrowDown'){e.preventDefault();set(state==='full'?'half':'peek');}});
 grab.addEventListener('click',e=>{if(e.detail===0){auto=null;set(toggled());}}); // keyboard Enter/Space: same as a tap
 // typing: open the sheet fully while a number field has the keyboard, then put it back
 function reveal(node){const r=node.getBoundingClientRect(),b=sb.getBoundingClientRect(),stick=top.offsetHeight,limit=Math.min(b.bottom,window.visualViewport?.height||innerHeight)-16;if(r.top<b.top+stick+8||r.bottom>limit)sb.scrollTop+=r.top-(b.top+stick+16);}
 document.addEventListener('focusin',e=>{if(docked()||!e.target.matches?.(KEYED))return;if(state!=='full'){auto=auto||state;set('full');}setTimeout(()=>reveal(e.target),reduced()?0:380);});
 document.addEventListener('focusout',()=>{if(!auto)return;setTimeout(()=>{if(document.activeElement?.matches?.(KEYED)||!auto)return;const back=auto;auto=null;if(state==='full')set(back);},150);});
 const sync=()=>{if(drag)return;if(demo.on){demoLayout();return;}set(state,{animate:false});}; // (demo mode: the hidden sheet keeps its size and scroll)
 if(window.ResizeObserver){const ro=new ResizeObserver(sync);ro.observe(app);ro.observe(head);ro.observe(top);}else addEventListener('resize',sync);
 set('half',{animate:false});
 return {set,forPreview,insets,fitInsets,anchorInsets,state:()=>state};
})();
// ---- demo mode (6.7): pick an ACL construct and watch it built on the knee, step by step, each step's line popping up as it
// plays. The walkthrough's own step animations play one after another (demo.mjs paces them); Back, Pause and Next steer it.
// The case being edited is never touched: the demo puts its own cases on the model and, on the way out, gives back the case,
// the sheet (and where it was scrolled), the camera and the knee's scale exactly as they were.
const DEMO_SIDE='(min-width:860px) and (min-height:541px), (orientation:landscape) and (max-height:540px)'; // the sheet's docked layouts
const reducedMotion=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
const numbers=text=>esc(text).replace(/\d+(?:\.\d+)?(?: × \d+(?:\.\d+)?)? mm/g,m=>`<b>${m}</b>`);
let demoLines=null;
const allDemoLines=()=>demoLines??=DEMOS.flatMap(p=>{const base=buildDemoCase(p);return stepsForCase(base).map((s,i)=>demoCaption(s.id,demoCaseAt(base,i)));});
function rise(el){el.classList.remove('rise');void el.offsetWidth;el.classList.add('rise');}
// a card that has just appeared ignores taps for a moment, so a double tap (or one tap too many on Next) never lands on it
function shown(el){rise(el);demo.guard=performance.now()+450;}
// the line keeps one height (the tallest of any demo at this width), so the demo card — and the knee above it — never moves.
// Measured on a hidden copy, so a screen reader hears nothing while it happens.
function demoMeasure(){
 const cap=$('#demo-cap'),width=cap.clientWidth;if(!width||width===demo.measured)return;
 const probe=cap.cloneNode(true);probe.removeAttribute('id');probe.removeAttribute('aria-live');probe.setAttribute('aria-hidden','true');probe.classList.remove('pop');
 for(const n of probe.querySelectorAll('[id]'))n.removeAttribute('id');
 Object.assign(probe.style,{position:'absolute',visibility:'hidden',left:'0',top:'0',width:width+'px',minHeight:'0'});
 const title=probe.querySelector('h2'),text=probe.querySelector('.demo-text');cap.parentNode.append(probe);let max=0;
 for(const line of allDemoLines()){title.textContent=line.title;text.innerHTML=numbers(line.text);max=Math.max(max,probe.offsetHeight);}
 probe.remove();cap.style.minHeight=max+'px';demo.measured=width;
}
// the knee's frame: under the header and above the demo card (beside it where the sheet docks), fitted afresh
function demoLayout(){
 if(!demo.on)return;const app=$('#app'),h=$('#top').offsetHeight;demoMeasure();
 document.documentElement.style.setProperty('--topH',h+'px');
 const a=app.getBoundingClientRect(),r=$('#demo-player').getBoundingClientRect(),side=matchMedia(DEMO_SIDE).matches;
 const frame=side?{top:h,right:Math.max(0,Math.round(a.right-r.left+8)),bottom:0,left:0}:{top:h,right:0,bottom:Math.max(0,Math.round(a.bottom-r.top+8)),left:0};
 app.style.setProperty('--sheet-vis',(side?0:frame.bottom)+'px');app.style.setProperty('--toast-at',(side?16:frame.bottom+6)+'px');$('#hud').classList.remove('away');
 model?.setInsets(frame,frame,frame,{refit:true});
}
// a demo case on the model: X-ray on whatever the lab's chips say (they are hidden here); labels and orientation badges follow
// the demo's own Labels switch, lean (nothing the demo card already says) and spaced out
const demoLabelOptions=()=>({labels:demo.labels,orientation:demo.labels,lean:true,spacious:true});
function demoModel(d,side='femur'){
 if(!model)return;
 try{const st=materializeCase(d),ev=evaluate(st);model.update(ev.state,ev,{...settings,...demoLabelOptions(),opacity:XRAY_OPACITY,measurementGuide:null,activeSide:side,workflow:workflowForCase(d)});model.setView('anterior');}
 catch(error){modelFailure(error);}
}
function demoLabelsSwitch(){$('#demo-labels').setAttribute('aria-pressed',String(demo.labels));}
function toggleDemoLabels(){
 demo.labels=!demo.labels;demoLabelsSwitch();try{localStorage.setItem('acl_demo_labels',demo.labels?'1':'0');}catch{}
 if(demo.on)model?.setOptions(demoLabelOptions()); // (labels only: a playing step carries on)
}
const demoIO={
 get count(){return demo.steps.length;},
 show(i){
  const step=demo.steps[i],d=demoCaseAt(demo.base,i),line=demoCaption(step.id,d),last=i===demo.steps.length-1;demo.caption=line;
  $('#demo-count').textContent=`Step ${i+1} of ${demo.steps.length}`;$('#demo-step').textContent=line.title;$('#demo-text').innerHTML=numbers(line.text);
  const cap=$('#demo-cap');cap.classList.remove('pop');void cap.offsetWidth;cap.classList.add('pop');
  const next=$('#demo-next');next.textContent=last?'Finish ›':'Next ›';next.setAttribute('aria-label',last?'Finish the demo':'Next step');
  demoModel(d,step.side||'femur');
  return stepTiming(step.id,d,line,{reduced:reducedMotion()});
 },
 animate(ms){try{model?.animateStep({duration:ms/demo.speed});}catch(error){console.error('Demo step animation failed',error);}},
 pause(){model?.pauseAnimation();},
 resume(){model?.resumeAnimation();},
 cancel(){model?.cancelAnimation(false);},
 render(s){
  demo.segs.forEach((seg,k)=>{const p=s.done||k<s.index?1:k===s.index?s.fraction:0;if(demo.shown[k]!==p){demo.shown[k]=p;seg.style.transform=`scaleX(${p})`;}});
  const play=$('#demo-play'),paused=!s.playing;
  if(play.classList.contains('paused')!==paused){play.classList.toggle('paused',paused);$('#demo-play-label').textContent=paused?'Play':'Pause';play.setAttribute('aria-label',paused?'Play the demo':'Pause the demo');}
 },
 finish(){
  demo.phase='end';$('#demo').dataset.phase='end';$('#demo-end-title').textContent=demo.preset.title;
  $('#demo-facts').innerHTML=demoSummary(demo.base).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  shown($('#demo-end'));$('#demo-end-title').focus({preventScroll:true});
 }
};
// the clock runs only while a demo plays (nothing ticks while it is paused, choosing or finished)
function demoLoop(t){
 if(!demo.on||!demo.player?.status().playing){demo.raf=0;demo.last=0;return;}
 demo.raf=requestAnimationFrame(demoLoop);const dt=demo.last?t-demo.last:16;demo.last=t;demo.player.tick(dt*demo.speed);
}
function demoRun(){if(demo.on&&!demo.raf&&demo.player?.status().playing){demo.last=0;demo.raf=requestAnimationFrame(demoLoop);}}
function demoAct(fn){if(!demo.player||performance.now()<demo.guard)return;fn(demo.player);demoRun();}
function showPicker(){
 demo.player=null;model?.cancelAnimation(false);demo.phase='choose';demo.preset=null;demo.caption=null;
 $('#demo').dataset.phase='choose';$('#demo-title').textContent='Choose a construct';
 const list=$('#demo-list');if(!list.children.length)list.innerHTML=DEMOS.map(p=>{const len=demoLength(p);return `<button type="button" class="dp-item" data-demo="${esc(p.id)}" aria-label="${esc(p.title+'. '+p.subtitle+'. '+len.label)}"><span class="dp-t"><span class="dp-row"><b>${esc(p.title)}</b><small>${esc(len.minutes)}</small></span><span class="dp-s">${esc(p.subtitle)}</span></span><span class="dp-go" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3.5v17l14-8.5z" fill="currentColor"/></svg></span></button>`;}).join('');
 list.scrollTop=0;$('#demo-pick').scrollTop=0;
 if(model){demoModel(createCase());model?.resetZoom();}
 shown($('#demo-pick'));list.querySelector('button')?.focus({preventScroll:true});
}
function openDemo(){
 if(modelBroken){toast('The demo needs the 3D knee, which could not start here.');return;}
 if(!demo.on){
  stopPreview();renderNavigation();clearMeasurementGuide();cancelAnimationFrame(modelFrame);
  // what comes back on the way out: the camera (view, orbit, pan, zoom, scale) and where the sheet was scrolled
  demo.camera=model?.cameraState()||null;demo.scroll=$('#sb').scrollTop;demo.from=document.activeElement;demo.measured=0;
  demo.on=true;document.documentElement.classList.add('demo-on');$('#demo').hidden=false;$('#demo-line').hidden=false;$('#demo-exit').hidden=false;$('#sheet').inert=true;demoLabelsSwitch();
 }
 showPicker();demoLayout();
}
async function startDemo(id){
 const preset=DEMOS.find(p=>p.id===id);if(!preset||!demo.on||performance.now()<demo.guard)return;
 demo.preset=preset;demo.base=buildDemoCase(preset);demo.steps=stepsForCase(demo.base);demo.phase='play';
 $('#demo').dataset.phase='play';$('#demo-title').textContent=preset.title;
 $('#demo-segs').innerHTML=demo.steps.map(()=>'<span><i></i></span>').join('');demo.segs=[...$('#demo-segs').querySelectorAll('i')];demo.shown=[];
 shown($('#demo-player'));$('#demo-play').focus({preventScroll:true});
 if(!model){
  $('#demo-count').textContent='One moment';$('#demo-step').textContent='Preparing the 3D knee…';$('#demo-text').textContent='';
  try{await modelReady;}catch{return;}
  if(!demo.on||demo.preset!==preset||demo.phase!=='play')return;demoLayout();
 }
 demo.player=createDemoPlayer(demoIO);demo.player.start();demoRun();
 demo.guard=performance.now()+450; // (from when step 1 is on screen: putting it on the model takes a moment)
}
function replayDemo(){if(!demo.player||performance.now()<demo.guard)return;demo.phase='play';$('#demo').dataset.phase='play';rise($('#demo-player'));demo.player.start();demoRun();demo.guard=performance.now()+450;$('#demo-play').focus({preventScroll:true});}
function closeDemo(){
 if(!demo.on)return;
 cancelAnimationFrame(demo.raf);demo.raf=0;demo.player=null;demo.on=false;demo.phase=null;demo.preset=null;demo.caption=null;
 const box=$('#demo');box.hidden=true;delete box.dataset.phase;$('#demo-line').hidden=true;$('#demo-exit').hidden=true;$('#sheet').inert=false;
 document.documentElement.classList.remove('demo-on');
 sheet.set(sheet.state()); // the sheet slides back and the page's frame for the knee returns with it
 $('#sb').scrollTop=demo.scroll;
 if(model){
  try{
   model.cancelAnimation(false);cancelAnimationFrame(modelFrame);settings.workflow=viewWorkflow(draft);model.update(state,evaluation,settings);showModelWarnings(model.getSnapshot());
   // the knee at the size it had (refitted only if the screen's width changed meanwhile) and the camera where it was
   const c=demo.camera,sameWidth=c&&Math.abs($('#viewport').clientWidth-c.width)<=1;
   model.setInsets(sheet.insets(),sheet.fitInsets(),sheet.anchorInsets(),sameWidth?{scale:c.scale}:{refit:true});
   if(c)model.restoreCamera(c);else setView(view);
  }catch(error){modelFailure(error);}
 }
 demo.camera=null;
 const back=demo.from&&document.contains(demo.from)&&demo.from!==document.body&&demo.from.getClientRects().length?demo.from:$('#title');demo.from=null;
 try{back.focus({preventScroll:true});}catch{}
}
$('#demo-labels').addEventListener('click',toggleDemoLabels);
$('#demo-play').addEventListener('click',()=>demoAct(p=>p.toggle()));
$('#demo-next').addEventListener('click',()=>demoAct(p=>p.next()));
$('#demo-back').addEventListener('click',()=>demoAct(p=>p.back()));
$('#demo-list').addEventListener('click',e=>{const b=e.target.closest('[data-demo]');if(b)startDemo(b.dataset.demo);});
$('#demo-replay').addEventListener('click',replayDemo);
$('#demo-another').addEventListener('click',()=>{if(performance.now()>=demo.guard)showPicker();});
$('#demo-done').addEventListener('click',()=>{if(performance.now()>=demo.guard)closeDemo();});
for(const id of ['demo-exit','demo-pick-close'])$('#'+id).addEventListener('click',closeDemo);
document.addEventListener('lab:demo',openDemo);
document.addEventListener('lab:case',()=>{if(demo.on)closeDemo();});
// keys: Space plays or pauses, ← → step, L labels, Esc leaves (the menu and the help card take Esc first)
document.addEventListener('keydown',e=>{
 if(!demo.on||e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||!$('#sitemenu').hidden||!$('#help').hidden)return;
 if(e.key==='Escape'){e.preventDefault();closeDemo();return;}
 if(demo.phase!=='play'||!demo.player||e.target.closest?.('input,select,textarea'))return;
 if(e.key==='ArrowRight'){e.preventDefault();demo.player.next();demoRun();}
 else if(e.key==='ArrowLeft'){e.preventDefault();demo.player.back();demoRun();}
 else if(e.key===' '&&!e.target.closest?.('button,a,summary')){e.preventDefault();demo.player.toggle();demoRun();}
 else if(e.key==='l'||e.key==='L'){e.preventDefault();toggleDemoLabels();}
});
// a demo left in the background waits for its viewer
document.addEventListener('visibilitychange',()=>{if(document.hidden&&demo.player?.status().playing)demo.player.pause();});
function modelFailure(error){console.error('Case preview unavailable',error);try{model?.dispose();}catch{}model=null;modelBroken=true;rejectModel(error);$('#model-loading').hidden=true;$('#model-error').hidden=false;$('#model-error').textContent='The 3D preview could not start. The case fields still work. Reload to try the model again.';if(demo.on){closeDemo();toast('The 3D knee stopped, so the demo closed. Your case is unchanged.');}}
refresh(true,false);
Object.defineProperty(window,'aclSandbox',{value:Object.freeze({getState:()=>structuredClone(draft),getEvaluation:()=>structuredClone(evaluation),getModel:()=>model?.getSnapshot(),getSteps:()=>structuredClone(steps),getSheet:()=>({state:sheet.state(),insets:demo.on?null:sheet.insets()}),setDemoSpeed:n=>{demo.speed=Math.min(8,Math.max(.25,Number(n)||1));},getDemo:()=>({on:demo.on,speed:demo.speed,labels:demo.labels,phase:demo.phase,preset:demo.preset?.id||null,steps:demo.steps.map(s=>s.id),caption:demo.caption?{...demo.caption}:null,...(demo.player?.status()||{})})}),writable:false});
try{const {createModel}=await import('./model.js');model=await createModel($('#viewport'),$('#labels'),{insets:sheet.fitInsets()});model.setInsets(sheet.insets(),null,sheet.anchorInsets());settings.workflow=viewWorkflow(draft);model.update(state,evaluation,settings);setView('anterior');$('#model-loading').hidden=true;resolveModel(model);if(demo.on){demoLayout();if(demo.phase!=='play'){demoModel(createCase());model.resetZoom();}}}catch(error){modelFailure(error);}
