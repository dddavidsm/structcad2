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

/** Convierte "21, 18, 18, 21" → [21,18,18,21] o null si inválido/vacío */
function parseSpacings(raw) {
  if (!raw || !String(raw).trim()) return null;
  const arr = String(raw).split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0);
  return arr.length ? arr : null;
}
/** Posición acumulada: pos = start + sum(spacings[0..i-1]) */
function accumPos(start, spacings, i) {
  let pos = start;
  for (let j = 0; j < i; j++) pos += spacings[j];
  return pos;
}

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

  // ── Barras en sección cenital ──
  // Cara frontal: separaciones uniformes o personalizadas (spacings_front = nbf-1 valores)
  const spf = nbf>1 ? (w-2*v_cl)/(nbf-1) : 0;
  const spFront = parseSpacings(p.spacings_front);
  const useSpFront = spFront && spFront.length === nbf - 1;
  const ib = p.individualBars || {};
  const frontBXs = [];
  for (let i=0; i<nbf; i++) {
    const xPos = useSpFront ? accumPos(v_cl, spFront, i) : v_cl + i*spf;
    const bx = ox + xPos * sc;
    frontBXs.push(bx);
    const ftId=`FT${i+1}`, fbId=`FB${i+1}`;
    const dft=ib[ftId]?.diam||df, dfb=ib[fbId]?.diam||df;
    barPositionsOut.push({id:ftId,label:ftId,cx:bx,cy:oy+v_cf*sc,r:barR(dft,sc),diam:dft,type:'frontal-top'});
    barPositionsOut.push({id:fbId,label:fbId,cx:bx,cy:oy+(d-v_cf)*sc,r:barR(dfb,sc),diam:dfb,type:'frontal-bot'});
  }

  // Cara lateral: separaciones uniformes o personalizadas (spacings_lateral = nbl valores)
  // spacings_lateral[0] = gap de esquina a LL1, [k] = gap de LLk a LL(k+1)
  const latBYs = [];
  if (nbl>0) {
    const spl = (d-2*v_cf)/(nbl+1);
    const spLat = parseSpacings(p.spacings_lateral);
    const useSpLat = spLat && spLat.length === nbl;
    for (let i=1; i<=nbl; i++) {
      const yPos = useSpLat ? v_cf + accumPos(0, spLat, i) : v_cf + i*spl;
      const by = oy + yPos * sc;
      latBYs.push(by);
      const llId=`LL${i}`, lrId=`LR${i}`;
      const dll=ib[llId]?.diam||dl, dlr=ib[lrId]?.diam||dl;
      barPositionsOut.push({id:llId,label:llId,cx:ox+v_cl*sc,cy:by,r:barR(dll,sc),diam:dll,type:'lateral-left'});
      barPositionsOut.push({id:lrId,label:lrId,cx:ox+(w-v_cl)*sc,cy:by,r:barR(dlr,sc),diam:dlr,type:'lateral-right'});
    }
  }

  // ── Cotas inter-barras (PASO 1) ──────────────────────────────────
  // Frontales: debajo de la sección
  if (nbf > 1) {
    const dimYf = oy + d * sc + 14;
    for (let i = 0; i < nbf - 1; i++) {
      const gapPx = frontBXs[i + 1] - frontBXs[i];
      if (gapPx < 14) continue; // gap demasiado pequeño para cota legible
      const gapCm = gapPx / sc;
      const lbl = Math.abs(gapCm - Math.round(gapCm)) < 0.05 ? String(Math.round(gapCm)) : gapCm.toFixed(1);
      dimH(frontBXs[i], frontBXs[i + 1], dimYf, lbl);
    }
  }
  // Laterales: a la izquierda de la sección (incluye gap hasta corner inferior)
  if (nbl > 0) {
    const dimXl = ox - 14;
    const allLY = [oy + v_cf * sc, ...latBYs, oy + (d - v_cf) * sc];
    for (let i = 0; i < allLY.length - 1; i++) {
      const gapPx = allLY[i + 1] - allLY[i];
      if (gapPx < 14) continue;
      const gapCm = gapPx / sc;
      const lbl = Math.abs(gapCm - Math.round(gapCm)) < 0.05 ? String(Math.round(gapCm)) : gapCm.toFixed(1);
      dimV(allLY[i], allLY[i + 1], dimXl, lbl);
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
  const ib = p.individualBars || {};
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
    const bid=`B${i+1}`;
    const bDiam = ib[bid]?.diam || db;
    const defaultAng = 2*Math.PI*i/nb - Math.PI/2;
    const ang = ib[bid]?.angle !== undefined ? ib[bid].angle : defaultAng;
    brs.push({id:bid,label:bid,cx:cx2+(R-cov)*sc*Math.cos(ang),cy:cy2+(R-cov)*sc*Math.sin(ang),r:barR(bDiam,sc),diam:bDiam,angle:ang,type:'radial'});
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
  const ib = p.individualBars || {};
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
  const spBotArr = parseSpacings(p.spacings_bottom);
  const useSpBot = spBotArr && spBotArr.length === nbb - 1;
  const spTopArr = parseSpacings(p.spacings_top);
  const useSpTop = spTopArr && spTopArr.length === nbt - 1;

  const bbXs = [];
  for(let i=0;i<nbb;i++) {
    const xPos = useSpBot ? accumPos(cov, spBotArr, i) : cov + i*spb;
    const bid=`BB${i+1}`; const d=ib[bid]?.diam||dbb;
    const bx=ox+xPos*sc; bbXs.push(bx);
    barPositionsOut.push({id:bid,label:bid,cx:bx,cy:oy+(h-cov)*sc,r:barR(d,sc),diam:d,type:'bottom'});
  }
  const btXs = [];
  for(let i=0;i<nbt;i++) {
    const xPos = useSpTop ? accumPos(cov, spTopArr, i) : cov + i*spt;
    const bid=`BT${i+1}`; const d=ib[bid]?.diam||dbt;
    const bx=ox+xPos*sc; btXs.push(bx);
    barPositionsOut.push({id:bid,label:bid,cx:bx,cy:oy+cov*sc,r:barR(d,sc),diam:d,type:'top'});
  }
  // Cotas inter-barras inferiores
  if (nbb > 1) {
    const dimYb = oy + h*sc + 14;
    for(let i=0;i<nbb-1;i++) {
      const gapPx = bbXs[i+1] - bbXs[i]; if (gapPx < 14) continue;
      const gapCm = gapPx/sc;
      dimH(bbXs[i], bbXs[i+1], dimYb, Math.abs(gapCm-Math.round(gapCm))<0.05?String(Math.round(gapCm)):gapCm.toFixed(1));
    }
  }
}

// ── Forjado ───────────────────────────────────────────────────────
function drawForjado(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { fillConcrete, dimH, dimV } = makeDraw(ctx);
  const th=clamp(p.thickness||25,10,60);
  const spx=clamp(p.bars_x_spacing||15,5,30);
  const cb=clamp(p.cover_bottom||3,2,10);
  const ct=clamp(p.cover_top||3,2,10);
  const dx=clamp(p.bars_x_diam||12,6,32);
  const ib = p.individualBars || {};
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
    const bidB=`BX${i+1}`, bidT=`BXt${i+1}`;
    const dB=ib[bidB]?.diam||dx, dT=ib[bidT]?.diam||dx;
    barPositionsOut.push({id:bidB,label:bidB,cx:bx,cy:oy+(th-cb)*sc,r:barR(dB,sc),diam:dB,type:'bottom-x'});
    barPositionsOut.push({id:bidT,label:bidT,cx:bx,cy:oy+ct*sc,r:barR(dT,sc)*.7,diam:dT,type:'top-x'});
  }
}

