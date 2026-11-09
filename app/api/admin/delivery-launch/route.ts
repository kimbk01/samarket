import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";
import {
  DELIVERY_LAUNCH_SERVER_CACHE_TAG,
  listDeliveryLaunchLogs,
  listDeliveryLaunchReviewers,
  readDeliveryLaunchSettings,
  saveDeliveryLaunchSettingsCas,
} from "@/lib/delivery/launch/delivery-launch-settings.server";
import {
  normalizeDeliveryLaunchContent,
  normalizeFreeUntil,
} from "@/lib/delivery/launch/delivery-launch-contract";
import { internalErrorResponse } from "@/lib/security/internal-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — 배달 오픈 관리 현재 값 + 변경 이력 + 현황 숫자 (관리자 전원 조회) */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  try {
    const r = await readDeliveryLaunchSettings(sb);
    if (!r.ok) return internalErrorResponse("load_failed", "[/api/admin/delivery-launch GET]", r.error, 500);
    const [logs, reviewers, visibleRes, realRes, pendingRes] = await Promise.all([
      r.tableMissing ? Promise.resolve([]) : listDeliveryLaunchLogs(sb, 20),
      listDeliveryLaunchReviewers(sb),
      sb.from("stores").select("id", { count: "exact", head: true }).eq("approval_status", "approved").eq("is_visible", true),
      sb
        .from("stores")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "approved")
        .eq("is_visible", true)
        .eq("store_kind", "real"),
      sb
        .from("stores")
        .select("id", { count: "exact", head: true })
        .in("approval_status", ["pending", "under_review", "revision_requested"]),
    ]);
    return NextResponse.json({
      ok: true,
      settings: r.settings,
      migrationApplied: !r.tableMissing,
      logs,
      reviewers,
      counts: {
        visibleStores: visibleRes.count ?? null,
        visibleRealStores: realRes.count ?? null,
        pendingApplications: pendingRes.count ?? null,
      },
    });
  } catch (e) {
    return internalErrorResponse("load_failed", "[/api/admin/delivery-launch GET]", e, 500);
  }
}

/**
 * PUT — 저장 (최고관리자). 읽은 revision 으로만 저장하고, 그 사이 다른 관리자가 저장했으면 409.
 * 저장 후 공개 캐시 태그 무효화 + 배달 공개 캐시 세대 올림.
 */
export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const expectedRevision = Number(body.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    return NextResponse.json({ ok: false, error: "invalid_expected_revision" }, { status: 400 });
  }
  if (body.mode !== "open" && body.mode !== "recruiting") {
    return NextResponse.json({ ok: false, error: "invalid_mode" }, { status: 400 });
  }
  const freeUntilRaw = body.freeUntil;
  const freeUntil = freeUntilRaw == null || freeUntilRaw === "" ? null : normalizeFreeUntil(freeUntilRaw);
  if (freeUntilRaw != null && freeUntilRaw !== "" && !freeUntil) {
    return NextResponse.json({ ok: false, error: "invalid_free_until" }, { status: 400 });
  }
  const content = normalizeDeliveryLaunchContent(body.content);
  if (body.mode === "recruiting" && !content.texts.ko.title) {
    return NextResponse.json({ ok: false, error: "title_required_for_recruiting" }, { status: 400 });
  }

  try {
    const before = await readDeliveryLaunchSettings(sb);
    const saved = await saveDeliveryLaunchSettingsCas(sb, {
      expectedRevision,
      mode: body.mode,
      freeUntil,
      fabEnabled: body.fabEnabled !== false,
      content,
      actorId: gate.actor.userId,
    });
    if (!saved.ok) {
      if (saved.error === "stale_revision") {
        return NextResponse.json(
          { ok: false, error: "stale_revision", currentRevision: "currentRevision" in saved ? saved.currentRevision : -1 },
          { status: 409 }
        );
      }
      const status = saved.error === "migration_not_applied" ? 503 : 400;
      return NextResponse.json({ ok: false, error: saved.error }, { status });
    }

    revalidateTag(DELIVERY_LAUNCH_SERVER_CACHE_TAG, { expire: 0 });
    bumpStorePublicSharedCacheGeneration("delivery_launch_settings_saved");

    await appendAdminRouteAudit(sb, req, {
      actorId: gate.actor.userId,
      targetType: "delivery_launch_settings",
      targetId: "1",
      action: "delivery_launch.save",
      before: before.ok
        ? { mode: before.settings.mode, free_until: before.settings.freeUntil, revision: before.settings.revision }
        : null,
      after: { mode: body.mode, free_until: freeUntil, revision: saved.revision },
    });

    const after = await readDeliveryLaunchSettings(sb);
    return NextResponse.json({ ok: true, revision: saved.revision, settings: after.ok ? after.settings : null });
  } catch (e) {
    return internalErrorResponse("save_failed", "[/api/admin/delivery-launch PUT]", e, 500);
  }
}
