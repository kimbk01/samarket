import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
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
 */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const storesSb = tryGetSupabaseForStores();
  const notesSb = tryCreateSupabaseServiceClient();
  const counts = await loadAdminActionQueueCounts({ storesSb, notesSb });

  return NextResponse.json({
    ok: true,
    total: counts.total,
    by_category: counts.by_category,
  });
}