// ── Zapata ────────────────────────────────────────────────────────
function drawZapata(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { fillConcrete, dimH, dimV } = makeDraw(ctx);
  const L=clamp(p.length||200,50,600), WW=clamp(p.width||160,50,600);
  const pw=clamp(p.pedestal_w||40,20,100), pd=clamp(p.pedestal_d||40,20,100);
  const cs=clamp(p.cover_sides||7,3,15);
  const ib = p.individualBars || {};
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
  for(let i=0;i<nx;i++) {
    const bid=`BX${i+1}`; const d=ib[bid]?.diam||dx;
    barPositionsOut.push({id:bid,label:bid,cx:ox+(cs+i*spx)*sc,cy:oy+WW*sc*.5,r:barR(d,sc)*.8,diam:d,type:'x'});
  }
  for(let i=0;i<ny;i++) {
    const bid=`BY${i+1}`; const d=ib[bid]?.diam||dy;
    barPositionsOut.push({id:bid,label:bid,cx:ox+L*sc*.5,cy:oy+(cs+i*spy)*sc,r:barR(d,sc)*.8,diam:d,type:'y'});
  }
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
  const ib = p.individualBars || {};
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
    const bid=`ES${i+1}`; const d=ib[bid]?.diam||db;
    barPositionsOut.push({id:bid,label:bid,cx:px+tread*sc*.5,cy:py+riser*sc*.5,r:barR(d,sc)*.7,diam:d,type:'long'});
  }
  dimH(ox,ox+tread*sc,oy+10,`${tread} cm`);
  dimV(oy-riser*sc,oy,ox-18,`${riser} cm`);
}

