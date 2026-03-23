"""
dxf_engine_v2.py — Motor DXF completamente reescrito
====================================================
Genera DXF R2000 (AC1015) — formato estable y compatible con
AutoCAD 2000+, LibreCAD, DraftSight, BricsCAD y visores online.

Arquitectura:
  - Clase DXFDoc: acumula entidades y serializa el documento completo
  - Entidades soportadas: LINE, CIRCLE, ARC, LWPOLYLINE, TEXT, MTEXT
  - Capas con color y tipo de línea
  - Acotado lineal manual (líneas de extensión + línea de cota + texto)
  - Zona picada como LWPOLYLINE cerrada (polígono irregular)
  - Barras en sección: CIRCLE (solo contorno, sin SOLID)
  - Barras en alzado: LINE gruesa (lw=50 = 0.50mm)
"""

import io
import math
from typing import List, Tuple, Optional

# ─── CAPAS ESTÁNDAR ──────────────────────────────────────────────────────────
LAYERS = {
    "SECCION":      {"color": 7,   "lw": 50,  "lt": "CONTINUOUS"},  # blanco/negro
    "ZONA_PICADA":  {"color": 30,  "lw": 25,  "lt": "CONTINUOUS"},  # naranja
    "ARMADURA_LONG":{"color": 5,   "lw": 70,  "lt": "CONTINUOUS"},  # azul, 0.70mm
    "ESTRIBOS":     {"color": 3,   "lw": 35,  "lt": "CONTINUOUS"},  # verde, 0.35mm
    "COTAS":        {"color": 2,   "lw": 13,  "lt": "CONTINUOUS"},  # amarillo, 0.13mm
    "TEXTO":        {"color": 7,   "lw": 13,  "lt": "CONTINUOUS"},
    "CAJETIN":      {"color": 8,   "lw": 18,  "lt": "CONTINUOUS"},
    "ZONA_FILL":    {"color": 30,  "lw": 0,   "lt": "CONTINUOUS"},  # relleno zona
}

