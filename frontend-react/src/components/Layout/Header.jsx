import { useInspection } from '../../context/InspectionContext.jsx';
import './Header.css';

export default function Header() {
  const { dispatch } = useInspection();

  function handleReset() {
    if (window.confirm('¿Reiniciar toda la sesión? Se perderán los datos no exportados.')) {
      dispatch({ type: 'RESET_ALL' });
    }
  }

  return (
    <header className="app-header">
      <div className="header-logo">
        <span className="logo-icon">⬡</span>
        <span className="logo-text">StructCAD <span className="logo-pro">Pro</span></span>
      </div>
      <div className="header-actions">
        <span className="header-version">v2.2</span>
        <button className="btn-reset" onClick={handleReset} title="Reiniciar sesión">
          ↺ Reset
        </button>
      </div>
    </header>
  );
}
