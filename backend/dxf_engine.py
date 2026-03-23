"""
dxf_engine.py — Motor paramétrico de generación DXF
=====================================================
Arquitectura de plantillas paramétricas:

Cada tipo de estructura define un "modelo base" en coordenadas normalizadas
(origen = esquina inf-izq, unidad = 1 cm). Las funciones reciben los parámetros
del formulario y calculan posiciones de todos los elementos geométricamente,
sin dibujar línea a línea de forma ad-hoc.

Capas estándar en todos los planos:
  - SECCION       : contorno exterior hormigón
  - ZONA_PICADA   : área inspeccionada (borde irregular)
  - ARMADURA_LONG : barras longitudinales
  - ESTRIBOS      : armadura transversal
  - COTAS         : sistema de acotado automático
  - TEXTO         : etiquetas, rótulos, notas
  - CAJETIN       : cuadro de título
"""

import io
import math
from typing import List, Tuple

# ─── UTILIDADES CORE ──────────────────────────────────────────────────────────

def build_dxf_manual(sections: List[str]) -> io.BytesIO:
    """
    Construye un DXF R12 válido a partir de secciones de entidades.
    Fallback cuando ezdxf no está disponible.
    """
    header = """  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1009\n  9\n$INSUNITS\n 70\n5\n  0\nENDSEC\n"""
    
    layers = ["SECCION", "ZONA_PICADA", "ARMADURA_LONG", "ESTRIBOS", "COTAS", "TEXTO", "CAJETIN"]
    layer_colors = {"SECCION": 7, "ZONA_PICADA": 253, "ARMADURA_LONG": 7,
                    "ESTRIBOS": 5, "COTAS": 3, "TEXTO": 7, "CAJETIN": 8}
    
    tables = "  0\nSECTION\n  2\nTABLES\n  0\nTABLE\n  2\nLAYER\n 70\n{}\n".format(len(layers))
    for l in layers:
        c = layer_colors.get(l, 7)
        tables += f"  0\nLAYER\n  2\n{l}\n 70\n0\n 62\n{c}\n  6\nCONTINUOUS\n"
    tables += "  0\nENDTABLE\n  0\nTABLE\n  2\nSTYLE\n 70\n1\n  0\nSTYLE\n  2\nSTANDARD\n 70\n0\n 40\n0.0\n 41\n1.0\n 42\n0.2\n 50\n0.0\n 71\n0\n  4\ntxt\n  0\nENDTABLE\n  0\nENDSEC\n"
    
    body = "  0\nSECTION\n  2\nENTITIES\n"
    for s in sections:
        body += s
    body += "  0\nENDSEC\n  0\nEOF\n"
    
    full = header + tables + body
    buf = io.BytesIO(full.encode("utf-8"))
    buf.seek(0)
    return buf


def _line(x1, y1, x2, y2, layer="SECCION") -> str:
    return (f"  0\nLINE\n  8\n{layer}\n"
            f" 10\n{x1:.4f}\n 20\n{y1:.4f}\n 30\n0.0\n"
            f" 11\n{x2:.4f}\n 21\n{y2:.4f}\n 31\n0.0\n")

def _circle(cx, cy, r, layer="ARMADURA_LONG") -> str:
    return (f"  0\nCIRCLE\n  8\n{layer}\n"
            f" 10\n{cx:.4f}\n 20\n{cy:.4f}\n 30\n0.0\n"
            f" 40\n{r:.4f}\n")

def _solid(x1,y1, x2,y2, x3,y3, x4,y4, layer="ARMADURA_LONG") -> str:
    """SOLID de 4 puntos — relleno para sección de barra"""
    return (f"  0\nSOLID\n  8\n{layer}\n"
            f" 10\n{x1:.4f}\n 20\n{y1:.4f}\n 30\n0.0\n"
            f" 11\n{x2:.4f}\n 21\n{y2:.4f}\n 31\n0.0\n"
            f" 12\n{x3:.4f}\n 21\n{y3:.4f}\n 31\n0.0\n"
            f" 13\n{x4:.4f}\n 21\n{y4:.4f}\n 31\n0.0\n")

def _bar_section(cx, cy, r, layer="ARMADURA_LONG") -> str:
    """Barra en sección: círculo + relleno aproximado con SOLIDs"""
    out = _circle(cx, cy, r, layer)
    # Rellenar con SOLIDs concéntricos
    for fr in [0.8, 0.5, 0.2]:
        rr = r * fr
        out += _solid(cx-rr, cy, cx, cy+rr, cx, cy-rr, cx+rr, cy, layer)
    return out

def _text(x, y, h, content, layer="TEXTO", angle=0.0) -> str:
    return (f"  0\nTEXT\n  8\n{layer}\n"
            f" 10\n{x:.4f}\n 20\n{y:.4f}\n 30\n0.0\n"
            f" 40\n{h:.4f}\n"
            f"  1\n{content}\n"
            f" 50\n{angle:.2f}\n"
            f" 72\n1\n"
            f" 11\n{x:.4f}\n 21\n{y:.4f}\n 31\n0.0\n")

def _mtext_leader(x_from, y_from, x_to, y_to, lines: List[str], h=2.5, layer="TEXTO") -> str:
    """Flecha de anotación + texto multilínea"""
    out = _line(x_from, y_from, x_to, y_to, layer)
    # Flecha pequeña
    dx = x_to - x_from
    dy = y_to - y_from
    length = math.sqrt(dx*dx + dy*dy) or 1
    px = -dy/length * 1.5
    py = dx/length * 1.5
    out += _line(x_to, y_to, x_to+px+dx/length*2, y_to+py+dy/length*2, layer)
    out += _line(x_to, y_to, x_to-px+dx/length*2, y_to-py+dy/length*2, layer)
    # Textos
    lh = h * 1.4
    for i, l in enumerate(lines):
        out += _text(x_from, y_from + i*lh, h, l, layer)
    return out

