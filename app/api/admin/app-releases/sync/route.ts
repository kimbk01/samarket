import { NextResponse } from "next/server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { APP_RELEASE_ADMIN_SCREEN_OUTDATED } from "@/lib/app-releases/app-release-notify-policy";
import { syncAppReleases } from "@/lib/app-releases/app-release-sync";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — 관리자 수동 출시 동기화 (D-N1). **출시 정보 수집만** — 회원 알림은 보내지 않는다(Owner 2026-11-05 L3).
 * 발송은 `/api/admin/app-releases/notify`(L3) 또는 6시간 cron 자동 발송만.
 * 본문 `{ mode: "collect_only" }` 이 없으면(예전 관리자 화면) 실행하지 않고 새로고침 안내 오류를 준다.
 */
export async function POST(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const body = (await req.json().catch(() => null)) as { mode?: unknown } | null;
  if (body?.mode !== "collect_only") {
    return NextResponse.json({ ok: false, error: APP_RELEASE_ADMIN_SCREEN_OUTDATED }, { status: 409 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  try {
    const result = await syncAppReleases(sb, { notify: false });
    await appendAdminRouteAudit(sb, req, {
      actorId: admin.userId,
      targetType: "app_release",
      targetId: "sync",
      action: "app_release.sync",
      after: { mode: "collect_only", results: result.results },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[admin app-releases sync]", err);
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(String(err)) },
      { status: 500 }
    );
  }
}
