import { useState, useEffect, useRef } from 'react';
import { useInspection } from '../../context/InspectionContext.jsx';
import { STRUCTS } from '../../config/structures.js';
import { exportDXF } from '../../lib/api.js';
import { saveInspection } from '../../lib/supabase.js';
import './InspectionForm.css';

const TAB_ICONS = {
  geometria:  '▭',
  armadura:   '≡',
  inspeccion: '⊙',
  obra:       '⌂',
};

const TAB_LABELS = {
  geometria:  'Geometría',
  armadura:   'Armadura',
  inspeccion: 'Inspección',
  obra:       'Obra',
};

export default function InspectionForm() {
  const { state, dispatch, setFormValue, getParams } = useInspection();
  const pagina = state.paginas?.[state.paginaActiva];
  if (!pagina) return <div className="empty-state">No hay ninguna estructura seleccionada.<br />Haz clic en 'Nueva Inspección' o selecciona un elemento para empezar.</div>;
  const formValues = pagina?.formValues || {};
  const { struct, activeTab, dxfStatus } = state;

  const [exportMsg, setExportMsg] = useState(null);

  if (!struct || !STRUCTS[struct]) return null;
  const def  = STRUCTS[struct];
  const tabs = Object.keys(def.tabs);

  function onStatus(type, msg) {
    setExportMsg({ type, msg });
    dispatch({ type: 'SET_DXF_STATUS', payload: { type, msg } });
    if (type !== 'spin') setTimeout(() => setExportMsg(null), 4000);
  }

  async function handleExport() {
    // Construir estado plano compatible con exportDXF (mezcla UI state + datos del elemento)
    const flatState = {
      ...state,
      formValues:    formValues,
      barStatus:     pagina?.barStatus     || {},
      pickedStrokes: Array.isArray(pagina?.pickedStrokes) ? pagina.pickedStrokes : [],
      cracks:        Array.isArray(pagina?.cracks)        ? pagina.cracks        : [],
      annotations:   Array.isArray(pagina?.annotations)   ? pagina.annotations   : [],
      customStirrups: Array.isArray(pagina?.customStirrups)
        ? pagina.customStirrups.map(s =>
            typeof s === 'object' && !Array.isArray(s)
              ? { barIds: s.barIds || [], ny: s.ny ?? 0.5, inset: s.inset ?? 0 }
              : s
          )
        : [],
    };
    const result = await exportDXF(flatState, onStatus);
    if (result?.ok) {
      // Guardar en historial
      const p = getParams();
      const record = {
        element_ref:    p.element_id  || 'E-01',
        structure_type: struct,
        plant:          p.planta       || '',
        axis:           p.eje          || '',
        inspection_date: p.fecha_insp  || new Date().toISOString().slice(0,10),
        project_name:   p.obra_nombre  || '',
        technician:     p.tecnico      || '',
        rebar_found:    p.rebar_found  || '',
        notes:          p.notes        || '',
        dxf_filename:   result.filename || '',
        form_data:      p,
        created_at:     new Date().toISOString(),
      };
      // Intentar guardar en Supabase
      const { data, error } = await saveInspection(record);
      const histEntry = data || { ...record, id: Date.now().toString() };
      dispatch({ type: 'ADD_HISTORY', payload: histEntry });
    }
  }

  const currentSections = def.tabs[activeTab] || [];

  return (
    <div className="form-panel">
      {/* Titulo */}
      <div className="form-header">
        <span className="form-title">{def.label}</span>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`tab-btn ${activeTab===tab?'active':''}`}
            onClick={() => dispatch({ type:'SET_TAB', payload:tab })}
          >
            <span className="tab-icon">{TAB_ICONS[tab]}</span>
            <span className="tab-label">{TAB_LABELS[tab]}</span>
          </button>
        ))}
      </div>

      {/* Contenido del tab */}
      <div className="tab-content">
        {currentSections.map((sec, si) => (
          <div key={si} className="form-section">
            <div className="form-section-title">{sec.s}</div>
            <div className="form-fields">
              {sec.f.map(field => (
                <FormField
                  key={field.id}
                  field={field}
                  value={formValues[field.id] !== undefined ? formValues[field.id] : field.v}
                  onChange={v => setFormValue(field.id, v)}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Sección de estribos individuales (solo en tab armadura) */}
        {activeTab === 'armadura' && <CustomStirrupsSection />}
      </div>

      {/* Boton DXF */}
      <div className="form-actions">
        <button
          className={`btn-dxf ${exportMsg?.type==='spin'?'loading':''} ${exportMsg?.type==='ok'?'ok':''} ${exportMsg?.type==='err'?'err':''}`}
          onClick={handleExport}
          disabled={exportMsg?.type==='spin'}
        >
          {exportMsg?.type==='spin' ? '⟳ Generando…' :
           exportMsg?.type==='ok'   ? exportMsg.msg  :
           exportMsg?.type==='err'  ? exportMsg.msg  :
           '↓ Generar DXF'}
        </button>
      </div>
    </div>
  );
}

// ── Sección de estribos individuales ───────────────────────────────

function CustomStirrupsSection() {
  const { state, dispatch } = useInspection();
  const pagina = state.paginas?.[state.paginaActiva];
  const customStirrups = Array.isArray(pagina?.customStirrups) ? pagina.customStirrups : [];
  const ih = parseFloat(pagina?.formValues?.inspection_height) || 25;

  if (!customStirrups.length) return (
    <div className="form-section">
      <div className="form-section-title">Estribos individuales</div>
      <div className="form-fields">
        <span style={{ color:'#94a3b8', fontSize:12, padding:'4px 0' }}>
          Usa la herramienta "Sel. Barra" en planta para añadir estribos.
        </span>
      </div>
    </div>
  );

  return (
    <div className="form-section">
      <div className="form-section-title">Estribos individuales ({customStirrups.length})</div>
      <div className="form-fields" style={{ gap: 6 }}>
        {customStirrups.map((st, i) => (
          <div key={st.id || i} style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'4px 6px', background:'#fef3c7', borderRadius:5, fontSize:12,
          }}>
            <strong style={{ color:'#92400e', minWidth:26 }}>E{i+1}</strong>
            <label style={{ color:'#78350f', fontSize:11 }}>Pos:</label>
            <span style={{ fontSize:11, color:'#92400e', minWidth:36 }}>
              {((st.ny ?? 0.5) * ih).toFixed(1)}cm
            </span>
            <label style={{ color:'#78350f', fontSize:11 }}>Dist:</label>
            <input
              type="number" min={0} max={20} step={0.5}
              value={st.inset ?? 0}
              onChange={e => dispatch({
                type:'UPDATE_CUSTOM_STIRRUP', index:i,
                changes:{ inset: parseFloat(e.target.value) || 0 }
              })}
              style={{ width:48, fontSize:11, padding:'1px 3px', borderRadius:3, border:'1px solid #d6d3d1' }}
            />
            <span style={{ fontSize:10, color:'#a8a29e' }}>cm</span>
            <button
              onClick={() => dispatch({ type:'DELETE_CUSTOM_STIRRUP', index:i })}
              style={{
                marginLeft:'auto', background:'none', border:'none',
                color:'#dc2626', cursor:'pointer', fontSize:11, padding:'2px 4px',
              }}
              title="Eliminar estribo"
            >✕</button>
          </div>
        ))}
        <span style={{ color:'#a8a29e', fontSize:10, marginTop:2 }}>
          Arrastra los estribos en la vista lateral para posicionarlos.
        </span>
      </div>
    </div>
  );
}

// ── Campo de formulario ───────────────────────────────────────────

function FormField({ field, value, onChange }) {
  const { id, l, u, t, mn, mx, st, opts, ph } = field;

  // Estado local para inputs numéricos: permite vaciar y escribir sin fricción
  const [numRaw, setNumRaw] = useState(() =>
    t === 'n' ? String(value ?? field.v ?? '') : ''
  );
  const isFocused = useRef(false);

  // Sincronizar cuando el valor externo cambia y el input no está activo
  useEffect(() => {
    if (t === 'n' && !isFocused.current) {
      setNumRaw(String(value ?? field.v ?? ''));
    }
  }, [value, field.v, t]);

  const label = (
    <label className="field-label" htmlFor={id}>
      {l}{u ? <span className="field-unit">{u}</span> : null}
    </label>
  );

  if (t === 'n') {
    return (
      <div className="field-row">
        {label}
        <input
          id={id} type="number"
          min={mn} max={mx} step={st}
          value={numRaw}
          onFocus={e => { isFocused.current = true; e.target.select(); }}
          onChange={e => {
            const raw = e.target.value;
            setNumRaw(raw);
            // Propagar al estado global en tiempo real para reactividad del canvas
            const v = parseFloat(raw);
            if (!isNaN(v)) onChange(v);
          }}
          onBlur={() => {
            isFocused.current = false;
            const v = parseFloat(numRaw);
            if (!isNaN(v)) {
              onChange(v);
              setNumRaw(String(v));
            } else {
              // Revertir al valor actual si el campo queda inválido
              setNumRaw(String(value ?? field.v ?? ''));
            }
          }}
          className="field-input"
        />
      </div>
    );
  }

  if (t === 's') {
    return (
      <div className="field-row">
        {label}
        <select
          id={id}
          value={value ?? field.v}
          onChange={e => onChange(e.target.value)}
          className="field-input field-select"
        >
          {(opts || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  if (t === 'd') {
    return (
      <div className="field-row">
        {label}
        <input
          id={id} type="date"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          className="field-input"
        />
      </div>
    );
  }

  if (t === 'ta') {
    return (
      <div className="field-col">
        {label}
        <textarea
          id={id} rows={3}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          className="field-textarea"
          placeholder="Observaciones técnicas…"
        />
      </div>
    );
  }

  // t === 'tx'
  return (
    <div className="field-row">
      {label}
      <input
        id={id} type="text"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="field-input"
        placeholder={ph || ''}
      />
    </div>
  );
}