def _dim_horizontal(x1, y1, x2, dim_y, value_str, layer="COTAS", tick_h=1.5) -> str:
    """Cota lineal horizontal automática"""
    out = ""
    out += _line(x1, y1, x1, dim_y, layer)
    out += _line(x2, y1, x2, dim_y, layer)
    out += _line(x1, dim_y, x2, dim_y, layer)
    # Flechas
    out += _line(x1, dim_y, x1+tick_h*1.5, dim_y+tick_h*0.6, layer)
    out += _line(x1, dim_y, x1+tick_h*1.5, dim_y-tick_h*0.6, layer)
    out += _line(x2, dim_y, x2-tick_h*1.5, dim_y+tick_h*0.6, layer)
    out += _line(x2, dim_y, x2-tick_h*1.5, dim_y-tick_h*0.6, layer)
    mid = (x1+x2)/2
    out += _text(mid, dim_y + tick_h*0.8, 2.2, value_str, layer)
    return out

def _dim_vertical(x1, y1, y2, dim_x, value_str, layer="COTAS", tick_h=1.5) -> str:
    """Cota lineal vertical automática"""
    out = ""
    out += _line(x1, y1, dim_x, y1, layer)
    out += _line(x1, y2, dim_x, y2, layer)
    out += _line(dim_x, y1, dim_x, y2, layer)
    out += _line(dim_x, y1, dim_x+tick_h*0.6, y1+tick_h*1.5, layer)
    out += _line(dim_x, y1, dim_x-tick_h*0.6, y1+tick_h*1.5, layer)
    out += _line(dim_x, y2, dim_x+tick_h*0.6, y2-tick_h*1.5, layer)
    out += _line(dim_x, y2, dim_x-tick_h*0.6, y2-tick_h*1.5, layer)
    mid = (y1+y2)/2
    out += _text(dim_x + tick_h*0.8, mid, 2.2, value_str, layer, 90.0)
    return out

def _rect(x, y, w, h, layer="SECCION") -> str:
    """Rectángulo como 4 líneas"""
    out  = _line(x,   y,   x+w, y,   layer)
    out += _line(x+w, y,   x+w, y+h, layer)
    out += _line(x+w, y+h, x,   y+h, layer)
    out += _line(x,   y+h, x,   y,   layer)
    return out

def _irregular_border(points: List[Tuple[float,float]], layer="ZONA_PICADA") -> str:
    """Polilínea de borde irregular (zona picada)"""
    out = ""
    for i in range(len(points)-1):
        out += _line(points[i][0], points[i][1],
                     points[i+1][0], points[i+1][1], layer)
    return out

def _stirrup_rect(x, y, w, h, r, layer="ESTRIBOS") -> str:
    """
    Estribo rectangular con esquinas redondeadas (aproximado con líneas + arcos).
    x,y = esquina inf-izq del estribo (coordenadas exteriores)
    """
    out  = _line(x+r, y,   x+w-r, y,   layer)  # bottom
    out += _line(x+w, y+r, x+w,   y+h-r, layer)  # right
    out += _line(x+w-r, y+h, x+r, y+h, layer)  # top
    out += _line(x,   y+h-r, x,   y+r, layer)  # left
    # Esquinas (arcos de 90°)
    out += (f"  0\nARC\n  8\n{layer}\n"
            f" 10\n{x+r:.4f}\n 20\n{y+r:.4f}\n 30\n0.0\n"
            f" 40\n{r:.4f}\n 50\n180.0\n 51\n270.0\n")
    out += (f"  0\nARC\n  8\n{layer}\n"
            f" 10\n{x+w-r:.4f}\n 20\n{y+r:.4f}\n 30\n0.0\n"
            f" 40\n{r:.4f}\n 50\n270.0\n 51\n360.0\n")
    out += (f"  0\nARC\n  8\n{layer}\n"
            f" 10\n{x+w-r:.4f}\n 20\n{y+h-r:.4f}\n 30\n0.0\n"
            f" 40\n{r:.4f}\n 50\n0.0\n 51\n90.0\n")
    out += (f"  0\nARC\n  8\n{layer}\n"
            f" 10\n{x+r:.4f}\n 20\n{y+h-r:.4f}\n 30\n0.0\n"
            f" 40\n{r:.4f}\n 50\n90.0\n 51\n180.0\n")
    return out

def _cajetin(x, y, element_id, struct_type, notes="") -> str:
    """Cuadro de título estándar"""
    w, h = 80, 20
    out  = _rect(x, y, w, h, "CAJETIN")
    out += _line(x, y+13, x+w, y+13, "CAJETIN")
    out += _line(x+40, y, x+40, y+13, "CAJETIN")
    out += _text(x+2,  y+15.5, 3.5, f"StructCAD — {struct_type}", "CAJETIN")
    out += _text(x+2,  y+10,   2.5, f"Elemento: {element_id}", "CAJETIN")
    out += _text(x+42, y+10,   2.5, "Escala: 1:20", "CAJETIN")
    out += _text(x+2,  y+6,    2.0, "Inspección estructural por rotura parcial", "CAJETIN")
    out += _text(x+2,  y+2.5,  2.0, f"Notas: {notes or 'Sin observaciones'}", "CAJETIN")
    return out

def _view_title(x, y, title) -> str:
    out  = _line(x-5, y-1, x+len(title)*1.6+5, y-1, "TEXTO")
    out += _text(x, y+0.5, 3.0, title, "TEXTO")
    return out

def _irregular_zone_border(x0, y0, x1, y1, amplitude=2.0, steps=12, layer="ZONA_PICADA") -> str:
    """
    Genera un borde horizontal irregular (ondulado) entre dos puntos.
    Simula el borde de la zona picada en obra.
    """
    import random
    random.seed(42)  # seed fija para reproducibilidad
    pts = []
    for i in range(steps+1):
        t = i/steps
        bx = x0 + t*(x1-x0)
        by = y0 + t*(y1-y0)
        if 0 < i < steps:
            by += random.uniform(-amplitude, amplitude)
        pts.append((bx, by))
    return _irregular_border(pts, layer)


# ─── GENERADORES POR TIPO DE ESTRUCTURA ───────────────────────────────────────

