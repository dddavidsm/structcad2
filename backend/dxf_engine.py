"""
dxf_engine.py â€” Motor DXF con librerÃ­a oficial ezdxf
=====================================================
Genera DXF R2000 (AC1015) usando ezdxf.
Toda la lÃ³gica matemÃ¡tica/de coordenadas es idÃ©ntica a la versiÃ³n anterior.
Se elimina DXFDoc manual y se usa la API nativa de ezdxf.
"""

import io
import math
from typing import List, Tuple, Optional

import ezdxf
from ezdxf.enums import TextEntityAlignment

# â”€â”€â”€ CAPAS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# (nombre, color_ACI, lineweight_1/100mm)
LAYER_DEFS = {
    "SECCION":       (7,  50),
    "ZONA_PICADA":   (30, 18),
    "ARMADURA_LONG": (5,  70),
    "ESTRIBOS":      (3,  35),
    "COTAS":         (2,  13),
    "TEXTO":         (7,  13),
    "CAJETIN":       (8,  18),
    "ZONA_FILL":     (30,  0),
}

# Valores de grosor de lÃ­nea vÃ¡lidos en DXF (1/100 mm)
_VALID_LW = (-3, -2, -1, 0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50,
              53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211)

def _nearest_lw(lw: int) -> int:
    return min(_VALID_LW, key=lambda v: abs(v - lw))

def _make_doc():
    """Crea documento DXF R2000 con capas estÃ¡ndar. Devuelve (doc, msp)."""
    doc = ezdxf.new("R2000")
    doc.header["$INSUNITS"] = 5   # centÃ­metros
    doc.header["$MEASUREMENT"] = 1  # sistema mÃ©trico
    for name, (color, lw) in LAYER_DEFS.items():
        doc.layers.add(name, dxfattribs={"color": color, "lineweight": _nearest_lw(lw)})
    return doc, doc.modelspace()

def _buf(doc) -> io.BytesIO:
    buf = io.BytesIO()
    doc.write(buf)
    buf.seek(0)
    return buf


# â”€â”€â”€ PRIMITIVOS DE DIBUJO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _L(msp, x1, y1, x2, y2, layer="SECCION", lw=None):
    """LÃ­nea."""
    att = {"layer": layer}
    if lw is not None:
        att["lineweight"] = _nearest_lw(int(lw))
    msp.add_line((x1, y1), (x2, y2), dxfattribs=att)

def _C(msp, cx, cy, r, layer="SECCION", lw=None):
    """CÃ­rculo."""
    att = {"layer": layer}
    if lw is not None:
        att["lineweight"] = _nearest_lw(int(lw))
    msp.add_circle((cx, cy), r, dxfattribs=att)

def _A(msp, cx, cy, r, start_angle, end_angle, layer="SECCION"):
    """Arco (Ã¡ngulos en grados, sentido antihorario)."""
    msp.add_arc((cx, cy), r, start_angle, end_angle, dxfattribs={"layer": layer})

def _P(msp, pts: List[Tuple[float, float]], layer="SECCION",
       closed=False, lw=None):
    """LWPOLYLINE."""
    att = {"layer": layer, "closed": 1 if closed else 0}
    if lw is not None:
        att["lineweight"] = _nearest_lw(int(lw))
    msp.add_lwpolyline(pts, dxfattribs=att)

def _FC(msp, cx, cy, r, layer="ARMADURA_LONG"):
    """CÃ­rculo relleno: hatch sÃ³lido + contorno."""
    hatch = msp.add_hatch(dxfattribs={"layer": layer})
    hatch.set_solid_fill()
    pts = [
        (cx + r * math.cos(math.radians(a)),
         cy + r * math.sin(math.radians(a)))
        for a in range(0, 360, 10)
    ]
    hatch.paths.add_polyline_path(pts, is_closed=True)
    _C(msp, cx, cy, r, layer, lw=25)

def _T(msp, x, y, h, content, layer="TEXTO", h_align=1, angle=0.0):
    """Texto con alineaciÃ³n horizontal."""
    text = msp.add_text(
        str(content),
        dxfattribs={"layer": layer, "height": float(h), "rotation": float(angle)},
    )
    if h_align == 0:
        text.set_placement((x, y), align=TextEntityAlignment.LEFT)
    elif h_align == 2:
        text.set_placement((x, y), align=TextEntityAlignment.RIGHT)
    else:
        text.set_placement((x, y), align=TextEntityAlignment.CENTER)


# â”€â”€â”€ COMPUESTOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _rect(msp, x, y, w, h, layer="SECCION", lw=None):
    _P(msp, [(x, y), (x+w, y), (x+w, y+h), (x, y+h)],
       layer=layer, closed=True, lw=lw)

