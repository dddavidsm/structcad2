/**
 * CanvasEditor.jsx
 * Motor de renderizado 2D para StructCAD Pro (React).
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { useInspection } from '../../context/InspectionContext.jsx';
import ViewSelector3D from './ViewSelector3D.jsx';
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

  // Offset aumentado para evitar solapamiento con la estructura
  function dimH(x1, x2, y, lbl) {
    ctx.strokeStyle='#868e96'; ctx.lineWidth=.7; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x1,y); ctx.lineTo(x2,y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1,y-4); ctx.lineTo(x1,y+4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2,y-4); ctx.lineTo(x2,y+4); ctx.stroke();
    ctx.fillStyle='#495057'; ctx.font=`600 9px ${FONT}`; ctx.textAlign='center';
    ctx.fillText(lbl,(x1+x2)/2,y-6);
  }

  function dimV(y1, y2, x, lbl) {
    ctx.strokeStyle='#868e96'; ctx.lineWidth=.7; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x,y1); ctx.lineTo(x,y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-4,y1); ctx.lineTo(x+4,y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-4,y2); ctx.lineTo(x+4,y2); ctx.stroke();
    ctx.fillStyle='#495057'; ctx.font=`600 9px ${FONT}`;
    ctx.save(); ctx.translate(x+6,(y1+y2)/2); ctx.rotate(Math.PI/2);
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

  return { fillConcrete, dimH, dimV, rrect };
}

// ── Pilar Rectangular — Planta ────────────────────────────────────
function drawPilarRect(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { fillConcrete, dimH, dimV, rrect } = makeDraw(ctx);
  const w=clamp(p.width||88,15,300), d=clamp(p.depth||68,15,300);
  const cf=clamp(p.cover_front||5,1,12), cl=clamp(p.cover_lateral||6,1,12);
  const ds=clamp(p.stirrup_diam||6,4,20);
  // Recubrimiento diferenciado: estribo vs barras
  const csRaw = p.cover_stirrup != null ? p.cover_stirrup : null;
  const cs = clamp(csRaw !== null ? csRaw : Math.max(1.5, Math.min(cf,cl) - ds/20), 1, 12);
  const nbf=clamp(p.bars_front_count||5,2,16);
  const nbl=Math.max(0,p.bars_lateral_count||0);
  const df=clamp(p.bars_front_diam||20,6,40);
  const dl=clamp(p.bars_lateral_diam||20,6,40);
  const M=50;
  const sc=Math.min((W-M*2)/w,(H-M*2)/d);
  const ox=(W-w*sc)/2, oy=(H-d*sc)/2;

  sectionBoundsOut.ox=ox; sectionBoundsOut.oy=oy;
  sectionBoundsOut.sw=w*sc; sectionBoundsOut.sh=d*sc;

  fillConcrete(ox,oy,w*sc,d*sc);
  ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=2.5; ctx.setLineDash([]);
  ctx.strokeRect(ox,oy,w*sc,d*sc);

  // Estribo perimetral: dibujado en cover_stirrup — rodea visualmente las barras
  const lw=Math.max(1.5,ds/10*sc*.5);
  ctx.strokeStyle='#155e27'; ctx.lineWidth=lw;
  rrect(ox+cs*sc, oy+cs*sc, w*sc-2*cs*sc, d*sc-2*cs*sc, 2); ctx.stroke();

  // Cotas
  dimH(ox,ox+w*sc,oy-22,`${w} cm`);
  dimV(oy,oy+d*sc,ox+w*sc+22,`${d} cm`);
  const estABarra=clamp(p.estriboABarra||0,0,10);
  ctx.fillStyle='#6c757d'; ctx.font=`500 8px ${MONO}`; ctx.textAlign='left';
  ctx.fillText(`est=${cs}cm  r=${cf}cm${estABarra ? '  e→b='+estABarra+'cm' : ''}`,ox+2,oy-8);

  // Recubrimientos visuales efectivos de las barras (estribo + separación estribo-barra)
  const v_cf = cf + estABarra;
  const v_cl = cl + estABarra;

  // ── Barras en sección cenital (solo posiciones → dibujadas como círculos por drawBarsLayer) ──
  // Cara frontal: nbf barras en borde superior + nbf barras en borde inferior
  const spf=nbf>1?(w-2*v_cl)/(nbf-1):0;
  for (let i=0;i<nbf;i++) {
    const bx=ox+(v_cl+i*spf)*sc;
    barPositionsOut.push({id:`FT${i+1}`,label:`FT${i+1}`,cx:bx,cy:oy+v_cf*sc,r:barR(df,sc),diam:df,type:'frontal-top'});
    barPositionsOut.push({id:`FB${i+1}`,label:`FB${i+1}`,cx:bx,cy:oy+(d-v_cf)*sc,r:barR(df,sc),diam:df,type:'frontal-bot'});
  }

  // Cara lateral: nbl barras intermedias por cada lado (sin esquinas, esas ya son FB/FT)
  if (nbl>0) {
    const spl=(d-2*v_cf)/(nbl+1);
    for (let i=1;i<=nbl;i++) {
      const by=oy+(v_cf+i*spl)*sc;
      barPositionsOut.push({id:`LL${i}`,label:`LL${i}`,cx:ox+v_cl*sc,cy:by,r:barR(dl,sc),diam:dl,type:'lateral-left'});
      barPositionsOut.push({id:`LR${i}`,label:`LR${i}`,cx:ox+(w-v_cl)*sc,cy:by,r:barR(dl,sc),diam:dl,type:'lateral-right'});
    }
  }
}

// ── Pilar Circular ────────────────────────────────────────────────
function drawPilarCirc(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { fillConcrete, dimH } = makeDraw(ctx);
  const diam=clamp(p.diameter||50,20,300), R=diam/2;
  const cov=clamp(p.cover||4,1,12);
  const nb=clamp(p.bars_count||8,4,16);
  const db=clamp(p.bars_diam||20,6,40);
  const ds=clamp(p.stirrup_diam||8,4,20);
  const cs=clamp(p.cover_stirrup!=null?p.cover_stirrup:Math.max(1.5,cov-ds/20),1,10);
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
  // Cerco en cover_stirrup (rodea las barras visualmente)
  ctx.strokeStyle='#155e27'; ctx.lineWidth=Math.max(1.2,ds/16*sc*.3);
  ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.arc(cx2,cy2,(R-cs)*sc,0,Math.PI*2); ctx.stroke();
  ctx.setLineDash([]);
  dimH(cx2-R*sc,cx2+R*sc,cy2+R*sc+18,`Ø${diam} cm`);

  const brs=[];
  for (let i=0;i<nb;i++) {
    const ang=2*Math.PI*i/nb-Math.PI/2;
    brs.push({id:`B${i+1}`,label:`B${i+1}`,cx:cx2+(R-cov)*sc*Math.cos(ang),cy:cy2+(R-cov)*sc*Math.sin(ang),r:barR(db,sc),diam:db,type:'radial'});
  }
  brs.forEach(b=>barPositionsOut.push(b));
}

// ── Viga ─────────────────────────────────────────────────────────
function drawViga(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { fillConcrete, dimH, dimV, rrect } = makeDraw(ctx);
  const w=clamp(p.width||30,15,150), h=clamp(p.height||60,20,300);
  const cov=clamp(p.cover||3,1,10);
  const nbb=clamp(p.bars_bottom_count||4,2,10);
  const nbt=clamp(p.bars_top_count||2,2,6);
  const dbb=clamp(p.bars_bottom_diam||20,6,40);
  const dbt=clamp(p.bars_top_diam||16,6,40);
  const ds=clamp(p.stirrup_diam||8,4,20);
  const cs=clamp(p.cover_stirrup!=null?p.cover_stirrup:Math.max(1.5,cov-ds/20),1,10);
  const M=45;
  const sc=Math.min((W-M*2)/w,(H-M*2)/h);
  const ox=(W-w*sc)/2, oy=(H-h*sc)/2;

  sectionBoundsOut.ox=ox; sectionBoundsOut.oy=oy;
  sectionBoundsOut.sw=w*sc; sectionBoundsOut.sh=h*sc;

  fillConcrete(ox,oy,w*sc,h*sc);
  ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=2.5; ctx.setLineDash([]);
  ctx.strokeRect(ox,oy,w*sc,h*sc);
  // Estribo en cover_stirrup (rodea las barras)
  const lw=Math.max(1.2,ds/16*sc*.3);
  ctx.strokeStyle='#155e27'; ctx.lineWidth=lw;
  rrect(ox+cs*sc,oy+cs*sc,w*sc-2*cs*sc,h*sc-2*cs*sc,2); ctx.stroke();
  dimH(ox,ox+w*sc,oy-22,`${w} cm`);
  dimV(oy,oy+h*sc,ox+w*sc+22,`${h} cm`);

  const spb=nbb>1?(w-2*cov)/(nbb-1):0;
  const spt=nbt>1?(w-2*cov)/(nbt-1):0;
  for(let i=0;i<nbb;i++) barPositionsOut.push({id:`BB${i+1}`,label:`BB${i+1}`,cx:ox+(cov+i*spb)*sc,cy:oy+(h-cov)*sc,r:barR(dbb,sc),diam:dbb,type:'bottom'});
  for(let i=0;i<nbt;i++) barPositionsOut.push({id:`BT${i+1}`,label:`BT${i+1}`,cx:ox+(cov+i*spt)*sc,cy:oy+cov*sc,r:barR(dbt,sc),diam:dbt,type:'top'});
}

// ── Forjado ───────────────────────────────────────────────────────
function drawForjado(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { fillConcrete, dimH, dimV } = makeDraw(ctx);
  const th=clamp(p.thickness||25,10,60);
  const spx=clamp(p.bars_x_spacing||15,5,30);
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
  dimH(ox,ox+secW,oy-20,`${(secW/sc).toFixed(0)} cm`);
  dimV(oy,oy+th*sc,ox+secW+20,`e=${th} cm`);

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
  dimH(ox,ox+L*sc,oy-20,`${L} cm`);
  dimV(oy,oy+WW*sc,ox+L*sc+20,`${WW} cm`);

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
  dimH(ox,ox+tread*sc,oy+10,`${tread} cm`);
  dimV(oy-riser*sc,oy,ox-18,`${riser} cm`);
}

// ── Pilar Rect — Vista Alzado (Sección) ───────────────────────────
function drawElevationPilarRect(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { fillConcrete, dimH, dimV } = makeDraw(ctx);
  const w=clamp(p.width||88,15,300), d=clamp(p.depth||68,15,300);
  const ih=clamp(p.inspection_height||25,5,150);
  const cf=clamp(p.cover_front||5,1,12);
  const nbf=clamp(p.bars_front_count||5,2,16);
  const df=clamp(p.bars_front_diam||20,6,40);
  const ds=clamp(p.stirrup_diam||6,4,20);
  const cs=clamp(p.cover_stirrup!=null?p.cover_stirrup:Math.max(1.5,cf-ds/20),1,12);
  const sps=clamp(p.stirrup_spacing||15,5,50);
  const estABarra=clamp(p.estriboABarra||0,0,10); // recubrimiento estribo a barra (cm)
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
  dimH(ox,ox+w*sc,oy-20,`${w} cm`);
  dimV(oy+marg*sc,oy+(VH-marg)*sc,ox+w*sc+22,`${ih} cm`);

  // Barras longitudinales como líneas verticales
  const spf=nbf>1?(w-2*cf)/(nbf-1):0;
  for(let i=0;i<nbf;i++){
    const bx=ox+(cf+i*spf)*sc;
    ctx.strokeStyle='#155e27'; ctx.lineWidth=Math.max(1.5,df/16*sc*.4); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(bx,oy+marg*sc); ctx.lineTo(bx,oy+(VH-marg)*sc); ctx.stroke();
  }

  // Estribos repetidos — arrancan en la base y suben con paso sps
  // estABarra reduce el ancho del estribo visual a ambos lados
  const yTop=oy+marg*sc, yBot=oy+(VH-marg)*sc;
  const ex1=ox+cs*sc+estABarra*sc, ex2=ox+(w-cs)*sc-estABarra*sc;
  ctx.strokeStyle='#6d28d9'; ctx.lineWidth=Math.max(1,ds/16*sc*.25); ctx.setLineDash([6,3]);
  for (let y=yBot, n=0; y>=yTop-0.5 && n<60; y-=sps*sc, n++) {
    ctx.beginPath(); ctx.moveTo(ex1,y); ctx.lineTo(ex2,y); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle='#6c757d'; ctx.font=`500 8px ${MONO}`; ctx.textAlign='center';
  ctx.fillText(`Sección  (${nbf}Ø${df}mm, est@${sps}cm${estABarra?', e-b='+estABarra+'cm':''})`,ox+w*sc/2,oy+VH*sc+14);
}

// ── Pilar Rect — Vista Lateral ────────────────────────────────────
function drawLateralPilarRect(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { fillConcrete, dimH, dimV } = makeDraw(ctx);
  const d=clamp(p.depth||68,15,300);
  const cl=clamp(p.cover_lateral||6,1,12);
  const cf=clamp(p.cover_front||5,1,12);   // para barras de esquina
  const nbl=Math.max(0,p.bars_lateral_count||0);
  const dl=clamp(p.bars_lateral_diam||20,6,40);
  const df=clamp(p.bars_front_diam||20,6,40); // diámetro de las barras de esquina
  const ds=clamp(p.stirrup_diam||6,4,20);
  const cs=clamp(p.cover_stirrup!=null?p.cover_stirrup:Math.max(1.5,Math.min(cf,cl)-ds/20),1,12);
  const estABarra=clamp(p.estriboABarra||0,0,10); // recubrimiento estribo a barra (cm)
  const ih=clamp(p.inspection_height||25,5,150);
  const VH=ih+70, marg=30;
  const M=40;
  const sc=Math.min((W-M*2)/d,(H-M*2)/VH);
  const ox=(W-d*sc)/2, oy=(H-VH*sc)/2;

  sectionBoundsOut.ox=ox; sectionBoundsOut.oy=oy;
  sectionBoundsOut.sw=d*sc; sectionBoundsOut.sh=VH*sc;

  fillConcrete(ox,oy,d*sc,marg*sc);
  fillConcrete(ox,oy+(VH-marg)*sc,d*sc,marg*sc);
  ctx.fillStyle='rgba(200,200,200,.3)';
  ctx.fillRect(ox,oy+marg*sc,d*sc,(VH-2*marg)*sc);
  ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=2; ctx.setLineDash([]);
  ctx.strokeRect(ox,oy,d*sc,VH*sc);
  ctx.strokeStyle='#ea580c'; ctx.lineWidth=1.2; ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.moveTo(ox,oy+marg*sc); ctx.lineTo(ox+d*sc,oy+marg*sc); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox,oy+(VH-marg)*sc); ctx.lineTo(ox+d*sc,oy+(VH-marg)*sc); ctx.stroke();
  ctx.setLineDash([]);

  const lw=Math.max(1,ds/16*sc*.3);
  ctx.strokeStyle='#155e27'; ctx.lineWidth=lw;

  // Barras de ESQUINA (compartidas con la cara frontal)
  const cornerMidY = oy+VH*sc*.5;
  ctx.beginPath(); ctx.moveTo(ox+cl*sc,oy+marg*sc); ctx.lineTo(ox+cl*sc,oy+(VH-marg)*sc); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox+(d-cl)*sc,oy+marg*sc); ctx.lineTo(ox+(d-cl)*sc,oy+(VH-marg)*sc); ctx.stroke();

  // Barras INTERMEDIAS (solo las nbl que introduce el usuario, sin esquinas)
  if (nbl>0) {
    ctx.strokeStyle='#2563eb'; ctx.lineWidth=Math.max(1,dl/16*sc*.3);
    const spl=(d-2*cl)/(nbl+1);
    for(let i=1;i<=nbl;i++){
      const bx=ox+(cl+i*spl)*sc;
      ctx.beginPath(); ctx.moveTo(bx,oy+marg*sc); ctx.lineTo(bx,oy+(VH-marg)*sc); ctx.stroke();
    }
  }

  // Estribos repetidos a intervalos sps (igual que en alzado frontal)
  const sps = clamp(p.stirrup_spacing||15,5,50);
  const yTop = oy+marg*sc, yBot = oy+(VH-marg)*sc;
  const ex1 = ox+cs*sc+estABarra*sc, ex2 = ox+(d-cs)*sc-estABarra*sc;
  ctx.strokeStyle='#6d28d9'; ctx.lineWidth=Math.max(1,ds/16*sc*.25); ctx.setLineDash([6,3]);
  for (let y=yBot, n=0; y>=yTop-0.5 && n<60; y-=sps*sc, n++) {
    ctx.beginPath(); ctx.moveTo(ex1,y); ctx.lineTo(ex2,y); ctx.stroke();
  }
  ctx.setLineDash([]);

  dimH(ox,ox+d*sc,oy-20,`${d} cm`);
  dimV(oy+marg*sc,oy+(VH-marg)*sc,ox+d*sc+22,`${ih} cm`);
  dimV(oy,oy+VH*sc,ox+d*sc+36,`${VH} cm`);

  ctx.fillStyle='#6c757d'; ctx.font=`500 8px ${MONO}`; ctx.textAlign='center';
  ctx.fillText(`Vista Lateral  (2 esq.+${nbl} interm., est@${sps}cm${estABarra?', e-b='+estABarra+'cm':''})`,ox+d*sc/2,oy+VH*sc+14);
}

// ── Pilar Rect — Vista Frontal ────────────────────────────────────
function drawFrontalPilarRect(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { fillConcrete, dimH, dimV } = makeDraw(ctx);
  const w=clamp(p.width||88,15,300);
  const cf=clamp(p.cover_front||5,1,12);
  const nbf=clamp(p.bars_front_count||5,2,16);
  const df=clamp(p.bars_front_diam||20,6,40);
  const ds=clamp(p.stirrup_diam||6,4,20);
  const cs=clamp(p.cover_stirrup!=null?p.cover_stirrup:Math.max(1.5,cf-ds/20),1,12);
  const ih=clamp(p.inspection_height||25,5,150);
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

  const lw=Math.max(1,ds/16*sc*.3);
  ctx.strokeStyle='#155e27'; ctx.lineWidth=lw;
  const spf=nbf>1?(w-2*cf)/(nbf-1):0;
  for(let i=0;i<nbf;i++){
    const bx=ox+(cf+i*spf)*sc;
    ctx.beginPath(); ctx.moveTo(bx,oy+marg*sc); ctx.lineTo(bx,oy+(VH-marg)*sc); ctx.stroke();
  }
  // Estribos
  ctx.strokeStyle='#6d28d9'; ctx.lineWidth=Math.max(1,ds/16*sc*.25); ctx.setLineDash([6,3]);
  ctx.beginPath(); ctx.moveTo(ox+cs*sc,oy+marg*sc); ctx.lineTo(ox+(w-cs)*sc,oy+marg*sc); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox+cs*sc,oy+(VH-marg)*sc); ctx.lineTo(ox+(w-cs)*sc,oy+(VH-marg)*sc); ctx.stroke();
  ctx.setLineDash([]);

  dimH(ox,ox+w*sc,oy-20,`${w} cm`);
  dimV(oy+marg*sc,oy+(VH-marg)*sc,ox+w*sc+22,`${ih} cm`);
  dimV(oy,oy+VH*sc,ox+w*sc+36,`${VH} cm`);

  ctx.fillStyle='#6c757d'; ctx.font=`500 8px ${MONO}`; ctx.textAlign='center';
  ctx.fillText('Vista Frontal',ox+w*sc/2,oy+VH*sc+14);
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
function drawAnnotations(ctx, annotations, editingId = null) {
  annotations.forEach(ann => {
    if (editingId && ann.id === editingId) return;
    ctx.save();
    // Caja de fondo
    ctx.font=`600 12px ${FONT}`;
    const tw = ctx.measureText(ann.text).width;
    ctx.fillStyle='rgba(255,255,255,.88)';
    ctx.strokeStyle='#1e40af';
    ctx.lineWidth=1.5;
    const pad=4;
    ctx.beginPath();
    ctx.roundRect(ann.x-pad, ann.y-14, tw+pad*2, 18, 3);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle='#1e40af'; ctx.textAlign='left';
    ctx.fillText(ann.text,ann.x,ann.y);
    ctx.restore();
  });
}

// ── Estribos personalizados (sección / planta) ───────────────────
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

// ── Estribos individuales en vistas laterales/sección ─────────────
function drawCustomStirrupsLateral(ctx, customStirrups, sb, p, view) {
  if (!customStirrups.length) return;
  const ih = clamp(p.inspection_height || 25, 5, 150);
  const VH = ih + 70, marg = 30;
  // Zona de inspección dentro del sectionBounds
  const yTop = sb.oy + (marg / VH) * sb.sh;
  const yBot = sb.oy + ((VH - marg) / VH) * sb.sh;
  const cs_val = clamp(p.cover_stirrup != null ? p.cover_stirrup : 3, 1, 12);
  const dimPx = view === 'lateral' ? (clamp(p.depth || 68, 15, 300)) : (clamp(p.width || 88, 15, 300));
  const sc = sb.sw / dimPx;

  customStirrups.forEach((stirrup, idx) => {
    const ny = stirrup.ny ?? 0.5;
    const inset = stirrup.inset ?? 0;
    const y = yBot - ny * (yBot - yTop); // ny=0 → bottom, ny=1 → top
    const x1 = sb.ox + (cs_val + inset) * sc;
    const x2 = sb.ox + sb.sw - (cs_val + inset) * sc;
    if (x2 <= x1) return;

    // Línea del estribo individual
    ctx.save();
    ctx.strokeStyle = '#b45309'; ctx.lineWidth = 2.5; ctx.setLineDash([8, 4]);
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    ctx.setLineDash([]);

    // Marcador de arrastre (rombo)
    const mx = x1 - 8;
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.moveTo(mx, y - 5); ctx.lineTo(mx + 5, y); ctx.lineTo(mx, y + 5); ctx.lineTo(mx - 5, y);
    ctx.closePath(); ctx.fill();

    // Etiqueta con posición
    const distCm = (ny * ih).toFixed(1);
    ctx.fillStyle = '#92400e'; ctx.font = `600 9px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(`E${idx + 1}: ${distCm}cm`, x2 + 4, y + 3);
    ctx.restore();
  });
}

// ── Vistas disponibles por estructura ────────────────────────────
const STRUCT_VIEWS = {
  'pilar-rect': [
    { id:'section',   label:'Planta'  },
    { id:'elevation', label:'Sección' },
    { id:'lateral',   label:'Lateral' },
  ],
  'pilar-circ': [
    { id:'section',   label:'Planta'  },
    { id:'elevation', label:'Alzado'  },
  ],
  'viga': [
    { id:'section',   label:'Sección' },
    { id:'elevation', label:'Alzado'  },
  ],
  default: [
    { id:'section', label:'Planta' },
  ],
};

function getViews(struct) {
  return STRUCT_VIEWS[struct] || STRUCT_VIEWS.default;
}

// ─────────────────────────────────────────────────────────────────
//  COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────

export default function CanvasEditor() {
  const { state, dispatch, getParams } = useInspection();
  // Página activa (arquitectura plana)
  const pagina = state.paginas?.[state.paginaActiva];
  if (!pagina) return <div className="empty-state">No hay ninguna estructura seleccionada.<br />Haz clic en 'Nueva Inspección' o selecciona un elemento para empezar.</div>;
  // Saneamiento seguro de propiedades
  const { struct, view, tool, brush } = state;
  // Arrays completos (necesarios para borrado view-aware)
  const allPickedStrokes = Array.isArray(pagina?.pickedStrokes)  ? pagina.pickedStrokes  : [];
  const allCracks        = Array.isArray(pagina?.cracks)         ? pagina.cracks         : [];
  const allAnnotations   = Array.isArray(pagina?.annotations)    ? pagina.annotations    : [];
  // Arrays filtrados por vista para renderizado
  const pickedStrokes    = allPickedStrokes.filter(s => !s.view || s.view === view);
  const cracks           = allCracks.filter(c => !c.view || c.view === view);
  const annotations      = allAnnotations.filter(a => !a.view || a.view === view);
  const barStatus        = pagina?.barStatus || {};
  const customStirrups   = Array.isArray(pagina?.customStirrups) ? pagina.customStirrups : [];
  const selectedBars     = Array.isArray(pagina?.selectedBars)   ? pagina.selectedBars   : [];
  const formValues       = pagina?.formValues || {};
  // Conteos
  const cracksCount         = cracks.length;
  const annotationsCount    = annotations.length;
  const customStirrupsCount = customStirrups.length;
  const selectedBarsCount   = selectedBars.length;
  const pickedStrokesCount  = pickedStrokes.length;

  const cvRef         = useRef(null);
  const ctxRef        = useRef(null);
  const pickedZoneRef = useRef(null);
  const pickHistRef   = useRef([]);
  const drawingRef    = useRef(false);
  const lastPtRef     = useRef(null);
  const crackPtsRef   = useRef(null);
  const dragAnnRef    = useRef(null); // { id, startX, startY, moved: boolean }
  const dragStirrupRef = useRef(null); // { index, startY }
  const [cvSize, setCvSize] = useState({ W: 400, H: 328 });

  // Zoom / Pan
  const zoomRef        = useRef({ scale: 1, panX: 0, panY: 0 });
  // Multi-touch tracking (pinch-to-zoom)
  const pointerCacheRef = useRef([]);
  const pinchInitRef    = useRef(null);
  // Wheel handler ref (needed for passive:false addEventListener)
  const wheelHandlerRef = useRef(null);

  // Inline annotation input
  const [annInput, setAnnInput] = useState(null); // {x,y,text,editId,cssLeft,cssTop}
  // Menú contextual de nota
  const [activeNoteMenu, setActiveNoteMenu] = useState(null); // {id,x,y,text,menuLeft,menuTop}

  const barPosRef       = useRef([]);
  const secBoundsRef    = useRef({ ox:0, oy:0, sw:1, sh:1 });
  // Claves de memoización: evitan el loop infinito de dispatches en fullRedraw
  const secBoundsKeyRef = useRef(null);
  const barPosKeyRef    = useRef(null);

  // ── Wheel handler — se renueva en CADA render para capturar el closure fresco
  //    (fix rastros de zoom: clearRect usaba cvSize del primer render)
  wheelHandlerRef.current = (e) => {
    e.preventDefault();
    const cv = cvRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio||1, 3);
    const mouseX = (e.clientX - rect.left) * (cv.width / rect.width / dpr);
    const mouseY = (e.clientY - rect.top)  * (cv.height / rect.height / dpr);
    const { scale, panX, panY } = zoomRef.current;
    const factor = e.deltaY < 0 ? 1.12 : 1/1.12;
    const newScale = Math.max(0.25, Math.min(8, scale * factor));
    const ratio = newScale / scale;
    zoomRef.current = {
      scale: newScale,
      panX: mouseX - (mouseX - panX) * ratio,
      panY: mouseY - (mouseY - panY) * ratio,
    };
    fullRedraw();
  };

  // ── Inicializar canvas ──────────────────────────────────────────
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    ctxRef.current = cv.getContext('2d');
    if (!pickedZoneRef.current) pickedZoneRef.current = document.createElement('canvas');
    _resize();
    const ro = new ResizeObserver(_resize);
    ro.observe(cv.parentElement);
    // addEventListener solo una vez; wheelHandlerRef.current siempre apunta al handler fresco
    cv.addEventListener('wheel', (e) => wheelHandlerRef.current?.(e), { passive: false });
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
    // `pickedStrokes` ya viene saneado del elemento activo (fallback [])
    pickedStrokes.forEach(s => {
      pctx.globalCompositeOperation = 'source-over';
      pctx.beginPath(); pctx.arc(s.cx, s.cy, s.r, 0, Math.PI*2);
      pctx.fillStyle = 'rgba(251,146,60,.45)'; pctx.fill();
      pctx.strokeStyle = 'rgba(234,88,12,.55)'; pctx.lineWidth = .8; pctx.stroke();
    });
  }, [pickedStrokes]);

  // ── Redraw completo ─────────────────────────────────────────────
  useEffect(() => {
    fullRedraw();
  });

  function fullRedraw() {
    const ctx = ctxRef.current;
    const cv  = cvRef.current;
    if (!ctx || !cv || !struct) return;
    // Leer dimensiones del canvas real (no de cvSize) → fix clearRect incompleto en zoom
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const W = cv.width / dpr;
    const H = cv.height / dpr;
    ctx.clearRect(0, 0, W, H);

    const p   = getParams();
    const bps = [];
    const sb  = { ox: 0, oy: 0, sw: 1, sh: 1 };

    // Aplicar transformacion zoom/pan
    const { scale, panX, panY } = zoomRef.current;
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);

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
    } else if (view === 'elevation') {
      if      (struct==='pilar-rect') drawElevationPilarRect(ctx,p,W,H,bps,sb);
      else if (struct==='viga')       drawViga(ctx,p,W,H,bps,sb);
      else {
        const fn={'pilar-circ':drawPilarCirc,'forjado':drawForjado,'zapata':drawZapata,'escalera':drawEscalera};
        fn[struct]?.(ctx,p,W,H,bps,sb);
      }
    } else if (view === 'lateral') {
      if (struct==='pilar-rect') drawLateralPilarRect(ctx,p,W,H,bps,sb);
    } else if (view === 'frontal') {
      if (struct==='pilar-rect') drawFrontalPilarRect(ctx,p,W,H,bps,sb);
    }

    barPosRef.current    = bps;
    secBoundsRef.current = sb;

    // Dispatches memoizados: solo cuando el valor cambia realmente.
    // Sin esto, cada dispatch provoca un nuevo render que llama a fullRedraw
    // otra vez → loop infinito que enmascara la persistencia del canvas.
    const newSbKey = `${sb.ox.toFixed(1)},${sb.oy.toFixed(1)},${sb.sw.toFixed(1)},${sb.sh.toFixed(1)}`;
    if (newSbKey !== secBoundsKeyRef.current) {
      secBoundsKeyRef.current = newSbKey;
      dispatch({ type: 'SET_SECTION_BOUNDS', payload: { ...sb } });
    }
    const newBpsKey = bps.map(b => b.id).join(',');
    if (newBpsKey !== barPosKeyRef.current) {
      barPosKeyRef.current = newBpsKey;
      dispatch({ type: 'SET_BAR_POSITIONS', payload: bps });
    }

    // Capa 2: zona pintada — clipped al rectángulo de sección
    const pc = pickedZoneRef.current;
    if (pc && pc.width > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(sb.ox, sb.oy, sb.sw, sb.sh);
      ctx.clip();
      ctx.globalAlpha = 1;
      ctx.drawImage(pc, 0, 0, W, H);
      ctx.restore();
    }

    // Capa 3: barras
    drawBarsLayer(ctx, bps, barStatus, selectedBars);

    // Capa 3b: estribos personalizados
    if (view === 'section') {
      drawCustomStirrups(ctx, customStirrups, bps);
    } else if (view === 'lateral' || view === 'elevation') {
      drawCustomStirrupsLateral(ctx, customStirrups, sb, p, view);
    }

    // Capa 4: fisuras
    drawCracks(ctx, cracks, crackPtsRef.current);

    // Capa 5: anotaciones
    drawAnnotations(ctx, annotations, annInput?.editId ?? null);

    ctx.restore(); // restaura la transformacion zoom/pan
  }

  // ── Posicion en canvas ──────────────────────────────────────────

  /** Posicion en pixels CSS del canvas (espacio de pantalla sin zoom) */
  function _rawPos(touchOrEvt) {
    const cv  = cvRef.current;
    const dpr = Math.min(window.devicePixelRatio||1, 3);
    const rect = cv.getBoundingClientRect();
    return {
      x: (touchOrEvt.clientX - rect.left) * (cv.width  / rect.width  / dpr),
      y: (touchOrEvt.clientY - rect.top)  * (cv.height / rect.height / dpr),
    };
  }

  /** Posicion en espacio de contenido (aplicando la inversa del zoom/pan) */
  function _pos(e) {
    const touch = e.touches?.[0] || e;
    const raw = _rawPos(touch);
    const { scale, panX, panY } = zoomRef.current;
    return { x: (raw.x - panX) / scale, y: (raw.y - panY) / scale };
  }

  function _hitBar(x, y) {
    return barPosRef.current.find(b => {
      const dx=b.cx-x, dy=b.cy-y;
      return Math.sqrt(dx*dx+dy*dy) <= b.r+4;
    });
  }

  function _hitAnnotation(x, y) {
    const ctx = ctxRef.current;
    if (!ctx) return null;
    for (let i = annotations.length - 1; i >= 0; i--) {
      const a = annotations[i];
      ctx.font = `600 12px ${FONT}`;
      const tw = ctx.measureText(a.text).width;
      const pad = 6;
      if (x >= a.x - pad && x <= a.x + tw + pad && y >= a.y - 16 && y <= a.y + 4) return a;
    }
    return null;
  }

  function _hitCustomStirrup(x, y) {
    // Solo en vistas lateral/elevation
    if (view !== 'lateral' && view !== 'elevation') return -1;
    if (!customStirrups.length) return -1;
    const p = getParams();
    const sb = secBoundsRef.current;
    const ih = clamp(p.inspection_height || 25, 5, 150);
    const VH = ih + 70, marg = 30;
    const yTop = sb.oy + (marg / VH) * sb.sh;
    const yBot = sb.oy + ((VH - marg) / VH) * sb.sh;
    for (let i = customStirrups.length - 1; i >= 0; i--) {
      const ny = customStirrups[i].ny ?? 0.5;
      const sy = yBot - ny * (yBot - yTop);
      if (Math.abs(y - sy) < 8 && x >= sb.ox - 15 && x <= sb.ox + sb.sw + 40) return i;
    }
    return -1;
  }

  // ── Eventos ─────────────────────────────────────────────────────
  function handlePointerDown(e) {
    e.preventDefault();

    // Registrar puntero en cache para detectar pellizco multi-tacto
    const raw = _rawPos(e);
    pointerCacheRef.current = [...pointerCacheRef.current.filter(p=>p.id!==e.pointerId),
                               { id: e.pointerId, x: raw.x, y: raw.y }];

    // Con 2 dedos: modo pellizco — no dibujar
    if (pointerCacheRef.current.length === 2) {
      const [p1, p2] = pointerCacheRef.current;
      const d0 = Math.hypot(p2.x-p1.x, p2.y-p1.y);
      const midX = (p1.x+p2.x)/2, midY = (p1.y+p2.y)/2;
      const { scale, panX, panY } = zoomRef.current;
      pinchInitRef.current = { scale, panX, panY, d0, midX, midY };
      drawingRef.current = false;
      return;
    }

    const { x, y } = _pos(e);

    // Cerrar menú contextual de nota al hacer clic en el canvas
    if (activeNoteMenu) setActiveNoteMenu(null);

    // RESTRICCIÓN: bloquear herramientas de barras/estribos en vistas lateral/section de elevación
    const isElevView = view === 'lateral' || view === 'frontal';

    // Arrastrar estribos individuales en vista lateral/elevation
    if (isElevView) {
      const csIdx = _hitCustomStirrup(x, y);
      if (csIdx >= 0) {
        dragStirrupRef.current = { index: csIdx };
        return;
      }
    }

    if (isElevView && (tool === 'select-bar')) return;

    if (tool === 'annotate' || tool === 'pick') {
      const ann = _hitAnnotation(x, y);
      if (ann) {
        if (activeNoteMenu) setActiveNoteMenu(null);
        dragAnnRef.current = { id: ann.id, startX: x, startY: y, moved: false };
        return;
      }
      if (tool === 'annotate') {
        const { scale, panX, panY } = zoomRef.current;
        setAnnInput({ x, y, text: '', editId: null,
          cssLeft: x * scale + panX, cssTop: (y - 16) * scale + panY });
        return;
      }
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

    // pick/erase fluye directamente a _paint sin interceptar barras

    drawingRef.current = true;
    lastPtRef.current = { x, y };
    _paint(x, y);
  }

  function handlePointerMove(e) {
    e.preventDefault();

    // Actualizar cache de punteros
    const raw = _rawPos(e);
    pointerCacheRef.current = pointerCacheRef.current.map(p =>
      p.id === e.pointerId ? { ...p, x: raw.x, y: raw.y } : p
    );

    // Pellizco con 2 dedos: zoom + pan
    if (pointerCacheRef.current.length === 2 && pinchInitRef.current) {
      const [p1, p2] = pointerCacheRef.current;
      const d1 = Math.hypot(p2.x-p1.x, p2.y-p1.y);
      const midX = (p1.x+p2.x)/2, midY = (p1.y+p2.y)/2;
      const init = pinchInitRef.current;
      if (d1 > 0) {
        const newScale = Math.max(0.25, Math.min(8, init.scale * (d1/init.d0)));
        const ratio = newScale / init.scale;
        const dMidX = midX - init.midX, dMidY = midY - init.midY;
        zoomRef.current = {
          scale: newScale,
          panX: init.midX - (init.midX - init.panX) * ratio + dMidX,
          panY: init.midY - (init.midY - init.panY) * ratio + dMidY,
        };
        fullRedraw();
      }
      return;
    }

    const { x, y } = _pos(e);

    // ── Drag estribo individual ──────────────────────────────────
    if (dragStirrupRef.current) {
      const p = getParams();
      const sb = secBoundsRef.current;
      const ih = clamp(p.inspection_height || 25, 5, 150);
      const VH = ih + 70, marg = 30;
      const yTop = sb.oy + (marg / VH) * sb.sh;
      const yBot = sb.oy + ((VH - marg) / VH) * sb.sh;
      const newNy = clamp((yBot - y) / (yBot - yTop), 0, 1);
      dispatch({ type: 'UPDATE_CUSTOM_STIRRUP', index: dragStirrupRef.current.index, changes: { ny: newNy } });
      fullRedraw();
      return;
    }

    // ── Drag vs Click de nota ────────────────────────────────────
    if (dragAnnRef.current) {
      const dx = x - dragAnnRef.current.startX;
      const dy = y - dragAnnRef.current.startY;
      if (!dragAnnRef.current.moved && Math.hypot(dx, dy) > 3) {
        dragAnnRef.current.moved = true;
        if (activeNoteMenu) setActiveNoteMenu(null);
      }
      if (dragAnnRef.current.moved) {
        dispatch({ type: 'UPDATE_ANNOTATION', id: dragAnnRef.current.id, changes: { x, y } });
      }
      return;
    }

    if (!drawingRef.current) {
      if ((tool === 'pick' || tool === 'annotate') && cvRef.current) {
        const hitAnn = _hitAnnotation(x, y);
        cvRef.current.style.cursor = hitAnn ? 'pointer' : cursorStyle;
      }
      return;
    }

    if (tool === 'crack' && crackPtsRef.current) {
      crackPtsRef.current = { ...crackPtsRef.current, x2: x, y2: y };
      fullRedraw();
      return;
    }

    if (tool === 'pick' || tool === 'erase') {
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
    // Limpiar cache de punteros
    pointerCacheRef.current = pointerCacheRef.current.filter(p => p.id !== e.pointerId);
    if (pointerCacheRef.current.length < 2) pinchInitRef.current = null;

    // ── Soltar estribo individual ────────────────────────────────
    if (dragStirrupRef.current) {
      dragStirrupRef.current = null;
      fullRedraw();
      return;
    }

    // ── Drag vs Click: resolver intención al soltar ──────────────
    if (dragAnnRef.current) {
      if (!dragAnnRef.current.moved) {
        // Clic limpio sin arrastre → abrir menú contextual
        const ann = annotations.find(a => a.id === dragAnnRef.current.id);
        if (ann) {
          const { scale, panX, panY } = zoomRef.current;
          setActiveNoteMenu({
            id: ann.id, x: ann.x, y: ann.y, text: ann.text,
            menuLeft: ann.x * scale + panX,
            menuTop: (ann.y - 20) * scale + panY,
          });
        }
      }
      dragAnnRef.current = null;
      fullRedraw();
      return;
    }

    if (!drawingRef.current) return;

    if (tool === 'crack' && crackPtsRef.current) {
      const c = crackPtsRef.current;
      const dx=c.x2-c.x1, dy=c.y2-c.y1;
      if (Math.sqrt(dx*dx+dy*dy) > 5) dispatch({ type: 'ADD_CRACK', payload: { ...c, view: view, bounds: { ...secBoundsRef.current } } });
      crackPtsRef.current = null;
    }

    drawingRef.current = false;
    lastPtRef.current  = null;
    fullRedraw();
  }

  function _paint(x, y) {
    const pc   = pickedZoneRef.current;
    if (!pc)   return;
    // Restringir pintura al rectángulo del plano
    const sb = secBoundsRef.current;
    if (x < sb.ox || x > sb.ox + sb.sw || y < sb.oy || y > sb.oy + sb.sh) return;
    const pctx = pc.getContext('2d');

    if (tool === 'pick') {
      pctx.globalCompositeOperation = 'source-over';
      pctx.beginPath(); pctx.arc(x, y, brush, 0, Math.PI*2);
      pctx.fillStyle = 'rgba(251,146,60,.45)'; pctx.fill();
      pctx.strokeStyle = 'rgba(234,88,12,.55)'; pctx.lineWidth = .8; pctx.stroke();
      dispatch({ type: 'ADD_PICKED_STROKE', payload: { cx: x, cy: y, r: brush, view: view, bounds: { ...secBoundsRef.current } } });
    } else if (tool === 'erase') {
      pctx.globalCompositeOperation = 'destination-out';
      pctx.beginPath(); pctx.arc(x, y, brush*1.5, 0, Math.PI*2);
      pctx.fillStyle = 'rgba(0,0,0,1)'; pctx.fill();
      pctx.globalCompositeOperation = 'source-over';
      const erR = brush * 1.5;
      dispatch({
        type: 'SET_PICKED_STROKES',
        payload: allPickedStrokes.filter(s => {
          if (s.view && s.view !== view) return true; // Mantener pintura de otras vistas
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
    pickHistRef.current.push([...allPickedStrokes]);
    dispatch({ type: 'CLEAR_CANVAS' });
  }

  function _confirmAnnotation(x, y, text, editId) {
    const t = text.trim();
    if (!t) return;
    if (editId) {
      dispatch({ type: 'UPDATE_ANNOTATION', id: editId, changes: { text: t } });
    } else {
      dispatch({ type: 'ADD_ANNOTATION', payload: { id: `note-${Date.now()}`, x, y, text: t, view: view, bounds: { ...secBoundsRef.current } } });
    }
  }

  const cursorStyle = tool === 'erase'
    ? 'cell'
    : tool === 'crack' || tool === 'annotate'
      ? 'crosshair'
      : 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\'%3E%3Ccircle cx=\'12\' cy=\'12\' r=\'10\' fill=\'none\' stroke=\'%23ea580c\' stroke-width=\'2\'/%3E%3C/svg%3E") 12 12, crosshair';

  const views = getViews(struct);

  return (
    <div className="canvas-editor">
      {/* Barra de herramientas */}
      <div className="cv-toolbar">
        <div className="cv-tools">
          {[
            { id:'pick',       icon:'🖌️', label:'Pintar'   },
            { id:'erase',      icon:'◻',  label:'Borrar'   },
            { id:'crack',      icon:'⚡',  label:'Fisura'   },
            { id:'annotate',   icon:'📝',  label:'Nota'     },
            { id:'select-bar', icon:'⊙',   label:'Sel. Barra'},
          ].map(t => (
            <button
              key={t.id}
              className={`cv-tool-btn ${tool===t.id?'active':''}`}
              onClick={() => dispatch({ type:'SET_TOOL', payload:t.id })}
              title={t.label}
            >
              <span className="cv-tool-icon">{t.icon}</span>
              <span className="cv-tool-label">{t.label}</span>
            </button>
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

        {tool==='select-bar' && (
          <div className="cv-stirrup-row">
            {selectedBars.length >= 2 && (
              <button
                className="cv-btn cv-btn-add-stirrup"
                onClick={() => {
                  dispatch({ type:'ADD_CUSTOM_STIRRUP', payload:{ barIds:[...selectedBars] } });
                  dispatch({ type:'SET_SELECTED_BARS', payload:[] });
                }}
              >
                + Estribo
              </button>
            )}
            {selectedBars.length > 0 && (
              <button
                className="cv-btn"
                onClick={() => dispatch({ type:'SET_SELECTED_BARS', payload:[] })}
              >
                ✕ Sel.
              </button>
            )}
            {customStirrups.length > 0 && (
              <button
                className="cv-btn danger"
                onClick={() => dispatch({ type:'CLEAR_CUSTOM_STIRRUPS' })}
                title="Borrar todos los estribos añadidos"
              >
                ✕ Estrib.
              </button>
            )}
            {selectedBars.length === 0 && customStirrups.length === 0 && (
              <span className="cv-label">Clic en 2+ barras, luego "+ Estribo"</span>
            )}
          </div>
        )}

        <div className="cv-actions">
          <button className="cv-btn" onClick={handleUndo} title="Deshacer último trazo">↩ Deshacer</button>
          <button className="cv-btn danger" onClick={handleClear} title="Limpiar vista actual">✕ Limpiar</button>
          <button
            className="cv-btn"
            title="Restablecer zoom (1:1)"
            onClick={() => { zoomRef.current = { scale:1, panX:0, panY:0 }; fullRedraw(); }}
          >⊡ 1:1</button>
        </div>

        {views.length > 1 && (
          <div className="cv-view-toggle" style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <ViewSelector3D
              struct={struct}
              view={view}
              onChangeView={v => dispatch({ type:'SET_VIEW', payload:v })}
            />
            <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
              {views.map(v => (
                <button
                  key={v.id}
                  className={`cv-view-btn ${view===v.id?'active':''}`}
                  onClick={() => dispatch({ type:'SET_VIEW', payload:v.id })}
                >{v.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Canvas */}
      <div className="cv-wrap" id="cvCont">
        <canvas
          ref={cvRef}
          style={{ cursor: cursorStyle, display:'block', width:'100%', touchAction:'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={e=>e.preventDefault()}
        />

        {/* Input inline para anotaciones */}
        {annInput && (
          <div
            className="ann-input-wrap"
            style={{ left: annInput.cssLeft ?? annInput.x, top: annInput.cssTop ?? (annInput.y - 16) }}
          >
            <input
              autoFocus
              className="ann-input"
              value={annInput.text}
              placeholder="Texto de anotación..."
              onChange={e => setAnnInput(v => ({ ...v, text: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  _confirmAnnotation(annInput.x, annInput.y, annInput.text, annInput.editId);
                  setAnnInput(null);
                } else if (e.key === 'Escape') {
                  setAnnInput(null);
                }
              }}
              onBlur={() => {
                _confirmAnnotation(annInput.x, annInput.y, annInput.text, annInput.editId);
                setAnnInput(null);
              }}
            />
            <span className="ann-input-hint">Enter para confirmar · Esc para cancelar</span>
          </div>
        )}

        {/* Menú contextual de nota */}
        {activeNoteMenu && (
          <div
            className="ann-note-menu"
            style={{ left: activeNoteMenu.menuLeft, top: activeNoteMenu.menuTop }}
            onPointerDown={e => e.stopPropagation()}
          >
            <button
              className="ann-menu-btn"
              onClick={() => {
                const { scale, panX, panY } = zoomRef.current;
                setAnnInput({
                  x: activeNoteMenu.x, y: activeNoteMenu.y,
                  text: activeNoteMenu.text, editId: activeNoteMenu.id,
                  cssLeft: activeNoteMenu.menuLeft,
                  cssTop: activeNoteMenu.menuTop,
                });
                setActiveNoteMenu(null);
              }}
            >
              ✏️ Editar
            </button>
            <div className="ann-menu-divider" />
            <button
              className="ann-menu-btn ann-menu-btn--danger"
              onClick={() => {
                dispatch({ type: 'DELETE_ANNOTATION', id: activeNoteMenu.id });
                setActiveNoteMenu(null);
              }}
            >
              🗑️ Eliminar
            </button>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="cv-info">
        {struct} · {views.find(v=>v.id===view)?.label || view}
        {pickedStrokes.length > 0 && (
          <span className="cv-pick-count"> · {pickedStrokes.length} trazos pintados</span>
        )}
      </div>
    </div>
  );
}
