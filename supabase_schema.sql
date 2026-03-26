-- StructCAD Pro — Schema de Supabase
-- Ejecutar en el SQL Editor de tu proyecto Supabase
-- https://app.supabase.com → SQL Editor → New Query

-- Tabla principal de inspecciones
CREATE TABLE IF NOT EXISTS inspections (
  id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       TIMESTAMPTZ   DEFAULT NOW()             NOT NULL,
  element_ref      TEXT          DEFAULT 'E-01',
  structure_type   TEXT,
  plant            TEXT,
  axis             TEXT,
  inspection_date  DATE,
  project_name     TEXT,
  technician       TEXT,
  rebar_found      TEXT,
  notes            TEXT,
  dxf_filename     TEXT,
  form_data        JSONB,        -- todos los parametros del formulario
  bar_status       JSONB,        -- {barId: 'found'|'notfound'|'oxidized'}
  picked_strokes   JSONB,        -- [{cx,cy,r}] trazos pintados
  picked_circles   JSONB         -- [{nx,ny,nr}] normalizados para DXF
);

-- Indice para busqueda rapida por obra
CREATE INDEX IF NOT EXISTS idx_inspections_project  ON inspections(project_name);
CREATE INDEX IF NOT EXISTS idx_inspections_date     ON inspections(inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_inspections_struct   ON inspections(structure_type);

-- Politica de acceso publico (ajustar segun necesidades de auth)
-- Para produccion, habilita Row Level Security y politicas de usuario
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read"
  ON inspections FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert"
  ON inspections FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public delete"
  ON inspections FOR DELETE
  USING (true);