# ─── DXF DOCUMENT CLASS ───────────────────────────────────────────────────────
class DXFDoc:
    def __init__(self):
        self._entities: List[str] = []

    # ── Primitivos ──────────────────────────────────────────────────────────
    def line(self, x1, y1, x2, y2, layer="SECCION", lw=None):
        lw_code = f" 370\n{lw}\n" if lw is not None else ""
        self._entities.append(
            f"  0\nLINE\n  5\n{self._handle()}\n"
            f"100\nAcDbEntity\n  8\n{layer}\n{lw_code}"
            f"100\nAcDbLine\n"
            f" 10\n{x1:.6f}\n 20\n{y1:.6f}\n 30\n0.0\n"
            f" 11\n{x2:.6f}\n 21\n{y2:.6f}\n 31\n0.0\n"
        )

    def circle(self, cx, cy, r, layer="SECCION", lw=None):
        lw_code = f" 370\n{lw}\n" if lw is not None else ""
        self._entities.append(
            f"  0\nCIRCLE\n  5\n{self._handle()}\n"
            f"100\nAcDbEntity\n  8\n{layer}\n{lw_code}"
            f"100\nAcDbCircle\n"
            f" 10\n{cx:.6f}\n 20\n{cy:.6f}\n 30\n0.0\n"
            f" 40\n{r:.6f}\n"
        )

    def arc(self, cx, cy, r, start_angle, end_angle, layer="SECCION"):
        self._entities.append(
            f"  0\nARC\n  5\n{self._handle()}\n"
            f"100\nAcDbEntity\n  8\n{layer}\n"
            f"100\nAcDbCircle\n"
            f" 10\n{cx:.6f}\n 20\n{cy:.6f}\n 30\n0.0\n"
            f" 40\n{r:.6f}\n"
            f"100\nAcDbArc\n"
            f" 50\n{start_angle:.6f}\n 51\n{end_angle:.6f}\n"
        )

    def lwpolyline(self, pts: List[Tuple[float,float]], layer="SECCION",
                   closed=False, lw=None, const_width=0.0):
        """LWPOLYLINE — muy eficiente para polígonos y perfiles"""
        flags = 1 if closed else 0
        lw_code = f" 370\n{lw}\n" if lw is not None else ""
        e = (f"  0\nLWPOLYLINE\n  5\n{self._handle()}\n"
             f"100\nAcDbEntity\n  8\n{layer}\n{lw_code}"
             f"100\nAcDbPolyline\n"
             f" 90\n{len(pts)}\n 70\n{flags}\n 43\n{const_width:.4f}\n")
        for x, y in pts:
            e += f" 10\n{x:.6f}\n 20\n{y:.6f}\n"
        self._entities.append(e)

    def filled_circle(self, cx, cy, r, layer="ARMADURA_LONG"):
        """
        Círculo relleno usando HATCH (solo R2000+).
        Dibuja un círculo negro sólido — representa barra en sección.
        """
        # Seed point + boundary loop with circle
        e = (f"  0\nHATCH\n  5\n{self._handle()}\n"
             f"100\nAcDbEntity\n  8\n{layer}\n"
             f"100\nAcDbHatch\n"
             f" 10\n{cx:.6f}\n 20\n{cy:.6f}\n 30\n0.0\n"
             f"210\n0.0\n220\n0.0\n230\n1.0\n"  # normal
             f"  2\nSOLID\n 70\n1\n 71\n0\n"  # SOLID pattern, associative=0
             f" 91\n1\n"  # 1 loop
             f" 92\n3\n"  # boundary type = external + derived
             f" 93\n1\n"  # 1 edge in loop
             f" 72\n3\n"  # edge type = circle arc
             f" 10\n{cx:.6f}\n 20\n{cy:.6f}\n"  # center
             f" 40\n{r:.6f}\n"  # radius
             f" 50\n0.0\n 51\n360.0\n 73\n1\n"  # angles, CCW
             f" 97\n0\n"  # 0 source boundaries
             f" 75\n1\n 76\n1\n"  # hatch style=normal, pattern type=predefined
             f" 98\n1\n 10\n{cx:.6f}\n 20\n{cy:.6f}\n"  # seed point
        )
        self._entities.append(e)
        # Add circle outline on top
        self.circle(cx, cy, r, layer, lw=25)

    def text(self, x, y, height, content, layer="TEXTO", h_align=1, angle=0.0):
        """
        h_align: 0=left, 1=center, 2=right, 4=middle_center
        """
        just = 0 if h_align == 0 else (1 if h_align == 1 else 2)
        e = (f"  0\nTEXT\n  5\n{self._handle()}\n"
             f"100\nAcDbEntity\n  8\n{layer}\n"
             f"100\nAcDbText\n"
             f" 10\n{x:.6f}\n 20\n{y:.6f}\n 30\n0.0\n"
             f" 40\n{height:.4f}\n"
             f"  1\n{content}\n"
             f" 50\n{angle:.4f}\n"
             f"  7\nSTANDARD\n"
        )
        if h_align != 0:
            e += f" 72\n{just}\n 11\n{x:.6f}\n 21\n{y:.6f}\n 31\n0.0\n"
        e += "100\nAcDbText\n"
        self._entities.append(e)

    # ── Compuestos ───────────────────────────────────────────────────────────
    def rect(self, x, y, w, h, layer="SECCION", lw=None):
        pts = [(x,y),(x+w,y),(x+w,y+h),(x,y+h)]
        self.lwpolyline(pts, layer=layer, closed=True, lw=lw)

    def bar_section(self, cx, cy, r, layer="ARMADURA_LONG"):
        """Barra longitudinal en sección: círculo relleno"""
        self.filled_circle(cx, cy, r, layer)

    def bar_elevation(self, x, y_bot, y_top, diam_mm, layer="ARMADURA_LONG"):
        """Barra longitudinal en alzado: línea gruesa proporcional al diámetro"""
        # Grosor de línea en DXF: diam_mm * 10 (unidades 1/100mm), clamp
        lw = max(25, min(200, int(diam_mm * 8)))
        self.line(x, y_bot, x, y_top, layer=layer, lw=lw)

    def stirrup_elevation(self, x1, y, x2, layer="ESTRIBOS"):
        """Estribo en alzado: línea horizontal"""
        self.line(x1, y, x2, y, layer=layer, lw=35)

    def stirrup_rect(self, x, y, w, h, r_corner, layer="ESTRIBOS"):
        """Estribo rectangular con esquinas redondeadas (arcos + líneas)"""
        rc = r_corner
        # Lados rectos
        self.line(x+rc, y,   x+w-rc, y,   layer)
        self.line(x+w,  y+rc, x+w, y+h-rc, layer)
        self.line(x+w-rc, y+h, x+rc, y+h,  layer)
        self.line(x,  y+h-rc, x, y+rc,     layer)
        # Esquinas
        self.arc(x+rc,   y+rc,   rc, 180, 270, layer)
        self.arc(x+w-rc, y+rc,   rc, 270, 360, layer)
        self.arc(x+w-rc, y+h-rc, rc,   0,  90, layer)
        self.arc(x+rc,   y+h-rc, rc,  90, 180, layer)

    def dim_h(self, x1, x2, y_ref, y_base, label, layer="COTAS", h=2.2):
        """Cota horizontal: líneas de extensión + línea de cota + texto"""
        # Líneas de extensión
        self.line(x1, y_base, x1, y_ref, layer)
        self.line(x2, y_base, x2, y_ref, layer)
        # Línea de cota
        self.line(x1, y_ref, x2, y_ref, layer)
        # Flechas (triángulos pequeños)
        a = 1.2
        self.line(x1, y_ref, x1+a*2, y_ref+a*0.7, layer)
        self.line(x1, y_ref, x1+a*2, y_ref-a*0.7, layer)
        self.line(x2, y_ref, x2-a*2, y_ref+a*0.7, layer)
        self.line(x2, y_ref, x2-a*2, y_ref-a*0.7, layer)
        # Texto centrado
        mx = (x1+x2)/2
        self.text(mx, y_ref+h*0.6, h, str(label), layer, h_align=1)

    def dim_v(self, y1, y2, x_ref, x_base, label, layer="COTAS", h=2.2):
        """Cota vertical"""
        self.line(x_base, y1, x_ref, y1, layer)
        self.line(x_base, y2, x_ref, y2, layer)
        self.line(x_ref, y1, x_ref, y2, layer)
        a = 1.2
        self.line(x_ref, y1, x_ref+a*0.7, y1+a*2, layer)
        self.line(x_ref, y1, x_ref-a*0.7, y1+a*2, layer)
        self.line(x_ref, y2, x_ref+a*0.7, y2-a*2, layer)
        self.line(x_ref, y2, x_ref-a*0.7, y2-a*2, layer)
        my = (y1+y2)/2
        self.text(x_ref+h*0.6, my, h, str(label), layer, h_align=0, angle=90.0)

    def label_arrow(self, x_tip, y_tip, x_text, y_text, lines, layer="TEXTO", h=2.5):
        """Flecha de anotación con texto multilínea"""
        # Línea guía
        self.line(x_tip, y_tip, x_text, y_text, layer)
        # Cabeza de flecha
        dx = x_text - x_tip; dy = y_text - y_tip
        lng = math.sqrt(dx*dx + dy*dy) or 1
        ux = dx/lng; uy = dy/lng; px = -uy; py = ux
        a = 1.5
        self.line(x_tip, y_tip, x_tip+ux*a*2+px*a*0.6, y_tip+uy*a*2+py*a*0.6, layer)
        self.line(x_tip, y_tip, x_tip+ux*a*2-px*a*0.6, y_tip+uy*a*2-py*a*0.6, layer)
        # Texto
        for i, l in enumerate(lines):
            self.text(x_text, y_text + i*h*1.4, h, l, layer, h_align=0)

    def title(self, x, y, txt, layer="TEXTO", h=3.5):
        self.text(x, y, h, txt, layer, h_align=1)
        self.line(x - len(txt)*h*0.35, y-1, x + len(txt)*h*0.35, y-1, layer)

    def cajetin(self, x, y, data: dict, w=90, h=22):
        """Cuadro de título con datos de la inspección"""
        self.rect(x, y, w, h, "CAJETIN")
        self.line(x, y+h*0.6, x+w, y+h*0.6, "CAJETIN")
        self.line(x+w*0.45, y, x+w*0.45, y+h*0.6, "CAJETIN")
        self.text(x+w/2, y+h*0.8, 3.2, data.get("empresa","StructCAD Pro"), "CAJETIN", 1)
        self.text(x+3, y+h*0.35, 2.2, f"Obra: {data.get('obra','—')}", "CAJETIN", 0)
        self.text(x+3, y+h*0.18, 1.9, f"Elem: {data.get('ref','—')}  |  Planta: {data.get('planta','—')}  |  Eje: {data.get('eje','—')}", "CAJETIN", 0)
        self.text(x+w*0.47, y+h*0.35, 2.2, f"Escala: {data.get('escala','1:20')}", "CAJETIN", 0)
        self.text(x+w*0.47, y+h*0.18, 1.9, f"Fecha: {data.get('fecha','—')}  |  Técnico: {data.get('tecnico','—')}", "CAJETIN", 0)
        # Nota inspección
        notes = data.get("notes","")
        if notes:
            self.text(x+3, y-4, 1.9, f"Obs: {notes[:80]}", "CAJETIN", 0)

    def zona_picada_boundary(self, pts: List[Tuple[float,float]],
                              layer="ZONA_PICADA"):
        """Borde de zona picada como polilínea abierta con línea discontinua"""
        if len(pts) < 2:
            return
        e = (f"  0\nLWPOLYLINE\n  5\n{self._handle()}\n"
             f"100\nAcDbEntity\n  8\n{layer}\n"
             f" 370\n18\n"  # lw 0.18mm
             f"100\nAcDbPolyline\n"
             f" 90\n{len(pts)}\n 70\n0\n 43\n0.0\n")
        for x, y in pts:
            e += f" 10\n{x:.6f}\n 20\n{y:.6f}\n"
        self._entities.append(e)

    # ── Serialización ────────────────────────────────────────────────────────
    _hc = 100  # handle counter

    def _handle(self):
        self._hc += 1
        return f"{self._hc:X}"

    def serialize(self) -> bytes:
        out = []
        out.append(self._header())
        out.append(self._tables())
        out.append(self._blocks())
        out.append("  0\nSECTION\n  2\nENTITIES\n")
        for e in self._entities:
            out.append(e)
        out.append("  0\nENDSEC\n  0\nEOF\n")
        return "".join(out).encode("utf-8")

    def _header(self):
        return (
            "  0\nSECTION\n  2\nHEADER\n"
            "  9\n$ACADVER\n  1\nAC1015\n"
            "  9\n$DWGCODEPAGE\n  3\nANSI_1252\n"
            "  9\n$INSUNITS\n 70\n5\n"
            "  9\n$MEASUREMENT\n 70\n1\n"
            "  9\n$EXTMIN\n 10\n-500.0\n 20\n-500.0\n 30\n0.0\n"
            "  9\n$EXTMAX\n 10\n2000.0\n 20\n2000.0\n 30\n0.0\n"
            "  9\n$LTSCALE\n 40\n1.0\n"
            "  9\n$TEXTSTYLE\n  7\nSTANDARD\n"
            "  0\nENDSEC\n"
        )

    def _tables(self):
        t = "  0\nSECTION\n  2\nTABLES\n"
        # LTYPE table
        t += ("  0\nTABLE\n  2\nLTYPE\n  5\n5\n100\nAcDbSymbolTable\n"
              " 70\n1\n"
              "  0\nLTYPE\n  5\n14\n100\nAcDbSymbolTableRecord\n100\nAcDbLinetypeTableRecord\n"
              "  2\nCONTINUOUS\n 70\n0\n  3\nSolid line\n 72\n65\n 73\n0\n 40\n0.0\n"
              "  0\nENDTABLE\n")
        # STYLE table
        t += ("  0\nTABLE\n  2\nSTYLE\n  5\n3\n100\nAcDbSymbolTable\n 70\n1\n"
              "  0\nSTYLE\n  5\n11\n100\nAcDbSymbolTableRecord\n100\nAcDbTextStyleTableRecord\n"
              "  2\nSTANDARD\n 70\n0\n 40\n0.0\n 41\n1.0\n 50\n0.0\n 71\n0\n  4\ntxt\n  0\nENDTABLE\n")
        # LAYER table
        t += f"  0\nTABLE\n  2\nLAYER\n  5\n2\n100\nAcDbSymbolTable\n 70\n{len(LAYERS)+1}\n"
        t += ("  0\nLAYER\n  5\n10\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n"
              "  2\n0\n 70\n0\n 62\n7\n  6\nCONTINUOUS\n 370\n-3\n")
        handle = 20
        for name, props in LAYERS.items():
            t += (f"  0\nLAYER\n  5\n{handle:X}\n"
                  f"100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n"
                  f"  2\n{name}\n 70\n0\n 62\n{props['color']}\n"
                  f"  6\n{props['lt']}\n 370\n{props['lw']}\n")
            handle += 1
        t += "  0\nENDTABLE\n"
        # VIEW table (empty, required)
        t += "  0\nTABLE\n  2\nVIEW\n  5\n6\n100\nAcDbSymbolTable\n 70\n0\n  0\nENDTABLE\n"
        # UCS, APPID, DIMSTYLE (empty but needed for R2000)
        t += "  0\nTABLE\n  2\nUCS\n  5\n7\n100\nAcDbSymbolTable\n 70\n0\n  0\nENDTABLE\n"
        t += "  0\nTABLE\n  2\nAPPID\n  5\n9\n100\nAcDbSymbolTable\n 70\n0\n  0\nENDTABLE\n"
        t += "  0\nTABLE\n  2\nDIMSTYLE\n  5\nA\n100\nAcDbSymbolTable\n 70\n0\n  0\nENDTABLE\n"
        t += "  0\nTABLE\n  2\nBLOCK_RECORD\n  5\n1\n100\nAcDbSymbolTable\n 70\n2\n"
        t += ("  0\nBLOCK_RECORD\n  5\n1F\n100\nAcDbSymbolTableRecord\n"
              "100\nAcDbBlockTableRecord\n  2\n*MODEL_SPACE\n")
        t += ("  0\nBLOCK_RECORD\n  5\n1B\n100\nAcDbSymbolTableRecord\n"
              "100\nAcDbBlockTableRecord\n  2\n*PAPER_SPACE\n")
        t += "  0\nENDTABLE\n"
        t += "  0\nENDSEC\n"
        return t

    def _blocks(self):
        return (
            "  0\nSECTION\n  2\nBLOCKS\n"
            "  0\nBLOCK\n  5\n1E\n100\nAcDbEntity\n  8\n0\n"
            "100\nAcDbBlockBegin\n  2\n*MODEL_SPACE\n 70\n0\n"
            " 10\n0.0\n 20\n0.0\n 30\n0.0\n  3\n*MODEL_SPACE\n  1\n\n"
            "  0\nENDBLK\n  5\n1F\n100\nAcDbEntity\n  8\n0\n100\nAcDbBlockEnd\n"
            "  0\nBLOCK\n  5\n1A\n100\nAcDbEntity\n  8\n0\n"
            "100\nAcDbBlockBegin\n  2\n*PAPER_SPACE\n 70\n0\n"
            " 10\n0.0\n 20\n0.0\n 30\n0.0\n  3\n*PAPER_SPACE\n  1\n\n"
            "  0\nENDBLK\n  5\n1B\n100\nAcDbEntity\n  8\n0\n100\nAcDbBlockEnd\n"
            "  0\nENDSEC\n"
        )

    def to_buffer(self) -> io.BytesIO:
        buf = io.BytesIO(self.serialize())
        buf.seek(0)
        return buf