// ── Pilar Circular — Alzado ───────────────────────────────────────
function drawElevationPilarCirc(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { fillConcrete, dimH, dimV } = makeDraw(ctx);
  const diam=clamp(p.diameter||50,20,300), R=diam/2;
  const cov=clamp(p.cover||4,1,12);
  const nb=clamp(p.bars_count||8,4,16);
  const db=clamp(p.bars_diam||20,6,40);
  const ds=clamp(p.stirrup_diam||8,4,20);
  const sps=clamp(p.stirrup_spacing||10,5,50);
  const ih=clamp(p.inspection_height||25,5,150);
  const ib = p.individualBars || {};
  const VH=ih+70, marg=30;
  const M=40;
  const sc=Math.min((W-M*2)/diam,(H-M*2)/VH);
  const ox=(W-diam*sc)/2, oy=(H-VH*sc)/2;

  sectionBoundsOut.ox=ox; sectionBoundsOut.oy=oy;
  sectionBoundsOut.sw=diam*sc; sectionBoundsOut.sh=VH*sc;

  fillConcrete(ox,oy,diam*sc,marg*sc);
  fillConcrete(ox,oy+(VH-marg)*sc,diam*sc,marg*sc);
  ctx.fillStyle='rgba(200,200,200,.3)';
  ctx.fillRect(ox,oy+marg*sc,diam*sc,(VH-2*marg)*sc);
  ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=2; ctx.setLineDash([]);
  ctx.strokeRect(ox,oy,diam*sc,VH*sc);
  ctx.strokeStyle='#ea580c'; ctx.lineWidth=1.2; ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.moveTo(ox,oy+marg*sc); ctx.lineTo(ox+diam*sc,oy+marg*sc); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox,oy+(VH-marg)*sc); ctx.lineTo(ox+diam*sc,oy+(VH-marg)*sc); ctx.stroke();
  ctx.setLineDash([]);

  const yTop=oy+marg*sc, yBot=oy+(VH-marg)*sc;
  // Barras: posición X = R + (R-cov)*cos(ang), con ángulo real si está en individualBars
  for(let i=0;i<nb;i++){
    const bid=`B${i+1}`;
    const defaultAng = 2*Math.PI*i/nb - Math.PI/2;
    const ang = ib[bid]?.angle !== undefined ? ib[bid].angle : defaultAng;
    const xCm = R + (R-cov)*Math.cos(ang);
    const bDiam = ib[bid]?.diam || db;
    const bx = ox+xCm*sc;
    ctx.strokeStyle='#155e27'; ctx.lineWidth=Math.max(1.5,bDiam/16*sc*.4); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(bx,yTop); ctx.lineTo(bx,yBot); ctx.stroke();
  }
  // Estribos/cercos horizontales
  const estX1=ox+cov*sc, estX2=ox+(diam-cov)*sc;
  ctx.strokeStyle='#6d28d9'; ctx.lineWidth=Math.max(1,ds/16*sc*.25); ctx.setLineDash([6,3]);
  for(let y=yBot, n=0; y>=yTop-0.5 && n<60; y-=sps*sc, n++){
    ctx.beginPath(); ctx.moveTo(estX1,y); ctx.lineTo(estX2,y); ctx.stroke();
  }
  ctx.setLineDash([]);
  dimH(ox,ox+diam*sc,oy-20,`Ø${diam} cm`);
  dimV(oy+marg*sc,oy+(VH-marg)*sc,ox+diam*sc+22,`${ih} cm`);
  dimV(oy,oy+VH*sc,ox+diam*sc+36,`${VH} cm`);
  ctx.fillStyle='#6c757d'; ctx.font=`500 8px ${MONO}`; ctx.textAlign='center';
  ctx.fillText(`Alzado  (${nb}Ø${db}mm, cerco@${sps}cm)`,ox+diam*sc/2,oy+VH*sc+14);
}

