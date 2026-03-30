# Arquitectura del Sistema StructCAD Pro

## 1. Flujo de Datos Principal
1. El usuario introduce datos geométricos y pinta patologías en un componente Canvas (React).
2. El Frontend empaqueta las cotas y normaliza las coordenadas pintadas a escala `0.0 - 1.0`.
3. Se hace un POST a los endpoints de FastAPI (`/generate/pillar-rect`, `/generate/beam`, etc.).
4. El backend valida los tipos con Pydantic.
5. El motor DXF genera un archivo binario `.dxf` en memoria usando `io.BytesIO`.
6. FastAPI devuelve un `StreamingResponse` para que el navegador lo descargue.
7. Opcionalmente, los datos (`picked_circles`, `form_data`) se guardan en la tabla `inspections` de Supabase para historial.

## 2. Lógica del Motor DXF (`dxf_engine.py`)
El motor no es un simple traductor, contiene lógica de dibujo algorítmico:
- **Primitivas personalizadas**: Usa funciones internas (`_L`, `_C`, `_rect`, `_dim_h`, `_dim_v`) para estandarizar capas y grosores de línea (`_lw`).
- **Bordes Ondulados**: La zona de inspección "picada" se dibuja utilizando una función matemática de senos superpuestos (`_wavy_pts`) para simular roturas realistas en el hormigón.
- **Rellenos (Hatches)**: 
  - El fondo intacto usa un gris sólido (252).
  - La zona repicada aplica una máscara blanca y encima una trama cuadriculada (ANSI32, NET o ANSI31).

## 3. Integración Canvas -> DXF (Mapeo de Coordenadas)

### FASE 2: Geometría de Estribos en Alzado
- El formulario de armaduras incluye el campo `stirrup_spacing` (Separación de estribos en cm).
- Este valor se transmite desde el frontend al backend y controla la repetición de estribos en las vistas Frontal y Lateral, tanto en el canvas como en el DXF.
- En el canvas, los estribos se dibujan como líneas horizontales separadas por `stirrup_spacing` (escalado a píxeles).
- En el backend, los estribos se generan en bucle en las vistas Frontal y Lateral, respetando la separación indicada.
Esta es la regla de oro al modificar el código:
El Canvas HTML tiene el origen de coordenadas `(0,0)` en la esquina **superior izquierda**.
El sistema DXF tiene el origen `(0,0)` en la esquina **inferior izquierda** (típicamente).
Por lo tanto, en la función `_fill_picado_circles` del backend, la coordenada `ny` enviada por el frontend **siempre debe invertirse**: `cy = py + (1.0 - ny) * struct_h`.