def generate_dxf_pillar_rect(data) -> io.BytesIO:
    """
    Pilar rectangular — 3 vistas: Sección en planta + Vista frontal + Vista lateral
    
    Plantilla base:
    - Sección en planta centrada arriba (origen 0,0 = esquina inf-izq del pilar)
    - Vista lateral abajo-izquierda (separada 20cm + margen)
    - Vista frontal abajo-derecha
    - Cajetín abajo del todo
    """
    W  = data.width          # cm
    D  = data.depth          # cm
    cf = data.cover_front    # recubrimiento cara frontal
    cl = data.cover_lateral  # recubrimiento cara lateral
    bf = data.bars_front_count
    bl = data.bars_lateral_count
    diam_f = data.bars_front_diam / 10   # mm → cm
    diam_l = data.bars_lateral_diam / 10
    diam_s = data.stirrup_diam / 10
    ih     = data.inspection_height
    eid    = data.element_id or "P-01"

    ent = ""

    # ── SEPARACIONES ENTRE BARRAS ──
    # Cara frontal: espacio disponible entre estribos
    inner_W = W - 2*cf
    # separación entre ejes de barras frontales
    if bf > 1:
        sp_f = inner_W / (bf - 1)
    else:
        sp_f = 0

    inner_D = D - 2*cl
    if bl > 1:
        sp_l = inner_D / (bl - 1)
    else:
        sp_l = 0

    r_bar_f = diam_f / 2
    r_bar_l = diam_l / 2

    # ─────────────────────────────────────────────────────────────
    # VISTA 1: SECCIÓN EN PLANTA
    # Origen planta: (PLAN_X, PLAN_Y)
    # ─────────────────────────────────────────────────────────────
    PLAN_X, PLAN_Y = 0, 0

    # Contorno exterior
    ent += _rect(PLAN_X, PLAN_Y, W, D, "SECCION")

    # Zona picada: esquina inferior-izquierda, forma orgánica
    # El borde curva desde el lado izquierdo (a ~D*0.5) hasta el borde inferior (a ~W*0.6)
    zp_pts = [
        (PLAN_X,        PLAN_Y + D*0.45),
        (PLAN_X + W*0.08, PLAN_Y + D*0.60),
        (PLAN_X + W*0.15, PLAN_Y + D*0.72),
        (PLAN_X + W*0.22, PLAN_Y + D*0.80),
        (PLAN_X + W*0.32, PLAN_Y + D*0.86),
        (PLAN_X + W*0.44, PLAN_Y + D*0.88),
        (PLAN_X + W*0.56, PLAN_Y + D*0.83),
        (PLAN_X + W*0.65, PLAN_Y + D*0.74),
        (PLAN_X + W*0.70, PLAN_Y + D*0.62),
        (PLAN_X + W*0.70, PLAN_Y + D*0.50),
        (PLAN_X + W*0.65, PLAN_Y + D*0.35),
        (PLAN_X + W*0.55, PLAN_Y + D*0.22),
        (PLAN_X + W*0.42, PLAN_Y + D*0.12),
        (PLAN_X + W*0.28, PLAN_Y + D*0.05),
        (PLAN_X + W*0.14, PLAN_Y + D*0.03),
        (PLAN_X + W*0.05, PLAN_Y + D*0.08),
        (PLAN_X,          PLAN_Y + D*0.18),
        (PLAN_X,          PLAN_Y + D*0.45),
    ]
    ent += _irregular_border(zp_pts, "ZONA_PICADA")

    # Estribo Ø6 — rectángulo interior
    stir_x = PLAN_X + cf - diam_s
    stir_y = PLAN_Y + cl - diam_s
    stir_w = W - 2*(cf - diam_s)
    stir_d = D - 2*(cl - diam_s)
    ent += _stirrup_rect(stir_x, stir_y, stir_w, stir_d, 0.8, "ESTRIBOS")

    # 4 barras laterales (cara izquierda, columna)
    bar_x_lat = PLAN_X + cl
    for i in range(bl):
        bar_y = PLAN_Y + cl + i * sp_l
        ent += _bar_section(bar_x_lat, bar_y, r_bar_l, "ARMADURA_LONG")

    # 5 barras frontales (cara inferior, fila)
    bar_y_front = PLAN_Y + cf
    for i in range(bf):
        bar_x = PLAN_X + cf + i * sp_f
        ent += _bar_section(bar_x, bar_y_front, r_bar_f, "ARMADURA_LONG")

    # Cotas planta
    ent += _dim_horizontal(PLAN_X, PLAN_Y, PLAN_X+W, PLAN_Y - 15, f"{W}", "COTAS")
    ent += _dim_vertical(PLAN_X+W, PLAN_Y, PLAN_Y+D, PLAN_X+W+15, f"{D}", "COTAS")

    # Sub-cotas horizontales (separaciones barras frontales)
    cx = PLAN_X + cf
    ent += _dim_horizontal(PLAN_X, PLAN_Y, cx, PLAN_Y-8, f"{cf}", "COTAS")
    for i in range(bf-1):
        ent += _dim_horizontal(cx + i*sp_f, PLAN_Y, cx+(i+1)*sp_f, PLAN_Y-8, f"{sp_f:.0f}", "COTAS")
    ent += _dim_horizontal(cx+(bf-1)*sp_f, PLAN_Y, PLAN_X+W, PLAN_Y-8, f"{cf}", "COTAS")

    # Sub-cotas verticales (separaciones barras laterales)
    cy = PLAN_Y + cl
    ent += _dim_vertical(PLAN_X+W, PLAN_Y, cy, PLAN_X+W+8, f"{cl}", "COTAS")
    for i in range(bl-1):
        ent += _dim_vertical(PLAN_X+W, cy+i*sp_l, cy+(i+1)*sp_l, PLAN_X+W+8, f"{sp_l:.0f}", "COTAS")
    ent += _dim_vertical(PLAN_X+W, cy+(bl-1)*sp_l, PLAN_Y+D, PLAN_X+W+8, f"{cl}", "COTAS")

    # Etiquetas con flecha
    ent += _mtext_leader(PLAN_X+W+35, PLAN_Y+D-5, PLAN_X+cl, PLAN_Y+D-cl*0.8,
                         [f"O{data.stirrup_diam:.0f} mm", f"{bl} Barres O{data.bars_lateral_diam:.0f}mm"],
                         layer="TEXTO")
    ent += _mtext_leader(PLAN_X+W+35, PLAN_Y+5, PLAN_X + W*0.7, PLAN_Y+cf,
                         [f"{bf} Barres O{data.bars_front_diam:.0f}mm", f"O{data.stirrup_diam:.0f} mm"],
                         layer="TEXTO")

    ent += _text(PLAN_X - 20, PLAN_Y + D/2, 3.0, "LATERAL", "TEXTO", 90)
    ent += _text(PLAN_X + W/2 - 10, PLAN_Y - 30, 3.0, "FRONTAL", "TEXTO")
    ent += _view_title(PLAN_X, PLAN_Y + D + 5, "SECCIO EN PLANTA")

    # ─────────────────────────────────────────────────────────────
    # VISTA 2: VISTA LATERAL (cara de D cm)
    # Origen: (LAT_X, LAT_Y)
    # ─────────────────────────────────────────────────────────────
    LAT_X = -10
    LAT_Y = -(ih + 80 + 50)   # debajo de la planta

    VIEW_H = ih + 60  # altura total representada

    # Contorno pilar (ancho=D)
    ent += _rect(LAT_X, LAT_Y, D, VIEW_H, "SECCION")

    # Muescas superiores (dientes de sierra simétricos)
    notch_w = D * 0.32
    notch_h = 10
    gap = D - 2*notch_w
    # diente izquierdo
    ent += _rect(LAT_X, LAT_Y+VIEW_H, notch_w, notch_h, "SECCION")
    # diente derecho
    ent += _rect(LAT_X+D-notch_w, LAT_Y+VIEW_H, notch_w, notch_h, "SECCION")
    # hueco entre dientes (blanco)
    ent += _line(LAT_X+notch_w, LAT_Y+VIEW_H, LAT_X+D-notch_w, LAT_Y+VIEW_H, "SECCION")

    # Muescas inferiores
    ent += _rect(LAT_X, LAT_Y-notch_h, notch_w, notch_h, "SECCION")
    ent += _rect(LAT_X+D-notch_w, LAT_Y-notch_h, notch_w, notch_h, "SECCION")
    ent += _line(LAT_X+notch_w, LAT_Y, LAT_X+D-notch_w, LAT_Y, "SECCION")

    # Zona picada (franja central con bordes irregulares)
    mid_y = LAT_Y + VIEW_H/2
    zone_top = mid_y + ih/2
    zone_bot = mid_y - ih/2

    ent += _irregular_zone_border(LAT_X, zone_top, LAT_X+D, zone_top, 1.5, 10, "ZONA_PICADA")
    ent += _irregular_zone_border(LAT_X, zone_bot, LAT_X+D, zone_bot, 1.5, 10, "ZONA_PICADA")

    # Barras longitudinales (líneas verticales en zona picada)
    for i in range(bl):
        bx = LAT_X + cl + i * sp_l
        ent += _line(bx, zone_bot - 2, bx, zone_top + 2, "ARMADURA_LONG")

    # Estribos (líneas horizontales)
    ent += _line(LAT_X, zone_top, LAT_X+D, zone_top, "ESTRIBOS")
    ent += _line(LAT_X, zone_bot, LAT_X+D, zone_bot, "ESTRIBOS")

    # Cotas vista lateral
    ent += _dim_horizontal(LAT_X, LAT_Y, LAT_X+D, LAT_Y-15, f"{D}", "COTAS")
    # Sub-cotas
    cx = LAT_X + cl
    ent += _dim_horizontal(LAT_X, LAT_Y, cx, LAT_Y-8, f"{cl}", "COTAS")
    for i in range(bl-1):
        ent += _dim_horizontal(cx+i*sp_l, LAT_Y, cx+(i+1)*sp_l, LAT_Y-8, f"{sp_l:.0f}", "COTAS")
    ent += _dim_horizontal(cx+(bl-1)*sp_l, LAT_Y, LAT_X+D, LAT_Y-8, f"{cl}", "COTAS")

    # Cota zona picada (derecha)
    ent += _dim_vertical(LAT_X+D, zone_bot, zone_top, LAT_X+D+15, f"{ih}", "COTAS")

    ent += _mtext_leader(LAT_X-35, mid_y, LAT_X+cl, mid_y,
                         [f"{bl} Barres O{data.bars_lateral_diam:.0f}mm", f"O{data.stirrup_diam:.0f} mm"],
                         layer="TEXTO")
    ent += _view_title(LAT_X + D/2 - 15, LAT_Y - 25, "VISTA LATERAL")

    # ─────────────────────────────────────────────────────────────
    # VISTA 3: VISTA FRONTAL (cara de W cm)
    # ─────────────────────────────────────────────────────────────
    FRONT_X = D + 30
    FRONT_Y = LAT_Y

    ent += _rect(FRONT_X, FRONT_Y, W, VIEW_H, "SECCION")

    # Muescas asimétricas (vista frontal)
    n2w = W * 0.26
    ent += _rect(FRONT_X, FRONT_Y+VIEW_H, n2w, notch_h+2, "SECCION")
    ent += _rect(FRONT_X+W*0.42, FRONT_Y+VIEW_H, W*0.30, notch_h+2, "SECCION")
    ent += _rect(FRONT_X+W-n2w, FRONT_Y+VIEW_H, n2w, notch_h, "SECCION")

    ent += _rect(FRONT_X, FRONT_Y-notch_h-2, n2w, notch_h+2, "SECCION")
    ent += _rect(FRONT_X+W*0.42, FRONT_Y-notch_h, W*0.30, notch_h, "SECCION")
    ent += _rect(FRONT_X+W-n2w, FRONT_Y-notch_h, n2w, notch_h, "SECCION")

    # Zona picada frontal
    mid_yf = FRONT_Y + VIEW_H/2
    zone_top_f = mid_yf + ih/2
    zone_bot_f = mid_yf - ih/2

    ent += _irregular_zone_border(FRONT_X, zone_top_f, FRONT_X+W, zone_top_f, 1.8, 14, "ZONA_PICADA")
    ent += _irregular_zone_border(FRONT_X, zone_bot_f, FRONT_X+W, zone_bot_f, 1.8, 14, "ZONA_PICADA")

    # 5 barras frontales (líneas verticales)
    for i in range(bf):
        bx = FRONT_X + cf + i * sp_f
        ent += _line(bx, zone_bot_f - 2, bx, zone_top_f + 2, "ARMADURA_LONG")

    # Estribos
    ent += _line(FRONT_X, zone_top_f, FRONT_X+W, zone_top_f, "ESTRIBOS")
    ent += _line(FRONT_X, zone_bot_f, FRONT_X+W, zone_bot_f, "ESTRIBOS")

    # Cotas frontal
    ent += _dim_horizontal(FRONT_X, FRONT_Y, FRONT_X+W, FRONT_Y-15, f"{W}", "COTAS")
    cx2 = FRONT_X + cf
    ent += _dim_horizontal(FRONT_X, FRONT_Y, cx2, FRONT_Y-8, f"{cf}", "COTAS")
    for i in range(bf-1):
        ent += _dim_horizontal(cx2+i*sp_f, FRONT_Y, cx2+(i+1)*sp_f, FRONT_Y-8, f"{sp_f:.0f}", "COTAS")
    ent += _dim_horizontal(cx2+(bf-1)*sp_f, FRONT_Y, FRONT_X+W, FRONT_Y-8, f"{cf}", "COTAS")
    ent += _dim_vertical(FRONT_X+W, zone_bot_f, zone_top_f, FRONT_X+W+15, f"{ih}", "COTAS")

    ent += _mtext_leader(FRONT_X+W+35, mid_yf, FRONT_X+W, zone_top_f,
                         [f"{bf} Barres O{data.bars_front_diam:.0f}mm", f"O{data.stirrup_diam:.0f} mm"],
                         layer="TEXTO")
    ent += _view_title(FRONT_X + W/2 - 15, FRONT_Y - 25, "VISTA FRONTAL")

    # Cajetín
    ent += _cajetin(FRONT_X + W + 50, FRONT_Y - 25,
                    eid, "Pilar Rectangular", data.notes or "")

    return build_dxf_manual([ent])