# ─── HELPERS GEOMÉTRICOS ──────────────────────────────────────────────────────

def _irregular_border_pts(x0, y0, x1, y1, amplitude=2.0, steps=10):
    """Genera puntos de borde irregular reproducible (seed fija)"""
    import random
    rng = random.Random(hash(f"{x0}{y0}{x1}{y1}") & 0xFFFF)
    pts = []
    for i in range(steps+1):
        t = i / steps
        x = x0 + t*(x1-x0)
        y = y0 + t*(y1-y0)
        if 0 < i < steps:
            y += rng.uniform(-amplitude, amplitude)
        pts.append((x, y))
    return pts

def _notch_pts_symmetric(ox, oy, w, h_notch, notch_w, gap):
    """Puntos para muescas simétricas (dientes de sierra arriba o abajo)"""
    # Devuelve la polilínea exterior del pilar con muescas
    # ox,oy = esquina inf-izq; w = ancho; notch_w = ancho de cada diente
    pts = [
        (ox, oy),
        (ox, oy+h_notch),
        (ox+notch_w, oy+h_notch),
        (ox+notch_w, oy),
        (ox+notch_w+gap, oy),
        (ox+notch_w+gap, oy+h_notch),
        (ox+w, oy+h_notch),
        (ox+w, oy),
    ]
    return pts


