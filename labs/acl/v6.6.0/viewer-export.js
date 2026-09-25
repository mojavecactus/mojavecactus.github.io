// Compose the actual rendered scene and the viewer's measurement SVG.
// Model capture owns final-case staging and restoration; this module only reads surfaces.
export async function composeViewerImage({canvas,svg,width=canvas?.width,height=canvas?.height}={}) {
 if(!canvas||!svg)throw new Error('The viewer surfaces are not ready.');
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('The viewer image dimensions are invalid.');
 const w=Math.round(width),h=Math.round(height);
 if(w<1||h<1||w>8192||h>8192)throw new Error('The viewer image dimensions are unsupported.');
 const doc=canvas.ownerDocument,output=doc.createElement('canvas');output.width=w;output.height=h;
 const ctx=output.getContext('2d');if(!ctx)throw new Error('The viewer image could not be composed.');
 // Same charcoal radial background as the transparent WebGL viewport.
 const cx=.48*w,cy=.42*h,rx=Math.max(cx,w-cx)*Math.SQRT2,ry=Math.max(cy,h-cy)*Math.SQRT2;
 ctx.save();ctx.translate(cx,cy);ctx.scale(rx,ry);const background=ctx.createRadialGradient(0,0,0,0,0,1);
 background.addColorStop(0,'#393a37');background.addColorStop(.48,'#282a28');background.addColorStop(.95,'#202220');
 ctx.fillStyle=background;ctx.fillRect(-cx/rx,-cy/ry,w/rx,h/ry);ctx.restore();
 // Copy immediately, before image decoding yields: WebGL may clear its drawing buffer.
 ctx.drawImage(canvas,0,0,w,h);
 const copy=svg.cloneNode(true);copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('width',String(w));copy.setAttribute('height',String(h));
 copy.setAttribute('style',`width:${w}px;height:${h}px;overflow:hidden`);
 const win=doc.defaultView||globalThis;
 copy.setAttribute('font-family',win.getComputedStyle?.(svg).fontFamily||'Arial, sans-serif');
 const serializer=new win.XMLSerializer(),url=win.URL.createObjectURL(new win.Blob([serializer.serializeToString(copy)],{type:'image/svg+xml;charset=utf-8'}));
 try {
  const overlay=new win.Image();
  await new Promise((resolve,reject)=>{overlay.onload=resolve;overlay.onerror=()=>reject(new Error('The measurement labels could not be captured.'));overlay.src=url;});
  ctx.drawImage(overlay,0,0,w,h);
  return {dataUrl:output.toDataURL('image/png'),width:w,height:h};
 } finally {win.URL.revokeObjectURL(url);}
}
