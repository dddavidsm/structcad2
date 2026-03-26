import { createContext, useContext, useReducer, useCallback } from 'react';
import { STRUCTS, getParamsFromValues } from '../config/structures.js';

// ── Estado inicial ────────────────────────────────────────────────

const INITIAL = {
  page:       'nueva',     // 'nueva' | 'historial'
  step:       1,           // 1: selector estructura, 2: workspace
  struct:     null,
  view:       'section',   // 'section' | 'elevation'
  tool:       'pick',      // 'pick' | 'erase' | 'crack' | 'annotate' | 'select-bar'
  brush:      10,
  activeTab:  'geometria',

  // Datos de inspeccion (reset al cambiar estructura)
  barStatus:      {},   // {barId: 'unknown'|'found'|'notfound'|'oxidized'}
  cracks:         [],   // [{x1,y1,x2,y2}]
  annotations:    [],   // [{x,y,text}]
  customStirrups: [],   // [{barIds:[...]}]
  selectedBars:   [],
  pickedStrokes:  [],   // [{cx,cy,r}] en px del canvas — zona pintada
  sectionBounds:  null, // {ox,oy,sw,sh} — bounds de la seccion en canvas

  // Cache de barras (reconstruido en cada redraw)
  barPositions: [],

  // Valores de formulario persistentes por estructura
  formValues:  {},

  // Snapshots por estructura (al cambiar a otra)
  structStates: {},

  // Historial (desde Supabase o localStorage)
  history: [],

  // Estado del boton DXF
  dxfStatus: null,  // null | {type:'spin'|'ok'|'err', msg:string}
};

// ── Reducer ───────────────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {

    case 'NAV_PAGE':
      return { ...state, page: action.payload };

    case 'SET_STEP':
      return { ...state, step: action.payload };

    case 'SELECT_STRUCT': {
      const prev = state.struct;
      const next = action.payload;

      // Guardar snapshot del estado actual si hay estructura previa
      let structStates = state.structStates;
      if (prev && prev !== next) {
        structStates = {
          ...structStates,
          [prev]: {
            barStatus:      { ...state.barStatus },
            cracks:         state.cracks.map(c => ({ ...c })),
            annotations:    state.annotations.map(a => ({ ...a })),
            customStirrups: state.customStirrups.map(s => ({ barIds: [...s.barIds] })),
            formValues:     { ...state.formValues },
            selectedBars:   [],
            pickedStrokes:  state.pickedStrokes.map(s => ({ ...s })),
          }
        };
      }

      // Restaurar snapshot si existe, o resetear
      const saved = structStates[next];
      const defaultValues = {};
      if (STRUCTS[next]) {
        for (const tabSecs of Object.values(STRUCTS[next].tabs)) {
          for (const sec of tabSecs) {
            for (const f of sec.f) {
              defaultValues[f.id] = f.t === 'n' ? (f.v || 0) : (f.v || '');
            }
          }
        }
      }

      return {
        ...state,
        struct:         next,
        view:           'section',
        activeTab:      'geometria',
        structStates,
        barStatus:      saved ? { ...saved.barStatus }      : {},
        cracks:         saved ? saved.cracks.map(c=>({...c})) : [],
        annotations:    saved ? saved.annotations.map(a=>({...a})) : [],
        customStirrups: saved ? saved.customStirrups.map(s=>({barIds:[...s.barIds]})) : [],
        formValues:     saved ? { ...saved.formValues }     : defaultValues,
        selectedBars:   [],
        pickedStrokes:  saved ? saved.pickedStrokes.map(s=>({...s})) : [],
        sectionBounds:  null,
        barPositions:   [],
        step:           2,
      };
    }

    case 'SET_VIEW':
      return { ...state, view: action.payload };

    case 'SET_TOOL':
      return { ...state, tool: action.payload };

    case 'SET_BRUSH':
      return { ...state, brush: action.payload };

    case 'SET_TAB':
      return { ...state, activeTab: action.payload };

    case 'SET_FORM_VALUE':
      return { ...state, formValues: { ...state.formValues, [action.id]: action.value } };

    case 'SET_BAR_STATUS':
      return { ...state, barStatus: { ...state.barStatus, [action.barId]: action.status } };

    case 'SET_BAR_POSITIONS':
      return { ...state, barPositions: action.payload };

    case 'ADD_CRACK':
      return { ...state, cracks: [...state.cracks, action.payload] };

    case 'SET_CRACKS':
      return { ...state, cracks: action.payload };

    case 'ADD_ANNOTATION':
      return { ...state, annotations: [...state.annotations, action.payload] };

    case 'UPDATE_ANNOTATION':
      return {
        ...state,
        annotations: state.annotations.map((a, i) =>
          i === action.index ? { ...a, ...action.changes } : a
        ),
      };

    case 'REMOVE_ANNOTATION':
      return { ...state, annotations: state.annotations.filter((_, i) => i !== action.index) };

    case 'SET_SELECTED_BARS':
      return { ...state, selectedBars: action.payload };

    case 'ADD_CUSTOM_STIRRUP':
      return { ...state, customStirrups: [...state.customStirrups, action.payload] };

    case 'CLEAR_CUSTOM_STIRRUPS':
      return { ...state, customStirrups: [] };

    case 'ADD_PICKED_STROKE':
      return { ...state, pickedStrokes: [...state.pickedStrokes, action.payload] };

    case 'SET_PICKED_STROKES':
      return { ...state, pickedStrokes: action.payload };

    case 'SET_SECTION_BOUNDS':
      return { ...state, sectionBounds: action.payload };

    case 'CLEAR_CANVAS':
      return {
        ...state,
        pickedStrokes: [],
        cracks:        [],
        annotations:   [],
        customStirrups:[],
        selectedBars:  [],
      };

    case 'ADD_HISTORY':
      return { ...state, history: [action.payload, ...state.history] };

    case 'SET_HISTORY':
      return { ...state, history: action.payload };

    case 'REMOVE_HISTORY':
      return { ...state, history: state.history.filter(h => h.id !== action.id) };

    case 'SET_DXF_STATUS':
      return { ...state, dxfStatus: action.payload };

    case 'RESET_ALL':
      return { ...INITIAL };

    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────

const InspectionCtx = createContext(null);

export function InspectionProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  // Helpers tipados
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
