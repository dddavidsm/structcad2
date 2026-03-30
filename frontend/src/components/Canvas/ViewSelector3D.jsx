/**
 * ViewSelector3D.jsx
 * Selectores isométricos SVG por tipo de estructura.
 * Props: { struct, view, onChangeView }
 */
const BASE = '#94a3b8';
const ACTIVE = '#3b82f6';
const STROKE = '#334155';

function face(active) { return active ? ACTIVE : BASE; }

// ── Pilar Rectangular: cubo isométrico (3 caras) ──────────────────
function CubeSelector({ view, onChangeView }) {
  return (
    <svg viewBox="0 0 100 100" width="56" height="56" style={{ display:'block', cursor:'default' }}>
      <polygon points="50,10 85,28 50,46 15,28" fill={face(view==='section')} stroke={STROKE} strokeWidth="1.5"
               style={{ cursor:'pointer', transition:'fill .15s' }} onClick={() => onChangeView('section')}>
        <title>Planta</title>
      </polygon>
      <polygon points="15,28 50,46 50,92 15,74" fill={face(view==='elevation')} stroke={STROKE} strokeWidth="1.5"
               style={{ cursor:'pointer', filter:'brightness(.88)', transition:'fill .15s' }} onClick={() => onChangeView('elevation')}>
        <title>Sección</title>
      </polygon>
      <polygon points="50,46 85,28 85,74 50,92" fill={face(view==='lateral')} stroke={STROKE} strokeWidth="1.5"
               style={{ cursor:'pointer', filter:'brightness(.76)', transition:'fill .15s' }} onClick={() => onChangeView('lateral')}>
        <title>Lateral</title>
      </polygon>
      <text x="50" y="30" textAnchor="middle" fontSize="7" fill={view==='section' ? '#fff' : STROKE} style={{ pointerEvents:'none' }}>↑</text>
      <text x="26" y="62" textAnchor="middle" fontSize="6" fill={view==='elevation' ? '#fff' : STROKE} style={{ pointerEvents:'none' }}>F</text>
      <text x="73" y="62" textAnchor="middle" fontSize="6" fill={view==='lateral'   ? '#fff' : STROKE} style={{ pointerEvents:'none' }}>L</text>
    </svg>
  );
}

// ── Pilar Circular: cilindro (2 caras) ────────────────────────────
function CylinderSelector({ view, onChangeView }) {
  return (
    <svg viewBox="0 0 100 100" width="56" height="56" style={{ display:'block', cursor:'default' }}>
      {/* Cuerpo del cilindro */}
      <rect x="20" y="30" width="60" height="50" rx="0" fill={face(view==='elevation')} stroke={STROKE} strokeWidth="1.5"
            style={{ cursor:'pointer', filter:'brightness(.85)', transition:'fill .15s' }} onClick={() => onChangeView('elevation')} />
      {/* Elipse inferior */}
      <ellipse cx="50" cy="80" rx="30" ry="10" fill={face(view==='elevation')} stroke={STROKE} strokeWidth="1.5"
               style={{ cursor:'pointer', filter:'brightness(.78)', transition:'fill .15s' }} onClick={() => onChangeView('elevation')}>
        <title>Alzado</title>
      </ellipse>
      {/* Elipse superior (Planta) */}
      <ellipse cx="50" cy="30" rx="30" ry="10" fill={face(view==='section')} stroke={STROKE} strokeWidth="1.5"
               style={{ cursor:'pointer', transition:'fill .15s' }} onClick={() => onChangeView('section')}>
        <title>Planta</title>
      </ellipse>
      <text x="50" y="34" textAnchor="middle" fontSize="7" fill={view==='section' ? '#fff' : STROKE} style={{ pointerEvents:'none' }}>↑</text>
      <text x="50" y="62" textAnchor="middle" fontSize="7" fill={view==='elevation' ? '#fff' : STROKE} style={{ pointerEvents:'none' }}>A</text>
    </svg>
  );
}

// ── Viga: prisma horizontal (2 caras) ─────────────────────────────
function BeamSelector({ view, onChangeView }) {
  return (
    <svg viewBox="0 0 100 100" width="56" height="56" style={{ display:'block', cursor:'default' }}>
      {/* Cara frontal (Sección) */}
      <polygon points="10,35 50,35 50,90 10,90" fill={face(view==='section')} stroke={STROKE} strokeWidth="1.5"
               style={{ cursor:'pointer', transition:'fill .15s' }} onClick={() => onChangeView('section')}>
        <title>Sección</title>
      </polygon>
      {/* Cara superior (Alzado) */}
      <polygon points="10,35 50,35 90,18 50,18" fill={face(view==='elevation')} stroke={STROKE} strokeWidth="1.5"
               style={{ cursor:'pointer', filter:'brightness(.88)', transition:'fill .15s' }} onClick={() => onChangeView('elevation')}>
        <title>Alzado</title>
      </polygon>
      {/* Cara lateral */}
      <polygon points="50,35 90,18 90,73 50,90" fill={BASE} stroke={STROKE} strokeWidth="1.5"
               style={{ filter:'brightness(.76)' }} />
      <text x="28" y="66" textAnchor="middle" fontSize="7" fill={view==='section' ? '#fff' : STROKE} style={{ pointerEvents:'none' }}>S</text>
      <text x="45" y="28" textAnchor="middle" fontSize="7" fill={view==='elevation' ? '#fff' : STROKE} style={{ pointerEvents:'none' }}>A</text>
    </svg>
  );
}

export default function ViewSelector3D({ struct, view, onChangeView }) {
  switch (struct) {
    case 'pilar-rect': return <CubeSelector view={view} onChangeView={onChangeView} />;
    case 'pilar-circ': return <CylinderSelector view={view} onChangeView={onChangeView} />;
    case 'viga':       return <BeamSelector view={view} onChangeView={onChangeView} />;
    default:           return null;
  }
}
