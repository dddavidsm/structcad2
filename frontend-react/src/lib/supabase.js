import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  || '';
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// ── Inspecciones ─────────────────────────────────────────────────

export async function saveInspection(record) {
  if (!supabase) return { data: null, error: 'Supabase no configurado' };
  const { data, error } = await supabase
    .from('inspections')
    .insert([record])
    .select()
    .single();
  return { data, error };
}

export async function fetchInspections() {
  if (!supabase) return { data: [], error: null };
  const { data, error } = await supabase
    .from('inspections')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  return { data: data || [], error };
}

export async function deleteInspection(id) {
  if (!supabase) return { error: 'Supabase no configurado' };
  const { error } = await supabase
    .from('inspections')
    .delete()
    .eq('id', id);
  return { error };
}