// ── Viga — Alzado ─────────────────────────────────────────────────
function drawElevationViga(ctx, p, W, H, barPositionsOut, sectionBoundsOut) {
  const { fillConcrete, dimH, dimV } = makeDraw(ctx);
  const w=clamp(p.width||30,15,150), h=clamp(p.height||60,20,300);
  const cov=clamp(p.cover||3,1,10);
  const nbb=clamp(p.bars_bottom_count||4,2,10);
  const dbb=clamp(p.bars_bottom_diam||20,6,40);
  const nbt=clamp(p.bars_top_count||2,2,6);
  const dbt=clamp(p.bars_top_diam||16,6,40);
  const ds=clamp(p.stirrup_diam||8,4,20);
  const sps=clamp(p.stirrup_spacing||15,5,50);
  const il=clamp(p.inspection_length||100,5,500);
  const M=40;
  const mg=h*.8;  // zonas de hormigón visibles en extremos (80% de la altura)
  const sc=Math.min((W-M*2)/il,(H-M*2)/h);
  const ox=(W-il*sc)/2, oy=(H-h*sc)/2;

  sectionBoundsOut.ox=ox; sectionBoundsOut.oy=oy;
  sectionBoundsOut.sw=il*sc; sectionBoundsOut.sh=h*sc;

  const mgPx=mg*sc;
  fillConcrete(ox,oy,mgPx,h*sc);
  fillConcrete(ox+il*sc-mgPx,oy,mgPx,h*sc);
  ctx.fillStyle='rgba(200,200,200,.3)';
  ctx.fillRect(ox+mgPx,oy,il*sc-2*mgPx,h*sc);
  ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=2; ctx.setLineDash([]);
  ctx.strokeRect(ox,oy,il*sc,h*sc);
  ctx.strokeStyle='#ea580c'; ctx.lineWidth=1.2; ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.moveTo(ox+mgPx,oy); ctx.lineTo(ox+mgPx,oy+h*sc); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox+il*sc-mgPx,oy); ctx.lineTo(ox+il*sc-mgPx,oy+h*sc); ctx.stroke();
  ctx.setLineDash([]);

  // Barras inferiores e superiores como líneas horiz. a lo largo de la viga
  ctx.strokeStyle='#155e27'; ctx.lineWidth=Math.max(1.5,dbb/16*sc*.4); ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(ox,oy+(h-cov)*sc); ctx.lineTo(ox+il*sc,oy+(h-cov)*sc); ctx.stroke();
  ctx.lineWidth=Math.max(1.5,dbt/16*sc*.4);
  ctx.beginPath(); ctx.moveTo(ox,oy+cov*sc); ctx.lineTo(ox+il*sc,oy+cov*sc); ctx.stroke();
  // Estribos verticales
  const estY1=oy+cov*sc, estY2=oy+(h-cov)*sc;
  ctx.strokeStyle='#6d28d9'; ctx.lineWidth=Math.max(1,ds/16*sc*.25); ctx.setLineDash([6,3]);
  for(let x=ox+mgPx, n=0; x<=ox+il*sc-mgPx+0.5 && n<80; x+=sps*sc, n++){
    ctx.beginPath(); ctx.moveTo(x,estY1); ctx.lineTo(x,estY2); ctx.stroke();
  }
  ctx.setLineDash([]);
  dimH(ox+mgPx,ox+il*sc-mgPx,oy-20,`${il} cm`);
  dimH(ox,ox+il*sc,oy-32,`total ${(il+2*mg).toFixed(0)} cm`);
  dimV(oy,oy+h*sc,ox+il*sc+22,`${h} cm`);
  ctx.fillStyle='#6c757d'; ctx.font=`500 8px ${MONO}`; ctx.textAlign='center';
  ctx.fillText(`Alzado  (${nbb}Ø${dbb}+${nbt}Ø${dbt}mm, est@${sps}cm)`,ox+il*sc/2,oy+h*sc+14);
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
  const spFrontElev = parseSpacings(p.spacings_front);
  const useSpFrontElev = spFrontElev && spFrontElev.length === nbf - 1;
  const ibE = p.individualBars || {};
  for(let i=0;i<nbf;i++){
    const xPos = useSpFrontElev ? accumPos(cf, spFrontElev, i) : cf + i*spf;
    const bx=ox+xPos*sc;
    const bDiam = ibE[`FT${i+1}`]?.diam || df;
    ctx.strokeStyle='#155e27'; ctx.lineWidth=Math.max(1.5,bDiam/16*sc*.4); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(bx,oy+marg*sc); ctx.lineTo(bx,oy+(VH-marg)*sc); ctx.stroke();
  }

  // Estribos repetidos — adaptativos a posición real de barras
  const yTop=oy+marg*sc, yBot=oy+(VH-marg)*sc;
  const firstBarXe=cf, lastBarXe=useSpFrontElev?accumPos(cf,spFrontElev,nbf-1):cf+(nbf-1)*spf;
  const padElev=df/20+ds/20;
  const ex1=ox+(firstBarXe-padElev)*sc, ex2=ox+(lastBarXe+padElev)*sc;
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
  const ibL = p.individualBars || {};
  const dCorner1 = ibL['FT1']?.diam || df;
  const dCornerN = ibL[`FT${clamp(p.bars_front_count||5,2,16)}`]?.diam || df;
  ctx.strokeStyle='#155e27'; ctx.lineWidth=Math.max(1,dCorner1/16*sc*.3);
  ctx.beginPath(); ctx.moveTo(ox+cl*sc,oy+marg*sc); ctx.lineTo(ox+cl*sc,oy+(VH-marg)*sc); ctx.stroke();
  ctx.lineWidth=Math.max(1,dCornerN/16*sc*.3);
  ctx.beginPath(); ctx.moveTo(ox+(d-cl)*sc,oy+marg*sc); ctx.lineTo(ox+(d-cl)*sc,oy+(VH-marg)*sc); ctx.stroke();

  // Barras INTERMEDIAS (solo las nbl que introduce el usuario, sin esquinas)
  if (nbl>0) {
    const spl=(d-2*cl)/(nbl+1);
    const spLatElev = parseSpacings(p.spacings_lateral);
    const useSpLatElev = spLatElev && spLatElev.length === nbl;
    for(let i=1;i<=nbl;i++){
      const xPos = useSpLatElev ? cl + accumPos(0, spLatElev, i) : cl + i*spl;
      const bx=ox+xPos*sc;
      const bDiamL = ibL[`LL${i}`]?.diam || dl;
      ctx.strokeStyle='#2563eb'; ctx.lineWidth=Math.max(1,bDiamL/16*sc*.3);
      ctx.beginPath(); ctx.moveTo(bx,oy+marg*sc); ctx.lineTo(bx,oy+(VH-marg)*sc); ctx.stroke();
    }
  }

  // Estribos repetidos — adaptativos a posición real de barras
  const sps = clamp(p.stirrup_spacing||15,5,50);
  const yTop = oy+marg*sc, yBot = oy+(VH-marg)*sc;
  const allBarXsLat = [cl, d-cl];
  if (nbl>0) { const spl=(d-2*cl)/(nbl+1); const spLatElev=parseSpacings(p.spacings_lateral); const useSpLatElev=spLatElev&&spLatElev.length===nbl; for(let i=1;i<=nbl;i++) allBarXsLat.push(useSpLatElev?cl+accumPos(0,spLatElev,i):cl+i*spl); }
  const padLat = Math.max(df/20,dl/20)+ds/20;
  const ex1 = ox+(Math.min(...allBarXsLat)-padLat)*sc, ex2 = ox+(Math.max(...allBarXsLat)+padLat)*sc;
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

  const ibF = p.individualBars || {};
  const spf=nbf>1?(w-2*cf)/(nbf-1):0;
  const spFrontFront = parseSpacings(p.spacings_front);
  const useSpFrontFront = spFrontFront && spFrontFront.length === nbf - 1;
  for(let i=0;i<nbf;i++){
    const xPos = useSpFrontFront ? accumPos(cf, spFrontFront, i) : cf + i*spf;
    const bx=ox+xPos*sc;
    const bDiamF = ibF[`FT${i+1}`]?.diam || df;
    ctx.strokeStyle='#155e27'; ctx.lineWidth=Math.max(1,bDiamF/16*sc*.3);
    ctx.beginPath(); ctx.moveTo(bx,oy+marg*sc); ctx.lineTo(bx,oy+(VH-marg)*sc); ctx.stroke();
  }
  // Estribos — adaptativos a posición real de barras
  const firstBarXf=cf, lastBarXf=useSpFrontFront?accumPos(cf,spFrontFront,nbf-1):cf+(nbf-1)*spf;
  const padFront=df/20+ds/20;
  const estX1f=ox+(firstBarXf-padFront)*sc, estX2f=ox+(lastBarXf+padFront)*sc;
  ctx.strokeStyle='#6d28d9'; ctx.lineWidth=Math.max(1,ds/16*sc*.25); ctx.setLineDash([6,3]);
  ctx.beginPath(); ctx.moveTo(estX1f,oy+marg*sc); ctx.lineTo(estX2f,oy+marg*sc); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(estX1f,oy+(VH-marg)*sc); ctx.lineTo(estX2f,oy+(VH-marg)*sc); ctx.stroke();
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

