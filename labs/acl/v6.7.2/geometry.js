import {createPatientReference,prepareSurface,distalFemurDimensions} from './reference-geometry.js';
import * as THREE from '../lib/three.module.js';

// All coordinates and fixed hardware dimensions use millimeters. Anatomy is an
// fixed anatomical reference, never a patient-specific surgical trajectory.
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a);
const unit=a=>mul(a,1/(norm(a)||1));
const regionPoints=new WeakMap();
const finite=(x,d)=>Number.isFinite(+x)?+x:d;
const fm1=x=>Number(Number(x).toFixed(1)).toString();
export const point=(a,u,t)=>add(a,mul(u,t));
export const displayLength=x=>Math.min(300,Math.max(-100,finite(x,0)));
export const renderTTL=x=>Math.min(160,Math.max(12,finite(x,36)));
export const renderDiameter=x=>Math.min(50,Math.max(.6,finite(x,8)));

export function createButtonPlateGeometry(spec,round=false){
 const width=spec.width||spec.outerDiameter||4,length=spec.length||spec.outerDiameter||13,thickness=spec.thickness||1.5;
 const bevel=Math.min(.12,thickness/4),w=width-2*bevel,l=length-2*bevel,r=w/2,half=(l-w)/2,shape=new THREE.Shape();
 if(round)shape.absarc(0,0,r,0,Math.PI*2,false);
 else {shape.moveTo(-r,-half);shape.lineTo(-r,half);shape.absarc(0,half,r,Math.PI,0,true);shape.lineTo(r,-half);shape.absarc(0,-half,r,0,-Math.PI,true);}
 for(const y of round?[-width*.24,0,width*.24]:[-Math.min(half,2.4),Math.min(half,2.4)]){const hole=new THREE.Path();hole.absarc(0,y,Math.min(.68,r*.20),0,Math.PI*2,false);shape.holes.push(hole);}
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness-2*bevel,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2,steps:1,curveSegments:40});
 // Keep rounded edges inside the selected outer envelope, including minor
 // tessellation overshoot. Both reported and actual vertex dimensions agree.
 geometry.computeBoundingBox();const box=geometry.boundingBox,size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());geometry.translate(-center.x,-center.y,-box.min.z);geometry.scale(width/size.x,length/size.y,thickness/size.z);geometry.computeBoundingBox();
 geometry.userData.nominalDimensions={width,length,thickness};return geometry;
}

export function createScrewGeometries(diameter,length){
 const radius=diameter/2,body=new THREE.CylinderGeometry(radius*.72,radius*.72,length,40);body.rotateX(Math.PI/2);body.translate(0,0,length/2);
 const threadRadius=Math.min(radius*.32,Math.max(.12,diameter*.047)),center=radius-threadRadius,turns=Math.max(3,length/2.2),steps=Math.ceil(turns*24),points=[];
 for(let i=0;i<=steps;i++){const t=i/steps,a=t*turns*Math.PI*2;points.push(new THREE.Vector3(Math.cos(a)*center,Math.sin(a)*center,t*length));}
 const thread=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,false,'centripetal'),steps,threadRadius,10,false),positions=thread.getAttribute('position');
 // Tube sweep caps otherwise project beyond the selected screw length. Clip
 // these vertices to its exact physical envelope rather than reporting an
 // ideal centerline length while displaying a longer implant.
 for(let i=0;i<positions.count;i++){let x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),r=Math.hypot(x,y);if(r>radius){x*=radius/r;y*=radius/r;}positions.setXYZ(i,x,y,Math.max(0,Math.min(length,z)));}
 thread.computeVertexNormals();body.computeBoundingBox();thread.computeBoundingBox();return {body,thread};
}

