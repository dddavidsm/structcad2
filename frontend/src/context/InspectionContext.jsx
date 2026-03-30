import { createContext, useContext, useReducer, useCallback } from 'react';
import { STRUCTS, getParamsFromValues } from '../config/structures.js';

// ── Estado inicial NUEVO (jerárquico) ─────────────────────────────
const genId = (prefix) => `${prefix}-${Math.random().toString(36).substr(2, 9)}`;

const INITIAL = {
  proyectos: {
    'proyecto-1': {
      nombre: 'Proyecto sin título',
      carpetas: {
        'carpeta-1': {
          nombre: 'Sótano 1',
          elementos: {
            'elemento-1': {
              nombre: 'Pilar 1',
              tipo: 'pilar_rect',
              formValues: {},
              barStatus: {},
              pickedStrokes: [],
              cracks: [],
              annotations: [],
              customStirrups: [],
            }
          }
        }
      }
    }
  },
  proyectoActivo: 'proyecto-1',
  carpetaActiva: 'carpeta-1',
  elementoActivo: 'elemento-1',
  page: 'nueva',
  step: 2,
  // ── UI state (cross-cutting, no pertenece a un elemento individual) ──
  struct:        null,
  view:          'section',
  tool:          'pick',
  brush:         8,
  activeTab:     'geometria',
  dxfStatus:     null,
  sectionBounds: { ox: 0, oy: 0, sw: 1, sh: 1 },
  barPositions:  [],
  history:       [],
};
// --- Añadir carpeta y elemento como objetos ---
function addCarpeta(state, nombre) {
  const proyecto = state.proyectos[state.proyectoActivo];
  const newId = Date.now().toString();
  return {
    ...state,
    proyectos: {
      ...state.proyectos,
      [state.proyectoActivo]: {
        ...proyecto,
        carpetas: {
          ...(proyecto.carpetas || {}),
          [newId]: {
            nombre,
            elementos: {},
          }
        }
      }
    }
  };
}

function addElemento(state, nombre) {
  const proyecto = state.proyectos[state.proyectoActivo];
  const carpeta = proyecto?.carpetas?.[state.carpetaActiva];
  const newId = Date.now().toString();
  return {
    ...state,
    proyectos: {
      ...state.proyectos,
      [state.proyectoActivo]: {
        ...proyecto,
        carpetas: {
          ...proyecto.carpetas,
          [state.carpetaActiva]: {
            ...carpeta,
            elementos: {
              ...(carpeta.elementos || {}),
              [newId]: {
                nombre,
              }
            }
          }
        }
      }
    }
  };
}

