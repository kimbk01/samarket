import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { syncAppReleases } from "@/lib/app-releases/app-release-sync";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — 관리자 수동 출시 동기화 (D-N1). Play API 1회 + 자격 있는 출시만 자동 fan-out. */
export async function POST() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  try {
    const result = await syncAppReleases(sb);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[admin app-releases sync]", err);
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(String(err)) },
      { status: 500 }
    );
  }
}
