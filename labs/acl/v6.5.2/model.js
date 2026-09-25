import * as THREE from 'three';
import {OrbitControls} from '../lib/OrbitControls.js';
import {createKneeReference,constructGeometry,renderDiameter,displayLength,createButtonPlateGeometry,createScrewGeometries} from './geometry.js';

const v=a=>new THREE.Vector3(...a),Y=new THREE.Vector3(0,1,0),Z=new THREE.Vector3(0,0,1);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const fmt=x=>Number(Number(x).toFixed(1));
const ns='http://www.w3.org/2000/svg';
const PREP_UP=new THREE.Vector3(0,52,-240).normalize(),PREP_HOLE_AXIS=new THREE.Vector3(0,-240,-52).normalize();
// Camera presets (offset from each view's target). Straight on looks up the femur at the notch with anterior at the top;
// Side is the lateral (femoral-button) side.
const VIEW_OFFSETS={anterior:[0,-240,-52],side:[225,24,-26],tibia:[-110,-100,-200],detail:[40,16,-245]};
// Straight on turns like a turntable: free left/right about the screen's vertical, and 10° up or down (20° in all).
const STRAIGHT_TILT=10*Math.PI/180;
import {resolveModelWorkflow,graftAppearance,graftCrossSections,allInsideCenterline,medialPortal,modelCorticalOpening} from './model-workflow.js';
import {recommendedStepDuration as stageDuration,retroReamerPose,antegradeReamerPose,femoralButtonPassPose,adjustableFemoralPassPose,flexibleReamerPose,linkedPinPose,linkedReamerPose} from './model-sequences.js';
import {anteriorApproach,connectedSoftPath} from './model-paths.js';
import {measurementGuideSpec} from './measurement-guide.js';
import {composeViewerImage} from './viewer-export.js';
import {createBonePlugGeometry} from './bone-plug-geometry.js';
import {bonePlugLayout} from './model-btb.js';
import {flushScrewPlacement,nearestSurfaceNormal} from './model-screw.js';

