import { createContext, useContext, useReducer, useCallback } from 'react';
import { STRUCTS, getParamsFromValues } from '../config/structures.js';

// ── Estado inicial ─────────────────────────────────────────────────
const INITIAL = {
  paginas:      {},
  paginaActiva: null,
  page:         'nueva',
  step:         1,
  struct:       null,
  view:         'section',
  tool:         'pick',
  brush:        8,
  activeTab:    'geometria',
  dxfStatus:    null,
  sectionBounds: { ox: 0, oy: 0, sw: 1, sh: 1 },
  barPositions:  [],
  history:       [],
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ── Helper: actualiza la página activa ────────────────────────────
function updatePagina(state, changes) {
  if (!state.paginaActiva) return state;
  const pag = state.paginas[state.paginaActiva] || {};
  return {
    ...state,
    paginas: {
      ...state.paginas,
      [state.paginaActiva]: { ...pag, ...changes },
    },
  };
}

// ── Reducer ───────────────────────────────────────────────────────
function reducer(state, action) {
  const pag = state.paginas?.[state.paginaActiva] || {};

  switch (action.type) {

    // ── Selección de estructura ────────────────────────────────
    case 'SELECT_STRUCT': {
      const existing = state.paginas || {};
      const hasPages  = Object.keys(existing).length > 0;

      // Si ya hay páginas Y el struct es el mismo → añadir nuevo plano
      if (hasPages && state.struct === action.payload) {
        const newId  = `pag-${Date.now()}`;
        const newPag = {
          nombre:        `Plano ${Object.keys(existing).length + 1}`,
          formValues:    {},
          barStatus:     {},
          pickedStrokes: [],
          cracks:        [],
          annotations:   [],
          customStirrups:[],
        };
        return {
          ...state,
          view:         'section',
          step:         2,
          page:         'nueva',
          paginas:      { ...existing, [newId]: newPag },
          paginaActiva: newId,
        };
      }

      // Primera vez o struct diferente → resetear
      const pid = 'pag-1';
      const pagina = {
        nombre:        'Plano 1',
        formValues:    {},
        barStatus:     {},
        pickedStrokes: [],
        cracks:        [],
        annotations:   [],
        customStirrups:[],
      };
      return {
        ...state,
        struct:       action.payload,
        view:         'section',
        step:         2,
        page:         'nueva',
        paginas:      { [pid]: pagina },
        paginaActiva: pid,
      };
    }

    // ── Navegación ─────────────────────────────────────────────
    case 'NAV_PAGE':
      return { ...state, page: action.payload };
    case 'SET_STEP':
      return { ...state, step: action.payload };

    // ── Gestión de páginas ─────────────────────────────────────
    case 'SET_PAGINA_ACTIVA':
      return { ...state, paginaActiva: action.payload };
    case 'ADD_PAGINA': {
      const newId = `pag-${Date.now()}`;
      const newPag = {
        ...deepClone(pag),
        nombre:        action.nombre,
        pickedStrokes: [],
        cracks:        [],
        annotations:   [],
      };
      return {
        ...state,
        paginas:      { ...state.paginas, [newId]: newPag },
        paginaActiva: newId,
      };
    }
    case 'RENAME_PAGINA': {
      const targetId = action.pid || state.paginaActiva;
      if (!targetId || !state.paginas[targetId]) return state;
      return {
        ...state,
        paginas: {
          ...state.paginas,
          [targetId]: { ...state.paginas[targetId], nombre: action.nombre },
        },
      };
    }
    case 'DELETE_PAGINA': {
      const { [state.paginaActiva]: _omit, ...rest } = state.paginas;
      const nextId = Object.keys(rest)[0] || null;
      return { ...state, paginas: rest, paginaActiva: nextId };
    }

    // ── Datos del plano activo ─────────────────────────────────
    case 'SET_FORM_VALUE':
      return updatePagina(state, { formValues: { ...pag.formValues, [action.id]: action.value } });
    case 'SET_BAR_STATUS':
      return updatePagina(state, { barStatus: { ...pag.barStatus, [action.barId]: action.status } });
    case 'SET_PICKED_STROKES':
      return updatePagina(state, { pickedStrokes: action.payload });
    case 'SET_CRACKS':
      return updatePagina(state, { cracks: action.payload });
    case 'SET_ANNOTATIONS':
      return updatePagina(state, { annotations: action.payload });
    case 'SET_CUSTOM_STIRRUPS':
      return updatePagina(state, { customStirrups: action.payload });
    case 'SET_SELECTED_BARS':
      return updatePagina(state, { selectedBars: action.payload });
    case 'ADD_PICKED_STROKE': {
      const base = Array.isArray(pag.pickedStrokes) ? pag.pickedStrokes : [];
      return updatePagina(state, { pickedStrokes: [...base, action.payload] });
    }
    case 'ADD_CRACK': {
      const base = Array.isArray(pag.cracks) ? pag.cracks : [];
      return updatePagina(state, { cracks: [...base, action.payload] });
    }
    case 'ADD_ANNOTATION': {
      const base = Array.isArray(pag.annotations) ? pag.annotations : [];
      return updatePagina(state, { annotations: [...base, action.payload] });
    }
    case 'UPDATE_ANNOTATION': {
      const base = Array.isArray(pag.annotations) ? pag.annotations : [];
      const updated = base.map(a => a.id === action.id ? { ...a, ...action.changes } : a);
      return updatePagina(state, { annotations: updated });
    }
    case 'DELETE_ANNOTATION': {
      const base = Array.isArray(pag.annotations) ? pag.annotations : [];
      return updatePagina(state, { annotations: base.filter(a => a.id !== action.id) });
    }
    case 'CLEAR_CANVAS':
      return updatePagina(state, { pickedStrokes: [], cracks: [], annotations: [] });

    // ── UI state ───────────────────────────────────────────────
    case 'SET_VIEW':
      return { ...state, view: action.payload };
    case 'SET_TOOL':
      return { ...state, tool: action.payload };
    case 'SET_BRUSH':
      return { ...state, brush: action.payload };
    case 'SET_TAB':
      return { ...state, activeTab: action.payload };
    case 'SET_DXF_STATUS':
      return { ...state, dxfStatus: action.payload };
    case 'SET_BAR_POSITIONS':
      return { ...state, barPositions: action.payload };
    case 'SET_SECTION_BOUNDS':
      return { ...state, sectionBounds: action.payload };

    // ── Historial ──────────────────────────────────────────────
    case 'ADD_HISTORY': {
      const hist = Array.isArray(state.history) ? state.history : [];
      return { ...state, history: [action.payload, ...hist] };
    }
    case 'SET_HISTORY':
      return { ...state, history: Array.isArray(action.payload) ? action.payload : [] };
    case 'REMOVE_HISTORY': {
      const hist = Array.isArray(state.history) ? state.history : [];
      return { ...state, history: hist.filter(r => r.id !== action.id) };
    }

    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────

const InspectionCtx = createContext(null);

export function InspectionProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const setFormValue = useCallback((id, value) =>
    dispatch({ type: 'SET_FORM_VALUE', id, value }), []);

  const getParams = useCallback(() => {
    const pag = state.paginas?.[state.paginaActiva];
    return getParamsFromValues(state.struct, pag?.formValues || {});
  }, [state.struct, state.paginas, state.paginaActiva]);

  return (
    <InspectionCtx.Provider value={{ state, dispatch, setFormValue, getParams }}>
      {children}
    </InspectionCtx.Provider>
  );
}

export function useInspection() {
  const ctx = useContext(InspectionCtx);
  if (!ctx) throw new Error('useInspection must be used inside InspectionProvider');
  return ctx;
}
