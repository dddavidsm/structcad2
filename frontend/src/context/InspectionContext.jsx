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
};

// ── Helpers ───────────────────────────────────────────────────────

function _cloneView(state) {
  return {
    pickedStrokes:  state.pickedStrokes.map(s => ({ ...s })),
    cracks:         state.cracks.map(c => ({ ...c })),
    annotations:    state.annotations.map(a => ({ ...a })),
    customStirrups: state.customStirrups.map(s => ({ barIds: [...s.barIds] })),
  };
}

function _restoreView(vd) {
  return {
    pickedStrokes:  (vd?.pickedStrokes  || []).map(s => ({ ...s })),
    cracks:         (vd?.cracks         || []).map(c => ({ ...c })),
    annotations:    (vd?.annotations    || []).map(a => ({ ...a })),
    customStirrups: (vd?.customStirrups || []).map(s => ({ barIds: [...s.barIds] })),
  };
}

// ── Reducer NUEVO (jerárquico e inmutable) ──────────────────────
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function reducer(state, action) {
  const { proyectoActivo, carpetaActiva, elementoActivo } = state;
  const proyectos = state.proyectos;
  const proyecto = proyectos[proyectoActivo];
  const carpeta = proyecto.carpetas[carpetaActiva];
  const elemento = carpeta.elementos[elementoActivo];

  switch (action.type) {
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

  const getParams = useCallback(() =>
    getParamsFromValues(state.struct, state.formValues), [state.struct, state.formValues]);

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
