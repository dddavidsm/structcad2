import React from 'react';
import './ProjectSidebar.css';
import { useInspection } from '../../context/InspectionContext.jsx';

export default function ProjectSidebar() {
  const { state, dispatch } = useInspection();
  const proyecto = state.proyectos?.[state.proyectoActivo];
  const carpetas = proyecto?.carpetas || {};
  const carpetaActiva = state.carpetaActiva;

  return (
    <aside className="project-sidebar">
      <div className="sidebar-title">Carpetas</div>
      <ul className="sidebar-list">
        {Object.values(carpetas || {}).map((carpeta, idx) => {
          const cid = Object.keys(carpetas)[idx];
          return (
            <li
              key={cid}
              className={cid === carpetaActiva ? 'active' : ''}
              onClick={() => dispatch({ type: 'SET_CARPETA_ACTIVA', payload: cid })}
            >
              <span>{carpeta?.nombre}</span>
              {/* Ejemplo de conteo: Object.keys(carpetas).length */}
            </li>
          );
        })}
      </ul>
      <button
        className="sidebar-add-btn"
        onClick={() => {
          const nombre = prompt('Nombre de la nueva carpeta:');
          if (nombre) dispatch({ type: 'ADD_CARPETA', nombre });
        }}
      >
        + Nueva carpeta
      </button>
    </aside>
  );
}
