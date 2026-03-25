/**
 * canvasEngine.js — 2D drawing engine for StructCAD Pro
 * Handles: HiDPI sizing, structure rendering, bars layer,
 * inspection overlay, pick-zone painting, cracks, annotations,
 * inner stirrup hooks, elevation view.
 */
'use strict';

import { appState, getParams } from './state.js';

const FONT = "'Inter',system-ui,sans-serif";
const MONO = "'IBM Plex Mono',ui-monospace,monospace";

let cvMain, ctx;

export function initCanvas(canvasEl) {
  cvMain = canvasEl;
  ctx = cvMain.getContext('2d');
}

/* ─── Sizing ──────────────────────────────────────────── */
export function resizeCV() {
  const cont = document.getElementById('cvCont');
  const W = cont.clientWidth;
  const H = Math.max(300, Math.min(W * 0.82, 520));
  cont.style.height = H + 'px';
  appState.W = W;
  appState.H = H;
  const dpr = appState.dpr;
  cvMain.width = W * dpr;
  cvMain.height = H * dpr;
  cvMain.style.width = W + 'px';
  cvMain.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function ensurePickSize() {
  const pc = appState.pickedZone;
  if (!pc) return;
  if (pc.width !== appState.W || pc.height !== appState.H) {
    pc.width = appState.W;
    pc.height = appState.H;
  }
}

export function initPickCanvas() {
  if (!appState.pickedZone) appState.pickedZone = document.createElement('canvas');
  appState.pickHistory = [];
}

/* ─── Seeded RNG for stable textures ─────────────────── */
function lcg(seed) {
  let s = seed;
  return () => { s = Math.imul(s, 1664525) + 1013904223; return (s >>> 0) / 4294967296; };
}

/* ─── Concrete texture ───────────────────────────────── */
function fillConcrete(x, y, w, h, clipFn) {
  ctx.save();
  if (clipFn) { clipFn(); ctx.clip(); }
  ctx.fillStyle = '#c4c0b8'; ctx.fillRect(x, y, w, h);
  const rng = lcg(9876);
  ctx.fillStyle = '#a8a49c';
  const n = Math.min(w * h / 16, 280);
  for (let i = 0; i < n; i++) {
    ctx.beginPath(); ctx.arc(x + rng() * w, y + rng() * h, rng() * 1.4 + .3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ─── Dimension helpers ──────────────────────────────── */
function dimH(x1, x2, y, lbl) {
  ctx.strokeStyle = '#868e96'; ctx.lineWidth = .7; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y - 3); ctx.lineTo(x1, y + 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2, y - 3); ctx.lineTo(x2, y + 3); ctx.stroke();
  ctx.fillStyle = '#495057'; ctx.font = `600 9px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText(lbl, (x1 + x2) / 2, y - 5);
}

function dimV(y1, y2, x, lbl) {
  ctx.strokeStyle = '#868e96'; ctx.lineWidth = .7; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 3, y1); ctx.lineTo(x + 3, y1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 3, y2); ctx.lineTo(x + 3, y2); ctx.stroke();
  ctx.fillStyle = '#495057'; ctx.font = `600 9px ${FONT}`;
  ctx.save(); ctx.translate(x + 5, (y1 + y2) / 2); ctx.rotate(Math.PI / 2);
  ctx.textAlign = 'center'; ctx.fillText(lbl, 0, 0); ctx.restore();
}

/* ─── Rounded rect ───────────────────────────────────── */
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}

/* ─── util ───────────────────────────────────────────── */
function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
function barR(diam, sc) { return Math.max(3.5, diam / 20 * sc * 0.45); }

/* ─── Inner stirrup hook ─────────────────────────────────
 * Draws a transverse branch between two bar centres.
 * The line is offset tangentially to the bar surface,
 * then curves into a 180° hook embracing the bar corrugation.
 */
function drawInnerBranch(cx1, cy1, cx2, cy2, r1, r2, lineW) {
  ctx.lineWidth = lineW;
  ctx.setLineDash([]);

  const dx = cx2 - cx1, dy = cy2 - cy1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;

  // unit tangent and normal
  const tx = dx / len, ty = dy / len;
  const nx = -ty, ny = tx;

  // hook radius = bar radius + half lineW, min 3px
  const hookR1 = Math.max(3, r1 + lineW * 0.5);
  const hookR2 = Math.max(3, r2 + lineW * 0.5);

  // start/end points on bar surfaces (approach tangentially)
  const sx = cx1 + tx * hookR1, sy = cy1 + ty * hookR1;
  const ex = cx2 - tx * hookR2, ey = cy2 - ty * hookR2;

  // straight shaft
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  // hook at bar 1 (180° arc around bar 1)
  const ang1 = Math.atan2(cy1 - sy, cx1 - sx);
  ctx.beginPath();
  ctx.arc(cx1, cy1, hookR1, ang1, ang1 + Math.PI, false);
  ctx.stroke();

  // hook at bar 2 (180° arc around bar 2)
  const ang2 = Math.atan2(cy2 - ey, cx2 - ex);
  ctx.beginPath();
  ctx.arc(cx2, cy2, hookR2, ang2, ang2 + Math.PI, false);
  ctx.stroke();
}

/* ════════════════════════════════════════════════════════
   DRAW FUNCTIONS — Section view
════════════════════════════════════════════════════════ */

function drawPilarRect(p, W, H) {
  const w = clamp(p.width || 88, 15, 300), d = clamp(p.depth || 68, 15, 300);
  const cf = clamp(p.cover_front || 5, 1, 12), cl = clamp(p.cover_lateral || 6, 1, 12);
  const nbf = clamp(p.bars_front_count || 5, 2, 16);
  const nbl = Math.max(0, p.bars_lateral_count || 0);
  const df = clamp(p.bars_front_diam || 20, 6, 40);
  const dl = clamp(p.bars_lateral_diam || 20, 6, 40);
  const ds = clamp(p.stirrup_diam || 6, 4, 20);
  const nRX = Math.max(0, p.inner_stirrups_x || 0);
  const nRY = Math.max(0, p.inner_stirrups_y || 0);
  const dR = clamp(p.inner_stirrup_diam || 6, 4, 16);

  const M = 50;
  const sc = Math.min((W - M * 2) / w, (H - M * 2) / d);
  const ox = (W - w * sc) / 2, oy = (H - d * sc) / 2;

  fillConcrete(ox, oy, w * sc, d * sc);
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2.5; ctx.setLineDash([]);
  ctx.strokeRect(ox, oy, w * sc, d * sc);

  // Perimeter stirrup
  const lw = Math.max(1.2, ds / 16 * sc * 0.3);
  ctx.strokeStyle = '#155e27'; ctx.lineWidth = lw;
  const ex = ox + cf * sc, ey = oy + cl * sc;
  const ew = w * sc - 2 * cf * sc, eh = d * sc - 2 * cl * sc;
  rrect(ex, ey, ew, eh, 2); ctx.stroke();

  dimH(ox, ox + w * sc, oy - 8, `${w} cm`);
  dimV(oy, oy + d * sc, ox + w * sc + 8, `${d} cm`);
  ctx.fillStyle = '#6c757d'; ctx.font = `500 8px ${MONO}`; ctx.textAlign = 'center';
  ctx.fillText(`r=${cf}`, ox + cf * sc / 2, oy - 1);

  // Bars: front top / front bottom
  const spf = nbf > 1 ? (w - 2 * cf) / (nbf - 1) : 0;
  const bpFT = [], bpFB = [];
  for (let i = 0; i < nbf; i++) {
    bpFT.push({ id: `FT${i+1}`, label: `FT${i+1}`, cx: ox + (cf + i * spf) * sc, cy: oy + cl * sc, r: barR(df, sc), diam: df, type: 'frontal-top' });
    bpFB.push({ id: `FB${i+1}`, label: `FB${i+1}`, cx: ox + (cf + i * spf) * sc, cy: oy + (d - cl) * sc, r: barR(df, sc), diam: df, type: 'frontal-bottom' });
  }
  bpFT.forEach(b => appState.barPositions.push(b));
  bpFB.forEach(b => appState.barPositions.push(b));

  // Lateral bars
  const bpLL = [], bpLR = [];
  if (nbl > 0) {
    const spl = (d - 2 * cl) / (nbl + 1);
    for (let i = 1; i <= nbl; i++) {
      const by = oy + (cl + i * spl) * sc;
      bpLL.push({ id: `LL${i}`, label: `LL${i}`, cx: ox + cf * sc, cy: by, r: barR(dl, sc), diam: dl, type: 'lateral-left' });
      bpLR.push({ id: `LR${i}`, label: `LR${i}`, cx: ox + (w - cf) * sc, cy: by, r: barR(dl, sc), diam: dl, type: 'lateral-right' });
    }
    bpLL.forEach(b => appState.barPositions.push(b));
    bpLR.forEach(b => appState.barPositions.push(b));
  }

  // Inner stirrups X (vertical branches) with hooks
  if (nRX > 0) {
    const innerLW = Math.max(1, dR / 16 * sc * 0.25);
    ctx.strokeStyle = '#6d28d9';
    const stepX = ew / (nRX + 1);
    for (let i = 1; i <= nRX; i++) {
      const bx = ex + stepX * i;
      // Find closest top & bottom bars for this x position
      let topBar = null, botBar = null;
      let minDistT = Infinity, minDistB = Infinity;
      bpFT.forEach(b => { const d2 = Math.abs(b.cx - bx); if (d2 < minDistT) { minDistT = d2; topBar = b; } });
      bpFB.forEach(b => { const d2 = Math.abs(b.cx - bx); if (d2 < minDistB) { minDistB = d2; botBar = b; } });
      if (topBar && botBar) {
        drawInnerBranch(bx, ey + topBar.r, bx, ey + eh - botBar.r, topBar.r, botBar.r, innerLW);
      } else {
        ctx.beginPath(); ctx.moveTo(bx, ey); ctx.lineTo(bx, ey + eh); ctx.strokeStyle = '#6d28d9'; ctx.lineWidth = innerLW; ctx.stroke();
      }
    }
  }

  // Inner stirrups Y (horizontal branches)
  if (nRY > 0) {
    const innerLW = Math.max(1, dR / 16 * sc * 0.25);
    ctx.strokeStyle = '#6d28d9';
    const stepY = eh / (nRY + 1);
    for (let i = 1; i <= nRY; i++) {
      const by = ey + stepY * i;
      let leftBar = null, rightBar = null;
      let minDistL = Infinity, minDistR = Infinity;
      bpLL.forEach(b => { const d2 = Math.abs(b.cy - by); if (d2 < minDistL) { minDistL = d2; leftBar = b; } });
      bpLR.forEach(b => { const d2 = Math.abs(b.cy - by); if (d2 < minDistR) { minDistR = d2; rightBar = b; } });
      if (leftBar && rightBar) {
        drawInnerBranch(ex + leftBar.r, by, ex + ew - rightBar.r, by, leftBar.r, rightBar.r, innerLW);
      } else {
        ctx.beginPath(); ctx.moveTo(ex, by); ctx.lineTo(ex + ew, by); ctx.strokeStyle = '#6d28d9'; ctx.lineWidth = innerLW; ctx.stroke();
      }
    }
  }
}

function drawPilarCirc(p, W, H) {
  const diam = clamp(p.diameter || 50, 20, 300), R = diam / 2;
  const cov = clamp(p.cover || 4, 1, 12);
  const nb = clamp(p.bars_count || 8, 4, 16);
  const db = clamp(p.bars_diam || 20, 6, 40);
  const ds = clamp(p.stirrup_diam || 8, 4, 20);
  const nI = Math.max(0, p.inner_stirrups || 0);
  const dI = clamp(p.inner_stirrup_diam || 6, 4, 16);

  const M = 45;
  const sc = Math.min((W - M * 2) / diam, (H - M * 2) / diam);
  const cx2 = W / 2, cy2 = H / 2;

  fillConcrete(cx2 - R * sc, cy2 - R * sc, diam * sc, diam * sc, () => {
    ctx.beginPath(); ctx.arc(cx2, cy2, R * sc, 0, Math.PI * 2);
  });
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2.5; ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(cx2, cy2, R * sc, 0, Math.PI * 2); ctx.stroke();

  ctx.strokeStyle = '#155e27'; ctx.lineWidth = Math.max(1.2, ds / 16 * sc * 0.3);
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.arc(cx2, cy2, (R - cov) * sc, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);

  // Bar positions
  const brs = [];
  const br = barR(db, sc);
  for (let i = 0; i < nb; i++) {
    const ang = 2 * Math.PI * i / nb - Math.PI / 2;
    brs.push({
      id: `B${i+1}`, label: `B${i+1}`,
      cx: cx2 + (R - cov) * sc * Math.cos(ang),
      cy: cy2 + (R - cov) * sc * Math.sin(ang),
      r: br, diam: db, type: 'radial'
    });
  }
  brs.forEach(b => appState.barPositions.push(b));

  // Inner diametral stirrups with hooks
  if (nI > 0) {
    const innerLW = Math.max(1, dI / 16 * sc * 0.25);
    ctx.strokeStyle = '#6d28d9';
    for (let i = 0; i < nI; i++) {
      const ang = Math.PI * i / nI;
      const rr = (R - cov) * sc;
      // Find the two bars closest to each end of the diameter
      const p1x = cx2 + rr * Math.cos(ang), p1y = cy2 + rr * Math.sin(ang);
      const p2x = cx2 - rr * Math.cos(ang), p2y = cy2 - rr * Math.sin(ang);
      let b1 = brs[0], b2 = brs[0], d1 = Infinity, d2 = Infinity;
      brs.forEach(b => {
        const dd1 = (b.cx - p1x) ** 2 + (b.cy - p1y) ** 2;
        const dd2 = (b.cx - p2x) ** 2 + (b.cy - p2y) ** 2;
        if (dd1 < d1) { d1 = dd1; b1 = b; }
        if (dd2 < d2) { d2 = dd2; b2 = b; }
      });
      drawInnerBranch(b1.cx, b1.cy, b2.cx, b2.cy, b1.r, b2.r, innerLW);
    }
  }

  dimH(cx2 - R * sc, cx2 + R * sc, cy2 + R * sc + 10, `Ø${diam} cm`);
}

function drawViga(p, W, H) {
  const w = clamp(p.width || 30, 15, 150), h = clamp(p.height || 60, 20, 300);
  const cov = clamp(p.cover || 3, 1, 10);
  const nbb = clamp(p.bars_bottom_count || 4, 2, 10);
  const nbt = clamp(p.bars_top_count || 2, 2, 10);
  const dbb = clamp(p.bars_bottom_diam || 20, 6, 40);
  const dbt = clamp(p.bars_top_diam || 16, 6, 40);
  const ds = clamp(p.stirrup_diam || 8, 4, 20);
  const nI = Math.max(0, p.inner_stirrups || 0);
  const dI = clamp(p.inner_stirrup_diam || 6, 4, 16);

  const M = 45;
  const sc = Math.min((W - M * 2) / w, (H - M * 2) / h);
  const ox = (W - w * sc) / 2, oy = (H - h * sc) / 2;

  fillConcrete(ox, oy, w * sc, h * sc);
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2.5; ctx.setLineDash([]);
  ctx.strokeRect(ox, oy, w * sc, h * sc);

  ctx.strokeStyle = '#155e27'; ctx.lineWidth = Math.max(1.2, ds / 16 * sc * 0.3);
  rrect(ox + cov * sc, oy + cov * sc, w * sc - 2 * cov * sc, h * sc - 2 * cov * sc, 2);
  ctx.stroke();

  dimH(ox, ox + w * sc, oy - 8, `${w} cm`);
  dimV(oy, oy + h * sc, ox + w * sc + 8, `${h} cm`);

  const spb = nbb > 1 ? (w - 2 * cov) / (nbb - 1) : 0;
  const spt = nbt > 1 ? (w - 2 * cov) / (nbt - 1) : 0;
  const bpBot = [], bpTop = [];
  for (let i = 0; i < nbb; i++)
    bpBot.push({ id: `B${i+1}`, label: `B${i+1}`, cx: ox + (cov + i * spb) * sc, cy: oy + (h - cov) * sc, r: barR(dbb, sc), diam: dbb, type: 'inferior' });
  for (let i = 0; i < nbt; i++)
    bpTop.push({ id: `T${i+1}`, label: `T${i+1}`, cx: ox + (cov + i * spt) * sc, cy: oy + cov * sc, r: barR(dbt, sc), diam: dbt, type: 'superior' });
  bpBot.forEach(b => appState.barPositions.push(b));
  bpTop.forEach(b => appState.barPositions.push(b));

  if (nI > 0) {
    const innerLW = Math.max(1, dI / 16 * sc * 0.25);
    ctx.strokeStyle = '#6d28d9';
    const step = (w - 2 * cov) / (nI + 1);
    for (let i = 1; i <= nI; i++) {
      const bx = ox + (cov + step * i) * sc;
      let topBar = bpTop[0], botBar = bpBot[0];
      let dT = Infinity, dB = Infinity;
      bpTop.forEach(b => { const dd = Math.abs(b.cx - bx); if (dd < dT) { dT = dd; topBar = b; } });
      bpBot.forEach(b => { const dd = Math.abs(b.cx - bx); if (dd < dB) { dB = dd; botBar = b; } });
      if (topBar && botBar) drawInnerBranch(bx, topBar.cy, bx, botBar.cy, topBar.r, botBar.r, innerLW);
    }
  }
}

function drawForjado(p, W, H) {
  const th = clamp(p.thickness || 25, 10, 60);
  const nx = clamp(p.bars_x_count || 10, 2, 30);
  const cb = clamp(p.cover_bottom || 3, 2, 10);
  const ct = clamp(p.cover_top || 3, 2, 10);
  const dx = clamp(p.bars_x_diam || 12, 6, 32);
  const spx = clamp(p.bars_x_spacing || 15, 5, 30);
  const ny = clamp(p.bars_y_count || 10, 2, 30);
  const dy = clamp(p.bars_y_diam || 12, 6, 32);

  const WR = Math.min((nx - 1) * spx + 30, 220);
  const M = 40;
  const sc = Math.min((W - M * 2) / WR, (H - M * 2) / th);
  const ox = (W - WR * sc) / 2, oy = (H - th * sc) / 2;

  fillConcrete(ox, oy, WR * sc, th * sc);
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2.5; ctx.strokeRect(ox, oy, WR * sc, th * sc);
  dimH(ox, ox + WR * sc, oy - 8, `rep. ${WR.toFixed(0)} cm`);
  dimV(oy, oy + th * sc, ox + WR * sc + 8, `e=${th} cm`);

  const ry = Math.max(2.5, dy / 20 * sc * 0.4);
  for (let i = 0; i < Math.min(ny, Math.floor(WR / (p.bars_y_spacing || 15)) + 1); i++) {
    const bx = ox + (15 + i * (p.bars_y_spacing || 15) * 0.8) * sc;
    if (bx > ox + WR * sc - 5) break;
    ctx.strokeStyle = '#6d28d9'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(bx - ry, oy + th * sc / 2); ctx.lineTo(bx + ry, oy + th * sc / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, oy + th * sc / 2 - ry); ctx.lineTo(bx, oy + th * sc / 2 + ry); ctx.stroke();
  }

  const r = Math.max(2.5, dx / 20 * sc * 0.4);
  for (let i = 0; i < nx; i++) {
    const bx = ox + (15 + i * spx) * sc;
    if (bx > ox + WR * sc - 5) break;
    appState.barPositions.push({ id: `Xi${i+1}`, label: `Xi${i+1}`, cx: bx, cy: oy + (th - cb) * sc, r, diam: dx, type: 'inferior' });
    appState.barPositions.push({ id: `Xs${i+1}`, label: `Xs${i+1}`, cx: bx, cy: oy + ct * sc, r, diam: dx, type: 'superior' });
  }
}

function drawZapata(p, W, H) {
  const L = clamp(p.length || 200, 50, 600);
  const Hh = clamp(p.height || 60, 30, 200);
  const cb = clamp(p.cover_bottom || 7, 3, 15);
  const cs = clamp(p.cover_sides || 7, 3, 15);
  const pw = clamp(p.pedestal_w || 40, 20, 100);
  const pd = clamp(p.pedestal_d || 40, 20, 100);
  const nx = clamp(p.bars_x_count || 8, 2, 20);
  const dx = clamp(p.bars_x_diam || 16, 6, 40);
  const ny = clamp(p.bars_y_count || 7, 2, 20);
  const dyy = clamp(p.bars_y_diam || 16, 6, 40);

  const M = 45;
  const sc = Math.min((W - M * 2) / L, (H - M * 2) / (Hh + 30));
  const ox = (W - L * sc) / 2, oy = H * 0.55 - Hh * sc / 2;

  fillConcrete(ox, oy, L * sc, Hh * sc);
  const px2 = ox + (L - pw) / 2 * sc, py2 = oy - 20;
  ctx.strokeStyle = '#868e96'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
  ctx.strokeRect(px2, py2, pw * sc, 20 + 5); ctx.setLineDash([]);
  ctx.fillStyle = '#868e96'; ctx.font = `500 8px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText(`Pilar ${pw}×${pd}`, px2 + pw * sc / 2, py2 - 3);

  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2.5; ctx.strokeRect(ox, oy, L * sc, Hh * sc);
  dimH(ox, ox + L * sc, oy + Hh * sc + 10, `${L} cm`);
  dimV(oy, oy + Hh * sc, ox + L * sc + 8, `${Hh} cm`);

  const spx = nx > 1 ? (L - 2 * cs) / (nx - 1) : 0;
  const r = Math.max(3, dx / 20 * sc * 0.45);
  for (let i = 0; i < nx; i++)
    appState.barPositions.push({ id: `X${i+1}`, label: `X${i+1}`, cx: ox + (cs + i * spx) * sc, cy: oy + (Hh - cb) * sc, r, diam: dx, type: 'x-dir' });

  const spy = ny > 1 ? (L - 2 * cs) / (ny - 1) : 0;
  const ry2 = Math.max(2.5, dyy / 20 * sc * 0.4);
  for (let i = 0; i < ny; i++) {
    const bx = ox + (cs + i * spy) * sc;
    appState.barPositions.push({ id: `Y${i+1}`, label: `Y${i+1}`, cx: bx, cy: oy + (Hh - cb - dx / 10) * sc - ry2 * 2.5, r: ry2, diam: dyy, type: 'y-dir' });
  }
}

function drawEscalera(p, W, H) {
  const riser = clamp(p.riser || 17, 14, 22);
  const tread = clamp(p.tread || 28, 25, 35);
  const n = clamp(p.steps_count || 5, 3, 15);
  const slabT = clamp(p.slab_thickness || 15, 10, 30);
  const covE = clamp(p.cover || 2.5, 1.5, 6);
  const dl = clamp(p.bars_long_diam || 12, 6, 20);
  const sl = clamp(p.bars_long_sep || 15, 10, 30);

  const totalW = n * tread, totalH = n * riser;
  const M = 40;
  const sc = Math.min((W - M * 2) / totalW, (H - M * 2) / (totalH + slabT));
  const ox = (W - totalW * sc) / 2;
  const baseY = (H + totalH * sc) / 2;

  for (let i = 0; i < n; i++) {
    const px = ox + i * tread * sc, py = baseY - (i + 1) * riser * sc;
    fillConcrete(px, py, tread * sc, riser * sc);
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.8; ctx.setLineDash([]); ctx.strokeRect(px, py, tread * sc, riser * sc);
  }

  const sOff = slabT * sc;
  ctx.strokeStyle = '#868e96'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 3]);
  ctx.beginPath(); ctx.moveTo(ox, baseY); ctx.lineTo(ox + totalW * sc, baseY - totalH * sc); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox, baseY + sOff); ctx.lineTo(ox + totalW * sc, baseY - totalH * sc + sOff); ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#495057'; ctx.font = `600 9px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText(`H=${riser} / A=${tread} cm   e=${slabT} cm`, ox + totalW * sc / 2, baseY - totalH * sc - 12);

  const nBars = Math.max(2, Math.floor(totalW / sl) + 1);
  const r = Math.max(3, dl / 20 * sc * 0.45);
  for (let i = 0; i < Math.min(nBars, 12); i++) {
    const t = i / (nBars - 1 || 1);
    appState.barPositions.push({
      id: `L${i+1}`, label: `L${i+1}`,
      cx: ox + t * totalW * sc, cy: baseY - t * totalH * sc + sOff * 0.5 + covE * sc,
      r, diam: dl, type: 'longitudinal'
    });
  }
}

