import { NextResponse } from "next/server";
import { requireAdminApiActor } from "@/lib/admin/require-admin-permission";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadAdminActionQueueCounts } from "@/lib/admin/admin-action-queue";

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
export async function GET() {
  const gate = await requireAdminApiActor();
  if (!gate.ok) return gate.response;

  const storesSb = tryGetSupabaseForStores();
  const notesSb = tryCreateSupabaseServiceClient();
  const counts = await loadAdminActionQueueCounts({
    storesSb,
    notesSb,
    permissionScope: {
      isSuperAdmin: gate.actor.isSuperAdmin,
      permissions: gate.actor.permissions,
    },
  });

  return NextResponse.json({
    ok: true,
    total: counts.total,
    total_complete: counts.total_complete,
    categories: counts.categories,
    by_category: counts.by_category,
    unavailable: counts.unavailable,
    observed_at: new Date().toISOString(),
  });
}
