import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export async function requireIntroAdminContext(): Promise<
  | { ok: true; userId: string; sb: NonNullable<ReturnType<typeof tryCreateSupabaseServiceClient>> }
  | { ok: false; response: NextResponse }
> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 }),
    };
  }
  return { ok: true, userId: admin.userId, sb };
}
