import React from 'react';
import './ProjectSidebar.css';
import { useInspection } from '../../context/InspectionContext.jsx';

export default function ProjectSidebar() {
  const { state, dispatch } = useInspection();
  const { paginas, paginaActiva } = state;
  const entries = Object.entries(paginas || {});

  return (
    <aside className="project-sidebar">
      <div className="sidebar-title">Planos</div>
      <ul className="sidebar-list">
        {entries.map(([pid, pag]) => (
          <li
            key={pid}
            className={pid === paginaActiva ? 'active' : ''}
            onClick={() => dispatch({ type: 'SET_PAGINA_ACTIVA', payload: pid })}
          >
            <span>{pag?.nombre}</span>
            {entries.length > 1 && (
              <button
                className="sidebar-delete-btn"
                title="Eliminar plano"
                onClick={e => {
                  e.stopPropagation();
                  if (window.confirm(`¿Eliminar "${pag?.nombre}"?`)) {
                    if (pid === paginaActiva) dispatch({ type: 'SET_PAGINA_ACTIVA', payload: pid });
                    dispatch({ type: 'DELETE_PAGINA' });
                  }
                }}
              >✕</button>
            )}
          </li>
        ))}
      </ul>
      <button
        className="sidebar-add-btn"
        onClick={() => {
          const nombre = prompt('Nombre del nuevo plano:');
          if (nombre) dispatch({ type: 'ADD_PAGINA', nombre });
        }}
      >
        + Nuevo plano
      </button>
    </aside>
  );
}
