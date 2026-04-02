import { createServerClient, createBrowserClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// ─── Server client (server components & route handlers) ───────
// Uses the anon key + cookie-based session management
export async function createAuthServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll is called from Server Components — cookies are read-only there.
            // Session refresh is handled by middleware instead.
          }
        },
      },
    }
  );
}

// ─── Browser client (client components) ──────────────────────
export function createAuthBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
