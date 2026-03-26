/**
 * CanvasEditor.jsx
 * Motor de renderizado 2D para StructCAD Pro (React).
 * Misma logica que canvasEngine.js original, adaptada a React con hooks.
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { useInspection } from '../../context/InspectionContext.jsx';
import './CanvasEditor.css';

const FONT = "'Inter',system-ui,sans-serif";
const MONO = "'IBM Plex Mono',ui-monospace,monospace";

// ── Seeded RNG para textura estable ──────────────────────────────
function lcg(seed) {
  let s = seed;
  return () => { s = Math.imul(s, 1664525) + 1013904223; return (s >>> 0) / 4294967296; };
}

function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
function barR(diam, sc)    { return Math.max(3.5, diam / 20 * sc * 0.45); }

// ── Helpers de dibujo ──────────────────────────────────────────────

function makeDraw(ctx) {
  function fillConcrete(x, y, w, h, clipFn) {
    ctx.save();
    if (clipFn) { clipFn(); ctx.clip(); }
    ctx.fillStyle = '#c4c0b8'; ctx.fillRect(x, y, w, h);
    const rng = lcg(9876);
    ctx.fillStyle = '#a8a49c';
    const n = Math.min(w * h / 16, 280);
    for (let i = 0; i < n; i++) {
      ctx.beginPath(); ctx.arc(x + rng()*w, y + rng()*h, rng()*1.4+.3, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  function dimH(x1, x2, y, lbl) {
    ctx.strokeStyle='#868e96'; ctx.lineWidth=.7; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x1,y); ctx.lineTo(x2,y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1,y-3); ctx.lineTo(x1,y+3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2,y-3); ctx.lineTo(x2,y+3); ctx.stroke();
    ctx.fillStyle='#495057'; ctx.font=`600 9px ${FONT}`; ctx.textAlign='center';
    ctx.fillText(lbl,(x1+x2)/2,y-5);
  }

  function dimV(y1, y2, x, lbl) {
    ctx.strokeStyle='#868e96'; ctx.lineWidth=.7; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x,y1); ctx.lineTo(x,y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-3,y1); ctx.lineTo(x+3,y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-3,y2); ctx.lineTo(x+3,y2); ctx.stroke();
    ctx.fillStyle='#495057'; ctx.font=`600 9px ${FONT}`;
    ctx.save(); ctx.translate(x+5,(y1+y2)/2); ctx.rotate(Math.PI/2);
    ctx.textAlign='center'; ctx.fillText(lbl,0,0); ctx.restore();
  }

  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
    ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r);
    ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
    ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r);
    ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
  }

  function drawInnerBranch(cx1,cy1,cx2,cy2,r1,r2,lineW) {
    ctx.lineWidth=lineW; ctx.setLineDash([]);
    const dx=cx2-cx1, dy=cy2-cy1, len=Math.sqrt(dx*dx+dy*dy);
    if (len<1) return;
    const tx=dx/len, ty=dy/len;
    const hookR1=Math.max(3,r1+lineW*.5), hookR2=Math.max(3,r2+lineW*.5);
    const sx=cx1+tx*hookR1, sy=cy1+ty*hookR1;
    const ex=cx2-tx*hookR2, ey=cy2-ty*hookR2;
    ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
    const ang1=Math.atan2(cy1-sy,cx1-sx);
    ctx.beginPath(); ctx.arc(cx1,cy1,hookR1,ang1,ang1+Math.PI,false); ctx.stroke();
    const ang2=Math.atan2(cy2-ey,cx2-ex);
    ctx.beginPath(); ctx.arc(cx2,cy2,hookR2,ang2,ang2+Math.PI,false); ctx.stroke();
  }

  return { fillConcrete, dimH, dimV, rrect, drawInnerBranch };
}

// ── Dibujo de estructura: Pilar Rectangular ───────────────────────
function drawPilarRect(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { fillConcrete, dimH, dimV, rrect, drawInnerBranch } = makeDraw(ctx);
  const w=clamp(p.width||88,15,300), d=clamp(p.depth||68,15,300);
  const cf=clamp(p.cover_front||5,1,12), cl=clamp(p.cover_lateral||6,1,12);
  const nbf=clamp(p.bars_front_count||5,2,16);
  const nbl=Math.max(0,p.bars_lateral_count||0);
  const df=clamp(p.bars_front_diam||20,6,40);
  const dl=clamp(p.bars_lateral_diam||20,6,40);
  const ds=clamp(p.stirrup_diam||6,4,20);
  const nRX=Math.max(0,p.inner_stirrups_x||0);
  const nRY=Math.max(0,p.inner_stirrups_y||0);
  const dR=clamp(p.inner_stirrup_diam||6,4,16);
  const M=50;
  const sc=Math.min((W-M*2)/w,(H-M*2)/d);
  const ox=(W-w*sc)/2, oy=(H-d*sc)/2;

  sectionBoundsOut.ox=ox; sectionBoundsOut.oy=oy;
  sectionBoundsOut.sw=w*sc; sectionBoundsOut.sh=d*sc;

  fillConcrete(ox,oy,w*sc,d*sc);
  ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=2.5; ctx.setLineDash([]);
  ctx.strokeRect(ox,oy,w*sc,d*sc);

  const lw=Math.max(1.2,ds/16*sc*.3);
  ctx.strokeStyle='#155e27'; ctx.lineWidth=lw;
  const ex=ox+cf*sc, ey=oy+cl*sc, ew=w*sc-2*cf*sc, eh=d*sc-2*cl*sc;
  rrect(ex,ey,ew,eh,2); ctx.stroke();

  dimH(ox,ox+w*sc,oy-8,`${w} cm`);
  dimV(oy,oy+d*sc,ox+w*sc+8,`${d} cm`);
  ctx.fillStyle='#6c757d'; ctx.font=`500 8px ${MONO}`; ctx.textAlign='center';
  ctx.fillText(`r=${cf}`,ox+cf*sc/2,oy-1);

  const spf=nbf>1?(w-2*cf)/(nbf-1):0;
  const bpFT=[], bpFB=[];
  for (let i=0;i<nbf;i++) {
    bpFT.push({id:`FT${i+1}`,label:`FT${i+1}`,cx:ox+(cf+i*spf)*sc,cy:oy+cl*sc,r:barR(df,sc),diam:df,type:'frontal-top'});
    bpFB.push({id:`FB${i+1}`,label:`FB${i+1}`,cx:ox+(cf+i*spf)*sc,cy:oy+(d-cl)*sc,r:barR(df,sc),diam:df,type:'frontal-bottom'});
  }
  bpFT.forEach(b=>barPositionsOut.push(b));
  bpFB.forEach(b=>barPositionsOut.push(b));

  const bpLL=[], bpLR=[];
  if (nbl>0) {
    const spl=(d-2*cl)/(nbl+1);
    for (let i=1;i<=nbl;i++) {
      const by=oy+(cl+i*spl)*sc;
      bpLL.push({id:`LL${i}`,label:`LL${i}`,cx:ox+cf*sc,cy:by,r:barR(dl,sc),diam:dl,type:'lateral-left'});
      bpLR.push({id:`LR${i}`,label:`LR${i}`,cx:ox+(w-cf)*sc,cy:by,r:barR(dl,sc),diam:dl,type:'lateral-right'});
    }
    bpLL.forEach(b=>barPositionsOut.push(b));
    bpLR.forEach(b=>barPositionsOut.push(b));
  }

  if (nRX>0) {
    const innerLW=Math.max(1,dR/16*sc*.25);
    ctx.strokeStyle='#6d28d9';
    const stepX=ew/(nRX+1);
    for (let i=1;i<=nRX;i++) {
      const bx=ex+stepX*i;
      let topBar=null,botBar=null,minT=Infinity,minB=Infinity;
      bpFT.forEach(b=>{const d2=Math.abs(b.cx-bx);if(d2<minT){minT=d2;topBar=b;}});
      bpFB.forEach(b=>{const d2=Math.abs(b.cx-bx);if(d2<minB){minB=d2;botBar=b;}});
      if (topBar&&botBar) drawInnerBranch(bx,ey+topBar.r,bx,ey+eh-botBar.r,topBar.r,botBar.r,innerLW);
      else { ctx.beginPath();ctx.moveTo(bx,ey);ctx.lineTo(bx,ey+eh);ctx.strokeStyle='#6d28d9';ctx.lineWidth=innerLW;ctx.stroke(); }
    }
  }
  if (nRY>0) {
    const innerLW=Math.max(1,dR/16*sc*.25);
    ctx.strokeStyle='#6d28d9';
    const stepY=eh/(nRY+1);
    for (let i=1;i<=nRY;i++) {
      const by=ey+stepY*i;
      let leftBar=null,rightBar=null,minL=Infinity,minRr=Infinity;
      bpLL.forEach(b=>{const d2=Math.abs(b.cy-by);if(d2<minL){minL=d2;leftBar=b;}});
      bpLR.forEach(b=>{const d2=Math.abs(b.cy-by);if(d2<minRr){minRr=d2;rightBar=b;}});
      if (leftBar&&rightBar) drawInnerBranch(ex+leftBar.r,by,ex+ew-rightBar.r,by,leftBar.r,rightBar.r,innerLW);
      else { ctx.beginPath();ctx.moveTo(ex,by);ctx.lineTo(ex+ew,by);ctx.strokeStyle='#6d28d9';ctx.lineWidth=innerLW;ctx.stroke(); }
    }
  }
}

// ── Pilar Circular ────────────────────────────────────────────────
function drawPilarCirc(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { fillConcrete, dimH, drawInnerBranch } = makeDraw(ctx);
  const diam=clamp(p.diameter||50,20,300), R=diam/2;
  const cov=clamp(p.cover||4,1,12);
  const nb=clamp(p.bars_count||8,4,16);
  const db=clamp(p.bars_diam||20,6,40);
  const ds=clamp(p.stirrup_diam||8,4,20);
  const nI=Math.max(0,p.inner_stirrups||0);
  const dI=clamp(p.inner_stirrup_diam||6,4,16);
  const M=45;
  const sc=Math.min((W-M*2)/diam,(H-M*2)/diam);
  const cx2=W/2, cy2=H/2;

  sectionBoundsOut.ox=cx2-R*sc; sectionBoundsOut.oy=cy2-R*sc;
  sectionBoundsOut.sw=diam*sc;   sectionBoundsOut.sh=diam*sc;

  fillConcrete(cx2-R*sc,cy2-R*sc,diam*sc,diam*sc,()=>{
    ctx.beginPath(); ctx.arc(cx2,cy2,R*sc,0,Math.PI*2);
  });
  ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=2.5; ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(cx2,cy2,R*sc,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle='#155e27'; ctx.lineWidth=Math.max(1.2,ds/16*sc*.3);
  ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.arc(cx2,cy2,(R-cov)*sc,0,Math.PI*2); ctx.stroke();
  ctx.setLineDash([]);
  dimH(cx2-R*sc,cx2+R*sc,cy2+R*sc+10,`Ø${diam} cm`);

  const brs=[];
  for (let i=0;i<nb;i++) {
    const ang=2*Math.PI*i/nb-Math.PI/2;
    brs.push({id:`B${i+1}`,label:`B${i+1}`,cx:cx2+(R-cov)*sc*Math.cos(ang),cy:cy2+(R-cov)*sc*Math.sin(ang),r:barR(db,sc),diam:db,type:'radial'});
  }
  brs.forEach(b=>barPositionsOut.push(b));

  if (nI>0) {
    const innerLW=Math.max(1,dI/16*sc*.25);
    ctx.strokeStyle='#6d28d9';
    for (let i=0;i<nI;i++) {
      const ang=Math.PI*i/nI;
      const rr=(R-cov)*sc;
      const p1x=cx2+rr*Math.cos(ang),p1y=cy2+rr*Math.sin(ang);
      const p2x=cx2-rr*Math.cos(ang),p2y=cy2-rr*Math.sin(ang);
      let b1=brs[0],b2=brs[0],d1=Infinity,d2=Infinity;
      brs.forEach(b=>{
        const dd1=(b.cx-p1x)**2+(b.cy-p1y)**2;
        const dd2=(b.cx-p2x)**2+(b.cy-p2y)**2;
        if(dd1<d1){d1=dd1;b1=b;} if(dd2<d2){d2=dd2;b2=b;}
      });
      drawInnerBranch(b1.cx,b1.cy,b2.cx,b2.cy,b1.r,b2.r,innerLW);
    }
  }
}

// ── Viga ─────────────────────────────────────────────────────────
function drawViga(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { fillConcrete, dimH, dimV, rrect, drawInnerBranch } = makeDraw(ctx);
  const w=clamp(p.width||30,15,150), h=clamp(p.height||60,20,300);
  const cov=clamp(p.cover||3,1,10);
  const nbb=clamp(p.bars_bottom_count||4,2,10);
  const nbt=clamp(p.bars_top_count||2,2,6);
  const dbb=clamp(p.bars_bottom_diam||20,6,40);
  const dbt=clamp(p.bars_top_diam||16,6,40);
  const ds=clamp(p.stirrup_diam||8,4,20);
  const nI=Math.max(0,p.inner_stirrups||0);
  const dI=clamp(p.inner_stirrup_diam||6,4,16);
  const M=45;
  const sc=Math.min((W-M*2)/w,(H-M*2)/h);
  const ox=(W-w*sc)/2, oy=(H-h*sc)/2;

  sectionBoundsOut.ox=ox; sectionBoundsOut.oy=oy;
  sectionBoundsOut.sw=w*sc; sectionBoundsOut.sh=h*sc;

  fillConcrete(ox,oy,w*sc,h*sc);
  ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=2.5; ctx.setLineDash([]);
  ctx.strokeRect(ox,oy,w*sc,h*sc);
  const lw=Math.max(1.2,ds/16*sc*.3);
  ctx.strokeStyle='#155e27'; ctx.lineWidth=lw;
  rrect(ox+cov*sc,oy+cov*sc,w*sc-2*cov*sc,h*sc-2*cov*sc,2); ctx.stroke();
  dimH(ox,ox+w*sc,oy-8,`${w} cm`);
  dimV(oy,oy+h*sc,ox+w*sc+8,`${h} cm`);

  const spb=nbb>1?(w-2*cov)/(nbb-1):0;
  const spt=nbt>1?(w-2*cov)/(nbt-1):0;
  const bpB=[],bpT=[];
  for(let i=0;i<nbb;i++) bpB.push({id:`BB${i+1}`,label:`BB${i+1}`,cx:ox+(cov+i*spb)*sc,cy:oy+(h-cov)*sc,r:barR(dbb,sc),diam:dbb,type:'bottom'});
  for(let i=0;i<nbt;i++) bpT.push({id:`BT${i+1}`,label:`BT${i+1}`,cx:ox+(cov+i*spt)*sc,cy:oy+cov*sc,r:barR(dbt,sc),diam:dbt,type:'top'});
  bpB.forEach(b=>barPositionsOut.push(b));
  bpT.forEach(b=>barPositionsOut.push(b));

  if (nI>0) {
    const innerLW=Math.max(1,dI/16*sc*.25);
    ctx.strokeStyle='#6d28d9';
    const ex=ox+cov*sc, ey=oy+cov*sc, ew=w*sc-2*cov*sc, eh=h*sc-2*cov*sc;
    const stepX=ew/(nI+1);
    for(let i=1;i<=nI;i++){
      const bx=ex+stepX*i;
      let topB=null,botB=null,minT=Infinity,minBo=Infinity;
      bpT.forEach(b=>{const d2=Math.abs(b.cx-bx);if(d2<minT){minT=d2;topB=b;}});
      bpB.forEach(b=>{const d2=Math.abs(b.cx-bx);if(d2<minBo){minBo=d2;botB=b;}});
      if(topB&&botB) drawInnerBranch(bx,ey+topB.r,bx,ey+eh-botB.r,topB.r,botB.r,innerLW);
    }
  }
}

// ── Forjado ───────────────────────────────────────────────────────
function drawForjado(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { fillConcrete, dimH, dimV } = makeDraw(ctx);
  const th=clamp(p.thickness||25,10,60);
  const spx=clamp(p.bars_x_spacing||15,5,30);
  const spy=clamp(p.bars_y_spacing||15,5,30);
  const cb=clamp(p.cover_bottom||3,2,10);
  const ct=clamp(p.cover_top||3,2,10);
  const dx=clamp(p.bars_x_diam||12,6,32);
  const M=40;
  const scW=Math.max(1,(W-M*2)/Math.max(th*6,60));
  const sc=Math.min(scW,(H-M*2)/th);
  const secW=Math.min(W-M*2, th*6*sc);
  const ox=(W-secW)/2, oy=(H-th*sc)/2;

  sectionBoundsOut.ox=ox; sectionBoundsOut.oy=oy;
  sectionBoundsOut.sw=secW; sectionBoundsOut.sh=th*sc;

  fillConcrete(ox,oy,secW,th*sc);
  ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=2; ctx.setLineDash([]);
  ctx.strokeRect(ox,oy,secW,th*sc);
  ctx.fillStyle='#6c757d'; ctx.font=`500 8px ${MONO}`; ctx.textAlign='left';
  ctx.fillText(`r.inf=${cb}cm`,ox+4,oy+th*sc-4);
  ctx.fillText(`r.sup=${ct}cm`,ox+4,oy+12);
  dimH(ox,ox+secW,oy-8,`${(secW/sc).toFixed(0)} cm`);
  dimV(oy,oy+th*sc,ox+secW+8,`e=${th} cm`);

  const nBars=Math.floor(secW/(spx*sc))+1;
  for(let i=0;i<nBars;i++){
    const bx=ox+i*spx*sc;
    if(bx>ox+secW) break;
    barPositionsOut.push({id:`BX${i+1}`,label:`BX${i+1}`,cx:bx,cy:oy+(th-cb)*sc,r:barR(dx,sc),diam:dx,type:'bottom-x'});
    barPositionsOut.push({id:`BXt${i+1}`,label:`BXt${i+1}`,cx:bx,cy:oy+ct*sc,r:barR(dx,sc)*.7,diam:dx,type:'top-x'});
  }
}

// ── Zapata ────────────────────────────────────────────────────────
function drawZapata(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { fillConcrete, dimH, dimV } = makeDraw(ctx);
  const L=clamp(p.length||200,50,600), WW=clamp(p.width||160,50,600);
  const pw=clamp(p.pedestal_w||40,20,100), pd=clamp(p.pedestal_d||40,20,100);
  const cs=clamp(p.cover_sides||7,3,15);
  const M=40;
  const sc=Math.min((W-M*2)/L,(H-M*2)/WW);
  const ox=(W-L*sc)/2, oy=(H-WW*sc)/2;

  sectionBoundsOut.ox=ox; sectionBoundsOut.oy=oy;
  sectionBoundsOut.sw=L*sc; sectionBoundsOut.sh=WW*sc;

  fillConcrete(ox,oy,L*sc,WW*sc);
  const pox=ox+(L-pw)/2*sc, poy=oy+(WW-pd)/2*sc;
  ctx.fillStyle='#6c757d'; ctx.fillRect(pox,poy,pw*sc,pd*sc);
  ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=2; ctx.setLineDash([]);
  ctx.strokeRect(ox,oy,L*sc,WW*sc);
  ctx.strokeRect(pox,poy,pw*sc,pd*sc);
  ctx.fillStyle='#495057'; ctx.font=`500 7px ${MONO}`; ctx.textAlign='center';
  ctx.fillText(`P ${pw}x${pd}`,pox+pw*sc/2,poy+pd*sc/2);
  dimH(ox,ox+L*sc,oy-8,`${L} cm`);
  dimV(oy,oy+WW*sc,ox+L*sc+8,`${WW} cm`);

  const nx=clamp(p.bars_x_count||8,2,20), ny=clamp(p.bars_y_count||7,2,20);
  const spx=nx>1?(L-2*cs)/(nx-1):0, spy=ny>1?(WW-2*cs)/(ny-1):0;
  const dx=clamp(p.bars_x_diam||16,6,40), dy=clamp(p.bars_y_diam||16,6,40);
  for(let i=0;i<nx;i++) barPositionsOut.push({id:`BX${i+1}`,label:`BX${i+1}`,cx:ox+(cs+i*spx)*sc,cy:oy+WW*sc*.5,r:barR(dx,sc)*.8,diam:dx,type:'x'});
  for(let i=0;i<ny;i++) barPositionsOut.push({id:`BY${i+1}`,label:`BY${i+1}`,cx:ox+L*sc*.5,cy:oy+(cs+i*spy)*sc,r:barR(dy,sc)*.8,diam:dy,type:'y'});
}

// ── Escalera ──────────────────────────────────────────────────────
function drawEscalera(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { dimH, dimV } = makeDraw(ctx);
  const riser=clamp(p.riser||17,14,22);
  const tread=clamp(p.tread||28,25,35);
  const th=clamp(p.slab_thickness||15,10,30);
  const n=clamp(p.steps_count||5,3,12);
  const cov=clamp(p.cover||2.5,1.5,6);
  const db=clamp(p.bars_long_diam||12,6,20);
  const M=30;
  const tw=n*tread, tH=n*riser+th;
  const sc=Math.min((W-M*2)/tw,(H-M*2)/tH);
  const ox=(W-tw*sc)/2, oy=(H-tH*sc)/2+n*riser*sc;

  sectionBoundsOut.ox=ox; sectionBoundsOut.oy=oy-n*riser*sc;
  sectionBoundsOut.sw=tw*sc; sectionBoundsOut.sh=tH*sc;

  ctx.fillStyle='#c4c0b8';
  for(let i=0;i<n;i++){
    const px=ox+i*tread*sc, py=oy-(i+1)*riser*sc;
    ctx.fillRect(px,py,tread*sc,riser*sc);
    ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=1.5; ctx.setLineDash([]);
    ctx.strokeRect(px,py,tread*sc,riser*sc);
    barPositionsOut.push({id:`ES${i+1}`,label:`ES${i+1}`,cx:px+tread*sc*.5,cy:py+riser*sc*.5,r:barR(db,sc)*.7,diam:db,type:'long'});
  }
  dimH(ox,ox+tread*sc,oy+8,`${tread} cm`);
  dimV(oy-riser*sc,oy,ox-10,`${riser} cm`);
}

// ── Elevation views ───────────────────────────────────────────────
function drawElevationPilarRect(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { fillConcrete, dimH, dimV } = makeDraw(ctx);
  const w=clamp(p.width||88,15,300), d=clamp(p.depth||68,15,300);
  const ih=clamp(p.inspection_height||25,5,150);
  const cf=clamp(p.cover_front||5,1,12);
  const nbf=clamp(p.bars_front_count||5,2,16);
  const df=clamp(p.bars_front_diam||20,6,40);
  const ds=clamp(p.stirrup_diam||6,4,20);
  const VH=ih+70, marg=30;
  const M=40;
  const sc=Math.min((W-M*2)/w,(H-M*2)/VH);
  const ox=(W-w*sc)/2, oy=(H-VH*sc)/2;

  sectionBoundsOut.ox=ox; sectionBoundsOut.oy=oy;
  sectionBoundsOut.sw=w*sc; sectionBoundsOut.sh=VH*sc;

  fillConcrete(ox,oy,w*sc,marg*sc);
  fillConcrete(ox,oy+(VH-marg)*sc,w*sc,marg*sc);
  ctx.fillStyle='rgba(200,200,200,.3)';
  ctx.fillRect(ox,oy+marg*sc,w*sc,(VH-2*marg)*sc);
  ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=2; ctx.setLineDash([]);
  ctx.strokeRect(ox,oy,w*sc,VH*sc);
  ctx.strokeStyle='#ea580c'; ctx.lineWidth=1.2; ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.moveTo(ox,oy+marg*sc); ctx.lineTo(ox+w*sc,oy+marg*sc); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox,oy+(VH-marg)*sc); ctx.lineTo(ox+w*sc,oy+(VH-marg)*sc); ctx.stroke();
  ctx.setLineDash([]);
  dimH(ox,ox+w*sc,oy-8,`${w} cm`);
  dimV(oy+marg*sc,oy+(VH-marg)*sc,ox+w*sc+8,`${ih} cm`);

  const spf=nbf>1?(w-2*cf)/(nbf-1):0;
  for(let i=0;i<nbf;i++){
    const bx=ox+(cf+i*spf)*sc;
    barPositionsOut.push({id:`EV${i+1}`,label:`B${i+1}`,cx:bx,cy:oy+VH*sc*.5,r:barR(df,sc)*.7,diam:df,type:'elevation'});
    ctx.strokeStyle='#155e27'; ctx.lineWidth=Math.max(1,ds/16*sc*.3); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(bx,oy+marg*sc); ctx.lineTo(bx,oy+(VH-marg)*sc); ctx.stroke();
  }
}

// ── Capa de barras ────────────────────────────────────────────────
function drawBarsLayer(ctx, barPositions, barStatus, selectedBars) {
  barPositions.forEach(bar => {
    const st = barStatus[bar.id] || 'unknown';
    const dr = bar.r;
    ctx.beginPath(); ctx.arc(bar.cx, bar.cy, dr, 0, Math.PI*2);
    if (st==='found')   { ctx.fillStyle='#16a34a'; ctx.fill(); }
    else if (st==='notfound') {
      ctx.fillStyle='#fff'; ctx.fill();
      ctx.strokeStyle='#dc2626'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.strokeStyle='#dc2626'; ctx.lineWidth=1.2;
      for(let dd=-dr;dd<dr;dd+=3){
        ctx.beginPath();ctx.moveTo(bar.cx+dd,bar.cy-dr);ctx.lineTo(bar.cx+dd+dr,bar.cy+dr);ctx.stroke();
      }
    }
    else if (st==='oxidized') {
      ctx.fillStyle='#b45309'; ctx.fill();
      ctx.strokeStyle='#92400e'; ctx.lineWidth=1.5; ctx.stroke();
    }
    else {
      ctx.fillStyle='#374151'; ctx.fill();
      ctx.strokeStyle='#111827'; ctx.lineWidth=1; ctx.stroke();
    }
    const fs=Math.max(6,Math.min(dr*.78,9));
    ctx.fillStyle='#fff'; ctx.font=`700 ${fs}px ${MONO}`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(bar.label, bar.cx, bar.cy);
    ctx.textBaseline='alphabetic';
    if (selectedBars.includes(bar.id)) {
      ctx.beginPath(); ctx.arc(bar.cx,bar.cy,bar.r+5,0,Math.PI*2);
      ctx.strokeStyle='#06b6d4'; ctx.lineWidth=2.2;
      ctx.setLineDash([4,2]); ctx.stroke(); ctx.setLineDash([]);
    }
  });
}

// ── Cracks ────────────────────────────────────────────────────────
function drawCracks(ctx, cracks, crackPts) {
  cracks.forEach(c => {
    ctx.strokeStyle='#dc2626'; ctx.lineWidth=2; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(c.x1,c.y1); ctx.lineTo(c.x2,c.y2); ctx.stroke();
    [{x:c.x1,y:c.y1},{x:c.x2,y:c.y2}].forEach(pt=>{
      ctx.lineWidth=1.4;
      ctx.beginPath();ctx.moveTo(pt.x-3.5,pt.y-3.5);ctx.lineTo(pt.x+3.5,pt.y+3.5);ctx.stroke();
      ctx.beginPath();ctx.moveTo(pt.x+3.5,pt.y-3.5);ctx.lineTo(pt.x-3.5,pt.y+3.5);ctx.stroke();
    });
  });
  if (crackPts) {
    ctx.strokeStyle='rgba(220,38,38,.6)'; ctx.lineWidth=1.5; ctx.setLineDash([5,3]);
    ctx.beginPath(); ctx.moveTo(crackPts.x1,crackPts.y1); ctx.lineTo(crackPts.x2,crackPts.y2);
    ctx.stroke(); ctx.setLineDash([]);
  }
}

// ── Anotaciones ───────────────────────────────────────────────────
function drawAnnotations(ctx, annotations) {
  annotations.forEach(ann => {
    ctx.save();
    ctx.font=`600 12px ${FONT}`; ctx.fillStyle='#1e40af';
    ctx.strokeStyle='rgba(255,255,255,.85)'; ctx.lineWidth=3;
    ctx.textAlign='left';
    ctx.strokeText(ann.text,ann.x,ann.y);
    ctx.fillText(ann.text,ann.x,ann.y);
    ctx.restore();
  });
}

// ── Estribos personalizados ───────────────────────────────────────
function drawCustomStirrups(ctx, customStirrups, barPositions) {
  customStirrups.forEach(stirrup => {
    const bars=stirrup.barIds.map(id=>barPositions.find(b=>b.id===id)).filter(Boolean);
    if (bars.length<2) return;
    const xs=bars.map(b=>b.cx), ys=bars.map(b=>b.cy);
    const rMax=Math.max(...bars.map(b=>b.r));
    const pad=rMax+5;
    const x1=Math.min(...xs)-pad, y1=Math.min(...ys)-pad;
    const bw2=Math.max(...xs)+pad-x1, bh2=Math.max(...ys)+pad-y1;
    ctx.save();
    ctx.strokeStyle='#b45309'; ctx.lineWidth=2.2; ctx.setLineDash([]);
    ctx.beginPath();
    const r=4;
    ctx.moveTo(x1+r,y1); ctx.lineTo(x1+bw2-r,y1);
    ctx.arcTo(x1+bw2,y1,x1+bw2,y1+r,r); ctx.lineTo(x1+bw2,y1+bh2-r);
    ctx.arcTo(x1+bw2,y1+bh2,x1+bw2-r,y1+bh2,r); ctx.lineTo(x1+r,y1+bh2);
    ctx.arcTo(x1,y1+bh2,x1,y1+bh2-r,r); ctx.lineTo(x1,y1+r);
    ctx.arcTo(x1,y1,x1+r,y1,r); ctx.closePath();
    ctx.stroke();
    ctx.restore();
  });
}

// ─────────────────────────────────────────────────────────────────
//  COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────

export default function CanvasEditor() {
  const { state, dispatch, getParams } = useInspection();
  const { struct, view, tool, brush, barStatus, cracks, annotations,
          customStirrups, selectedBars } = state;

  const cvRef         = useRef(null);
  const ctxRef        = useRef(null);
  const pickedZoneRef = useRef(null);   // offscreen canvas
  const pickHistRef   = useRef([]);     // undo stack
  const drawingRef    = useRef(false);
  const lastPtRef     = useRef(null);
  const crackPtsRef   = useRef(null);
  const dragAnnRef    = useRef(null);   // index de anotacion arrastrando
  const [cvSize, setCvSize] = useState({ W: 400, H: 328 });

  // barPositions y sectionBounds viven en refs (reconstruidos en cada redraw)
  const barPosRef    = useRef([]);
  const secBoundsRef = useRef({ ox:0, oy:0, sw:1, sh:1 });

  // ── Inicializar canvas ──────────────────────────────────────────
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    ctxRef.current = cv.getContext('2d');
    if (!pickedZoneRef.current) pickedZoneRef.current = document.createElement('canvas');
    _resize();
    const ro = new ResizeObserver(_resize);
    ro.observe(cv.parentElement);
    return () => ro.disconnect();
  }, []);

  function _resize() {
    const cv = cvRef.current;
    if (!cv) return;
    const cont = cv.parentElement;
    const W = cont.clientWidth || 400;
    const H = Math.max(300, Math.min(W * 0.82, 520));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width  = W * dpr;
    cv.height = H * dpr;
    cv.style.width  = W + 'px';
    cv.style.height = H + 'px';
    ctxRef.current?.setTransform(dpr,0,0,dpr,0,0);
    if (pickedZoneRef.current) {
      pickedZoneRef.current.width  = W;
      pickedZoneRef.current.height = H;
    }
    setCvSize({ W, H });
  }

  // ── Sincronizar strokes del estado con el offscreen canvas ──────
  useEffect(() => {
    const pc = pickedZoneRef.current;
    if (!pc) return;
    const pctx = pc.getContext('2d');
    pctx.clearRect(0, 0, pc.width, pc.height);
    state.pickedStrokes.forEach(s => {
      pctx.globalCompositeOperation = 'source-over';
      pctx.beginPath(); pctx.arc(s.cx, s.cy, s.r, 0, Math.PI*2);
      pctx.fillStyle = 'rgba(251,146,60,.45)'; pctx.fill();
      pctx.strokeStyle = 'rgba(234,88,12,.55)'; pctx.lineWidth = .8; pctx.stroke();
    });
  }, [state.pickedStrokes]);

  // ── Redraw completo ─────────────────────────────────────────────
  useEffect(() => {
    fullRedraw();
  });

  function fullRedraw() {
    const ctx = ctxRef.current;
    const cv  = cvRef.current;
    if (!ctx || !cv || !struct) return;
    const W = cvSize.W, H = cvSize.H;
    ctx.clearRect(0, 0, W, H);

    const p   = getParams();
    const bps = [];
    const sb  = { ox: 0, oy: 0, sw: 1, sh: 1 };

    // Capa 1: estructura
    if (view === 'section') {
      const fn = {
        'pilar-rect': drawPilarRect,
        'pilar-circ': drawPilarCirc,
        'viga':       drawViga,
        'forjado':    drawForjado,
        'zapata':     drawZapata,
        'escalera':   drawEscalera,
      };
      fn[struct]?.(ctx, p, W, H, bps, sb);
    } else {
      if      (struct==='pilar-rect') drawElevationPilarRect(ctx,p,W,H,bps,sb);
      else if (struct==='viga')       drawViga(ctx,p,W,H,bps,sb);
      else {
        const fn={'pilar-circ':drawPilarCirc,'forjado':drawForjado,'zapata':drawZapata,'escalera':drawEscalera};
        fn[struct]?.(ctx,p,W,H,bps,sb);
      }
    }

    barPosRef.current    = bps;
    secBoundsRef.current = sb;

    // Actualizar bounds en estado global (para la exportacion DXF)
    dispatch({ type: 'SET_BAR_POSITIONS', payload: bps });
    dispatch({ type: 'SET_SECTION_BOUNDS', payload: { ...sb } });

    // Capa 2: zona pintada (offscreen canvas)
    const pc = pickedZoneRef.current;
    if (pc && pc.width > 0) {
      ctx.save(); ctx.globalAlpha = 1;
      ctx.drawImage(pc, 0, 0);
      ctx.restore();
    }

    // Capa 3: barras
    drawBarsLayer(ctx, bps, barStatus, selectedBars);

    // Capa 3b: estribos personalizados
    drawCustomStirrups(ctx, customStirrups, bps);

    // Capa 4: fisuras
    drawCracks(ctx, cracks, crackPtsRef.current);

    // Capa 5: anotaciones
    drawAnnotations(ctx, annotations);
  }

  // ── Posicion en canvas ──────────────────────────────────────────
  function _pos(e) {
    const cv  = cvRef.current;
    const dpr = Math.min(window.devicePixelRatio||1,3);
    const rect = cv.getBoundingClientRect();
    const touch = e.touches?.[0] || e;
    return {
      x: (touch.clientX - rect.left) * (cv.width  / rect.width  / dpr),
      y: (touch.clientY - rect.top)  * (cv.height / rect.height / dpr),
    };
  }

  // ── Hit test de barra ───────────────────────────────────────────
  function _hitBar(x, y) {
    return barPosRef.current.find(b => {
      const dx=b.cx-x, dy=b.cy-y;
      return Math.sqrt(dx*dx+dy*dy) <= b.r+4;
    });
  }

  // ── Hit test de anotacion ───────────────────────────────────────
  function _hitAnnotation(x, y) {
    return annotations.findIndex(a => {
      const dx=a.x-x, dy=a.y-y;
      return Math.sqrt(dx*dx+dy*dy) <= 16;
    });
  }

  // ── Eventos de pintura ──────────────────────────────────────────
  function handlePointerDown(e) {
    e.preventDefault();
    const { x, y } = _pos(e);

    if (tool === 'annotate') {
      const idx = _hitAnnotation(x, y);
      if (idx >= 0) {
        dragAnnRef.current = idx;
      } else {
        const text = window.prompt('Texto de anotación:');
        if (text?.trim()) dispatch({ type: 'ADD_ANNOTATION', payload: { x, y, text: text.trim() } });
      }
      return;
    }

    if (tool === 'select-bar') {
      const bar = _hitBar(x, y);
      if (bar) {
        const next = selectedBars.includes(bar.id)
          ? selectedBars.filter(id=>id!==bar.id)
          : [...selectedBars, bar.id];
        dispatch({ type: 'SET_SELECTED_BARS', payload: next });
      }
      return;
    }

    if (tool === 'crack') {
      crackPtsRef.current = { x1: x, y1: y, x2: x, y2: y };
      drawingRef.current = true;
      return;
    }

    // bar status cycle on click (pick mode)
    if (tool === 'pick' || tool === 'erase') {
      const bar = _hitBar(x, y);
      if (bar && tool === 'pick') {
        const cycle = { unknown:'found', found:'notfound', notfound:'oxidized', oxidized:'unknown' };
        dispatch({ type: 'SET_BAR_STATUS', barId: bar.id, status: cycle[barStatus[bar.id]||'unknown'] });
        return;
      }
    }

    drawingRef.current = true;
    lastPtRef.current = { x, y };
    _paint(x, y);
  }

  function handlePointerMove(e) {
    e.preventDefault();
    if (!drawingRef.current) return;
    const { x, y } = _pos(e);

    if (tool === 'crack' && crackPtsRef.current) {
      crackPtsRef.current = { ...crackPtsRef.current, x2: x, y2: y };
      fullRedraw();
      return;
    }

    if (dragAnnRef.current !== null) {
      dispatch({ type: 'UPDATE_ANNOTATION', index: dragAnnRef.current, changes: { x, y } });
      return;
    }

    if (tool === 'pick' || tool === 'erase') {
      // Interpolate for smooth strokes
      if (lastPtRef.current) {
        const dx = x - lastPtRef.current.x, dy = y - lastPtRef.current.y;
        const dist = Math.sqrt(dx*dx+dy*dy);
        const steps = Math.max(1, Math.floor(dist / (brush * .5)));
        for (let i=1; i<=steps; i++) {
          _paint(lastPtRef.current.x + dx*i/steps, lastPtRef.current.y + dy*i/steps);
        }
      } else {
        _paint(x, y);
      }
      lastPtRef.current = { x, y };
    }
  }

  function handlePointerUp(e) {
    if (!drawingRef.current && dragAnnRef.current === null) return;

    if (tool === 'crack' && crackPtsRef.current) {
      const c = crackPtsRef.current;
      const dx=c.x2-c.x1, dy=c.y2-c.y1;
      if (Math.sqrt(dx*dx+dy*dy) > 5) dispatch({ type: 'ADD_CRACK', payload: { ...c } });
      crackPtsRef.current = null;
    }

    drawingRef.current = false;
    dragAnnRef.current = null;
    lastPtRef.current  = null;
    fullRedraw();
  }

  function _paint(x, y) {
    const pc   = pickedZoneRef.current;
    if (!pc)   return;
    const pctx = pc.getContext('2d');

    if (tool === 'pick') {
      pctx.globalCompositeOperation = 'source-over';
      pctx.beginPath(); pctx.arc(x, y, brush, 0, Math.PI*2);
      pctx.fillStyle = 'rgba(251,146,60,.45)'; pctx.fill();
      pctx.strokeStyle = 'rgba(234,88,12,.55)'; pctx.lineWidth = .8; pctx.stroke();
      // Guardar trazo en estado global para exportacion DXF
      dispatch({ type: 'ADD_PICKED_STROKE', payload: { cx: x, cy: y, r: brush } });
    } else if (tool === 'erase') {
      pctx.globalCompositeOperation = 'destination-out';
      pctx.beginPath(); pctx.arc(x, y, brush*1.5, 0, Math.PI*2);
      pctx.fillStyle = 'rgba(0,0,0,1)'; pctx.fill();
      pctx.globalCompositeOperation = 'source-over';
      // Eliminar trazos cercanos al area borrada
      const erR = brush * 1.5;
      dispatch({
        type: 'SET_PICKED_STROKES',
        payload: state.pickedStrokes.filter(s => {
          const dx=s.cx-x, dy=s.cy-y;
          return Math.sqrt(dx*dx+dy*dy) > (erR + s.r) * .7;
        }),
      });
    }

    fullRedraw();
  }

  function handleUndo() {
    if (pickHistRef.current.length > 0) {
      const prev = pickHistRef.current.pop();
      dispatch({ type: 'SET_PICKED_STROKES', payload: prev });
    }
  }

  function handleClear() {
    pickHistRef.current.push([...state.pickedStrokes]);
    dispatch({ type: 'CLEAR_CANVAS' });
  }

  const cursorStyle = tool === 'erase'
    ? 'cell'
    : tool === 'crack' || tool === 'annotate'
      ? 'crosshair'
      : 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\'%3E%3Ccircle cx=\'12\' cy=\'12\' r=\'10\' fill=\'none\' stroke=\'%23ea580c\' stroke-width=\'2\'/%3E%3C/svg%3E") 12 12, crosshair';

  return (
    <div className="canvas-editor">
      {/* Barra de herramientas */}
      <div className="cv-toolbar">
        <div className="cv-tools">
          {[
            { id:'pick',       icon:'🖌️', label:'Brocha' },
            { id:'erase',      icon:'◻', label:'Borrar' },
            { id:'crack',      icon:'⚡', label:'Fisura' },
            { id:'annotate',   icon:'📝', label:'Nota' },
            { id:'select-bar', icon:'⊙',  label:'Selec.' },
          ].map(t => (
            <button
              key={t.id}
              className={`cv-tool-btn ${tool===t.id?'active':''}`}
              onClick={() => dispatch({ type:'SET_TOOL', payload:t.id })}
              title={t.label}
            >{t.icon}</button>
          ))}
        </div>

        {(tool==='pick'||tool==='erase') && (
          <div className="cv-brush-row">
            <span className="cv-label">Brocha</span>
            <input
              type="range" min="5" max="40" value={brush}
              onChange={e => dispatch({ type:'SET_BRUSH', payload:+e.target.value })}
              className="cv-brush-slider"
            />
            <span className="cv-label">{brush}px</span>
          </div>
        )}

        <div className="cv-actions">
          <button className="cv-btn" onClick={handleUndo} title="Deshacer">↩</button>
          <button className="cv-btn danger" onClick={handleClear} title="Limpiar">✕</button>
        </div>

        <div className="cv-view-toggle">
          {['section','elevation'].map(v => (
            <button
              key={v}
              className={`cv-view-btn ${view===v?'active':''}`}
              onClick={() => dispatch({ type:'SET_VIEW', payload:v })}
            >{v==='section'?'Sección':'Alzado'}</button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="cv-wrap" id="cvCont">
        <canvas
          ref={cvRef}
          style={{ cursor: cursorStyle, display:'block', width:'100%' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onContextMenu={e=>e.preventDefault()}
        />
      </div>

      {/* Info */}
      <div className="cv-info">
        {struct} · {view}
        {state.pickedStrokes.length > 0 && (
          <span className="cv-pick-count"> · {state.pickedStrokes.length} trazos pintados</span>
        )}
      </div>
    </div>
  );
}