export async function createModel(container,labelLayer,{insets:initialInsets}={}){
 const viewport={width:container.clientWidth||800,height:container.clientHeight||450};let captureViewport=null,insets={top:0,right:0,bottom:0,left:0,...(initialInsets||{})};const viewportSize=()=>{if(captureViewport)return captureViewport;const width=container.clientWidth,height=container.clientHeight;if(width>0&&height>0){viewport.width=width;viewport.height=height;}return viewport;};
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setClearColor(0,0);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
 renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:none;';
 renderer.domElement.setAttribute('role','img');renderer.domElement.setAttribute('aria-label','Interactive anatomical reference knee at 90 degrees flexion. Femoral and tibial tunnels, sockets, graft and selected fixation are shown at measured dimensions. Drag to rotate, scroll to zoom.');
 container.prepend(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-90,90,90,-90,.1,3000);
 const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.dampingFactor=.1;orbit.minZoom=.12;orbit.maxZoom=8;orbit.enablePan=true;
 scene.add(new THREE.HemisphereLight(0xe3f2ff,0x465761,2.15));
 for(const [color,intensity,position] of [[0xffedd3,3.8,[-100,130,-120]],[0x9dcce9,2.8,[100,40,100]],[0xeaf8ff,.9,[150,-80,-100]]]){const light=new THREE.DirectionalLight(color,intensity);light.position.set(...position);scene.add(light);}
 let anatomy;
 try{const response=await fetch(new URL('../anatomy/knee.json',import.meta.url));if(!response.ok)throw Error('Reference anatomy could not be loaded.');anatomy=await response.json();}
 catch(error){orbit.dispose();renderer.dispose();renderer.domElement.remove();throw error;}
 const orientationLandmarks=[['anterior','Anterior',[-2,5,-26],[0,0,-9]],['posterior','Posterior',[0,24,36],[0,0,9]],['medial','Medial',[-44,0,6],[-8,0,0]],['lateral','Lateral',[37,0,6],[8,0,0]]].map(([id,label,target,offset])=>{let point=null,best=Infinity;for(let i=0;i<anatomy.femur.positions.length;i+=3){const p=anatomy.femur.positions.slice(i,i+3);if(p[1]>50)continue;const d=p.reduce((sum,value,j)=>sum+(value-target[j])**2,0);if(d<best){best=d;point=p;}}return {id,label,point,offset};});
 const reference=createKneeReference(anatomy),assembly=new THREE.Group(),previewAssembly=new THREE.Group(),measurementAssembly=new THREE.Group();scene.add(assembly,previewAssembly,measurementAssembly);let renderGroup=assembly;const femoralEntryNormal=nearestSurfaceNormal(anatomy.femur,reference.femur.entry);
 const boneMeshes=[],boreUniforms={};
 let state=null,evaluation=null,geometry=null,options={cutaway:false,opacity:.64,labels:true,orientation:false,activeSide:'femur'},view='anterior',worldUnitsPerPixel=null,disposed=false,frame=0;
 let dirty=true,preview=null,animation=null,workflowView=resolveModelWorkflow(null),graftInfo=null,toolsVisible=[],componentSnapshot={},lastPreviewFrame=0,measurementGuide=null;
 const plugCache=new Map();
 const hardware={},svg=document.createElementNS(ns,'svg');
 svg.classList.add('measurement-overlay');svg.setAttribute('aria-hidden','true');svg.style.cssText='width:100%;height:100%;position:absolute;inset:0;pointer-events:none;overflow:hidden;';labelLayer.replaceChildren(svg);
 const safeguardNotice=document.createElement('div');safeguardNotice.className='acl-display-safeguard';safeguardNotice.hidden=true;safeguardNotice.setAttribute('role','status');safeguardNotice.style.cssText='position:absolute;z-index:4;top:56px;left:10px;max-width:220px;padding:6px 9px;border:1px solid #a88050;border-radius:8px;background:#3d3326ee;color:#f4d2a0;font:11px/1.45 -apple-system,system-ui,sans-serif;pointer-events:none;';container.append(safeguardNotice);

 function loadMesh(data){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));if(data.normals)g.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));g.setIndex(data.indices);if(!data.normals)g.computeVertexNormals();g.computeBoundingBox();return g;}
 function makeBone(data,name,side){
  const material=new THREE.MeshStandardMaterial({color:name==='Fibula'?0xc9c6b7:0xe4dcc8,roughness:.7,metalness:.025,transparent:true,opacity:.64,side:THREE.DoubleSide,depthWrite:false});
  if(side){
   const uniform={entry:{value:v(reference[side].entry)},axis:{value:v(reference[side].direction)},ttl:{value:36},socket:{value:32},radius:{value:4.5},shaftRadius:{value:2.25},cutaway:{value:1},cutFront:{value:new THREE.Vector3(0,0,-1)},cutWidth:{value:13},boreEnabled:{value:0},socketStart:{value:0},shaftStart:{value:0},shaftEnd:{value:36},pilotRadius:{value:0}};boreUniforms[side]=uniform;
   material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniform);shader.vertexShader='varying vec3 aclWorldPoint;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\naclWorldPoint=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader='varying vec3 aclWorldPoint; uniform vec3 entry; uniform vec3 axis; uniform float ttl; uniform float socket; uniform float radius; uniform float shaftRadius; uniform float cutaway; uniform vec3 cutFront; uniform float cutWidth; uniform float boreEnabled; uniform float socketStart; uniform float shaftStart; uniform float shaftEnd; uniform float pilotRadius;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
      vec3 p=aclWorldPoint-entry;float t=dot(p,axis);vec3 r=p-t*axis;
      bool inSocket=t>=socketStart&&t<socket;
      float boreRadius=inSocket?radius:pilotRadius;
      if(t>=shaftStart&&t<=shaftEnd&&!inSocket)boreRadius=max(boreRadius,shaftRadius);
      if(t>ttl-2.0&&shaftEnd>=ttl)boreRadius=max(boreRadius,shaftRadius);
      if(boreEnabled>0.5&&t>-0.5&&t<ttl+0.5&&boreRadius>0.0&&length(r)<boreRadius)discard;
      if(boreEnabled>0.5&&cutaway>0.5&&t>min(socketStart,shaftStart)-1.0&&t<max(socket,shaftEnd)+1.0&&dot(r,cutFront)>0.0&&length(r)<cutWidth)discard;`);
   };
  }
  const mesh=new THREE.Mesh(loadMesh(data),material);mesh.name=name;mesh.userData.side=side||'tibia';scene.add(mesh);boneMeshes.push(mesh);return mesh;
 }
 makeBone(anatomy.femur,'Femur','femur');makeBone(anatomy.tibia,'Tibia','tibia');if(anatomy.fibula)makeBone(anatomy.fibula,'Fibula',null);
 const M={
  measurementFill:new THREE.MeshBasicMaterial({color:0xffcc56,transparent:true,opacity:.13,side:THREE.DoubleSide,depthWrite:false,depthTest:false}),
  measurementLine:new THREE.MeshBasicMaterial({color:0xffcc56,transparent:true,opacity:.98,depthTest:false}),
  guide:new THREE.MeshStandardMaterial({color:0x288d94,roughness:.47}),gauge:new THREE.MeshStandardMaterial({color:0xc73540,roughness:.43}),
  graft:new THREE.MeshStandardMaterial({color:0xecc271,roughness:.67}),fiber:new THREE.MeshStandardMaterial({color:0xffdfa2,roughness:.72}),
  loop:new THREE.MeshStandardMaterial({color:0x5ce0bd,roughness:.52}),quad:new THREE.MeshStandardMaterial({color:0x5cd9db,roughness:.5}),
  socket:new THREE.MeshStandardMaterial({color:0x60dbea,transparent:true,opacity:.15,side:THREE.DoubleSide,depthWrite:false}),
  shaft:new THREE.MeshStandardMaterial({color:0xc4d5dc,transparent:true,opacity:.10,side:THREE.DoubleSide,depthWrite:false}),
  titanium:new THREE.MeshStandardMaterial({color:0xd9e2e4,metalness:.83,roughness:.26}),bio:new THREE.MeshStandardMaterial({color:0xcacabc,roughness:.64}),
  plug:new THREE.MeshStandardMaterial({color:0xe2cfa0,roughness:.84}),dark:new THREE.MeshStandardMaterial({color:0x2e4650,roughness:.6}),
  socketRing:new THREE.MeshBasicMaterial({color:0x67e0ef,transparent:true,opacity:.92,depthTest:false}),
  graftRing:new THREE.MeshBasicMaterial({color:0xf7c970,transparent:true,opacity:.9,depthTest:false}),
  cortexRing:new THREE.MeshBasicMaterial({color:0xe0eaf0,transparent:true,opacity:.92,depthTest:false}),
  invalid:new THREE.MeshBasicMaterial({color:0xff8476,transparent:true,opacity:.22,side:THREE.DoubleSide,depthWrite:false}),
  hardwareError:new THREE.MeshStandardMaterial({color:0xf34343,emissive:0x5c1010,roughness:.40,metalness:.15}),
 };
 const add=(g,material)=>{const mesh=new THREE.Mesh(g,material);renderGroup.add(mesh);return mesh;};
 function cylinder(a,b,r,material,open=false){const length=a.distanceTo(b);if(length<.001)return null;const m=add(new THREE.CylinderGeometry(r,r,length,32,1,open),material);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(Y,b.clone().sub(a).normalize());return m;}
 function tube(points,r,material,segments=32){if(points.length<2||points.every(p=>p.distanceTo(points[0])<.001))return;return clipMesh(add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,false,'centripetal'),segments,r,7,false),material));}
 function tape(points,material){if(points.length<2)return;const shape=new THREE.Shape();shape.moveTo(-.7,-.09);shape.lineTo(.7,-.09);shape.lineTo(.7,.09);shape.lineTo(-.7,.09);shape.closePath();return add(new THREE.ExtrudeGeometry(shape,{steps:48,bevelEnabled:false,extrudePath:new THREE.CatmullRomCurve3(points,false,'centripetal')}),material);}
 function ring(center,axis,r,material){const mesh=add(new THREE.TorusGeometry(Math.max(.04,r),.12,6,48),material);mesh.position.copy(center);mesh.quaternion.setFromUnitVectors(Z,axis);mesh.renderOrder=8;return mesh;}
 function frameFor(side){const g=geometry[side],axis=v(g.direction),normal=v(g.normal);let front=new THREE.Vector3(0,0,-1).addScaledVector(axis,axis.z).normalize();if(front.length()<.1)front.set(0,1,0).addScaledVector(axis,-axis.y).normalize();const across=front.clone().cross(axis).normalize();return {g,axis,normal,front,across,pos:t=>v(g.entry).addScaledVector(axis,t)};}
 function clearGroup(group){for(const child of [...group.children]){child.traverse(obj=>obj.geometry?.dispose());group.remove(child);}group.position.set(0,0,0);group.quaternion.identity();}
 function clearAssembly(){clearGroup(assembly);clearGroup(previewAssembly);for(const key of Object.keys(hardware))delete hardware[key];toolsVisible=[];graftInfo=null;}

 function rebuildMeasurementGuide(){
  clearGroup(measurementAssembly);measurementGuide=measurementGuideSpec(geometry,options.measurementGuide,evaluation?.fieldIssues);if(!measurementGuide)return;
  const previous=renderGroup;renderGroup=measurementAssembly;M.measurementFill.color.set(measurementGuide.color);M.measurementLine.color.set(measurementGuide.color);
  for(const part of measurementGuide.parts){const start=v(part.start),end=v(part.end),axis=v(part.axis),radius=part.diameter/2;
   const ghost=cylinder(start,end,radius,M.measurementFill,true);if(ghost)ghost.renderOrder=20;
   cylinder(start,end,.16,M.measurementLine);ring(start,axis,radius,M.measurementLine);if(start.distanceTo(end)>.01)ring(end,axis,radius,M.measurementLine);
   let radial=axis.clone().cross(Z).normalize();if(radial.length()<.1)radial.set(1,0,0);const across=axis.clone().cross(radial).normalize();
   if(start.distanceTo(end)>.01)for(const direction of [radial,across])for(const sign of [-1,1])cylinder(start.clone().addScaledVector(direction,sign*radius),end.clone().addScaledVector(direction,sign*radius),.08,M.measurementLine);
  }
  measurementAssembly.traverse(obj=>{if(obj.isMesh)obj.renderOrder=20;});renderGroup=previous;
 }
 function setMeasurementGuide(selection){options.measurementGuide=selection;if(geometry){rebuildMeasurementGuide();drawOverlay();}}
 function modelWorkflowInput(){return options.workflow?{...options.workflow,corticalPassageRequired:['flexible','low_profile'].includes(state?.femur.technique)&&!['biosteon','wedge'].includes(state?.femur.fixation)}:null;}
 function hasXL(side,values){return !!values.xl&&(!workflowView.active||side!=='femur'||workflowView.xlAttached);}
 function buttonPlate(side,values,{anchor,normal,long,includeXL=false,accessoryOffset=0,plateLift=includeXL?1:0,context='seated',quaternion=null}){
  const spec=values.buttonSpec||{},abs=values.fixation.endsWith('_abs'),width=spec.width||spec.outerDiameter||(abs?11:4),length=spec.length||spec.outerDiameter||(abs?11:13),thickness=spec.thickness||1.5,status=evaluation?.hardwareStatus?.[side]||{},invalid=!!status.buttonInvalid,material=invalid?M.hardwareError:M.titanium;
  const longitudinal=long.clone().addScaledVector(normal,-long.dot(normal)).normalize(),short=longitudinal.clone().cross(normal).normalize(),rotation=quaternion||new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(short,longitudinal,normal)),n=Z.clone().applyQuaternion(rotation),plateAnchor=anchor.clone().addScaledVector(n,plateLift);
  const plateGeometry=createButtonPlateGeometry({width,length,thickness},abs&&!!spec.outerDiameter),mesh=add(plateGeometry,material);mesh.position.copy(plateAnchor);mesh.quaternion.copy(rotation);
  if(abs&&(spec.projection||0)>0)cylinder(anchor.clone().addScaledVector(n,-1.2),anchor,spec.projection/2,material);
  if(includeXL&&!abs){const xl=add(createButtonPlateGeometry({width:5.2,length:19.8,thickness:1}),material);xl.position.copy(anchor).addScaledVector(n,accessoryOffset);xl.quaternion.copy(rotation);}
  const center=plateAnchor.clone().addScaledVector(n,thickness/2);
  hardware[side]={kind:abs?'abs-button':'integrated-button',context,center:center.toArray(),surfaceAnchor:anchor.toArray(),width,length,thickness,projection:spec.projection||0,xl:includeXL,xlDimensions:includeXL?{width:5.2,length:19.8,thickness:1}:null,sku:spec.sku||values.fixationSku||null,invalid,reasons:status.reasons||[],color:invalid?'red':'titanium',actualPlateEnvelope:plateGeometry.boundingBox.getSize(new THREE.Vector3()).toArray(),quaternion:rotation.toArray()};return {center,long:longitudinal,normal:n,rotation};
 }
 function makeButton(side,values,basis,config={}){
  const {g,normal,across,pos}=basis,includeXL=config.includeXL??hasXL(side,values),anchor=pos(g.ttl),result=buttonPlate(side,values,{anchor,normal,long:across,includeXL,...config}),center=result.center,long=result.long;
  const graftRadius=renderDiameter(state.graftDiameter)/2,tip=geometry[side].bonePlug?g.graftInsertion-g.plugLength*.4:g.graftInsertion,isQuad=values.fixation.includes('quadcinch'),loopMaterial=isQuad?M.quad:M.loop;
  if(isQuad)hardware[side].tape={width:1.4,thickness:.18,thicknessSchematic:true};
  const suture=points=>isQuad?tape(points,loopMaterial):tube(points,.28,loopMaterial,28);
  if(graftAppearance(state.graft).family==='btb'&&side==='femur'){
   const hole=pos(tip),radius=geometry.femur.plugDiameter/2,holeAxis=basis.holeAxis||across;
   for(const sign of [-1,1])suture([center.clone().addScaledVector(long,sign*.95),pos(g.ttl-2).addScaledVector(across,sign*1.1),hole.clone().addScaledVector(basis.axis,3).addScaledVector(holeAxis,sign*(radius+.35)),hole.clone().addScaledVector(holeAxis,sign*radius)]);
   cylinder(hole.clone().addScaledVector(holeAxis,-radius),hole.clone().addScaledVector(holeAxis,radius),.28,loopMaterial);hardware[side].graftAttachment={kind:'transverse-bone-hole',center:hole.toArray(),holeDiameter:2,fromFemoralTip:g.plugLength*.4};return;
  }
  for(const sign of [-1,1]){const offset=across.clone().multiplyScalar(sign*Math.min(graftRadius*.77,3.7));suture([center.clone().addScaledVector(long,sign*.95),pos(g.ttl-2).addScaledVector(across,sign*1.1),pos(tip+.8).add(offset),pos(tip-2).add(offset)]);}
  suture([pos(tip-2).addScaledVector(across,-Math.min(graftRadius*.77,3.7)),pos(tip+.6).addScaledVector(basis.front,graftRadius*.65),pos(tip-2).addScaledVector(across,Math.min(graftRadius*.77,3.7))]);
  if(values.fixation.includes('quadcinch')||state.graft==='rapidease')for(let j=0;j<4;j++)ring(pos(tip-1.6-j*1.25),basis.axis,Math.max(.04,graftRadius-.12),loopMaterial);
 }
 function preparedButtonBasis(){const start=detachedPath()[0],axis=PREP_UP.clone(),values=evaluation?.sides?.femur||state.femur,loopSpan=values.fixation==='glok'?Math.max(.2,Number(values.loop)||15):Math.max(7,geometry.femur.ttl-geometry.femur.graftInsertion),g={...geometry.femur,ttl:loopSpan,graftInsertion:0};return {g,axis,normal:axis.clone(),holeAxis:PREP_HOLE_AXIS.clone(),across:new THREE.Vector3(1,0,0),front:new THREE.Vector3(0,0,-1),pos:t=>start.clone().addScaledVector(axis,t)};}
 function drawPreparedButton(){const values=evaluation?.sides?.femur||state.femur;if(!['biosteon','wedge'].includes(values.fixation))makeButton('femur',values,preparedButtonBasis(),{context:'prepared'});}
 function makeScrew(side,values,basis){
  const {pos,axis,across}=basis,diameter=renderDiameter(values.screwDiameter),length=Math.max(.2,Math.min(100,displayLength(values.screwLength))),radius=diameter/2,status=evaluation?.hardwareStatus?.[side]||{},offset=across.clone().multiplyScalar(Math.max(1,geometry[side].socketDiameter*.28)),direction=axis.clone().multiplyScalar(side==='tibia'?-1:1),surface=side==='tibia'?geometry[side].ttl:0,aperture=pos(surface),outward=side==='femur'?v(femoralEntryNormal):v(geometry[side].normal);
  if(outward.dot(direction)>0)outward.negate();const geometries=createScrewGeometries(diameter,length);geometries.head=new THREE.TorusGeometry(radius*.66,.12,6,48);geometries.head.translate(0,0,.15);
  // flush with the (oblique) aperture first; beside a bone block the head then moves to the engine's seat (flush with the block
  // where it fits), never outward past that aperture-flush position
  const placement=flushScrewPlacement({geometries,aperture:aperture.toArray(),outwardNormal:outward.toArray(),direction:direction.toArray(),lateralOffset:offset.toArray()}),engineSide=evaluation?.sides?.[side]||{},span=engineSide.screwAxialSpan,flushAxial=v(placement.start).sub(v(geometry[side].entry)).dot(axis),headAxial=geometry[side].bonePlug&&Array.isArray(span)?(side==='tibia'?Math.min(span[1],flushAxial):Math.max(flushAxial,Math.min(span[0],geometry[side].ttl-length))):flushAxial,start=v(placement.start).addScaledVector(axis,headAxial-flushAxial),end=start.clone().addScaledVector(direction,length),protrusion=Math.max(0,side==='tibia'?length-headAxial:headAxial+length-geometry[side].ttl),axialCoordinates=[start.clone().sub(v(geometry[side].entry)).dot(axis),end.clone().sub(v(geometry[side].entry)).dot(axis)].sort((a,b)=>a-b),softEnd=Math.max(0,geometry[side].graftInsertion-geometry[side].plugLength),actualSoftTissueOverlap=values.fixation==='wedge'&&graftAppearance(state.graft).family==='btb'?Math.max(0,Math.min(axialCoordinates[1],softEnd)-Math.max(axialCoordinates[0],0)):0,softTissueFlag=values.fixation==='wedge'&&(evaluation?.issues||[]).some(issue=>issue.id===`${side}-screw-tendon`),invalid=!!status.screwInvalid||protrusion>.05,material=invalid?M.hardwareError:values.fixation==='wedge'?M.titanium:M.bio,rotation=new THREE.Quaternion(...placement.rotation),reasons=[...(status.reasons||[])];
  if(protrusion>.05&&!reasons.some(text=>text.includes('extends')))reasons.push(`Modeled screw extends ${fmt(protrusion)} mm beyond the far end of this bone path.`);
  for(const [part,shape] of Object.entries(geometries)){const mesh=add(shape,part==='head'&&!invalid?M.dark:material);mesh.position.copy(start);mesh.quaternion.copy(rotation);}
  hardware[side]={kind:values.fixation==='wedge'?'titanium-screw':'biosteon-screw',context:'seated',center:start.clone().lerp(end,.5).toArray(),surfaceAnchor:aperture.toArray(),start:start.toArray(),end:end.toArray(),diameter,length,sku:values.fixationSku||null,invalid,reasons,color:invalid?'red':values.fixation==='wedge'?'titanium':'biosteon',protrusion,actualAxialSpan:axialCoordinates,actualSoftTissueOverlap,softTissueFlag,softTissueOverlap:engineSide.screwSoftTissueOverlap??0,softTissueShare:engineSide.screwSoftTissueShare??0,axialRecess:placement.axialRecess,headDepth:headAxial,seat:engineSide.screwSeat||null,insertionPlane:{point:aperture.toArray(),outwardNormal:outward.toArray(),maxOutwardDistance:placement.maxOutwardDistance}};
 }
 class CenterlineCurve extends THREE.Curve{
  constructor(points){super();this.points=points;this.lengths=[0];for(let i=1;i<points.length;i++)this.lengths.push(this.lengths[i-1]+points[i].distanceTo(points[i-1]));this.total=this.lengths.at(-1)||1;}
  getPoint(t,target=new THREE.Vector3()){const length=clamp(t,0,1)*this.total;let j=1;while(j<this.lengths.length-1&&this.lengths[j]<length)j++;const a=this.lengths[j-1],b=this.lengths[j];return target.copy(this.points[j-1]).lerp(this.points[j],b-a>.00001?(length-a)/(b-a):0);}
 }
 const pathLength=points=>points.slice(1).reduce((total,p,i)=>total+p.distanceTo(points[i]),0);
 function pathPoint(points,distance){let left=distance;for(let i=1;i<points.length;i++){const length=points[i].distanceTo(points[i-1]);if(left<=length)return points[i-1].clone().lerp(points[i],length>.00001?Math.max(0,left)/length:0);left-=length;}return points.at(-1).clone().addScaledVector(points.at(-1).clone().sub(points.at(-2)).normalize(),Math.max(0,left));}
 function slicePath(points,start,end){const result=[pathPoint(points,start)];let total=0;for(let i=1;i<points.length;i++){total+=points[i].distanceTo(points[i-1]);if(total>start+.001&&total<end-.001)result.push(points[i].clone());}result.push(pathPoint(points,end));return result;}
 // Flush tibial trim: the projecting graft is cut along the tibial cortex around the tunnel exit (the bone surface), not
 // square to the tunnel. While clipPlane is set, graft geometry beyond that plane ('inside' keeps the retained end) or before
 // it ('outside' keeps the offcut) is slid along the tunnel axis onto the plane, so the cut face lies on the cortex.
 let clipPlane=null;
 function tibialCutPlane(){
  const g=geometry.tibia,dir=v(g.direction).normalize();let normal=v(g.normal).normalize();if(normal.dot(dir)<0)normal.negate();if(normal.dot(dir)<.25)normal=dir.clone();
  const down=new THREE.Vector3(0,0,1);down.addScaledVector(normal,-down.dot(normal));if(down.length()<.1)down.copy(frameFor('tibia').across).addScaledVector(normal,-frameFor('tibia').across.dot(normal));down.normalize();
  const cos=normal.dot(dir),radius=renderDiameter(state.graftDiameter)/2;
  return {point:v(g.cortex),normal,dir,down,across:normal.clone().cross(down).normalize(),cos,radius,reach:radius*Math.sqrt(Math.max(0,1-cos*cos))/Math.max(.25,cos)};
 }
 const planeSide=(plane,p)=>v(p).sub(plane.point).dot(plane.normal);
 function clipPositions(arr){if(!clipPlane)return;const {point,normal,dir,keep}=clipPlane,dn=dir.dot(normal);for(let i=0;i<arr.length;i+=3){const d=(arr[i]-point.x)*normal.x+(arr[i+1]-point.y)*normal.y+(arr[i+2]-point.z)*normal.z;if(keep==='outside'?d<0:d>0){const t=d/dn;arr[i]-=dir.x*t;arr[i+1]-=dir.y*t;arr[i+2]-=dir.z*t;}}}
 function clipMesh(mesh){if(!clipPlane||!mesh)return mesh;const g=mesh.geometry;mesh.updateMatrix();g.computeBoundingSphere();{const c=g.boundingSphere.center.clone().applyMatrix4(mesh.matrix),d=c.sub(clipPlane.point).dot(clipPlane.normal),r=g.boundingSphere.radius*Math.max(mesh.scale.x,mesh.scale.y,mesh.scale.z);if(clipPlane.keep==='outside'?d-r>0:d+r<0)return mesh;}g.applyMatrix4(mesh.matrix);mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.set(1,1,1);clipPositions(g.attributes.position.array);g.attributes.position.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();return mesh;}
 // the retained end of a flush cut: an ellipse on the cortex around the graft
 function flushRing(plane,material){const major=plane.dir.clone().addScaledVector(plane.normal,-plane.dir.dot(plane.normal));if(major.length()<.01)major.copy(plane.down);major.normalize();const mesh=add(new THREE.TorusGeometry(plane.radius+.2,.12,6,48),material);mesh.position.copy(plane.point).addScaledVector(plane.normal,.05);mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(major,plane.normal.clone().cross(major).normalize(),plane.normal));mesh.scale.set(1/Math.max(.25,plane.cos),1,1);mesh.renderOrder=8;return mesh;}
 function sweepSection(curve,section,material,segments=64){
  const frames=curve.computeFrenetFrames(segments,false),positions=[],indices=[],sides=20;
  for(let i=0;i<=segments;i++){const center=curve.getPoint(i/segments);for(let j=0;j<sides;j++){const angle=j/sides*Math.PI*2,p=center.clone().addScaledVector(frames.normals[i],section.x+Math.cos(angle)*section.rx).addScaledVector(frames.binormals[i],section.y+Math.sin(angle)*section.ry);positions.push(p.x,p.y,p.z);}}
  for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides,c=a+sides,d=b+sides;indices.push(a,b,c,b,d,c);}
  for(const [base,reverse] of [[0,true],[segments*sides,false]])for(let j=1;j<sides-1;j++)indices.push(base,base+(reverse?j+1:j),base+(reverse?j:j+1));
  clipPositions(positions);const mesh=new THREE.BufferGeometry();mesh.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));mesh.setIndex(indices);mesh.computeVertexNormals();return add(mesh,material);
 }
 function plugMesh(layout,material=M.plug){
  const holes=layout.holes.map(({position,diameter})=>({position,diameter})),key=JSON.stringify([layout.diameter,layout.retainedLength,holes]);let base=plugCache.get(key);
  if(!base){base=createBonePlugGeometry({diameter:layout.diameter,length:layout.retainedLength,holes});plugCache.set(key,base);if(plugCache.size>80){const oldest=plugCache.keys().next().value;plugCache.get(oldest).dispose();plugCache.delete(oldest);}}
  const mesh=add(base.clone(),material);mesh.position.fromArray(layout.start);mesh.quaternion.fromArray(layout.rotation);return clipMesh(mesh);
 }
 function controlSutures(layout){
  const axis=v(layout.axis),cross=v(layout.transverse),radius=layout.diameter/2;
  for(const [index,hole] of layout.holes.entries())if(hole.retained){const center=v(hole.center);cylinder(center.clone().addScaledVector(cross,-radius),center.clone().addScaledVector(cross,radius),.22,M.loop);
   for(const sign of [-1,1])tube([center.clone().addScaledVector(cross,sign*radius),center.clone().addScaledVector(cross,sign*(radius+2)).addScaledVector(axis,4),v(layout.originalEnd).addScaledVector(cross,sign*(radius+2+index)).addScaledVector(axis,9+index*2)],.22,M.loop,20);
  }
 }
 function drawGraftShape(points,kind='placed',withMarkers=false,trimOverride=null){
  const diameter=renderDiameter(state.graftDiameter),preparedLength=clamp(Number(state.graftLength)||.2,.2,600),softTrim=kind==='placed'&&evaluation.sides.tibia.trimKind==='soft-tissue'?(trimOverride??(workflowView.trimmed?evaluation.sides.tibia.trimAmount||0:0)):0,boneTrim=kind==='placed'&&geometry.tibia.bonePlug&&graftAppearance(state.graft).family==='btb'?(trimOverride??(workflowView.trimmed?evaluation.sides.tibia.plannedBoneTrim||0:0)):0,flush=softTrim>0||boneTrim>0?tibialCutPlane():null,softExtra=flush&&softTrim>0?Math.min(softTrim,flush.reach+.5):0,length=Math.max(.2,preparedLength-softTrim+softExtra),appearance=graftAppearance(state.graft),bodyPoints=slicePath(points,0,length),curve=new CenterlineCurve(bodyPoints),fPlug=geometry.femur.bonePlug?geometry.femur.plugLength:0,tPlug=geometry.tibia.bonePlug?geometry.tibia.plugLength:0;
  const softStart=Math.min(length,fPlug),softEnd=Math.max(softStart,Math.min(length,length-tPlug));
  const endData=[],plugs={};let softConnection=null;clipPlane=flush?{...flush,keep:'inside'}:null;
  try{
  for(const [side,plugLength,at] of [['femur',fPlug,0],['tibia',tPlug,length]]){
   const fraction=length>.001?clamp((at===0?plugLength/2:length-plugLength/2)/length,0,1):0,tangent=curve.getTangent(fraction).normalize(),endpoint=curve.getPoint(at===0?0:1);
   if(plugLength>0){
    const btb=appearance.family==='btb',placed=kind==='placed'&&(side==='femur'||workflowView.route!=='all_inside'||workflowView.tibia.passed),axis=placed?v(geometry[side].direction).multiplyScalar(side==='femur'?-1:1):curve.getTangent(side==='femur'?0:1).normalize(),start=placed?(side==='femur'?v(geometry.femur.graftTip):v(geometry.tibia.graftTip).addScaledVector(axis,-plugLength)):(side==='femur'?curve.getPoint(0):curve.getPoint(1).addScaledVector(axis,-plugLength)),trim=btb&&side==='tibia'?(trimOverride??(kind==='placed'&&workflowView.trimmed?evaluation.sides.tibia.plannedBoneTrim||0:0)):0;
    const cutFlush=!!flush&&side==='tibia'&&trim>0,layout=bonePlugLayout({side,start:start.toArray(),axis:axis.toArray(),transverse:placed?frameFor(side).across.toArray():kind.startsWith('prepared')?PREP_HOLE_AXIS.toArray():[1,0,0],length:plugLength,diameter:geometry[side].plugDiameter,trim:cutFlush?Math.max(0,trim-Math.min(trim,flush.reach+.5)):trim,drilled:btb});plugMesh(layout);
    // flush cut: the block keeps whatever lies inside the cortex; the axial trim and cut point stay the planned ones
    if(cutFlush){layout.trimAmount=trim;layout.retainedLength=layout.originalLength-trim;layout.end=flush.point.toArray();for(const hole of layout.holes)if(hole.retained&&planeSide(flush,hole.center)>-1.2)hole.retained=false;}
    plugs[side]=layout;if(btb&&side==='tibia'){const keep=clipPlane;clipPlane=null;controlSutures(layout);clipPlane=keep;}
    if(side==='tibia'&&trim>0)endpoint.fromArray(layout.end);
   }
   if(appearance.stitches){for(let j=0;j<(kind==='prepared-preview'?Math.floor(4*(preview?.progress||0)):4);j++){const distance=at===0?1.8+j*1.6:length-1.8-j*1.6,p=curve.getPoint(clamp(distance/length,0,1));ring(p,curve.getTangent(clamp(distance/length,0,1)).normalize(),Math.max(.08,diameter/2-.12),appearance.family==='rapidease'?M.loop:M.quad);}}
   if((kind!=='prepared-preview'||(preview?.progress||0)>.65)&&(appearance.family==='rapidease'||appearance.family==='quad'||appearance.family==='qtb'&&side==='femur')){
    const tangentOut=curve.getTangent(at===0?0:1).multiplyScalar(at===0?-1:1),cross=tangentOut.clone().cross(new THREE.Vector3(0,0,1)).normalize();if(cross.length()<.1)cross.set(1,0,0);
    const loop=[endpoint.clone().addScaledVector(cross,-diameter*.23),endpoint.clone().addScaledVector(tangentOut,5).addScaledVector(cross,-1.2),endpoint.clone().addScaledVector(tangentOut,6),endpoint.clone().addScaledVector(tangentOut,5).addScaledVector(cross,1.2),endpoint.clone().addScaledVector(cross,diameter*.23)];tube(loop,.24,appearance.family==='rapidease'?M.loop:M.quad,22);
   }
   if(side==='tibia'&&flush&&softTrim>0)endpoint.copy(flush.point);
   endData.push({side,point:endpoint.toArray(),plugLength});
  }
  if(softEnd-softStart>.05){const rawSoft=slicePath(bodyPoints,softStart,softEnd),from=plugs.femur?.end||rawSoft[0].toArray(),to=plugs.tibia?.start||rawSoft.at(-1).toArray(),connected=connectedSoftPath(rawSoft.map(p=>p.toArray()),from,to,softEnd-softStart),soft=new CenterlineCurve(connected.points.map(v));softConnection=connected;for(const profile of graftCrossSections(state.graft,diameter))sweepSection(soft,profile,M.graft,64);
   if(appearance.family==='quad'||appearance.family==='qtb'||appearance.family==='btb'){
    const frames=soft.computeFrenetFrames(40,false),half=diameter/2,thin=appearance.family==='btb'?.38:.56;
    for(const offset of [-.65,-.3,0,.3,.65]){const fiber=[];for(let i=0;i<=40;i++)fiber.push(soft.getPoint(i/40).addScaledVector(frames.normals[i],offset*half).addScaledVector(frames.binormals[i],thin*half*Math.sqrt(1-offset*offset)-.035));tube(fiber,.035,M.fiber,40);}
   }
  }
  if(appearance.family==='folded'){
   const tangent=curve.getTangent(0),normal=tangent.clone().cross(new THREE.Vector3(0,0,1)).normalize();if(normal.length()<.1)normal.set(1,0,0);
   const tip=curve.getPoint(0);tube([tip.clone().addScaledVector(normal,-diameter*.24).addScaledVector(tangent,diameter*.2),tip.clone().addScaledVector(tangent,diameter*.05),tip.clone().addScaledVector(normal,diameter*.24).addScaledVector(tangent,diameter*.2)],diameter*.12,M.graft,18);
  }
  }finally{clipPlane=null;}
  if(withMarkers)for(const side of ['femur','tibia'])if(workflowView[side].passed){if(side==='tibia'&&flush&&(plugs.tibia?.trimAmount||softTrim))flushRing(flush,M.graftRing);else ring(v(side==='tibia'&&(plugs.tibia?.trimAmount||softTrim)?endData[1].point:geometry[side].graftTip),v(geometry[side].direction),renderDiameter(state.graftDiameter)/2+.2,M.graftRing);}
  graftInfo={kind,family:appearance.family,appearance:appearance.name,profile:appearance.profile,strands:appearance.strands,preparedLength,renderedCenterlineLength:pathLength(bodyPoints)-softExtra,flushCut:flush?{point:flush.point.toArray(),normal:flush.normal.toArray(),reach:flush.reach}:null,diameterEnvelope:diameter,crossSections:graftCrossSections(state.graft,diameter),ends:endData,plugs,softConnection,trimAmount:(plugs.tibia?.trimAmount||0)+softTrim,trimKind:evaluation.sides.tibia.trimKind||null,retainedLength:preparedLength-(plugs.tibia?.trimAmount||0)-softTrim,schematicProfile:true};
 }
 function detachedPath(){const length=clamp(Number(state.graftLength)||.2,.2,600),values=evaluation?.sides?.femur||state.femur,button=!['biosteon','wedge'].includes(values.fixation),loopSpan=!button?0:values.fixation==='glok'?Math.max(.2,Number(values.loop)||15):Math.max(7,geometry.femur.ttl-geometry.femur.graftInsertion),entry=v(geometry.femur.entry),viewCenter=new THREE.Vector3(0,0,entry.z),center=entry.clone().add(new THREE.Vector3(56,0,0));center.addScaledVector(PREP_UP,viewCenter.clone().sub(center).dot(PREP_UP)-(button?loopSpan/2+2:0));return [center.clone().addScaledVector(PREP_UP,length/2),center.clone().addScaledVector(PREP_UP,-length/2)];}
 function seatedPath(tibialFraction=1){
  if(workflowView.route==='all_inside')return allInsideCenterline({femoralTip:geometry.femur.graftTip,femoralEntry:geometry.femur.entry,tibialEntry:geometry.tibia.entry,tibialTip:geometry.tibia.graftTip,length:clamp(Number(state.graftLength)||.2,.2,600)},tibialFraction).map(v);
  const f=geometry.femur,t=geometry.tibia,fe=v(f.entry),te=v(t.entry),fTip=v(f.graftTip),tTip=v(t.entry).addScaledVector(v(t.direction),t.graftInsertion*tibialFraction),length=clamp(Number(state.graftLength)||.2,.2,600),bridgeLength=Math.max(geometry.jointSpan,length-Math.max(0,f.graftInsertion)-Math.max(0,t.graftInsertion*tibialFraction)),jointDirection=te.clone().sub(fe).normalize();
  let medial=new THREE.Vector3(-1,0,0);medial.addScaledVector(jointDirection,-medial.dot(jointDirection)).normalize();if(medial.length()<.1)medial.set(0,0,-1);
  const bow=Math.sqrt(Math.max(0,(bridgeLength*.5)**2-(geometry.jointSpan*.5)**2)),mid=fe.clone().lerp(te,.5).addScaledVector(medial,bow);
  return [fTip,fe,mid,te,tTip];
 }
 function makeGraft(tibialFraction=1,trimOverride=null){
  const points=seatedPath(tibialFraction),required=pathLength(points),length=clamp(Number(state.graftLength)||.2,.2,600);drawGraftShape(points,'placed',true,trimOverride);
  graftInfo.shortfall=Math.max(0,required-length);graftInfo.slack=Math.max(0,length-(Math.max(0,geometry.femur.graftInsertion)+geometry.jointSpan+Math.max(0,geometry.tibia.graftInsertion*tibialFraction)));
  if(length<required-.1){const end=pathPoint(points,length),target=points.at(-1);cylinder(end,target,.35,M.invalid);ring(end,curveTangent(points,length),renderDiameter(state.graftDiameter)/2+.2,M.graftRing);}
 }
 function curveTangent(points,distance){const l=pathLength(points);return pathPoint(points,Math.min(l,distance+.1)).sub(pathPoint(points,Math.max(0,distance-.1))).normalize();}
 function setBore(side,progress=0,previewing=false){
  const g=geometry[side],values=evaluation?.sides?.[side]||state[side],uniform=boreUniforms[side],basis=frameFor(side),retro=values.technique==='retrograde',outside=values.technique==='outside_in'||side==='tibia';
  uniform.entry.value.fromArray(g.entry);uniform.axis.value.copy(basis.axis);uniform.ttl.value=g.ttl;uniform.radius.value=g.socketDiameter/2;uniform.shaftRadius.value=g.apertureDiameter/2;uniform.cutaway.value=options.cutaway&&progress>0?1:0;uniform.cutFront.value.copy(basis.front);uniform.cutWidth.value=Math.max(g.socketDiameter*.7,10);uniform.pilotRadius.value=workflowView[side].pin?(1.2):0;uniform.boreEnabled.value=progress>0||uniform.pilotRadius.value>0?1:0;
  uniform.socketStart.value=0;uniform.socket.value=0;uniform.shaftStart.value=0;uniform.shaftEnd.value=0;
  if(!previewing||progress>=1){if(progress>=1){uniform.socket.value=Math.max(0,g.socketDepth);uniform.shaftEnd.value=g.ttl;if(['flexible','low_profile'].includes(values.technique)&&side==='femur'&&workflowView.active&&!workflowView.femur.cortexReamed&&preview?.stage!=='femur_cortex_ream')uniform.shaftRadius.value=openingDiameter(side)/2;}return;}
  if(retro){const pose=retroReamerPose(progress,{ttl:g.ttl,socketDepth:g.socketDepth,blownCortex:values.blownCortex});uniform.shaftRadius.value=(values.shaftDiameter||4.5)/2;uniform.shaftStart.value=pose.shaftDepth;uniform.shaftEnd.value=g.ttl;uniform.socket.value=pose.cutDepth;}
  else if(['flexible','low_profile'].includes(values.technique)&&side==='femur'){const pose=flexibleReamerPose(progress,{ttl:g.ttl,socketDepth:g.socketDepth,corticalPassage:preview?.stage==='femur_cortex_ream',graftDiameter:g.socketDiameter});uniform.socket.value=pose.socketCutDepth;uniform.pilotRadius.value=1.2;uniform.shaftRadius.value=2.25;uniform.shaftEnd.value=pose.corticalCutDepth;uniform.shaftStart.value=0;}
  else {const pose=antegradeReamerPose(progress,{ttl:g.ttl,socketDepth:g.socketDepth,outside});if(outside){uniform.socketStart.value=g.ttl-pose.cutDepth;uniform.socket.value=g.ttl;uniform.shaftStart.value=uniform.socketStart.value;uniform.shaftEnd.value=g.ttl;}else{uniform.socket.value=pose.cutDepth;uniform.shaftRadius.value=1.2;uniform.shaftEnd.value=workflowView[side].pin?g.ttl:uniform.socket.value;}}
 }
 function openingDiameter(side){const g=geometry[side],values=evaluation?.sides?.[side]||state[side];return modelCorticalOpening({technique:side==='femur'?values.technique:'',fixation:values.fixation,socketDepth:g.socketDepth,ttl:g.ttl,socketDiameter:g.socketDiameter,apertureDiameter:g.apertureDiameter,workflowActive:workflowView.active,cortexReamed:workflowView[side].cortexReamed});}
 function drawTunnel(side){const basis=frameFor(side),{g,axis,pos}=basis,stop=clamp(g.socketDepth,0,g.ttl);cylinder(pos(0),pos(stop),g.socketDiameter/2,M.socket,true);if(stop<g.ttl)cylinder(pos(stop),pos(g.ttl),openingDiameter(side)/2,M.shaft,true);if(g.socketDepth>g.ttl)cylinder(pos(g.ttl),pos(g.socketDepth),g.socketDiameter/2,M.invalid,true);if(g.socketDepth<0)cylinder(pos(g.socketDepth),pos(0),g.socketDiameter/2,M.invalid,true);ring(pos(0),axis,g.socketDiameter/2,M.socketRing);ring(pos(g.socketDepth),axis,g.socketDiameter/2,g.socketDepth>g.ttl||g.socketDepth<0?M.graftRing:M.socketRing);ring(pos(g.ttl),axis,openingDiameter(side)/2,M.cortexRing);}
 function flexibleGuidePath(){
  const {g,axis,pos}=frameFor('femur'),external=anteriorApproach({entry:g.entry,direction:g.direction,tibialEntry:geometry.tibia.entry}).map(v),externalLength=pathLength(external),incoming=external[1].clone().sub(external[0]).normalize();
  return {points:[...external,pos(g.ttl+45)],external,externalLength,entry:pos(0),axis,incoming};
 }
 function drawAMGuide(guide,progress){
  if(progress>=.995)return;const withdrawal=Math.max(0,(progress-.80)/.195),shift=guide.incoming.clone().multiplyScalar(-withdrawal*32),points=guide.external.map(point=>point.clone().add(shift)),shape=new THREE.Shape();shape.absarc(0,0,2.8,0,Math.PI*2,false);const hole=new THREE.Path();hole.absarc(0,0,1.55,0,Math.PI*2,true);shape.holes.push(hole);
  add(new THREE.ExtrudeGeometry(shape,{steps:40,bevelEnabled:false,extrudePath:new CenterlineCurve(points),curveSegments:12}),M.titanium);
  // The handle continues the cannula outside the portal (it never stands in the notch).
  const outer=points[0],outward=points[0].clone().sub(points[1]).normalize(),handleEnd=outer.clone().addScaledVector(outward,16);cylinder(outer.clone().addScaledVector(outward,-2),handleEnd,3,M.guide);const cap=add(new THREE.SphereGeometry(3,16,10),M.guide);cap.position.copy(handleEnd);
  toolsVisible.push({kind:'AM guide',side:'femur',curveDegrees:45,progress,phase:withdrawal>0?'remove-guide':'guide-in-position'});
 }
 function linkedPosition(distance){return v(geometry.linked.start).addScaledVector(v(geometry.linked.direction),distance);}
 function drawLinkedPin(progress=1,withGuide=false){
  const route=geometry.linked;if(!route?.enabled)return;const axis=v(route.direction),pose=linkedPinPose(progress,{totalLength:route.totalLength}),tip=linkedPosition(pose.headDistance);
  cylinder(linkedPosition(pose.tailDistance),tip.clone().addScaledVector(axis,-2.4),1.2,M.titanium);const point=add(new THREE.ConeGeometry(1.2,2.4,16),M.titanium);point.position.copy(tip).addScaledVector(axis,-1.2);point.quaternion.setFromUnitVectors(Y,axis);
  toolsVisible.push({kind:'Linked guide pin',side:'linked',diameter:2.4,progress,tip:tip.toArray(),direction:route.direction,start:linkedPosition(pose.tailDistance).toArray(),straight:true,singlePass:true});
  if(withGuide&&progress<1){const withdrawal=clamp((progress-.8)/.2,0,1),a=linkedPosition(-14-withdrawal*32),b=linkedPosition(-2-withdrawal*32),radial=v(geometry.tibia.direction).cross(Z).normalize();
   cylinder(a,b,2.5,M.guide,true);ring(a,axis,2.5,M.cortexRing);ring(b,axis,2.5,M.cortexRing);const grip=a.clone().addScaledVector(radial,18);cylinder(a,grip,1.5,M.titanium);cylinder(grip,grip.clone().addScaledVector(axis,-14),4,M.guide);
   toolsVisible.push({kind:'Tibial pin guide',side:'tibia',progress,phase:withdrawal?'remove-guide':'guide-in-position',axis:route.direction});
  }
 }
 function setLinkedBores(tibialCutDepth,femoralCutDepth,pinVisible=true,cutaway=true){
  for(const side of ['tibia','femur']){setBore(side,0);const g=geometry[side],u=boreUniforms[side],cut=side==='tibia'?tibialCutDepth:femoralCutDepth;
   u.socketStart.value=side==='tibia'?g.ttl-cut:0;u.socket.value=side==='tibia'?g.ttl:cut;u.pilotRadius.value=pinVisible?1.2:0;u.shaftRadius.value=0;u.shaftStart.value=0;u.shaftEnd.value=0;u.boreEnabled.value=cut>0||pinVisible?1:0;u.cutaway.value=options.cutaway&&cutaway&&cut>0?1:0;
  }
 }
 function drawLinkedReamer(progress){
  const route=geometry.linked;if(!route?.enabled)return;const pose=linkedReamerPose(progress,{tibiaTTL:geometry.tibia.ttl,jointSpan:route.represented.jointSpan,femurTTL:geometry.femur.ttl}),axis=v(route.direction),head=linkedPosition(pose.headDistance),diameter=geometry.tibia.socketDiameter;
  setLinkedBores(pose.tibialCutDepth,pose.femoralCutDepth,pose.pinVisible);
  if(pose.pinVisible)drawLinkedPin(1);if(!pose.visible)return;
  cylinder(head.clone().addScaledVector(axis,-route.totalLength-30),head.clone().addScaledVector(axis,-3),2,M.titanium);cylinder(head.clone().addScaledVector(axis,-3),head,diameter/2,M.titanium);
  let radial=axis.clone().cross(Z).normalize();if(radial.length()<.1)radial.set(1,0,0);const tangent=axis.clone().cross(radial);
  for(let j=0;j<6;j++){const angle=j*Math.PI/3+pose.rotation,p=head.clone().addScaledVector(radial,Math.cos(angle)*(diameter/2-.16)).addScaledVector(tangent,Math.sin(angle)*(diameter/2-.16));cylinder(p.clone().addScaledVector(axis,-3),p,.16,M.dark);}
  toolsVisible.push({kind:'Linked reamer',side:'linked',headDiameter:diameter,shaftDiameter:4,head:head.toArray(),direction:route.direction,progress,phase:pose.phase,singlePass:true,overPin:true,tibialCutDepth:pose.tibialCutDepth,femoralCutDepth:pose.femoralCutDepth});
 }
 function drawCutBore(side){
  // The bone cut so far, drawn from the same values that cut the bone shader: socket at graft size, any wider drill
  // or cortical pass beyond it at its own size. Pin-sized bores are left to the pin.
  const u=boreUniforms[side],{axis,pos}=frameFor(side),start=u.socketStart.value,end=u.socket.value,shaftFrom=Math.max(u.shaftStart.value,end),shaftTo=u.shaftEnd.value;
  if(end-start>.2){cylinder(pos(start),pos(end),u.radius.value,M.socket,true);ring(pos(start),axis,u.radius.value,M.socketRing);ring(pos(end),axis,u.radius.value,M.socketRing);}
  if(u.shaftRadius.value>1.3&&shaftTo-shaftFrom>.2){cylinder(pos(shaftFrom),pos(shaftTo),u.shaftRadius.value,M.shaft,true);ring(pos(shaftTo),axis,u.shaftRadius.value,M.cortexRing);}
 }
 function drawPin(side,progress=1){
  const {g,pos,axis}=frameFor(side),values=evaluation?.sides?.[side]||state[side];
  if(side==='femur'&&values.technique==='flexible'){
   const guide=flexibleGuidePath(),length=pathLength(guide.points),pinProgress=preview?.stage==='femur_flexible_pin'?clamp((progress-.12)/.64,0,1):progress,lead=Math.max(.01,length*pinProgress),points=slicePath(guide.points,0,lead),tip=points.at(-1),direction=curveTangent(guide.points,lead);add(new THREE.TubeGeometry(new CenterlineCurve(points),70,1.2,12,false),M.titanium);const arrow=add(new THREE.ConeGeometry(1.2,3,16),M.titanium);arrow.position.copy(tip).addScaledVector(direction,1.5);arrow.quaternion.setFromUnitVectors(Y,direction);toolsVisible.push({kind:'Flexible guide pin',side,diameter:2.4,tipDiameter:2.4,progress,tip:tip.toArray(),direction:direction.toArray(),curvedOutsideBone:true,straightInsideBone:true});if(pinProgress>.72){const colored=slicePath(guide.points,Math.max(0,guide.externalLength-12),Math.min(lead,guide.externalLength));add(new THREE.TubeGeometry(new CenterlineCurve(colored),20,1.2,12,false),M.quad);}if(preview?.stage==='femur_flexible_pin')drawAMGuide(guide,progress);return;
  }
  const lowProfile=side==='femur'&&values.technique==='low_profile',outside=side==='tibia'||values.technique==='outside_in'||values.technique==='retrograde',from=outside?pos(g.ttl+18):pos(lowProfile?-6:-55),to=outside?pos(-7):pos(g.ttl+45),tip=from.clone().lerp(to,progress),direction=to.clone().sub(from).normalize(),tail=lowProfile?from.clone():tip.clone().addScaledVector(direction,-(outside?Math.min(g.ttl+25,80):g.ttl+100));
  // The rigid low-profile pin is one straight pin, drilled through the AM portal in deep flexion and straight through the
  // femur. At the fixed 90 degree pose its extension out of the notch would cross the medial condyle, so it is drawn from a
  // short notch stub along the tunnel axis and out through the lateral cortex (no curved approach).
  cylinder(tail,tip,1.2,M.titanium);const arrow=add(new THREE.ConeGeometry(1.2,3,16),M.titanium);arrow.position.copy(tip).addScaledVector(direction,1.5);arrow.quaternion.setFromUnitVectors(Y,direction);toolsVisible.push({kind:'Guide pin',side,diameter:2.4,progress,tip:tip.toArray(),direction:direction.toArray(),...(lowProfile?{straight:true,throughFemur:true}:{})});
 }
 function retroTooth(radius,shaftRadius){
  const halfWidth=Math.min(.85,shaftRadius*.42),reach=Math.sqrt(Math.max(.1,radius*radius-halfWidth*halfWidth)),shape=new THREE.Shape();shape.moveTo(0,-.28);shape.lineTo(reach*.80,-.28);shape.quadraticCurveTo(reach,-.28,reach,.18);shape.lineTo(reach,.32);shape.lineTo(.6,.32);shape.quadraticCurveTo(0,.32,0,-.28);
  const geo=new THREE.ExtrudeGeometry(shape,{depth:halfWidth*2,steps:1,bevelEnabled:false,curveSegments:6});geo.translate(0,0,-halfWidth);return geo;
 }
 function drawReamer(side,progress){
  const {g,pos,axis,across}=frameFor(side),values=evaluation?.sides?.[side]||state[side],retro=values.technique==='retrograde',outside=values.technique==='outside_in'||side==='tibia',shaft=retro?(values.shaftDiameter||4.5):4.0;
  if(retro){
   const pose=retroReamerPose(progress,{ttl:g.ttl,socketDepth:g.socketDepth,blownCortex:values.blownCortex});if(!pose.visible)return;const head=pos(pose.headDepth),tail=head.clone().addScaledVector(axis,Math.max(58,g.ttl+25)),radius=shaft/2;
   cylinder(head,tail,radius,M.titanium);const tip=add(new THREE.ConeGeometry(radius,4,24),M.titanium);tip.position.copy(head).addScaledVector(axis,-2);tip.quaternion.setFromUnitVectors(Y,axis.clone().negate());ring(head.clone().addScaledVector(axis,6),axis,radius-.12,M.dark);
   const radial=across.clone().applyAxisAngle(axis,pose.rotation),tangent=radial.clone().cross(axis).normalize(),rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(radial,axis,tangent)),hinge=new THREE.Quaternion().setFromAxisAngle(Z,(1-pose.opening)*Math.PI/2),tooth=add(retroTooth(g.socketDiameter/2,radius),M.titanium);tooth.position.copy(head);tooth.quaternion.copy(rotation).multiply(hinge);
   const pin=add(new THREE.SphereGeometry(.45,10,8),M.dark);pin.position.copy(head);toolsVisible.push({kind:'RetroReamer',side,shaftDiameter:shaft,headDiameter:g.socketDiameter,toothCount:1,toothOpening:pose.opening,progress,phase:pose.phase,head:head.toArray(),retrograde:true,blownCortex:pose.blownCortex});return;
  }
  const flexible=['flexible','low_profile'].includes(values.technique)&&side==='femur',pose=flexible?flexibleReamerPose(progress,{ttl:g.ttl,socketDepth:g.socketDepth,corticalPassage:preview?.stage==='femur_cortex_ream',graftDiameter:g.socketDiameter}):antegradeReamerPose(progress,{ttl:g.ttl,socketDepth:g.socketDepth,outside});if(!pose.visible)return;const headDiameter=pose.headDiameter||g.socketDiameter;let head,direction;
  if(values.technique==='flexible'&&side==='femur'){
   const guide=flexibleGuidePath(),travel=clamp(guide.externalLength+pose.headDepth,.1,pathLength(guide.points)),points=slicePath(guide.points,0,travel);head=points.at(-1);direction=curveTangent(guide.points,travel);add(new THREE.TubeGeometry(new CenterlineCurve(points),65,Math.min(shaft/2,g.socketDiameter*.35),12,false),M.titanium);
   const coiled=new CenterlineCurve(points),frames=coiled.computeFrenetFrames(100,false),coil=[];for(let i=0;i<=100;i++){const p=coiled.getPoint(i/100),angle=i*Math.PI*.55+pose.rotation;coil.push(p.addScaledVector(frames.normals[i],Math.cos(angle)*1.92).addScaledVector(frames.binormals[i],Math.sin(angle)*1.92));}tube(coil,.12,M.dark,100);
  }else{head=pos(pose.headDepth);direction=axis.clone().multiplyScalar(outside?-1:1);cylinder(values.technique==='low_profile'&&side==='femur'?pos(Math.min(-6,pose.headDepth-3)):head.clone().addScaledVector(direction,-g.ttl-28),head,shaft/2,M.titanium);}
  cylinder(head.clone().addScaledVector(direction,-3),head.clone(),headDiameter/2,M.titanium);const radial=direction.clone().cross(new THREE.Vector3(0,0,1)).normalize();if(radial.length()<.1)radial.set(1,0,0);const tangent=direction.clone().cross(radial);
  for(let j=0;j<6;j++){const phase=j/6*Math.PI*2+pose.rotation,point=head.clone().addScaledVector(radial,Math.cos(phase)*(headDiameter/2-.16)).addScaledVector(tangent,Math.sin(phase)*(headDiameter/2-.16));cylinder(point.clone().addScaledVector(direction,-3),point.clone(),.16,M.dark);}
  toolsVisible.push({kind:values.technique==='flexible'?'Flexible reamer':'Antegrade reamer',side,shaftDiameter:shaft,headDiameter,progress,phase:pose.phase,pass:pose.pass,head:head.toArray(),retrograde:false,curvedOutsideBone:values.technique==='flexible',straightInsideBone:true});
 }
 function drawMeasurement(side,progress){
  const {g,pos,axis,across}=frameFor(side);if(side==='femur'&&['flexible','low_profile','outside_in'].includes(state.femur.technique)){
   const travel=clamp(progress/.65,0,1),base=pos(g.ttl+20*(1-travel)),end=base.clone().addScaledVector(axis,47),pinTip=pos(g.ttl+45);
   for(const sign of [-1,1])cylinder(base.clone().addScaledVector(across,sign*2.1),end.clone().addScaledVector(across,sign*2.1),.65,M.gauge);
   cylinder(base.clone().addScaledVector(across,-2.1),base.clone().addScaledVector(across,2.1),.65,M.gauge);cylinder(end,end.clone().addScaledVector(axis,12),3.2,M.gauge);
   for(let d=5;d<47;d+=5){const tick=base.clone().addScaledVector(axis,d);cylinder(tick.clone().addScaledVector(across,1.55),tick.clone().addScaledVector(across,2.6),.15,M.cortexRing);}
   if(travel>=1)ring(pinTip,axis,1.45,M.graftRing);toolsVisible.push({kind:'Outside-in depth gauge',side,length:g.ttl,progress,phase:travel<1?'slide-over-lateral-pin':'read-pin-tip',pinTip:pinTip.toArray(),contact:base.toArray(),readingAtPinTip:travel>=1,overPin:true});return;
  }
  cylinder(pos(0),pos(g.ttl*progress),.35,M.titanium);for(let d=0;d<=g.ttl*progress;d+=5)ring(pos(d),v(g.direction),.75,M.cortexRing);toolsVisible.push({kind:'Tunnel measurement',side,length:g.ttl*progress});
 }
 function rebuildScene(){
  workflowView=resolveModelWorkflow(modelWorkflowInput(),preview);renderGroup=assembly;clearAssembly();componentSnapshot={bare:workflowView.active,bones:true,tunnels:[],pins:[],fixation:[],preparedGraft:false,placedGraft:false};
  for(const side of ['femur','tibia']){const stage=workflowView[side];setBore(side,stage.reamed?1:0);if(stage.reamed){drawTunnel(side);componentSnapshot.tunnels.push(side);componentSnapshot.bare=false;}if(!geometry.linked?.enabled&&stage.pin&&!stage.pinning&&!stage.passing&&!stage.reaming&&!stage.cortexReaming){drawPin(side);componentSnapshot.pins.push(side);componentSnapshot.bare=false;}if((stage.fixed||side==='femur'&&stage.passed&&!stage.passing)&&!stage.fixing&&!(side==='femur'&&workflowView.xlPreview)){const values=evaluation?.sides?.[side]||state[side];if(['biosteon','wedge'].includes(values.fixation)){if(stage.fixed)makeScrew(side,values,frameFor(side));}else makeButton(side,values,frameFor(side));if(hardware[side])componentSnapshot.fixation.push(side);componentSnapshot.bare=false;}}
  if(geometry.linked?.enabled&&workflowView.tibia.pin&&!workflowView.tibia.pinning&&!workflowView.tibia.reaming){drawLinkedPin(1);componentSnapshot.pins.push('linked');componentSnapshot.bare=false;}
  if(workflowView.showPrepared){drawGraftShape(detachedPath(),'prepared');drawPreparedButton();componentSnapshot.preparedGraft=true;componentSnapshot.bare=false;}
  if(workflowView.femur.passed&&!workflowView.femur.passing&&!workflowView.tibia.passing&&!workflowView.trimming){makeGraft(workflowView.tibia.passed?1:0);componentSnapshot.placedGraft=true;componentSnapshot.bare=false;}
  safeguardNotice.hidden=(!graftInfo&&!['femur','tibia'].some(side=>workflowView[side].measured))||geometry.displaySafeguards.length===0;
 }
 function drawFemoralPass(progress){
  const f=geometry.femur,t=geometry.tibia,values=evaluation?.sides?.femur||state.femur,isButton=!['biosteon','wedge'].includes(values.fixation),includeXL=hasXL('femur',values)&&state.femur.xlTiming==='before',spec=values.buttonSpec||{},adjustable=isButton&&values.fixation!=='glok',pose=(adjustable?adjustableFemoralPassPose:femoralButtonPassPose)(progress,{ttl:f.ttl,buttonLength:spec.length||spec.outerDiameter||13,xlBefore:includeXL}),gLength=clamp(Number(state.graftLength)||.2,.2,600),basis=frameFor('femur'),overtravel=isButton&&values.fixation==='glok'?pose.clearance:0,terminalDepth=f.graftInsertion+overtravel*(1-pose.seat),portal=v(medialPortal(f.entry,t.entry));
  let route;if(workflowView.route==='all_inside')route=[...anteriorApproach({entry:f.entry,direction:f.direction,tibialEntry:t.entry,extension:gLength+28}).map(v),basis.pos(terminalDepth)];else route=[v(t.cortex).addScaledVector(v(t.direction),gLength+22),v(t.cortex),v(t.entry),v(f.entry),basis.pos(terminalDepth)];
  const total=pathLength(route),advance=isButton?pose.advance:progress,lagLead=workflowView.route==='all_inside'?Math.max(gLength,total-terminalDepth-16):gLength+22+t.ttl*.5,lead=adjustable?(gLength+(lagLead-gLength)*advance)+(total-lagLead)*(pose.tension||0):gLength+(total-gLength)*advance;
  if(progress>=.999)makeGraft(workflowView.route==='all_inside'?0:1);else{drawGraftShape(slicePath(route,Math.max(0,lead-gLength),lead).reverse(),'passage');graftInfo.route=workflowView.route;}
  if(!isButton)return;
  const buttonRoute=[...route.slice(0,-1),basis.pos(f.ttl+pose.clearance)],buttonDistance=adjustable?gLength+(pathLength(buttonRoute)-gLength)*advance:Math.min(pathLength(buttonRoute),lead+(f.ttl+pose.clearance-terminalDepth)),tangent=curveTangent(buttonRoute,buttonDistance),plateNormal=basis.across.clone().addScaledVector(tangent,-basis.across.dot(tangent)).normalize(),short=tangent.clone().cross(plateNormal).normalize(),endOn=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(short,tangent,plateNormal)),seatedLong=basis.across.clone().addScaledVector(basis.normal,-basis.across.dot(basis.normal)).normalize(),seatedShort=seatedLong.clone().cross(basis.normal).normalize(),seatedRotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(seatedShort,seatedLong,basis.normal));
  const rotation=endOn.clone().slerp(seatedRotation,pose.flip),normal=Z.clone().applyQuaternion(rotation),thickness=spec.thickness||1.5,center=pathPoint(buttonRoute,buttonDistance),seatedCenter=v(f.cortex).addScaledVector(basis.normal,thickness/2+(includeXL?1:0));if(pose.seat>0)center.lerp(seatedCenter,pose.seat);
  buttonPlate('femur',values,{anchor:center.clone().addScaledVector(normal,-thickness/2-(includeXL?1:0)),normal,long:tangent,includeXL,quaternion:rotation,context:'passing'});hardware.femur.phase=pose.phase;hardware.femur.adjustable=adjustable;hardware.femur.tensionFraction=pose.tension||0;hardware.femur.graftLeadingDistance=lead;hardware.femur.endOn=pose.flip===0;hardware.femur.flipFraction=pose.flip;hardware.femur.surfaceAnchor=[...f.cortex];
  const movingHole=graftInfo.plugs?.femur?.holes?.[0],tip=v(movingHole?.center||graftInfo.ends[0].point),loopMaterial=values.fixation.includes('quadcinch')?M.quad:M.loop;
  const movingAcross=movingHole?v(movingHole.axis):basis.across,movingRadius=movingHole?geometry.femur.plugDiameter/2:Math.min(2,renderDiameter(state.graftDiameter)*.25);
  for(const sign of [-1,1]){const offset=movingAcross.clone().multiplyScalar(sign*movingRadius),points=progress<.999?slicePath(buttonRoute,Math.min(lead,buttonDistance),buttonDistance).reverse():[center.clone(),basis.pos(f.ttl-1),tip.clone()];if(points.length){points[0]=center.clone();points[points.length-1]=tip.clone();for(let i=0;i<points.length;i++)points[i].addScaledVector(offset,i===points.length-1?1:Math.min(1,.85/Math.max(.1,movingRadius)));if(values.fixation.includes('quadcinch'))tape(points,loopMaterial);else tube(points,.28,loopMaterial,28);}}
  if(adjustable&&pose.flip>0){for(const sign of [-1,1])tube([center.clone().addScaledVector(basis.across,sign*.8),center.clone().addScaledVector(basis.normal,10+(pose.tension||0)*12).addScaledVector(basis.across,sign*3),center.clone().addScaledVector(basis.normal,20+(pose.tension||0)*15).addScaledVector(basis.across,sign*5)],.22,loopMaterial,18);}
  if(movingHole){cylinder(tip.clone().addScaledVector(movingAcross,-movingRadius),tip.clone().addScaledVector(movingAcross,movingRadius),.28,loopMaterial);hardware.femur.graftAttachment={kind:'transverse-bone-hole',center:tip.toArray(),holeDiameter:2,fromFemoralTip:geometry.femur.plugLength*.4};}
 }
 function drawXLAttachment(progress){
  const values=evaluation?.sides?.femur||state.femur;if(!values.xl)return;const before=state.femur.xlTiming==='before',basis=before?preparedButtonBasis():frameFor('femur');if(before)drawGraftShape(detachedPath(),'prepared-staged');makeButton('femur',values,basis,{includeXL:true,accessoryOffset:14*(1-progress),plateLift:progress,context:before?'pre-passage-accessory':'post-passage-accessory'});hardware.femur.xlAttachmentProgress=progress;
 }
 function drawTibialTrim(progress){
  const amount=Math.max(0,evaluation.sides.tibia.trimAmount||evaluation.sides.tibia.plannedBoneTrim||0),soft=evaluation.sides.tibia.trimKind==='soft-tissue';makeGraft(1,amount);if(amount<=0)return;
  // Flush trim: the blade lies on the tibial cortex and cuts down the tibia across the graft; the offcut (everything outside the
  // cortex) then slides away down the bone. The retained end is drawn flush with the cortex by makeGraft.
  const plane=tibialCutPlane(),cut=plane.point,stroke=clamp((progress-.1)/.5,0,1),removed=clamp((progress-.62)/.35,0,1),extent=plane.radius/Math.max(.25,plane.cos)+3,motion=plane.down.clone().multiplyScalar(removed*16).addScaledVector(plane.normal,removed*7);
  if(progress<.99){clipPlane={...plane,keep:'outside'};try{
   if(soft){const off=new CenterlineCurve([cut.clone().addScaledVector(plane.dir,-Math.min(amount,plane.reach)-.5),cut.clone().addScaledVector(plane.dir,amount)]);for(const section of graftCrossSections(state.graft,renderDiameter(state.graftDiameter)))sweepSection(off,section,M.graft,16).position.copy(motion);}
   else{const layout=graftInfo?.plugs?.tibia;if(layout)plugMesh(bonePlugLayout({side:'tibia',start:layout.start,axis:layout.axis,transverse:layout.transverse,length:layout.originalLength,diameter:layout.diameter,trim:0,drilled:true})).position.copy(motion);}
  }finally{clipPlane=null;}}
  if(progress>.08&&progress<.66){const depth=soft?5:8,blade=add(new THREE.BoxGeometry(2*plane.radius+(soft?7:10),soft?.25:.35,depth),M.titanium);blade.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(plane.across,plane.normal,plane.down));blade.position.copy(cut).addScaledVector(plane.normal,.3).addScaledVector(plane.down,-extent+2*extent*stroke-depth/2).addScaledVector(plane.across,soft?0:Math.sin(progress*90)*1.5);}
  toolsVisible.push({kind:soft?'Soft-tissue trim':'Bone-block trim',side:'tibia',progress,amount,cutPlane:cut.toArray(),cutNormal:plane.normal.toArray(),stroke:plane.down.toArray(),flush:true,phase:soft?(progress<.6?'trim-projecting-graft':'remove-offcut'):(progress<.62?'trim-projecting-bone':progress<.99?'remove-offcut':'complete')});
 }
 function renderPreview(progress){
  if(!preview)return;preview.progress=progress;workflowView=resolveModelWorkflow(modelWorkflowInput(),preview);const stage=preview.stage,side=stage.startsWith('tibia')||stage.endsWith('tibia')?'tibia':'femur';
  if(!stage.startsWith('fix_')){clearGroup(previewAssembly);renderGroup=previewAssembly;toolsVisible=toolsVisible.filter(tool=>!tool.preview);}const toolStart=toolsVisible.length;
  if(stage.endsWith('_measure'))drawMeasurement(side,progress);
  else if(stage.endsWith('_pin')&&stage!=='linked_pin')drawPin(side,progress);
  else if(stage==='linked_pin'){drawLinkedPin(progress,true);}
  else if(stage==='linked_ream'){drawLinkedReamer(progress);for(const cut of ['tibia','femur'])drawCutBore(cut);}
  else if(stage.endsWith('_ream')){const finalReamer=side!=='femur'||!modelWorkflowInput()?.corticalPassageRequired||stage==='femur_cortex_ream';if(state[side].technique!=='retrograde'&&(progress<1||!finalReamer))drawPin(side,1);setBore(side,progress,true);drawCutBore(side);drawReamer(side,progress);}
  else if(stage==='prep'){drawGraftShape(detachedPath(),'prepared-preview');drawPreparedButton();}
  else if(stage==='pass_femur')drawFemoralPass(progress);
  else if(stage==='xl_femur')drawXLAttachment(progress);
  else if(stage==='pass_tibia')makeGraft(progress);
  else if(stage==='trim_tibia')drawTibialTrim(progress);
  else if(stage.startsWith('fix_')){
   const values=evaluation?.sides?.[side]||state[side],basis=frameFor(side);if(!preview.fixBuilt){renderGroup=previewAssembly;if(['biosteon','wedge'].includes(values.fixation))makeScrew(side,values,basis);else makeButton(side,values,basis);preview.fixBuilt=true;}
   const approach=values.fixation==='biosteon'||values.fixation==='wedge'?basis.axis.clone().multiplyScalar(side==='tibia'?1:-1):basis.normal;previewAssembly.position.copy(approach).multiplyScalar(['biosteon','wedge'].includes(values.fixation)?18*(1-progress):0);if(hardware[side])hardware[side].displayCenter=v(hardware[side].center).add(previewAssembly.position).toArray();
  }
  for(let i=toolStart;i<toolsVisible.length;i++)toolsVisible[i].preview=true;renderGroup=assembly;componentSnapshot.previewStage=stage;componentSnapshot.previewProgress=progress;componentSnapshot.previewComponents=stage==='trim_tibia'?['bone-trim']:stage==='prep'?['prepared-graft']:stage.startsWith('pass_')?['graft']:stage.startsWith('fix_')||stage==='xl_femur'?['fixation']:stage.endsWith('_ream')?['reamer','progressive-bore']:stage.endsWith('_pin')?['guide-pin']:['measurement'];componentSnapshot.bare=false;safeguardNotice.hidden=(!graftInfo&&!['femur','tibia'].some(side=>workflowView[side].measured))||geometry.displaySafeguards.length===0;drawOverlay();
 }
 function cancelAnimation(restore=true){if(animation?.resolve)animation.resolve({cancelled:true,stage:animation.stage});animation=null;preview=null;clearGroup(previewAssembly);if(restore&&state){rebuildScene();drawOverlay();}}
 function recommendedStepDuration(stage=options.workflow?.stage||'plan'){const side=stage.startsWith('tibia')||stage.endsWith('tibia')?'tibia':'femur';return stageDuration(stage,state?.[side]?.technique);}
 function animateStep({duration=recommendedStepDuration()}={}){
  if(disposed||!state||!options.workflow?.active)return Promise.resolve({skipped:true});cancelAnimation(false);const stage=options.workflow.stage;if(stage==='plan'||stage==='harvest'||stage==='review')return Promise.resolve({skipped:true,stage});preview={stage,progress:0,fixBuilt:false};rebuildScene();renderPreview(0);
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;if(reduced||duration<=0){renderPreview(1);return Promise.resolve({cancelled:false,stage,reducedMotion:!!reduced});}
  return new Promise(resolve=>{animation={stage,start:performance.now(),duration:clamp(Number(duration)||2300,300,12000),resolve};});
 }
 function update(nextState,nextEvaluation,viewSettings={}){
  if(disposed)return;cancelAnimation(false);state=nextState;evaluation=nextEvaluation;options={...options,...viewSettings};geometry=constructGeometry(reference,state,evaluation);geometry.displaySafeguards??=[];const enteredGraftLength=Number(state.graftLength),illustratedGraftLength=clamp(enteredGraftLength||.2,.2,600);if(Math.abs(enteredGraftLength-illustratedGraftLength)>.00001)geometry.displaySafeguards.push({field:'graftLength',entered:enteredGraftLength,rendered:illustratedGraftLength,reason:'Finite display safeguard; entered prepared length retained'});
  safeguardNotice.hidden=geometry.displaySafeguards.length===0;safeguardNotice.textContent=geometry.displaySafeguards.length?'Illustration limited · entered measurements retained':'';safeguardNotice.title=geometry.displaySafeguards.map(x=>`${x.field}: entered ${x.entered}, illustrated ${x.rendered.toFixed(1)} mm`).join('\n');
  for(const mesh of boneMeshes){const transform=geometry[mesh.userData.side],a=transform.matrix,t=transform.translation;mesh.matrixAutoUpdate=false;mesh.matrix.set(a[0][0],a[0][1],a[0][2],t[0],a[1][0],a[1][1],a[1][2],t[1],a[2][0],a[2][1],a[2][2],t[2],0,0,0,1);mesh.matrixWorldNeedsUpdate=true;mesh.material.opacity=clamp(Number(options.opacity)||.64,.08,1);mesh.material.depthWrite=options.opacity>.93;}
  rebuildScene();rebuildMeasurementGuide();drawOverlay();
 }

 async function captureFinalImage({final=false,width,height}={}){
  if(disposed||!state||!geometry)throw Error('The model is not ready to capture.');
  const savedOptions=options,savedPreview=preview?{...preview}:null,savedAnimation=animation,started=performance.now();let pending;animation=null;
  // Report framing: always the Straight on view at its default framing, as a 3:2 image laid out like a desktop viewer
  // (900 × 600 CSS px) — never the viewer's last angle or zoom. Labels keep a readable size even when the case was built on a phone.
  const RW=900,RH=600,frame={wupp:worldUnitsPerPixel,left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom,ratio:renderer.getPixelRatio?renderer.getPixelRatio():1,w:viewportSize().width,h:viewportSize().height,view:camera.view?.enabled?{...camera.view}:null,position:camera.position.clone(),quaternion:camera.quaternion.clone(),up:camera.up.clone(),zoom:camera.zoom,target:orbit.target.clone()};
  try{
   const wupp=Math.max(160/RH,170/RW),target=targetFor('anterior');captureViewport={width:RW,height:RH};worldUnitsPerPixel=wupp;
   camera.clearViewOffset();camera.left=-wupp*RW/2;camera.right=wupp*RW/2;camera.top=wupp*RH/2;camera.bottom=-wupp*RH/2;
   camera.up.copy(PREP_UP);camera.position.copy(target).add(v(VIEW_OFFSETS.anterior));camera.lookAt(target);camera.zoom=1;camera.updateProjectionMatrix();camera.updateMatrixWorld();
   if(renderer.setSize){renderer.setPixelRatio(2);renderer.setSize(RW,RH,false);}if(svg.setAttribute)svg.setAttribute('viewBox',`0 0 ${RW} ${RH}`);
   preview=null;const completed=['plan','prep','femur_measure','femur_ream','tibia_measure','tibia_ream','pass_femur','pass_tibia','fix_femur','fix_tibia'];if(geometry.linked?.enabled)completed.push('linked_pin','linked_ream');if(modelWorkflowInput()?.corticalPassageRequired)completed.push('femur_cortex_ream');if(state.femur.xl)completed.push('xl_femur');if((evaluation.sides.tibia.trimAmount||0)>0)completed.push('trim_tibia');
   options={...options,measurementGuide:null,labels:true,workflow:final?{...(options.workflow||{}),active:true,stage:'review',completed,graftPrepared:true}:options.workflow};rebuildScene();rebuildMeasurementGuide();drawOverlay();renderer.render(scene,camera);
   const aspect=viewportSize().width/viewportSize().height,scale=Math.min(width?width/renderer.domElement.width:Infinity,height?height/renderer.domElement.height:Infinity),w=Number.isFinite(scale)?renderer.domElement.width*scale:renderer.domElement.width,h=w/aspect;
   pending=composeViewerImage({canvas:renderer.domElement,svg,width:w,height:h});
  }finally{captureViewport=null;worldUnitsPerPixel=frame.wupp;camera.up.copy(frame.up);camera.position.copy(frame.position);camera.quaternion.copy(frame.quaternion);camera.zoom=frame.zoom;orbit.target.copy(frame.target);camera.left=frame.left;camera.right=frame.right;camera.top=frame.top;camera.bottom=frame.bottom;if(frame.view)camera.setViewOffset(frame.view.fullWidth,frame.view.fullHeight,frame.view.offsetX,frame.view.offsetY,frame.view.width,frame.view.height);else camera.clearViewOffset();camera.updateProjectionMatrix();camera.updateMatrixWorld();if(renderer.setSize){renderer.setPixelRatio(frame.ratio);renderer.setSize(frame.w,frame.h,false);}if(svg.setAttribute)svg.setAttribute('viewBox',`0 0 ${frame.w} ${frame.h}`);
   options=savedOptions;preview=savedPreview;rebuildScene();rebuildMeasurementGuide();if(savedPreview)renderPreview(savedPreview.progress);animation=savedAnimation;if(animation)animation.start+=performance.now()-started;drawOverlay();renderer.render(scene,camera);}
  return {...await pending,final:!!final};
 }
 function setOptions(next){const previous=options;options={...options,...next};if(!state)return;
  if(['cutaway','workflow','measurementGuide'].some(key=>previous[key]!==options[key])){update(state,evaluation,options);return;}
  if(previous.opacity!==options.opacity)for(const mesh of boneMeshes){mesh.material.opacity=clamp(Number(options.opacity)||.64,.08,1);mesh.material.depthWrite=options.opacity>.93;}
  drawOverlay();
 }
 function targetFor(which){
  if(!geometry)return v(reference.femur.cortex).addScaledVector(v(reference.femur.direction),-20);
  if(which==='anterior')return new THREE.Vector3(0,0,geometry.femur.entry[2]);
  if(which==='tibia')return v(geometry.tibia.entry).lerp(v(geometry.tibia.cortex),.5);
  if(which==='side')return v(geometry.femur.entry).lerp(v(geometry.tibia.entry),.5);
  const side=options.activeSide==='tibia'?'tibia':'femur';return v(geometry[side].entry).lerp(v(geometry[side].cortex),.5);
 }
 // Orbit frame per view: Straight on uses its own screen-up (anterior) as the orbit axis, so a horizontal drag spins the
 // knee left/right and a vertical drag tilts it at most STRAIGHT_TILT either way. Every other view orbits freely about +Y.
 function orbitFrame(name){
  const straight=name==='anterior';camera.up.copy(straight?PREP_UP:Y);
  orbit._quat.setFromUnitVectors(camera.up,Y);orbit._quatInverse.copy(orbit._quat).invert();orbit._sphericalDelta?.set(0,0,0);
  orbit.minPolarAngle=straight?Math.PI/2-STRAIGHT_TILT:0;orbit.maxPolarAngle=straight?Math.PI/2+STRAIGHT_TILT:Math.PI;
 }
 function setView(name='anterior'){
  if(disposed)return;const damping=orbit.enableDamping;orbit.enableDamping=false;orbit.update();view=Object.hasOwn(VIEW_OFFSETS,name)?name:'anterior';
  // Camera zoom is retained when switching presets.
  orbitFrame(view);orbit.target.copy(targetFor(view));camera.position.copy(orbit.target).add(v(VIEW_OFFSETS[view]));camera.lookAt(orbit.target);
  orbit.update();orbit.enableDamping=damping;camera.updateProjectionMatrix();
 }
 function zoomBy(factor){camera.zoom=clamp(camera.zoom*factor,orbit.minZoom,orbit.maxZoom);camera.updateProjectionMatrix();}
 function resetZoom(){camera.zoom=1;camera.updateProjectionMatrix();}
 function reset(){setView('anterior');}
 // The page may cover parts of the viewer (header, bottom sheet, side panel): insets name those edges in CSS px. The knee is
 // centred in the free rectangle through a camera view offset, so zoom stays about the target and labels dock inside it.
 function frameRect(){const {width:w,height:h}=viewportSize();if(captureViewport)return {l:0,t:0,r:w,b:h,w,h};const l=clamp(insets.left||0,0,w*.7),r=w-clamp(insets.right||0,0,w*.7),t=clamp(insets.top||0,0,h*.75),b=Math.max(t+1,h-clamp(insets.bottom||0,0,h*.75));return {l,t,r:Math.max(l+1,r),b,w:Math.max(1,r-l),h:Math.max(1,b-t)};}
 function applyFrustum(){const w=viewportSize().width,h=viewportSize().height,f=frameRect(),dx=(f.l+f.r)/2-w/2,dy=(f.t+f.b)/2-h/2,fw=w+2*Math.abs(dx),fh=h+2*Math.abs(dy);
  camera.left=-worldUnitsPerPixel*fw/2;camera.right=worldUnitsPerPixel*fw/2;camera.top=worldUnitsPerPixel*fh/2;camera.bottom=-worldUnitsPerPixel*fh/2;
  if(captureViewport||Math.abs(dx)<.5&&Math.abs(dy)<.5)camera.clearViewOffset();else camera.setViewOffset(fw,fh,Math.abs(dx)-dx,Math.abs(dy)-dy,w,h);
  orbit.panSpeed=2/(fw/w+fh/h);camera.updateProjectionMatrix();}
 // The knee's scale (world units per CSS px) is fitted to the free rectangle when the viewer first appears and whenever its
 // width changes (rotation, window resize); height-only changes (keyboard, browser bars) and inset changes only re-centre it.
 let fitWidth=0,fitPending=false,fitInsets=null;
 const insetsOf=next=>({top:+next?.top||0,right:+next?.right||0,bottom:+next?.bottom||0,left:+next?.left||0});
 // the scale is fitted to the fit insets (the page's resting layout, e.g. the peeking sheet) — never to less than 120 px
 function fitScale(){const saved=insets;if(fitInsets)insets=fitInsets;const f=frameRect();insets=saved;worldUnitsPerPixel=Math.max(160/Math.max(120,f.h),170/Math.max(120,f.w));}
 function placeNotice(){const f=frameRect(),h=viewportSize().height;safeguardNotice.style.maxWidth=f.w<570?'190px':'220px';safeguardNotice.style.left=(f.l+10)+'px';safeguardNotice.style.top=f.h<350?'auto':(f.t+10)+'px';safeguardNotice.style.bottom=f.h<350?(h-f.b+86)+'px':'auto';}
 function resize(){const w=viewportSize().width,h=viewportSize().height;if(w<1||h<1)return;dirty=true;renderer.setSize(w,h,false);const first=worldUnitsPerPixel==null;if(first||Math.abs(w-fitWidth)>1){fitWidth=w;fitScale();fitPending=!first;}applyFrustum();svg.setAttribute('viewBox',`0 0 ${w} ${h}`);placeNotice();}
 // a width change refits the scale once the page reports its new layout (the next setInsets), not with the old insets
 function setInsets(next={},fit=null){const n=insetsOf(next);if(fit)fitInsets=insetsOf(fit);if(!fitPending&&['top','right','bottom','left'].every(k=>Math.abs(n[k]-insets[k])<.5))return;insets=n;if(worldUnitsPerPixel==null)return;if(fitPending){fitPending=false;fitScale();}applyFrustum();placeNotice();}
 function getSnapshot(){return {ready:!!geometry,view,measurementGuide:measurementGuide?structuredClone(measurementGuide):null,orientation:{enabled:!!options.orientation,landmarks:orientationLandmarks},activeSide:options.activeSide,workflow:workflowView,components:componentSnapshot,instruments:toolsVisible,graft:graftInfo,animationRunning:!!animation,bores:Object.fromEntries(Object.entries(boreUniforms).map(([side,u])=>[side,{enabled:u.boreEnabled.value>0,socketStart:u.socketStart.value,socketEnd:u.socket.value,shaftStart:u.shaftStart.value,shaftEnd:u.shaftEnd.value,radius:u.radius.value,shaftRadius:u.shaftRadius.value,pilotRadius:u.pilotRadius.value}])),displaySafeguards:geometry?JSON.parse(JSON.stringify(geometry.displaySafeguards)):[],anatomyWarnings:geometry?.anatomyWarnings||[],geometry:geometry?JSON.parse(JSON.stringify(geometry)):null,hardware:JSON.parse(JSON.stringify(hardware)),graftDiameter:state?renderDiameter(state.graftDiameter):null,reference:JSON.parse(JSON.stringify(reference)),camera:{position:camera.position.toArray(),target:orbit.target.toArray(),zoom:camera.zoom,worldUnitsPerPixel,visibleHeight:(camera.top-camera.bottom)/camera.zoom},bones:boneMeshes.map(m=>({name:m.name,axialScale:1,transverseScale:1,opacity:m.material.opacity,matrix:m.matrix.toArray(),dimensions:geometry?.[m.userData.side]?.boneDimensions})),insets:{...insets},frame:frameRect(),cameraUp:camera.up.toArray(),limitations:'Fixed adult atlas anatomy at a 90 degree reference pose. Tunnel directions change around reference ACL apertures to match entered lengths where a surface-bound cortical path exists. Unattainable lengths show the nearest sampled reference path separately. Screw interference, graft deformation, cortical blowout depth and unverified implant details are schematic, not patient-specific surgical planning.'};}

 const escape=text=>String(text).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const project=point=>{const p=v(point).project(camera);return {x:(p.x*.5+.5)*viewportSize().width,y:(-.5*p.y+.5)*viewportSize().height};};
 const xy=p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`;
 const line=(a,b,color,width=1.3,dash='')=>`<path d="M${xy(a)} L${xy(b)}" fill="none" stroke="${color}" stroke-width="${width}"${dash?` stroke-dasharray="${dash}"`:''}/>`;
 const marker=(p,color,r=3)=>`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${r}" fill="${color}" stroke="#102631" stroke-width="1.4"/>`;
 let overlayRects=[];
 // Labels follow the Case Labs / Portfolio Map style: a black box with a white hairline and bold white text; a 3 px bar in the
 // measurement's color ties the label to its dimension line.
 const LABEL_FONT="-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,system-ui,sans-serif";let textMeasure=null;
 function textWidth(text,size=12){try{textMeasure??=document.createElement('canvas').getContext('2d');textMeasure.font=`700 ${size}px ${LABEL_FONT}`;const w=textMeasure.measureText(text).width;if(w>0)return w;}catch{}return String(text).length*size*.56;}
 function pill(text,p,color){const f=frameRect(),width=Math.min(f.w-16,Math.ceil(textWidth(text))+26),x=clamp(p.x,f.l+width/2+8,f.r-width/2-8),y=clamp(p.y,f.t+22,f.b-22);overlayRects.push({x:x-width/2,y:y-13,w:width,h:26});return `<g transform="translate(${(x-width/2).toFixed(2)},${(y-13).toFixed(2)})"><rect width="${width}" height="26" rx="2" fill="#080808" fill-opacity=".86" stroke="#ffffff" stroke-opacity=".85"/><rect x="1.5" y="1.5" width="3" height="23" fill="${color}"/><text x="${(width+4)/2}" y="17.2" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="700" font-family="${LABEL_FONT}">${escape(text)}</text></g>`;}
 // 10 mm scale bar at the lower left of the free rectangle
 function scaleBar(f,short,ticks=false){const y=short?f.b-42:f.b-76,length=10/(worldUnitsPerPixel||1)*camera.zoom,a={x:f.l+24,y},b={x:f.l+24+length,y};return line(a,b,'#cbdee7',2)+(ticks?line({x:a.x,y:y-3},{x:a.x,y:y+3},'#cbdee7',2)+line({x:b.x,y:y-3},{x:b.x,y:y+3},'#cbdee7',2):'')+`<text x="${(a.x+length/2).toFixed(2)}" y="${y-7}" fill="#c8dde5" font-size="11" text-anchor="middle">10 mm</text>`;}
 function arrow(a,b,color){const dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1,u={x:dx/l,y:dy/l},n={x:-u.y,y:u.x};return `<path d="M${xy({x:a.x+u.x*5+n.x*2.4,y:a.y+u.y*5+n.y*2.4})} L${xy(a)} L${xy({x:a.x+u.x*5-n.x*2.4,y:a.y+u.y*5-n.y*2.4})}" fill="none" stroke="${color}" stroke-width="1.5"/>`;}
 function dimension(a,b,text,color,offset,dock){const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,n={x:-dy/len,y:dx/len},A={x:a.x+n.x*offset,y:a.y+n.y*offset},B={x:b.x+n.x*offset,y:b.y+n.y*offset},mid={x:(A.x+B.x)/2,y:(A.y+B.y)/2};return line(a,A,color,1,'2 3')+line(b,B,color,1,'2 3')+line(A,B,color,1.8)+arrow(A,B,color)+arrow(B,A,color)+marker(a,color)+marker(b,color)+line(mid,dock,color,1)+pill(text,dock,color);}
 function orientationOverlay(){
  if(!options.orientation||!geometry)return '';const f=frameRect(),small=f.w<570,placed=[];let out='';
  // Each badge sits beside its own projected landmark, pushed outward along that landmark's direction, so the
  // leaders stay short and follow the knee as it rotates. The words are spelled out on every screen size.
  const top=f.t+(small?60:62),bottom=f.b-(small?58:62);
  for(const landmark of orientationLandmarks){
   const point=v(landmark.point).add(v(geometry.femur.translation)),anchor=project(point.toArray()),outward=project(point.clone().add(v(landmark.offset)).toArray());
   let dx=outward.x-anchor.x,dy=outward.y-anchor.y,l=Math.hypot(dx,dy);if(l<.5){dx=0;dy=-1;l=1;}dx/=l;dy/=l;
   const text=landmark.label,width=Math.ceil(textWidth(text,11.5))+16,reach=Math.max(26,width/2+10);
   const want={x:anchor.x+dx*reach,y:anchor.y+dy*reach},inside=b=>({x:clamp(b.x,f.l+width/2+6,f.r-width/2-6),y:clamp(b.y,top,bottom)});
   // how much a badge at b would cover the labels (and badges) already placed, in px²
   const cover=b=>{const L=b.x-width/2-3,R=b.x+width/2+3,T=b.y-14,B=b.y+14;let a=0;for(const r of overlayRects)a+=Math.max(0,Math.min(R,r.x+r.w)-Math.max(L,r.x))*Math.max(0,Math.min(B,r.y+r.h)-Math.max(T,r.y));for(const o of placed)a+=Math.max(0,(o.width+width)/2+4-Math.abs(o.x-b.x))*Math.max(0,24-Math.abs(o.y-b.y));return a;};
   // the free spot nearest the preferred one (further out along the landmark's direction, up/down, up to two badge-widths
   // across); if every spot touches a label, the one that covers the least
   let label=inside(want),least=cover(label),dist=0;
   if(least>0)for(let step=0;step<=6;step++)for(let k=0;k<=14;k++)for(const ox of [0,-(width+10),width+10,-2*(width+10),2*(width+10)]){const oy=(k%2?1:-1)*Math.ceil(k/2)*24,c=inside({x:want.x+dx*14*step+ox,y:want.y+dy*14*step+oy}),a=cover(c),d=Math.hypot(c.x-want.x,c.y-want.y);if(a<least-.5||(Math.abs(a-least)<=.5&&d<dist)){least=a;dist=d;label=c;}}
   placed.push({...label,width});
   out+=line(anchor,label,'#b3c9d2',1,'2 3')+marker(anchor,'#b3c9d2',2)+`<g transform="translate(${(label.x-width/2).toFixed(2)},${(label.y-11).toFixed(2)})"><rect width="${width}" height="22" rx="2" fill="#080808" fill-opacity=".8" stroke="#ffffff" stroke-opacity=".7"/><text x="${width/2}" y="15.5" text-anchor="middle" fill="#ffffff" font-family="${LABEL_FONT}" font-size="11.5" font-weight="700">${text}</text></g>`;
  }
  return out;
 }
 function workflowOverlay(){
  const f=frameRect(),short=f.h<350,compact=f.w<570,dock=short?{x:f.r-12,y:f.t+70,gap:28}:compact?{x:f.r-12,y:f.t+72,gap:37}:{x:f.r-12,y:f.t+83,gap:43};overlayRects=[];let out='',row=0;
  const activeStage=workflowView.previewStage||workflowView.stage,side=activeStage.startsWith('tibia')||activeStage.endsWith('tibia')?'tibia':activeStage.startsWith('femur')||activeStage.endsWith('femur')?'femur':options.activeSide==='tibia'?'tibia':'femur',g=geometry[side],flags=workflowView[side],a=project(g.entry),c=project(g.cortex),socket=project(g.socket),tip=project(g.graftTip);
  const place=()=>({x:dock.x,y:dock.y+row++*dock.gap});
  if(graftInfo?.kind.startsWith('prepared')&&graftInfo.kind!=='prepared-staged'){const start=project(graftInfo.ends[0].point),end=project(graftInfo.ends[1].point);out+=dimension(start,end,`Prepared graft ${fmt(graftInfo.preparedLength)} mm`,'#f3c770',12,place());const appearanceLabel=compact?({folded:'Folded · two strands',rapidease:'RapidEase · four strands',quad:'Quad tendon ribbon',btb:'BTB · two blocks',qtb:'Quad · one block'}[graftInfo.family]||graftInfo.appearance):graftInfo.appearance;if(graftInfo.family==='btb'){for(const [point,label] of [[start,'Femoral side'],[end,'Tibial side']]){const dockPoint=place();out+=line(point,dockPoint,'#8cdcc5')+marker(point,'#8cdcc5')+pill(label,dockPoint,'#8cdcc5');}}else out+=pill(appearanceLabel,place(),'#8cdcc5');}
  if(flags.measured||flags.measuring){const gauge=toolsVisible.findLast(tool=>tool.side===side&&tool.kind==='Outside-in depth gauge');if(gauge){const label=place(),point=project(gauge.pinTip),text=gauge.readingAtPinTip?`Pin-tip reading ${fmt(g.ttl)} mm`:'Gauge over lateral pin';out+=line(point,label,'#e1edf2')+marker(point,'#e1edf2')+pill(text,label,'#e1edf2');}else {const measured=flags.measuring?workflowView.progress*g.ttl:g.ttl,end=flags.measuring?project(v(g.entry).addScaledVector(v(g.direction),measured).toArray()):c;out+=dimension(a,end,g.supported?`Tunnel ${fmt(measured)} mm`:`Shown ${fmt(measured)} mm (entered ${fmt(g.requestedTTL)})`,g.supported?'#e1edf2':'#f3b86e',-22,place());}}
  if(flags.cortexReaming){out+=pill('Cortical reamer 4.5 mm',place(),'#6adeee');}
  else if(flags.reamed){out+=dimension(a,socket,`${geometry.linked?.enabled?'Full tunnel':'Socket'} ${fmt(g.socketDepth)} mm`,'#6adeee',18,place());}
  else if(flags.reaming){const tool=toolsVisible.findLast(t=>t.side===side&&t.kind.includes('Reamer')||t.side===side&&t.kind.includes('reamer'));if(tool)out+=pill(`${tool.retrograde?'RetroReamer':'Reamer'} ${fmt(tool.headDiameter)} mm`,place(),'#6adeee');else if(workflowView.progress>=.999)out+=dimension(a,socket,`${geometry.linked?.enabled?'Full tunnel':'Socket'} ${fmt(g.socketDepth)} mm`,'#6adeee',18,place());}
  if(flags.passed&&!flags.passing&&row<(short?3:4))out+=dimension(a,side==='tibia'&&graftInfo?.trimAmount?project(graftInfo.ends[1].point):tip,`${side==='tibia'&&graftInfo?.trimAmount?'Retained end':'Graft target'} ${fmt(g.graftInsertion-(side==='tibia'?graftInfo?.trimAmount||0:0))} mm`,'#f3c770',7,place());
  const hw=hardware[side];if(hw&&(flags.fixed||flags.fixing||hw.context==='prepared'||side==='femur'&&flags.passed||workflowView.previewStage==='pass_femur'||workflowView.previewStage==='xl_femur')){const label=place(),color=hw.invalid?'#ff7777':'#7ce0c1',point=project(hw.displayCenter||hw.center),text=(hw.kind.includes('screw')?`Screw ${fmt(hw.diameter)} × ${fmt(hw.length)} mm`:`Button ${fmt(hw.length)} × ${fmt(hw.width)} mm${hw.xl?' · XL':''}`)+(hw.invalid?' !':'');out+=line(point,label,color)+marker(point,color)+pill(text,label,color);}
  else if((flags.pin||flags.pinning)&&activeStage!=='linked_pin'&&toolsVisible.some(tool=>/guide pin/i.test(tool.kind)&&(tool.side===side||tool.side==='linked'))){out+=pill(state[side].technique==='flexible'?'Flexible pin · 2.4 mm tip':side==='femur'&&state.femur.technique==='low_profile'?'Straight pin · 2.4 mm':'Guide pin 2.4 mm',place(),'#dce7ed');}
  if(graftInfo?.kind==='passage'||flags.passing){const phrase=workflowView.route==='all_inside'?'AM / medial portal passage':'Through-tibia graft passage';if(row<(short?4:5))out+=pill(phrase,place(),'#f3c770');}
  if(graftInfo?.shortfall>.1&&!(workflowView.previewStage?.startsWith('pass_')&&workflowView.progress<1)&&row<(short?4:6))out+=pill(`Graft ${fmt(graftInfo.shortfall)} mm short`,place(),'#ff8880');
  if(['linked_pin','linked_ream'].includes(activeStage)&&row<(short?4:5))out+=pill(activeStage==='linked_pin'?'One straight pin · 2.4 mm':`Shared reamer ${fmt(geometry.tibia.socketDiameter)} mm`,place(),'#b7c9d2');
  const hasVisible=out.length>0||componentSnapshot.placedGraft||componentSnapshot.preparedGraft;
  if(hasVisible)out+=scaleBar(f,short);
  svg.innerHTML=orientationOverlay()+out;
 }
 function measurementOverlay(){
  const f=frameRect(),compact=f.w<570,color=measurementGuide.color,dock={x:f.r-12,y:f.t+(f.h<300?64:76)},gap=f.h<300?29:35;let out='',row=0;
  for(const part of measurementGuide.parts){const name=part.side==='femur'?'Femoral':'Tibial',a=project(part.start),b=project(part.end),center=v(part.end),axis=v(part.axis);let start=a,end=b;
   if(part.kind==='diameter'){const radial=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);radial.addScaledVector(axis,-radial.dot(axis)).normalize();if(radial.length()<.1)radial.copy(axis).cross(Y).normalize();start=project(center.clone().addScaledVector(radial,-part.diameter/2).toArray());end=project(center.clone().addScaledVector(radial,part.diameter/2).toArray());}
   const quantity=measurementGuide.field==='ttl'?'tunnel':measurementGuide.field==='socket'?'depth':measurementGuide.field==='aperture'?'opening':'diameter',label=`${name} ${quantity} ${fmt(part.entered)} mm`,place={x:dock.x,y:dock.y+row++*gap};out+=dimension(start,end,label,color,part.kind==='diameter'?0:18,place);
   if(Math.abs(part.entered-part.represented)>.1)out+=pill(`Shown ${fmt(part.represented)} mm`,{x:dock.x,y:dock.y+row++*gap},'#f3b86e');
  }
  out+=pill(measurementGuide.invalid?'Adjusting · check fit':'Adjusting measurement',{x:f.l,y:f.b-(f.h<300?66:76)},color);svg.innerHTML=out;
 }
 function drawOverlay(){
  overlayRects=[];if(!geometry){svg.innerHTML='';return;}if(measurementGuide){measurementOverlay();return;}if(!options.labels){svg.innerHTML=orientationOverlay();return;}
  if(workflowView.active){workflowOverlay();return;}
  const w=viewportSize().width,h=viewportSize().height;if(w<1||h<1)return;const f=frameRect();
  const side=options.activeSide==='tibia'?'tibia':'femur',g=geometry[side],values=evaluation?.sides?.[side]||state[side],a=project(g.entry),c=project(g.cortex),s=project(g.socket),tip=project(g.graftTip),compact=f.w<570,short=f.h<350;
  const dock=short?{x:f.r-12,y:f.t+70,gap:28}:compact?{x:f.r-12,y:f.t+72,gap:37}:{x:f.r-12,y:f.t+83,gap:43};
  let out='';
  out+=dimension(a,c,g.supported?`${side==='femur'?'Femoral':'Tibial'} tunnel ${fmt(g.ttl)} mm`:`Shown ${fmt(g.ttl)} mm (entered ${fmt(g.requestedTTL)})`,g.supported?'#e1edf2':'#f3b86e',-24,{x:dock.x,y:dock.y});
  out+=dimension(a,s,`${geometry.linked?.enabled?'Full tunnel':'Socket'} ${fmt(g.socketDepth)} mm`,'#6adeee',18,{x:dock.x,y:dock.y+dock.gap});
  const representedBridge=g.ttl-g.socketDepth;
  if(short&&representedBridge<0)out+=dimension(s,c,`Overrun ${fmt(-representedBridge)} mm`,'#ff9884',34,{x:dock.x,y:dock.y+2*dock.gap});
  else out+=dimension(a,tip,`${g.bonePlug?'Plug end':'Graft'} ${fmt(values.graftInsertion)} mm`,'#f3c770',7,{x:dock.x,y:dock.y+2*dock.gap});
  if(!short)out+=dimension(s,c,`${representedBridge<0?'Overrun':'Remaining'} ${fmt(Math.abs(representedBridge))} mm`,representedBridge<0?'#ff9884':'#b6b8ee',34,{x:dock.x,y:dock.y+3*dock.gap});
  if(hardware[side]){const hw=hardware[side],anchor=project(hw.center),label={x:dock.x,y:dock.y+(short?3:4)*dock.gap},text=(hw.kind.includes('screw')?`Screw ${fmt(hw.diameter)} × ${fmt(hw.length)} mm`:`Button ${fmt(hw.length)} × ${fmt(hw.width)} mm${hw.xl?' · XL':''}`)+(hw.invalid?' !':''),color=hw.invalid?'#ff7777':'#7ce0c1';out+=line(anchor,label,color)+marker(anchor,color)+pill(text,label,color);
   if(hw.invalid&&f.h>=250){const reason=hw.kind.includes('screw')&&hw.protrusion>0?`${fmt(hw.protrusion)} mm beyond tunnel`:hw.projection>=g.apertureDiameter&&hw.projection>0?`Projection ${fmt(hw.projection)} ≥ opening ${fmt(g.apertureDiameter)}`:'Incompatible fixation';out+=pill(reason,{x:dock.x,y:label.y+25},color);}
  }
  const other=side==='femur'?'tibia':'femur',oa=project(geometry[other].entry),oc=project(geometry[other].cortex);
  out+=marker(oa,'#7fb8c7',3)+marker(oc,'#7fb8c7',3);
  const jointA=project(geometry.femur.entry),jointB=project(geometry.tibia.entry),mid={x:(jointA.x+jointB.x)/2,y:(jointA.y+jointB.y)/2};
  const jointDock={x:Math.max(f.l+86,Math.min(f.l+f.w*.30,mid.x-75)),y:f.b-53};out+=line(jointA,jointB,'#e0b866',1,'3 4');if(!short)out+=line(mid,jointDock,'#e0b866',1)+pill(Math.abs(geometry.jointSpan-state.jointSpan)>.05?`Joint span shown ${fmt(geometry.jointSpan)} mm`:`Joint span ${fmt(geometry.jointSpan)} mm`,jointDock,'#e0b866');
  out+=scaleBar(f,short,true);
  svg.innerHTML=orientationOverlay()+out;
 }
 const observer=new ResizeObserver(resize);observer.observe(container);resize();setView('anterior');
 const onChange=()=>{dirty=true;};orbit.addEventListener('change',onChange);
 Object.defineProperty(window,'aclGeometry',{configurable:true,get:()=>geometry?getSnapshot():null,set:()=>{}});
 // Render on demand: orbit motion (incl. damping), previews, resizes and API calls mark the frame dirty; an idle
 // viewer does no WebGL or overlay work (battery on phones).
 function render(){if(disposed)return;frame=requestAnimationFrame(render);if(animation){const active=animation,now=performance.now(),p=clamp((now-active.start)/active.duration,0,1);if(now-lastPreviewFrame>32||p>=1){lastPreviewFrame=now;renderPreview(p);dirty=true;}if(p>=1){animation=null;active.resolve({cancelled:false,stage:active.stage});}}if(orbit.update())dirty=true;if(!dirty)return;dirty=false;renderer.render(scene,camera);drawOverlay();}render();
 function dispose(){cancelAnimation(false);disposed=true;cancelAnimationFrame(frame);observer.disconnect();orbit.removeEventListener('change',onChange);orbit.dispose();clearAssembly();clearGroup(measurementAssembly);for(const mesh of boneMeshes){mesh.geometry.dispose();mesh.material.dispose();}for(const base of plugCache.values())base.dispose();for(const material of Object.values(M))material.dispose();renderer.dispose();renderer.domElement.remove();svg.remove();safeguardNotice.remove();try{delete window.aclGeometry;}catch{}}
 const touch=fn=>(...args)=>{const result=fn(...args);dirty=true;return result;};
 return {update:touch(update),setView:touch(setView),setInsets:touch(setInsets),setOptions:touch(setOptions),setMeasurementGuide:touch(setMeasurementGuide),reset:touch(reset),zoomBy:touch(zoomBy),resetZoom:touch(resetZoom),getSnapshot,recommendedStepDuration,animateStep:touch(animateStep),cancelAnimation:touch(cancelAnimation),captureFinalImage:async options=>{try{return await captureFinalImage(options);}finally{dirty=true;}},dispose};
}
