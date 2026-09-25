import * as THREE from '../lib/three.module.js';

// Local +Z runs from femoral tip toward tendon, or tibial tendon interface
// toward tibial tip. Trimming changes the latter endpoint, never drill centers.
export function bonePlugLayout({side,start,axis,transverse=[1,0,0],length,diameter,trim=0,drilled=true}){
 const origin=new THREE.Vector3(...start),z=new THREE.Vector3(...axis).normalize();
 let x=new THREE.Vector3(...transverse).addScaledVector(z,-new THREE.Vector3(...transverse).dot(z)).normalize();
 if(x.length()<.01)x=new THREE.Vector3(0,0,1).cross(z).normalize();
 const y=z.clone().cross(x).normalize(),rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z)),originalLength=Math.max(.001,Number(length)||.001),trimAmount=side==='tibia'?Math.max(0,Math.min(originalLength,Number(trim)||0)):0,retainedLength=originalLength-trimAmount;
 const centers=drilled?(side==='femur'?[originalLength*.4]:[originalLength/3,originalLength*2/3]):[];
 return {side,start:origin.toArray(),axis:z.toArray(),transverse:x.toArray(),rotation:rotation.toArray(),diameter,originalLength,retainedLength,trimAmount,end:origin.clone().addScaledVector(z,retainedLength).toArray(),originalEnd:origin.clone().addScaledVector(z,originalLength).toArray(),holes:centers.map(position=>({position,diameter:2,center:origin.clone().addScaledVector(z,position).toArray(),axis:x.toArray(),retained:position-1<retainedLength}))};
}
