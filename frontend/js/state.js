/**
 * state.js — Global application state for StructCAD Pro
 * Single source of truth. Never reset by tab switching.
 */
'use strict';

export const appState = {
  // ── Structure selection ──────────────────────────────────
  struct: null,          // current structure key (e.g. 'pilar-rect')
  view: 'section',       // 'section' | 'elevation'

  // ── Canvas tools ────────────────────────────────────────
  tool: 'pick',          // 'pick' | 'erase' | 'crack' | 'annotate'
  brush: 10,
  drawing: false,
  lastPt: null,
  crackPts: null,

  // ── Inspection data (reset on struct change) ─────────────
  barStatus: {},         // { barId: 'unknown'|'found'|'notfound'|'oxidized' }
  cracks: [],            // [{ x1,y1,x2,y2 }]
  annotations: [],       // [{ x,y,text,dragging }]
  pickedZone: null,      // offscreen canvas holding paint strokes

  // ── Pick undo history ────────────────────────────────────
  pickHistory: [],       // ImageData[] stack

  // ── Bar geometry cache (rebuilt each redraw) ─────────────
  barPositions: [],      // [{ id,label,cx,cy,r,diam,type }]

  // ── Bar selection (click-select tool) ────────────────────
  selectedBars: [],      // [barId, ...]

  // ── Custom stirrups (drawn by user) ──────────────────────
  customStirrups: [],    // [{ barIds: [id, id, ...] }]

  // ── Per-structure snapshots (preserved on struct switch) ─
  structStates: {},      // { structId: { barStatus, cracks, annotations, customStirrups, formValues, pickImageData } }

  // ── Form values ─────────────────────────────────────────
  // Stored per-field: formValues[fieldId] = value
  // These persist across tab switches within the same struct.
  formValues: {},

  // ── Annotation drag ──────────────────────────────────────
  draggingAnnotation: null,  // index of annotation being dragged

  // ── Session history ──────────────────────────────────────
  history: [],           // saved DXF records

  // ── Canvas dimensions ────────────────────────────────────
  W: 0, H: 0,
  dpr: Math.min(window.devicePixelRatio || 1, 3),

  // Relative URL — works whether the app is served locally or deployed
  // Both frontend and API are served from the same FastAPI instance
  apiUrl: '',
};

/** Call this when the user clicks 'Limpiar' — clears all canvas data. */
export function resetInspectionData() {
  appState.barStatus = {};
  appState.cracks = [];
  appState.annotations = [];
  appState.pickHistory = [];
  appState.crackPts = null;
  appState.drawing = false;
  appState.lastPt = null;
  appState.draggingAnnotation = null;
  appState.selectedBars = [];
  appState.customStirrups = [];
  if (appState.pickedZone) {
    appState.pickedZone.getContext('2d')
      .clearRect(0, 0, appState.pickedZone.width, appState.pickedZone.height);
  }
}

/** Reset everything including form values and history */
export function resetAll() {
  resetInspectionData();
  appState.struct = null;
  appState.formValues = {};
  appState.barPositions = [];
  appState.history = [];
  appState.structStates = {};
}

/**
 * Snapshot current struct's canvas state so it can be restored when switching back.
 * Call this BEFORE changing appState.struct.
 */
export function saveStructState(id) {
  if (!id) return;
  const pc = appState.pickedZone;
  const pickImageData = (pc && pc.width > 0 && pc.height > 0)
    ? pc.getContext('2d').getImageData(0, 0, pc.width, pc.height)
    : null;
  appState.structStates[id] = {
    barStatus:      { ...appState.barStatus },
    cracks:         appState.cracks.map(c => ({ ...c })),
    annotations:    appState.annotations.map(a => ({ ...a })),
    customStirrups: appState.customStirrups.map(s => ({ barIds: [...s.barIds] })),
    formValues:     { ...appState.formValues },
    pickImageData,
  };
}

/**
 * Restore a previously-saved struct state. Returns true if a snapshot existed.
 * Call this AFTER changing appState.struct and re-creating the pick canvas.
 */