def generate_dxf_pillar_circ(data) -> io.BytesIO:
    """
    Pilar circular — Sección en planta + 2 alzados
    """
    R = data.diameter / 2
    cov = data.cover
    nb  = data.bars_count
    r_bar = data.bars_diam / 20
    r_stir = data.bars_diam / 20
    ih  = data.inspection_height
    eid = data.element_id or "PC-01"

    ent = ""

    # ── SECCIÓN EN PLANTA ──
    PX, PY = 0, 0

    # Círculo exterior
    ent += _circle(PX, PY, R, "SECCION")
    # Estribo circular (espiral)
    ent += _circle(PX, PY, R - cov, "ESTRIBOS")

    # Zona picada: media luna inferior-izquierda
    arc_pts = []
    for deg in range(180, 361, 10):
        rad = math.radians(deg)
        arc_pts.append((PX + R*0.85*math.cos(rad), PY + R*0.85*math.sin(rad)))
    ent += _irregular_border(arc_pts, "ZONA_PICADA")

    # Barras longitudinales (distribuidas uniformemente)
    r_arm = R - cov
    for i in range(nb):
        ang = math.radians(360*i/nb + 90)
        bx = PX + r_arm * math.cos(ang)
        by = PY + r_arm * math.sin(ang)
        ent += _bar_section(bx, by, r_bar, "ARMADURA_LONG")

    # Cotas
    ent += _dim_horizontal(PX-R, PY, PX+R, PY-R-15, f"O{data.diameter:.0f}", "COTAS")
    ent += _dim_horizontal(PX-r_arm, PY, PX+r_arm, PY-R-8, f"O{(R-cov)*2:.0f}", "COTAS")
    ent += _mtext_leader(R+30, PY+10, R*0.7, PY+R*0.7,
                         [f"{nb} Barres O{data.bars_diam:.0f}mm",
                          f"Espiral O{data.stirrup_diam:.0f}mm",
                          f"Recub: {cov}cm"], layer="TEXTO")
    ent += _view_title(-15, R+8, "SECCIO EN PLANTA")

    # ── ALZADO (frontal) ──
    AX, AY = -R - 20, -(ih+80)
    VIEW_H = ih + 60
    ent += _rect(AX, AY, data.diameter, VIEW_H, "SECCION")

    mid_a = AY + VIEW_H/2
    zt = mid_a + ih/2
    zb = mid_a - ih/2

    ent += _irregular_zone_border(AX, zt, AX+data.diameter, zt, 1.5, 10, "ZONA_PICADA")
    ent += _irregular_zone_border(AX, zb, AX+data.diameter, zb, 1.5, 10, "ZONA_PICADA")

    # Barras en alzado (todas en la misma altura)
    r_az = R - cov
    for i in range(nb):
        ang = math.radians(360*i/nb + 90)
        bx = AX + R + r_az * math.cos(ang)
        ent += _line(bx, zb-2, bx, zt+2, "ARMADURA_LONG")

    ent += _line(AX, zt, AX+data.diameter, zt, "ESTRIBOS")
    ent += _line(AX, zb, AX+data.diameter, zb, "ESTRIBOS")

    ent += _dim_horizontal(AX, AY, AX+data.diameter, AY-15, f"O{data.diameter:.0f}", "COTAS")
    ent += _dim_vertical(AX+data.diameter, zb, zt, AX+data.diameter+15, f"{ih}", "COTAS")
    ent += _view_title(AX + R - 15, AY-25, "ALZADO")

    ent += _cajetin(AX + data.diameter + 40, AY - 25,
                    eid, "Pilar Circular", data.notes or "")

    return build_dxf_manual([ent])