def _stirrup_rect(msp, x, y, w, h, r_corner, layer="ESTRIBOS"):
    rc = r_corner
    _L(msp, x+rc,   y,      x+w-rc, y,      layer)
    _L(msp, x+w,    y+rc,   x+w,    y+h-rc, layer)
    _L(msp, x+w-rc, y+h,    x+rc,   y+h,    layer)
    _L(msp, x,      y+h-rc, x,      y+rc,   layer)
    _A(msp, x+rc,   y+rc,   rc, 180, 270, layer)
    _A(msp, x+w-rc, y+rc,   rc, 270, 360, layer)
    _A(msp, x+w-rc, y+h-rc, rc,   0,  90, layer)
    _A(msp, x+rc,   y+h-rc, rc,  90, 180, layer)

def _bar_elevation(msp, x, y_bot, y_top, diam_mm, layer="ARMADURA_LONG"):
    lw = max(25, min(200, int(diam_mm * 8)))
    _L(msp, x, y_bot, x, y_top, layer, lw=lw)

def _stirrup_elevation(msp, x1, y, x2, layer="ESTRIBOS"):
    _L(msp, x1, y, x2, y, layer, lw=35)

def _zona_picada_boundary(msp, pts: List[Tuple[float, float]],
                           layer="ZONA_PICADA"):
    if len(pts) < 2:
        return
    msp.add_lwpolyline(
        pts,
        dxfattribs={"layer": layer, "closed": 0, "lineweight": _nearest_lw(18)},
    )

def _dim_h(msp, x1, x2, y_ref, y_base, label, layer="COTAS", h=2.2):
    """Cota horizontal: lÃ­neas de extensiÃ³n + cota + flechas + texto."""
    _L(msp, x1, y_base, x1, y_ref, layer)
    _L(msp, x2, y_base, x2, y_ref, layer)
    _L(msp, x1, y_ref,  x2, y_ref, layer)
    a = 1.2
    _L(msp, x1, y_ref, x1+a*2, y_ref+a*0.7, layer)
    _L(msp, x1, y_ref, x1+a*2, y_ref-a*0.7, layer)
    _L(msp, x2, y_ref, x2-a*2, y_ref+a*0.7, layer)
    _L(msp, x2, y_ref, x2-a*2, y_ref-a*0.7, layer)
    mx = (x1 + x2) / 2
    _T(msp, mx, y_ref + h*0.6, h, str(label), layer, h_align=1)

def _dim_v(msp, y1, y2, x_ref, x_base, label, layer="COTAS", h=2.2):
    """Cota vertical."""
    _L(msp, x_base, y1, x_ref, y1, layer)
    _L(msp, x_base, y2, x_ref, y2, layer)
    _L(msp, x_ref,  y1, x_ref, y2, layer)
    a = 1.2
    _L(msp, x_ref, y1, x_ref+a*0.7, y1+a*2, layer)
    _L(msp, x_ref, y1, x_ref-a*0.7, y1+a*2, layer)
    _L(msp, x_ref, y2, x_ref+a*0.7, y2-a*2, layer)
    _L(msp, x_ref, y2, x_ref-a*0.7, y2-a*2, layer)
    my = (y1 + y2) / 2
    _T(msp, x_ref + h*0.6, my, h, str(label), layer, h_align=0, angle=90.0)

def _label_arrow(msp, x_tip, y_tip, x_text, y_text, lines,
                  layer="TEXTO", h=2.5):
    _L(msp, x_tip, y_tip, x_text, y_text, layer)
    dx = x_text - x_tip; dy = y_text - y_tip
    lng = math.sqrt(dx*dx + dy*dy) or 1
    ux = dx/lng; uy = dy/lng; px = -uy; py = ux
    a = 1.5
    _L(msp, x_tip, y_tip, x_tip+ux*a*2+px*a*0.6, y_tip+uy*a*2+py*a*0.6, layer)
    _L(msp, x_tip, y_tip, x_tip+ux*a*2-px*a*0.6, y_tip+uy*a*2-py*a*0.6, layer)
    for i, line in enumerate(lines):
        _T(msp, x_text, y_text + i*h*1.4, h, line, layer, h_align=0)

def _title(msp, x, y, txt, layer="TEXTO", h=3.5):
    _T(msp, x, y, h, txt, layer, h_align=1)
    _L(msp, x - len(txt)*h*0.35, y-1, x + len(txt)*h*0.35, y-1, layer)