# ─── CAJETÍN DATA HELPER ──────────────────────────────────────────────────────

def _cajetin_data(data) -> dict:
    return {
        "empresa": "StructCAD Pro — Inspección Estructural",
        "obra":    getattr(data, 'obra_nombre', '—') or '—',
        "ref":     getattr(data, 'element_id', 'E-01') or 'E-01',
        "planta":  getattr(data, 'planta', '—') or '—',
        "eje":     getattr(data, 'eje', '—') or '—',
        "fecha":   getattr(data, 'fecha_insp', '—') or '—',
        "tecnico": getattr(data, 'tecnico', '—') or '—',
        "escala":  "1:20",
        "notes":   getattr(data, 'notes', '') or '',
    }


# ─── GENERADORES POR ESTRUCTURA ───────────────────────────────────────────────

def generate_dxf_pillar_rect(data) -> io.BytesIO:
    """
    Pilar rectangular — 3 vistas:
      - Sección en planta (arriba, centrada)
      - Vista lateral (abajo izquierda)
      - Vista frontal (abajo derecha)
    """
    W   = float(data.width)
    D   = float(data.depth)
    cf  = float(data.cover_front)
    cl  = float(data.cover_lateral)
    nbf = int(data.bars_front_count)
    nbl = int(data.bars_lateral_count)
    df  = float(data.bars_front_diam)
    dl  = float(data.bars_lateral_diam)
    ds  = float(data.stirrup_diam)
    ih  = float(data.inspection_height)

    # Separaciones entre barras (eje a eje)
    sp_f = (W - 2*cf) / (nbf-1) if nbf > 1 else 0
    sp_l = (D - 2*cl) / (nbl-1) if nbl > 1 else 0

    r_f = df/20   # radio barra (mm→cm, /2 para radio)
    r_l = dl/20

    doc = DXFDoc()

    # ════════════════════════════════════════════════════════════════
    # BLOQUE 1: SECCIÓN EN PLANTA
    # Origen: (0, 0) = esquina inf-izq del pilar
    # ════════════════════════════════════════════════════════════════
    PX, PY = 0.0, 0.0

    # Contorno exterior (hormigón con recubrimiento intacto)
    doc.rect(PX, PY, W, D, "SECCION", lw=70)

    # Zona picada: esquina inferior-izquierda, forma orgánica
    # La zona cubre aprox el cuadrante inf-izq del pilar
    # Borde superior (desde cara izq a ~60% del ancho)
    zp_top_y = D * 0.48
    zp_right_x = W * 0.68
    # Construir polilínea del borde de zona picada
    zp_border = (
        [(PX, PY + zp_top_y)] +
        _irregular_border_pts(PX, PY+zp_top_y, PX+W*0.25, PY+D*0.72, 1.5, 4) +
        _irregular_border_pts(PX+W*0.25, PY+D*0.72, PX+zp_right_x, PY+D*0.88, 1.5, 4) +
        _irregular_border_pts(PX+zp_right_x, PY+D*0.88, PX+zp_right_x, PY+D, 1.0, 3) +
        [(PX+zp_right_x, PY+D), (PX, PY+D), (PX, PY+zp_top_y)]
    )
    doc.zona_picada_boundary(zp_border[:-1], "ZONA_PICADA")  # solo el borde

    # Estribo Ø6 — rectángulo perimetral con esquinas redondeadas
    r_corner = 0.8
    doc.stirrup_rect(PX+cf-ds/10, PY+cl-ds/10,
                     W-2*(cf-ds/10), D-2*(cl-ds/10), r_corner, "ESTRIBOS")

    # 4 barras laterales (cara izquierda) — círculos sobre el estribo
    bx_lat = PX + cl
    for i in range(nbl):
        by = PY + cl + i * sp_l
        doc.bar_section(bx_lat, by, r_l, "ARMADURA_LONG")

    # 5 barras frontales (cara inferior) — círculos sobre el estribo
    by_front = PY + cf
    for i in range(nbf):
        bx = PX + cf + i * sp_f
        doc.bar_section(bx, by_front, r_f, "ARMADURA_LONG")

    # ── Cotas sección en planta ──
    # Cota total horizontal (88 cm)
    doc.dim_h(PX, PX+W, PY-14, PY, str(int(W)), "COTAS")
    # Sub-cotas horizontales
    doc.dim_h(PX, PX+cf, PY-8, PY, str(int(cf)), "COTAS")
    pos = PX+cf
    for i in range(nbf-1):
        doc.dim_h(pos, pos+sp_f, PY-8, PY, f"{sp_f:.0f}", "COTAS")
        pos += sp_f
    doc.dim_h(pos, PX+W, PY-8, PY, str(int(cf)), "COTAS")

    # Cota total vertical (68 cm)
    doc.dim_v(PY, PY+D, PX+W+14, PX+W, str(int(D)), "COTAS")
    # Sub-cotas verticales
    doc.dim_v(PY, PY+cl, PX+W+8, PX+W, str(int(cl)), "COTAS")
    pos = PY+cl
    for i in range(nbl-1):
        doc.dim_v(pos, pos+sp_l, PX+W+8, PX+W, f"{sp_l:.0f}", "COTAS")
        pos += sp_l
    doc.dim_v(pos, PY+D, PX+W+8, PX+W, str(int(cl)), "COTAS")

    # ── Etiquetas con flecha ──
    doc.label_arrow(bx_lat, PY+D-cl, PX+W+35, PY+D,
                    [f"Ø{ds:.0f} mm", f"{nbl} Barres Ø{dl:.0f}mm"],
                    "TEXTO", h=2.5)
    doc.label_arrow(PX+cf+sp_f, by_front, PX+W+35, PY+5,
                    [f"{nbf} Barres Ø{df:.0f}mm", f"Ø{ds:.0f} mm"],
                    "TEXTO", h=2.5)

    # Rótulos ejes
    doc.text(PX-18, PY+D/2, 2.8, "LATERAL", "TEXTO", h_align=1, angle=90)
    doc.text(PX+W/2, PY-26, 2.8, "FRONTAL", "TEXTO", h_align=1)
    doc.title(PX+W/2, PY+D+8, "SECCIO EN PLANTA")

    # ════════════════════════════════════════════════════════════════
    # BLOQUE 2: VISTA LATERAL (cara D)
    # Origen: (LAT_X, LAT_Y)
    # ════════════════════════════════════════════════════════════════
    VIEW_H = ih + 65     # altura total representada del pilar
    NOTCH  = 12          # altura de las muescas
    NW     = D * 0.30    # ancho de cada diente
    GAP    = D - 2*NW

    LAT_X = -15.0
    LAT_Y = -(VIEW_H + 55)

    # Contorno pilar
    doc.rect(LAT_X, LAT_Y, D, VIEW_H, "SECCION", lw=70)

    # Muescas superiores (2 dientes simétricos)
    top_y = LAT_Y + VIEW_H
    doc.lwpolyline(_notch_pts_symmetric(LAT_X, top_y, D, NOTCH, NW, GAP),
                   "SECCION", closed=False, lw=50)
    # Muescas inferiores (invertidas)
    bot_pts = _notch_pts_symmetric(LAT_X, LAT_Y, D, -NOTCH, NW, GAP)
    doc.lwpolyline(bot_pts, "SECCION", closed=False, lw=50)

    # Zona picada: franja horizontal central con bordes irregulares
    mid_y_l = LAT_Y + VIEW_H / 2
    zt_l = mid_y_l + ih/2
    zb_l = mid_y_l - ih/2

    top_border_l = _irregular_border_pts(LAT_X, zt_l, LAT_X+D, zt_l, 1.8, 10)
    bot_border_l = _irregular_border_pts(LAT_X, zb_l, LAT_X+D, zb_l, 1.8, 10)
    doc.zona_picada_boundary(top_border_l, "ZONA_PICADA")
    doc.zona_picada_boundary(bot_border_l, "ZONA_PICADA")
    # Límites laterales de la zona
    doc.line(LAT_X, zb_l, LAT_X, zt_l, "ZONA_PICADA")
    doc.line(LAT_X+D, zb_l, LAT_X+D, zt_l, "ZONA_PICADA")

    # 4 barras Ø20: líneas verticales en zona picada
    for i in range(nbl):
        bx = LAT_X + cl + i * sp_l
        doc.bar_elevation(bx, zb_l-1.5, zt_l+1.5, dl, "ARMADURA_LONG")

    # 2 estribos Ø6 (líneas horizontales)
    doc.stirrup_elevation(LAT_X, zt_l, LAT_X+D, "ESTRIBOS")
    doc.stirrup_elevation(LAT_X, zb_l, LAT_X+D, "ESTRIBOS")

    # Cotas vista lateral
    doc.dim_h(LAT_X, LAT_X+D, LAT_Y-14, LAT_Y, str(int(D)), "COTAS")
    doc.dim_h(LAT_X, LAT_X+cl, LAT_Y-8, LAT_Y, str(int(cl)), "COTAS")
    pos = LAT_X+cl
    for i in range(nbl-1):
        doc.dim_h(pos, pos+sp_l, LAT_Y-8, LAT_Y, f"{sp_l:.0f}", "COTAS")
        pos += sp_l
    doc.dim_h(pos, LAT_X+D, LAT_Y-8, LAT_Y, str(int(cl)), "COTAS")
    doc.dim_v(zb_l, zt_l, LAT_X+D+14, LAT_X+D, str(int(ih)), "COTAS")

    # Etiqueta
    doc.label_arrow(LAT_X, mid_y_l, LAT_X-35, mid_y_l+5,
                    [f"{nbl} Barres Ø{dl:.0f}mm", f"Ø{ds:.0f} mm"],
                    "TEXTO", h=2.5)
    doc.title(LAT_X+D/2, LAT_Y-26, "VISTA LATERAL")

    # ════════════════════════════════════════════════════════════════
    # BLOQUE 3: VISTA FRONTAL (cara W)
    # ════════════════════════════════════════════════════════════════
    FRONT_X = D + 35.0
    FRONT_Y = LAT_Y

    # Contorno
    doc.rect(FRONT_X, FRONT_Y, W, VIEW_H, "SECCION", lw=70)

    # Muescas superiores (asimétricas — 3 dientes)
    FNW  = W * 0.22
    FGAP = W * 0.25
    top_y_f = FRONT_Y + VIEW_H
    doc.lwpolyline([
        (FRONT_X, top_y_f),
        (FRONT_X, top_y_f+NOTCH),
        (FRONT_X+FNW, top_y_f+NOTCH),
        (FRONT_X+FNW, top_y_f),
        (FRONT_X+FNW+FGAP, top_y_f),
        (FRONT_X+FNW+FGAP, top_y_f+NOTCH),
        (FRONT_X+W-FNW, top_y_f+NOTCH),
        (FRONT_X+W-FNW, top_y_f),
        (FRONT_X+W, top_y_f),
    ], "SECCION", closed=False, lw=50)

    bot_y_f = FRONT_Y
    doc.lwpolyline([
        (FRONT_X, bot_y_f),
        (FRONT_X, bot_y_f-NOTCH),
        (FRONT_X+FNW, bot_y_f-NOTCH),
        (FRONT_X+FNW, bot_y_f),
        (FRONT_X+FNW+FGAP, bot_y_f),
        (FRONT_X+FNW+FGAP, bot_y_f-NOTCH),
        (FRONT_X+W-FNW, bot_y_f-NOTCH),
        (FRONT_X+W-FNW, bot_y_f),
        (FRONT_X+W, bot_y_f),
    ], "SECCION", closed=False, lw=50)

    # Zona picada frontal
    mid_y_f = FRONT_Y + VIEW_H/2
    zt_f = mid_y_f + ih/2
    zb_f = mid_y_f - ih/2

    top_border_f = _irregular_border_pts(FRONT_X, zt_f, FRONT_X+W, zt_f, 2.0, 14)
    bot_border_f = _irregular_border_pts(FRONT_X, zb_f, FRONT_X+W, zb_f, 2.0, 14)
    doc.zona_picada_boundary(top_border_f, "ZONA_PICADA")
    doc.zona_picada_boundary(bot_border_f, "ZONA_PICADA")
    doc.line(FRONT_X, zb_f, FRONT_X, zt_f, "ZONA_PICADA")
    doc.line(FRONT_X+W, zb_f, FRONT_X+W, zt_f, "ZONA_PICADA")

    # 5 barras frontales (líneas verticales)
    for i in range(nbf):
        bx = FRONT_X + cf + i * sp_f
        doc.bar_elevation(bx, zb_f-1.5, zt_f+1.5, df, "ARMADURA_LONG")

    # 2 estribos
    doc.stirrup_elevation(FRONT_X, zt_f, FRONT_X+W, "ESTRIBOS")
    doc.stirrup_elevation(FRONT_X, zb_f, FRONT_X+W, "ESTRIBOS")

    # Cotas vista frontal
    doc.dim_h(FRONT_X, FRONT_X+W, FRONT_Y-14, FRONT_Y, str(int(W)), "COTAS")
    doc.dim_h(FRONT_X, FRONT_X+cf, FRONT_Y-8, FRONT_Y, str(int(cf)), "COTAS")
    pos = FRONT_X+cf
    for i in range(nbf-1):
        doc.dim_h(pos, pos+sp_f, FRONT_Y-8, FRONT_Y, f"{sp_f:.0f}", "COTAS")
        pos += sp_f
    doc.dim_h(pos, FRONT_X+W, FRONT_Y-8, FRONT_Y, str(int(cf)), "COTAS")
    doc.dim_v(zb_f, zt_f, FRONT_X+W+14, FRONT_X+W, str(int(ih)), "COTAS")

    doc.label_arrow(FRONT_X+W, zt_f-ih*0.3, FRONT_X+W+35, zt_f+5,
                    [f"{nbf} Barres Ø{df:.0f}mm", f"Ø{ds:.0f} mm"],
                    "TEXTO", h=2.5)
    doc.title(FRONT_X+W/2, FRONT_Y-26, "VISTA FRONTAL")

    # ── Cajetín ──
    caj_x = FRONT_X + W + 50
    caj_y = FRONT_Y - 28
    doc.cajetin(caj_x, caj_y, _cajetin_data(data))

    return doc.to_buffer()


