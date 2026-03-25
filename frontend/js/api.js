/**
 * api.js — DXF export and backend communication for StructCAD Pro
 */
'use strict';

import { appState, getParams, STRUCTS } from './state.js';

/**
 * Export current inspection to DXF via backend.
 * Reads full appState, constructs payload, downloads the binary blob.
 */
export async function exportDXF(onStatus) {
  if (!appState.struct) {
    onStatus('err', 'Seleccione un tipo de estructura');
    return;
  }

  const p = getParams();
  const def = STRUCTS[appState.struct];

  // Enrich payload with inspection overlays
  p.markers = appState.barPositions.map(b => ({
    ...b,
    found: appState.barStatus[b.id] || 'unknown'
  }));
  p.cracks_count = appState.cracks.length;
  p.annotations = appState.annotations.map(a => ({ text: a.text, x: a.x, y: a.y }));
  p.view = appState.view;

  onStatus('spin', 'Generando DXF…');

  try {
    const res = await fetch(`${appState.apiUrl}${def.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || res.statusText);
    }

    // Read response as Blob (binary DXF data)
    const blob = await res.blob();

    // Derive filename from Content-Disposition header or construct one
    const cd = res.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="([^"]+)"/);
    const filename = match
      ? match[1]
      : `${appState.struct}_${p.element_id || 'E1'}_${_dateTag()}.dxf`;

    // Force download via temporary anchor — works on mobile Chrome/Safari
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke after a short delay to allow the download to start
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    onStatus('ok', `✓ ${filename}`);
    return { ok: true, params: p, label: def.label };
  } catch (e) {
    onStatus('err', `Error: ${e.message}`);
    return { ok: false };
  }
}

/** Export history records as CSV */
export function exportCSV(history) {
  if (!history.length) return;
  const cols = ['Ref', 'Tipo', 'Fecha', 'Sección', 'Barras encontradas', 'Fisuras'];
  const rows = history.map(r => [r.ref, r.tipo, r.fecha, r.sec, r.found, r.fisuras]);
  const csv = [cols, ...rows]
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = `inspecciones_${_dateTag()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function _dateTag() {
  return new Date().toISOString().slice(0, 10);
}
