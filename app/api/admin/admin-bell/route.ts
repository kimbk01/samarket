import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiActor } from "@/lib/admin/require-admin-permission";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadAdminActionQueueCounts } from "@/lib/admin/admin-action-queue";
import { loadAdminInboxSummary } from "@/lib/admin/notifications/admin-inbox-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/admin-bell
 *
 * Durable ADMIN ACTION QUEUE COUNT SSOT — actionable pending workload.
 * HARD LOCK: ADMIN_Q ≠ Member /api/me/notifications unread.
 * Realtime is wake-up only (AdminStorePointPendingProvider = AdminOpsRealtimeBridge).
 *
 * Contract (registry-derived):
 *   categories[] — { key, count|null, status: ok|unavailable|forbidden, inTotal, nextActor, listHref }
 *   total        — Σ ok counts of total categories the caller is permitted to act on
 *   total_complete=false → at least one visible total category failed (UI must not show a clean number)
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminApiActor();
  if (!gate.ok) return gate.response;

  const storesSb = tryGetSupabaseForStores();
  const notesSb = tryCreateSupabaseServiceClient();
  /**
   * 2026-11-22 관리자 폴링 한 요청으로 — `?with_inbox=1` 이면 받은 알림 요약(`/api/admin/inbox?summary=1` 과 같은 계산·권한)을 함께.
   * 관리자 확인 1번으로 두 숫자. 요약 실패는 그 필드만 `{ ok:false }`(아이콘 「!」).
   * HARD LOCK 유지: 두 숫자는 따로 둔다(합치지 않음).
   */
  const withInbox = req.nextUrl.searchParams.get("with_inbox") === "1";
  const [counts, inbox] = await Promise.all([
    loadAdminActionQueueCounts({
      storesSb,
      notesSb,
      permissionScope: {
        isSuperAdmin: gate.actor.isSuperAdmin,
        permissions: gate.actor.permissions,
      },
    }),
    withInbox
      ? loadAdminInboxSummary(gate.sb, gate.actor).catch(() => ({ ok: false as const, error: "inbox_summary_failed" }))
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    ok: true,
    total: counts.total,
    total_complete: counts.total_complete,
    categories: counts.categories,
    by_category: counts.by_category,
    unavailable: counts.unavailable,
    observed_at: new Date().toISOString(),
    ...(inbox ? { inbox } : {}),
  });
}
