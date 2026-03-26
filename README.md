# StructCAD Pro v2.2

Aplicación web de inspección estructural que genera planos técnicos en formato DXF.
Permite documentar pilares, vigas, forjados, zapatas y escaleras marcando zonas picadas,
estado de la armadura y fisuras directamente en el canvas.

---

## Estructura del proyecto

```
structcad2/
├── backend/
│   ├── main.py            ← API FastAPI (endpoints DXF + sirve el frontend)
│   ├── dxf_engine.py      ← Motor de generación DXF (ezdxf)
│   └── requirements.txt   ← Dependencias Python
│
├── frontend/        ← SPA en React 18 + Vite
│   ├── src/
│   │   ├── App.jsx
│   │   ├── context/       ← Estado global (useReducer)
│   │   ├── components/    ← Canvas, Forms, History, Layout
│   │   ├── config/        ← Definición de estructuras
│   │   └── lib/           ← Cliente Supabase + exportDXF
│   ├── .env.example       ← Variables de entorno de ejemplo
│   ├── package.json
│   └── vite.config.js
│
├── supabase_schema.sql    ← Schema SQL para crear la tabla en Supabase
├── start.bat              ← Arranque rápido en Windows
└── README.md
```

---

## Arranque rápido (Windows)

**Doble clic en `start.bat`** — compila el frontend React si hace falta y arranca el servidor:

```
http://localhost:8000
```

---

## Instalación manual

### Requisitos

| Herramienta | Versión mínima | Para qué |
|-------------|----------------|----------|
| Python      | 3.9+           | Backend API + generación DXF |
| Node.js     | 18+            | Compilar el frontend React |
| npm         | 9+             | Gestión de paquetes JS |

---

### 1. Clonar el repositorio

```bash
git clone https://github.com/dddavidsm/structcad2.git
cd structcad2
```

---

### 2. Backend Python

```bash
cd backend

# Crear y activar entorno virtual
python -m venv venv

# Windows
venv\Scripts\activate.bat

# macOS / Linux
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt
```

---

### 3. Frontend React

```bash
cd frontend
npm install
npm run build        # genera frontend/dist/
```

El backend sirve automáticamente la carpeta `dist/` generada.

---

### 4. Iniciar el servidor

```bash
cd backend
uvicorn main:app --host 127.0.0.1 --port 8000
```

Abrir en el navegador: **http://localhost:8000**

---

## Desarrollo frontend (modo hot-reload)

Mientras el backend corre en `:8000`, abre una segunda terminal:

```bash
cd frontend
npm run dev          # → http://localhost:5173
```

El archivo `vite.config.js` ya tiene el proxy configurado para redirigir
las llamadas `/generate/*` y `/api/*` al backend en `:8000`.

---

## Configurar Supabase (historial de inspecciones)

Supabase guarda el historial de inspecciones en la nube.
Sin Supabase la app funciona igualmente, pero el historial no persiste.

### Pasos

1. Crear un proyecto en [supabase.com](https://supabase.com)
2. Ir a **SQL Editor → New Query**, pegar y ejecutar el contenido de `supabase_schema.sql`
3. Copiar el archivo de entorno:
   ```bash
   cp frontend/.env.example frontend/.env.local
   ```
4. Rellenar las variables en `.env.local`:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...
   ```
5. Reconstruir el frontend:
   ```bash
   cd frontend && npm run build
   ```

---

## Endpoints API

| Método | Ruta                    | Descripción         |
|--------|-------------------------|---------------------|
| GET    | `/api/health`           | Estado del servidor |
| POST   | `/generate/pillar-rect` | Pilar rectangular   |
| POST   | `/generate/pillar-circ` | Pilar circular      |
| POST   | `/generate/beam`        | Viga                |
| POST   | `/generate/footing`     | Zapata aislada      |
| POST   | `/generate/forjado`     | Forjado / Losa      |
| POST   | `/generate/stair`       | Escalera / Zanca    |

Documentación interactiva (Swagger): **http://localhost:8000/docs**

---

## Flujo de uso

1. Seleccionar tipo de estructura (Pilar Rect., Pilar Circ., Viga, Forjado, Zapata, Escalera)
2. Rellenar las pestañas: **Geometría → Armadura → Inspección → Obra**
3. En el canvas, **pintar con la brocha naranja** las zonas picadas/inspeccionadas
4. Marcar el estado de cada barra (encontrada / no encontrada / oxidada) haciendo clic
5. Añadir fisuras o anotaciones de texto si es necesario
6. Pulsar **Generar DXF** — se descarga el plano `.dxf`
   - La zona blanca con trama en el DXF corresponde exactamente a lo pintado con la brocha

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---------|---------------|----------|
| `No module named 'fastapi'` | Entorno virtual no activo | `venv\Scripts\activate.bat` |
| Puerto 8000 ocupado | Otro proceso | `uvicorn main:app --port 8001` |
| Canvas en blanco | Estructura no seleccionada | Seleccionar estructura primero |
| DXF no abre en AutoCAD | Formato R2000 | Abrir con LibreCAD para verificar |
| Historial vacío | Supabase no configurado | Ver sección "Configurar Supabase" |
