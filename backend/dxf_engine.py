"""
dxf_engine.py  --  Motor DXF para StructCAD Pro
================================================
Genera planos tecnicos de inspeccion estructural.

Estilo visual (segun imagenes de referencia):
  - Fondo blanco
  - Hormigon intacto  -> relleno gris solido uniforme (color 252)
  - Zona picada       -> fondo blanco + trama cuadricula (ANSI32)
  - Barras de acero   -> circulos negros rellenos solidos
  - Estribos          -> lineas continuas destacadas
  - Cotas             -> flechas solidas, texto centrado, separadas
  - Texto             -> solo ASCII puro, sin tildes
"""

import io
import math
import random

from shapely.geometry import Point, MultiPolygon
from shapely.ops import unary_union

import ezdxf
from ezdxf.enums import TextEntityAlignment

# Factores normativos para geometria de estribos (EHE-08 / EC2)
BEND_RAD_FACTOR = 3.0   # Radio de doblado = 3 * diametro del estribo (en cm)
HOOK_LEN_FACTOR = 10    # Longitud del gancho = 10 * diametro del estribo (en cm)

# ================================================================
#  CAPAS
# ================================================================
_VALID_LW = (-3,-2,-1,0,5,9,13,15,18,20,25,30,35,40,50,
              53,60,70,80,90,100,106,120,140,158,200,211)

def _lw(v):
    return min(_VALID_LW, key=lambda x: abs(x - int(v)))

LAYERS = {
    "SECCION":  {"color": 7,  "lw": 70},
    "HORMIGON": {"color": 8,  "lw":  0},
    "PICADO":   {"color": 30, "lw":  0},
    "ARMADURA": {"color": 250, "lw": 50},
    "ESTRIBOS": {"color": 5,  "lw": 35},
    "COTAS":    {"color": 8,  "lw": 13},
    "TEXTO":    {"color": 7,  "lw": 13},
    "CAJETIN":  {"color": 7,  "lw": 18},
    "FISURAS":  {"color": 1,  "lw": 35},
}

def _make_doc():
    doc = ezdxf.new("R2000")
    doc.header["$INSUNITS"]    = 5
    doc.header["$MEASUREMENT"] = 1
    doc.header["$LTSCALE"]     = 1.0
    for name, att in LAYERS.items():
        lay = doc.layers.add(name)
        lay.color      = att["color"]
        lay.lineweight = _lw(att["lw"])
    return doc, doc.modelspace()

def _out(doc):
    buf = io.StringIO()
    doc.write(buf)
    return io.BytesIO(buf.getvalue().encode("utf-8"))


# ================================================================
#  ASCII PURO
# ================================================================
_REPL = {
    "Ø":"%%c","ø":"%%c","°":"deg",
    "á":"a","é":"e","í":"i","ó":"o","ú":"u",
    "Á":"A","É":"E","Í":"I","Ó":"O","Ú":"U",
    "à":"a","è":"e","ì":"i","ò":"o","ù":"u",
    "ñ":"n","Ñ":"N","ç":"c","Ç":"C",
    "ü":"u","Ü":"U","ä":"a","Ä":"A","ö":"o","Ö":"O",
    "—":"-","–":"-","·":".","•":".",
    "\u2018":"'","\u2019":"'","\u201c":'"',"\u201d":'"',
    "«":'"',"»":'"',"\u00b2":"2","\u00b3":"3","\u20ac":"EUR",
}

def _a(s):
    t = str(s)
    for k, v in _REPL.items():
        t = t.replace(k, v)
    return "".join(c for c in t if ord(c) < 128)


# ================================================================
#  PRIMITIVOS
# ================================================================

def _L(msp, x1, y1, x2, y2, layer="SECCION", lw=None):
    att = {"layer": layer}
    if lw is not None:
        att["lineweight"] = _lw(lw)
    msp.add_line((x1, y1), (x2, y2), dxfattribs=att)

def _C(msp, cx, cy, r, layer="SECCION", lw=None):
    att = {"layer": layer}
    if lw is not None:
        att["lineweight"] = _lw(lw)
    msp.add_circle((cx, cy), r, dxfattribs=att)

def _A(msp, cx, cy, r, a0, a1, layer="ESTRIBOS"):
    msp.add_arc((cx, cy), r, a0, a1, dxfattribs={"layer": layer})

def _PL(msp, pts, layer="SECCION", closed=False, lw=None):
    att = {"layer": layer, "closed": 1 if closed else 0}
    if lw is not None:
        att["lineweight"] = _lw(lw)
    msp.add_lwpolyline(pts, dxfattribs=att)

def _T(msp, x, y, h, txt, layer="TEXTO",
       align=TextEntityAlignment.LEFT, angle=0.0):
    txt = _a(txt)
    ent = msp.add_text(
        txt,
        dxfattribs={"layer": layer, "height": float(h),
                    "rotation": float(angle)},
    )
    ent.set_placement((x, y), align=align)

def _rect(msp, x, y, w, h, layer="SECCION", lw=None):
    _PL(msp, [(x,y),(x+w,y),(x+w,y+h),(x,y+h)],
        layer, closed=True, lw=lw)

def _rpts(x, y, w, h):
    return [(x,y),(x+w,y),(x+w,y+h),(x,y+h)]


# ================================================================
#  RELLENOS
# ================================================================

def _h_poly(msp, pts, layer):
    return [(float(p[0]),float(p[1])) for p in pts]

def _fill_gray(msp, pts, color=254):
    """
    Relleno gris solido para hormigon intacto.
    color 254 = gris muy claro, maximo contraste con armadura sobre fondo blanco.
    """
    p2 = [(float(p[0]),float(p[1])) for p in pts]
    h = msp.add_hatch(dxfattribs={"layer":"HORMIGON"})
    h.set_solid_fill(color=color)
    h.paths.add_polyline_path(p2, is_closed=True)

def _fill_picado(msp, pts):
    """
    Zona picada/repicada:
      1) relleno blanco solido (borra el gris de debajo)
      2) trama ANSI32 (cuadricula a 45 grados) en gris oscuro
    Resultado: fondo blanco con cuadricula -> claramente diferente del gris.
    """
    p2 = [(float(p[0]),float(p[1])) for p in pts]

    # Paso 1: fondo blanco
    h1 = msp.add_hatch(dxfattribs={"layer":"PICADO"})
    h1.set_solid_fill(color=255)
    h1.paths.add_polyline_path(p2, is_closed=True)

    # Paso 2: trama (intentar varios patrones por compatibilidad)
    for pat, sc, ang in [
        ("ANSI32", 3.0, 0.0),
        ("NET",    3.0, 0.0),
        ("ANSI31", 3.0, 90.0),
    ]:
        try:
            h2 = msp.add_hatch(dxfattribs={"layer":"PICADO"})
            h2.set_pattern_fill(pat, color=8, scale=sc, angle=ang)
            h2.paths.add_polyline_path(p2, is_closed=True)
            return
        except Exception:
            continue

def _fill_bar(msp, cx, cy, r, layer="ARMADURA"):
    """Barra de acero: circulo negro solido (relleno color 250 = grafito macizo)."""
    hatch = msp.add_hatch(color=250, dxfattribs={"layer": layer})
    path = hatch.paths.add_edge_path()
    path.add_arc((cx, cy), r, 0, 360)


def _fill_picado_circles(msp, circles, px, py, struct_w, struct_h, target_view='section'):
    """
    Rellena zonas picadas UNICAMENTE donde el usuario pinto con la brocha.

    circles : lista de dicts {nx, ny, nr, view} con coordenadas normalizadas [0,1].
              nx/ny son el centro normalizado, nr es el radio normalizado
              respecto a min(struct_w, struct_h).
    px, py  : origen de la seccion en el espacio DXF (cm).
    struct_w/h : dimensiones reales de la seccion en cm.
    target_view: filtra circulos por la vista ('section', 'lateral', 'frontal').

    Nota: el eje Y del canvas es hacia abajo (top=0) y el DXF hacia arriba
    (bottom=0), por lo que se invierte ny -> (1 - ny).
    """
    if not circles:
        return
    min_dim = min(struct_w, struct_h)
    n_pts = 32
    for c in circles:
        if c.get('view') and c.get('view') != target_view:
            continue
        try:
            nx = float(c.get('nx', 0))
            ny = float(c.get('ny', 0))
            nr = float(c.get('nr', 0))
            cx = px + nx * struct_w
            cy = py + (1.0 - ny) * struct_h   # invertir eje Y canvas->DXF
            r  = nr * min_dim
            if r < 0.2:
                continue
            # Clamping: limitar radio y empujar centro para que el círculo no salga del borde
            r = min(r, struct_w / 2, struct_h / 2)
            cx = max(px + r, min(px + struct_w - r, cx))
            cy = max(py + r, min(py + struct_h - r, cy))
            pts = [(cx + r * math.cos(math.radians(i * 360 / n_pts)),
                    cy + r * math.sin(math.radians(i * 360 / n_pts)))
                   for i in range(n_pts)]
            _fill_picado(msp, pts)
        except (ValueError, TypeError, KeyError):
            continue


