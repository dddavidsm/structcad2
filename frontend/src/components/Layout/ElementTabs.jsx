import React from 'react';
import './ElementTabs.css';
import { useInspection } from '../../context/InspectionContext.jsx';

export default function ElementTabs() {
  const { state, dispatch } = useInspection();
  const proyecto = state.proyectos?.[state.proyectoActivo];
  const carpeta = proyecto?.carpetas?.[state.carpetaActiva];
  const elementos = carpeta?.elementos || {};
  const elementoActivo = state.elementoActivo;

  // Saneamiento: tratar elementos como objeto
  const elementosCount = Object.keys(elementos || {}).length;
  return (
    <div className="element-tabs">
      {Object.values(elementos || {}).map((elemento, idx) => {
        const eid = Object.keys(elementos)[idx];
        return (
          <div
            key={eid}
            className={`tab ${eid === elementoActivo ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_ELEMENTO_ACTIVO', payload: eid })}
          >
            {elemento?.nombre}
          </div>
        );
      })}
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
      {/* Ejemplo de conteo: {elementosCount} elementos */}
    </div>
  );
}
