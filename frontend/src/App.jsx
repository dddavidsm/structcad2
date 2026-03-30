import { useEffect } from 'react';
import { useInspection } from './context/InspectionContext.jsx';
import Header from './components/Layout/Header.jsx';
import ProjectSidebar from './components/Layout/ProjectSidebar.jsx';
import ElementTabs from './components/Layout/ElementTabs.jsx';
import StructureSelector from './components/StructureSelector.jsx';
import CanvasEditor from './components/Canvas/CanvasEditor.jsx';
import InspectionForm from './components/Forms/InspectionForm.jsx';
import InspectionHistory from './components/History/InspectionHistory.jsx';
import { warmupServer } from './lib/api.js';
import { SpeedInsights } from '@vercel/speed-insights/react';
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
            {step === 2 && (() => {
              // Empty State global si no hay carpetas o elemento activo
              const proyecto = state.proyectos?.[state.proyectoActivo];
              const carpetas = proyecto?.carpetas || {};
              const carpeta = carpetas[state.carpetaActiva];
              const elementos = carpeta?.elementos || {};
              const elemento = elementos[state.elementoActivo];
              const noCarpetas = Object.keys(carpetas).length === 0;
              const noElementos = Object.keys(elementos).length === 0;
              if (noCarpetas || noElementos || !elemento) {
                return (
                  <div className="empty-state" style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%'}}>
                    No hay ninguna estructura seleccionada.<br />
                    Haz clic en 'Nueva Inspección' o selecciona un elemento para empezar.
                  </div>
                );
              }
              return (
                <div className="workspace">
                  <ProjectSidebar />
                  <div className="workspace-main">
                    <ElementTabs />
                    <div className="workspace-content">
                      <div className="workspace-canvas">
                        <CanvasEditor />
                      </div>
                      <div className="workspace-form">
                        <InspectionForm />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}
        {page === 'historial' && <InspectionHistory />}
      </main>

      <BottomNav />
      <SpeedInsights />
    </div>
  );
}
