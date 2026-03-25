/**
 * main.js — UI event controllers and nexus for StructCAD Pro
 * Wires DOM events → state → canvasEngine → UI updates.
 */
'use strict';

import {
  appState, STRUCTS, getParams,
  resetInspectionData, resetAll as _resetAll,
} from './state.js';

import {
  initCanvas, resizeCV, initPickCanvas, fullRedraw,
  paintAt, savePickState, undoCV, clearCV,
  cvPos, hitTestAnnotation,
} from './canvasEngine.js';

import { exportDXF, exportCSV } from './api.js';

/* ════════════════════════════════════════════════════════
   BOOT
════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  initCanvas(document.getElementById('cvMain'));
  resizeCV();
  initPickCanvas();
  _bindCanvasEvents();
  _bindAnnotationInputEvents();
  setStep(1);
});

window.addEventListener('resize', () => {
  if (appState.struct) fullRedraw(); else resizeCV();
});

/* ════════════════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════════════════ */
export function nav(id) {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('on'));
  document.getElementById('pg-' + id)?.classList.add('on');
  document.getElementById('nav-' + id)?.classList.add('on');
}

/* ════════════════════════════════════════════════════════
   STRUCTURE SELECTION
════════════════════════════════════════════════════════ */
export function selS(id) {
  const isNewStruct = appState.struct !== id;
  appState.struct = id;

  document.querySelectorAll('.sc').forEach(c => c.classList.remove('on'));
  document.getElementById('sc-' + id)?.classList.add('on');

  const def = STRUCTS[id];
  document.getElementById('ftitle').textContent = def.label;
  document.getElementById('ftag').textContent = def.label;
  document.getElementById('fa').style.display = 'block';

  if (isNewStruct) {
    resetInspectionData();
    initPickCanvas();
    appState.formValues = {}; // reset form values for new struct type
    appState.view = 'section';
    _syncViewButtons();
  }

  _curTab = 'geometria';
  _renderTabs(id);
  setStep(2);
  requestAnimationFrame(() => { fullRedraw(); updateBarStatusPanel(); });
}

/* ════════════════════════════════════════════════════════
   TABS & FORM — Values persist across tab switches
════════════════════════════════════════════════════════ */
let _curTab = 'geometria';

const _tabNames = { geometria: 'Geometría', armadura: 'Armadura', inspeccion: 'Inspección', obra: 'Obra' };
const _tabIcons = {
  geometria:  `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="12" height="12" rx="1"/></svg>`,
  armadura:   `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="4" x2="12" y2="4"/><line x1="2" y1="7" x2="12" y2="7"/><line x1="2" y1="10" x2="12" y2="10"/></svg>`,
  inspeccion: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5"/><path d="M7 4v3l2 1.5"/></svg>`,
  obra:       `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12V6l5-4 5 4v6"/><rect x="5" y="8" width="4" height="4"/></svg>`,
};

function _renderTabs(id) {
  const def = STRUCTS[id];
  // Save current values before destroying DOM
  _saveFormValues();
  document.getElementById('ftabs').innerHTML = Object.keys(def.tabs).map(k =>
    `<div class="tab${k === _curTab ? ' on' : ''}" data-tab="${k}">${_tabIcons[k]}${_tabNames[k]}</div>`
  ).join('');
  document.getElementById('ftabs').addEventListener('click', e => {
    const t = e.target.closest('[data-tab]');
    if (t) swTab(t.dataset.tab);
  }, { once: false });
  _renderPanel(id, _curTab);
}

