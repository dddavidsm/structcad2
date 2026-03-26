import { useEffect } from 'react';
import { useInspection } from '../../context/InspectionContext.jsx';
import { fetchInspections, deleteInspection } from '../../lib/supabase.js';
import { exportCSV } from '../../lib/api.js';
import './InspectionHistory.css';

export default function InspectionHistory() {
  const { state, dispatch } = useInspection();
  const { history } = state;

  useEffect(() => {
    fetchInspections().then(({ data }) => {
      if (data?.length) dispatch({ type: 'SET_HISTORY', payload: data });
    });
  }, []);

  async function handleDelete(id) {
    if (!window.confirm('¿Eliminar esta inspección?')) return;
    await deleteInspection(id);
    dispatch({ type: 'REMOVE_HISTORY', id });
  }

  return (
    <div className="history-page">
      <div className="history-header">
        <h2 className="history-title">Historial de Inspecciones</h2>
        <button
          className="btn-csv"
          onClick={() => exportCSV(history)}
          disabled={!history.length}
        >
          ↓ Exportar CSV
        </button>
      </div>

      {history.length === 0 ? (
        <div className="history-empty">
          <p>No hay inspecciones registradas.</p>
          <p>Genera un DXF desde <em>Nueva Inspección</em> para guardar aquí.</p>
        </div>
      ) : (
        <div className="history-list">
          {history.map((rec, i) => (
            <div key={rec.id || i} className="history-card">
              <div className="hc-main">
                <span className="hc-ref">{rec.element_ref || rec.element_id || '—'}</span>
                <span className="hc-type">{rec.structure_type || rec.tipo || '—'}</span>
              </div>
              <div className="hc-meta">
                {rec.project_name && <span>{rec.project_name}</span>}
                {rec.plant       && <span>Planta: {rec.plant}</span>}
                {rec.inspection_date && <span>{rec.inspection_date}</span>}
                {rec.rebar_found  && <span className="hc-badge">{rec.rebar_found}</span>}
              </div>
              {rec.notes && <div className="hc-notes">{rec.notes}</div>}
              <button
                className="hc-delete"
                onClick={() => handleDelete(rec.id)}
                title="Eliminar"
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
