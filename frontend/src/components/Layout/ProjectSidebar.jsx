import React from 'react';
import './ProjectSidebar.css';
import { useInspection } from '../../context/InspectionContext.jsx';
  // Saneamiento: tratar carpetas como objeto
  const carpetasArr = Object.values(carpetas || {});
  return (
    <aside className="project-sidebar">
      <div className="sidebar-title">Carpetas</div>
      <ul className="sidebar-list">
        {Object.entries(carpetas || {}).map(([cid, carpeta]) => (
          <li
            key={cid}
            className={cid === carpetaActiva ? 'active' : ''}
            onClick={() => dispatch({ type: 'SET_CARPETA_ACTIVA', payload: cid })}
          >
            <span>{carpeta?.nombre}</span>
          </li>
        ))}
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
          if (nombre) dispatch({ type: 'ADD_CARPETA', nombre });
        }}
      >
        + Nueva carpeta
      </button>
    </aside>
  );
}
