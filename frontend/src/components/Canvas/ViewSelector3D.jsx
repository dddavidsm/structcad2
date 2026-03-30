/**
 * ViewSelector3D.jsx
 * Cubo isométrico SVG para cambiar la vista activa del canvas.
 * Props: { view, onChangeView }
 */
export default function ViewSelector3D({ view, onChangeView }) {
  const BASE = '#94a3b8';
  const ACTIVE = '#3b82f6';
  const STROKE = '#334155';

  return (
    <svg
      viewBox="0 0 100 100"
      width="62"
      height="62"
      style={{ display: 'block', cursor: 'default' }}
      title="Seleccionar vista"
    >
      {/* Top — Planta */}
      <polygon
        points="50,10 85,28 50,46 15,28"
        fill={view === 'section' ? ACTIVE : BASE}
        stroke={STROKE}
        strokeWidth="1.5"
        style={{ cursor: 'pointer', transition: 'fill .15s' }}
        onClick={() => onChangeView('section')}
      >
        <title>Planta</title>
      </polygon>

      {/* Left — Sección/Alzado frontal */}
      <polygon
        points="15,28 50,46 50,92 15,74"
        fill={view === 'elevation' ? ACTIVE : BASE}
        stroke={STROKE}
        strokeWidth="1.5"
        style={{ cursor: 'pointer', filter: 'brightness(.88)', transition: 'fill .15s' }}
        onClick={() => onChangeView('elevation')}
      >
        <title>Sección</title>
      </polygon>

      {/* Right — Lateral */}
      <polygon
        points="50,46 85,28 85,74 50,92"
        fill={view === 'lateral' ? ACTIVE : BASE}
        stroke={STROKE}
        strokeWidth="1.5"
        style={{ cursor: 'pointer', filter: 'brightness(.76)', transition: 'fill .15s' }}
        onClick={() => onChangeView('lateral')}
      >
        <title>Lateral</title>
      </polygon>

      {/* Etiquetas */}
      <text x="50" y="30" textAnchor="middle" fontSize="7" fill={view === 'section' ? '#fff' : '#334155'} style={{ pointerEvents: 'none' }}>↑</text>
      <text x="26" y="62" textAnchor="middle" fontSize="6" fill={view === 'elevation' ? '#fff' : '#334155'} style={{ pointerEvents: 'none' }}>F</text>
      <text x="73" y="62" textAnchor="middle" fontSize="6" fill={view === 'lateral' ? '#fff' : '#334155'} style={{ pointerEvents: 'none' }}>L</text>
    </svg>
  );
}