function _renderPanel(id, tab) {
  const secs = STRUCTS[id].tabs[tab] || [];
  document.getElementById('fpanels').innerHTML = secs.map(sec =>
    `<div class="fs"><div class="fst">${sec.s}</div><div class="fg">${sec.f.map(_rf).join('')}</div></div>`
  ).join('');

  // Restore stored values or use defaults
  for (const tabSecs of Object.values(STRUCTS[id].tabs)) {
    for (const sec of tabSecs) {
      for (const f of sec.f) {
        const el = document.getElementById(f.id);
        if (!el) continue;
        const stored = appState.formValues[f.id];
        if (stored !== undefined) {
          el.value = stored;
        } else if (f.t === 'd' && !el.value) {
          el.value = new Date().toISOString().split('T')[0];
        }
      }
    }
  }

  // Bind change listeners
  document.querySelectorAll('#fpanels input, #fpanels select, #fpanels textarea').forEach(el => {
    el.addEventListener('input', _onFormChange);
    el.addEventListener('change', _onFormChange);
  });
}

function _rf(f) {
  const u = f.u ? `<span class="u">(${f.u})</span>` : '';
  const stored = appState.formValues[f.id];
  const val = stored !== undefined ? stored : (f.v !== undefined ? f.v : '');
  if (f.t === 'ta') return `<div class="f" style="grid-column:1/-1"><label>${f.l}</label><textarea id="${f.id}">${val}</textarea></div>`;
  if (f.t === 's')  return `<div class="f"><label>${f.l}</label><select id="${f.id}">${(f.opts||[]).map(o => `<option${o === val ? ' selected' : ''}>${o}</option>`).join('')}</select></div>`;
  if (f.t === 'd')  return `<div class="f"><label>${f.l}</label><input type="date" id="${f.id}" value="${val}"/></div>`;
  if (f.t === 'tx') return `<div class="f"><label>${f.l} ${u}</label><input type="text" id="${f.id}" value="${val}"/></div>`;
  return `<div class="f"><label>${f.l} ${u}</label><input type="number" id="${f.id}" min="${f.mn??''}" max="${f.mx??''}" step="${f.st||1}" value="${val}" inputmode="decimal"/></div>`;
}

function _saveFormValues() {
  if (!appState.struct) return;
  document.querySelectorAll('#fpanels input, #fpanels select, #fpanels textarea').forEach(el => {
    if (el.id) {
      appState.formValues[el.id] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
    }
  });
}

let _rT = 0;
function _onFormChange() {
  _saveFormValues();
  cancelAnimationFrame(_rT);
  _rT = requestAnimationFrame(() => { fullRedraw(); updateBarStatusPanel(); });
}

export function swTab(t) {
  _saveFormValues();
  _curTab = t;
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('on', el.dataset.tab === t));
  _renderPanel(appState.struct, t);
  requestAnimationFrame(() => { fullRedraw(); updateBarStatusPanel(); });
}

/* ════════════════════════════════════════════════════════
   VIEW TOGGLE (section / elevation)
════════════════════════════════════════════════════════ */
export function setView(v) {
  appState.view = v;
  _syncViewButtons();
  fullRedraw();
}

function _syncViewButtons() {
  document.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('on', b.dataset.view === appState.view);
  });
}

/* ════════════════════════════════════════════════════════
   CANVAS TOOLS
════════════════════════════════════════════════════════ */
export function setTool(t) {
  appState.tool = t;
  document.querySelectorAll('.tool[id^="t-"]').forEach(b => b.classList.remove('on'));
  document.getElementById('t-' + t)?.classList.add('on');

  // Show annotation input helper
  const cvCont = document.getElementById('cvCont');
  if (t === 'annotate') {
    cvCont.style.cursor = 'crosshair';
  } else {
    cvCont.style.cursor = '';
    _hideAnnotationInput();
  }
}

export function setBrush(s) {
  appState.brush = s;
  document.querySelectorAll('.bs-dot').forEach(b => b.classList.remove('on'));
  document.getElementById('b-' + (s <= 10 ? 's' : s <= 22 ? 'm' : 'l'))?.classList.add('on');
}

export { undoCV, clearCV };