/* ════════════════════════════════════════════════════════
   DRAW FUNCTIONS — Elevation view
════════════════════════════════════════════════════════ */

function drawElevationPilarRect(p, W, H) {
  const w2 = clamp(p.width || 88, 15, 300);
  const elev = Math.min(W * 0.4, 200); // synthetic height
  const cf = clamp(p.cover_front || 5, 1, 12);
  const nbf = clamp(p.bars_front_count || 5, 2, 16);
  const df = clamp(p.bars_front_diam || 20, 6, 40);
  const ds = clamp(p.stirrup_diam || 6, 4, 20);
  const sp = clamp(p.stirrup_spacing || 15, 5, 50);

  const M = 50;
  const sc = Math.min((W - M * 2) / w2, (H - M * 2) / elev);
  const ox = (W - w2 * sc) / 2, oy = (H - elev * sc) / 2;

  fillConcrete(ox, oy, w2 * sc, elev * sc);
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2.5; ctx.strokeRect(ox, oy, w2 * sc, elev * sc);
  dimH(ox, ox + w2 * sc, oy - 8, `${w2} cm`);
  dimV(oy, oy + elev * sc, ox + w2 * sc + 8, `${elev} cm synth.`);

  // Longitudinal bars (vertical lines)
  const spf = nbf > 1 ? (w2 - 2 * cf) / (nbf - 1) : 0;
  ctx.strokeStyle = '#1e40af'; ctx.lineWidth = Math.max(1.5, df / 20 * sc * 0.3);
  for (let i = 0; i < nbf; i++) {
    const bx = ox + (cf + i * spf) * sc;
    ctx.beginPath(); ctx.moveTo(bx, oy + 4); ctx.lineTo(bx, oy + elev * sc - 4); ctx.stroke();
  }

  // Stirrups (horizontal rectangles)
  const nSt = Math.max(1, Math.floor(elev / sp));
  ctx.strokeStyle = '#155e27'; ctx.lineWidth = Math.max(1, ds / 16 * sc * 0.25); ctx.setLineDash([]);
  for (let i = 0; i <= nSt; i++) {
    const by = oy + (sp * i % elev) * sc;
    ctx.strokeRect(ox + cf * sc, by, (w2 - 2 * cf) * sc, 3);
  }

  ctx.fillStyle = '#6c757d'; ctx.font = `500 9px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText(`Sep. estribos: ${sp} cm`, W / 2, oy + elev * sc + 16);
}

function drawElevationViga(p, W, H) {
  const beam_l = 250; // synthetic display length
  const bh = clamp(p.height || 60, 20, 300);
  const cov = clamp(p.cover || 3, 1, 10);
  const nbb = clamp(p.bars_bottom_count || 4, 2, 10);
  const dbb = clamp(p.bars_bottom_diam || 20, 6, 40);
  const ds = clamp(p.stirrup_diam || 8, 4, 20);
  const sp = clamp(p.stirrup_spacing || 15, 5, 50);

  const M = 40;
  const sc = Math.min((W - M * 2) / beam_l, (H - M * 2) / bh);
  const ox = (W - beam_l * sc) / 2, oy = (H - bh * sc) / 2;

  fillConcrete(ox, oy, beam_l * sc, bh * sc);
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2.5; ctx.strokeRect(ox, oy, beam_l * sc, bh * sc);
  dimH(ox, ox + beam_l * sc, oy - 8, `alzado (repr.)`);
  dimV(oy, oy + bh * sc, ox + beam_l * sc + 8, `${bh} cm`);

  // Long bars (horizontal)
  const spBar = nbb > 1 ? (beam_l - 2 * cov) / (nbb - 1) : 0;
  ctx.strokeStyle = '#1e40af'; ctx.lineWidth = Math.max(1.5, dbb / 20 * sc * 0.3);
  for (let i = 0; i < nbb; i++) {
    ctx.beginPath();
    ctx.moveTo(ox + cov * sc, oy + (bh - cov) * sc);
    ctx.lineTo(ox + (beam_l - cov) * sc, oy + (bh - cov) * sc);
    ctx.stroke();
    break; // all bars at same bottom
  }

  // Stirrups (vertical rectangles)
  const nSt = Math.max(1, Math.floor(beam_l / sp));
  ctx.strokeStyle = '#155e27'; ctx.lineWidth = Math.max(1, ds / 16 * sc * 0.25); ctx.setLineDash([]);
  for (let i = 0; i <= nSt; i++) {
    const bx = ox + cov * sc + (i * sp) * sc;
    if (bx > ox + (beam_l - cov) * sc) break;
    ctx.strokeRect(bx, oy + cov * sc, 3, (bh - 2 * cov) * sc);
  }

  ctx.fillStyle = '#6c757d'; ctx.font = `500 9px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText(`Sep. estribos: ${sp} cm`, W / 2, oy + bh * sc + 16);
}

