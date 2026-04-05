import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseRouteHandlerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;

  const cookieStore = await cookies();
  const cookieSecure = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

  return createServerClient(url, anon, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: cookieSecure,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          /* Route Handler에서 읽기 전용인 경우 무시 */
        }
      },
    },
  });
}
