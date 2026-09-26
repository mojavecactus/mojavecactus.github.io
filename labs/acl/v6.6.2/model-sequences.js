const limit=x=>Math.max(0,Math.min(1,Number.isFinite(+x)?+x:0));
const phase=(p,a,b)=>limit((p-a)/(b-a));
const lerp=(a,b,t)=>a+(b-a)*t;

export function recommendedStepDuration(stage,technique=''){
 // trans-tibial femoral passes travel up the tibial tunnel first
 if(technique==='transtibial'&&stage==='femur_pin')return 5200;
 if(technique==='transtibial'&&['femur_ream','femur_cortex_ream'].includes(stage))return 7500;
 if(stage==='femur_cortex_ream')return 5500;
 if(stage==='trim_tibia')return 3500;
 if(stage==='femur_measure'&&technique==='flexible')return 3500;
 if(stage==='pass_femur')return 10000;
 if(stage==='pass_tibia')return 7000;
 if(stage.endsWith('_ream'))return technique==='retrograde'?7000:technique==='flexible'?6500:4500;
 if(stage==='femur_flexible_pin')return 4200;
 if(stage.endsWith('_pin'))return 3400;
 if(stage==='xl_femur')return 2800;
 return 2200;
}

export function retroReamerPose(progress,{ttl,socketDepth,blownCortex=false}){
 const p=limit(progress),depth=Math.max(0,socketDepth),through=Math.max(0,ttl),headClear=-3;
 let name,headDepth,opening,cutDepth=0,shaftDepth=through;
 if(p<.22){name='advance';headDepth=lerp(through+24,headClear,phase(p,0,.22));opening=0;shaftDepth=Math.max(0,Math.min(through,headDepth));}
 else if(p<.34){name='open';headDepth=headClear;opening=phase(p,.22,.34);shaftDepth=0;}
 else if(p<(blownCortex?.78:.65)){name='retrograde-cut';const t=phase(p,.34,blownCortex?.78:.65);headDepth=lerp(headClear,blownCortex?through+4:depth,t);opening=1;cutDepth=Math.max(0,Math.min(through,headDepth));shaftDepth=0;}
 else if(!blownCortex&&p<.75){name='close';const t=phase(p,.65,.75);headDepth=lerp(depth,Math.max(headClear,depth-2),t);opening=1-t;cutDepth=depth;shaftDepth=0;}
 else if(!blownCortex&&p<.84){name='return-to-joint';headDepth=lerp(Math.max(headClear,depth-2),headClear,phase(p,.75,.84));opening=0;cutDepth=depth;shaftDepth=0;}
 else {name='withdraw';const t=phase(p,blownCortex?.78:.84,1);headDepth=lerp(blownCortex?through+4:headClear,through+52,t);opening=blownCortex?1:0;cutDepth=blownCortex?through:depth;shaftDepth=0;}
 return {phase:p>=1?'complete':name,visible:p<1,progress:p,headDepth,opening,cutDepth,shaftDepth,rotation:(p<.22?1:-1)*p*Math.PI*30,blownCortex:!!blownCortex};
}

export function antegradeReamerPose(progress,{ttl,socketDepth,outside=false}){
 const p=limit(progress),depth=Math.max(0,socketDepth),advance=phase(p,0,.72),withdraw=phase(p,.72,1);
 const headDepth=outside?lerp(ttl+15,ttl-depth,advance):lerp(-18,depth,advance),cutDepth=Math.max(0,Math.min(depth,outside?ttl-headDepth:headDepth));
 return {visible:p<1,phase:p>=1?'complete':p<.72?'ream':'withdraw',progress:p,cutDepth,headDepth:headDepth+(outside?1:-1)*withdraw*(depth+34),rotation:p*Math.PI*26};
}

export function femoralButtonPassPose(progress,{ttl,buttonLength=13,xlBefore=false}){
 const p=limit(progress),clearance=Math.max(buttonLength,xlBefore?19.8:buttonLength)/2+.5;
 return {progress:p,advance:phase(p,0,.72),flip:phase(p,.72,.88),seat:phase(p,.88,1),clearance,centerDepth:ttl+clearance*(1-phase(p,.88,1)),phase:p<.72?'advance':p<.88?'flip':'seat'};
}

export function flexibleReamerPose(progress,{ttl,socketDepth,corticalPassage=false,graftDiameter=9}){
 const p=limit(progress),depth=Math.max(0,socketDepth),pose=antegradeReamerPose(p,{ttl,socketDepth:corticalPassage?ttl:depth});
 return {...pose,headDiameter:corticalPassage?4.5:graftDiameter,socketCutDepth:corticalPassage?depth:pose.cutDepth,corticalCutDepth:corticalPassage?pose.cutDepth:0,pass:corticalPassage?'cortical-passage':'socket'};
}

export function adjustableFemoralPassPose(progress,{ttl,buttonLength=13,xlBefore=false}){
 const p=limit(progress),clearance=Math.max(buttonLength,xlBefore?19.8:buttonLength)/2+.5;
 return {progress:p,advance:phase(p,0,.42),flip:phase(p,.42,.55),seat:phase(p,.55,.63),tension:phase(p,.63,1),clearance,centerDepth:ttl+clearance*(1-phase(p,.55,.63)),phase:p<.42?'button-advance-graft-lags':p<.55?'flip':p<.63?'seat-button':'tension-adjustable-loop'};
}

// Trans-tibial femoral pin: distances run continuously from the outer tibial cortex, up the reamed tibial tunnel, across the
// joint and through the femur (it is drilled in from outside the tibia and leaves the anterolateral femur).
export function linkedPinPose(progress,{totalLength}){
 const p=limit(progress),length=Math.max(.1,Number(totalLength)||.1),headDistance=lerp(-20,length+12,p);
 return {progress:p,phase:p>=1?'pin-through-tibial-tunnel-and-femur':'advance-femoral-pin',headDistance,tailDistance:headDistance-length-45,diameter:2.4,visible:true};
}
// Trans-tibial femoral reaming: the reamer (or the 4.5 mm cortical reamer) rides the femoral pin up through the already reamed
// tibial tunnel, cuts the femoral socket to its depth (or the cortical passage from the socket end through the cortex), and comes
// back out the tibia. headDepth is measured from the femoral aperture along the femoral axis (negative = joint / tibial tunnel).
export function transtibialFemoralReamerPose(progress,{approach,socketDepth,ttl,corticalPassage=false,graftDiameter=9}){
 const p=limit(progress),back=Math.max(0,Number(approach)||0)+18,depth=Math.max(0,Number(socketDepth)||0),through=Math.max(depth,Number(ttl)||0),target=corticalPassage?through+2:depth,advance=phase(p,0,.74),withdraw=phase(p,.74,1);
 const furthest=lerp(-back,target,advance),headDepth=furthest-withdraw*(target+back+12);
 return {visible:p<1,phase:p>=1?'complete':p<.74?(corticalPassage?'cortical-passage':'socket'):'withdraw',progress:p,headDepth,headDiameter:corticalPassage?4.5:graftDiameter,
  socketCutDepth:corticalPassage?depth:Math.max(0,Math.min(depth,furthest)),corticalCutDepth:corticalPassage?Math.max(0,Math.min(through,furthest)):0,pass:corticalPassage?'cortical-passage':'socket',rotation:p*Math.PI*32};
}
