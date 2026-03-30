import { useEffect } from 'react';
import { useInspection } from './context/InspectionContext.jsx';
import Header from './components/Layout/Header.jsx';
import ProjectSidebar from './components/Layout/ProjectSidebar.jsx';
import ElementTabs from './components/Layout/ElementTabs.jsx';
import StructureSelector from './components/StructureSelector.jsx';
import CanvasEditor from './components/Canvas/CanvasEditor.jsx';
import InspectionForm from './components/Forms/InspectionForm.jsx';
import InspectionHistory from './components/History/InspectionHistory.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
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

  // DEBUG: log de estado central
  const proyecto = state.proyectos?.[state.proyectoActivo];
  const carpetas = proyecto?.carpetas || {};
  const carpeta = carpetas[state.carpetaActiva];
  const elementos = carpeta?.elementos || {};
  const elementoActivo = elementos[state.elementoActivo];
  console.log("🔥 DEBUG RENDER:", { page: state.page, step: state.step, hasActivo: !!elementoActivo });

  return (
    <div className="app-root">
      <Header />

      <main className="app-main">
        {page === 'nueva' && (
          <>
            <WorkspaceBack />
            {step === 1 && <StructureSelector />}
            {step === 2 && (
              <ErrorBoundary>
                <div className="flex-1 flex overflow-hidden">
                  {(
                    !state.proyectos ||
                    !state.proyectoActivo ||
                    !state.carpetaActiva ||
                    !state.elementoActivo ||
                    Object.keys(state.proyectos || {}).length === 0 ||
                    Object.keys(state.proyectos?.[state.proyectoActivo]?.carpetas || {}).length === 0 ||
                    Object.keys(state.proyectos?.[state.proyectoActivo]?.carpetas?.[state.carpetaActiva]?.elementos || {}).length === 0
                  ) ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                      <h2>No hay estructura seleccionada</h2>
                      <p>Por favor, crea un proyecto o elemento para comenzar.</p>
                    </div>
                  ) : (
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
                  )}
                </div>
              </ErrorBoundary>
            )}
          </>
        )}
        {page === 'historial' && <InspectionHistory />}
      </main>

      <BottomNav />
    </div>
  );
}