def generate_dxf_pillar_circ(data) -> io.BytesIO:
    diam = float(data.diameter)
    R    = diam / 2
    cov  = float(data.cover)
    nb   = int(data.bars_count)
    db   = float(data.bars_diam)
    ds   = float(data.stirrup_diam)
    ih   = float(data.inspection_height)
    r_b  = db / 20

    doc = DXFDoc()

    # Sección en planta
    doc.circle(0, 0, R, "SECCION", lw=70)
    doc.circle(0, 0, R-cov, "ESTRIBOS")
    for i in range(nb):
        ang = math.radians(360*i/nb + 90)
        bx = (R-cov)*math.cos(ang); by = (R-cov)*math.sin(ang)
        doc.bar_section(bx, by, r_b, "ARMADURA_LONG")

    # Zona picada — semi-círculo inferior-izquierdo
    zp_pts = []
    for deg in range(180, 361, 8):
        rad = math.radians(deg)
        zp_pts.append((R*0.88*math.cos(rad), R*0.88*math.sin(rad)))
    doc.zona_picada_boundary(zp_pts, "ZONA_PICADA")

    doc.dim_h(-R, R, -R-14, -R, f"Ø{diam:.0f}", "COTAS")
    doc.label_arrow(R*0.7, R*0.7, R+30, R*0.8,
                    [f"{nb} Barres Ø{db:.0f}mm", f"Espiral Ø{ds:.0f}mm", f"Recub: {cov}cm"],
                    "TEXTO")
    doc.title(0, R+8, "SECCIO EN PLANTA")

    # Alzado
    AX, AY = -R-20, -(ih+75)
    VH = ih+65
    doc.rect(AX, AY, diam, VH, "SECCION", lw=70)
    mid_ya = AY + VH/2
    zt_a = mid_ya + ih/2; zb_a = mid_ya - ih/2
    doc.zona_picada_boundary(_irregular_border_pts(AX, zt_a, AX+diam, zt_a, 1.5, 10), "ZONA_PICADA")
    doc.zona_picada_boundary(_irregular_border_pts(AX, zb_a, AX+diam, zb_a, 1.5, 10), "ZONA_PICADA")

    for i in range(nb):
        ang = math.radians(360*i/nb + 90)
        bx = AX+R + (R-cov)*math.cos(ang)
        doc.bar_elevation(bx, zb_a-1.5, zt_a+1.5, db, "ARMADURA_LONG")

    doc.stirrup_elevation(AX, zt_a, AX+diam, "ESTRIBOS")
    doc.stirrup_elevation(AX, zb_a, AX+diam, "ESTRIBOS")
    doc.dim_h(AX, AX+diam, AY-14, AY, f"Ø{diam:.0f}", "COTAS")
    doc.dim_v(zb_a, zt_a, AX+diam+14, AX+diam, str(int(ih)), "COTAS")
    doc.cajetin(AX+diam+50, AY-28, _cajetin_data(data))
    doc.title(AX+R, AY-26, "ALZAT")
    return doc.to_buffer()


