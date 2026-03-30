# Contexto del Proyecto: StructCAD Pro v2
Aplicación para la generación de planos técnicos de inspección estructural.
- **Frontend**: React 19 + Vite (en `/frontend`).
- **Backend**: FastAPI + Pydantic + ezdxf (en `/backend`).
- **Base de Datos**: Supabase (PostgreSQL).

# Comandos Críticos
- Backend Dev: `cd backend && uvicorn main:app --reload`
- Frontend Dev: `cd frontend && npm run dev`
- Frontend Build: `cd frontend && npm run build` (El backend sirve esta build estática desde `/frontend/dist`).

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

## Supabase
- Las inserciones van a la tabla `inspections`.
- Los datos variables como el formulario o los trazos del canvas se guardan en las columnas JSONB (`form_data`, `bar_status`, `picked_circles`).

# Reglas Operativas
1. Revisa `/docs/ai/architecture.md` antes de proponer cambios en el flujo de datos entre el Canvas y el motor DXF.
2. Piensa paso a paso: detalla tu lógica matemática antes de modificar coordenadas en `dxf_engine.py`.
3. DOCUMENTACIÓN CONTINUA: Cualquier cambio que afecte a la arquitectura, dependencias, flujo de datos o despliegue DEBE reflejarse inmediatamente en `README.md` y en `docs/ai/architecture.md`.
4. ESTRICTA POLÍTICA DE DIRECTORIOS: Prohibido crear carpetas redundantes (ej. nada de `frontend-v2` o `backend_new`). Utiliza la estructura existente (`frontend/` y `backend/`). Solo puedes crear nuevos archivos/componentes si es estrictamente necesario para la organización interna.