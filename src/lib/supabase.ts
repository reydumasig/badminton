import { createClient } from "@supabase/supabase-js";

// Server-side only client using the service role key.
// Never import this in client components — it bypasses RLS.
export function createServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