def _generate_irregular_fragment(cx, cy, r_min, r_max, num_points=6):
    """Genera un polígono irregular que simula un fragmento de hormigón roto."""
    pts = []
    angle_step = 360 / num_points
    for i in range(num_points):
        angle = math.radians(i * angle_step + random.uniform(-10, 10))
        r = random.uniform(r_min, r_max)
        pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    return pts


def _to_dxf_circles(circles, px, py, struct_w, struct_h, target_view='section'):
    """Convierte círculos normalizados [0,1] a coordenadas DXF absolutas (cx, cy, r)."""
    result = []
    min_dim = min(struct_w, struct_h)
    for c in circles:
        if c.get('view') and c.get('view') != target_view:
            continue
        try:
            nx = float(c.get('nx', 0))
            ny = float(c.get('ny', 0))
            nr = float(c.get('nr', 0))
            cx = px + nx * struct_w
            cy = py + (1.0 - ny) * struct_h
            r  = nr * min_dim
            if r < 0.2:
                continue
            r = min(r, struct_w / 2, struct_h / 2)
            cx = max(px + r, min(px + struct_w - r, cx))
            cy = max(py + r, min(py + struct_h - r, cy))
            result.append((cx, cy, r))
        except (ValueError, TypeError, KeyError):
            continue
    return result


def _cluster_circles(circles):
    """Agrupa círculos por cuadrícula para controlar la densidad de fragmentos de textura."""
    if not circles:
        return []
    avg_r = sum(r for _, _, r in circles) / len(circles)
    cell = max(avg_r * 2.0, 0.5)
    grid = {}
    for cx, cy, r in circles:
        key = (int(cx / cell), int(cy / cell))
        if key in grid:
            g = grid[key]
            g[0] += cx; g[1] += cy
            g[2] = max(g[2], r); g[3] += 1
        else:
            grid[key] = [cx, cy, r, 1]
    return [(g[0] / g[3], g[1] / g[3], g[2]) for g in grid.values()]


def _merge_painted_area(circles):
    """
    Fusiona todos los círculos pintados en una única geometría continua con Shapely.

    Convierte cada círculo a un polígono aproximado (16 segmentos) y los une con
    unary_union. El resultado es uno o varios polígonos limpios, sin autointerescciones
    ni solapamientos, que AutoCAD puede resolver trivialmente con la regla par/impar.

    Returns:
        Lista de listas de (x, y) — un contorno exterior por componente conectada.
    """
    if not circles:
        return []
    polys = [Point(cx, cy).buffer(r, resolution=16) for cx, cy, r in circles]
    merged = unary_union(polys)
    contours = []
    geoms = list(merged.geoms) if isinstance(merged, MultiPolygon) else [merged]
    for geom in geoms:
        if geom.is_valid and geom.area > 0:
            contours.append(list(geom.exterior.coords))
    return contours


def _draw_repair_texture(msp, picado_circles):
    """Fondo blanco fusionado + fragmentos procedurales de hormigón roto."""
    if not picado_circles:
        return
    # Fondo blanco: un único polígono limpio por componente conectada (sin huecos ni solapamientos)
    for contour in _merge_painted_area(picado_circles):
        h = msp.add_hatch(dxfattribs={"layer": "PICADO"})
        h.set_solid_fill(color=255)
        h.paths.add_polyline_path(contour, is_closed=True)
    # Fragmentos procedurales (salt & pepper) — densidad controlada por clustering
    for cx, cy, r in _cluster_circles(picado_circles):
        num_fragments = max(1, int(r * 2))
        for _ in range(num_fragments):
            fx = cx + random.uniform(-r * 0.8, r * 0.8)
            fy = cy + random.uniform(-r * 0.8, r * 0.8)
            frag_pts = _generate_irregular_fragment(fx, fy, 0.2, 0.6)
            color = random.choice([8, 9])
            h = msp.add_hatch(dxfattribs={"layer": "PICADO"})
            h.set_solid_fill(color=color)
            h.paths.add_polyline_path(frag_pts, is_closed=True)


def _draw_concrete_mask(msp, struct_w, struct_h, picado_circles, px_base=0, py_base=0):
    """
    Hatch gris sólido con agujeros perfectos en las zonas pintadas.

    Usa Shapely para garantizar que cada agujero (island) sea un polígono único,
    limpio y sin autointerescciones. Con un solo contorno por componente conectada,
    AutoCAD resuelve la paridad par/impar sin ningún error visual.
    """
    h = msp.add_hatch(dxfattribs={"layer": "HORMIGON"})
    h.set_solid_fill(color=254)
    h.dxf.hatch_style = 0  # Normal (odd/even): exterior lleno, islands vacíos
    rect_pts = [
        (px_base,            py_base),
        (px_base + struct_w, py_base),
        (px_base + struct_w, py_base + struct_h),
        (px_base,            py_base + struct_h),
    ]
    h.paths.add_polyline_path(rect_pts, is_closed=True)
    # Un único contorno fusionado por zona pintada → AutoCAD no tiene intersecciones que resolver
    for contour in _merge_painted_area(picado_circles):
        h.paths.add_polyline_path(contour, is_closed=True)


def _draw_cracks(msp, cracks, px, py, struct_w, struct_h, target_view='section'):
    if not cracks: return
    for c in cracks:
        if c.get('view') and c.get('view') != target_view: continue
        try:
            nx1, ny1 = float(c.get('nx1', 0)), float(c.get('ny1', 0))
            nx2, ny2 = float(c.get('nx2', 0)), float(c.get('ny2', 0))
            x1 = px + nx1 * struct_w
            y1 = py + (1.0 - ny1) * struct_h
            x2 = px + nx2 * struct_w
            y2 = py + (1.0 - ny2) * struct_h
            # Clamping: recortar extremos de fisura al borde de la estructura
            x1 = max(px, min(px + struct_w, x1))
            y1 = max(py, min(py + struct_h, y1))
            x2 = max(px, min(px + struct_w, x2))
            y2 = max(py, min(py + struct_h, y2))
            _wavy_line(msp, x1, y1, x2, y2, amp=1.5, waves=4, layer="FISURAS", lw=30)
        except Exception:
            continue


# ================================================================
#  BORDE ONDULADO
# ================================================================

def _wavy_pts(x0, y0, x1, y1, amp=3.0, waves=5):
    """Polilinea ondulada entre dos puntos (simula borde picado)."""
    n = max(waves*10, 30)
    length = math.sqrt((x1-x0)**2+(y1-y0)**2) or 1.0
    dx = (x1-x0)/length; dy = (y1-y0)/length
    px = -dy;             py =  dx
    pts = []
    for i in range(n+1):
        t = i/n
        bx = x0+t*(x1-x0); by = y0+t*(y1-y0)
        w = (amp*math.sin(t*math.pi*2*waves) +
             amp*.4*math.sin(t*math.pi*2*waves*1.8+.9) +
             amp*.2*math.sin(t*math.pi*2*waves*3.1+1.7))
        pts.append((bx+px*w, by+py*w))
    return pts

def _wavy_line(msp, x0, y0, x1, y1, amp=3.0, waves=5,
               layer="SECCION", lw=22):
    pts = _wavy_pts(x0, y0, x1, y1, amp, waves)
    _PL(msp, pts, layer=layer, lw=lw)


# ================================================================
#  BARRA VERTICAL GRUESA (alzados)
# ================================================================

def _draw_thick_vertical_bar(msp, x, y1, y2, diam_cm, layer="ARMADURA"):
    """Barra longitudinal en alzado: polilínea con const_width = diam_cm (solida)."""
    msp.add_lwpolyline(
        [(x, y1), (x, y2)],
        dxfattribs={"layer": layer, "const_width": max(0.4, diam_cm), "color": 250},
    )


# ================================================================
#  ESTRIBO RECTANGULAR
# ================================================================

def _stirrup(msp, x, y, w, h, rc=0.8, layer="ESTRIBOS"):
    _L(msp,x+rc,  y,     x+w-rc,y,     layer)
    _L(msp,x+w,   y+rc,  x+w,   y+h-rc,layer)
    _L(msp,x+w-rc,y+h,   x+rc,  y+h,  layer)
    _L(msp,x,     y+h-rc,x,     y+rc, layer)
    _A(msp,x+rc,   y+rc,  rc,180,270,layer)
    _A(msp,x+w-rc, y+rc,  rc,270,360,layer)
    _A(msp,x+w-rc, y+h-rc,rc,0,  90,layer)
    _A(msp,x+rc,   y+h-rc,rc,90,180,layer)
    _L(msp,x+w,y+h,x+w+3,y+h+2.5,layer)  # gancho


