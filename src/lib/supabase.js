import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = String(
  import.meta.env.VITE_SUPABASE_URL ?? ""
).trim();

export const supabaseKey = String(
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    ""
).trim();

let configError =
  !supabaseUrl || !supabaseKey
    ? "Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) in your .env file, then restart npm run dev."
    : "";

let supabaseClient = null;

if (!configError) {
  try {
    supabaseClient = createClient(
      supabaseUrl,
      supabaseKey
    );
  } catch (error) {
    const initializationMessage =
      error instanceof Error
        ? error.message
        : "client initialization failed";

    configError = `Invalid Supabase configuration: ${initializationMessage}. Check the VITE_SUPABASE_* values in your .env file, then restart npm run dev.`;
  }
}

export const supabaseConfigError = configError;

if (supabaseConfigError) {
  console.error("Supabase configuration error.", {
    hasSupabaseUrl: Boolean(supabaseUrl),
    hasSupabaseKey: Boolean(supabaseKey),
  });
}

export const supabase = supabaseClient;

export default supabase;
