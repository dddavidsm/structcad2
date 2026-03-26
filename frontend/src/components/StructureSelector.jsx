import { useInspection } from '../context/InspectionContext.jsx';
import { STRUCTS } from '../config/structures.js';
import './StructureSelector.css';

const STRUCT_ICONS = {
  'pilar-rect': '▬',
  'pilar-circ': '●',
  'viga':       '═',
  'forjado':    '▰',
  'zapata':     '⊓',
  'escalera':   '↗',
};

export default function StructureSelector() {
  const { state, dispatch } = useInspection();

  return (
    <div className="selector-page">
      <div className="selector-hero">
        <h1 className="selector-title">StructCAD Pro</h1>
        <p className="selector-subtitle">Inspección estructural profesional</p>
      </div>
      <div className="selector-grid">
        {Object.entries(STRUCTS).map(([id, def]) => (
          <button
            key={id}
            className={`struct-card ${state.struct===id?'selected':''}`}
            onClick={() => dispatch({ type: 'SELECT_STRUCT', payload: id })}
          >
            <span className="struct-icon">{STRUCT_ICONS[id]}</span>
            <span className="struct-label">{def.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
