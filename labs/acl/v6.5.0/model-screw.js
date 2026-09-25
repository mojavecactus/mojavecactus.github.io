import * as THREE from '../lib/three.module.js';

const EPSILON_MM=1e-5;
function vector(value,name){
  if(!value||value.length!==3||!Array.from(value).every(Number.isFinite))throw new TypeError(`${name} must contain three finite coordinates.`);
  return new THREE.Vector3(...value);
}
function unit(value,name){const result=vector(value,name);if(result.lengthSq()<1e-20)throw new RangeError(`${name} must not be zero.`);return result.normalize();}
function geometryList(geometries){
  const list=Array.isArray(geometries)?geometries:Object.values(geometries||{});
  if(!list.length)throw new RangeError('At least one screw geometry is required.');
  return list.map(item=>{
    const geometry=item?.isBufferGeometry?item:item?.geometry;
    if(!geometry?.getAttribute('position'))throw new TypeError('Every screw component must have a position attribute.');
    return geometry;
  });
}

// The local screw axis is +Z. Only a rigid inward translation is applied after
// rotation: head, body, and threads keep their exact selected envelope. The
// supplied entry plane may be oblique to the tunnel. Bone-path overrun at the
// opposite end is intentionally not clipped or hidden here.
export function flushScrewPlacement({geometries,aperture,outwardNormal,direction,lateralOffset=[0,0,0]}){
  const origin=vector(aperture,'aperture'),normal=unit(outwardNormal,'outwardNormal'),axis=unit(direction,'direction'),offset=vector(lateralOffset,'lateralOffset');
  const slope=axis.dot(normal);
  if(slope>=-1e-8)throw new RangeError('Screw direction must point inward across the supplied outward entry plane.');
  const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),axis);
  const base=origin.clone().add(offset),local=new THREE.Vector3();
  let maxOutward=-Infinity,minZ=Infinity,maxZ=-Infinity,vertexCount=0;
  for(const geometry of geometryList(geometries)){
    const positions=geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++){
      local.fromBufferAttribute(positions,i);
      if(![local.x,local.y,local.z].every(Number.isFinite))throw new TypeError('Screw geometry contains a nonfinite vertex.');
      minZ=Math.min(minZ,local.z);maxZ=Math.max(maxZ,local.z);vertexCount++;
      local.applyQuaternion(rotation).add(offset);
      maxOutward=Math.max(maxOutward,local.dot(normal));
    }
  }
  if(!vertexCount)throw new RangeError('Screw geometry has no vertices.');
  const axialRecess=Math.max(0,(maxOutward+EPSILON_MM)/-slope);
  const start=base.addScaledVector(axis,axialRecess),end=start.clone().addScaledVector(axis,maxZ);
  return {start:start.toArray(),end:end.toArray(),rotation:rotation.toArray(),axialRecess,maxOutwardDistance:maxOutward+slope*axialRecess,axialBounds:[minZ,maxZ]};
}

// Input coordinates must be in the same frame as the indexed anatomy mesh.
// The returned normal follows the actual nearest triangle's vertex winding;
// no radial approximation is used around the concave femoral notch.
export function nearestSurfaceNormal(meshData,point){
  const query=vector(point,'point'),positions=meshData?.positions,indices=meshData?.indices;
  if(!positions||positions.length%3||!indices||indices.length%3)throw new TypeError('An indexed triangle mesh is required.');
  const triangle=new THREE.Triangle(),closest=new THREE.Vector3(),normal=new THREE.Vector3();
  let bestDistance=Infinity,best=null;
  for(let i=0;i<indices.length;i+=3){
    for(const [target,index] of [[triangle.a,indices[i]],[triangle.b,indices[i+1]],[triangle.c,indices[i+2]]]){
      if(!Number.isInteger(index)||index<0||index*3+2>=positions.length)throw new RangeError('Triangle index is outside the position array.');
      target.fromArray(positions,index*3);
    }
    triangle.getNormal(normal);if(normal.lengthSq()<1e-20)continue;
    triangle.closestPointToPoint(query,closest);const distance=closest.distanceToSquared(query);
    if(distance<bestDistance){bestDistance=distance;best=normal.toArray();}
  }
  if(!best)throw new RangeError('No nondegenerate triangle is available for a surface normal.');
  return best;
}
