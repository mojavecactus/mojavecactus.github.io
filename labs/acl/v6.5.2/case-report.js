import {PDFDocument,StandardFonts,rgb} from '../lib/pdf-lib.js';
import {GRAFTS,FIXATIONS,TECHNIQUES,evaluate,tibialTrim,plannedFemoralInsertion,plannedTibialInsertion} from './engine.js';
import {sanitizeCase,materializeCase,stepsForCase,missingForStep} from './workflow.js';

const n=value=>typeof value==='number'&&Number.isFinite(value)?Number(value.toFixed(2)).toString():'Not entered';
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const sideName=side=>side==='femur'?'Femur':side==='tibia'?'Tibia':'Graft';
const ascii=value=>String(value??'').replace(/[\u2010-\u2015]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/×/g,'x').replace(/≥/g,'>=').replace(/≤/g,'<=').replace(/−/g,'-').replace(/↗|→/g,'').replace(/°/g,' deg').replace(/…/g,'...').replace(/[^\x20-\x7e\n]/g,' ');
function knownInsertion(draft,side){return side==='tibia'?finite(plannedTibialInsertion(draft))&&finite(draft.values.tibia.ttl):finite(plannedFemoralInsertion(draft));}
const linkedCase=draft=>['femur','tibia'].every(side=>draft.values[side].technique==='transtibial');
function reamedDiameter(draft,side){return linkedCase(draft)?draft.values.tibia.diameter:draft.values[side].diameter;}
export function reportProducts(draft,evaluation){
 const completed=new Set(draft.completed),groups=new Map();
 for(const product of evaluation.products){
  const side=product.side,data=draft.values[side],fix=FIXATIONS.find(x=>x.id===data?.fixation);let status='Planned';
  if(side==='graft'){if(!draft.values.graft)continue;status=completed.has('prep')?'Used':'Planned';}
  else if(/VersiTomic RR/.test(product.label)){if(data?.technique!=='retrograde'||!finite(data?.diameter))continue;status=completed.has(side+'_ream')?'Used':'Planned';}
  else if(/G-Lok XL/.test(product.label)){if(!data?.xl)continue;status=completed.has('xl_femur')?'Used':'Planned';}
  else {if(!data?.fixation)continue;if(fix?.kind==='screw'&&(!finite(data.screwDiameter)||!finite(data.screwLength)))continue;if(fix?.kind==='abs'&&product.sku!==fix.sku&&!data.button)continue;if(data.fixation==='glok'&&!finite(data.loop))continue;status=completed.has('fix_'+side)||(side==='femur'&&fix?.kind==='integrated'&&completed.has('pass_femur'))?'Used':completed.has('prep')&&side==='femur'&&fix?.kind==='integrated'?'Prepared':'Planned';}
  const key=[product.sku||product.label,status].join('|');if(groups.has(key)){const row=groups.get(key);if(!row.sides.includes(sideName(side)))row.sides.push(sideName(side));continue;}
  groups.set(key,{label:product.label,sku:product.sku||'No matching part number',detail:product.detail||'',sides:[sideName(side)],status});
 }
 return [...groups.values()];
}
export function fitImageRect(imageWidth,imageHeight,box){
 if(![imageWidth,imageHeight,box?.width,box?.height].every(x=>Number.isFinite(x)&&x>0))throw new Error('Invalid report image dimensions.');
 const scale=Math.min(box.width/imageWidth,box.height/imageHeight),width=imageWidth*scale,height=imageHeight*scale;
 return {x:box.x+(box.width-width)/2,y:box.y+(box.height-height)/2,width,height};
}
export async function buildCaseReport(input,{date=new Date(),viewerImage,viewerNotes=[]}={}){
 const draft=sanitizeCase(input),state=materializeCase(draft),evaluation=evaluate(state),steps=stepsForCase(draft),graft=GRAFTS.find(x=>x.id===draft.values.graft),completed=new Set(draft.completed);
 const pdf=await PDFDocument.create(),regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 pdf.setTitle('ACL Case Report');pdf.setAuthor('SportsMed Toolbox');pdf.setSubject('Case construct view, products, measurements and completed steps');pdf.setCreationDate(date);pdf.setModificationDate(date);
 const C={ink:rgb(.14,.15,.16),muted:rgb(.39,.40,.41),amber:rgb(.99,.71,.08),warn:rgb(.55,.35,.02),line:rgb(.86,.86,.84),pale:rgb(.96,.96,.94),red:rgb(.62,.22,.16),green:rgb(.18,.39,.27)};
 const W=612,H=792,M=42,CW=W-2*M;let page,y,pages=[];
 function text(value,x,top,{size=10,font=regular,color=C.ink}={}){page.drawText(ascii(value),{x,y:top-size,size,font,color});}
 function wrap(value,width,size=9,font=regular){const lines=[];for(const paragraph of ascii(value).split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(!word)continue;if(font.widthOfTextAtSize((line?line+' ':'')+word,size)<=width){line+=(line?' ':'')+word;continue;}if(line){lines.push(line);line='';}if(font.widthOfTextAtSize(word,size)<=width){line=word;continue;}let piece='';for(const char of word){if(font.widthOfTextAtSize(piece+char,size)>width){lines.push(piece);piece='';}piece+=char;}line=piece;}lines.push(line);}return lines;}
 function newPage(){page=pdf.addPage([W,H]);pages.push(page);page.drawRectangle({x:0,y:H-13,width:W,height:13,color:C.amber});text('SportsMed Toolbox',M,H-35,{size:12,font:bold});text('ACL CASE REPORT',W-160,H-38,{size:10,font:bold,color:C.muted});page.drawLine({start:{x:M,y:H-65},end:{x:W-M,y:H-65},thickness:.7,color:C.line});y=H-85;}
 function ensure(height){if(y-height<55)newPage();}
 function para(value,{size=10,color=C.muted,bottom=10}={}){const lines=wrap(value,CW,size);ensure(lines.length*(size+4)+bottom);for(const line of lines){text(line,M,y,{size,color});y-=size+4;}y-=bottom;}
 function section(label){ensure(104);y-=10;text(label.toUpperCase(),M,y,{size:10,font:bold});y-=22;}
 function table(headers,rows,widths){const drawHeader=()=>{page.drawRectangle({x:M,y:y-24,width:CW,height:24,color:C.ink});let x=M;headers.forEach((h,i)=>{text(h,x+8,y-6,{size:8,font:bold,color:rgb(1,1,1)});x+=widths[i];});y-=24;};ensure(60);drawHeader();for(let r=0;r<rows.length;r++){const cells=rows[r].map((value,i)=>wrap(value,widths[i]-16,9)),height=Math.max(30,Math.max(...cells.map(c=>c.length))*12+14);if(y-height<55){newPage();drawHeader();}if(r%2===0)page.drawRectangle({x:M,y:y-height,width:CW,height,color:C.pale});let x=M;cells.forEach((lines,i)=>{lines.forEach((line,j)=>text(line,x+8,y-7-j*12,{size:9}));x+=widths[i];});page.drawLine({start:{x:M,y:y-height},end:{x:W-M,y:y-height},thickness:.45,color:C.line});y-=height;}y-=7;}
 newPage();text(graft?.label||'Unplanned ACL case',M,y,{size:23,font:bold});y-=35;para(`${date.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}  |  ${draft.completed.length} of ${steps.length} steps completed`,{size:10,bottom:4});
 if(viewerImage){
  const data=viewerImage.dataUrl;
  if(typeof data!=='string'||!/^data:image\/(png|jpeg);base64,/.test(data))throw new Error('The viewer capture must be a PNG or JPEG image.');
  const image=data.startsWith('data:image/png;')?await pdf.embedPng(data):await pdf.embedJpg(data);
  const ready=viewerImage.final===true&&steps.every(step=>missingForStep(draft,step.id).length===0),final=ready&&steps.filter(step=>step.id!=='review').every(step=>completed.has(step.id));
  section(final?'Final graft construct':ready?'Planned graft construct':'Current case view');
  const boxHeight=Math.min(470,CW*image.height/image.width),box={x:M,y:y-boxHeight,width:CW,height:boxHeight},rect=fitImageRect(image.width,image.height,box);
  page.drawRectangle({...box,color:rgb(.125,.133,.125)});page.drawImage(image,rect);y=box.y-12;
  para(ready?(final?'Completed construct with viewer measurements, straight-on view.':'Planned completed construct from the entered case measurements. Some steps have not been marked complete. Straight-on view.'):'Current completed case state with viewer measurements, straight-on view. Unentered measurements and unfinished steps are not added to this image.',{size:9,bottom:4});
  for(const note of (Array.isArray(viewerNotes)?viewerNotes:[]).filter(x=>typeof x==='string'&&x.trim()))para(note,{size:9,color:/titanium screw(: .* against soft tissue| contacts)/.test(note)?C.warn:C.muted,bottom:4});
  newPage();
 }
 section('Graft and measurements');table(['MEASUREMENT','GRAFT / FEMUR','TIBIA'],[
 ['Prepared graft',`${n(draft.values.graftDiameter)} mm diameter`,`${n(draft.values.graftLength)} mm end-to-end`],
 ['Joint span',`${n(state.jointSpan)} mm fixed average at 90 degrees`,''],
 ['Reaming approach',TECHNIQUES.femur.find(x=>x.id===draft.values.femur.technique)?.label||'Not selected',TECHNIQUES.tibia.find(x=>x.id===draft.values.tibia.technique)?.label||'Not selected'],
 ['Total tunnel length',finite(draft.values.femur.ttl)?n(draft.values.femur.ttl)+' mm':'Not entered',finite(draft.values.tibia.ttl)?n(draft.values.tibia.ttl)+' mm':'Not entered'],
 ['Reamed depth / diameter',...['femur','tibia'].map(side=>{const d=draft.values[side],derived=d.technique==='transtibial'||(side==='tibia'&&d.technique==='straight')||(side==='femur'&&d.technique==='outside_in')||(d.technique==='retrograde'&&d.blownCortex),depth=derived?d.ttl:d.socket;return `${n(depth)} / ${n(reamedDiameter(draft,side))} mm`;})],
 ['Graft within bone',...['femur','tibia'].map(side=>knownInsertion(draft,side)?n(side==='tibia'?evaluation.sides.tibia.inBoneGraftInsertion:plannedFemoralInsertion(draft))+' mm':'Not determined')],
 ['Cortical opening',...['femur','tibia'].map(side=>finite(reamedDiameter(draft,side))?n(state[side].aperture)+' mm'+(draft.values[side].blownCortex?' (blown cortex)':''):'Not determined')],
 ],[160,184,184]);
 if(linkedCase(draft))para('Linked preparation uses one straight guide-pin passage and one continuous reamer pass through both full-length tunnels. '+(finite(draft.values.tibia.diameter)?`Shared reamer diameter: ${n(draft.values.tibia.diameter)} mm.`:'The shared reamer diameter has not been entered.'),{size:9});
 const blocks=['femur','tibia'].filter(side=>evaluation.sides[side].bonePlug&&graft);if(blocks.length)para(blocks.map(side=>{const pre=side==='femur'?'femoral':'tibial';return sideName(side)+' bone block: '+n(draft.values[pre+'PlugLength'])+' x '+n(draft.values[pre+'PlugDiameter'])+' mm'+(draft.values[side].plugDiameterOverride?' (diameter set separately)':'');}).join('  |  '),{size:9});
 const trim=tibialTrim(draft);if(['btb','folded'].includes(graft?.family)&&finite(trim.graftOutsideBone)){
  const bone=graft.family==='btb';
  section(bone?'Tibial bone-block finish':'Tibial graft finish');table(['MEASUREMENT','VALUE'],[
   ['Remaining tibial graft before trim',n(trim.graftInsertion)+' mm'],
   ['Graft retained inside tibia',n(trim.inBoneGraftInsertion)+' mm'],
   ...(bone?[['Bone projecting before trim',n(trim.bonePlugOutside)+' mm'],['Retained tibial bone block',n(trim.retainedBonePlugLength)+' mm']]:[]),
   [bone?'Bone trim':'Soft-tissue trim',n(trim.trimAmount)+' mm'+(trim.trimAmount>0?(completed.has('trim_tibia')?' - completed':' - planned after fixation'):'')],
   ...(trim.softTissueOutside>0?[['Soft tissue beyond cortex before trim',n(trim.softTissueOutside)+' mm']]:[]),
  ],[320,208]);
 }
 const products=reportProducts(draft,evaluation);section('Products used and selected');if(products.length)table(['PRODUCT / SIZE','PART NUMBER','SIDE','STATUS'],products.map(p=>[p.label+(p.detail?'\n'+p.detail:''),p.sku,p.sides.join(', '),p.status]),[256,108,82,82]);else para('No products selected.');
 if(graft?.family==='btb'&&['femur','tibia'].some(side=>draft.values[side].fixation==='biosteon'))para('Biosteon with a BTB graft: the Biosteon sizing guide recommends tapping the tunnel before screw insertion. Tap size is at surgeon discretion; the Biosteon HA/PLLA tap is line-to-line with the screw size. No tap part is listed in this report.',{size:9});
 section('Case steps');table(['STEP','ACTION','STATUS'],steps.map((step,i)=>[String(i+1).padStart(2,'0'),step.label,completed.has(step.id)?'Completed':step.id===draft.currentStep?'Current':'Not completed']),[42,380,106]);
 if(draft.values.femur.xl)para('G-Lok XL timing: '+(draft.values.femur.xlTiming==='after'?'added laterally after femoral button passage.':'attached before femoral button passage.'),{size:9});
 const valuesKnown=graft&&finite(draft.values.graftLength)&&knownInsertion(draft,'femur')&&['femur','tibia'].every(side=>finite(draft.values[side].ttl)&&finite(reamedDiameter(draft,side)));
 // screw findings wait for the entered screw size (the hidden example size never reaches the report)
 const screwEntered=issue=>!/^(femur|tibia)-screw-/.test(issue.id)||(finite(draft.values[issue.side]?.screwDiameter)&&finite(draft.values[issue.side]?.screwLength));
 const errors=valuesKnown?evaluation.issues.filter(i=>i.level==='error'&&screwEntered(i)):[];
 if(errors.length){section('Measurement flags');for(const issue of errors)para(issue.title+'. '+issue.message,{size:9,color:C.red,bottom:6});}
 const advice=valuesKnown?evaluation.issues.filter(i=>/-screw-tendon$/.test(i.id)&&screwEntered(i)):[];
 if(advice.length){section('Recommendations');for(const issue of advice)para(issue.title+'. '+issue.message,{size:9,color:C.warn,bottom:6});}
 for(let i=0;i<pages.length;i++){page=pages[i];page.drawLine({start:{x:M,y:41},end:{x:W-M,y:41},thickness:.6,color:C.line});text('SportsMed Toolbox  |  ACL Case Lab',M,31,{size:8,color:C.muted});text(`Page ${i+1} of ${pages.length}`,W-M-60,31,{size:8,color:C.muted});}
 return pdf.save();
}