def _draw_u_tie(msp, x_min, x_max, y_min, y_max, diam_cm, cx, cy, layer="ESTRIBOS"):
    w = x_max - x_min
    h = y_max - y_min
    if w <= 0 or h <= 0: return

    rc = max(0.3, diam_cm * 3)
    rc = min(rc, w * 0.4, h * 0.4)
    cw = max(0.3, diam_cm)
    hook = max(2.0, diam_cm * 4)
    hx = hook * 0.707  # Proyeccion X a 45 grados
    hy = hook * 0.707  # Proyeccion Y a 45 grados
    b = 0.4142         # Bulge para arco de 90 grados

    if w >= h:  # Grapas HORIZONTALES (caras superior/inferior)
        if (y_min + y_max) / 2 < cy:  # Cara Inferior -> Abre hacia ARRIBA (nucleo)
            pts = [
                (x_min + hx, y_max + hy, 0),
                (x_min,      y_max,      0),
                (x_min,      y_min + rc, b),
                (x_min + rc, y_min,      0),
                (x_max - rc, y_min,      b),
                (x_max,      y_min + rc, 0),
                (x_max,      y_max,      0),
                (x_max - hx, y_max + hy, 0),
            ]
        else:  # Cara Superior -> Abre hacia ABAJO (nucleo)
            pts = [
                (x_min + hx, y_min - hy, 0),
                (x_min,      y_min,      0),
                (x_min,      y_max - rc, -b),
                (x_min + rc, y_max,      0),
                (x_max - rc, y_max,      -b),
                (x_max,      y_max - rc, 0),
                (x_max,      y_min,      0),
                (x_max - hx, y_min - hy, 0),
            ]
    else:  # Grapas VERTICALES (caras izquierda/derecha)
        if (x_min + x_max) / 2 < cx:  # Cara Izquierda -> Abre hacia la DERECHA (nucleo)
            pts = [
                (x_max + hx, y_max - hy, 0),
                (x_max,      y_max,      0),
                (x_min + rc, y_max,      b),
                (x_min,      y_max - rc, 0),
                (x_min,      y_min + rc, b),
                (x_min + rc, y_min,      0),
                (x_max,      y_min,      0),
                (x_max + hx, y_min + hy, 0),
            ]
        else:  # Cara Derecha -> Abre hacia la IZQUIERDA (nucleo)
            pts = [
                (x_min - hx, y_max - hy, 0),
                (x_min,      y_max,      0),
                (x_max - rc, y_max,      -b),
                (x_max,      y_max - rc, 0),
                (x_max,      y_min + rc, -b),
                (x_max - rc, y_min,      0),
                (x_min,      y_min,      0),
                (x_min - hx, y_min + hy, 0),
            ]
    msp.add_lwpolyline(pts, format='xyb', dxfattribs={"layer": layer, "const_width": cw})


def _analyse_and_draw_corner_l_stirrup(msp, pts, pad, cx, cy, diam_cm, layer="ESTRIBOS"):
    """
    Analiza si 3 pts forman una esquina en L y dibuja la grapa abierta paralela
    a la esquina con radio de curvatura real y ganchos a 45 grados hacia el nucleo.
    Devuelve True si se dibujo, False en caso contrario (fallback a U).

    Logica de deteccion: la barra esquina C comparte X con la barra del brazo
    vertical V (misma columna) y comparte Y con la barra del brazo horizontal H
    (misma fila). Se determinan 4 casos (TL/TR/BL/BR) de forma generica usando
    signos de direccion, sin ramas if/elif por cuadrante.
    """
    if len(pts) != 3:
        return False

    # --- Deteccion de la barra esquina C ---
    config = None
    for i in range(3):
        p_c = pts[i]
        others = [j for j in range(3) if j != i]
        v_idx = None  # barra que comparte X con C (brazo vertical)
        h_idx = None  # barra que comparte Y con C (brazo horizontal)
        for j in others:
            if v_idx is None and math.isclose(p_c[0], pts[j][0], abs_tol=0.15):
                v_idx = j
            elif h_idx is None and math.isclose(p_c[1], pts[j][1], abs_tol=0.15):
                h_idx = j
        if v_idx is not None and h_idx is not None:
            config = (p_c, pts[h_idx], pts[v_idx])
            break

    if not config:
        return False  # No es una L de esquina, usar fallback U

    p_c, p_h, p_v = config  # C=esquina, H=brazo horizontal (comparte Y), V=brazo vertical (comparte X)

    # --- Parametros del estribo ---
    rc = max(0.3, diam_cm * 3)
    cw = max(0.3, diam_cm)
    hook = max(2.0, diam_cm * 4)
    hh = hook * 0.707  # Componente del gancho a 45 grados
    b = 0.4142  # tan(22.5 grados) para arco de 90 grados

    # Limitar radio al 35% de cada brazo para evitar geometria imposible
    arm_h_len = abs(p_h[0] - p_c[0]) + pad
    arm_v_len = abs(p_v[1] - p_c[1]) + pad
    rc = max(0.3, min(rc, arm_h_len * 0.35, arm_v_len * 0.35))

    # --- Signos de direccion (genericos, no hay ramas por cuadrante) ---
    # Posicion de C respecto al nucleo del pilar (para padding exterior)
    sign_cx = math.copysign(1.0, p_c[0] - cx)   # +1 si C esta a la derecha del nucleo
    sign_cy = math.copysign(1.0, p_c[1] - cy)   # +1 si C esta por encima del nucleo
    # Direccion de los brazos respecto a C
    sign_hx = math.copysign(1.0, p_h[0] - p_c[0])  # +1 si H esta a la derecha de C
    sign_vy = math.copysign(1.0, p_v[1] - p_c[1])  # +1 si V esta por encima de C

    # --- Coordenadas exteriores padded ---
    xb_c = p_c[0] + sign_cx * pad   # Borde exterior de la esquina en X
    yb_c = p_c[1] + sign_cy * pad   # Borde exterior de la esquina en Y
    xb_h = p_h[0] + sign_hx * pad   # Extremo del brazo H (hacia exterior)
    yb_v = p_v[1] + sign_vy * pad   # Extremo del brazo V (hacia exterior)

    # --- Arco de curvatura en la esquina ---
    # El arco va desde el final del brazo H hasta el inicio del brazo V
    arc_start = (xb_c + sign_hx * rc, yb_c)          # rc en dir H desde la esquina
    arc_end   = (xb_c, yb_c + sign_vy * rc)           # rc en dir V desde la esquina
    # Bulge: producto vectorial de la dir entrante (-sign_hx,0) y la dir saliente (0,sign_vy)
    # cross = (-sign_hx)*sign_vy. Positivo -> CCW (+b), Negativo -> CW (-b)
    arc_bulge = b if (-sign_hx * sign_vy) > 0 else -b

    # --- Ganchos a 45 grados apuntando hacia el nucleo ---
    hx_h = math.copysign(hh, cx - xb_h)
    hy_h = math.copysign(hh, cy - yb_c)
    hx_v = math.copysign(hh, cx - xb_c)
    hy_v = math.copysign(hh, cy - yb_v)

    polyline_pts = [
        (xb_h + hx_h,     yb_c + hy_h,     0),           # Punta gancho brazo H
        (xb_h,            yb_c,             0),           # Extremo brazo H
        (arc_start[0],    arc_start[1],     arc_bulge),   # Inicio arco esquina (con bulge)
        (arc_end[0],      arc_end[1],       0),           # Fin arco / inicio brazo V
        (xb_c,            yb_v,             0),           # Extremo brazo V
        (xb_c + hx_v,     yb_v + hy_v,     0),           # Punta gancho brazo V
    ]

    msp.add_lwpolyline(polyline_pts, format='xyb',
                       dxfattribs={"layer": layer, "const_width": cw})
    return True