function hit(origin,direction,triangles,min=.0001){
 let nearest=null;
 for(const tri of triangles){
  const [a,b,c]=tri.pts,e1=sub(b,a),e2=sub(c,a),p=cross(direction,e2),det=dot(e1,p);
  if(Math.abs(det)<1e-10)continue;
  const inv=1/det,t=sub(origin,a),u=dot(t,p)*inv;if(u<-.00001||u>1.00001)continue;
  const q=cross(t,e1),v=dot(direction,q)*inv;if(v<-.00001||u+v>1.00001)continue;
  const distance=dot(e2,q)*inv;
  if(distance>min&&(!nearest||distance<nearest.distance))nearest={distance,point:point(origin,direction,distance),normal:tri.normal};
 }
 return nearest;
}

const tunnelSurfaces=new WeakMap();
const IDENTITY=[[1,0,0],[0,1,0],[0,0,1]];
function inTriangle(p,a,b,c){const v0=sub(b,a),v1=sub(c,a),v2=sub(p,a),d00=dot(v0,v0),d01=dot(v0,v1),d11=dot(v1,v1),d20=dot(v2,v0),d21=dot(v2,v1),den=d00*d11-d01*d01;if(Math.abs(den)<1e-12)return false;const u=(d11*d20-d01*d21)/den,w=(d00*d21-d01*d20)/den;return u>=-1e-7&&w>=-1e-7&&u+w<=1+1e-7;}
function corticalPredicate(side,p,n,entry){return side==='femur'?p[0]>=15&&p[1]>=-8&&p[1]<=90&&p[2]<=24&&n[0]>=.3:p[0]<=6&&p[1]<=-10&&p[2]>=entry[2]+5&&p[2]<=120&&(n[0]+n[1])<-.2;}
function solveSurfacePath(context,requested){
 const {entry,preferred,triangles,side}=context,candidates=[],seen=new Set(),target=Math.max(0,requested);
 function addCandidate(p,triangle,exact){
  if(!corticalPredicate(side,p,triangle.normal,entry))return;
  const delta=sub(p,entry),length=norm(delta);if(length<2)return;const direction=unit(delta);
  if(dot(direction,preferred)<.25||dot(triangle.normal,direction)<=.02)return;
  const key=p.map(v=>v.toFixed(5)).join(',');if(seen.has(key))return;seen.add(key);
  candidates.push({point:p,direction,normal:triangle.normal,length,score:exact?1-dot(direction,preferred):Math.abs(length-target)+.001*(1-dot(direction,preferred))});
 }
 if(target>0)for(const triangle of triangles){
  const {pts,normal:n}=triangle,h=dot(sub(pts[0],entry),n);if(Math.abs(h)>target+1e-8)continue;
  const center=point(entry,n,h),radius=Math.sqrt(Math.max(0,target*target-h*h));let planar=sub(preferred,mul(n,dot(preferred,n)));
  if(norm(planar)<1e-8)planar=sub(pts[0],center);
  if(radius<1e-8){if(inTriangle(center,...pts))addCandidate(center,triangle,true);}
  else if(norm(planar)>1e-8){const p=point(center,unit(planar),radius);if(inTriangle(p,...pts))addCandidate(p,triangle,true);}
  for(let k=0;k<3;k++){const a=pts[k],b=pts[(k+1)%3],v=sub(b,a),rel=sub(a,entry),A=dot(v,v),B=2*dot(rel,v),C=dot(rel,rel)-target*target,disc=B*B-4*A*C;if(disc<0||A<1e-10)continue;for(const sign of [-1,1]){const t=(-B+sign*Math.sqrt(disc))/(2*A);if(t>=0&&t<=1)addCandidate(point(a,v,t),triangle,true);}}
 }
 function firstValid(exact){
  candidates.sort((a,b)=>a.score-b.score);
  for(const candidate of candidates.slice(0,240)){const first=hit(entry,candidate.direction,triangles,.15);if(first&&Math.abs(first.distance-candidate.length)<.002)return {...candidate,supported:exact,requestedTTL:requested};}
  return null;
 }
 const exact=firstValid(true);if(exact)return exact;
 candidates.length=0;seen.clear();
 // For lengths this atlas cannot represent, find the nearest sampled valid
 // cortical path rather than resizing bone or placing a button in empty space.
 for(const triangle of triangles){for(const p of triangle.pts)addCandidate(p,triangle,false);addCandidate(mul(add(add(triangle.pts[0],triangle.pts[1]),triangle.pts[2]),1/3),triangle,false);}
 const fallback=firstValid(false);if(!fallback)throw Error(`No surface-bound ${side} path could be represented.`);return fallback;
}

