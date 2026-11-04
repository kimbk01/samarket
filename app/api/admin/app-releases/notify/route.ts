import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { adminConfirmNotifyRelease } from "@/lib/app-releases/app-release-sync";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — 관리자 수동 발송 확정.
 * Play API 로 production completed 를 검증할 수 없을 때(단계적·closed testing 등)만 사용.
 * force 없이 임의 자동 발송하지 않음 — body.confirm === true 필수.
 */
export async function POST(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: { releaseId?: string; confirm?: boolean } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const releaseId = typeof body.releaseId === "string" ? body.releaseId.trim() : "";
  if (!releaseId) return NextResponse.json({ ok: false, error: "release_id_required" }, { status: 400 });
  if (body.confirm !== true) {
    return NextResponse.json({ ok: false, error: "confirm_required" }, { status: 400 });
  }

  try {
    const result = await adminConfirmNotifyRelease(sb, releaseId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    if (msg === "app_release_not_found") {
      return NextResponse.json({ ok: false, error: msg }, { status: 404 });
    }
    console.error("[admin app-releases notify]", err);
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(msg) },
      { status: 500 }
    );
  }
}
