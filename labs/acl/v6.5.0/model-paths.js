import * as THREE from '../lib/three.module.js';
const v=a=>new THREE.Vector3(...a);
export function anteriorPortal(femoralEntry,tibialEntry){return [femoralEntry[0]-12,Math.min(femoralEntry[1],tibialEntry[1])-33,femoralEntry[2]-8];}
export function anteriorApproach({entry,direction,tibialEntry,extension=48}){
 const end=v(entry),portal=v(anteriorPortal(entry,tibialEntry)),start=portal.clone().add(new THREE.Vector3(0,-extension,-8));
 return new THREE.CubicBezierCurve3(start,portal,end.clone().addScaledVector(v(direction),-18),end).getPoints(60).map(p=>p.toArray());
}
const length=points=>points.slice(1).reduce((sum,p,i)=>sum+p.distanceTo(points[i]),0);
// Rigid plugs meet the tendon at exact common endpoints while the intervening
// soft segment changes curvature. It never stretches to bridge a loose block.
export function connectedSoftPath(points,start,end,targetLength){
 const a=v(start),b=v(end),target=Math.max(0,targetLength),input=points.map(v);if(input.length<3)input.splice(1,0,a.clone().lerp(b,.5));input[0]=a;input[input.length-1]=b;
 const original=input.map(p=>p.clone()),straight=original.map((p,i)=>a.clone().lerp(b,i/(original.length-1))),chord=a.distanceTo(b);let result=original;
 if(chord<=target+1e-7){
  if(length(result)>target){let lo=0,hi=1;for(let i=0;i<42;i++){const t=(lo+hi)/2,trial=straight.map((p,j)=>p.clone().lerp(original[j],t));if(length(trial)<target)lo=t;else hi=t;}result=straight.map((p,j)=>p.clone().lerp(original[j],(lo+hi)/2));}
  else if(length(result)<target-1e-7){const axis=b.clone().sub(a).normalize(),bend=new THREE.Vector3(0,-1,-.2).addScaledVector(axis,-new THREE.Vector3(0,-1,-.2).dot(axis)).normalize();if(bend.length()<.01)bend.set(1,0,0);let lo=0,hi=Math.max(1,target);const trial=t=>original.map((p,i)=>p.clone().addScaledVector(bend,Math.sin(Math.PI*i/(original.length-1))*t));for(let i=0;i<42;i++){let mid=(lo+hi)/2;if(length(trial(mid))<target)lo=mid;else hi=mid;}result=trial((lo+hi)/2);}
 }
 result[0]=a;result[result.length-1]=b;
 return {points:result.map(p=>p.toArray()),length:length(result),targetLength:target,connected:true,stretched:chord>target+1e-7};
}