def generate_dxf_beam(data) -> io.BytesIO:
    W    = float(data.width)
    H    = float(data.height)
    cov  = float(data.cover)
    nbb  = int(data.bars_bottom_count)
    nbt  = int(data.bars_top_count)
    dbb  = float(data.bars_bottom_diam)
    dbt  = float(data.bars_top_diam)
    ds   = float(data.stirrup_diam)
    sp_s = float(data.stirrup_spacing)
    il   = float(data.inspection_length)

    sp_bot = (W-2*cov)/(nbb-1) if nbb > 1 else 0
    sp_top = (W-2*cov)/(nbt-1) if nbt > 1 else 0

    doc = DXFDoc()

    # Sección transversal
    doc.rect(0, 0, W, H, "SECCION", lw=70)
    doc.stirrup_rect(cov-ds/10, cov-ds/10, W-2*(cov-ds/10), H-2*(cov-ds/10), 0.6, "ESTRIBOS")
    for i in range(nbb):
        doc.bar_section(cov+i*sp_bot, cov, dbb/20, "ARMADURA_LONG")
    for i in range(nbt):
        doc.bar_section(cov+i*sp_top, H-cov, dbt/20, "ARMADURA_LONG")

    # Zona picada sección (cara lateral derecha)
    zp_sec = (
        _irregular_border_pts(W*0.45, 0, W, 0, 0.8, 4) +
        [(W, H)] +
        list(reversed(_irregular_border_pts(W*0.45, H, W, H, 0.8, 4))) +
        [(W*0.45, H), (W*0.45, 0)]
    )
    doc.zona_picada_boundary(zp_sec[:-1], "ZONA_PICADA")

    doc.dim_h(0, W, -14, 0, str(int(W)), "COTAS")
    doc.dim_h(0, cov, -8, 0, str(int(cov)), "COTAS")
    if nbb > 1:
        doc.dim_h(cov, cov+sp_bot, -8, 0, f"{sp_bot:.0f}", "COTAS")
    doc.dim_v(0, H, W+14, W, str(int(H)), "COTAS")
    doc.dim_v(0, cov, W+8, W, str(int(cov)), "COTAS")
    doc.label_arrow(W, cov, W+35, 5,
                    [f"{nbb}Ø{dbb:.0f} inf.", f"{nbt}Ø{dbt:.0f} sup.", f"Estreps Ø{ds:.0f}@{sp_s:.0f}cm"],
                    "TEXTO")
    doc.title(W/2, H+8, "SECCIO TRANSVERSAL")

    # Alzado longitudinal
    mg = H*0.8
    TL = il + 2*mg
    AX = W + 40; AY = 0
    doc.rect(AX, AY, TL, H, "SECCION", lw=70)
    doc.zona_picada_boundary(_irregular_border_pts(AX+mg, AY+H, AX+mg+il, AY+H, 2.0, 12), "ZONA_PICADA")
    doc.zona_picada_boundary(_irregular_border_pts(AX+mg, AY, AX+mg+il, AY, 2.0, 12), "ZONA_PICADA")
    doc.line(AX+mg, AY, AX+mg, AY+H, "ZONA_PICADA")
    doc.line(AX+mg+il, AY, AX+mg+il, AY+H, "ZONA_PICADA")

    doc.line(AX, AY+cov, AX+TL, AY+cov, "ARMADURA_LONG", lw=int(dbb*8))
    doc.line(AX, AY+H-cov, AX+TL, AY+H-cov, "ARMADURA_LONG", lw=int(dbt*8))

    ns = int(TL/sp_s)+1
    for i in range(ns):
        sx = AX + i*sp_s
        if sx <= AX+TL:
            doc.line(sx, AY+cov-1, sx, AY+H-cov+1, "ESTRIBOS")

    doc.dim_h(AX+mg, AX+mg+il, AY-14, AY, str(int(il)), "COTAS")
    doc.dim_v(AY, AY+H, AX+TL+14, AX+TL, str(int(H)), "COTAS")
    doc.title(AX+TL/2, AY+H+8, "ALZAT (ZONA INSPECCIO)")
    doc.cajetin(AX+TL+20, AY-28, _cajetin_data(data))
    return doc.to_buffer()


