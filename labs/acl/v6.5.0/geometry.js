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

function solveLinkedRoute(reference,requestedFemur,requestedTibia,jointSpan,tibialTranslation){
 const contexts=tunnelSurfaces.get(reference),f=contexts.femur,t=contexts.tibia,key=String(jointSpan);contexts.linkedCandidates??=new Map();let candidates=contexts.linkedCandidates.get(key);
 if(!candidates){
  candidates=[];const femoralEntry=[...reference.femur.entry],tibialReference=add(reference.tibia.entry,tibialTranslation);
  // One line is constrained by the established femoral footprint and actual
  // cortical surfaces. Changing requested lengths chooses among these lines;
  // neither bone is resized or independently realigned to manufacture a match.
  for(let ix=2;ix<=25;ix++)for(let iy=2;iy<=25;iy++){
   const direction=unit([ix*.05,iy*.05,-1]),fExit=hit(femoralEntry,direction,f.triangles,.15);if(!fExit||fExit.point[0]<12||dot(fExit.normal,direction)<.05)continue;
   const backward=mul(direction,-1),localOrigin=sub(femoralEntry,tibialTranslation),tEntry=hit(localOrigin,backward,t.triangles,.15);if(!tEntry||tEntry.distance<10||tEntry.distance>40)continue;
   const tExit=hit(tEntry.point,backward,t.triangles,.15);if(!tExit||tExit.distance<8||dot(tExit.normal,backward)<.02||tExit.point[1]>-8)continue;
   const tibialEntry=add(tEntry.point,tibialTranslation),tibialCortex=add(tExit.point,tibialTranslation),footprintDeviation=norm(sub(tibialEntry,tibialReference));if(footprintDeviation>13)continue;
   candidates.push({direction,femoralEntry,femoralCortex:fExit.point,femoralNormal:fExit.normal,tibialEntry,tibialCortex,tibialNormal:tExit.normal,femurTTL:fExit.distance,tibiaTTL:tExit.distance,jointSpan:tEntry.distance,footprintDeviation});
  }
  if(!candidates.length)throw Error('No continuous trans-tibial path crosses both fixed reference bones.');contexts.linkedCandidates.set(key,candidates);
 }
 const fRequest=finite(requestedFemur,35),tRequest=finite(requestedTibia,40),score=c=>(c.femurTTL-fRequest)**2+(c.tibiaTTL-tRequest)**2+.12*(c.jointSpan-jointSpan)**2+.08*c.footprintDeviation**2;
 let chosen=candidates[0];for(const candidate of candidates)if(score(candidate)<score(chosen))chosen=candidate;
 const c=chosen,supported=Math.abs(c.femurTTL-fRequest)<.05&&Math.abs(c.tibiaTTL-tRequest)<.05&&Math.abs(c.jointSpan-jointSpan)<.05;
 const transformFor=(side,entry,cortex,direction,normal,ttl,requestedTTL,translation)=>({ttl,representedTTL:ttl,requestedTTL,supported:Math.abs(ttl-requestedTTL)<.05,scale:1,axialScale:1,transverseScale:1,matrix:IDENTITY.map(row=>[...row]),entry:[...entry],cortex:[...cortex],direction:[...direction],normal:[...normal],translation:[...translation]});
 return {femur:transformFor('femur',c.femoralEntry,c.femoralCortex,c.direction,c.femoralNormal,c.femurTTL,fRequest,[0,0,0]),tibia:transformFor('tibia',c.tibialEntry,c.tibialCortex,mul(c.direction,-1),c.tibialNormal,c.tibiaTTL,tRequest,tibialTranslation),linked:{enabled:true,start:[...c.tibialCortex],end:[...c.femoralCortex],direction:[...c.direction],totalLength:c.tibiaTTL+c.jointSpan+c.femurTTL,offsets:{tibialCortex:0,tibialEntry:c.tibiaTTL,femoralEntry:c.tibiaTTL+c.jointSpan,femoralCortex:c.tibiaTTL+c.jointSpan+c.femurTTL},requested:{femurTTL:fRequest,tibiaTTL:tRequest,jointSpan},represented:{femurTTL:c.femurTTL,tibiaTTL:c.tibiaTTL,jointSpan:c.jointSpan},supported,sampledCandidates:candidates.length,footprintDeviation:c.footprintDeviation}};
}