/* ════════════════════════════════════════════════════════
   CANVAS EVENT HANDLERS
════════════════════════════════════════════════════════ */
function _bindCanvasEvents() {
  const cv = document.getElementById('cvMain');
  cv.addEventListener('mousedown',  _cvDown,   { passive: false });
  cv.addEventListener('mousemove',  _cvMove,   { passive: false });
  cv.addEventListener('mouseup',    _cvUp,     { passive: false });
  cv.addEventListener('mouseleave', _cvUp,     { passive: false });
  cv.addEventListener('touchstart', _cvDown,   { passive: false });
  cv.addEventListener('touchmove',  _cvMove,   { passive: false });
  cv.addEventListener('touchend',   _cvUp,     { passive: false });
  cv.addEventListener('touchcancel',_cvUp,     { passive: false });
}

function _cvDown(e) {
  e.preventDefault();
  const pos = cvPos(e);

  if (appState.tool === 'annotate') {
    _showAnnotationInput(pos.x, pos.y);
    return;
  }

  // Check annotation drag
  if (appState.tool === 'pick' || appState.tool === 'erase') {
    const hitIdx = hitTestAnnotation(pos.x, pos.y);
    if (hitIdx >= 0) {
      appState.draggingAnnotation = hitIdx;
      appState.drawing = true;
      appState.lastPt = pos;
      return;
    }
  }

  appState.drawing = true;
  appState.lastPt = pos;
  setStep(3); // user is now in the "zona picada" step
  if (appState.tool === 'crack') {
    appState.crackPts = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
  } else {
    savePickState();
    paintAt(pos.x, pos.y);
    fullRedraw();
  }
}

function _cvMove(e) {
  e.preventDefault();
  if (!appState.drawing) return;
  const pos = cvPos(e);

  // Drag annotation
  if (appState.draggingAnnotation !== null) {
    const ann = appState.annotations[appState.draggingAnnotation];
    if (ann) {
      ann.x += pos.x - (appState.lastPt?.x || pos.x);
      ann.y += pos.y - (appState.lastPt?.y || pos.y);
      appState.lastPt = pos;
      fullRedraw(); return;
    }
  }

  if (appState.tool === 'crack' && appState.crackPts) {
    appState.crackPts.x2 = pos.x; appState.crackPts.y2 = pos.y;
    fullRedraw(); return;
  }

  if (appState.lastPt) {
    const dx = pos.x - appState.lastPt.x, dy = pos.y - appState.lastPt.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.floor(dist / (appState.brush * 0.3)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      paintAt(appState.lastPt.x + dx * t, appState.lastPt.y + dy * t);
    }
  } else {
    paintAt(pos.x, pos.y);
  }
  appState.lastPt = pos;
  fullRedraw();
}

function _cvUp(e) {
  if (e) e.preventDefault();
  if (appState.tool === 'crack' && appState.crackPts && appState.drawing) {
    const dx = appState.crackPts.x2 - appState.crackPts.x1;
    const dy = appState.crackPts.y2 - appState.crackPts.y1;
    if (Math.sqrt(dx * dx + dy * dy) > 5) {
      appState.cracks.push({ ...appState.crackPts });
      updateCrackList();
    }
    appState.crackPts = null;
    fullRedraw();
  }
  appState.drawing = false;
  appState.lastPt = null;
  appState.draggingAnnotation = null;
}

/* ════════════════════════════════════════════════════════
   ANNOTATION INPUT (floating HTML input on canvas)
════════════════════════════════════════════════════════ */
let _pendingAnnotationPos = null;

function _bindAnnotationInputEvents() {
  const inp = document.getElementById('annotationInput');
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); _commitAnnotation(); }
    if (e.key === 'Escape') { _hideAnnotationInput(); }
  });
  inp.addEventListener('blur', () => {
    // Commit on blur with a small delay (avoid race with click)
    setTimeout(_commitAnnotation, 150);
  });
}

function _showAnnotationInput(canvasX, canvasY) {
  const cvCont = document.getElementById('cvCont');
  const rect = cvCont.getBoundingClientRect();
  const scX = rect.width / appState.W, scY = rect.height / appState.H;

  const inp = document.getElementById('annotationInput');
  inp.style.left = (canvasX * scX + rect.left - cvCont.getBoundingClientRect().left) + 'px';
  inp.style.top  = (canvasY * scY - 20) + 'px';
  inp.style.display = 'block';
  inp.value = '';
  _pendingAnnotationPos = { x: canvasX, y: canvasY };
  requestAnimationFrame(() => inp.focus());
}

