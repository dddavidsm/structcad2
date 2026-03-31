import React, { useState } from 'react';
import './ProjectSidebar.css';
import { useInspection } from '../../context/InspectionContext.jsx';

export default function ProjectSidebar() {
  const { state, dispatch } = useInspection();
  const { paginas, paginaActiva } = state;
  const entries = Object.entries(paginas || {});
  const [editingTab, setEditingTab] = useState(null);
  const [editName, setEditName] = useState('');

  function saveName(pid) {
    if (editName.trim()) dispatch({ type: 'RENAME_PAGINA', pid, nombre: editName.trim() });
    setEditingTab(null);
  }

  return (
    <div className="excel-tabs-bar">
      <ul className="sidebar-list">
        {entries.map(([pid, pag]) => (
          <li
            key={pid}
            className={pid === paginaActiva ? 'active' : ''}
            onClick={() => dispatch({ type: 'SET_PAGINA_ACTIVA', payload: pid })}
          >
            {editingTab === pid ? (
              <input
                autoFocus
                className="tab-input"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={() => saveName(pid)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveName(pid);
                  else if (e.key === 'Escape') setEditingTab(null);
                }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span onDoubleClick={() => { setEditingTab(pid); setEditName(pag?.nombre || ''); }}>
                {pag?.nombre}
              </span>
            )}
            {entries.length > 1 && (
              <button
                className="sidebar-delete-btn"
                title="Eliminar plano"
                onClick={e => { e.stopPropagation(); dispatch({ type: 'DELETE_PAGINA', payload: pid }); }}
              >✕</button>
            )}
          </li>
        ))}
      </ul>
      <button
        className="sidebar-add-btn"
        title="Añadir plano"
        onClick={() => dispatch({ type: 'SET_STEP', payload: 1 })}
      >＋</button>
    </div>
  );
}