export function constructGeometry(reference,state,evaluation){
 const displaySafeguards=[];
 const record=(field,entered,rendered)=>{if(!Number.isFinite(+entered)||Math.abs(+entered-rendered)>1e-8)displaySafeguards.push({field,entered:Number.isFinite(+entered)?+entered:String(entered),rendered});};
 const fentry=[...reference.femur.entry];
 let jointSpan=Math.min(100,Math.max(1,finite(state.jointSpan,30)));
 record('jointSpan',state.jointSpan,jointSpan);
 record('graftDiameter',state.graftDiameter,renderDiameter(state.graftDiameter));
 const tentry=point(fentry,reference.jointDirection,jointSpan);
 const isLinked=state.femur.technique==='transtibial'||state.tibia.technique==='transtibial',linkedSolution=isLinked?solveLinkedRoute(reference,state.femur.ttl,state.tibia.ttl,jointSpan,sub(tentry,reference.tibia.entry)):null;
 const femur=linkedSolution?.femur||transform(reference,'femur',state.femur.ttl,fentry),tibia=linkedSolution?.tibia||transform(reference,'tibia',state.tibia.ttl,tentry);
 if(linkedSolution){jointSpan=linkedSolution.linked.represented.jointSpan;record('jointSpan',state.jointSpan,jointSpan);}
 record('femur.ttl',state.femur.ttl,femur.ttl);record('tibia.ttl',state.tibia.ttl,tibia.ttl);
 const anatomyWarnings=[];if(linkedSolution&&!linkedSolution.linked.supported)anatomyWarnings.push({side:'linked',message:`One straight line through this fixed atlas represents ${linkedSolution.linked.represented.femurTTL.toFixed(1)} mm femur, ${linkedSolution.linked.represented.tibiaTTL.toFixed(1)} mm tibia and ${jointSpan.toFixed(1)} mm joint span. Requested lengths are retained; the bones are not resized or bent to force a match.`});
 for(const [side,geometry] of Object.entries({femur,tibia})){
  const points=regionPoints.get(reference)?.[side]||[],mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity];
  for(const p of points){const q=transformBonePoint(geometry,p);for(let i=0;i<3;i++){mins[i]=Math.min(mins[i],q[i]);maxs[i]=Math.max(maxs[i],q[i]);}}
  geometry.boneDimensions={ml:maxs[0]-mins[0],ap:side==='femur'?maxs[2]-mins[2]:maxs[1]-mins[1],landmarks:side==='femur'?'Atlas distal region, original y < 50 mm':'Atlas proximal region, original z < 50 mm'};
  if(!linkedSolution&&!geometry.supported)anatomyWarnings.push({side,requestedTTL:geometry.requestedTTL,representedTTL:geometry.ttl,message:`Entered ${geometry.requestedTTL} mm cannot be represented within this atlas's selected cortical region. The nearest sampled surface-bound path is ${geometry.ttl.toFixed(1)} mm; bone size is unchanged.`});
  const values=evaluation?.sides?.[side]||state[side];
  geometry.measuredTTL=finite(state[side].ttl,0);
  geometry.requestedSocketDepth=finite(values.socket,0);
  geometry.socketDepth=linkedSolution?geometry.ttl:displayLength(values.socket);
  geometry.graftInsertion=displayLength(values.graftInsertion);
  geometry.socket=point(geometry.entry,geometry.direction,geometry.socketDepth);
  geometry.graftTip=point(geometry.entry,geometry.direction,geometry.graftInsertion);
  geometry.socketDiameter=renderDiameter(linkedSolution?(evaluation?.sides?.tibia?.diameter??state.tibia.diameter):values.diameter);
  geometry.apertureDiameter=linkedSolution?geometry.socketDiameter:renderDiameter(values.aperture);
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