def generate_dxf_beam(data) -> io.BytesIO:
    """
    Viga rectangular — Sección transversal + Alzado con zona inspeccionada
    """
    W  = data.width
    H  = data.height
    cov = data.cover
    nb_bot = data.bars_bottom_count
    nb_top = data.bars_top_count
    diam_b = data.bars_bottom_diam / 10
    diam_t = data.bars_top_diam / 10
    diam_s = data.stirrup_diam / 10
    sp_s   = data.stirrup_spacing
    il     = data.inspection_length
    eid    = data.element_id or "V-01"

    ent = ""

    # Separaciones barras
    inner_W = W - 2*cov
    sp_bot = inner_W / (nb_bot - 1) if nb_bot > 1 else 0
    sp_top = inner_W / (nb_top - 1) if nb_top > 1 else 0

    # ── SECCIÓN TRANSVERSAL ──
    SX, SY = 0, 0
    ent += _rect(SX, SY, W, H, "SECCION")
    ent += _stirrup_rect(SX+cov-diam_s, SY+cov-diam_s,
                         W-2*(cov-diam_s), H-2*(cov-diam_s), 0.8, "ESTRIBOS")

    # Zona picada (franja derecha de la sección — cara inspeccionada)
    zp = [
        (SX+W*0.45, SY),
        (SX+W*0.52, SY+H*0.12),
        (SX+W*0.58, SY+H*0.30),
        (SX+W*0.60, SY+H*0.55),
        (SX+W*0.55, SY+H*0.75),
        (SX+W*0.48, SY+H*0.90),
        (SX+W*0.45, SY+H),
        (SX+W, SY+H),
        (SX+W, SY),
        (SX+W*0.45, SY),
    ]
    ent += _irregular_border(zp, "ZONA_PICADA")

    # Barras inferiores
    for i in range(nb_bot):
        bx = SX + cov + i * sp_bot
        by = SY + cov
        ent += _bar_section(bx, by, diam_b/2, "ARMADURA_LONG")

    # Barras superiores
    for i in range(nb_top):
        bx = SX + cov + i * sp_top
        by = SY + H - cov
        ent += _bar_section(bx, by, diam_t/2, "ARMADURA_LONG")

    # Cotas sección
    ent += _dim_horizontal(SX, SY, SX+W, SY-15, f"{W}", "COTAS")
    ent += _dim_vertical(SX+W, SY, SY+H, SX+W+15, f"{H}", "COTAS")
    ent += _dim_vertical(SX+W, SY, SY+cov, SX+W+8, f"{cov}", "COTAS")
    ent += _dim_vertical(SX+W, SY+H-cov, SY+H, SX+W+8, f"{cov}", "COTAS")

    ent += _mtext_leader(SX+W+35, SY+cov+5, SX+W, SY+cov,
                         [f"{nb_bot} Barres O{data.bars_bottom_diam:.0f}mm (inf)",
                          f"{nb_top} Barres O{data.bars_top_diam:.0f}mm (sup)",
                          f"Estreps O{data.stirrup_diam:.0f}mm c/{sp_s}cm"], layer="TEXTO")
    ent += _view_title(SX + W/2 - 12, SY+H+8, "SECCIO TRANSVERSAL")

    # ── ALZADO LONGITUDINAL ──
    ALX = W + 40
    ALY = SY

    # Cuerpo viga (longitud = inspection_length + 2*margen)
    margin = H * 0.8
    total_L = il + 2*margin

    ent += _rect(ALX, ALY, total_L, H, "SECCION")

    # Zona picada alzado (franja central)
    ent += _irregular_zone_border(ALX+margin, ALY+H, ALX+margin+il, ALY+H, 2.0, 12, "ZONA_PICADA")
    ent += _irregular_zone_border(ALX+margin, ALY, ALX+margin+il, ALY, 2.0, 12, "ZONA_PICADA")
    ent += _line(ALX+margin, ALY, ALX+margin, ALY+H, "ZONA_PICADA")
    ent += _line(ALX+margin+il, ALY, ALX+margin+il, ALY+H, "ZONA_PICADA")

    # Barras longitudinales (líneas horizontales en alzado)
    ent += _line(ALX, ALY+cov, ALX+total_L, ALY+cov, "ARMADURA_LONG")
    ent += _line(ALX, ALY+H-cov, ALX+total_L, ALY+H-cov, "ARMADURA_LONG")

    # Estribos (líneas verticales con separación)
    n_stirrups = int(total_L / sp_s) + 1
    for i in range(n_stirrups):
        sx = ALX + i * sp_s
        if sx <= ALX + total_L:
            ent += _line(sx, ALY+cov-1, sx, ALY+H-cov+1, "ESTRIBOS")

    # Cotas alzado
    ent += _dim_horizontal(ALX+margin, ALY, ALX+margin+il, ALY-15, f"{il}", "COTAS")
    ent += _dim_horizontal(ALX, ALY, ALX+margin, ALY-8, f"{margin:.0f}", "COTAS")
    ent += _dim_vertical(ALX+total_L, ALY, ALY+H, ALX+total_L+15, f"{H}", "COTAS")

    ent += _view_title(ALX + total_L/2 - 15, ALY+H+8, "ALZAT (ZONA INSPECCIO)")

    ent += _cajetin(ALX + total_L + 20, ALY - 25,
                    eid, "Viga Rectangular", data.notes or "")

    return build_dxf_manual([ent])


