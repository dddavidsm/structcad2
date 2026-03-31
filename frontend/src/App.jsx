// v3.0 flat-pages architecture
import { useEffect } from 'react';
import { useInspection } from './context/InspectionContext.jsx';
import Header from './components/Layout/Header.jsx';
import ProjectSidebar from './components/Layout/ProjectSidebar.jsx';
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
        { id: 'nueva',     label: 'Nueva Inspección', icon: '＋' },
        { id: 'historial', label: 'Historial',         icon: '☰' },
      ].map(item => (
        <button
          key={item.id}
          className={`bnav-btn ${state.page === item.id ? 'active' : ''}`}
          onClick={() => dispatch({ type: 'NAV_PAGE', payload: item.id })}
        >
          <span className="bnav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function App() {
  const { state } = useInspection();
  const { page, step } = state;

  useEffect(() => { warmupServer(); }, []);

  return (
    <div className="app-root">
      <Header />

      <main className="app-main">
        {page === 'nueva' && (
          <>
            {step === 1 && <StructureSelector />}
            {step === 2 && (
              <ErrorBoundary>
                <div className="workspace">
                  <ProjectSidebar />
                  <div className="workspace-content">
                    <CanvasEditor />
                    <InspectionForm />
                  </div>
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
