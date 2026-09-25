// Planned measurement overlays are separate from completed bores and instruments.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const point=(a,u,t)=>a.map((v,i)=>v+u[i]*t);
export function measurementGuideSpec(geometry,selection,fieldIssues={}){
 if(!geometry||!selection||!Number.isFinite(selection.value))return null;
 const [side,field]=String(selection.path).split('.');
 if(!['femur','tibia'].includes(side)||!['ttl','socket','diameter','aperture'].includes(field))return null;
 const shared=geometry.linked?.enabled&&field==='diameter',sides=shared?['tibia','femur']:[side];
 const invalid=(fieldIssues[selection.path]||[]).some(issue=>issue.level==='error');
 return {path:selection.path,field,value:selection.value,shared,invalid,color:invalid?'#ff7777':'#ffcc56',parts:sides.map(name=>{
  const g=geometry[name],length=field==='ttl'?g.ttl:field==='aperture'?0:clamp(g.socketDepth,0,240),start=field==='aperture'?g.cortex:g.entry,end=field==='ttl'?g.cortex:point(start,g.direction,length);
  const diameter=clamp(field==='aperture'?selection.value:field==='diameter'?selection.value:g.socketDiameter,.2,36);
  return {side:name,start:[...start],end:[...end],axis:[...g.direction],length,diameter,entered:selection.value,represented:field==='ttl'?g.ttl:field==='socket'?length:diameter,kind:field==='diameter'||field==='aperture'?'diameter':'length'};
 })};
}
