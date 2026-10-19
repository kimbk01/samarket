import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { clearStoreHomeFeedServerCache } from "@/lib/stores/store-home-feed-server-cache";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = { status?: string; reason?: string };

/** 관리자: 리뷰 숨김/복구 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ reviewId: string }> }
) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const { reviewId } = await context.params;
  const rid = typeof reviewId === "string" ? reviewId.trim() : "";
  if (!rid) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const status = String(body.status ?? "").trim();
  if (status !== "visible" && status !== "hidden") {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }
  const reason = String(body.reason ?? "").trim().slice(0, 1000) || null;
  // 숨김은 구매자 리뷰를 내리는 L2 조치 — 사유 필수 (복구는 선택).
  if (status === "hidden" && (reason ?? "").length < 2) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: prev } = await sb.from("store_reviews").select("status").eq("id", rid).maybeSingle();
  if (!prev) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const prevStatus = String((prev as { status?: unknown }).status ?? "");
  if (prevStatus === status) {
    return NextResponse.json({ ok: false, error: "status_changed" }, { status: 409 });
  }

  // 상태 조건부 — 다른 관리자가 먼저 바꿨으면 409 (덮어쓰지 않음).
  const { data: updated, error } = await sb
    .from("store_reviews")
    .update({ status })
    .eq("id", rid)
    .eq("status", prevStatus)
    .select("id, store_id")
    .maybeSingle();
  if (error) {
    console.error("[admin store-reviews PATCH]", error);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ ok: false, error: "status_changed" }, { status: 409 });
  }

  // 숨김/복구 → DB 트리거가 stores.rating_avg·review_count 를 다시 계산한다.
  // 매장 카드·상세 공개 캐시(홈 피드·browse·slug)가 이전 별점을 내지 않도록 인스턴스 공통 무효화.
  try {
    clearStoreHomeFeedServerCache();
    bumpStorePublicSharedCacheGeneration("admin_store_review.status");
  } catch (e) {
    console.error("[admin store-reviews PATCH] cache invalidate", e);
  }

  await appendAdminRouteAudit(sb, req, {
    actorId: gate.actor.userId,
    targetType: "store_review",
    targetId: rid,
    action: "store_review.status",
    before: { status: prevStatus },
    after: { status, reason, store_id: (updated as { store_id?: unknown }).store_id ?? null },
  });

  return NextResponse.json({ ok: true, status });
}
