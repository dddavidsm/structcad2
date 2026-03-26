import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { InspectionProvider } from './context/InspectionContext.jsx';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <InspectionProvider>
      <App />
    </InspectionProvider>
  </StrictMode>,
);