def generate_dxf_footing(data) -> io.BytesIO:
    L   = float(data.length)
    WW  = float(data.width)
    H   = float(data.height)
    cb  = float(data.cover_bottom)
    cs  = float(data.cover_sides)
    nx  = int(data.bars_x_count)
    ny  = int(data.bars_y_count)
    dx  = float(data.bars_x_diam)
    dy  = float(data.bars_y_diam)
    pw  = float(getattr(data, 'pedestal_w', 40) or 40)
    pd  = float(getattr(data, 'pedestal_d', 40) or 40)

    sp_x = (L-2*cs)/(nx-1) if nx>1 else 0
    sp_y = (WW-2*cs)/(ny-1) if ny>1 else 0

    doc = DXFDoc()

    # Planta armadura
    doc.rect(0, 0, L, WW, "SECCION", lw=70)
    # Pilar centrado (rectángulo)
    doc.rect((L-pw)/2, (WW-pd)/2, pw, pd, "SECCION", lw=35)
    for i in range(nx):
        bx = cs + i*sp_x
        doc.line(bx, cs, bx, WW-cs, "ARMADURA_LONG", lw=int(dx*7))
    for i in range(ny):
        by = cs + i*sp_y
        doc.line(cs, by, L-cs, by, "ARMADURA_LONG", lw=int(dy*7))

    zp = ([(0,WW*0.5)] +
          _irregular_border_pts(0,WW*0.5, L*0.55,WW,1.5,6) +
          [(L*0.55,WW),(0,WW),(0,WW*0.5)])
    doc.zona_picada_boundary(zp, "ZONA_PICADA")

    doc.dim_h(0, L, -14, 0, str(int(L)), "COTAS")
    doc.dim_h(0, cs, -8, 0, str(int(cs)), "COTAS")
    if nx>1: doc.dim_h(cs, cs+sp_x, -8, 0, f"{sp_x:.0f}", "COTAS")
    doc.dim_v(0, WW, L+14, L, str(int(WW)), "COTAS")
    doc.label_arrow(L*0.8, WW*0.8, L+35, WW*0.7,
                    [f"{nx}Ø{dx:.0f} dir.X", f"{ny}Ø{dy:.0f} dir.Y",
                     f"Recub lat:{cs}cm / inf:{cb}cm"], "TEXTO")
    doc.title(L/2, WW+8, "PLANTA ARMADURA")

    # Sección X-X
    SXX, SXY = 0, -(H+50)
    doc.rect(SXX, SXY, L, H, "SECCION", lw=70)
    for i in range(nx):
        bx = SXX+cs+i*sp_x
        doc.bar_section(bx, SXY+cb, dx/20, "ARMADURA_LONG")
    doc.dim_h(SXX, SXX+L, SXY-14, SXY, str(int(L)), "COTAS")
    doc.dim_v(SXY, SXY+H, SXX+L+14, SXX+L, str(int(H)), "COTAS")
    doc.dim_v(SXY, SXY+cb, SXX+L+8, SXX+L, str(int(cb)), "COTAS")
    doc.title(SXX+L/2, SXY+H+8, "SECCIO X-X")

    # Sección Y-Y
    SYX, SYY = L+30, SXY
    doc.rect(SYX, SYY, WW, H, "SECCION", lw=70)
    for i in range(ny):
        bx = SYX+cs+i*sp_y
        doc.bar_section(bx, SYY+cb, dy/20, "ARMADURA_LONG")
    doc.dim_h(SYX, SYX+WW, SYY-14, SYY, str(int(WW)), "COTAS")
    doc.dim_v(SYY, SYY+H, SYX+WW+14, SYX+WW, str(int(H)), "COTAS")
    doc.title(SYX+WW/2, SYY+H+8, "SECCIO Y-Y")

    doc.cajetin(SYX+WW+20, SYY-28, _cajetin_data(data))
    return doc.to_buffer()