def generate_dxf_footing(data) -> io.BytesIO:
    """
    Zapata aislada — Sección en planta + 2 secciones transversales
    """
    L   = data.length
    WW  = data.width
    H   = data.height
    cb  = data.cover_bottom
    cs  = data.cover_sides
    nx  = data.bars_x_count
    ny  = data.bars_y_count
    dx  = data.bars_x_diam / 10
    dy  = data.bars_y_diam / 10
    eid = data.element_id or "Z-01"

    ent = ""

    # Separaciones
    sp_x = (L - 2*cs) / (nx - 1) if nx > 1 else 0
    sp_y = (WW - 2*cs) / (ny - 1) if ny > 1 else 0

    # ── SECCIÓN EN PLANTA ──
    PX, PY = 0, 0
    ent += _rect(PX, PY, L, WW, "SECCION")

    # Zona picada (esquina inferior-izquierda en planta)
    zp_foot = [
        (PX,          PY + WW*0.5),
        (PX + L*0.25, PY + WW*0.75),
        (PX + L*0.5,  PY + WW*0.85),
        (PX + L*0.65, PY + WW),
        (PX,          PY + WW),
        (PX,          PY + WW*0.5),
    ]
    ent += _irregular_border(zp_foot, "ZONA_PICADA")

    # Armadura X (barras en dirección X, paralelas al lado largo)
    for i in range(ny):
        by = PY + cs + i * sp_y
        ent += _line(PX + cs, by, PX + L - cs, by, "ARMADURA_LONG")

    # Armadura Y (barras en dirección Y)
    for i in range(nx):
        bx = PX + cs + i * sp_x
        ent += _line(bx, PY + cs, bx, PY + WW - cs, "ARMADURA_LONG")

    # Cotas planta
    ent += _dim_horizontal(PX, PY, PX+L, PY-15, f"{L}", "COTAS")
    ent += _dim_vertical(PX+L, PY, PY+WW, PX+L+15, f"{WW}", "COTAS")
    ent += _dim_horizontal(PX, PY, PX+cs, PY-8, f"{cs}", "COTAS")
    ent += _dim_horizontal(PX+cs, PY, PX+cs+sp_x, PY-8, f"{sp_x:.0f}", "COTAS")

    ent += _mtext_leader(PX+L+35, PY+WW*0.7, PX+L, PY+WW*0.8,
                         [f"{nx}O{data.bars_x_diam:.0f} dir.X",
                          f"{ny}O{data.bars_y_diam:.0f} dir.Y",
                          f"Recub lat: {cs}cm"], layer="TEXTO")
    ent += _view_title(PX + L/2 - 15, PY+WW+8, "PLANTA ARMADURA")

    # ── SECCIÓN X-X ──
    SXX_X = -10
    SXX_Y = -(H + 60)

    ent += _rect(SXX_X, SXX_Y, L, H, "SECCION")

    # Barras dir-X (sección transversal = puntos)
    for i in range(nx):
        bx = SXX_X + cs + i * sp_x
        by = SXX_Y + cb
        ent += _bar_section(bx, by, dx/2, "ARMADURA_LONG")

    ent += _dim_horizontal(SXX_X, SXX_Y, SXX_X+L, SXX_Y-15, f"{L}", "COTAS")
    ent += _dim_vertical(SXX_X+L, SXX_Y, SXX_Y+H, SXX_X+L+15, f"{H}", "COTAS")
    ent += _dim_vertical(SXX_X+L, SXX_Y, SXX_Y+cb, SXX_X+L+8, f"{cb}", "COTAS")
    ent += _view_title(SXX_X + L/2 - 10, SXX_Y+H+6, "SECCIO X-X")

    # ── SECCIÓN Y-Y ──
    SYY_X = L + 30
    SYY_Y = -(H + 60)

    ent += _rect(SYY_X, SYY_Y, WW, H, "SECCION")

    for i in range(ny):
        bx = SYY_X + cs + i * sp_y
        by = SYY_Y + cb
        ent += _bar_section(bx, by, dy/2, "ARMADURA_LONG")

    ent += _dim_horizontal(SYY_X, SYY_Y, SYY_X+WW, SYY_Y-15, f"{WW}", "COTAS")
    ent += _dim_vertical(SYY_X+WW, SYY_Y, SYY_Y+H, SYY_X+WW+15, f"{H}", "COTAS")
    ent += _view_title(SYY_X + WW/2 - 10, SYY_Y+H+6, "SECCIO Y-Y")

    ent += _cajetin(SYY_X + WW + 20, SYY_Y - 25,
                    eid, "Zapata Aillada", data.notes or "")

    return build_dxf_manual([ent])