export function createKneeReference(anatomy){
 const femur=createPatientReference(anatomy,35),fTriangles=prepareSurface(anatomy.femur),tTriangles=prepareSurface(anatomy.tibia);
 const entryHit=hit([0,-9,12],[0,0,1],tTriangles);if(!entryHit)throw Error('The reference tibial aperture was not found.');
 const fContext={side:'femur',entry:[...femur.entry],preferred:[...femur.direction],triangles:fTriangles,cache:new Map()};
 const tContext={side:'tibia',entry:entryHit.point,preferred:unit([-.36,-.45,.82]),triangles:tTriangles,cache:new Map()};
 const tibialPath=solveSurfacePath(tContext,40);if(!tibialPath.supported)throw Error('The 40 mm tibial reference path was not found.');
 const tibia={entry:entryHit.point,cortex:tibialPath.point,normal:tibialPath.normal,direction:tibialPath.direction,ttl:40};tContext.preferred=[...tibia.direction];
 const reference={femur,tibia,jointDirection:unit(sub(tibia.entry,femur.entry)),femurDimensions:distalFemurDimensions(anatomy),flexionDegrees:90};
 tunnelSurfaces.set(reference,{femur:fContext,tibia:tContext});
 const points={};for(const side of ['femur','tibia']){points[side]=[];const p=anatomy[side].positions;for(let i=0;i<p.length;i+=3){if(side==='femur'?p[i+1]>=50:p[i+2]>=50)continue;points[side].push(p.slice(i,i+3));}}
 regionPoints.set(reference,points);return reference;
}

function transform(reference,side,requested,entry){
 const context=tunnelSurfaces.get(reference)?.[side];if(!context)throw Error('Reference surfaces are unavailable.');
 const ttl=finite(requested,reference[side].ttl),key=String(ttl);let result=context.cache.get(key);
 if(!result){result=solveSurfacePath(context,ttl);context.cache.set(key,result);if(context.cache.size>512)context.cache.delete(context.cache.keys().next().value);}
 const translation=sub(entry,reference[side].entry);
 return {ttl:result.length,representedTTL:result.length,requestedTTL:ttl,supported:result.supported,scale:1,axialScale:1,transverseScale:1,matrix:IDENTITY.map(row=>[...row]),entry,cortex:add(result.point,translation),direction:[...result.direction],normal:[...result.normal],translation};
}
export function transformBonePoint(transform,p){return add(transform.matrix.map(row=>dot(row,p)),transform.translation);}