def _draw_professional_tie(msp, p1, p2, stirrup_diam_cm, recub_real_cm,
                            layer="ESTRIBOS", add_hooks=False):
    """
    Estribo rectangular profesional con arcos de curvatura real en esquinas (EHE-08 / EC2).

    p1=(x_min, y_min), p2=(x_max, y_max): centros del eje del alambre.
    stirrup_diam_cm : diametro del estribo en cm (ej. 0.8 para O8mm).
    add_hooks       : dibuja ganchos de cierre a 135deg en la esquina de solape.
    """
    x1, y1 = float(p1[0]), float(p1[1])
    x2, y2 = float(p2[0]), float(p2[1])
    if x2 < x1: x1, x2 = x2, x1
    if y2 < y1: y1, y2 = y2, y1
    w = x2 - x1; h = y2 - y1
    if w <= 0 or h <= 0:
        return
    # Radio de doblado real segun EHE-08: r = BEND_RAD_FACTOR * d
    rc = max(0.3, stirrup_diam_cm * BEND_RAD_FACTOR)
    rc = min(rc, w * 0.4, h * 0.4)   # no superar el 40% de la dimension menor
    lw_val = max(9, int(stirrup_diam_cm * 50))  # O8mm -> lw=40, O6mm -> lw=30
    # Cuatro lados rectos
    _L(msp, x1+rc, y1,    x2-rc, y1,    layer, lw=lw_val)   # inferior
    _L(msp, x2,    y1+rc, x2,    y2-rc, layer, lw=lw_val)   # derecho
    _L(msp, x2-rc, y2,    x1+rc, y2,    layer, lw=lw_val)   # superior
    _L(msp, x1,    y2-rc, x1,    y1+rc, layer, lw=lw_val)   # izquierdo
    # Cuatro arcos con radio de curvatura real
    _A(msp, x1+rc, y1+rc, rc, 180, 270, layer)   # esquina inf-izq
    _A(msp, x2-rc, y1+rc, rc, 270, 360, layer)   # esquina inf-der
    _A(msp, x2-rc, y2-rc, rc,   0,  90, layer)   # esquina sup-der
    _A(msp, x1+rc, y2-rc, rc,  90, 180, layer)   # esquina sup-izq
    if add_hooks:
        # Ganchos de cierre a 135deg desde la esquina superior-derecha (punto de solape)
        hook_len = max(2.0, stirrup_diam_cm * HOOK_LEN_FACTOR)
        # Gancho 1: extremo del lado superior, doblado 135deg hacia el interior
        a1 = math.radians(135)
        _L(msp, x2-rc, y2,
           x2-rc + hook_len * math.cos(a1),
           y2    + hook_len * math.sin(a1), layer, lw=lw_val)
        # Gancho 2: extremo del lado derecho, doblado 135deg hacia el interior
        a2 = math.radians(225)
        _L(msp, x2, y2-rc,
           x2    + hook_len * math.cos(a2),
           y2-rc + hook_len * math.sin(a2), layer, lw=lw_val)


# ================================================================
#  COTAS
# ================================================================

def _arw(msp, x, y, d, sz, layer):
    """Flecha solida (triangulo)."""
    if   d=="R": p=[(x,y),(x+sz*2,y+sz*.6),(x+sz*2,y-sz*.6)]
    elif d=="L": p=[(x,y),(x-sz*2,y+sz*.6),(x-sz*2,y-sz*.6)]
    elif d=="U": p=[(x,y),(x+sz*.6,y+sz*2),(x-sz*.6,y+sz*2)]
    else:        p=[(x,y),(x+sz*.6,y-sz*2),(x-sz*.6,y-sz*2)]
    h=msp.add_hatch(dxfattribs={"layer":layer})
    h.set_solid_fill(color=8)
    h.paths.add_polyline_path(p,is_closed=True)

def _dim_h(msp, x1, x2, y_c, y_e, label,
           layer="COTAS", ht=2.0):
    """Cota horizontal profesional."""
    label = _a(str(label))
    ext = 2.0; sz = 1.5
    # lineas de extension
    ye = y_c-ext if y_c < y_e else y_c+ext
    _L(msp,x1,y_e,x1,ye,layer,lw=9)
    _L(msp,x2,y_e,x2,ye,layer,lw=9)
    # linea cota
    _L(msp,x1,y_c,x2,y_c,layer,lw=9)
    # marcas arquitectonicas diagonales (tick)
    tick = sz * 0.6
    _L(msp, x1 - tick, y_c - tick, x1 + tick, y_c + tick, layer, lw=15)
    _L(msp, x2 - tick, y_c - tick, x2 + tick, y_c + tick, layer, lw=15)
    # texto
    ty = y_c+ht*.55 if y_c < y_e else y_c-ht*1.1
    _T(msp,(x1+x2)/2,ty,ht,label,layer,TextEntityAlignment.CENTER)

def _dim_v(msp, y1, y2, x_c, x_e, label,
           layer="COTAS", ht=2.0):
    """Cota vertical profesional."""
    label = _a(str(label))
    ext=2.0; sz=1.5
    xe = x_c+ext if x_c > x_e else x_c-ext
    _L(msp,x_e,y1,xe,y1,layer,lw=9)
    _L(msp,x_e,y2,xe,y2,layer,lw=9)
    _L(msp,x_c,y1,x_c,y2,layer,lw=9)
    # marcas arquitectonicas diagonales (tick)
    tick = sz * 0.6
    _L(msp, x_c - tick, y1 - tick, x_c + tick, y1 + tick, layer, lw=15)
    _L(msp, x_c - tick, y2 - tick, x_c + tick, y2 + tick, layer, lw=15)
    _T(msp, x_c+ht*1.5, (y1+y2)/2, ht, label, layer, TextEntityAlignment.LEFT, 0.0)


# ================================================================
#  ANOTACION CON LINEA GUIA
# ================================================================

def _note(msp, x_tip, y_tip, x_txt, y_txt, lines,
          layer="TEXTO", ht=2.2):
    _L(msp,x_tip,y_tip,x_txt,y_txt,layer,lw=9)
    dx=x_txt-x_tip; dy=y_txt-y_tip
    lng=math.sqrt(dx*dx+dy*dy) or 1
    ux=dx/lng; uy=dy/lng
    a=1.0
    p=[(x_tip,y_tip),(x_tip+ux*a*2-uy*a*.5,y_tip+uy*a*2+ux*a*.5),
                     (x_tip+ux*a*2+uy*a*.5,y_tip+uy*a*2-ux*a*.5)]
    h=msp.add_hatch(dxfattribs={"layer":layer})
    h.set_solid_fill(color=7)
    h.paths.add_polyline_path(p,is_closed=True)
    for i,ln in enumerate(lines):
        _T(msp,x_txt,y_txt+i*ht*1.4,ht,_a(str(ln)),layer)

def _title(msp, x, y, txt, ht=3.5):
    txt = _a(txt).upper()
    _T(msp,x,y,ht,txt,"TEXTO",TextEntityAlignment.CENTER)
    hw = len(txt)*ht*.27
    _L(msp,x-hw,y-1.2,x+hw,y-1.2,"TEXTO",lw=18)


# ================================================================
#  CAJETIN
# ================================================================

def _cajetin(msp, x, y, data, w=115, h=30):
    _rect(msp,x,y,w,h,"CAJETIN",lw=50)
    _L(msp,x,y+h*.62,x+w,y+h*.62,"CAJETIN",lw=18)
    _L(msp,x+w*.5,y,x+w*.5,y+h*.62,"CAJETIN",lw=13)
    _L(msp,x,y+h*.30,x+w,y+h*.30,"CAJETIN",lw=9)

    def t(tx,ty,s,txt,al=TextEntityAlignment.LEFT):
        _T(msp,tx,ty,s,_a(txt),"CAJETIN",al)

    t(x+w/2, y+h*.73, 3.0,
      data.get("empresa","StructCAD Pro"),
      TextEntityAlignment.CENTER)
    t(x+2, y+h*.48, 1.9, "Obra: "   +data.get("obra","-"))
    t(x+2, y+h*.33, 1.9, "Ref:  "   +data.get("ref","E-01"))
    t(x+2, y+h*.16, 1.7, "Planta: " +data.get("planta","-")+
                          "  Eje: "  +data.get("eje","-"))
    t(x+w*.52, y+h*.48, 1.9, "Tecnico: "+data.get("tecnico","-"))
    t(x+w*.52, y+h*.33, 1.9, "Fecha:   "+data.get("fecha","-"))
    t(x+w*.52, y+h*.16, 1.9, "Escala:  "+data.get("escala","1:20"))
    n=data.get("notes","")
    if n:
        t(x+2, y-3.5, 1.6, "Obs: "+n[:90])

def _caj(d):
    return {
        "empresa": "StructCAD Pro - Inspeccion Estructural",
        "obra":    _a(getattr(d,"obra_nombre","") or "-"),
        "ref":     _a(getattr(d,"element_id","E-01") or "E-01"),
        "planta":  _a(getattr(d,"planta","") or "-"),
        "eje":     _a(getattr(d,"eje","") or "-"),
        "fecha":   _a(getattr(d,"fecha_insp","") or "-"),
        "tecnico": _a(getattr(d,"tecnico","") or "-"),
        "escala":  "1:20",
        "notes":   _a(getattr(d,"notes","") or ""),
    }


# ================================================================
#  PILAR RECTANGULAR
#  Tres vistas: SECCION EN PLANTA + VISTA LATERAL + VISTA FRONTAL
# ================================================================