def generate_dxf_forjado(data) -> io.BytesIO:
    """Forjado / Losa maciza — Sección transversal + planta armadura"""
    th = data.thickness
    nx = data.bars_x_count
    ny = data.bars_y_count
    dx = data.bars_x_diam / 10
    dy = data.bars_y_diam / 10
    sp_x = data.bars_x_spacing
    sp_y = data.bars_y_spacing
    cb  = data.cover_bottom
    ct  = data.cover_top
    eid = data.element_id or "F-01"
    W_rep = max(nx * sp_x + 20, 120)
    H_rep = max(ny * sp_y + 20, 100)

    ent = ""

    # ── SECCIÓN TRANSVERSAL ──
    SX, SY = 0, 0
    ent += _rect(SX, SY, W_rep, th, "SECCION")
    # Barras inferiores
    for i in range(nx):
        bx = SX + 10 + i * sp_x
        ent += _bar_section(bx, SY + cb, dx/2, "ARMADURA_LONG")
    # Barras superiores
    for i in range(nx):
        bx = SX + 10 + i * sp_x
        ent += _bar_section(bx, SY + th - ct, dx/2, "ARMADURA_LONG")
    # Zona picada
    ent += _irregular_zone_border(SX + W_rep*0.3, SY, SX + W_rep*0.7, SY, 1.0, 8, "ZONA_PICADA")
    ent += _irregular_zone_border(SX + W_rep*0.3, SY+th, SX + W_rep*0.7, SY+th, 1.0, 8, "ZONA_PICADA")
    ent += _line(SX + W_rep*0.3, SY, SX + W_rep*0.3, SY+th, "ZONA_PICADA")
    ent += _line(SX + W_rep*0.7, SY, SX + W_rep*0.7, SY+th, "ZONA_PICADA")

    ent += _dim_horizontal(SX, SY, SX+W_rep, SY-15, f"Rep. {W_rep:.0f}")
    ent += _dim_vertical(SX+W_rep, SY, SY+th, SX+W_rep+12, f"e={th:.0f}")
    ent += _dim_vertical(SX+W_rep, SY, SY+cb, SX+W_rep+6, f"{cb:.0f}")
    ent += _text(SX + W_rep/2, SY+th+10, 3.5, "SECCIO TRANSVERSAL", "TEXTO")

    # ── PLANTA ──
    PLX, PLY = 0, -(H_rep + 40)
    ent += _rect(PLX, PLY, W_rep, H_rep, "SECCION")
    for i in range(nx):
        bx = PLX + 10 + i * sp_x
        ent += _line(bx, PLY+5, bx, PLY+H_rep-5, "ARMADURA_LONG")
    for i in range(ny):
        by = PLY + 10 + i * sp_y
        ent += _line(PLX+5, by, PLX+W_rep-5, by, "ARMADURA_LONG")
    ent += _mtext_leader(PLX+W_rep+20, PLY+H_rep*0.3, PLX+W_rep, PLY+H_rep*0.5,
                         [f"Arm. X: {nx}Ø{data.bars_x_diam:.0f}@{sp_x}cm",
                          f"Arm. Y: {ny}Ø{data.bars_y_diam:.0f}@{sp_y}cm",
                          f"Recub: inf={cb}cm / sup={ct}cm"], layer="TEXTO")
    ent += _text(PLX + W_rep/2, PLY+H_rep+10, 3.5, "PLANTA ARMADURA", "TEXTO")
    ent += _cajetin(PLX+W_rep+20, PLY-25, eid, f"Forjado — {data.forjado_type}", data.notes or "")
    return build_dxf_manual([ent])