def _cajetin(msp, x, y, data: dict, w=90, h=22):
    _rect(msp, x, y, w, h, "CAJETIN")
    _L(msp, x, y+h*0.6, x+w, y+h*0.6, "CAJETIN")
    _L(msp, x+w*0.45, y, x+w*0.45, y+h*0.6, "CAJETIN")
    _T(msp, x+w/2, y+h*0.8, 3.2, data.get("empresa", "StructCAD Pro"), "CAJETIN", 1)
    _T(msp, x+3, y+h*0.35, 2.2, f"Obra: {data.get('obra','â€”')}", "CAJETIN", 0)
    _T(msp, x+3, y+h*0.18, 1.9,
       f"Elem: {data.get('ref','â€”')}  |  Planta: {data.get('planta','â€”')}  |  Eje: {data.get('eje','â€”')}",
       "CAJETIN", 0)
    _T(msp, x+w*0.47, y+h*0.35, 2.2, f"Escala: {data.get('escala','1:20')}", "CAJETIN", 0)
    _T(msp, x+w*0.47, y+h*0.18, 1.9,
       f"Fecha: {data.get('fecha','â€”')}  |  TÃ©cnico: {data.get('tecnico','â€”')}",
       "CAJETIN", 0)
    notes = data.get("notes", "")
    if notes:
        _T(msp, x+3, y-4, 1.9, f"Obs: {notes[:80]}", "CAJETIN", 0)


# â”€â”€â”€ HELPERS GEOMÃ‰TRICOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _irregular_border_pts(x0, y0, x1, y1, amplitude=2.0, steps=10):
    """Borde irregular reproducible (seed fija)."""
    import random
    rng = random.Random(hash(f"{x0}{y0}{x1}{y1}") & 0xFFFF)
    pts = []
    for i in range(steps + 1):
        t = i / steps
        x = x0 + t*(x1 - x0)
        y = y0 + t*(y1 - y0)
        if 0 < i < steps:
            y += rng.uniform(-amplitude, amplitude)
        pts.append((x, y))
    return pts

def _notch_pts_symmetric(ox, oy, w, h_notch, notch_w, gap):
    return [
        (ox,                  oy),
        (ox,                  oy + h_notch),
        (ox + notch_w,        oy + h_notch),
        (ox + notch_w,        oy),
        (ox + notch_w + gap,  oy),
        (ox + notch_w + gap,  oy + h_notch),
        (ox + w,              oy + h_notch),
        (ox + w,              oy),
    ]

def _cajetin_data(data) -> dict:
    return {
        "empresa": "StructCAD Pro â€” InspecciÃ³n Estructural",
        "obra":    getattr(data, "obra_nombre", "â€”") or "â€”",
        "ref":     getattr(data, "element_id",  "E-01") or "E-01",
        "planta":  getattr(data, "planta",       "â€”") or "â€”",
        "eje":     getattr(data, "eje",           "â€”") or "â€”",
        "fecha":   getattr(data, "fecha_insp",   "â€”") or "â€”",
        "tecnico": getattr(data, "tecnico",       "â€”") or "â€”",
        "escala":  "1:20",
        "notes":   getattr(data, "notes",         "") or "",
    }