/* ════════════════════════════════════════════════════════
   BARS LAYER
════════════════════════════════════════════════════════ */
function isInPickZone(x, y) {
  const pc = appState.pickedZone;
  if (!pc || pc.width === 0) return false;
  try {
    const d = pc.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data;
    return d[3] > 30;
  } catch { return false; }
}

function drawBarsLayer() {
  appState.barPositions.forEach(bar => {
    const st = appState.barStatus[bar.id] || 'unknown';
    const inPick = isInPickZone(bar.cx, bar.cy);

    let fill, stroke;
    if      (st === 'found')    { fill = 'rgba(21,128,61,.92)';  stroke = '#dcfce7'; }
    else if (st === 'notfound') { fill = 'rgba(239,68,68,.92)';  stroke = '#fecaca'; }
    else if (st === 'oxidized') { fill = 'rgba(245,158,11,.92)'; stroke = '#fef3c7'; }
    else                        { fill = 'rgba(30,64,175,.9)';   stroke = 'rgba(255,255,255,.85)'; }

    const dr = inPick ? bar.r * 1.15 : bar.r;
    if (inPick) { ctx.save(); ctx.shadowColor = fill; ctx.shadowBlur = 6; }
    ctx.beginPath(); ctx.arc(bar.cx, bar.cy, dr, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = inPick ? 1.8 : 1.2; ctx.stroke();
    if (inPick) ctx.restore();

    if (st === 'oxidized') {
      ctx.save();
      ctx.beginPath(); ctx.arc(bar.cx, bar.cy, dr, 0, Math.PI * 2); ctx.clip();
      ctx.strokeStyle = 'rgba(146,64,14,.5)'; ctx.lineWidth = .8;
      for (let dd = -dr; dd < dr; dd += 3) {
        ctx.beginPath(); ctx.moveTo(bar.cx + dd, bar.cy - dr); ctx.lineTo(bar.cx + dd + dr, bar.cy + dr); ctx.stroke();
      }
      ctx.restore();
    }

    const fs = Math.max(6, Math.min(dr * 0.78, 9));
    ctx.fillStyle = '#fff'; ctx.font = `700 ${fs}px ${MONO}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(bar.label, bar.cx, bar.cy);
    ctx.textBaseline = 'alphabetic';
  });
}

/* ════════════════════════════════════════════════════════
   INSPECTION OVERLAY
════════════════════════════════════════════════════════ */
function drawInspectionOverlay(p, W, H) {
  const cm = p.cover_measured || 0;
  const carb = p.carbonation_depth || 0;
  if (!cm && !carb) return;
  if (!appState.barPositions.length) return;

  if (appState.struct === 'pilar-rect' || appState.struct === 'viga') {
    const w2 = clamp(p.width || 30, 15, 300);
    const d2 = appState.struct === 'pilar-rect' ? clamp(p.depth || 68, 15, 300) : clamp(p.height || 60, 20, 300);
    const M = appState.struct === 'pilar-rect' ? 50 : 45;
    const sc = Math.min((W - M * 2) / w2, (H - M * 2) / d2);
    const ox = (W - w2 * sc) / 2, oy = (H - d2 * sc) / 2;

    if (cm > 0) {
      ctx.strokeStyle = '#ea580c'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      const cpx = cm * sc;
      ctx.beginPath(); ctx.moveTo(ox + 2, oy + d2 * sc - cpx); ctx.lineTo(ox + w2 * sc - 2, oy + d2 * sc - cpx); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox + cpx, oy + 2); ctx.lineTo(ox + cpx, oy + d2 * sc - 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ea580c'; ctx.font = `600 7px ${MONO}`; ctx.textAlign = 'left';
      ctx.fillText(`r real=${cm}cm`, ox + cpx + 3, oy + d2 * sc - cpx - 3);
    }
    if (carb > 0) {
      const carbPx = Math.min((carb / 10) * sc, Math.min(w2, d2) * sc / 2);
      ctx.fillStyle = 'rgba(156,163,175,0.18)';
      ctx.fillRect(ox, oy, w2 * sc, carbPx); ctx.fillRect(ox, oy + d2 * sc - carbPx, w2 * sc, carbPx);
      ctx.fillRect(ox, oy, carbPx, d2 * sc); ctx.fillRect(ox + w2 * sc - carbPx, oy, carbPx, d2 * sc);
    }
  }

  if (appState.struct === 'pilar-circ') {
    const diam = clamp(p.diameter || 50, 20, 300), R = diam / 2;
    const M = 45;
    const sc = Math.min((W - M * 2) / diam, (H - M * 2) / diam);
    const cx2 = W / 2, cy2 = H / 2;
    if (cm > 0) {
      ctx.strokeStyle = '#ea580c'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(cx2, cy2, (R - cm) * sc, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (carb > 0) {
      const carbCm = carb / 10;
      ctx.fillStyle = 'rgba(156,163,175,0.18)';
      ctx.beginPath(); ctx.arc(cx2, cy2, R * sc, 0, Math.PI * 2);
      ctx.arc(cx2, cy2, Math.max(0, (R - carbCm) * sc), 0, Math.PI * 2, true);
      ctx.fill();
    }
  }
}

/* ════════════════════════════════════════════════════════
   CRACKS
════════════════════════════════════════════════════════ */
function drawCracksOnCtx() {
  appState.cracks.forEach(c => {
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(c.x1, c.y1); ctx.lineTo(c.x2, c.y2); ctx.stroke();
    [{ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }].forEach(pt => {
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(pt.x - 3.5, pt.y - 3.5); ctx.lineTo(pt.x + 3.5, pt.y + 3.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pt.x + 3.5, pt.y - 3.5); ctx.lineTo(pt.x - 3.5, pt.y + 3.5); ctx.stroke();
    });
  });
  if (appState.crackPts) {
    ctx.strokeStyle = 'rgba(220,38,38,.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(appState.crackPts.x1, appState.crackPts.y1);
    ctx.lineTo(appState.crackPts.x2, appState.crackPts.y2); ctx.stroke(); ctx.setLineDash([]);
  }
}

/* ════════════════════════════════════════════════════════
   ANNOTATIONS
════════════════════════════════════════════════════════ */
function drawAnnotations() {
  appState.annotations.forEach((ann, i) => {
    ctx.save();
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = '#1e40af';
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 3;
    ctx.textAlign = 'left';
    ctx.strokeText(ann.text, ann.x, ann.y);
    ctx.fillText(ann.text, ann.x, ann.y);
    // Selection handle
    if (appState.draggingAnnotation === i) {
      ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1.5;
      const m = ctx.measureText(ann.text);
      ctx.strokeRect(ann.x - 2, ann.y - 14, m.width + 4, 18);
    }
    ctx.restore();
  });
}

/* ════════════════════════════════════════════════════════
   MAIN REDRAW
════════════════════════════════════════════════════════ */
export function fullRedraw() {
  if (!appState.struct) return;
  resizeCV();
  ensurePickSize();
  const W = appState.W, H = appState.H;
  ctx.clearRect(0, 0, W, H);
  appState.barPositions = [];

  const p = getParams();

  // Layer 1: Structure
  if (appState.view === 'section') {
    const fn = {
      'pilar-rect': drawPilarRect, 'pilar-circ': drawPilarCirc,
      'viga': drawViga, 'forjado': drawForjado,
      'zapata': drawZapata, 'escalera': drawEscalera
    };
    if (fn[appState.struct]) fn[appState.struct](p, W, H);
  } else {
    const fn = {
      'pilar-rect': drawElevationPilarRect,
      'viga': drawElevationViga,
    };
    if (fn[appState.struct]) {
      fn[appState.struct](p, W, H);
    } else {
      // fallback: draw section
      const fn2 = {
        'pilar-circ': drawPilarCirc, 'forjado': drawForjado,
        'zapata': drawZapata, 'escalera': drawEscalera
      };
      if (fn2[appState.struct]) fn2[appState.struct](p, W, H);
    }
  }

  // Layer 2: Pick strokes
  if (appState.pickedZone && appState.pickedZone.width > 0) {
    ctx.save(); ctx.globalAlpha = 1;
    ctx.drawImage(appState.pickedZone, 0, 0);
    ctx.restore();
  }

  // Layer 3: Bars
  drawBarsLayer();

  // Layer 4: Inspection overlay
  drawInspectionOverlay(p, W, H);

  // Layer 5: Cracks
  drawCracksOnCtx();

  // Layer 6: Annotations
  drawAnnotations();

  const infoEl = document.getElementById('cvInfo');
  if (infoEl) infoEl.textContent = `${appState.struct} · ${appState.view}`;
}

/* ════════════════════════════════════════════════════════
   PICK PAINTING
════════════════════════════════════════════════════════ */
export function paintAt(x, y) {
  ensurePickSize();
  const pc = appState.pickedZone; if (!pc) return;
  const pctx = pc.getContext('2d');
  const r = appState.brush;
  if (appState.tool === 'pick') {
    pctx.globalCompositeOperation = 'source-over';
    pctx.beginPath(); pctx.arc(x, y, r, 0, Math.PI * 2);
    pctx.fillStyle = 'rgba(251,146,60,.45)'; pctx.fill();
    pctx.strokeStyle = 'rgba(234,88,12,.55)'; pctx.lineWidth = .8; pctx.stroke();
  } else if (appState.tool === 'erase') {
    pctx.globalCompositeOperation = 'destination-out';
    pctx.beginPath(); pctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
    pctx.fillStyle = 'rgba(0,0,0,1)'; pctx.fill();
    pctx.globalCompositeOperation = 'source-over';
  }
}

export function savePickState() {
  ensurePickSize();
  const pc = appState.pickedZone; if (!pc || pc.width === 0) return;
  if (appState.pickHistory.length > 25) appState.pickHistory.shift();
  appState.pickHistory.push(pc.getContext('2d').getImageData(0, 0, pc.width, pc.height));
}

export function undoCV() {
  if (appState.pickHistory.length > 0) {
    appState.pickedZone.getContext('2d').putImageData(appState.pickHistory.pop(), 0, 0);
    fullRedraw();
  }
}

export function clearCV() {
  savePickState();
  if (appState.pickedZone) {
    appState.pickedZone.getContext('2d').clearRect(0, 0, appState.pickedZone.width, appState.pickedZone.height);
  }
  appState.cracks = []; appState.crackPts = null;
  fullRedraw();
}

/* ─── Canvas coordinate mapping ─────────────────────── */
export function cvPos(e) {
  const rect = cvMain.getBoundingClientRect();
  const scX = appState.W / rect.width, scY = appState.H / rect.height;
  const src = e.touches ? e.touches[0] : e;
  return { x: (src.clientX - rect.left) * scX, y: (src.clientY - rect.top) * scY };
}

/* ─── Annotation hit test ────────────────────────────── */
export function hitTestAnnotation(x, y) {
  // Returns index of annotation under (x,y) or -1
  const tmpCtx = document.createElement('canvas').getContext('2d');
  tmpCtx.font = `600 12px ${FONT}`;
  for (let i = appState.annotations.length - 1; i >= 0; i--) {
    const ann = appState.annotations[i];
    const m = tmpCtx.measureText(ann.text);
    if (x >= ann.x - 3 && x <= ann.x + m.width + 3 && y >= ann.y - 16 && y <= ann.y + 4) return i;
  }
  return -1;
}
