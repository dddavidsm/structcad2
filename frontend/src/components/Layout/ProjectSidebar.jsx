import React, { useState } from 'react';
import './ProjectSidebar.css';
import { useInspection } from '../../context/InspectionContext.jsx';

export default function ProjectSidebar() {
  const { state, dispatch } = useInspection();

  const { paginas, paginaActiva } = state;
  const entries = Object.entries(paginas || {});
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");

  return (
    <aside className="project-sidebar">
      <div className="sidebar-title">Planos</div>
      <ul className="sidebar-list">
        {entries.map(([pid, pag]) => (
          <li
            key={pid}
            className={pid === paginaActiva ? 'active' : ''}
            onClick={() => dispatch({ type: 'SET_PAGINA_ACTIVA', payload: pid })}
            onDoubleClick={() => {
              setEditingId(pid);
              setEditValue(pag?.nombre || "");
            }}
          >
            {editingId === pid ? (
              <input
                type="text"
                value={editValue}
                autoFocus
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => {
                  dispatch({ type: 'RENAME_PAGINA', pid, nombre: editValue });
                  setEditingId(null);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    dispatch({ type: 'RENAME_PAGINA', pid, nombre: editValue });
                    setEditingId(null);
                  } else if (e.key === 'Escape') {
                    setEditingId(null);
                  }
                }}
                onClick={e => e.stopPropagation()}
                className="sidebar-edit-input"
              />
            ) : (
              <span className="sidebar-pagina-name">{pag?.nombre}</span>
            )}
            {entries.length > 1 && (
              <button
                className="sidebar-delete-btn"
                title="Eliminar plano"
                onClick={e => {
                  e.stopPropagation();
                  dispatch({ type: 'DELETE_PAGINA' });
                }}
              >✕</button>
            )}
          </li>
        ))}
        {/* Añadir nuevo plano inline */}
        <li
          className="sidebar-add-item"
          onClick={() => dispatch({ type: 'ADD_PAGINA', nombre: `Plano ${entries.length + 1}` })}
          title="Añadir plano"
        >
          <span>＋</span>
        </li>
      </ul>
    </aside>
  );
}
