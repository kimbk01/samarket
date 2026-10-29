import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { ADMIN_REASON_REQUIRED_CODE } from "@/lib/admin/operator-ux/admin-reason";
import { ADMIN_STORE_REASON_MIN_LENGTH } from "@/lib/admin-business/admin-store-decision";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { executeAdminStorePatchAction } from "@/lib/admin-business/execute-admin-store-patch-action.server";
import {
  buildAdminStoreBulkPatchBody,
  parseAdminStoreBulkIds,
  summarizeAdminStoreBulkResults,
  type AdminStoreBulkResult,
} from "@/lib/admin-business/admin-store-bulk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONCURRENCY = 4;

/**
 * 3-C B-2·B-3 — 관리자 매장 일괄 노출·숨김·공통 수정 (노출·영업 중 여부·영업시간·배달 반경·추천 매장만 — `ADMIN_STORE_BULK_ACTIONS`).
 * 매장마다 단건 PATCH 와 같은 `executeAdminStorePatchAction` 을 실행 → 검증·감사·캐시 무효화 동일.
 * 결과는 매장별 성공/실패. 일괄 = L3(사유 필수) — 요약 감사 1건 추가.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const ids = parseAdminStoreBulkIds(raw.store_ids);
  if (!ids.ok) return NextResponse.json({ ok: false, error: ids.error }, { status: 400 });

  const built = buildAdminStoreBulkPatchBody(raw);
  if (!built.ok) return NextResponse.json({ ok: false, error: built.error }, { status: 400 });
  if (String(built.body.reason ?? "").length < ADMIN_STORE_REASON_MIN_LENGTH) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const actorId = (await getRouteUserId()) ?? gate.actor.userId;
  const requestMeta = getAuditRequestMeta(req);

  const results: AdminStoreBulkResult[] = new Array(ids.ids.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < ids.ids.length) {
      const i = cursor++;
      const storeId = ids.ids[i]!;
      try {
        const res = await executeAdminStorePatchAction({
          id: storeId,
          body: { ...built.body },
          actorId,
          requestMeta,
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        results[i] = {
          store_id: storeId,
          ok: res.ok && json?.ok === true,
          status: res.status,
          ...(json?.ok === true ? {} : { error: String(json?.error ?? "update_failed") }),
        };
      } catch (e) {
        console.error("[admin/stores bulk]", storeId, e);
        results[i] = { store_id: storeId, ok: false, status: 500, error: "update_failed" };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.ids.length) }, worker));

  const summary = summarizeAdminStoreBulkResults(results);
  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actorId,
    target_type: "store_bulk",
    target_id: `bulk:${String(raw.action)}`,
    action: `store.bulk.${String(raw.action)}`,
    before_json: null,
    after_json: {
      reason: built.body.reason ?? null,
      patch_action: built.body.action,
      requested: summary.total,
      success: summary.success,
      failed: summary.failed,
      store_ids: ids.ids,
      failed_store_ids: results.filter((r) => !r.ok).map((r) => r.store_id),
    },
    ip: requestMeta.ip,
    user_agent: requestMeta.userAgent,
  });

  return NextResponse.json({ ok: true, results, summary });
}