# â”€â”€â”€ GENERADORES POR ESTRUCTURA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def generate_dxf_pillar_rect(data) -> io.BytesIO:
    """Pilar rectangular â€” secciÃ³n en planta + vista lateral + vista frontal."""
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

    sp_f = (W - 2*cf) / (nbf - 1) if nbf > 1 else 0
    sp_l = (D - 2*cl) / (nbl - 1) if nbl > 1 else 0
    r_f  = df / 20
    r_l  = dl / 20

    doc, msp = _make_doc()

    # â”€â”€ SecciÃ³n en planta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    PX, PY = 0.0, 0.0
    _rect(msp, PX, PY, W, D, "SECCION", lw=70)

    zp_top_y  = D * 0.48
    zp_right_x = W * 0.68
    zp_border = (
        [(PX, PY + zp_top_y)]
        + _irregular_border_pts(PX, PY+zp_top_y, PX+W*0.25, PY+D*0.72, 1.5, 4)
        + _irregular_border_pts(PX+W*0.25, PY+D*0.72, PX+zp_right_x, PY+D*0.88, 1.5, 4)
        + _irregular_border_pts(PX+zp_right_x, PY+D*0.88, PX+zp_right_x, PY+D, 1.0, 3)
        + [(PX+zp_right_x, PY+D), (PX, PY+D), (PX, PY+zp_top_y)]
    )
    _zona_picada_boundary(msp, zp_border[:-1])

    _stirrup_rect(msp, PX+cf-ds/10, PY+cl-ds/10,
                  W - 2*(cf-ds/10), D - 2*(cl-ds/10), 0.8)

    bx_lat  = PX + cl
    for i in range(nbl):
        by = PY + cl + i * sp_l
        _FC(msp, bx_lat, by, r_l)

    by_front = PY + cf
    for i in range(nbf):
        bx = PX + cf + i * sp_f
        _FC(msp, bx, by_front, r_f)

    _dim_h(msp, PX, PX+W, PY-14, PY, str(int(W)))
    _dim_h(msp, PX, PX+cf, PY-8, PY, str(int(cf)))
    pos = PX + cf
    for i in range(nbf - 1):
        _dim_h(msp, pos, pos+sp_f, PY-8, PY, f"{sp_f:.0f}")
        pos += sp_f
    _dim_h(msp, pos, PX+W, PY-8, PY, str(int(cf)))

    _dim_v(msp, PY, PY+D, PX+W+14, PX+W, str(int(D)))
    _dim_v(msp, PY, PY+cl, PX+W+8, PX+W, str(int(cl)))
    pos = PY + cl
    for i in range(nbl - 1):
        _dim_v(msp, pos, pos+sp_l, PX+W+8, PX+W, f"{sp_l:.0f}")
        pos += sp_l
    _dim_v(msp, pos, PY+D, PX+W+8, PX+W, str(int(cl)))

    _label_arrow(msp, bx_lat, PY+D-cl, PX+W+35, PY+D,
                 [f"Ã˜{ds:.0f} mm", f"{nbl} Barres Ã˜{dl:.0f}mm"])
    _label_arrow(msp, PX+cf+sp_f, by_front, PX+W+35, PY+5,
                 [f"{nbf} Barres Ã˜{df:.0f}mm", f"Ã˜{ds:.0f} mm"])
    _T(msp, PX-18, PY+D/2, 2.8, "LATERAL", "TEXTO", h_align=1, angle=90)
    _T(msp, PX+W/2, PY-26, 2.8, "FRONTAL", "TEXTO", h_align=1)
    _title(msp, PX+W/2, PY+D+8, "SECCIO EN PLANTA")

    # â”€â”€ Vista lateral â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    VIEW_H = ih + 65
    NOTCH  = 12
    NW     = D * 0.30
    GAP    = D - 2*NW

    LAT_X = -15.0
    LAT_Y = -(VIEW_H + 55)

    _rect(msp, LAT_X, LAT_Y, D, VIEW_H, "SECCION", lw=70)
    top_y = LAT_Y + VIEW_H
    _P(msp, _notch_pts_symmetric(LAT_X, top_y, D, NOTCH, NW, GAP),
       "SECCION", lw=50)
    _P(msp, _notch_pts_symmetric(LAT_X, LAT_Y, D, -NOTCH, NW, GAP),
       "SECCION", lw=50)

    mid_y_l = LAT_Y + VIEW_H / 2
    zt_l    = mid_y_l + ih / 2
    zb_l    = mid_y_l - ih / 2
    _zona_picada_boundary(msp, _irregular_border_pts(LAT_X, zt_l, LAT_X+D, zt_l, 1.8, 10))
    _zona_picada_boundary(msp, _irregular_border_pts(LAT_X, zb_l, LAT_X+D, zb_l, 1.8, 10))
    _L(msp, LAT_X,   zb_l, LAT_X,   zt_l, "ZONA_PICADA")
    _L(msp, LAT_X+D, zb_l, LAT_X+D, zt_l, "ZONA_PICADA")

    for i in range(nbl):
        bx = LAT_X + cl + i * sp_l
        _bar_elevation(msp, bx, zb_l-1.5, zt_l+1.5, dl)

    _stirrup_elevation(msp, LAT_X, zt_l, LAT_X+D)
    _stirrup_elevation(msp, LAT_X, zb_l, LAT_X+D)

    _dim_h(msp, LAT_X, LAT_X+D, LAT_Y-14, LAT_Y, str(int(D)))
    _dim_h(msp, LAT_X, LAT_X+cl, LAT_Y-8, LAT_Y, str(int(cl)))
    pos = LAT_X + cl
    for i in range(nbl - 1):
        _dim_h(msp, pos, pos+sp_l, LAT_Y-8, LAT_Y, f"{sp_l:.0f}")
        pos += sp_l
    _dim_h(msp, pos, LAT_X+D, LAT_Y-8, LAT_Y, str(int(cl)))
    _dim_v(msp, zb_l, zt_l, LAT_X+D+14, LAT_X+D, str(int(ih)))

    _label_arrow(msp, LAT_X, mid_y_l, LAT_X-35, mid_y_l+5,
                 [f"{nbl} Barres Ã˜{dl:.0f}mm", f"Ã˜{ds:.0f} mm"])
    _title(msp, LAT_X+D/2, LAT_Y-26, "VISTA LATERAL")

    # â”€â”€ Vista frontal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    FRONT_X = D + 35.0
    FRONT_Y = LAT_Y

    _rect(msp, FRONT_X, FRONT_Y, W, VIEW_H, "SECCION", lw=70)

    FNW  = W * 0.22
    FGAP = W * 0.25
    top_y_f = FRONT_Y + VIEW_H
    _P(msp, [
        (FRONT_X,         top_y_f),
        (FRONT_X,         top_y_f+NOTCH),
        (FRONT_X+FNW,     top_y_f+NOTCH),
        (FRONT_X+FNW,     top_y_f),
        (FRONT_X+FNW+FGAP, top_y_f),
        (FRONT_X+FNW+FGAP, top_y_f+NOTCH),
        (FRONT_X+W-FNW,   top_y_f+NOTCH),
        (FRONT_X+W-FNW,   top_y_f),
        (FRONT_X+W,       top_y_f),
    ], "SECCION", lw=50)
    _P(msp, [
        (FRONT_X,         FRONT_Y),
        (FRONT_X,         FRONT_Y-NOTCH),
        (FRONT_X+FNW,     FRONT_Y-NOTCH),
        (FRONT_X+FNW,     FRONT_Y),
        (FRONT_X+FNW+FGAP, FRONT_Y),
        (FRONT_X+FNW+FGAP, FRONT_Y-NOTCH),
        (FRONT_X+W-FNW,   FRONT_Y-NOTCH),
        (FRONT_X+W-FNW,   FRONT_Y),
        (FRONT_X+W,       FRONT_Y),
    ], "SECCION", lw=50)

    mid_y_f = FRONT_Y + VIEW_H / 2
    zt_f    = mid_y_f + ih / 2
    zb_f    = mid_y_f - ih / 2
    _zona_picada_boundary(msp, _irregular_border_pts(FRONT_X, zt_f, FRONT_X+W, zt_f, 2.0, 14))
    _zona_picada_boundary(msp, _irregular_border_pts(FRONT_X, zb_f, FRONT_X+W, zb_f, 2.0, 14))
    _L(msp, FRONT_X,   zb_f, FRONT_X,   zt_f, "ZONA_PICADA")
    _L(msp, FRONT_X+W, zb_f, FRONT_X+W, zt_f, "ZONA_PICADA")

    for i in range(nbf):
        bx = FRONT_X + cf + i * sp_f
        _bar_elevation(msp, bx, zb_f-1.5, zt_f+1.5, df)

    _stirrup_elevation(msp, FRONT_X, zt_f, FRONT_X+W)
    _stirrup_elevation(msp, FRONT_X, zb_f, FRONT_X+W)

    _dim_h(msp, FRONT_X, FRONT_X+W, FRONT_Y-14, FRONT_Y, str(int(W)))
    _dim_h(msp, FRONT_X, FRONT_X+cf, FRONT_Y-8, FRONT_Y, str(int(cf)))
    pos = FRONT_X + cf
    for i in range(nbf - 1):
        _dim_h(msp, pos, pos+sp_f, FRONT_Y-8, FRONT_Y, f"{sp_f:.0f}")
        pos += sp_f
    _dim_h(msp, pos, FRONT_X+W, FRONT_Y-8, FRONT_Y, str(int(cf)))
    _dim_v(msp, zb_f, zt_f, FRONT_X+W+14, FRONT_X+W, str(int(ih)))

    _label_arrow(msp, FRONT_X+W, zt_f-ih*0.3, FRONT_X+W+35, zt_f+5,
                 [f"{nbf} Barres Ã˜{df:.0f}mm", f"Ã˜{ds:.0f} mm"])
    _title(msp, FRONT_X+W/2, FRONT_Y-26, "VISTA FRONTAL")

    caj_x = FRONT_X + W + 50
    caj_y = FRONT_Y - 28
    _cajetin(msp, caj_x, caj_y, _cajetin_data(data))

    return _buf(doc)


