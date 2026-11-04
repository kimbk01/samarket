import { NextResponse } from "next/server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import {
  APP_RELEASE_ADMIN_SCREEN_OUTDATED,
  appReleaseConfirmText,
} from "@/lib/app-releases/app-release-notify-policy";
import {
  adminConfirmNotifyRelease,
  loadAppReleaseById,
  previewAdminConfirmNotifyRelease,
} from "@/lib/app-releases/app-release-sync";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFoundOr500(err: unknown, tag: string) {
  const msg = String(err instanceof Error ? err.message : err);
  if (msg === "app_release_not_found") {
    return NextResponse.json({ ok: false, error: msg }, { status: 404 });
  }
  console.error(tag, err);
  return NextResponse.json({ ok: false, error: clientSafeInternalErrorMessage(msg) }, { status: 500 });
}

/**
 * GET ?releaseId= — 「발송 확정」 확인창용 미리보기(대상 버전·예상 대상 수). 읽기만 한다.
 */
export async function GET(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const releaseId = new URL(req.url).searchParams.get("releaseId")?.trim() ?? "";
  if (!releaseId) return NextResponse.json({ ok: false, error: "release_id_required" }, { status: 400 });
  try {
    const release = await loadAppReleaseById(sb, releaseId);
    const preview = await previewAdminConfirmNotifyRelease(sb, release);
    return NextResponse.json({ ok: true, confirmText: appReleaseConfirmText(release), ...preview });
  } catch (err) {
    return notFoundOr500(err, "[admin app-releases notify preview]");
  }
}

/**
 * POST — 관리자 수동 발송 확정 (L3: 사유 + 대상 버전 재입력 + 감사 기록).
 * Play API 로 production completed 를 검증할 수 없을 때(단계적·closed testing 등)에도 쓸 수 있다.
 * 사유·재입력 없이 오는 요청(예전 관리자 화면)은 보내지 않고 새로고침 안내 오류를 준다.
 */
export async function POST(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: { releaseId?: string; confirm?: boolean; reason?: unknown; confirmText?: unknown } = {};
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
  if (body.reason === undefined && body.confirmText === undefined) {
    return NextResponse.json({ ok: false, error: APP_RELEASE_ADMIN_SCREEN_OUTDATED }, { status: 409 });
  }
  const reason = parseAdminReason(body.reason);
  if (!reason) return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });

  try {
    const release = await loadAppReleaseById(sb, releaseId);
    const expected = appReleaseConfirmText(release);
    if (typeof body.confirmText !== "string" || body.confirmText.trim() !== expected) {
      return NextResponse.json({ ok: false, error: "confirm_text_mismatch" }, { status: 400 });
    }
    const result = await adminConfirmNotifyRelease(sb, release);
    await appendAdminRouteAudit(sb, req, {
      actorId: admin.userId,
      targetType: "app_release",
      targetId: releaseId,
      action: "app_release.notify_confirm",
      after: { ...result, reason, confirmText: expected },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return notFoundOr500(err, "[admin app-releases notify]");
  }
}