// ── Mapeo barId → posición X en vista lateral/elevation ──────────
function getStirrupXRange(stirrup, sb, p, view) {
  const barIds = stirrup.barIds || [];
  if (barIds.length < 1) return null;

  const w  = clamp(p.width || 88, 15, 300);
  const d  = clamp(p.depth || 68, 15, 300);
  const cf = clamp(p.cover_front || 5, 1, 12);
  const cl = clamp(p.cover_lateral || 6, 1, 12);
  const ds = clamp(p.stirrup_diam || 6, 4, 20);
  const df = clamp(p.bars_front_diam || 20, 6, 40);
  const dl = clamp(p.bars_lateral_diam || 20, 6, 40);
  const nbf = clamp(p.bars_front_count || 5, 2, 16);
  const nbl = Math.max(0, p.bars_lateral_count || 0);

  // Spacings personalizados (misma lógica que las barras verticales)
  const spFront = parseSpacings(p.spacings_front);
  const useCustomFront = spFront && spFront.length === nbf - 1;
  const spLat   = parseSpacings(p.spacings_lateral);
  const useCustomLat = spLat && spLat.length === nbl;

  const positions = []; // cm a lo largo del eje horizontal de la vista

  if (view === 'lateral') {
    // Eje horizontal = profundidad (d)
    const dim = d;
    const sc  = sb.sw / dim;
    const spl = nbl > 0 ? (d - 2 * cl) / (nbl + 1) : 0;

    barIds.forEach(id => {
      const m = id.match(/^(FT|FB|LL|LR)(\d+)$/);
      if (!m) return;
      const [, type, ns] = m;
      const num = parseInt(ns);
      if (type === 'FT')      positions.push(cl);
      else if (type === 'FB') positions.push(d - cl);
      else if ((type === 'LL' || type === 'LR') && nbl > 0 && num >= 1 && num <= nbl)
        positions.push(useCustomLat ? cl + accumPos(0, spLat, num) : cl + num * spl);
    });

    if (!positions.length) return null;
    const pad = Math.max(df, dl) / 20 + ds / 20 + 0.5;
    const x1  = sb.ox + Math.max(0, Math.min(...positions) - pad) * sc;
    const x2  = sb.ox + Math.min(dim, Math.max(...positions) + pad) * sc;
    return x2 > x1 ? { x1, x2 } : null;

  } else if (view === 'elevation') {
    // Eje horizontal = ancho (w)
    const dim = w;
    const sc  = sb.sw / dim;
    const spf = nbf > 1 ? (w - 2 * cf) / (nbf - 1) : 0;

    barIds.forEach(id => {
      const m = id.match(/^(FT|FB|LL|LR)(\d+)$/);
      if (!m) return;
      const [, type, ns] = m;
      const num = parseInt(ns);
      if (type === 'FT' || type === 'FB')
        positions.push(useCustomFront && num > 1 ? accumPos(cf, spFront, num - 1) : cf + (num - 1) * spf);
      else if (type === 'LL')             positions.push(cf);
      else if (type === 'LR')             positions.push(w - cf);
    });

    if (!positions.length) return null;
    const pad = Math.max(df, dl) / 20 + ds / 20 + 0.5;
    const x1  = sb.ox + Math.max(0, Math.min(...positions) - pad) * sc;
    const x2  = sb.ox + Math.min(dim, Math.max(...positions) + pad) * sc;
    return x2 > x1 ? { x1, x2 } : null;
  }
  return null;
}

