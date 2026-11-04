import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — 출시 기록 + Play 키 여부 (수동 동기화·확정 UI용). */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const { data, error } = await sb
    .from("app_releases")
    .select(
      "id, platform, version_name, version_code, released_at, source, rollout_status, notified_at, updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  return NextResponse.json({
    ok: true,
    releases: data ?? [],
    playKeyConfigured: Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim()),
  });
}