function _hideAnnotationInput() {
  const inp = document.getElementById('annotationInput');
  inp.style.display = 'none';
  _pendingAnnotationPos = null;
}

function _commitAnnotation() {
  const inp = document.getElementById('annotationInput');
  const text = inp.value.trim();
  if (text && _pendingAnnotationPos) {
    appState.annotations.push({ text, x: _pendingAnnotationPos.x, y: _pendingAnnotationPos.y });
    fullRedraw();
  }
  _hideAnnotationInput();
  setTool('pick'); // return to normal tool
}

/* ════════════════════════════════════════════════════════
   BAR STATUS PANEL
════════════════════════════════════════════════════════ */
export function updateBarStatusPanel() {
  const grid = document.getElementById('barStatusGrid');
  if (!appState.barPositions.length) {
    grid.innerHTML = '<div style="font-size:.75rem;color:var(--g500);grid-column:1/-1;text-align:center;padding:.5rem">Configure los parámetros de armadura</div>';
    document.getElementById('barSumTag').textContent = '— barras';
    return;
  }
  document.getElementById('barSumTag').textContent = `${appState.barPositions.length} barras`;
  grid.innerHTML = appState.barPositions.map(bar => {
    const st = appState.barStatus[bar.id] || 'unknown';
    const cls = st === 'found' ? 'found' : st === 'notfound' ? 'notfound' : st === 'oxidized' ? 'oxidized' : '';
    const ico = st === 'found' ? '✓' : st === 'notfound' ? '✗' : st === 'oxidized' ? '⚠' : '?';
    return `<div class="bar-stat ${cls}" data-barid="${bar.id}">
      <div class="bs-label">${ico} ${bar.label}</div>
      <div class="bs-pos">Ø${bar.diam}</div>
    </div>`;
  }).join('');

  // Bind toggle clicks via delegation
  grid.onclick = e => {
    const el = e.target.closest('[data-barid]');
    if (el) toggleBar(el.dataset.barid);
  };
}

export function toggleBar(id) {
  const cycle = ['unknown', 'found', 'notfound', 'oxidized'];
  const cur = appState.barStatus[id] || 'unknown';
  appState.barStatus[id] = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
  updateBarStatusPanel();
  fullRedraw();
}

/* ════════════════════════════════════════════════════════
   CRACK LIST
════════════════════════════════════════════════════════ */
export function updateCrackList() {
  const panel = document.getElementById('crackPanel');
  const list  = document.getElementById('crackList');
  if (!appState.cracks.length) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  list.innerHTML = appState.cracks.map((c, i) => {
    const lg = Math.sqrt((c.x2 - c.x1) ** 2 + (c.y2 - c.y1) ** 2).toFixed(0);
    return `<div class="crack-item">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 2l2 4-3 2 4 4"/></svg>
      Fisura ${i + 1} — ${lg}px
      <button class="crack-del" data-idx="${i}">×</button>
    </div>`;
  }).join('');
  list.onclick = e => {
    const btn = e.target.closest('[data-idx]');
    if (btn) delCrack(parseInt(btn.dataset.idx));
  };
}

export function delCrack(i) {
  appState.cracks.splice(i, 1);
  updateCrackList();
  fullRedraw();
}

/* ════════════════════════════════════════════════════════
   STEPS INDICATOR
════════════════════════════════════════════════════════ */
export function setStep(n) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById('s' + i);
    if (!el) continue;
    el.classList.remove('on', 'done');
    if (i < n) el.classList.add('done'); else if (i === n) el.classList.add('on');
  }
}

function _setGenSt(st, msg) {
  const dotCls = { spin: 'spin', ok: 'ok', err: 'err' }[st] || 'idle';
  document.getElementById('gdot').className = 'sdot ' + dotCls;
  document.getElementById('gstxt').textContent = msg;
}