def generate_dxf_pillar_rect(data) -> io.BytesIO:
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
    # cover_stirrup: recubrimiento nominal hasta el eje del estribo
    # Si no viene del frontend, se calcula como min(cf,cl) - ds/20
    _cs_raw = getattr(data, 'cover_stirrup', None)
    cs = float(_cs_raw) if _cs_raw else max(1.5, min(cf, cl) - ds / 20)

    spf     = (W-2*cf)/(nbf-1) if nbf>1 else 0
    # Barras laterales: solo INTERMEDIAS (esquinas compartidas con cara frontal)
    spl_int = (D-2*cl)/(nbl+1) if nbl>0 else 0
    rf  = max(.8, df/20)
    rl  = max(.8, dl/20)

    doc,msp = _make_doc()

    # ── 1. SECCION EN PLANTA ──────────────────────────────────────
    PX,PY = 0.0,0.0

    circles = list(getattr(data, 'picked_circles', None) or [])
    cracks = list(getattr(data, 'cracks_data', None) or [])
    circles_section = _to_dxf_circles(circles, PX, PY, W, D, 'section')

    # Textura de reparacion (fondo blanco + fragmentos procedurales) — capa base
    _draw_repair_texture(msp, circles_section)

    # Contorno exterior (encima de rellenos)
    _rect(msp,PX,PY,W,D,"SECCION",lw=70)

    # Estribo perimetral profesional con arcos de curvatura real y ganchos a 135deg
    _draw_professional_tie(msp, (PX+cs, PY+cs), (PX+W-cs, PY+D-cs),
                           ds/10, cs, "ESTRIBOS", add_hooks=True)

    # Barras cara frontal (arriba y abajo) — incluyen las 4 barras de esquina
    for i in range(nbf):
        bx = PX + cf + i*spf
        _fill_bar(msp, bx, PY+cl, rf)      # fila superior (y=cl)
        _fill_bar(msp, bx, PY+D-cl, rf)    # fila inferior (y=D-cl)

    # Barras cara lateral: SOLO INTERMEDIAS (las esquinas ya estan en cara frontal)
    for i in range(1, nbl+1):
        by = PY + cl + i*spl_int
        _fill_bar(msp, PX+cf,   by, rl)    # columna izquierda
        _fill_bar(msp, PX+W-cf, by, rl)    # columna derecha

    # Mapa ID -> posicion DXF (cm) en la seccion en planta
    bar_id_to_cm_pos = {}
    for i in range(nbf):
        bx = PX + cf + i * spf
        bar_id_to_cm_pos[f"FT{i+1}"] = (bx, PY + cl)
        bar_id_to_cm_pos[f"FB{i+1}"] = (bx, PY + D - cl)
    for i in range(1, nbl + 1):
        by = PY + cl + i * spl_int
        bar_id_to_cm_pos[f"LL{i}"] = (PX + cf,     by)
        bar_id_to_cm_pos[f"LR{i}"] = (PX + W - cf, by)

    # Estribos personalizados — L abierta en esquina o U envolvente segun geometria
    cust_stirrups = list(getattr(data, 'customStirrups', None) or [])
    pad = max(rf, rl) + ds / 20   # radio de barra + semigrosor del estribo
    for tie in cust_stirrups:
        # Compatibilidad: acepta tanto lista de IDs como dict {barIds:[...], ny, inset}
        tie_bar_ids = tie.get('barIds', tie) if isinstance(tie, dict) else tie
        pts = [bar_id_to_cm_pos[bid] for bid in tie_bar_ids if bid in bar_id_to_cm_pos]
        if len(pts) < 2:
            continue
        # Intentar dibujar como L abierta paralela a la esquina (3 barras en L)
        if _analyse_and_draw_corner_l_stirrup(msp, pts, pad, PX + W/2, PY + D/2, ds/10):
            continue
        # Fallback: dibujar como U envolvente (2+ barras o no es esquina en L)
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        _draw_u_tie(msp,
                    min(xs) - pad, max(xs) + pad,
                    min(ys) - pad, max(ys) + pad,
                    ds/10, PX + W/2, PY + D/2)

    # Mascara de hormigon: tapa el acero en zonas intactas, revela en zonas picadas
    _draw_concrete_mask(msp, W, D, circles_section, PX, PY)
    _draw_cracks(msp, cracks, PX, PY, W, D, 'section')

    # Cotas
    yc1=PY-10; yc2=PY-18
    _dim_h(msp,PX,PX+W,yc2,PY,f"{W:.0f}",ht=2.5)
    _dim_h(msp,PX,PX+cf,yc1,PY,f"r={cf:.0f}",ht=1.8)
    if nbf>1 and spf>0:
        _dim_h(msp,PX+cf,PX+cf+spf,yc1,PY,f"{spf:.1f}",ht=1.8)
    _dim_h(msp,PX+W-cf,PX+W,yc1,PY,f"r={cf:.0f}",ht=1.8)

    xc1=PX+W+12; xc2=PX+W+20
    _dim_v(msp,PY,PY+D,xc2,PX+W,f"{D:.0f}",ht=2.5)
    _dim_v(msp,PY,PY+cl,xc1,PX+W,f"r={cl:.0f}",ht=1.8)
    if nbl>0 and spl_int>0:
        _dim_v(msp,PY+cl,PY+cl+spl_int,xc1,PX+W,f"{spl_int:.1f}",ht=1.8)
    _dim_v(msp,PY+D-cl,PY+D,xc1,PX+W,f"r={cl:.0f}",ht=1.8)

    # Cotas progresivas horizontales (Eje a Eje)
    yc_prog = PY - 6
    xs_prog = [PX] + [PX + cf + i*spf for i in range(nbf)] + [PX + W]
    for i in range(len(xs_prog)-1):
        dist = xs_prog[i+1] - xs_prog[i]
        if dist > 0.5:
            _dim_h(msp, xs_prog[i], xs_prog[i+1], yc_prog, PY, f"{dist:.1f}".rstrip('0').rstrip('.'), ht=1.5)

    # Cotas progresivas verticales (Eje a Eje)
    xc_prog = PX - 6
    ys_bars = sorted(list(set([PY+cl, PY+D-cl] + [PY+cl + i*spl_int for i in range(1, nbl+1)])))
    ys_prog = [PY] + ys_bars + [PY + D]
    for i in range(len(ys_prog)-1):
        dist = ys_prog[i+1] - ys_prog[i]
        if dist > 0.5:
            _dim_v(msp, ys_prog[i], ys_prog[i+1], xc_prog, PX, f"{dist:.1f}".rstrip('0').rstrip('.'), ht=1.5)

    _note(msp,PX+W*.65,PY+D*.7,
          PX+W+32,PY+D*.8,
          [f"{nbf} Barras %%c{df:.0f}mm",
           f"Estribo %%c{ds:.0f}mm"])

    _T(msp,PX-16,PY+D/2,2.5,"LATERAL","TEXTO",
       TextEntityAlignment.CENTER,90.0)
    _T(msp,PX+W/2,PY-28,2.5,"FRONTAL","TEXTO",
       TextEntityAlignment.CENTER)
    _title(msp,PX+W/2,PY+D+10,"SECCION EN PLANTA")

    # ── 2. VISTA LATERAL ─────────────────────────────────────────
    # Pilar visto de lado: ancho=D, altura total VH
    VH   = ih+80
    marg = 35  # zona de inspeccion (cm)
    LX   = -22.0
    LY   = -(VH+55)

    zt=LY+VH-marg; zb=LY+marg

    circles_lateral = _to_dxf_circles(circles, LX, LY, D, VH, 'lateral')
    # Textura de reparacion — capa base
    _draw_repair_texture(msp, circles_lateral)
    _rect(msp,LX,LY,D,VH,"SECCION",lw=70)

    # Lineas de zona inspeccionada
    _L(msp,LX,zt,LX+D,zt,"COTAS",lw=13)
    _L(msp,LX,zb,LX+D,zb,"COTAS",lw=13)

    # Barras de ESQUINA (compartidas con la cara frontal), diametro df
    _draw_thick_vertical_bar(msp, LX+cl,   LY+2, LY+VH-2, df/10)
    _draw_thick_vertical_bar(msp, LX+D-cl, LY+2, LY+VH-2, df/10)

    # Barras laterales INTERMEDIAS (solo las nbl intermedias, no las esquinas)
    for i in range(1, nbl+1):
        bx = LX + cl + i*spl_int
        _draw_thick_vertical_bar(msp, bx, LY+2, LY+VH-2, dl/10)

    # Estribos en zona de inspeccion (REPETIDOS SEGÚN stirrup_spacing)
    stirrup_spacing = getattr(data, 'stirrup_spacing', 15)
    usable_height = zt - zb
    n_stirrups = int(usable_height // stirrup_spacing) + 1
    for i in range(n_stirrups):
        y = zb + i*stirrup_spacing
        if y > zt: break
        _L(msp, LX+cs, y, LX+D-cs, y, "ESTRIBOS", lw=25)

    # Estribos individuales — ancho limitado a las barras que rodea
    for tie in cust_stirrups:
        if not isinstance(tie, dict):
            continue
        tie_bar_ids = tie.get('barIds', [])
        ny = float(tie.get('ny', 0.5))
        y_pos = zb + ny * (zt - zb)
        # Calcular rango X a partir de las posiciones de las barras en profundidad
        depths = []
        for bid in tie_bar_ids:
            if bid in bar_id_to_cm_pos:
                _, by = bar_id_to_cm_pos[bid]
                depths.append(by - PY)       # profundidad relativa al frente
        if not depths:
            continue
        x1 = LX + min(depths) - pad
        x2 = LX + max(depths) + pad
        x1 = max(x1, LX)
        x2 = min(x2, LX + D)
        if x2 > x1:
            _L(msp, x1, y_pos, x2, y_pos, "ESTRIBOS", lw=35)

    # Mascara de hormigon con agujeros en zonas picadas
    _draw_concrete_mask(msp, D, VH, circles_lateral, LX, LY)
    _draw_cracks(msp, cracks, LX, LY, D, VH, 'lateral')

    # Cotas
    _dim_h(msp,LX,LX+D,LY-10,LY,f"{D:.0f} cm",ht=2.2)
    _dim_h(msp,LX,LX+cl,LY-18,LY,f"r={cl:.0f} cm",ht=1.8)
    if nbl>0 and spl_int>0:
        _dim_h(msp,LX+cl,LX+cl+spl_int,LY-26,LY,f"sep={spl_int:.1f}",ht=1.8)

    xv=LX+D+12
    _dim_v(msp,LY,LY+VH,xv+8,LX+D,f"{VH:.0f} cm",ht=2.0)
    _dim_v(msp,zb,zt,xv,LX+D,f"insp={ih:.0f} cm",ht=2.0)
    _dim_v(msp,LY,LY+marg,xv+16,LX+D,f"{marg:.0f} cm",ht=1.8)

    n_lat_total = nbl + 2  # intermedias + 2 esquinas
    _note(msp,LX,(zt+zb)/2,LX-40,(zt+zb)/2+5,
          [f"2 %%c{df:.0f}mm esquina",
           f"{nbl} %%c{dl:.0f}mm lat. interm.",
           f"Total: {n_lat_total} barras/cara",
           f"Est. %%c{ds:.0f}mm  r={cs:.0f}cm"])
    _title(msp,LX+D/2,LY-32,"VISTA LATERAL")

    # ── 3. VISTA FRONTAL ─────────────────────────────────────────
    # Sin picado predefinido: hormigon intacto en toda la vista
    FX=D+45.0; FY=LY
    zt_f=FY+VH-marg; zb_f=FY+marg

    circles_elevation = _to_dxf_circles(circles, FX, FY, W, VH, 'elevation')
    # Textura de reparacion — capa base
    _draw_repair_texture(msp, circles_elevation)
    _rect(msp,FX,FY,W,VH,"SECCION",lw=70)

    # Lineas de zona inspeccionada
    _L(msp,FX,zt_f,FX+W,zt_f,"COTAS",lw=13)
    _L(msp,FX,zb_f,FX+W,zb_f,"COTAS",lw=13)

    # Barras frontales a lo largo de toda la vista (gruesas, solidas)
    for i in range(nbf):
        bx = FX + cf + i*spf
        _draw_thick_vertical_bar(msp, bx, FY+2, FY+VH-2, df/10)

    # Estribos en vista frontal (REPETIDOS SEGÚN stirrup_spacing)
    for i in range(n_stirrups):
        y = zb_f + i*stirrup_spacing
        if y > zt_f: break
        _L(msp, FX+cs, y, FX+W-cs, y, "ESTRIBOS", lw=25)

    # Estribos individuales en vista frontal — ancho segun barras que rodea
    for tie in cust_stirrups:
        if not isinstance(tie, dict):
            continue
        tie_bar_ids = tie.get('barIds', [])
        ny = float(tie.get('ny', 0.5))
        y_pos = zb_f + ny * (zt_f - zb_f)
        widths = []
        for bid in tie_bar_ids:
            if bid in bar_id_to_cm_pos:
                bx, _ = bar_id_to_cm_pos[bid]
                widths.append(bx - PX)      # posicion relativa al borde izq
        if not widths:
            continue
        x1 = FX + min(widths) - pad
        x2 = FX + max(widths) + pad
        x1 = max(x1, FX)
        x2 = min(x2, FX + W)
        if x2 > x1:
            _L(msp, x1, y_pos, x2, y_pos, "ESTRIBOS", lw=35)

    # Mascara de hormigon con agujeros en zonas picadas
    _draw_concrete_mask(msp, W, VH, circles_elevation, FX, FY)
    _draw_cracks(msp, cracks, FX, FY, W, VH, 'elevation')

    # Cotas
    yf1=FY-10; yf2=FY-20
    _dim_h(msp,FX,FX+W,yf2,FY,f"{W:.0f} cm",ht=2.2)
    _dim_h(msp,FX,FX+cf,yf1,FY,f"r={cf:.0f} cm",ht=1.8)
    if nbf>1 and spf>0:
        _dim_h(msp,FX+cf,FX+cf+spf,yf1-10,FY,f"sep={spf:.0f} cm",ht=1.8)

    xvf=FX+W+12
    _dim_v(msp,FY,FY+VH,xvf+8,FX+W,f"{VH:.0f} cm",ht=2.0)
    _dim_v(msp,zb_f,zt_f,xvf,FX+W,f"insp={ih:.0f} cm",ht=2.0)

    _note(msp,FX+W*.65,zt_f-ih*.3,
          FX+W+30,zt_f+5,
          [f"{nbf} %%c{df:.0f}mm cara front.",
           f"Est. %%c{ds:.0f}mm  r={cf:.0f}/{cs:.0f}cm"])
    _title(msp,FX+W/2,FY-32,"VISTA FRONTAL")

    _cajetin(msp,FX+W+28,FY-55,_caj(data))
    return _out(doc)


# ================================================================
#  PILAR CIRCULAR
# ================================================================

def generate_dxf_pillar_circ(data) -> io.BytesIO:
    diam = float(data.diameter); R=diam/2
    cov  = float(data.cover)
    nb   = int(data.bars_count)
    db   = float(data.bars_diam)
    ds   = float(data.stirrup_diam)
    ih   = float(data.inspection_height)
    rb   = max(.8,db/20)

    doc,msp=_make_doc()

    # SECCION EN PLANTA (circulo)
    n36=36
    circ=[(R*math.cos(math.radians(i*360/n36)),
           R*math.sin(math.radians(i*360/n36))) for i in range(n36)]
    _fill_gray(msp,circ)

    # Picado: solo donde el usuario pinto con la brocha
    # El canvas muestra el circulo centrado: [0,1]x[0,1] = [-R..R] x [-R..R]
    circles = list(getattr(data, 'picked_circles', None) or [])
    _fill_picado_circles(msp, circles, -R, -R, 2*R, 2*R)

    _C(msp,0,0,R,"SECCION",lw=70)
    _C(msp,0,0,R-cov,"ESTRIBOS",lw=28)
    for i in range(nb):
        ang=math.radians(360*i/nb+90)
        _fill_bar(msp,(R-cov)*math.cos(ang),(R-cov)*math.sin(ang),rb)

    _dim_h(msp,-R,R,-R-14,-R,f"%%c{diam:.0f}cm",ht=2.5)
    _note(msp,R*.7,R*.7,R+25,R*.8,
          [f"{nb}Ø{db:.0f}mm long.",f"Espiral Ø{ds:.0f}mm",f"Recub: {cov:.0f}cm"])
    _title(msp,0,R+10,"SECCION EN PLANTA")

    # ALZADO
    AX=-(R+22); AY=-(ih+90); VH=ih+70; mg=32
    zt_a=AY+VH-mg; zb_a=AY+mg

    _fill_gray(msp,_rpts(AX,AY+VH-mg,diam,mg))
    _fill_gray(msp,_rpts(AX,AY,diam,mg))

    wp_at=_wavy_pts(AX,zt_a,AX+diam,zt_a,amp=3,waves=4)
    wp_ab=_wavy_pts(AX,zb_a,AX+diam,zb_a,amp=3,waves=4)
    pic_a=wp_at+[(AX+diam,zb_a)]+list(reversed(wp_ab))+[(AX,zt_a)]
    _fill_picado(msp,pic_a)

    _wavy_line(msp,AX,zt_a,AX+diam,zt_a,amp=3,waves=4,layer="SECCION",lw=22)
    _wavy_line(msp,AX,zb_a,AX+diam,zb_a,amp=3,waves=4,layer="SECCION",lw=22)
    _rect(msp,AX,AY,diam,VH,"SECCION",lw=70)

    for i in range(nb):
        ang=math.radians(360*i/nb+90)
        bx=AX+R+(R-cov)*math.cos(ang)
        _L(msp,bx,zb_a-2,bx,zt_a+2,"ARMADURA",lw=max(18,int(db*5)))
    _L(msp,AX,zt_a,AX+diam,zt_a,"ESTRIBOS",lw=25)
    _L(msp,AX,zb_a,AX+diam,zb_a,"ESTRIBOS",lw=25)

    _dim_h(msp,AX,AX+diam,AY-12,AY,f"%%c{diam:.0f}cm",ht=2.2)
    _dim_v(msp,zb_a,zt_a,AX+diam+12,AX+diam,f"{ih:.0f}",ht=2.0)
    _dim_v(msp,AY,AY+VH,AX+diam+20,AX+diam,f"{VH:.0f}",ht=2.0)
    _title(msp,AX+R,AY-24,"ALZADO")
    _cajetin(msp,AX+diam+30,AY-55,_caj(data))
    return _out(doc)


# ================================================================
#  VIGA
# ================================================================

def generate_dxf_beam(data) -> io.BytesIO:
    W   = float(data.width); H=float(data.height)
    cov = float(data.cover)
    nbb = int(data.bars_bottom_count)
    nbt = int(data.bars_top_count)
    dbb = float(data.bars_bottom_diam)
    dbt = float(data.bars_top_diam)
    ds  = float(data.stirrup_diam)
    sps = float(data.stirrup_spacing)
    il  = float(data.inspection_length)

    spb=(W-2*cov)/(nbb-1) if nbb>1 else 0
    spt=(W-2*cov)/(nbt-1) if nbt>1 else 0

    doc,msp=_make_doc()

    # SECCION TRANSVERSAL
    _fill_gray(msp,_rpts(0,0,W,H))
    # Picado: solo donde el usuario pinto con la brocha
    circles = list(getattr(data, 'picked_circles', None) or [])
    _fill_picado_circles(msp, circles, 0, 0, W, H)

    _rect(msp,0,0,W,H,"SECCION",lw=70)
    _stirrup(msp,cov-ds/20,cov-ds/20,W-2*(cov-ds/20),H-2*(cov-ds/20),rc=.8)

    for i in range(nbb): _fill_bar(msp,cov+i*spb,cov,max(.8,dbb/20))
    for i in range(nbt): _fill_bar(msp,cov+i*spt,H-cov,max(.8,dbt/20))

    _dim_h(msp,0,W,-10,0,f"{W:.0f}",ht=2.2)
    _dim_h(msp,0,cov,-18,0,f"{cov:.0f}",ht=1.8)
    if nbb>1 and spb>0: _dim_h(msp,cov,cov+spb,-18,0,f"{spb:.0f}",ht=1.8)
    _dim_h(msp,W-cov,W,-18,0,f"{cov:.0f}",ht=1.8)
    _dim_v(msp,0,H,W+12,W,f"{H:.0f}",ht=2.2)
    _dim_v(msp,0,cov,W+20,W,f"{cov:.0f}",ht=1.8)

    _note(msp,W*.7,cov,W+28,H*.15,
          [f"Est. Ø{ds:.0f}mm @{sps:.0f}cm",
           f"{nbt}Ø{dbt:.0f}mm armad. sup.",
           f"{nbb}Ø{dbb:.0f}mm armad. inf.",
           f"Recubrimiento: {cov:.0f}cm"])
    _title(msp,W/2,H+10,"SECCION TRANSVERSAL")

    # ALZADO LONGITUDINAL
    mg=H*.8; TL=il+2*mg
    AX=W+52; AY=0.0

    _fill_gray(msp,_rpts(AX,AY,mg,H))
    _fill_gray(msp,_rpts(AX+mg+il,AY,mg,H))

    wp_at=_wavy_pts(AX+mg,AY+H,AX+mg+il,AY+H,amp=3,waves=5)
    wp_ab=_wavy_pts(AX+mg,AY,AX+mg+il,AY,amp=3,waves=5)
    pic_a=(wp_at+[(AX+mg+il,AY)]+list(reversed(wp_ab))+[(AX+mg,AY+H)])
    _fill_picado(msp,pic_a)

    _wavy_line(msp,AX+mg,AY+H,AX+mg+il,AY+H,amp=3,waves=5,layer="SECCION",lw=22)
    _wavy_line(msp,AX+mg,AY,  AX+mg+il,AY,  amp=3,waves=5,layer="SECCION",lw=22)
    _L(msp,AX+mg,AY,AX+mg,AY+H,"SECCION",lw=20)
    _L(msp,AX+mg+il,AY,AX+mg+il,AY+H,"SECCION",lw=20)
    _rect(msp,AX,AY,TL,H,"SECCION",lw=70)

    _L(msp,AX,AY+cov,AX+TL,AY+cov,"ARMADURA",lw=max(18,int(dbb*5)))
    _L(msp,AX,AY+H-cov,AX+TL,AY+H-cov,"ARMADURA",lw=max(18,int(dbt*5)))

    ns=int(TL/sps)+2
    for i in range(ns):
        sx=AX+i*sps
        if sx>AX+TL: break
        _L(msp,sx,AY+cov-1,sx,AY+H-cov+1,"ESTRIBOS",lw=22)

    _dim_h(msp,AX+mg,AX+mg+il,AY-10,AY,f"{il:.0f}",ht=2.2)
    _dim_h(msp,AX,AX+TL,AY-18,AY,f"total {TL:.0f}",ht=2.0)
    _dim_v(msp,AY,AY+H,AX+TL+12,AX+TL,f"{H:.0f}",ht=2.2)
    _dim_h(msp,AX+mg,AX+mg+sps,AY+H+6,AY+H,f"{sps:.0f}",ht=1.8)

    _title(msp,AX+TL/2,AY+H+12,"ALZADO (ZONA INSPECCION)")
    _cajetin(msp,AX+TL+12,AY-55,_caj(data))
    return _out(doc)


# ================================================================
#  FORJADO / LOSA
# ================================================================

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

    nsx=min(nx,10); nsy=min(ny,10)
    WR=max(120,10+(nsx-1)*spx+10)
    HR=max(80, 10+(nsy-1)*spy+10)

    doc,msp=_make_doc()

    # ── SECCION TRANSVERSAL ──────────────────────────────────────
    SX,SY=0.0,0.0

    # Intacto: toda la seccion
    _fill_gray(msp,_rpts(SX,SY,WR,th))

    # Picado: solo donde el usuario pinto con la brocha
    circles = list(getattr(data, 'picked_circles', None) or [])
    _fill_picado_circles(msp, circles, SX, SY, WR, th)

    _rect(msp,SX,SY,WR,th,"SECCION",lw=70)

    rx=max(.7,dx/20); ry=max(.6,dy/20)
    for i in range(nsx):
        bx=SX+10+i*spx
        if bx>SX+WR-8: break
        _fill_bar(msp,bx,SY+cb,rx)
        _fill_bar(msp,bx,SY+th-ct,rx)
        _fill_bar(msp,bx,SY+cb+rx*2.5,ry*.7)
        _fill_bar(msp,bx,SY+th-ct-rx*2.5,ry*.7)

    # Cotas seccion
    _T(msp,SX+WR/2,SY-6,2.2,f"rep. {WR:.0f} cm","TEXTO",
       TextEntityAlignment.CENTER)
    _dim_v(msp,SY,SY+th,SX+WR+12,SX+WR,f"e={th:.0f}",ht=2.2)
    ycs=SY-10
    _dim_h(msp,SX,SX+10,ycs,SY,"10",ht=1.8)
    if nsx>1: _dim_h(msp,SX+10,SX+10+spx,ycs,SY,f"{spx:.0f}",ht=1.8)
    _dim_h(msp,SX+WR-10,SX+WR,ycs,SY,"10",ht=1.8)
    _dim_h(msp,SX,SX+WR,ycs-8,SY,f"{WR:.0f}",ht=2.2)

    _T(msp,SX-2,SY+cb,1.8,f"r.inf={cb:.1f}cm","COTAS",TextEntityAlignment.RIGHT)
    _T(msp,SX-2,SY+th-ct,1.8,f"r.sup={ct:.1f}cm","COTAS",TextEntityAlignment.RIGHT)

    _note(msp,SX+WR*.6,SY+th*.55,SX+WR+28,SY+th*.7,
          [f"r.inf={cb:.0f} / r.sup={ct:.0f}cm",
           f"Y: {ny} %%c{dy:.0f}@{spy:.0f}cm",
           f"X: {nx} %%c{dx:.0f}@{spx:.0f}cm"])

    _title(msp,SX+WR/2,SY+th+10,"SECCION TRANSVERSAL")

    # ── PLANTA ARMADURA ──────────────────────────────────────────
    PLX=0.0; PLY=-(HR+48); bw=8

    # Intacto: toda la planta
    _fill_gray(msp,_rpts(PLX,PLY,WR,HR))

    # Picado: solo donde el usuario pinto con la brocha
    _fill_picado_circles(msp, circles, PLX, PLY, WR, HR)
    _rect(msp,PLX,PLY,WR,HR,"SECCION",lw=70)

    for i in range(nsx):
        bx=PLX+10+i*spx
        if bx>PLX+WR-8: break
        _L(msp,bx,PLY+5,bx,PLY+HR-5,"ARMADURA",lw=max(15,int(dx*5)))
    for i in range(nsy):
        by=PLY+10+i*spy
        if by>PLY+HR-8: break
        _L(msp,PLX+5,by,PLX+WR-5,by,"ARMADURA",lw=max(12,int(dy*4)))

    ycp=PLY-10
    _dim_h(msp,PLX,PLX+10,ycp,PLY,"10",ht=1.8)
    if nsx>1: _dim_h(msp,PLX+10,PLX+10+spx,ycp,PLY,f"{spx:.0f}",ht=1.8)
    _dim_h(msp,PLX,PLX+WR,ycp-8,PLY,f"{WR:.0f}",ht=2.2)

    xcp=PLX+WR+12
    _dim_v(msp,PLY,PLY+10,xcp,PLX+WR,"10",ht=1.8)
    if nsy>1: _dim_v(msp,PLY+10,PLY+10+spy,xcp,PLX+WR,f"{spy:.0f}",ht=1.8)
    _dim_v(msp,PLY,PLY+HR,xcp+8,PLX+WR,f"{HR:.0f}",ht=2.2)

    _title(msp,PLX+WR/2,PLY+HR+10,"PLANTA ARMADURA")
    _cajetin(msp,PLX+WR+25,PLY-55,_caj(data))
    return _out(doc)


# ================================================================
#  ZAPATA AISLADA
# ================================================================

def generate_dxf_footing(data) -> io.BytesIO:
    L   = float(data.length); WW=float(data.width); H=float(data.height)
    cb  = float(data.cover_bottom); cs=float(data.cover_sides)
    nx  = int(data.bars_x_count);   ny=int(data.bars_y_count)
    dx  = float(data.bars_x_diam);  dy=float(data.bars_y_diam)
    pw  = float(getattr(data,"pedestal_w",40) or 40)
    pd  = float(getattr(data,"pedestal_d",40) or 40)
    spx=(L-2*cs)/(nx-1) if nx>1 else 0
    spy=(WW-2*cs)/(ny-1) if ny>1 else 0

    doc,msp=_make_doc()

    # PLANTA
    circles = list(getattr(data, 'picked_circles', None) or [])
    _fill_gray(msp,_rpts(0,0,L,WW))
    px=(L-pw)/2; py=(WW-pd)/2
    # Picado: solo donde el usuario pinto con la brocha
    _fill_picado_circles(msp, circles, 0, 0, L, WW)
    _fill_gray(msp,_rpts(px,py,pw,pd),color=250)

    _rect(msp,0,0,L,WW,"SECCION",lw=70)
    _rect(msp,px,py,pw,pd,"SECCION",lw=35)
    _T(msp,px+pw/2,py+pd/2,1.8,f"P {pw:.0f}x{pd:.0f}","TEXTO",
       TextEntityAlignment.CENTER)

    for i in range(min(nx,20)): _L(msp,cs+i*spx,cs,cs+i*spx,WW-cs,"ARMADURA",lw=max(15,int(dx*5)))
    for i in range(min(ny,20)): _L(msp,cs,cs+i*spy,L-cs,cs+i*spy,"ARMADURA",lw=max(12,int(dy*4)))

    _dim_h(msp,0,L,-10,0,f"{L:.0f}",ht=2.5)
    _dim_h(msp,0,cs,-18,0,f"{cs:.0f}",ht=1.8)
    if nx>1 and spx>0: _dim_h(msp,cs,cs+spx,-18,0,f"{spx:.0f}",ht=1.8)
    _dim_v(msp,0,WW,L+12,L,f"{WW:.0f}",ht=2.5)
    _note(msp,L*.75,WW*.75,L+30,WW*.7,
          [f"{nx} %%c{dx:.0f} dir.X",f"{ny} %%c{dy:.0f} dir.Y",
           f"r.lat={cs:.0f} / r.inf={cb:.0f}cm"])
    _title(msp,L/2,WW+10,"PLANTA ARMADURA")

    # SECCION X-X
    SX=0; SY=-(H+48)
    _fill_gray(msp,_rpts(SX,SY,L,H))
    _rect(msp,SX,SY,L,H,"SECCION",lw=70)
    for i in range(min(nx,20)): _fill_bar(msp,SX+cs+i*spx,SY+cb,max(.7,dx/20))
    _dim_h(msp,SX,SX+L,SY-10,SY,f"{L:.0f}",ht=2.2)
    _dim_v(msp,SY,SY+H,SX+L+12,SX+L,f"{H:.0f}",ht=2.2)
    _dim_v(msp,SY,SY+cb,SX+L+20,SX+L,f"{cb:.0f}",ht=1.8)
    _title(msp,SX+L/2,SY+H+8,"SECCION X-X")

    # SECCION Y-Y
    SYX=L+32; SYY=SY
    _fill_gray(msp,_rpts(SYX,SYY,WW,H))
    _rect(msp,SYX,SYY,WW,H,"SECCION",lw=70)
    for i in range(min(ny,20)): _fill_bar(msp,SYX+cs+i*spy,SYY+cb,max(.7,dy/20))
    _dim_h(msp,SYX,SYX+WW,SYY-10,SYY,f"{WW:.0f}",ht=2.2)
    _dim_v(msp,SYY,SYY+H,SYX+WW+12,SYX+WW,f"{H:.0f}",ht=2.2)
    _title(msp,SYX+WW/2,SYY+H+8,"SECCION Y-Y")

    _cajetin(msp,SYX+WW+20,SYY-55,_caj(data))
    return _out(doc)


# ================================================================
#  ESCALERA
# ================================================================

def generate_dxf_stair(data) -> io.BytesIO:
    riser=float(data.riser); tread=float(data.tread)
    th=float(data.slab_thickness)
    wt=float(getattr(data,"wall_thickness",6.5) or 6.5)
    n=min(int(data.steps_count),12)
    cov=float(data.cover)
    dl=float(data.bars_long_diam); dt=float(data.bars_trans_diam)
    sl=float(data.bars_long_sep);  st=float(data.bars_trans_sep)

    ang=math.atan2(n*riser,n*tread)
    ox=20.0; oy=n*riser+th+20

    doc,msp=_make_doc()

    # Peldanos: intacto (gris)
    for i in range(n):
        px=ox+i*tread; py=oy-(i+1)*riser
        _fill_gray(msp,[(px,py),(px+tread,py),(px+tread,py+riser),(px,py+riser)])

    # Picado: solo donde el usuario pinto con la brocha
    # Bounds del canvas de escalera: origen (ox, oy-n*riser), tamaño (n*tread) x (n*riser+th)
    stair_h = n * riser + th
    circles = list(getattr(data, 'picked_circles', None) or [])
    _fill_picado_circles(msp, circles, ox, oy - n * riser, n * tread, stair_h)

    # Contorno
    cur_x,cur_y=ox,oy
    tp=[(cur_x,cur_y)]
    for i in range(n):
        tp.append((cur_x,cur_y-riser)); cur_y-=riser
        tp.append((cur_x+tread,cur_y)); cur_x+=tread
    offx=math.sin(ang)*th; offy=math.cos(ang)*th
    bs=(ox+offx,oy+offy); be=(ox+n*tread+offx,oy-n*riser+offy)
    _PL(msp,tp,"SECCION",lw=70)
    _L(msp,bs[0],bs[1],be[0],be[1],"SECCION",lw=70)
    _L(msp,tp[0][0],tp[0][1],bs[0],bs[1],"SECCION",lw=70)
    _L(msp,tp[-1][0],tp[-1][1],be[0],be[1],"SECCION",lw=70)

    for i in range(n):
        px=ox+i*tread; py=oy-i*riser
        _L(msp,px,py-riser,px,py,"SECCION",lw=20)
        _L(msp,px,py-riser,px+wt,py-riser,"SECCION",lw=20)

    lwl=max(18,int(dl*5))
    for off_f in [.25,.75]:
        lx1=ox+offx*off_f+cov*math.cos(ang); ly1=oy+offy*off_f-cov*math.sin(ang)
        lx2=ox+n*tread+offx*off_f-cov*math.cos(ang); ly2=oy-n*riser+offy*off_f+cov*math.sin(ang)
        _L(msp,lx1,ly1,lx2,ly2,"ARMADURA",lw=lwl)

    _dim_h(msp,ox,ox+tread,oy+th+8,oy,f"{tread:.0f}",ht=2.0)
    _dim_v(msp,oy-riser,oy,ox-12,ox,f"{riser:.0f}",ht=2.0)
    _dim_v(msp,be[1],be[1]+th,ox+n*tread+12,ox+n*tread,f"{th:.0f}",ht=2.0)
    _note(msp,ox+n*tread*.5,oy-n*riser*.35,ox+n*tread+28,oy-n*riser*.5,
          [f"Long: %%c{dl:.0f}@{sl:.0f}cm",
           f"Trans: %%c{dt:.0f}@{st:.0f}cm",f"Recub: {cov:.0f}cm"])
    _title(msp,ox+n*tread/2,oy+th+20,"SECCION LONGITUDINAL - ZANCA")
    _cajetin(msp,ox+n*tread+18,oy-n*riser-55,_caj(data))
    return _out(doc)