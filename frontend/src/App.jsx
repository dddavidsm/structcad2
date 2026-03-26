import { useEffect } from 'react';
import { useInspection } from './context/InspectionContext.jsx';
import Header from './components/Layout/Header.jsx';
import StructureSelector from './components/StructureSelector.jsx';
import CanvasEditor from './components/Canvas/CanvasEditor.jsx';
import InspectionForm from './components/Forms/InspectionForm.jsx';
import InspectionHistory from './components/History/InspectionHistory.jsx';
import { warmupServer } from './lib/api.js';
import './App.css';

function BottomNav() {
  const { state, dispatch } = useInspection();
  return (
    <nav className="bottom-nav">
      {[
        { id:'nueva',    label:'Nueva Inspección', icon:'＋' },
        { id:'historial',label:'Historial',         icon:'☰' },
      ].map(item => (
        <button
          key={item.id}
          className={`bnav-btn ${state.page===item.id?'active':''}`}
          onClick={() => dispatch({ type:'NAV_PAGE', payload:item.id })}
        >
          <span className="bnav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function WorkspaceBack() {
  const { state, dispatch } = useInspection();
  if (state.page !== 'nueva' || state.step !== 2) return null;
  return (
    <button
      className="back-btn"
      onClick={() => dispatch({ type:'SET_STEP', payload:1 })}
    >
      ← Cambiar estructura
    </button>
  );
}

export default function App() {
  const { state } = useInspection();
  const { page, step } = state;

  // Pre-calentar el servidor Render en cuanto carga la app
  useEffect(() => { warmupServer(); }, []);

  return (
    <div className="app-root">
      <Header />

      <main className="app-main">
        {page === 'nueva' && (
          <>
            <WorkspaceBack />
            {step === 1 && <StructureSelector />}
            {step === 2 && (
              <div className="workspace">
                <div className="workspace-canvas">
                  <CanvasEditor />
                </div>
                <div className="workspace-form">
                  <InspectionForm />
                </div>
              </div>
            )}
          </>
        )}
        {page === 'historial' && <InspectionHistory />}
      </main>

      <BottomNav />
    </div>
  );
}