// Trans-tibial route (Sept 25 2026, checked against published technique and Nate's drawing): the tibial guide pin enters the
// anteromedial tibia and runs up to the ACL tibial footprint at a steep angle — about 60–75° to the joint line seen from the
// front, 45–75° from the side — and the femoral pin, drilled later through the reamed tibial tunnel, continues that line into
// the femur and out through the anterolateral cortex. One straight line from the fixed tibial footprint therefore carries both
// tunnels at the 90° reference pose. The line is chosen from the entered tibial length and those typical angles; the femoral
// length it reaches is the atlas's, and a different measured femoral length is disclosed, not forced (the tibial tunnel is
// already reamed when the femur is measured). Neither bone is resized or realigned.
export const TRANSTIBIAL_ANGLES=Object.freeze({coronal:68,sagittal:60,coronalRange:[56,82],sagittalRange:[44,76]});
const DEG=Math.PI/180;
export function transtibialAngles(direction){const u=unit(direction),z=Math.abs(u[2]);return {coronal:Math.atan2(z,Math.abs(u[0]))/DEG,sagittal:Math.atan2(z,Math.abs(u[1]))/DEG};}
// Every trans-tibial ray stays inside a cone around the footprint, so each one only tests the triangles of the region it can reach:
// the tibia below and around the footprint (local coordinates) and the distal femur above it. The bounds are generous boxes.
function transtibialRegions(local,footprint,f,t){
 const inBox=(tri,lo,hi)=>tri.pts.some(p=>p.every((x,i)=>x>=lo[i]&&x<=hi[i]));
 return {tibia:t.triangles.filter(tri=>inBox(tri,[local[0]-45,local[1]-45,local[2]-20],[local[0]+30,local[1]+30,local[2]+110])),
  femur:f.triangles.filter(tri=>inBox(tri,[footprint[0]-30,footprint[1]-30,footprint[2]-110],[footprint[0]+60,footprint[1]+80,footprint[2]+10]))};
}
function transtibialCandidate(context,coronal,sagittal){
 const {local,footprint,tibialTranslation,regions}=context,direction=unit([1/Math.tan(coronal*DEG),1/Math.tan(sagittal*DEG),-1]),down=mul(direction,-1);
 // toward the femur: lateral (+x), posterior on the tibia (+y), proximal on the tibia (-z)
 const tExit=hit(local,down,regions.tibia,.15);if(!tExit||tExit.distance<15||tExit.distance>80||dot(tExit.normal,down)<.02||!corticalPredicate('tibia',tExit.point,tExit.normal,local))return null;
 const fEntry=hit(footprint,direction,regions.femur,.3);if(!fEntry||fEntry.distance<8||fEntry.distance>40||dot(fEntry.normal,direction)>-.02)return null;
 const tAbove=hit(local,direction,regions.tibia,.3);if(tAbove&&tAbove.distance<fEntry.distance)return null;
 const fExit=hit(fEntry.point,direction,regions.femur,.3);if(!fExit||fExit.point[0]<12||dot(fExit.normal,direction)<.05)return null;
 return {direction,coronal,sagittal,tibialEntry:footprint,tibialCortex:add(tExit.point,tibialTranslation),tibialNormal:tExit.normal,tibiaTTL:tExit.distance,femoralEntry:fEntry.point,femoralEntryNormal:fEntry.normal,femoralCortex:fExit.point,femoralNormal:fExit.normal,femurTTL:fExit.distance,jointSpan:fEntry.distance};
}
function solveTranstibialRoute(reference,requestedFemur,requestedTibia,jointSpan,tibialTranslation){
 const contexts=tunnelSurfaces.get(reference),key=String(tibialTranslation.map(x=>x.toFixed(4)));contexts.transtibial??=new Map();let entry=contexts.transtibial.get(key);
 if(!entry){
  const local=[...reference.tibia.entry],footprint=add(local,tibialTranslation),context={local,footprint,tibialTranslation,regions:transtibialRegions(local,footprint,contexts.femur,contexts.tibia)},candidates=[],[c0,c1]=TRANSTIBIAL_ANGLES.coronalRange,[s0,s1]=TRANSTIBIAL_ANGLES.sagittalRange;
  // a 2° grid over the trans-tibial cone; the chosen line is then refined to the entered tibial length
  for(let coronal=c0;coronal<=c1;coronal+=2)for(let sagittal=s0;sagittal<=s1;sagittal+=2){const c=transtibialCandidate(context,coronal,sagittal);if(c)candidates.push(c);}
  if(!candidates.length)throw Error('No trans-tibial path from the tibial footprint crosses both fixed reference bones.');
  // grid neighbours (2° apart in either angle), for bracketing a requested tibial length anywhere in the cone
  const index=new Map(candidates.map(x=>[`${x.coronal}|${x.sagittal}`,x])),edges=[];for(const x of candidates)for(const [dc,ds] of [[2,0],[0,2]]){const y=index.get(`${x.coronal+dc}|${x.sagittal+ds}`);if(y)edges.push([x,y,dc/2,ds/2]);}
  entry={context,candidates,edges,solved:new Map()};contexts.transtibial.set(key,entry);
 }
 const fRequest=finite(requestedFemur,45),tRequest=finite(requestedTibia,40),{coronal:pc,sagittal:ps}=TRANSTIBIAL_ANGLES,[c0,c1]=TRANSTIBIAL_ANGLES.coronalRange,[s0,s1]=TRANSTIBIAL_ANGLES.sagittalRange,solvedKey=`${tRequest}|${jointSpan}`;
 let c=entry.solved.get(solvedKey);
 if(!c){
  const score=x=>4*(x.tibiaTTL-tRequest)**2+.16*((x.coronal-pc)**2+(x.sagittal-ps)**2)+.05*(x.jointSpan-jointSpan)**2;
  c=entry.candidates[0];for(const candidate of entry.candidates)if(score(candidate)<score(c))c=candidate;
  // Refine to the entered tibial length: along a few angle paths through the chosen line (both angles, coronal only, sagittal
  // only), find neighbouring valid lines that bracket the length and bisect between them; keep the closest, nearest the typical angles.
  if(Math.abs(c.tibiaTTL-tRequest)>=.05){
   const base=c,found=[];
   // cheapest first: stop at the first path that brackets the length exactly
   for(const [dc,ds] of [[1,1],[1,0],[0,1]]){
    if(found.some(x=>Math.abs(x.tibiaTTL-tRequest)<.05))break;
    const at=t=>{const coronal=base.coronal+dc*t,sagittal=base.sagittal+ds*t;return coronal<c0||coronal>c1||sagittal<s0||sagittal>s1?null:(t===0?base:transtibialCandidate(entry.context,coronal,sagittal));};
    const samples=[];for(const t of [-4,-2,0,2,4])samples.push([t,at(t)]);
    for(let k=0;k+1<samples.length;k++){let [ta,a]=samples[k],[tb,b]=samples[k+1];if(!a||!b||(a.tibiaTTL-tRequest)*(b.tibiaTTL-tRequest)>0)continue;
     for(let n=0;n<24&&Math.abs(a.tibiaTTL-tRequest)>=.01&&Math.abs(b.tibiaTTL-tRequest)>=.01;n++){const tm=(ta+tb)/2,m=at(tm);if(!m)break;if((a.tibiaTTL-tRequest)*(m.tibiaTTL-tRequest)<=0){b=m;tb=tm;}else{a=m;ta=tm;}}
     found.push(Math.abs(a.tibiaTTL-tRequest)<Math.abs(b.tibiaTTL-tRequest)?a:b);}
   }
   if(!found.some(x=>Math.abs(x.tibiaTTL-tRequest)<.05))for(const [a0,b0,dc,ds] of entry.edges){if((a0.tibiaTTL-tRequest)*(b0.tibiaTTL-tRequest)>0)continue;
    let a=a0,b=b0,ta=0,tb=2;const at=t=>transtibialCandidate(entry.context,a0.coronal+dc*t,a0.sagittal+ds*t);
    for(let n=0;n<24&&Math.abs(a.tibiaTTL-tRequest)>=.01&&Math.abs(b.tibiaTTL-tRequest)>=.01;n++){const tm=(ta+tb)/2,m=at(tm);if(!m)break;if((a.tibiaTTL-tRequest)*(m.tibiaTTL-tRequest)<=0){b=m;tb=tm;}else{a=m;ta=tm;}}
    found.push(Math.abs(a.tibiaTTL-tRequest)<Math.abs(b.tibiaTTL-tRequest)?a:b);}
   const exact=found.filter(x=>Math.abs(x.tibiaTTL-tRequest)<.05),pool=exact.length?exact:found;
   if(pool.length){const best=pool.reduce((x,y)=>score(y)<score(x)?y:x);if(Math.abs(best.tibiaTTL-tRequest)<Math.abs(c.tibiaTTL-tRequest))c=best;}
  }
  entry.solved.set(solvedKey,c);if(entry.solved.size>256)entry.solved.delete(entry.solved.keys().next().value);
 }
 const tibiaSupported=Math.abs(c.tibiaTTL-tRequest)<.05,femurSupported=Math.abs(c.femurTTL-fRequest)<.05;
 const transformFor=(entryPoint,cortex,direction,normal,ttl,requestedTTL,translation)=>({ttl,representedTTL:ttl,requestedTTL,supported:Math.abs(ttl-requestedTTL)<.05,scale:1,axialScale:1,transverseScale:1,matrix:IDENTITY.map(row=>[...row]),entry:[...entryPoint],cortex:[...cortex],direction:[...direction],normal:[...normal],translation:[...translation]});
 return {femur:{...transformFor(c.femoralEntry,c.femoralCortex,c.direction,c.femoralNormal,c.femurTTL,fRequest,[0,0,0]),entryNormal:[...c.femoralEntryNormal]},tibia:transformFor(c.tibialEntry,c.tibialCortex,mul(c.direction,-1),c.tibialNormal,c.tibiaTTL,tRequest,tibialTranslation),
  linked:{enabled:true,technique:'transtibial',start:[...c.tibialCortex],end:[...c.femoralCortex],direction:[...c.direction],coronalDegrees:c.coronal,sagittalDegrees:c.sagittal,totalLength:c.tibiaTTL+c.jointSpan+c.femurTTL,offsets:{tibialCortex:0,tibialEntry:c.tibiaTTL,femoralEntry:c.tibiaTTL+c.jointSpan,femoralCortex:c.tibiaTTL+c.jointSpan+c.femurTTL},requested:{femurTTL:fRequest,tibiaTTL:tRequest,jointSpan},represented:{femurTTL:c.femurTTL,tibiaTTL:c.tibiaTTL,jointSpan:c.jointSpan},supported:tibiaSupported&&femurSupported,tibiaSupported,femurSupported}};
}

