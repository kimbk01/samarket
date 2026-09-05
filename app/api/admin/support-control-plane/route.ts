import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadSupportControlPlane } from "@/lib/admin/support-control-plane/load-support-control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/support-control-plane — read-only Support/Notification composition. */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const model = await loadSupportControlPlane(sb);
    return NextResponse.json({ ok: true, plane: model });
  } catch (e) {
    console.error("[support-control-plane]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "load_failed" },
      { status: 500 }
    );
  }
}