def generate_dxf_stair(data) -> io.BytesIO:
    """Escalera / Zanca — Sección longitudinal con peldaños + armadura"""
    riser  = data.riser
    tread  = data.tread
    th     = data.slab_thickness
    wt     = data.wall_thickness
    n      = min(data.steps_count, 12)
    cov    = data.cover
    eid    = data.element_id or "ESC-01"
    d_l    = data.bars_long_diam / 10
    d_t    = data.bars_trans_diam / 10

    ent = ""

    OX, OY = 20, n*riser + th + 20

    # ── ZANCA (losa inclinada) ──
    total_run  = n * tread
    total_rise = n * riser
    # Cara superior
    top = [(OX + i*tread, OY - i*riser) for i in range(n+1)]
    # Cara inferior (paralela, offset th)
    import math
    ang = math.atan2(total_rise, total_run)
    off_x = math.sin(ang) * th
    off_y = math.cos(ang) * th
    bot = [(x + off_x, y + off_y) for (x,y) in top]

    for i in range(len(top)-1):
        ent += _line(top[i][0], top[i][1], top[i+1][0], top[i+1][1], "SECCION")
    for i in range(len(bot)-1):
        ent += _line(bot[i][0], bot[i][1], bot[i+1][0], bot[i+1][1], "SECCION")
    ent += _line(top[0][0], top[0][1], bot[0][0], bot[0][1], "SECCION")
    ent += _line(top[-1][0], top[-1][1], bot[-1][0], bot[-1][1], "SECCION")

    # ── PELDAÑOS ──
    for i in range(n):
        px = OX + i*tread
        py = OY - i*riser
        # Pared vertical del peldaño (espesor wt)
        ent += _line(px, py, px, py-riser, "SECCION")
        ent += _line(px, py-riser, px+wt, py-riser, "SECCION")
        # Relleno peldaño (zona picada en el peldaño inspeccionado)
        if i == n//2:
            zp_pts = [
                (px, py), (px+tread, py), (px+tread, py-riser),
                (px+wt, py-riser), (px+wt+2, py-riser+3),
                (px+4, py-2), (px, py)
            ]
            ent += _irregular_border(zp_pts, "ZONA_PICADA")

    # ── ARMADURA LONGITUDINAL (línea paralela a la zanca) ──
    ang_cos, ang_sin = math.cos(ang), math.sin(ang)
    for layer_offset in [cov, th-cov]:
        ox2 = off_x * layer_offset/th
        oy2 = off_y * layer_offset/th
        x1 = top[0][0]+ox2+cov*ang_cos; y1 = top[0][1]+oy2-cov*ang_sin
        x2 = top[-1][0]+ox2-cov*ang_cos; y2 = top[-1][1]+oy2+cov*ang_sin
        ent += _line(x1, y1, x2, y2, "ARMADURA_LONG")
        # Marcas de barra
        for i in range(0, n+1, 2):
            bx = top[i][0]+ox2; by = top[i][1]+oy2
            ent += _circle(bx, by, d_l/2, "ARMADURA_LONG")

    # ── COTAS ──
    ent += _dim_horizontal(OX, OY+5, OX+tread, OY+5, f"{tread:.1f}")
    ent += _dim_vertical(OX-8, OY-riser, OY, OX-8, f"{riser:.1f}")
    ent += _dim_vertical(top[-1][0]+5, top[-1][1], top[-1][1]+th, top[-1][0]+5+12, f"{th:.0f}")

    ent += _mtext_leader(OX+total_run+30, OY-total_rise/2, OX+total_run, OY-total_rise/2,
                         [f"Arm. long: Ø{data.bars_long_diam:.0f}@{data.bars_long_sep}cm",
                          f"Arm. trans: Ø{data.bars_trans_diam:.0f}@{data.bars_trans_sep}cm",
                          f"Recub: {cov}cm",
                          f"Relleno peld: {data.relleno_type}"], layer="TEXTO")
    if data.depth_no_rebar:
        ent += _text(OX+total_run/2, OY-total_rise-15, 2.5,
                     f"ATENCION: sin armadura hasta -{data.depth_no_rebar}cm", "TEXTO")

    ent += _text(OX + total_run/2, OY + 20, 3.5, "SECCIO LONGITUDINAL — ZANCA", "TEXTO")
    ent += _cajetin(OX+total_run+30, OY-total_rise-30,
                    eid, "Escalera / Zanca", data.notes or "")
    return build_dxf_manual([ent])
