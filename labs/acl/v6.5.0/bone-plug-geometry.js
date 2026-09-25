import * as THREE from '../lib/three.module.js';

const TAU=Math.PI*2,EPS=1e-9;
const unique=values=>values.filter(Number.isFinite).sort((a,b)=>a-b).filter((x,i,a)=>!i||Math.abs(x-a[i-1])>EPS);
const bounded=(value,fallback)=>Number.isFinite(value)?Math.max(.001,Math.min(10000,value)):fallback;
const circleIntersections=(a,b)=>{
  if(Math.abs(a.position-b.position)<EPS)return [];
  const z=(a.radius*a.radius-b.radius*b.radius-a.position*a.position+b.position*b.position)/(2*(b.position-a.position));
  const y2=a.radius*a.radius-(z-a.position)**2;
  return y2>=-EPS?[{y:Math.sqrt(Math.max(0,y2)),z},{y:-Math.sqrt(Math.max(0,y2)),z}]:[];
};

// A plug is a Z-axis cylinder minus transverse X-axis cylinders. Surfaces are
// meshed analytically, including the inner hole walls and cut-end notches.
// Hole positions remain in the original plug coordinates when length is trimmed.
export function createBonePlugGeometry({diameter,length,holes=[]}={}){
  const D=bounded(diameter,9),L=bounded(length,.001),R=D/2;
  const drilled=(Array.isArray(holes)?holes:[]).filter(h=>h&&Number.isFinite(h.position)&&Number.isFinite(h.diameter)&&h.diameter>0).map(h=>({position:h.position,diameter:h.diameter,radius:h.diameter/2}));
  const positions=[],normals=[];
  const chord=y=>Math.sqrt(Math.max(0,R*R-y*y));
  const forbidden=(y,z,except=-1)=>drilled.some((h,i)=>i!==except&&y*y+(z-h.position)**2<h.radius*h.radius-EPS);
  const zAt=(boundary,y)=>typeof boundary==='number'?boundary:boundary.h.position+boundary.sign*Math.sqrt(Math.max(0,boundary.h.radius**2-y*y));
  const angle=(y,z,h)=>{let a=Math.atan2(z-h.position,y);if(a<0)a+=TAU;return a;};
  const pointsY=[-R,0,R];
  for(let i=0;i<=64;i++)pointsY.push(R*Math.cos(Math.PI*i/64));
  for(const h of drilled){
    pointsY.push(-h.radius,h.radius);
    for(let i=0;i<=80;i++)pointsY.push(h.radius*Math.cos(TAU*i/80));
    for(const z of [0,L]){const y2=h.radius*h.radius-(z-h.position)**2;if(y2>=-EPS)pointsY.push(-Math.sqrt(Math.max(0,y2)),Math.sqrt(Math.max(0,y2)));}
    for(const other of drilled)for(const point of circleIntersections(h,other))pointsY.push(point.y);
  }
  const ys=unique(pointsY.filter(y=>y>=-R-EPS&&y<=R+EPS).map(y=>Math.min(R,Math.max(-R,y))));
  function triangle(a,b,c,outward){
    const u=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),v=new THREE.Vector3(...c).sub(new THREE.Vector3(...a)),normal=u.cross(v);
    if(normal.lengthSq()<1e-20)return;
    if(normal.dot(new THREE.Vector3(...outward))<0){[b,c]=[c,b];normal.negate();}
    normal.normalize();positions.push(...a,...b,...c);for(let i=0;i<3;i++)normals.push(normal.x,normal.y,normal.z);
  }
  function quad(a,b,c,d,outward){triangle(a,b,c,outward);triangle(a,c,d,outward);}
  function bands(y){
    const intervals=drilled.filter(h=>Math.abs(y)<h.radius).map(h=>({low:{h,sign:-1},high:{h,sign:1}})).filter(x=>zAt(x.high,y)>0&&zAt(x.low,y)<L).map(x=>({low:zAt(x.low,y)<0?0:x.low,high:zAt(x.high,y)>L?L:x.high})).sort((a,b)=>zAt(a.low,y)-zAt(b.low,y));
    const union=[];
    for(const interval of intervals){const previous=union.at(-1);if(previous&&zAt(interval.low,y)<=zAt(previous.high,y)+EPS){if(zAt(interval.high,y)>zAt(previous.high,y))previous.high=interval.high;}else union.push({...interval});}
    const material=[];let lower=0;
    for(const interval of union){if(zAt(interval.low,y)>zAt(lower,y)+EPS)material.push({low:lower,high:interval.low});lower=interval.high;}
    if(zAt(lower,y)<L-EPS)material.push({low:lower,high:L});return material;
  }
  for(let i=0;i<ys.length-1;i++){
    const y0=ys[i],y1=ys[i+1],mid=(y0+y1)/2;
    for(const band of bands(mid)){
      const lo0=Math.min(L,Math.max(0,zAt(band.low,y0))),lo1=Math.min(L,Math.max(0,zAt(band.low,y1))),hi0=Math.min(L,Math.max(0,zAt(band.high,y0))),hi1=Math.min(L,Math.max(0,zAt(band.high,y1)));
      for(const sign of [-1,1])quad([sign*chord(y0),y0,lo0],[sign*chord(y1),y1,lo1],[sign*chord(y1),y1,hi1],[sign*chord(y0),y0,hi0],[sign*chord(mid),mid,0]);
    }
    for(const z of [0,L])if(!forbidden(mid,z))quad([-chord(y0),y0,z],[chord(y0),y0,z],[chord(y1),y1,z],[-chord(y1),y1,z],[0,0,z===0?-1:1]);
  }
  for(let index=0;index<drilled.length;index++){
    const h=drilled[index],angles=[0,TAU];
    for(const y of ys)if(Math.abs(y)<=h.radius+EPS){const a=Math.acos(Math.max(-1,Math.min(1,y/h.radius)));angles.push(a,TAU-a);}
    for(const other of drilled)for(const p of circleIntersections(h,other))angles.push(angle(p.y,p.z,h));
    for(const z of [0,L])if(Math.abs(z-h.position)<=h.radius+EPS){const y=Math.sqrt(Math.max(0,h.radius**2-(z-h.position)**2));angles.push(angle(y,z,h),angle(-y,z,h));}
    const sorted=unique(angles);
    for(let i=0;i<sorted.length-1;i++){
      const a=sorted[i],b=sorted[i+1],mid=(a+b)/2,y=h.radius*Math.cos(mid),z=h.position+h.radius*Math.sin(mid);
      if(Math.abs(y)>R+EPS||z<0||z>L||forbidden(y,z,index))continue;
      const y0=Math.max(-R,Math.min(R,h.radius*Math.cos(a))),y1=Math.max(-R,Math.min(R,h.radius*Math.cos(b))),z0=Math.max(0,Math.min(L,h.position+h.radius*Math.sin(a))),z1=Math.max(0,Math.min(L,h.position+h.radius*Math.sin(b)));
      quad([-chord(y0),y0,z0],[chord(y0),y0,z0],[chord(y1),y1,z1],[-chord(y1),y1,z1],[0,-Math.cos(mid),-Math.sin(mid)]);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  if(positions.length){geometry.computeBoundingBox();geometry.computeBoundingSphere();}else{geometry.boundingBox=new THREE.Box3(new THREE.Vector3(),new THREE.Vector3());geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),0);}
  geometry.userData={nominalDimensions:{diameter:D,length:L},holes:drilled.map(h=>({position:h.position,diameter:h.diameter,axis:'x',center:[0,0,h.position]})),fullyRemoved:!positions.length,displaySafeguards:[...(!Number.isFinite(diameter)||D!==diameter?[{dimension:'diameter',requested:Number.isFinite(diameter)?diameter:null,represented:D}]:[]),...(!Number.isFinite(length)||L!==length?[{dimension:'length',requested:Number.isFinite(length)?length:null,represented:L}]:[])]};
  return geometry;
}