/* ════════════════════════════════════════════════════════
   DXF GENERATION
════════════════════════════════════════════════════════ */
export async function generarDXF() {
  const btn = document.getElementById('btnDXF');
  btn.disabled = true;
  setStep(4);
  const result = await exportDXF(_setGenSt);
  btn.disabled = false;
  if (result?.ok) _saveToHistory(result.params, result.label);
}

/* ════════════════════════════════════════════════════════
   PHOTO
════════════════════════════════════════════════════════ */
export function loadPh(inp) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    document.getElementById('phImg').src = e.target.result;
    document.getElementById('phPrev').style.display = 'block';
    document.getElementById('upz').style.display = 'none';
  };
  r.readAsDataURL(f);
}

export function clearPh() {
  document.getElementById('phPrev').style.display = 'none';
  document.getElementById('upz').style.display = 'block';
  document.getElementById('upInput').value = '';
}

export function doDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f) {
    const dt = new DataTransfer(); dt.items.add(f);
    const inp = document.getElementById('upInput');
    inp.files = dt.files;
    loadPh(inp);
  }
}

/* ════════════════════════════════════════════════════════
   HISTORY
════════════════════════════════════════════════════════ */
function _saveToHistory(p, label) {
  const sec = appState.struct === 'pilar-rect' ? `${p.width}×${p.depth}cm` :
    appState.struct === 'pilar-circ' ? `Ø${p.diameter}cm` :
    appState.struct === 'viga'       ? `${p.width}×${p.height}cm` :
    appState.struct === 'escalera'   ? `${p.riser}×${p.tread}cm` : '—';
  appState.history.push({
    id: Date.now(),
    fecha: new Date().toLocaleDateString('es'),
    tipo: label, ref: p.element_id || '—', sec,
    found: Object.values(appState.barStatus).filter(v => v === 'found').length,
    fisuras: appState.cracks.length,
  });
  renderHistory();
}

export function renderHistory() {
  const b = document.getElementById('histBody');
  const totalEl = document.getElementById('totalReg');
  const hcountEl = document.getElementById('hcount');
  if (!appState.history.length) {
    b.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--g500);padding:1.5rem">Sin registros</td></tr>';
    if (totalEl) totalEl.textContent = '0';
    if (hcountEl) hcountEl.textContent = '0';
    return;
  }
  b.innerHTML = appState.history.map(r => `<tr>
    <td class="mono">${r.ref}</td><td>${r.tipo}</td><td class="mono">${r.fecha}</td>
    <td class="mono">${r.sec}</td>
    <td><span class="tag tg-green">${r.found} ok</span></td>
    <td>${r.fisuras > 0 ? `<span class="tag" style="background:var(--r50);color:#991b1b;border:1px solid #fca5a5">${r.fisuras}</span>` : '—'}</td>
    <td><button class="btn bs" style="font-size:.65rem;padding:.2rem .4rem;min-height:32px" data-delid="${r.id}">✕</button></td>
  </tr>`).join('');
  b.onclick = e => {
    const btn = e.target.closest('[data-delid]');
    if (btn) delH(parseInt(btn.dataset.delid));
  };
  if (totalEl) totalEl.textContent = `${appState.history.length}`;
  if (hcountEl) hcountEl.textContent = appState.history.length;
}

export function delH(id) {
  appState.history = appState.history.filter(r => r.id !== id);
  renderHistory();
}

export function doExportCSV() {
  exportCSV(appState.history);
}

/* ════════════════════════════════════════════════════════
   GLOBAL RESET
════════════════════════════════════════════════════════ */
export function resetAll() {
  _resetAll();
  document.querySelectorAll('.sc').forEach(c => c.classList.remove('on'));
  document.getElementById('fa').style.display = 'none';
  document.getElementById('cvMain').getContext('2d').clearRect(0, 0, appState.W, appState.H);
  setStep(1);
  _setGenSt('idle', 'Preparado');
  updateCrackList();
  updateBarStatusPanel();
  renderHistory();
}
