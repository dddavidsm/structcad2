# StructCAD Pro — Guía de Instalación Completa

## Estructura de carpetas

```
EE/
│
├── backend/
│   ├── main.py              ← API FastAPI + sirve el frontend
│   ├── dxf_engine.py        ← Motor de generación DXF
│   └── requirements.txt     ← Dependencias Python
│
├── frontend/
│   ├── index.html           ← Shell HTML (sin JS inline)
│   ├── css/
│   │   └── styles.css       ← Estilos completos
│   └── js/
│       ├── state.js         ← Estado global + definiciones de estructuras
│       ├── canvasEngine.js  ← Motor de dibujo 2D
│       ├── api.js           ← Llamadas al backend (DXF, CSV)
│       └── main.js          ← Controladores de UI y eventos DOM
│
├── start.bat                ← Arrancar el servidor (doble clic)
└── README.md                ← Este archivo
```

---

## Arranque rápido

**Doble clic en `start.bat`** y abrir en el navegador:  
👉 **http://localhost:8000**

---

## Requisitos previos

- **Python 3.9 o superior**
  Verificar con: `python --version`
- **pip** (viene incluido con Python)

No se necesita Node.js, npm, ni ningún sistema de build.

---

## Instalación manual (primera vez)

---

## Instalación paso a paso

### 1. Descargar / clonar el proyecto

Si tienes Git:
```bash
git clone <url-del-repo> structcad2
cd structcad2
```

Si lo tienes como ZIP:
```bash
# Descomprimir y entrar en la carpeta
unzip structcad2.zip
cd structcad2
```

---

### 2. Crear entorno virtual Python (recomendado)

**En macOS / Linux:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
```

**En Windows (CMD):**
```cmd
cd backend
python -m venv venv
venv\Scripts\activate.bat
```

**En Windows (PowerShell):**
```powershell
cd backend
python -m venv venv
venv\Scripts\Activate.ps1
```

Sabrás que el entorno está activo porque el prompt mostrará `(venv)` al inicio.

---

### 3. Instalar dependencias

Con el entorno virtual activo y estando en la carpeta `backend/`:
```bash
pip install -r requirements.txt
```

El archivo `requirements.txt` contiene:
```
fastapi==0.111.0
uvicorn[standard]==0.29.0
pydantic==2.7.1
python-multipart==0.0.9
```

Verificar que se instaló correctamente:
```bash
pip list | grep -E "fastapi|uvicorn|pydantic"
```

---

### 4. Iniciar el backend

Desde la carpeta `backend/` con el entorno virtual activo:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Deberías ver algo así:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

El flag `--reload` hace que el servidor se reinicie automáticamente
cuando modificas el código. Quitarlo en producción.

---

### 5. Abrir el frontend

**Opción A — Abrir directamente en el navegador (más simple):**

En macOS:
```bash
open frontend/index.html
```

En Linux:
```bash
xdg-open frontend/index.html
```

En Windows (desde el Explorador):
Doble clic en `frontend/index.html`

O arrastra el archivo al navegador.

---

**Opción B — Servir con Python (recomendado para evitar problemas CORS):**

Abre una segunda terminal (sin cerrar el backend), ve a la carpeta del proyecto:
```bash
cd frontend
python3 -m http.server 3000
```

Luego abre en el navegador:
```
http://localhost:3000
```

---

### 6. Verificar que todo funciona

1. Abre el frontend en el navegador
2. Ve a **Configuración** (menú lateral)
3. La URL de la API debe ser `http://localhost:8000`
4. Pulsa **"Verificar conexión"**
5. Debe aparecer un punto verde con el texto **"Conectado — backend activo"**

Si hay error, revisa que el backend esté corriendo (paso 4).

---

## Uso básico

1. Ir a **Nueva Inspección**
2. Seleccionar el tipo de estructura (pilar, viga, forjado, zapata o escalera)
3. Rellenar las pestañas: **Geometría → Armadura → Inspección → Obra**
4. En el canvas derecho, **pintar la zona picada** con el pincel naranja
5. **Marcar las barras encontradas** con la herramienta "Marcar Barra"
6. Pulsar **"Generar DXF"** → se descarga el archivo `.dxf`

---

## Endpoints disponibles

Una vez el backend está activo, puedes consultar la documentación
interactiva en:

```
http://localhost:8000/docs
```

| Método | Ruta                    | Estructura          |
|--------|-------------------------|---------------------|
| GET    | /                       | Health check        |
| POST   | /generate/pillar-rect   | Pilar rectangular   |
| POST   | /generate/pillar-circ   | Pilar circular      |
| POST   | /generate/beam          | Viga                |
| POST   | /generate/footing       | Zapata aislada      |
| POST   | /generate/forjado       | Forjado / Losa      |
| POST   | /generate/stair         | Escalera / Zanca    |

---

## Solución de problemas frecuentes

### "No module named 'fastapi'"
El entorno virtual no está activo. Ejecutar:
```bash
# macOS/Linux
source backend/venv/bin/activate

# Windows CMD
backend\venv\Scripts\activate.bat
```

### "Address already in use" (puerto 8000 ocupado)
Cambiar el puerto:
```bash
uvicorn main:app --reload --port 8001
```
Y actualizar la URL en la app: `http://localhost:8001`

### El frontend dice "No disponible" aunque el backend corre
Puede ser un problema de CORS si abres el HTML como `file://`.
Usa la Opción B (servir con `python3 -m http.server 3000`).

### El DXF no se abre en AutoCAD
El formato generado es DXF R12, compatible con AutoCAD 2000 y superior.
Si tienes problemas, prueba abrirlo con **LibreCAD** (gratuito) primero
para verificar que el archivo es correcto.

---

## Comandos de referencia rápida

```bash
# Activar entorno (cada vez que abras una terminal nueva)
source backend/venv/bin/activate          # macOS/Linux
backend\venv\Scripts\activate.bat         # Windows

# Iniciar backend
cd backend && uvicorn main:app --reload

# Iniciar frontend (segunda terminal)
cd frontend && python3 -m http.server 3000

# Desactivar entorno cuando termines
deactivate
```

---

## Estructura de los archivos en detalle

### `backend/main.py`
Define la API con FastAPI. Contiene los modelos de datos (Pydantic)
para cada tipo de estructura y los endpoints que reciben el formulario
y devuelven el archivo DXF como descarga binaria.

### `backend/dxf_engine.py`
El motor de generación. Contiene:
- Funciones primitivas: `_line`, `_circle`, `_rect`, `_text`, `_dim_horizontal`, etc.
- Una función generadora por cada tipo de estructura
- Sistema de capas: SECCION, ZONA_PICADA, ARMADURA_LONG, ESTRIBOS, COTAS, TEXTO, CAJETIN

### `frontend/index.html`
Aplicación web completa en un único archivo. Incluye:
- HTML estructural con sidebar + topbar + páginas
- CSS corporativo con variables
- JavaScript con toda la lógica (canvas editor, formularios adaptativos,
  llamadas a la API, historial local)