export function constructGeometry(reference,state,evaluation){
 const displaySafeguards=[];
 const record=(field,entered,rendered)=>{if(!Number.isFinite(+entered)||Math.abs(+entered-rendered)>1e-8)displaySafeguards.push({field,entered:Number.isFinite(+entered)?+entered:String(entered),rendered});};
 const fentry=[...reference.femur.entry];
 let jointSpan=Math.min(100,Math.max(1,finite(state.jointSpan,30)));
 record('jointSpan',state.jointSpan,jointSpan);
 record('graftDiameter',state.graftDiameter,renderDiameter(state.graftDiameter));
 const tentry=point(fentry,reference.jointDirection,jointSpan);
 const isLinked=state.femur.technique==='transtibial'&&state.tibia.technique==='transtibial',linkedSolution=isLinked?solveTranstibialRoute(reference,state.femur.ttl,state.tibia.ttl,jointSpan,sub(tentry,reference.tibia.entry)):null;
 const femur=linkedSolution?.femur||transform(reference,'femur',state.femur.ttl,fentry),tibia=linkedSolution?.tibia||transform(reference,'tibia',state.tibia.ttl,tentry);
 if(linkedSolution){jointSpan=linkedSolution.linked.represented.jointSpan;record('jointSpan',state.jointSpan,jointSpan);}
 record('femur.ttl',state.femur.ttl,femur.ttl);record('tibia.ttl',state.tibia.ttl,tibia.ttl);
 const anatomyWarnings=[];
 if(linkedSolution){const r=linkedSolution.linked;if(!r.tibiaSupported)anatomyWarnings.push({side:'tibia',requestedTTL:r.requested.tibiaTTL,representedTTL:r.represented.tibiaTTL,message:`Entered ${fm1(r.requested.tibiaTTL)} mm cannot be represented by a trans-tibial path from this atlas's tibial footprint. The nearest path at typical trans-tibial angles is ${fm1(r.represented.tibiaTTL)} mm; bone size is unchanged.`});if(!r.femurSupported)anatomyWarnings.push({side:'femur',requestedTTL:r.requested.femurTTL,representedTTL:r.represented.femurTTL,message:`The femoral pin through this tibial tunnel reaches the lateral cortex at ${fm1(r.represented.femurTTL)} mm in this atlas; the measured ${fm1(r.requested.femurTTL)} mm is kept for sizing. The bones are not resized or bent to force a match.`});}
 for(const [side,geometry] of Object.entries({femur,tibia})){
  const points=regionPoints.get(reference)?.[side]||[],mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity];
  for(const p of points){const q=transformBonePoint(geometry,p);for(let i=0;i<3;i++){mins[i]=Math.min(mins[i],q[i]);maxs[i]=Math.max(maxs[i],q[i]);}}
  geometry.boneDimensions={ml:maxs[0]-mins[0],ap:side==='femur'?maxs[2]-mins[2]:maxs[1]-mins[1],landmarks:side==='femur'?'Atlas distal region, original y < 50 mm':'Atlas proximal region, original z < 50 mm'};
  if(!linkedSolution&&!geometry.supported)anatomyWarnings.push({side,requestedTTL:geometry.requestedTTL,representedTTL:geometry.ttl,message:`Entered ${geometry.requestedTTL} mm cannot be represented within this atlas's selected cortical region. The nearest sampled surface-bound path is ${geometry.ttl.toFixed(1)} mm; bone size is unchanged.`});
  const values=evaluation?.sides?.[side]||state[side];
  geometry.measuredTTL=finite(state[side].ttl,0);
  geometry.requestedSocketDepth=finite(values.socket,0);
  // trans-tibial: the tibia is a full tunnel; the femur is a socket reamed through it to the entered depth
  const fullTunnel=!!linkedSolution&&side==='tibia';
  geometry.socketDepth=fullTunnel?geometry.ttl:displayLength(values.socket);
  // trans-tibial femur: the atlas line may be shorter than the measured femur; a socket and graft that fit the measured length are
  // drawn just inside the atlas cortex (recorded as an illustration limit), never as an overrun
  const insideAtlas=len=>linkedSolution&&side==='femur'&&len>geometry.ttl-.5&&len<=geometry.measuredTTL+1e-7?Math.max(0,geometry.ttl-.5):len;
  geometry.socketDepth=insideAtlas(geometry.socketDepth);
  geometry.graftInsertion=insideAtlas(displayLength(values.graftInsertion));
  geometry.socket=point(geometry.entry,geometry.direction,geometry.socketDepth);
  geometry.graftTip=point(geometry.entry,geometry.direction,geometry.graftInsertion);
  geometry.socketDiameter=renderDiameter(linkedSolution?(evaluation?.sides?.tibia?.diameter??state.tibia.diameter):values.diameter);
  geometry.apertureDiameter=renderDiameter(values.aperture);
  geometry.bonePlug=!!values.bonePlug;
  geometry.plugLength=Math.max(.1,displayLength(values.plugLength??20));
  geometry.plugDiameter=renderDiameter(values.plugDiameter??9);
  geometry.plugStart=point(geometry.entry,geometry.direction,geometry.graftInsertion-geometry.plugLength);
  record(`${side}.socket`,values.socket,geometry.socketDepth);record(`${side}.graftInsertion`,values.graftInsertion,geometry.graftInsertion);
  record(`${side}.diameter`,values.diameter,geometry.socketDiameter);record(`${side}.aperture`,values.aperture,geometry.apertureDiameter);
  if(geometry.bonePlug){record(`${side}.plugLength`,values.plugLength,geometry.plugLength);record(`${side}.plugDiameter`,values.plugDiameter,geometry.plugDiameter);}
  if(['biosteon','wedge'].includes(values.fixation)){record(`${side}.screwDiameter`,values.screwDiameter,renderDiameter(values.screwDiameter));record(`${side}.screwLength`,values.screwLength,Math.max(.2,Math.min(100,displayLength(values.screwLength))));}
 }
 const fShaft=unit(femur.matrix.map(row=>row[1])),tShaft=unit(tibia.matrix.map(row=>row[2]));
 return {femur,tibia,linked:linkedSolution?.linked||null,jointSpan,measuredJointSpan:finite(state.jointSpan,0),jointDirection:linkedSolution?mul(linkedSolution.linked.direction,-1):[...reference.jointDirection],flexionDegrees:90,morphedShaftAngle:Math.acos(Math.max(-1,Math.min(1,dot(fShaft,tShaft))))*180/Math.PI,anatomyWarnings,displaySafeguards};
}