// ── Reducer NUEVO (jerárquico e inmutable) ──────────────────────
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function reducer(state, action) {
  const { proyectoActivo, carpetaActiva, elementoActivo } = state;
  const proyectos = state.proyectos;
  // Guardas de seguridad: evitan crash cuando los IDs activos son null
  const proyecto  = proyectos?.[proyectoActivo]       || { carpetas: {} };
  const carpeta   = proyecto.carpetas?.[carpetaActiva] || { elementos: {} };
  const elemento  = carpeta.elementos?.[elementoActivo] || {};

  switch (action.type) {
    case 'ADD_CARPETA':
      return addCarpeta(state, action.nombre);
    case 'ADD_ELEMENTO':
      return addElemento(state, action.nombre);
    case 'SET_FORM_VALUE': {
      const newElemento = { ...elemento, formValues: { ...elemento.formValues, [action.id]: action.value } };
      const newCarpeta = { ...carpeta, elementos: { ...carpeta.elementos, [elementoActivo]: newElemento } };
      const newProyecto = { ...proyecto, carpetas: { ...proyecto.carpetas, [carpetaActiva]: newCarpeta } };
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: newProyecto } };
    }
    case 'SET_BAR_STATUS': {
      const newElemento = { ...elemento, barStatus: { ...elemento.barStatus, [action.barId]: action.status } };
      const newCarpeta = { ...carpeta, elementos: { ...carpeta.elementos, [elementoActivo]: newElemento } };
      const newProyecto = { ...proyecto, carpetas: { ...proyecto.carpetas, [carpetaActiva]: newCarpeta } };
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: newProyecto } };
    }
    case 'SET_PICKED_STROKES': {
      const newElemento = { ...elemento, pickedStrokes: action.payload };
      const newCarpeta = { ...carpeta, elementos: { ...carpeta.elementos, [elementoActivo]: newElemento } };
      const newProyecto = { ...proyecto, carpetas: { ...proyecto.carpetas, [carpetaActiva]: newCarpeta } };
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: newProyecto } };
    }
    case 'SET_CRACKS': {
      const newElemento = { ...elemento, cracks: action.payload };
      const newCarpeta = { ...carpeta, elementos: { ...carpeta.elementos, [elementoActivo]: newElemento } };
      const newProyecto = { ...proyecto, carpetas: { ...proyecto.carpetas, [carpetaActiva]: newCarpeta } };
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: newProyecto } };
    }
    case 'SET_ANNOTATIONS': {
      const newElemento = { ...elemento, annotations: action.payload };
      const newCarpeta = { ...carpeta, elementos: { ...carpeta.elementos, [elementoActivo]: newElemento } };
      const newProyecto = { ...proyecto, carpetas: { ...proyecto.carpetas, [carpetaActiva]: newCarpeta } };
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: newProyecto } };
    }
    case 'SET_CUSTOM_STIRRUPS': {
      const newElemento = { ...elemento, customStirrups: action.payload };
      const newCarpeta = { ...carpeta, elementos: { ...carpeta.elementos, [elementoActivo]: newElemento } };
      const newProyecto = { ...proyecto, carpetas: { ...proyecto.carpetas, [carpetaActiva]: newCarpeta } };
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: newProyecto } };
    }
    // Cambio de punteros activos
    case 'SET_ELEMENTO_ACTIVO':
      return { ...state, elementoActivo: action.payload };
    case 'SET_CARPETA_ACTIVA':
      return { ...state, carpetaActiva: action.payload, elementoActivo: Object.keys(proyecto.carpetas[action.payload].elementos)[0] };
    // Crear nueva carpeta
    case 'ADD_CARPETA': {
      const newId = genId('carpeta');
      const newCarpeta = { nombre: action.nombre, elementos: {} };
      const newProyecto = { ...proyecto, carpetas: { ...proyecto.carpetas, [newId]: newCarpeta } };
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: newProyecto }, carpetaActiva: newId, elementoActivo: null };
    }
    // Crear nuevo elemento (clonación)
    case 'ADD_ELEMENTO': {
      const newId = genId('elemento');
      // Clonación: copiar todo menos pickedStrokes, cracks, annotations
      const base = action.baseElemento || elemento;
      const newElemento = {
        ...deepClone(base),
        nombre: action.nombre,
        pickedStrokes: [],
        cracks: [],
        annotations: [],
      };
      const newCarpeta = { ...carpeta, elementos: { ...carpeta.elementos, [newId]: newElemento } };
      const newProyecto = { ...proyecto, carpetas: { ...proyecto.carpetas, [carpetaActiva]: newCarpeta } };
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: newProyecto }, elementoActivo: newId };
    }
    // Renombrar carpeta o elemento
    case 'RENAME_CARPETA': {
      const newCarpeta = { ...carpeta, nombre: action.nombre };
      const newProyecto = { ...proyecto, carpetas: { ...proyecto.carpetas, [carpetaActiva]: newCarpeta } };
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: newProyecto } };
    }
    case 'RENAME_ELEMENTO': {
      const newElemento = { ...elemento, nombre: action.nombre };
      const newCarpeta = { ...carpeta, elementos: { ...carpeta.elementos, [elementoActivo]: newElemento } };
      const newProyecto = { ...proyecto, carpetas: { ...proyecto.carpetas, [carpetaActiva]: newCarpeta } };
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: newProyecto } };
    }
    // Eliminar carpeta o elemento
    case 'DELETE_CARPETA': {
      const { [carpetaActiva]: omit, ...restCarpetas } = proyecto.carpetas;
      const newProyecto = { ...proyecto, carpetas: restCarpetas };
      // Seleccionar otra carpeta si existe
      const nextCarpeta = Object.keys(restCarpetas)[0] || null;
      const nextElemento = nextCarpeta ? Object.keys(restCarpetas[nextCarpeta].elementos)[0] : null;
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: newProyecto }, carpetaActiva: nextCarpeta, elementoActivo: nextElemento };
    }
    case 'DELETE_ELEMENTO': {
      const { [elementoActivo]: omit, ...restElementos } = carpeta.elementos;
      const newCarpeta = { ...carpeta, elementos: restElementos };
      const newProyecto = { ...proyecto, carpetas: { ...proyecto.carpetas, [carpetaActiva]: newCarpeta } };
      // Seleccionar otro elemento si existe
      const nextElemento = Object.keys(restElementos)[0] || null;
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: newProyecto }, elementoActivo: nextElemento };
    }
    case 'NAV_PAGE':
      return { ...state, page: action.payload };
    case 'SET_STEP':
      return { ...state, step: action.payload };

    // ── UI state ────────────────────────────────────────────────────
    case 'SELECT_STRUCT':
      return { ...state, struct: action.payload, view: 'section', step: 2, page: 'nueva' };
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

    // ── Mutaciones sobre el elemento activo ─────────────────────────
    case 'SET_SELECTED_BARS': {
      if (!elementoActivo) return state;
      const ne = { ...elemento, selectedBars: action.payload };
      const nc = { ...carpeta, elementos: { ...carpeta.elementos, [elementoActivo]: ne } };
      const np = { ...proyecto, carpetas: { ...proyecto.carpetas, [carpetaActiva]: nc } };
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: np } };
    }
    case 'ADD_PICKED_STROKE': {
      if (!elementoActivo) return state;
      const base = Array.isArray(elemento.pickedStrokes) ? elemento.pickedStrokes : [];
      const ne = { ...elemento, pickedStrokes: [...base, action.payload] };
      const nc = { ...carpeta, elementos: { ...carpeta.elementos, [elementoActivo]: ne } };
      const np = { ...proyecto, carpetas: { ...proyecto.carpetas, [carpetaActiva]: nc } };
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: np } };
    }
    case 'ADD_CRACK': {
      if (!elementoActivo) return state;
      const base = Array.isArray(elemento.cracks) ? elemento.cracks : [];
      const ne = { ...elemento, cracks: [...base, action.payload] };
      const nc = { ...carpeta, elementos: { ...carpeta.elementos, [elementoActivo]: ne } };
      const np = { ...proyecto, carpetas: { ...proyecto.carpetas, [carpetaActiva]: nc } };
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: np } };
    }
    case 'ADD_ANNOTATION': {
      if (!elementoActivo) return state;
      const base = Array.isArray(elemento.annotations) ? elemento.annotations : [];
      const ne = { ...elemento, annotations: [...base, action.payload] };
      const nc = { ...carpeta, elementos: { ...carpeta.elementos, [elementoActivo]: ne } };
      const np = { ...proyecto, carpetas: { ...proyecto.carpetas, [carpetaActiva]: nc } };
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: np } };
    }
    case 'UPDATE_ANNOTATION': {
      if (!elementoActivo) return state;
      const base = Array.isArray(elemento.annotations) ? elemento.annotations : [];
      const updated = base.map((a, i) => i === action.index ? { ...a, ...action.changes } : a);
      const ne = { ...elemento, annotations: updated };
      const nc = { ...carpeta, elementos: { ...carpeta.elementos, [elementoActivo]: ne } };
      const np = { ...proyecto, carpetas: { ...proyecto.carpetas, [carpetaActiva]: nc } };
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: np } };
    }
    case 'CLEAR_CANVAS': {
      if (!elementoActivo) return state;
      const ne = { ...elemento, pickedStrokes: [], cracks: [], annotations: [] };
      const nc = { ...carpeta, elementos: { ...carpeta.elementos, [elementoActivo]: ne } };
      const np = { ...proyecto, carpetas: { ...proyecto.carpetas, [carpetaActiva]: nc } };
      return { ...state, proyectos: { ...proyectos, [proyectoActivo]: np } };
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
    const proj = state.proyectos?.[state.proyectoActivo];
    const carp = proj?.carpetas?.[state.carpetaActiva];
    const elem = carp?.elementos?.[state.elementoActivo];
    return getParamsFromValues(state.struct, elem?.formValues || {});
  }, [state.struct, state.proyectos, state.proyectoActivo, state.carpetaActiva, state.elementoActivo]);

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
