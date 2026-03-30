# Contexto del Proyecto: StructCAD Pro v2
Aplicación para la generación de planos técnicos de inspección estructural.
- **Frontend**: React 19 + Vite. Desplegado en VERCEL (Root Directory: `frontend`).
- **Backend**: FastAPI + Pydantic + ezdxf. Desplegado en RENDER.
- **Base de Datos**: Supabase (PostgreSQL).

# Comandos Críticos
- Backend Dev: `cd backend && uvicorn main:app --reload`
- Frontend Dev: `cd frontend && npm run dev`
- Frontend Build: `cd frontend && npm install && npm run build` (Para validar errores de despliegue en Vercel).

# ⚠️ REGLAS CRÍTICAS DE FRONTEND (ESTADO Y CRASHES)
El estado en `InspectionContext.jsx` fue refactorizado. Para evitar crashes (`TypeError: Cannot read properties of undefined`):
1. **Colecciones son OBJETOS**: `proyectos`, `carpetas` y `elementos` son diccionarios indexados por ID, NO arrays.
2. **Prohibido `.length` y `.map()` directo**: Usa siempre `Object.values(obj || {}).map()` y `Object.keys(obj || {}).length`.
3. **Blindaje de Elementos**: Los arrays internos del elemento activo deben extraerse con fallback de seguridad antes de usarse. Ejemplo: `const strokes = elementoActivo?.pickedStrokes || [];`. NUNCA asumas que existen.

# Convenciones de Desarrollo
## Backend (FastAPI & ezdxf)
- **Modelos Pydantic**: Toda nueva estructura debe heredar de `InspectionBase` en `main.py` y validar estrictamente las medidas (ej. `gt=0`).
- **Motor DXF (`dxf_engine.py`)**: 
  - NO modifiques la lógica de capas (LAYERS) ni los colores asignados (ej. color 252 para hormigón intacto, ANSI32 para picado).
  - El texto en los DXF debe ser ASCII puro (usa siempre la función `_a()` para escapar tildes y símbolos).
  - La función `_fill_picado_circles` es crítica. Mapea coordenadas normalizadas `[0,1]` (nx, ny, nr) enviadas desde el canvas del frontend y debe invertir el eje Y (`1.0 - ny`) para coincidir con el sistema de coordenadas de AutoCAD.

## Frontend (React)
- Usa React Hooks y componentes funcionales.
- Las llamadas a la API de Supabase usan el cliente oficial `@supabase/supabase-js`.
- El manejo del estado del "canvas" de dibujo debe mantener siempre los círculos normalizados entre `0` y `1` antes de enviarlos por POST a FastAPI.
- El archivo de configuración de Vercel debe estar en `frontend/vercel.json` con los `rewrites` a `/index.html` para la SPA.

## Supabase
- Las inserciones van a la tabla `inspections`.
- Los datos variables como el formulario o los trazos del canvas se guardan en JSONB (`form_data`, `bar_status`, `picked_circles`).

# Reglas Operativas
1. Revisa `/docs/ai/architecture.md` antes de proponer cambios en el flujo de datos entre el Canvas y DXF.
2. Piensa paso a paso: detalla tu lógica matemática antes de modificar coordenadas en `dxf_engine.py`.
3. ESTRICTA POLÍTICA DE DIRECTORIOS: Prohibido crear carpetas redundantes (ej. `frontend-v2`). Utiliza la estructura existente (`frontend/` y `backend/`).
4. Haz `grep` para buscar métodos conflictivos (como `.length` sin proteger) antes de dar por bueno un componente.