def generate_dxf_pillar_circ(data) -> io.BytesIO:
    diam = float(data.diameter)
    R    = diam / 2
    cov  = float(data.cover)
    nb   = int(data.bars_count)
    db   = float(data.bars_diam)
    ds   = float(data.stirrup_diam)
    ih   = float(data.inspection_height)
    r_b  = db / 20

    doc, msp = _make_doc()

    # SecciÃ³n en planta
    _C(msp, 0, 0, R, "SECCION", lw=70)
    _C(msp, 0, 0, R - cov, "ESTRIBOS")
    for i in range(nb):
        ang = math.radians(360*i/nb + 90)
        bx = (R - cov) * math.cos(ang)
        by = (R - cov) * math.sin(ang)
        _FC(msp, bx, by, r_b)

    zp_pts = [
        (R * 0.88 * math.cos(math.radians(deg)),
         R * 0.88 * math.sin(math.radians(deg)))
        for deg in range(180, 361, 8)
    ]
    _zona_picada_boundary(msp, zp_pts)

    _dim_h(msp, -R, R, -R-14, -R, f"Ã˜{diam:.0f}")
    _label_arrow(msp, R*0.7, R*0.7, R+30, R*0.8,
                 [f"{nb} Barres Ã˜{db:.0f}mm",
                  f"Espiral Ã˜{ds:.0f}mm",
                  f"Recub: {cov}cm"])
    _title(msp, 0, R+8, "SECCIO EN PLANTA")

    # Alzado
    AX = -R - 20
    AY = -(ih + 75)
    VH = ih + 65
    _rect(msp, AX, AY, diam, VH, "SECCION", lw=70)
    mid_ya = AY + VH / 2
    zt_a = mid_ya + ih / 2
    zb_a = mid_ya - ih / 2
    _zona_picada_boundary(msp, _irregular_border_pts(AX, zt_a, AX+diam, zt_a, 1.5, 10))
    _zona_picada_boundary(msp, _irregular_border_pts(AX, zb_a, AX+diam, zb_a, 1.5, 10))

    for i in range(nb):
        ang = math.radians(360*i/nb + 90)
        bx  = AX + R + (R - cov) * math.cos(ang)
        _bar_elevation(msp, bx, zb_a-1.5, zt_a+1.5, db)

    _stirrup_elevation(msp, AX, zt_a, AX+diam)
    _stirrup_elevation(msp, AX, zb_a, AX+diam)
    _dim_h(msp, AX, AX+diam, AY-14, AY, f"Ã˜{diam:.0f}")
    _dim_v(msp, zb_a, zt_a, AX+diam+14, AX+diam, str(int(ih)))
    _cajetin(msp, AX+diam+50, AY-28, _cajetin_data(data))
    _title(msp, AX+R, AY-26, "ALZAT")

    return _buf(doc)


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

    sp_bot = (W - 2*cov) / (nbb - 1) if nbb > 1 else 0
    sp_top = (W - 2*cov) / (nbt - 1) if nbt > 1 else 0

    doc, msp = _make_doc()

    # SecciÃ³n transversal
    _rect(msp, 0, 0, W, H, "SECCION", lw=70)
    _stirrup_rect(msp, cov-ds/10, cov-ds/10, W-2*(cov-ds/10), H-2*(cov-ds/10), 0.6)
    for i in range(nbb):
        _FC(msp, cov + i*sp_bot, cov, dbb/20)
    for i in range(nbt):
        _FC(msp, cov + i*sp_top, H - cov, dbt/20)

    zp_sec = (
        _irregular_border_pts(W*0.45, 0, W, 0, 0.8, 4)
        + [(W, H)]
        + list(reversed(_irregular_border_pts(W*0.45, H, W, H, 0.8, 4)))
        + [(W*0.45, H), (W*0.45, 0)]
    )
    _zona_picada_boundary(msp, zp_sec[:-1])

    _dim_h(msp, 0, W, -14, 0, str(int(W)))
    _dim_h(msp, 0, cov, -8, 0, str(int(cov)))
    if nbb > 1:
        _dim_h(msp, cov, cov+sp_bot, -8, 0, f"{sp_bot:.0f}")
    _dim_v(msp, 0, H, W+14, W, str(int(H)))
    _dim_v(msp, 0, cov, W+8, W, str(int(cov)))
    _label_arrow(msp, W, cov, W+35, 5,
                 [f"{nbb}Ã˜{dbb:.0f} inf.", f"{nbt}Ã˜{dbt:.0f} sup.",
                  f"Estreps Ã˜{ds:.0f}@{sp_s:.0f}cm"])
    _title(msp, W/2, H+8, "SECCIO TRANSVERSAL")

    # Alzado longitudinal
    mg = H * 0.8
    TL = il + 2*mg
    AX = W + 40
    AY = 0.0
    _rect(msp, AX, AY, TL, H, "SECCION", lw=70)
    _zona_picada_boundary(msp, _irregular_border_pts(AX+mg, AY+H, AX+mg+il, AY+H, 2.0, 12))
    _zona_picada_boundary(msp, _irregular_border_pts(AX+mg, AY, AX+mg+il, AY, 2.0, 12))
    _L(msp, AX+mg, AY, AX+mg, AY+H, "ZONA_PICADA")
    _L(msp, AX+mg+il, AY, AX+mg+il, AY+H, "ZONA_PICADA")

    _L(msp, AX, AY+cov, AX+TL, AY+cov, "ARMADURA_LONG", lw=int(dbb*8))
    _L(msp, AX, AY+H-cov, AX+TL, AY+H-cov, "ARMADURA_LONG", lw=int(dbt*8))

    ns = int(TL / sp_s) + 1
    for i in range(ns):
        sx = AX + i * sp_s
        if sx <= AX + TL:
            _L(msp, sx, AY+cov-1, sx, AY+H-cov+1, "ESTRIBOS")

    _dim_h(msp, AX+mg, AX+mg+il, AY-14, AY, str(int(il)))
    _dim_v(msp, AY, AY+H, AX+TL+14, AX+TL, str(int(H)))
    _title(msp, AX+TL/2, AY+H+8, "ALZAT (ZONA INSPECCIO)")
    _cajetin(msp, AX+TL+20, AY-28, _cajetin_data(data))

    return _buf(doc)


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
    pw  = float(getattr(data, "pedestal_w", 40) or 40)
    pd  = float(getattr(data, "pedestal_d", 40) or 40)

    sp_x = (L  - 2*cs) / (nx - 1) if nx > 1 else 0
    sp_y = (WW - 2*cs) / (ny - 1) if ny > 1 else 0

    doc, msp = _make_doc()

    # Planta armadura
    _rect(msp, 0, 0, L, WW, "SECCION", lw=70)
    _rect(msp, (L-pw)/2, (WW-pd)/2, pw, pd, "SECCION", lw=35)
    for i in range(nx):
        bx = cs + i * sp_x
        _L(msp, bx, cs, bx, WW-cs, "ARMADURA_LONG", lw=int(dx*7))
    for i in range(ny):
        by = cs + i * sp_y
        _L(msp, cs, by, L-cs, by, "ARMADURA_LONG", lw=int(dy*7))

    zp = ([(0, WW*0.5)]
          + _irregular_border_pts(0, WW*0.5, L*0.55, WW, 1.5, 6)
          + [(L*0.55, WW), (0, WW), (0, WW*0.5)])
    _zona_picada_boundary(msp, zp)

    _dim_h(msp, 0, L, -14, 0, str(int(L)))
    _dim_h(msp, 0, cs, -8, 0, str(int(cs)))
    if nx > 1:
        _dim_h(msp, cs, cs+sp_x, -8, 0, f"{sp_x:.0f}")
    _dim_v(msp, 0, WW, L+14, L, str(int(WW)))
    _label_arrow(msp, L*0.8, WW*0.8, L+35, WW*0.7,
                 [f"{nx}Ã˜{dx:.0f} dir.X", f"{ny}Ã˜{dy:.0f} dir.Y",
                  f"Recub lat:{cs}cm / inf:{cb}cm"])
    _title(msp, L/2, WW+8, "PLANTA ARMADURA")

    # SecciÃ³n X-X
    SXX, SXY = 0.0, -(H + 50)
    _rect(msp, SXX, SXY, L, H, "SECCION", lw=70)
    for i in range(nx):
        bx = SXX + cs + i * sp_x
        _FC(msp, bx, SXY+cb, dx/20)
    _dim_h(msp, SXX, SXX+L, SXY-14, SXY, str(int(L)))
    _dim_v(msp, SXY, SXY+H, SXX+L+14, SXX+L, str(int(H)))
    _dim_v(msp, SXY, SXY+cb, SXX+L+8, SXX+L, str(int(cb)))
    _title(msp, SXX+L/2, SXY+H+8, "SECCIO X-X")

    # SecciÃ³n Y-Y
    SYX = L + 30
    SYY = SXY
    _rect(msp, SYX, SYY, WW, H, "SECCION", lw=70)
    for i in range(ny):
        bx = SYX + cs + i * sp_y
        _FC(msp, bx, SYY+cb, dy/20)
    _dim_h(msp, SYX, SYX+WW, SYY-14, SYY, str(int(WW)))
    _dim_v(msp, SYY, SYY+H, SYX+WW+14, SYX+WW, str(int(H)))
    _title(msp, SYX+WW/2, SYY+H+8, "SECCIO Y-Y")

    _cajetin(msp, SYX+WW+20, SYY-28, _cajetin_data(data))

    return _buf(doc)


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

    WR = max(nx * spx + 20, 120)
    HR = max(ny * spy + 20, 100)

    doc, msp = _make_doc()

    # SecciÃ³n transversal
    _rect(msp, 0, 0, WR, th, "SECCION", lw=70)
    for i in range(nx):
        bx = 10 + i * spx
        _FC(msp, bx, cb, dx/20)
        _FC(msp, bx, th-ct, dx/20)
    _zona_picada_boundary(
        msp,
        _irregular_border_pts(WR*0.3, 0, WR*0.7, 0, 0.8, 6)
        + [(WR*0.7, th)]
        + list(reversed(_irregular_border_pts(WR*0.3, th, WR*0.7, th, 0.8, 6)))
        + [(WR*0.3, 0)],
    )
    _dim_h(msp, 0, WR, -14, 0, f"Repres. {WR:.0f}")
    _dim_v(msp, 0, th, WR+12, WR, f"e={th:.0f}")
    _title(msp, WR/2, th+8, "SECCIO TRANSVERSAL")

    # Planta
    PLX, PLY = 0.0, -(HR + 40)
    _rect(msp, PLX, PLY, WR, HR, "SECCION", lw=70)
    for i in range(nx):
        bx = PLX + 10 + i * spx
        _L(msp, bx, PLY+5, bx, PLY+HR-5, "ARMADURA_LONG", lw=int(dx*7))
    for i in range(ny):
        by = PLY + 10 + i * spy
        _L(msp, PLX+5, by, PLX+WR-5, by, "ARMADURA_LONG", lw=int(dy*7))
    _label_arrow(msp, PLX+WR, PLY+HR*0.6, PLX+WR+30, PLY+HR*0.7,
                 [f"X: {nx}Ã˜{dx:.0f}@{spx}cm",
                  f"Y: {ny}Ã˜{dy:.0f}@{spy}cm",
                  f"Recub: inf={cb} / sup={ct}cm"])
    _title(msp, PLX+WR/2, PLY+HR+8, "PLANTA ARMADURA")
    _cajetin(msp, PLX+WR+30, PLY-28, _cajetin_data(data))

    return _buf(doc)


