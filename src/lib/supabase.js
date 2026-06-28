import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigError =
  !supabaseUrl || !supabaseKey
    ? "Missing Supabase environment variables. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file, then restart npm run dev."
    : "";

if (supabaseConfigError) {
  console.error("Missing Supabase environment variables.", {
    hasSupabaseUrl: Boolean(supabaseUrl),
    hasSupabaseKey: Boolean(supabaseKey),
  });
}

export const supabase = supabaseConfigError
  ? null
  : createClient(
      supabaseUrl,
      supabaseKey
    );

export default supabase;