// ── Estribos individuales en vistas laterales/elevation ───────────
function drawCustomStirrupsLateral(ctx, customStirrups, sb, p, view) {
  if (!customStirrups.length) return;
  const ih = clamp(p.inspection_height || 25, 5, 150);
  const VH = ih + 70, marg = 30;
  const yTop = sb.oy + (marg / VH) * sb.sh;
  const yBot = sb.oy + ((VH - marg) / VH) * sb.sh;

  customStirrups.forEach((stirrup, idx) => {
    const range = getStirrupXRange(stirrup, sb, p, view);
    if (!range) return;
    const { x1, x2 } = range;
    const ny = stirrup.ny ?? 0.5;
    const y  = yBot - ny * (yBot - yTop); // ny=0 → abajo, ny=1 → arriba

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
    // Etiqueta a la izquierda del plano (borde izquierdo del sectionBounds)
    const labelX = sb.ox - 8;
    ctx.fillStyle = '#92400e'; ctx.font = `600 9px ${FONT}`; ctx.textAlign = 'right';
    ctx.fillText(`E${idx + 1}: ${distCm}cm`, labelX, y + 3);
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

/** True si barId es una barra de esquina (FT1, FTn, FB1, FBn) — no draggable */
function _isCornerBar(barId, nbf) {
  const m = barId.match(/^F[TB](\d+)$/);
  if (!m) return false;
  const i = parseInt(m[1]);
  return i === 1 || i === nbf;
}

// ─────────────────────────────────────────────────────────────────
//  COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────

export default function CanvasEditor() {
  const { state, dispatch, getParams, setFormValue } = useInspection();
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
  const dragBarRef     = useRef(null); // { barId, faceType, barIndex, moved, startX, startY, currentX/Y, sc, faceBars, minBound, maxBound, topCornerY?, botCornerY? }
  const panDragRef      = useRef(null); // { startRawX, startRawY, initPanX, initPanY }
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

  // ── Override de parámetros durante drag de barra (PASO 2) ──────
  function _computeOverrideP(p) {
    const db = dragBarRef.current;
    if (!db || !db.moved) return p;

    if (db.faceType === 'front') {
      const bars = db.faceBars; // FT bars sorted by index
      const newCxs = bars.map((b, i) => i === db.barIndex ? db.currentX : b.cx);
      const totalPx = newCxs[newCxs.length - 1] - newCxs[0];
      const w = clamp(p.width || 88, 15, 300);
      const cl = clamp(p.cover_lateral || 6, 1, 12);
      const estABarra = clamp(p.estriboABarra || 0, 0, 10);
      const totalCm = w - 2 * (cl + estABarra);
      if (totalCm <= 0 || totalPx <= 0) return p;
      const pxPerCm = totalPx / totalCm;
      const gaps = newCxs.slice(1).map((cx, i) => Math.max(0.1, (cx - newCxs[i]) / pxPerCm));
      return { ...p, spacings_front: gaps.map(g => g.toFixed(1)).join(', ') };
    } else if (db.faceType === 'lateral') {
      const bars = db.faceBars; // LL bars sorted by index
      const newCys = bars.map((b, i) => i === db.barIndex ? db.currentY : b.cy);
      const gaps = newCys.map((cy, i) => {
        const prevY = i === 0 ? db.topCornerY : newCys[i - 1];
        return Math.max(0.1, (cy - prevY) / db.sc);
      });
      return { ...p, spacings_lateral: gaps.map(g => g.toFixed(1)).join(', ') };
    } else if (db.faceType === 'circ-angle') {
      const ib = { ...(p.individualBars || {}) };
      ib[db.barId] = { ...(ib[db.barId] || {}), angle: db.currentAngle };
      return { ...p, individualBars: ib };
    } else if (db.faceType === 'viga-bottom') {
      const bars = db.faceBars;
      const newCxs = bars.map((b, i) => i === db.barIndex ? db.currentX : b.cx);
      if (newCxs.length < 2) return p;
      const totalPx = newCxs[newCxs.length-1] - newCxs[0];
      const w = clamp(p.width||30,15,150), cov2 = clamp(p.cover||3,1,10);
      const totalCm = w - 2*cov2;
      if (totalCm<=0||totalPx<=0) return p;
      const pxPerCm = totalPx/totalCm;
      const gaps = newCxs.slice(1).map((cx,i) => Math.max(0.5,(cx-newCxs[i])/pxPerCm));
      return { ...p, spacings_bottom: gaps.map(g=>g.toFixed(1)).join(', ') };
    } else if (db.faceType === 'viga-top') {
      const bars = db.faceBars;
      const newCxs = bars.map((b, i) => i === db.barIndex ? db.currentX : b.cx);
      if (newCxs.length < 2) return p;
      const totalPx = newCxs[newCxs.length-1] - newCxs[0];
      const w = clamp(p.width||30,15,150), cov2 = clamp(p.cover||3,1,10);
      const totalCm = w - 2*cov2;
      if (totalCm<=0||totalPx<=0) return p;
      const pxPerCm = totalPx/totalCm;
      const gaps = newCxs.slice(1).map((cx,i) => Math.max(0.5,(cx-newCxs[i])/pxPerCm));
      return { ...p, spacings_top: gaps.map(g=>g.toFixed(1)).join(', ') };
    } else {
      return p;
    }
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
    // Durante drag de barra: inyectar separaciones sobreescritas para preview en tiempo real
    const pDraw = (dragBarRef.current?.moved && view === 'section')
      ? _computeOverrideP(p) : p;
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
      fn[struct]?.(ctx, pDraw, W, H, bps, sb);
    } else if (view === 'elevation') {
      if      (struct==='pilar-rect') drawElevationPilarRect(ctx,pDraw,W,H,bps,sb);
      else if (struct==='pilar-circ') drawElevationPilarCirc(ctx,p,W,H,bps,sb);
      else if (struct==='viga')       drawElevationViga(ctx,p,W,H,bps,sb);
      else {
        const fn={'forjado':drawForjado,'zapata':drawZapata,'escalera':drawEscalera};
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
      if (Math.abs(y - sy) < 8) {
        const range = getStirrupXRange(customStirrups[i], sb, p, view);
        if (range && x >= range.x1 - 15 && x <= range.x2 + 40) return i;
      }
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

    // RESTRICCIÓN: bloquear herramientas de barras/estribos en vistas lateral/elevation
    const isElevView = view === 'lateral' || view === 'elevation';

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
        // Drag de barras longitudinales: solo en pilar-rect vista cenital
        if (struct === 'pilar-rect' && !isElevView) {
          const p = getParams();
          const nbf = clamp(p.bars_front_count || 5, 2, 16);
          const nbl = Math.max(0, p.bars_lateral_count || 0);
          const dpr = Math.min(window.devicePixelRatio || 1, 3);
          const cW = cvRef.current.width / dpr, cH = cvRef.current.height / dpr;
          const w = clamp(p.width || 88, 15, 300), d = clamp(p.depth || 68, 15, 300);
          const sc = Math.min((cW - 100) / w, (cH - 100) / d);

          if (/^F[TB]\d+$/.test(bar.id) && !_isCornerBar(bar.id, nbf) && nbf > 2) {
            // Barra frontal arrastrable (no esquina)
            const frontBars = barPosRef.current
              .filter(b => /^FT\d+$/.test(b.id))
              .sort((a, b) => parseInt(a.id.slice(2)) - parseInt(b.id.slice(2)));
            const barIndex = parseInt(bar.id.match(/\d+$/)[0]) - 1;
            const prev = frontBars[barIndex - 1], next = frontBars[barIndex + 1];
            dragBarRef.current = {
              barId: bar.id, faceType: 'front', barIndex, moved: false,
              startX: x, startY: y, currentX: bar.cx, sc, faceBars: frontBars,
              minX: prev.cx + prev.r + bar.r + 4,
              maxX: next.cx - bar.r - next.r - 4,
            };
            return;
          }

          if (/^L[LR]\d+$/.test(bar.id) && nbl > 0) {
            // Barra lateral arrastrable
            const latBars = barPosRef.current
              .filter(b => /^LL\d+$/.test(b.id))
              .sort((a, b) => parseInt(a.id.slice(2)) - parseInt(b.id.slice(2)));
            const barIndex = parseInt(bar.id.match(/\d+$/)[0]) - 1;
            const topCornerY = barPosRef.current.find(b => b.id === 'FT1')?.cy ?? 0;
            const botCornerY = barPosRef.current.find(b => b.id === 'FB1')?.cy ?? cH;
            const hitBar = latBars[barIndex];
            const prevLat = barIndex > 0 ? latBars[barIndex - 1] : null;
            const nextLat = barIndex < nbl - 1 ? latBars[barIndex + 1] : null;
            dragBarRef.current = {
              barId: bar.id, faceType: 'lateral', barIndex, moved: false,
              startX: x, startY: y, currentY: hitBar.cy, sc, faceBars: latBars,
              minY: prevLat ? prevLat.cy + prevLat.r + hitBar.r + 4 : topCornerY + hitBar.r + 4,
              maxY: nextLat ? nextLat.cy - hitBar.r - nextLat.r - 4 : botCornerY - hitBar.r - 4,
              topCornerY, botCornerY,
            };
            return;
          }
        }
        // ── Pilar circular: arrastrar ángulo de barra ──────────
        if (struct === 'pilar-circ' && !isElevView && /^B\d+$/.test(bar.id)) {
          const p2 = getParams();
          const dpr2 = Math.min(window.devicePixelRatio || 1, 3);
          const cW2 = cvRef.current.width / dpr2, cH2 = cvRef.current.height / dpr2;
          const ib2 = p2.individualBars || {};
          const idx2 = parseInt(bar.id.slice(1)) - 1;
          const nb2 = clamp(p2.bars_count || 8, 4, 16);
          const defaultAng2 = 2*Math.PI*idx2/nb2 - Math.PI/2;
          dragBarRef.current = {
            barId: bar.id, faceType: 'circ-angle', moved: false,
            startX: x, startY: y, cx2: cW2/2, cy2: cH2/2,
            currentAngle: ib2[bar.id]?.angle ?? defaultAng2,
          };
          return;
        }

        // ── Viga: arrastrar barra intermedia inferior/superior ──
        if (struct === 'viga' && !isElevView) {
          const pv = getParams();
          const nbbv = clamp(pv.bars_bottom_count || 4, 2, 10);
          const nbtv = clamp(pv.bars_top_count || 2, 2, 6);
          if (/^BB(\d+)$/.test(bar.id)) {
            const bbi = parseInt(bar.id.slice(2)) - 1;
            if (bbi > 0 && bbi < nbbv - 1 && nbbv > 2) {
              const bbBars = barPosRef.current
                .filter(b => /^BB\d+$/.test(b.id))
                .sort((a, b2) => parseInt(a.id.slice(2)) - parseInt(b2.id.slice(2)));
              const minGap = 6;
              dragBarRef.current = {
                barId: bar.id, faceType: 'viga-bottom', barIndex: bbi, moved: false,
                startX: x, startY: y, currentX: bar.cx, faceBars: bbBars,
                minX: (bbBars[bbi - 1]?.cx ?? 0) + minGap,
                maxX: (bbBars[bbi + 1]?.cx ?? 9999) - minGap,
              };
              return;
            }
          }
          if (/^BT(\d+)$/.test(bar.id)) {
            const bti = parseInt(bar.id.slice(2)) - 1;
            if (bti > 0 && bti < nbtv - 1 && nbtv > 2) {
              const btBars = barPosRef.current
                .filter(b => /^BT\d+$/.test(b.id))
                .sort((a, b2) => parseInt(a.id.slice(2)) - parseInt(b2.id.slice(2)));
              const minGap = 6;
              dragBarRef.current = {
                barId: bar.id, faceType: 'viga-top', barIndex: bti, moved: false,
                startX: x, startY: y, currentX: bar.cx, faceBars: btBars,
                minX: (btBars[bti - 1]?.cx ?? 0) + minGap,
                maxX: (btBars[bti + 1]?.cx ?? 9999) - minGap,
              };
              return;
            }
          }
        }

        // Barra de esquina u otra estructura: toggle selección directamente
        const next = selectedBars.includes(bar.id)
          ? selectedBars.filter(id => id !== bar.id)
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

    // pick/erase: solo dentro de la zona del plano → pintar; fuera → pan
    const sb = secBoundsRef.current;
    const inBounds = x >= sb.ox && x <= sb.ox + sb.sw && y >= sb.oy && y <= sb.oy + sb.sh;
    if ((tool === 'pick' || tool === 'erase') && inBounds) {
      drawingRef.current = true;
      lastPtRef.current = { x, y };
      _paint(x, y);
      return;
    }

    // Clic fuera de la zona del plano → iniciar pan
    const { scale: sc2, panX: px2, panY: py2 } = zoomRef.current;
    panDragRef.current = { startRawX: raw.x, startRawY: raw.y, initPanX: px2, initPanY: py2 };
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

    // ── Drag de barra longitudinal ───────────────────────────────
    if (dragBarRef.current) {
      const db = dragBarRef.current;
      const dx = x - db.startX, dy = y - db.startY;
      if (!db.moved && Math.hypot(dx, dy) > 3) db.moved = true;
      if (db.moved) {
        if (db.faceType === 'front' || db.faceType === 'viga-bottom' || db.faceType === 'viga-top') {
          db.currentX = clamp(db.startX + dx, db.minX, db.maxX);
        } else if (db.faceType === 'lateral') {
          db.currentY = clamp(db.startY + dy, db.minY, db.maxY);
        } else if (db.faceType === 'circ-angle') {
          db.currentAngle = Math.atan2(y - db.cy2, x - db.cx2);
        }
        if (cvRef.current) {
          const cur = {
            'front': 'ew-resize', 'lateral': 'ns-resize',
            'viga-bottom': 'ew-resize', 'viga-top': 'ew-resize',
            'circ-angle': 'grabbing',
          };
          cvRef.current.style.cursor = cur[db.faceType] || 'move';
        }
        fullRedraw();
      }
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

    // ── Pan drag ─────────────────────────────────────────────────
    if (panDragRef.current) {
      const pd = panDragRef.current;
      zoomRef.current = {
        ...zoomRef.current,
        panX: pd.initPanX + (raw.x - pd.startRawX),
        panY: pd.initPanY + (raw.y - pd.startRawY),
      };
      fullRedraw();
      return;
    }

    if (!drawingRef.current) {
      if ((tool === 'pick' || tool === 'annotate') && cvRef.current) {
        const hitAnn = _hitAnnotation(x, y);
        cvRef.current.style.cursor = hitAnn ? 'pointer' : cursorStyle;
      }
      // Cursor de arrastre para barras draggables en vista cenital
      if (tool === 'select-bar' && view === 'section' && cvRef.current) {
        const hitB = _hitBar(x, y);
        if (hitB) {
          const p0 = getParams();
          if (struct === 'pilar-rect') {
            const nbf = clamp(p0.bars_front_count || 5, 2, 16);
            if (/^F[TB]\d+$/.test(hitB.id) && !_isCornerBar(hitB.id, nbf)) {
              cvRef.current.style.cursor = 'ew-resize';
            } else if (/^L[LR]\d+$/.test(hitB.id)) {
              cvRef.current.style.cursor = 'ns-resize';
            } else {
              cvRef.current.style.cursor = 'pointer';
            }
          } else if (struct === 'pilar-circ') {
            cvRef.current.style.cursor = /^B\d+$/.test(hitB.id) ? 'grab' : 'pointer';
          } else if (struct === 'viga') {
            const nbbh = clamp(p0.bars_bottom_count || 4, 2, 10);
            const nbth = clamp(p0.bars_top_count || 2, 2, 6);
            const n0 = parseInt(hitB.id.match(/\d+$/)?.[0] || 0) - 1;
            cvRef.current.style.cursor =
              (/^BB\d+$/.test(hitB.id) && n0 > 0 && n0 < nbbh - 1 && nbbh > 2) ? 'ew-resize' :
              (/^BT\d+$/.test(hitB.id) && n0 > 0 && n0 < nbth - 1 && nbth > 2) ? 'ew-resize' : 'pointer';
          } else {
            cvRef.current.style.cursor = 'pointer';
          }
        } else {
          cvRef.current.style.cursor = 'default';
        }
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

    // ── Soltar pan ──────────────────────────────────────────────
    if (panDragRef.current) {
      panDragRef.current = null;
      return;
    }

    // ── Soltar estribo individual ────────────────────────────────
    if (dragStirrupRef.current) {
      dragStirrupRef.current = null;
      fullRedraw();
      return;
    }

    // ── Soltar barra longitudinal ────────────────────────────────
    if (dragBarRef.current) {
      const db = dragBarRef.current;

      if (db.moved) {
        // 1. Calcular separaciones finales MIENTRAS la ref sigue existiendo
        const overrideP = _computeOverrideP(getParams());
        if (db.faceType === 'front') {
          setFormValue('spacings_front', overrideP.spacings_front);
        } else if (db.faceType === 'lateral') {
          setFormValue('spacings_lateral', overrideP.spacings_lateral);
        } else if (db.faceType === 'circ-angle') {
          setFormValue('individualBars', overrideP.individualBars);
        } else if (db.faceType === 'viga-bottom') {
          setFormValue('spacings_bottom', overrideP.spacings_bottom);
        } else if (db.faceType === 'viga-top') {
          setFormValue('spacings_top', overrideP.spacings_top);
        }
      } else {
        // Click sin mover: toggle selección
        const next = selectedBars.includes(db.barId)
          ? selectedBars.filter(id => id !== db.barId)
          : [...selectedBars, db.barId];
        dispatch({ type: 'SET_SELECTED_BARS', payload: next });
      }

      // 2. AHORA limpiamos la ref y el cursor
      dragBarRef.current = null;
      if (cvRef.current) cvRef.current.style.cursor = '';
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
