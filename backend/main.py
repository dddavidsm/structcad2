"""StructCAD Pro v2 — FastAPI backend con motor DXF validado"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from pathlib import Path
import io

# Sirve la build React (npm run build) desde frontend/dist/
FRONTEND_DIR = Path(__file__).parent.parent / "frontend" / "dist"

from dxf_engine import (
    generate_dxf_pillar_rect, generate_dxf_pillar_circ,
    generate_dxf_beam, generate_dxf_footing,
    generate_dxf_forjado, generate_dxf_stair
)

app = FastAPI(title="StructCAD Pro API", version="2.1.0")

# CORS: permite peticiones desde el frontend (Vercel proxy o desarrollo local).
# Con allow_origins=["*"] NO se puede usar allow_credentials=True.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
    expose_headers=["Content-Disposition"],
)

class InspectionBase(BaseModel):
    element_id: Optional[str] = "E-01"
    planta: Optional[str] = None
    eje: Optional[str] = None
    fecha_insp: Optional[str] = None
    obra_nombre: Optional[str] = None
    tecnico: Optional[str] = None
    rebar_found: Optional[str] = "Sí"
    cover_measured: Optional[float] = None
    corrosion: Optional[str] = "Sin patologías"
    notes: Optional[str] = None
    anomalies: Optional[str] = None
    canvas_data: Optional[str] = None
    markers: Optional[List[Any]] = []
    # Circulos normalizados [0,1] de las zonas pintadas con la brocha en el canvas
    # Cada elemento: {nx: float, ny: float, nr: float}
    picked_circles: Optional[List[Any]] = []

class PillarRectData(InspectionBase):
    width: float = Field(..., gt=0)
    depth: float = Field(..., gt=0)
    bars_front_count: int = Field(..., ge=2, le=16)
    bars_front_diam: float = Field(..., gt=0)
    cover_front: float = Field(..., gt=0)
    bars_lateral_count: int = Field(..., ge=0, le=14)  # 0 = solo barras de esquina
    bars_lateral_diam: float = Field(..., gt=0)
    cover_lateral: float = Field(..., gt=0)
    cover_stirrup: Optional[float] = None   # Recubrimiento hasta el estribo (nominal)
    stirrup_diam: float = Field(..., gt=0)
    stirrup_spacing: Optional[float] = 15
    inspection_height: float = Field(..., gt=0)

class PillarCircData(InspectionBase):
    diameter: float = Field(..., gt=0)
    bars_count: int = Field(..., ge=4, le=16)
    bars_diam: float = Field(..., gt=0)
    cover: float = Field(..., gt=0)
    stirrup_diam: float = Field(..., gt=0)
    stirrup_spacing: Optional[float] = 10
    inspection_height: float = Field(..., gt=0)

class BeamData(InspectionBase):
    width: float = Field(..., gt=0)
    height: float = Field(..., gt=0)
    span: Optional[float] = 600
    bars_bottom_count: int = Field(..., ge=2, le=10)
    bars_bottom_diam: float = Field(..., gt=0)
    bars_top_count: int = Field(..., ge=2, le=6)
    bars_top_diam: float = Field(..., gt=0)
    cover: float = Field(..., gt=0)
    stirrup_diam: float = Field(..., gt=0)
    stirrup_spacing: float = Field(..., gt=0)
    inspection_length: Optional[float] = 25

class FootingData(InspectionBase):
    length: float = Field(..., gt=0)
    width: float = Field(..., gt=0)
    height: float = Field(..., gt=0)
    pedestal_w: Optional[float] = 40
    pedestal_d: Optional[float] = 40
    bars_x_count: int = Field(..., ge=2, le=20)
    bars_x_diam: float = Field(..., gt=0)
    bars_y_count: int = Field(..., ge=2, le=20)
    bars_y_diam: float = Field(..., gt=0)
    cover_bottom: float = Field(..., gt=0)
    cover_sides: float = Field(..., gt=0)

class ForjadoData(InspectionBase):
    thickness: float = Field(..., gt=0)
    span_x: Optional[float] = 500
    span_y: Optional[float] = 400
    forjado_type: Optional[str] = "Losa maciza"
    bars_x_count: int = Field(..., ge=2)
    bars_x_diam: float = Field(..., gt=0)
    bars_x_spacing: float = Field(..., gt=0)
    bars_y_count: int = Field(..., ge=2)
    bars_y_diam: float = Field(..., gt=0)
    bars_y_spacing: float = Field(..., gt=0)
    cover_bottom: float = Field(..., gt=0)
    cover_top: float = Field(..., gt=0)
    inspection_area: Optional[float] = 400

class StairData(InspectionBase):
    stair_width: float = Field(..., gt=0)
    riser: float = Field(..., gt=0)
    tread: float = Field(..., gt=0)
    slab_thickness: float = Field(..., gt=0)
    wall_thickness: Optional[float] = 6.5
    steps_count: int = Field(..., ge=2, le=25)
    bars_long_diam: float = Field(..., gt=0)
    bars_long_sep: float = Field(..., gt=0)
    bars_trans_diam: float = Field(..., gt=0)
    bars_trans_sep: float = Field(..., gt=0)
    cover: float = Field(..., gt=0)
    relleno_type: Optional[str] = "Mortero/Cascote"
    depth_no_rebar: Optional[float] = None

def _stream(buf: io.BytesIO, filename: str) -> Response:
    buf.seek(0)
    content = buf.read()
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.1.0"}

@app.post("/api/generate/pillar-rect")
def gen_pilar_rect(data: PillarRectData):
    try: return _stream(generate_dxf_pillar_rect(data), f"pilar_rect_{data.element_id}.dxf")
    except Exception as e: raise HTTPException(500, str(e))

@app.post("/api/generate/pillar-circ")
def gen_pilar_circ(data: PillarCircData):
    try: return _stream(generate_dxf_pillar_circ(data), f"pilar_circ_{data.element_id}.dxf")
    except Exception as e: raise HTTPException(500, str(e))

@app.post("/api/generate/beam")
def gen_beam(data: BeamData):
    try: return _stream(generate_dxf_beam(data), f"viga_{data.element_id}.dxf")
    except Exception as e: raise HTTPException(500, str(e))

@app.post("/api/generate/footing")
def gen_footing(data: FootingData):
    try: return _stream(generate_dxf_footing(data), f"zapata_{data.element_id}.dxf")
    except Exception as e: raise HTTPException(500, str(e))

@app.post("/api/generate/forjado")
def gen_forjado(data: ForjadoData):
    try: return _stream(generate_dxf_forjado(data), f"forjado_{data.element_id}.dxf")
    except Exception as e: raise HTTPException(500, str(e))

@app.post("/api/generate/stair")
def gen_stair(data: StairData):
    try: return _stream(generate_dxf_stair(data), f"escalera_{data.element_id}.dxf")
    except Exception as e: raise HTTPException(500, str(e))

# ── Serve the frontend SPA (MUST be last — catches everything not matched above)
# html=True means index.html is served for "/" and any unmatched path
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")