def generate_dxf_stair(data) -> io.BytesIO:
    riser = float(data.riser)
    tread = float(data.tread)
    th    = float(data.slab_thickness)
    wt    = float(getattr(data, "wall_thickness", 6.5) or 6.5)
    n     = min(int(data.steps_count), 12)
    cov   = float(data.cover)
    dl    = float(data.bars_long_diam)
    dt    = float(data.bars_trans_diam)
    sl    = float(data.bars_long_sep)
    st    = float(data.bars_trans_sep)

    ang   = math.atan2(n * riser, n * tread)
    ox    = 20.0
    oy    = n * riser + th + 20

    doc, msp = _make_doc()

    # Cara superior (peldaÃ±os)
    cur_x, cur_y = ox, oy
    top_pts = [(cur_x, cur_y)]
    for i in range(n):
        top_pts.append((cur_x, cur_y - riser))
        cur_y -= riser
        top_pts.append((cur_x + tread, cur_y))
        cur_x += tread
    _P(msp, top_pts, "SECCION", lw=70)

    # Cara inferior (zanca)
    off_x    = math.sin(ang) * th
    off_y    = math.cos(ang) * th
    bot_start = (ox + off_x, oy + off_y)
    bot_end   = (ox + n*tread + off_x, oy - n*riser + off_y)
    _L(msp, bot_start[0], bot_start[1], bot_end[0], bot_end[1], "SECCION", lw=70)
    _L(msp, top_pts[0][0], top_pts[0][1], bot_start[0], bot_start[1], "SECCION", lw=70)
    _L(msp, top_pts[-1][0], top_pts[-1][1], bot_end[0], bot_end[1], "SECCION", lw=70)

    # Contrafuertes verticales de peldaÃ±os
    for i in range(n):
        px = ox + i * tread
        py = oy - i * riser
        _L(msp, px, py-riser, px, py, "SECCION")
        _L(msp, px, py-riser, px+wt, py-riser, "SECCION")

    # Zona picada en peldaÃ±o central
    mi    = n // 2
    px_m  = ox + mi * tread
    py_m  = oy - mi * riser
    _zona_picada_boundary(msp, [
        (px_m,       py_m),
        (px_m+tread, py_m),
        (px_m+tread, py_m-riser),
        (px_m+wt+1,  py_m-riser),
        (px_m+wt+1,  py_m-riser+2),
        (px_m+3,     py_m-1),
        (px_m,       py_m),
    ])

    # Armadura longitudinal (2 capas)
    for off_factor in [cov/th, 1 - cov/th]:
        lx1 = ox + off_x*off_factor + cov*math.cos(ang)
        ly1 = oy + off_y*off_factor - cov*math.sin(ang)
        lx2 = ox + n*tread + off_x*off_factor - cov*math.cos(ang)
        ly2 = oy - n*riser + off_y*off_factor + cov*math.sin(ang)
        _L(msp, lx1, ly1, lx2, ly2, "ARMADURA_LONG", lw=int(dl*8))

    # Cotas
    _dim_h(msp, ox, ox+tread, oy+th+10, oy, f"{tread:.1f}")
    _dim_v(msp, oy-riser, oy, ox-15, ox, f"{riser:.1f}")
    _dim_v(msp, bot_end[1], bot_end[1]+th, ox+n*tread+15, ox+n*tread, f"{th:.0f}")

    _label_arrow(msp, ox+n*tread*0.6, oy-n*riser*0.5,
                 ox+n*tread+35, oy-n*riser*0.5,
                 [f"Arm. long: Ã˜{dl:.0f}@{sl}cm",
                  f"Arm. trans: Ã˜{dt:.0f}@{st}cm",
                  f"Recub: {cov}cm",
                  f"Relleno: {getattr(data, 'relleno_type', 'Mortero/Cascote')}"])

    if getattr(data, "depth_no_rebar", None):
        _T(msp, ox+n*tread/2, oy-n*riser-15, 2.0,
           f"ATENCIO: sense armadura fins -{data.depth_no_rebar}cm",
           "TEXTO", h_align=1)

    _title(msp, ox+n*tread/2, oy+th+20, "SECCIO LONGITUDINAL â€” ZANCA")
    _cajetin(msp, ox+n*tread+35, oy-n*riser-35, _cajetin_data(data))

    return _buf(doc)

