import React from 'react';
import './ElementTabs.css';
import { useInspection } from '../../context/InspectionContext.jsx';

export default function ElementTabs() {
  const { state, dispatch } = useInspection();
  const proyecto = state.proyectos[state.proyectoActivo];
  const carpeta = proyecto.carpetas[state.carpetaActiva];
  const elementos = carpeta ? carpeta.elementos : {};
  const elementoActivo = state.elementoActivo;

  return (
    <div className="element-tabs">
      {Object.entries(elementos).map(([eid, elemento]) => (
        <div
          key={eid}
          className={`tab ${eid === elementoActivo ? 'active' : ''}`}
          onClick={() => dispatch({ type: 'SET_ELEMENTO_ACTIVO', payload: eid })}
        >
          {elemento.nombre}
        </div>
      ))}
      <button
        className="tab-add-btn"
        title="Clonar elemento actual"
        onClick={() => {
          const nombre = prompt('Nombre del nuevo elemento:');
          if (nombre) dispatch({ type: 'ADD_ELEMENTO', nombre });
        }}
      >
        +
      </button>
    </div>
  );
}
