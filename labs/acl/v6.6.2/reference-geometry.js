// Scene units are millimeters. Only the patient anatomy resizes with total tunnel length.
export const DIMENSIONS=Object.freeze({graftDiameter:8,socketDiameter:9,passingDiameter:4.5,buttonLength:13,buttonWidth:4,buttonThickness:1.4,flipTravel:7});
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=a=>Math.sqrt(dot(a,a));
const unit=a=>{const l=length(a);return a.map(x=>x/l)};
export function axisPoint(entry,direction,depth){return entry.map((x,i)=>x+direction[i]*depth)}
export function measurementAnchors(entry,direction,c,travel=0){return {aperture:[...entry],graft:axisPoint(entry,direction,c.graft),movingGraft:axisPoint(entry,direction,c.graft+travel),socket:axisPoint(entry,direction,c.depth),minimum:axisPoint(entry,direction,c.minSocket),cortex:axisPoint(entry,direction,c.ttl)}}
function rayDistance(origin,direction,a,b,c){
 const e1=sub(b,a),e2=sub(c,a),p=cross(direction,e2),det=dot(e1,p);if(Math.abs(det)<1e-9)return null;
 const inv=1/det,t=sub(origin,a),u=dot(t,p)*inv;if(u<0||u>1)return null;const q=cross(t,e1),v=dot(direction,q)*inv;if(v<0||u+v>1)return null;const d=dot(e2,q)*inv;return d>.15?d:null;
}
export function prepareSurface(data){const triangles=[];for(let i=0;i<data.indices.length;i+=3){const pts=data.indices.slice(i,i+3).map(k=>data.positions.slice(k*3,k*3+3));const normal=unit(cross(sub(pts[1],pts[0]),sub(pts[2],pts[0])));triangles.push({pts,normal})}return triangles;}
export function surfaceExit(triangles,entry,ttl,preferred,options={}){
 const candidates=[],seen=new Set(),minLateral=options.minLateral??entry[0]+8,maxProximal=options.maxProximal??90,minProximal=options.minProximal??-25;
 function add(point,triangle){
  if(point[0]<minLateral||point[1]>maxProximal||point[1]<minProximal||point[2]>(options.maxPosterior??Infinity)||point[2]<(options.minPosterior??-Infinity))return;
  if(triangle.normal[0]<(options.minNormalX??-Infinity))return;
  const direction=unit(sub(point,entry));if(direction[0]<=.08||direction[1]<-.1)return;
  const key=point.map(v=>v.toFixed(5)).join(',');if(seen.has(key))return;seen.add(key);
  candidates.push({point,direction,normal:triangle.normal,score:1-dot(direction,preferred)});
 }
 function inTriangle(p,a,b,c){const v0=sub(b,a),v1=sub(c,a),v2=sub(p,a),d00=dot(v0,v0),d01=dot(v0,v1),d11=dot(v1,v1),d20=dot(v2,v0),d21=dot(v2,v1),den=d00*d11-d01*d01;if(Math.abs(den)<1e-12)return false;const v=(d11*d20-d01*d21)/den,w=(d00*d21-d01*d20)/den;return v>=-1e-8&&w>=-1e-8&&v+w<=1+1e-8;}
 for(const triangle of triangles){const pts=triangle.pts;if(Math.max(...pts.map(p=>p[0]))<minLateral||triangle.normal[0]<(options.minNormalX??-Infinity))continue;
  const n=triangle.normal,h=dot(sub(pts[0],entry),n);
  if(Math.abs(h)<=ttl+1e-8){const center=entry.map((v,i)=>v+h*n[i]),radius=Math.sqrt(Math.max(0,ttl*ttl-h*h));let planar=preferred.map((v,i)=>v-dot(preferred,n)*n[i]);if(length(planar)<1e-8)planar=sub(pts[0],center);if(radius<1e-8){if(inTriangle(center,...pts))add(center,triangle)}else if(length(planar)>1e-8){const u=unit(planar),point=center.map((v,i)=>v+radius*u[i]);if(inTriangle(point,...pts))add(point,triangle)}}
  for(let k=0;k<3;k++){const a=pts[k],b=pts[(k+1)%3],v=sub(b,a),rel=sub(a,entry),A=dot(v,v),B=2*dot(rel,v),C=dot(rel,rel)-ttl*ttl,disc=B*B-4*A*C;if(disc<0||A<1e-10)continue;for(const sign of [-1,1]){const t=(-B+sign*Math.sqrt(disc))/(2*A);if(t>=0&&t<=1)add(a.map((x,i)=>x+t*v[i]),triangle)}}
 }
 candidates.sort((a,b)=>a.score-b.score);
 for(const candidate of candidates.slice(0,160)){
  let nearest=Infinity;for(const tri of triangles){const d=rayDistance(entry,candidate.direction,...tri.pts);if(d!==null&&d<nearest)nearest=d;}
  if(Math.abs(nearest-ttl)<.005&&dot(candidate.normal,candidate.direction)>0)return {...candidate,length:ttl,supported:true};
 }
 return {supported:false,length:ttl,point:axisPoint(entry,preferred,ttl),direction:[...preferred],normal:[...preferred]};
}

// The reference aperture and cortical exit are fixed anatomical landmarks.
// Different patient sizes are represented by a uniform scale around the exit;
// hardware, bore diameters and camera are deliberately outside this transform.
export function createPatientReference(anatomy,referenceTTL=36){
 const direction=unit(anatomy.preferredDirection);
 const exit=surfaceExit(prepareSurface(anatomy.femur),anatomy.aperture,referenceTTL,direction,anatomy.exitConstraints);
 if(!exit.supported)throw new Error('The reference tunnel could not be established.');
 return {ttl:referenceTTL,entry:[...anatomy.aperture],cortex:[...exit.point],direction:[...exit.direction],normal:[...exit.normal]};
}
export function patientGeometry(reference,ttl){
 if(!Number.isFinite(ttl)||ttl<20||ttl>80)throw new RangeError('Total tunnel length must be 20–80 mm.');
 const scale=ttl/reference.ttl;
 return {supported:true,length:ttl,scale,translation:reference.cortex.map(x=>x*(1-scale)),entry:axisPoint(reference.cortex,reference.direction,-ttl),point:[...reference.cortex],direction:[...reference.direction],normal:[...reference.normal]};
}
export function scalePatientPoint(point,reference,ttl){const scale=ttl/reference.ttl;return point.map((x,i)=>reference.cortex[i]+(x-reference.cortex[i])*scale);}

// Distal mesh extents in its anatomical axes, below y=50 mm in the reference
// pose. These are bounding-box measurements, not clinical condylar landmarks.
export function distalFemurDimensions(anatomy){
 const p=anatomy.femur.positions,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<p.length;i+=3){if(p[i+1]>=50)continue;for(let j=0;j<3;j++){min[j]=Math.min(min[j],p[i+j]);max[j]=Math.max(max[j],p[i+j]);}}
 return {width:max[0]-min[0],depth:max[2]-min[2]};
}