def generate_dxf_forjado(data) -> io.BytesIO:
    th  = float(data.thickness)
    nx  = int(data.bars_x_count)
    ny  = int(data.bars_y_count)
    dx  = float(data.bars_x_diam)
    dy  = float(data.bars_y_diam)
    spx = float(data.bars_x_spacing)
    spy = float(data.bars_y_spacing)
    cb  = float(data.cover_bottom)
    ct  = float(data.cover_top)

    WR = max(nx*spx+20, 120)
    HR = max(ny*spy+20, 100)

    doc = DXFDoc()

    # Sección transversal
    doc.rect(0, 0, WR, th, "SECCION", lw=70)
    for i in range(nx):
        bx = 10+i*spx
        doc.bar_section(bx, cb, dx/20, "ARMADURA_LONG")
        doc.bar_section(bx, th-ct, dx/20, "ARMADURA_LONG")
    doc.zona_picada_boundary(_irregular_border_pts(WR*0.3,0,WR*0.7,0,0.8,6)+
                              [(WR*0.7,th)]+list(reversed(_irregular_border_pts(WR*0.3,th,WR*0.7,th,0.8,6)))+
                              [(WR*0.3,0)], "ZONA_PICADA")
    doc.dim_h(0, WR, -14, 0, f"Repres. {WR:.0f}", "COTAS")
    doc.dim_v(0, th, WR+12, WR, f"e={th:.0f}", "COTAS")
    doc.title(WR/2, th+8, "SECCIO TRANSVERSAL")

    # Planta
    PLX,PLY = 0, -(HR+40)
    doc.rect(PLX, PLY, WR, HR, "SECCION", lw=70)
    for i in range(nx):
        bx = PLX+10+i*spx
        doc.line(bx, PLY+5, bx, PLY+HR-5, "ARMADURA_LONG", lw=int(dx*7))
    for i in range(ny):
        by = PLY+10+i*spy
        doc.line(PLX+5, by, PLX+WR-5, by, "ARMADURA_LONG", lw=int(dy*7))
    doc.label_arrow(PLX+WR, PLY+HR*0.6, PLX+WR+30, PLY+HR*0.7,
                    [f"X: {nx}Ø{dx:.0f}@{spx}cm", f"Y: {ny}Ø{dy:.0f}@{spy}cm",
                     f"Recub: inf={cb} / sup={ct}cm"], "TEXTO")
    doc.title(PLX+WR/2, PLY+HR+8, "PLANTA ARMADURA")
    doc.cajetin(PLX+WR+30, PLY-28, _cajetin_data(data))
    return doc.to_buffer()


def generate_dxf_stair(data) -> io.BytesIO:
    riser = float(data.riser)
    tread = float(data.tread)
    th    = float(data.slab_thickness)
    wt    = float(data.wall_thickness)
    n     = min(int(data.steps_count), 12)
    cov   = float(data.cover)
    dl    = float(data.bars_long_diam)
    dt    = float(data.bars_trans_diam)
    sl    = float(data.bars_long_sep)
    st    = float(data.bars_trans_sep)

    ang   = math.atan2(n*riser, n*tread)
    ox, oy = 20.0, n*riser + th + 20

    doc = DXFDoc()

    # Cara superior zanca (peldaños)
    cur_x, cur_y = ox, oy
    top_pts = [(cur_x, cur_y)]
    for i in range(n):
        top_pts.append((cur_x, cur_y - riser))
        cur_y -= riser
        top_pts.append((cur_x + tread, cur_y))
        cur_x += tread
    doc.lwpolyline(top_pts, "SECCION", lw=70)

    # Cara inferior zanca (paralela a la inclinación)
    off_x = math.sin(ang)*th
    off_y = math.cos(ang)*th
    bot_start = (ox+off_x, oy+off_y)
    bot_end   = (ox+n*tread+off_x, oy-n*riser+off_y)
    doc.line(bot_start[0], bot_start[1], bot_end[0], bot_end[1], "SECCION", lw=70)
    doc.line(top_pts[0][0], top_pts[0][1], bot_start[0], bot_start[1], "SECCION", lw=70)
    doc.line(top_pts[-1][0], top_pts[-1][1], bot_end[0], bot_end[1], "SECCION", lw=70)

    # Paredes verticales de peldaños (espesor wt)
    for i in range(n):
        px = ox + i*tread
        py = oy - i*riser
        doc.line(px, py-riser, px, py, "SECCION")
        doc.line(px, py-riser, px+wt, py-riser, "SECCION")

    # Zona picada en peldaño central
    mi = n//2
    px_m = ox + mi*tread; py_m = oy - mi*riser
    doc.zona_picada_boundary([
        (px_m, py_m), (px_m+tread, py_m), (px_m+tread, py_m-riser),
        (px_m+wt+1, py_m-riser), (px_m+wt+1, py_m-riser+2),
        (px_m+3, py_m-1), (px_m, py_m)
    ], "ZONA_PICADA")

    # Armadura longitudinal (2 capas)
    for off_factor in [cov/th, 1-cov/th]:
        lx1 = ox + off_x*off_factor + cov*math.cos(ang)
        ly1 = oy + off_y*off_factor - cov*math.sin(ang)
        lx2 = ox + n*tread + off_x*off_factor - cov*math.cos(ang)
        ly2 = oy - n*riser + off_y*off_factor + cov*math.sin(ang)
        doc.line(lx1, ly1, lx2, ly2, "ARMADURA_LONG", lw=int(dl*8))

    # Cotas principales
    doc.dim_h(ox, ox+tread, oy+th+10, oy, f"{tread:.1f}", "COTAS")
    doc.dim_v(oy-riser, oy, ox-15, ox, f"{riser:.1f}", "COTAS")
    doc.dim_v(bot_end[1], bot_end[1]+th, ox+n*tread+15, ox+n*tread, f"{th:.0f}", "COTAS")

    doc.label_arrow(ox+n*tread*0.6, oy-n*riser*0.5,
                    ox+n*tread+35, oy-n*riser*0.5,
                    [f"Arm. long: Ø{dl:.0f}@{sl}cm",
                     f"Arm. trans: Ø{dt:.0f}@{st}cm",
                     f"Recub: {cov}cm",
                     f"Relleno: {getattr(data,'relleno_type','Mortero/Cascote')}"],
                    "TEXTO")

    if getattr(data, 'depth_no_rebar', None):
        doc.text(ox+n*tread/2, oy-n*riser-15, 2.0,
                 f"ATENCIO: sense armadura fins -{data.depth_no_rebar}cm", "TEXTO", 1)

    doc.title(ox+n*tread/2, oy+th+20, "SECCIO LONGITUDINAL — ZANCA")
    doc.cajetin(ox+n*tread+35, oy-n*riser-35, _cajetin_data(data))
    return doc.to_buffer()