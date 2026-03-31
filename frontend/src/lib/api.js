import { STRUCTS, getParamsFromValues } from '../config/structures.js';

export const API_URL = import.meta.env.VITE_API_URL || 'https://structcad2-backend.onrender.com';

/** Precalienta el servidor Render con un ping silencioso al cargar la app */
export function warmupServer() {
  fetch(`${API_URL}/api/health`)
    .then(res => res.json())
    .catch(err => console.warn('[warmupServer] Backend inactivo o despertando:', err.message));
}

/**
 * Exporta la inspeccion actual a DXF via el backend FastAPI.
 * @param {object} state        Estado global de inspeccion
 * @param {Function} onStatus   Callback (type, msg) => void
 * @returns {Promise<{ok, params, label}>}
 */
export async function exportDXF(state, onStatus) {
  const { struct, formValues, barPositions, barStatus, cracks, annotations,
          view, pickedStrokes, sectionBounds, customStirrups: allCustomStirrups } = state;

  const def = STRUCTS[struct];
  if (!struct || !def) {
    onStatus('err', 'Seleccione un tipo de estructura');
    return { ok: false };
  }

  const p = getParamsFromValues(struct, formValues);
  p.markers     = (barPositions || []).map(b => ({ ...b, found: (barStatus || {})[b.id] || 'unknown' }));
  p.cracks_count = (cracks || []).length;
  p.cracks_data = _normalizeCracks(cracks || [], sectionBounds);
  p.annotations  = (annotations || []).map(a => ({ text: a.text, x: a.x, y: a.y }));
  p.view         = view;
  p.picked_circles = _normalizeStrokes(pickedStrokes || [], sectionBounds);
  p.customStirrups = allCustomStirrups || [];

  onStatus('spin', 'Conectando con el servidor…');
  const coldStartTimer = setTimeout(
    () => onStatus('spin', 'Iniciando servidor… puede tardar ~1 min la primera vez'),
    8000,
  );

  try {
    const res = await fetch(`${API_URL}/api${def.endpoint}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(p),
    });

    clearTimeout(coldStartTimer);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || res.statusText);
    }

    const blob = await res.blob();
    const cd   = res.headers.get('Content-Disposition') || '';
    const m    = cd.match(/filename="([^"]+)"/);
    const filename = m ? m[1] : `${struct}_${p.element_id || 'E1'}_${_dateTag()}.dxf`;

    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    onStatus('ok', `✓ ${filename}`);
    return { ok: true, params: p, label: def.label, filename };
  } catch (e) {
    clearTimeout(coldStartTimer);
    onStatus('err', `Error: ${e.message}`);
    return { ok: false };
  }
}

/** Exporta el historial a CSV */
export function exportCSV(history) {
  if (!history.length) return;
  const cols = ['Ref','Tipo','Fecha','Planta','Barras encontradas','Notas'];
  const rows = history.map(r => [
    r.element_ref, r.structure_type, r.inspection_date,
    r.plant, r.rebar_found, r.notes,
  ]);
  const csv = [cols, ...rows]
    .map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const a = document.createElement('a');
  a.href     = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = `inspecciones_${_dateTag()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── helpers ──────────────────────────────────────────────────────

function _dateTag() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Normaliza los trazos pintados en el canvas a coordenadas [0,1] relativas
 * a los limites de la seccion estructural.
 */
function _normalizeStrokes(strokes, fallbackBounds) {
  if (!strokes.length) return [];
  return strokes.map(s => {
    const b = s.bounds || fallbackBounds;
    if (!b) return null;
    const { ox, oy, sw, sh } = b;
    const minDim = Math.min(sw, sh);
    const nr = s.r / minDim;
    if (nr <= 0.001) return null;
    return {
      nx: (s.cx - ox) / sw,
      ny: (s.cy - oy) / sh,
      nr,
      view: s.view || 'section'
    };
  }).filter(Boolean);
}

function _normalizeCracks(cracks, fallbackBounds) {
  if (!cracks.length) return [];
  return cracks.map(c => {
    const b = c.bounds || fallbackBounds;
    if (!b) return null;
    const { ox, oy, sw, sh } = b;
    return {
      nx1: (c.x1 - ox) / sw,
      ny1: (c.y1 - oy) / sh,
      nx2: (c.x2 - ox) / sw,
      ny2: (c.y2 - oy) / sh,
      view: c.view || 'section'
    };
  }).filter(Boolean);
}