export function restoreStructState(id) {
  const saved = appState.structStates[id];
  if (!saved) return false;
  appState.barStatus      = { ...saved.barStatus };
  appState.cracks         = saved.cracks.map(c => ({ ...c }));
  appState.annotations    = saved.annotations.map(a => ({ ...a }));
  appState.customStirrups = saved.customStirrups.map(s => ({ barIds: [...s.barIds] }));
  appState.formValues     = { ...saved.formValues };
  appState.selectedBars   = [];
  if (saved.pickImageData && appState.pickedZone) {
    const pc = appState.pickedZone;
    pc.width  = saved.pickImageData.width;
    pc.height = saved.pickImageData.height;
    pc.getContext('2d').putImageData(saved.pickImageData, 0, 0);
  }
  return true;
}

/** Definition of all structural types with their form schemas */
export const STRUCTS = {
  'pilar-rect': {
    label: 'Pilar Rectangular', endpoint: '/generate/pillar-rect',
    tabs: {
      geometria: [{ s: 'Sección transversal', f: [
        { id: 'width',  l: 'Ancho frontal',  u: 'cm', t: 'n', mn: 15, mx: 300, st: 1,  v: 88 },
        { id: 'depth',  l: 'Canto lateral',  u: 'cm', t: 'n', mn: 15, mx: 300, st: 1,  v: 68 },
      ]}],
      armadura: [
        { s: 'Cara frontal (sup./inf.)', f: [
          { id: 'bars_front_count',  l: 'Nº barras',       u: 'ud', t: 'n', mn: 2,  mx: 16, st: 1,  v: 5  },
          { id: 'bars_front_diam',   l: 'Ø barras',        u: 'mm', t: 'n', mn: 6,  mx: 40, st: 2,  v: 20 },
          { id: 'cover_front',       l: 'Recubrimiento',   u: 'cm', t: 'n', mn: 1,  mx: 12, st: .5, v: 5  },
        ]},
        { s: 'Cara lateral (izq./der.)', f: [
          { id: 'bars_lateral_count', l: 'Nº barras',      u: 'ud', t: 'n', mn: 0,  mx: 16, st: 1,  v: 4  },
          { id: 'bars_lateral_diam',  l: 'Ø barras',       u: 'mm', t: 'n', mn: 6,  mx: 40, st: 2,  v: 20 },
          { id: 'cover_lateral',      l: 'Recubrimiento',  u: 'cm', t: 'n', mn: 1,  mx: 12, st: .5, v: 6  },
        ]},
        { s: 'Estribo perimetral', f: [
          { id: 'stirrup_diam',    l: 'Ø estribo',  u: 'mm', t: 'n', mn: 4, mx: 20, st: 2, v: 6  },
          { id: 'stirrup_spacing', l: 'Separación', u: 'cm', t: 'n', mn: 5, mx: 50, st: 5, v: 15 },
        ]},
        { s: 'Ramas interiores', f: [
          { id: 'inner_stirrups_x',   l: 'Ramas dir. X', u: 'ud', t: 'n', mn: 0, mx: 6, st: 1, v: 1 },
          { id: 'inner_stirrups_y',   l: 'Ramas dir. Y', u: 'ud', t: 'n', mn: 0, mx: 6, st: 1, v: 0 },
          { id: 'inner_stirrup_diam', l: 'Ø rama',       u: 'mm', t: 'n', mn: 4, mx: 16, st: 2, v: 6 },
        ]},
      ],
      inspeccion: [{ s: 'Zona inspeccionada', f: [
        { id: 'inspection_height', l: 'Altura zona picada',  u: 'cm', t: 'n', mn: 5,  mx: 150, st: 1,  v: 25 },
        { id: 'rebar_found',       l: 'Armadura encontrada', t: 's', opts: ['Sí','No','Parcialmente'], v: 'Sí' },
        { id: 'cover_measured',    l: 'Recubrimiento medido',u: 'cm', t: 'n', mn: 0,  mx: 20,  st: .5, v: 5  },
        { id: 'carbonation_depth', l: 'Prof. carbonatación', u: 'mm', t: 'n', mn: 0,  mx: 80,  st: 1,  v: 0  },
        { id: 'corrosion',         l: 'Estado armadura',     t: 's', opts: ['Sin patologías','Corrosión leve','Corrosión severa','Armadura seccionada'], v: 'Sin patologías' },
        { id: 'notes',             l: 'Notas técnicas', t: 'ta', v: '' },
      ]}],
      obra: [{ s: 'Identificación', f: [
        { id: 'element_id',  l: 'Referencia',      t: 'tx', v: 'P-01' },
        { id: 'planta',      l: 'Planta / Nivel',  t: 'tx', v: 'PB'   },
        { id: 'eje',         l: 'Eje / Alineación',t: 'tx', v: 'A-3'  },
        { id: 'fecha_insp',  l: 'Fecha inspección',t: 'd',  v: ''     },
      ]}],
    }
  },
  'pilar-circ': {
    label: 'Pilar Circular', endpoint: '/generate/pillar-circ',
    tabs: {
      geometria: [{ s: 'Sección', f: [
        { id: 'diameter', l: 'Diámetro', u: 'cm', t: 'n', mn: 20, mx: 300, st: 1, v: 50 }
      ]}],
      armadura: [
        { s: 'Armadura longitudinal', f: [
          { id: 'bars_count',  l: 'Nº barras',     u: 'ud', t: 'n', mn: 4, mx: 16, st: 1,  v: 8  },
          { id: 'bars_diam',   l: 'Ø barras',      u: 'mm', t: 'n', mn: 6, mx: 40, st: 2,  v: 20 },
          { id: 'cover',       l: 'Recubrimiento', u: 'cm', t: 'n', mn: 1, mx: 12, st: .5, v: 4  },
        ]},
        { s: 'Cerco / Espiral', f: [
          { id: 'stirrup_diam',    l: 'Ø espiral',  u: 'mm', t: 'n', mn: 4, mx: 20, st: 2, v: 8  },
          { id: 'stirrup_spacing', l: 'Paso',       u: 'cm', t: 'n', mn: 5, mx: 30, st: 5, v: 10 },
        ]},
        { s: 'Ramas interiores', f: [
          { id: 'inner_stirrups',     l: 'Nº ramas', u: 'ud', t: 'n', mn: 0, mx: 4, st: 1, v: 0 },
          { id: 'inner_stirrup_diam', l: 'Ø rama',   u: 'mm', t: 'n', mn: 4, mx: 16, st: 2, v: 6 },
        ]},
      ],
      inspeccion: [{ s: 'Inspección', f: [
        { id: 'inspection_height', l: 'Altura zona picada',  u: 'cm', t: 'n', mn: 5,  mx: 150, st: 1,  v: 25 },
        { id: 'rebar_found',       l: 'Armadura',            t: 's', opts: ['Sí','No','Parcialmente'], v: 'Sí' },
        { id: 'cover_measured',    l: 'Recubrimiento medido',u: 'cm', t: 'n', mn: 0,  mx: 20,  st: .5, v: 4  },
        { id: 'carbonation_depth', l: 'Prof. carbonatación', u: 'mm', t: 'n', mn: 0,  mx: 80,  st: 1,  v: 0  },
        { id: 'notes',             l: 'Notas', t: 'ta', v: '' },
      ]}],
      obra: [{ s: 'Identificación', f: [
        { id: 'element_id', l: 'Referencia', t: 'tx', v: 'PC-01' },
        { id: 'planta',     l: 'Planta',     t: 'tx', v: 'PB'    },
        { id: 'eje',        l: 'Eje',        t: 'tx', v: 'B-2'   },
        { id: 'fecha_insp', l: 'Fecha',      t: 'd',  v: ''      },
      ]}],
    }
  },
  'viga': {
    label: 'Viga', endpoint: '/generate/beam',
    tabs: {
      geometria: [{ s: 'Sección', f: [
        { id: 'width',  l: 'Ancho', u: 'cm', t: 'n', mn: 15, mx: 150, st: 1, v: 30 },
        { id: 'height', l: 'Canto', u: 'cm', t: 'n', mn: 20, mx: 300, st: 1, v: 60 },
      ]}],
      armadura: [
        { s: 'Armadura inferior', f: [
          { id: 'bars_bottom_count', l: 'Nº barras', u: 'ud', t: 'n', mn: 2, mx: 10, st: 1, v: 4  },
          { id: 'bars_bottom_diam',  l: 'Ø barras',  u: 'mm', t: 'n', mn: 6, mx: 40, st: 2, v: 20 },
        ]},
        { s: 'Armadura superior', f: [
          { id: 'bars_top_count', l: 'Nº barras', u: 'ud', t: 'n', mn: 2, mx: 10, st: 1, v: 2  },
          { id: 'bars_top_diam',  l: 'Ø barras',  u: 'mm', t: 'n', mn: 6, mx: 40, st: 2, v: 16 },
        ]},
        { s: 'Estribos', f: [
          { id: 'cover',         l: 'Recubrimiento', u: 'cm', t: 'n', mn: 1, mx: 10, st: .5, v: 3  },
          { id: 'stirrup_diam',  l: 'Ø estribo',     u: 'mm', t: 'n', mn: 4, mx: 20, st: 2,  v: 8  },
          { id: 'stirrup_spacing',l: 'Separación',   u: 'cm', t: 'n', mn: 5, mx: 50, st: 5,  v: 15 },
        ]},
        { s: 'Ramas interiores', f: [
          { id: 'inner_stirrups',     l: 'Nº ramas vert.', u: 'ud', t: 'n', mn: 0, mx: 4, st: 1, v: 0 },
          { id: 'inner_stirrup_diam', l: 'Ø rama',         u: 'mm', t: 'n', mn: 4, mx: 16, st: 2, v: 6 },
        ]},
      ],
      inspeccion: [{ s: 'Inspección', f: [
        { id: 'rebar_found',       l: 'Armadura',            t: 's', opts: ['Sí','No','Parcialmente'], v: 'Sí' },
        { id: 'cover_measured',    l: 'Recubrimiento medido',u: 'cm', t: 'n', mn: 0, mx: 20, st: .5, v: 3 },
        { id: 'carbonation_depth', l: 'Prof. carbonatación', u: 'mm', t: 'n', mn: 0, mx: 80, st: 1,  v: 0 },
        { id: 'corrosion',         l: 'Estado',              t: 's', opts: ['Sin patologías','Corrosión leve','Corrosión severa'], v: 'Sin patologías' },
        { id: 'notes', l: 'Notas', t: 'ta', v: '' },
      ]}],
      obra: [{ s: 'Identificación', f: [
        { id: 'element_id', l: 'Referencia', t: 'tx', v: 'V-01'  },
        { id: 'planta',     l: 'Planta',     t: 'tx', v: 'P1'    },
        { id: 'eje',        l: 'Eje',        t: 'tx', v: '1-2/A' },
        { id: 'fecha_insp', l: 'Fecha',      t: 'd',  v: ''      },
      ]}],
    }
  },
  'forjado': {
    label: 'Forjado / Losa', endpoint: '/generate/forjado',
    tabs: {
      geometria: [{ s: 'Dimensiones', f: [
        { id: 'thickness',    l: 'Canto total', u: 'cm', t: 'n', mn: 10, mx: 60, st: 1, v: 25 },
        { id: 'forjado_type', l: 'Tipo', t: 's', opts: ['Losa maciza','Losa aligerada','Forjado reticular'], v: 'Losa maciza' },
      ]}],
      armadura: [
        { s: 'Dir. X (vano ppal.)', f: [
          { id: 'bars_x_count',   l: 'Nº barras',  u: 'ud', t: 'n', mn: 2, mx: 30, st: 1,  v: 10 },
          { id: 'bars_x_diam',    l: 'Ø',          u: 'mm', t: 'n', mn: 6, mx: 32, st: 2,  v: 12 },
          { id: 'bars_x_spacing', l: 'Separación', u: 'cm', t: 'n', mn: 5, mx: 30, st: 5,  v: 15 },
        ]},
        { s: 'Dir. Y (perpendicular)', f: [
          { id: 'bars_y_count',   l: 'Nº barras',  u: 'ud', t: 'n', mn: 2, mx: 30, st: 1, v: 10 },
          { id: 'bars_y_diam',    l: 'Ø',          u: 'mm', t: 'n', mn: 6, mx: 32, st: 2, v: 12 },
          { id: 'bars_y_spacing', l: 'Separación', u: 'cm', t: 'n', mn: 5, mx: 30, st: 5, v: 15 },
        ]},
        { s: 'Recubrimientos', f: [
          { id: 'cover_bottom', l: 'Inferior', u: 'cm', t: 'n', mn: 2, mx: 10, st: .5, v: 3 },
          { id: 'cover_top',    l: 'Superior', u: 'cm', t: 'n', mn: 2, mx: 10, st: .5, v: 3 },
        ]},
      ],
      inspeccion: [{ s: 'Inspección', f: [
        { id: 'rebar_found',       l: 'Armadura',            t: 's', opts: ['Sí','No','Parcialmente'], v: 'Sí' },
        { id: 'cover_measured',    l: 'Recubrimiento medido',u: 'cm', t: 'n', mn: 0, mx: 20, st: .5, v: 3 },
        { id: 'carbonation_depth', l: 'Prof. carbonatación', u: 'mm', t: 'n', mn: 0, mx: 80, st: 1,  v: 0 },
        { id: 'notes', l: 'Notas', t: 'ta', v: '' },
      ]}],
      obra: [{ s: 'Identificación', f: [
        { id: 'element_id', l: 'Referencia', t: 'tx', v: 'F-01'  },
        { id: 'planta',     l: 'Planta',     t: 'tx', v: 'P1'    },
        { id: 'eje',        l: 'Paño',       t: 'tx', v: 'A3-B4' },
        { id: 'fecha_insp', l: 'Fecha',      t: 'd',  v: ''      },
      ]}],
    }
  },
  'zapata': {
    label: 'Zapata Aislada', endpoint: '/generate/footing',
    tabs: {
      geometria: [{ s: 'Dimensiones', f: [
        { id: 'length',     l: 'Longitud',    u: 'cm', t: 'n', mn: 50, mx: 600, st: 5, v: 200 },
        { id: 'width',      l: 'Anchura',     u: 'cm', t: 'n', mn: 50, mx: 600, st: 5, v: 160 },
        { id: 'height',     l: 'Canto',       u: 'cm', t: 'n', mn: 30, mx: 200, st: 5, v: 60  },
        { id: 'pedestal_w', l: 'Pilar ancho', u: 'cm', t: 'n', mn: 20, mx: 100, st: 5, v: 40  },
        { id: 'pedestal_d', l: 'Pilar canto', u: 'cm', t: 'n', mn: 20, mx: 100, st: 5, v: 40  },
      ]}],
      armadura: [
        { s: 'Armadura dir. X', f: [
          { id: 'bars_x_count', l: 'Nº barras', u: 'ud', t: 'n', mn: 2, mx: 20, st: 1, v: 8  },
          { id: 'bars_x_diam',  l: 'Ø barras',  u: 'mm', t: 'n', mn: 6, mx: 40, st: 2, v: 16 },
        ]},
        { s: 'Armadura dir. Y', f: [
          { id: 'bars_y_count', l: 'Nº barras', u: 'ud', t: 'n', mn: 2, mx: 20, st: 1, v: 7  },
          { id: 'bars_y_diam',  l: 'Ø barras',  u: 'mm', t: 'n', mn: 6, mx: 40, st: 2, v: 16 },
        ]},
        { s: 'Recubrimientos', f: [
          { id: 'cover_bottom', l: 'Inferior', u: 'cm', t: 'n', mn: 3, mx: 15, st: .5, v: 7 },
          { id: 'cover_sides',  l: 'Lateral',  u: 'cm', t: 'n', mn: 3, mx: 15, st: .5, v: 7 },
        ]},
      ],
      inspeccion: [{ s: 'Inspección', f: [
        { id: 'rebar_found',       l: 'Armadura',            t: 's', opts: ['Sí','No','Parcialmente'], v: 'Sí' },
        { id: 'cover_measured',    l: 'Recubrimiento medido',u: 'cm', t: 'n', mn: 0, mx: 20, st: .5, v: 7 },
        { id: 'carbonation_depth', l: 'Prof. carbonatación', u: 'mm', t: 'n', mn: 0, mx: 80, st: 1,  v: 0 },
        { id: 'notes', l: 'Notas', t: 'ta', v: '' },
      ]}],
      obra: [{ s: 'Identificación', f: [
        { id: 'element_id', l: 'Referencia',     t: 'tx', v: 'Z-01'        },
        { id: 'planta',     l: 'Nivel',          t: 'tx', v: 'Cimentación' },
        { id: 'eje',        l: 'Pilar asociado', t: 'tx', v: 'P-01'        },
        { id: 'fecha_insp', l: 'Fecha',          t: 'd',  v: ''           },
      ]}],
    }
  },
  'escalera': {
    label: 'Escalera / Zanca', endpoint: '/generate/stair',
    tabs: {
      geometria: [{ s: 'Geometría', f: [
        { id: 'stair_width',    l: 'Ancho escalera', u: 'cm', t: 'n', mn: 80, mx: 300, st: 5,  v: 120 },
        { id: 'riser',          l: 'Contrahuella',   u: 'cm', t: 'n', mn: 14, mx: 22,  st: .5, v: 17  },
        { id: 'tread',          l: 'Huella',         u: 'cm', t: 'n', mn: 25, mx: 35,  st: .5, v: 28  },
        { id: 'slab_thickness', l: 'Canto zanca',    u: 'cm', t: 'n', mn: 10, mx: 30,  st: 1,  v: 15  },
        { id: 'steps_count',    l: 'Nº peldaños',    u: 'ud', t: 'n', mn: 3,  mx: 15,  st: 1,  v: 5   },
      ]}],
      armadura: [{ s: 'Armadura', f: [
        { id: 'bars_long_diam',  l: 'Ø long.',    u: 'mm', t: 'n', mn: 6,  mx: 20, st: 2, v: 12 },
        { id: 'bars_long_sep',   l: 'Sep. long.', u: 'cm', t: 'n', mn: 10, mx: 30, st: 5, v: 15 },
        { id: 'bars_trans_diam', l: 'Ø trans.',   u: 'mm', t: 'n', mn: 6,  mx: 16, st: 2, v: 8  },
        { id: 'bars_trans_sep',  l: 'Sep. trans.',u: 'cm', t: 'n', mn: 10, mx: 30, st: 5, v: 20 },
        { id: 'cover',           l: 'Recubrimiento', u: 'cm', t: 'n', mn: 1.5, mx: 6, st: .5, v: 2.5 },
      ]}],
      inspeccion: [{ s: 'Inspección', f: [
        { id: 'rebar_found',       l: 'Armadura encontrada', t: 's', opts: ['Sí','No','Parcialmente'], v: 'No' },
        { id: 'cover_measured',    l: 'Recubrimiento medido',u: 'cm', t: 'n', mn: 0, mx: 20, st: .5, v: 2.5 },
        { id: 'carbonation_depth', l: 'Prof. carbonatación', u: 'mm', t: 'n', mn: 0, mx: 80, st: 1,  v: 0   },
        { id: 'notes', l: 'Notas', t: 'ta', v: '' },
      ]}],
      obra: [{ s: 'Identificación', f: [
        { id: 'element_id', l: 'Referencia', t: 'tx', v: 'ESC-01' },
        { id: 'planta',     l: 'Tramo',      t: 'tx', v: 'PB-P1'  },
        { id: 'fecha_insp', l: 'Fecha',      t: 'd',  v: ''       },
      ]}],
    }
  }
};

/** Get flat params object reading from live DOM inputs, using stored defaults */
export function getParams() {
  if (!appState.struct) return {};
  const p = {};
  const def = STRUCTS[appState.struct];
  for (const tabSecs of Object.values(def.tabs)) {
    for (const sec of tabSecs) {
      for (const f of sec.f) {
        const el = document.getElementById(f.id);
        if (el) {
          p[f.id] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
          // Keep formValues in sync
          appState.formValues[f.id] = p[f.id];
        } else {
          // Use stored value or default
          const stored = appState.formValues[f.id];
          p[f.id] = stored !== undefined ? stored : (f.t === 'n' ? (f.v || 0) : (f.v || ''));
        }
      }
    }
  }
  return p;
}
