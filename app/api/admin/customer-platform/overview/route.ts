import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadAdminActionQueueCounts } from "@/lib/admin/admin-action-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/customer-platform/overview
 *
 * Action Queue = same ADMIN ACTION QUEUE SSOT as /api/admin/admin-bell.
 * Monitoring remains informational (not Bell total).
 */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const storesSb = tryGetSupabaseForStores();
  const notesSb = tryCreateSupabaseServiceClient();

  const [counts, noticesRes, campaignsRes, memberInboxRes] = await Promise.all([
    loadAdminActionQueueCounts({ storesSb, notesSb }),
    notesSb
      ? notesSb.from("app_notices").select("id", { count: "exact", head: true }).eq("is_active", true)
      : Promise.resolve({ count: 0, error: null }),
    notesSb
      ? notesSb.from("admin_notification_campaigns").select("id", { count: "exact", head: true })
      : Promise.resolve({ count: 0, error: null }),
    notesSb
      ? notesSb
          .from("member_admin_note_threads")
          .select("id", { count: "exact", head: true })
          .eq("started_by", "admin")
      : Promise.resolve({ count: 0, error: null }),
  ]);

  const safe = (res: { count?: number | null; error?: { message?: string } | null }) =>
    res.error ? 0 : res.count ?? 0;

  return NextResponse.json({
    ok: true,
    action_queue: {
      support_actionable: counts.support_actionable,
      member_inquiry_open: counts.member_inquiry_open,
      store_inquiry_open: counts.store_inquiry_open,
      platform_inquiry_open: counts.platform_inquiry_open,
      member_charge_pending: counts.user_charges,
      store_charge_pending: counts.store_charges,
      feed_ad_pending: counts.feed_ad_requests,
      reports_pending: counts.by_category.reports,
      delivery_alerts: counts.delivery_alerts,
      community_reports_pending: counts.community_reports,
      /** Same SSOT total as Admin Bell */
      total: counts.total,
    },
    monitoring: {
      member_inbox_threads: safe(memberInboxRes),
      app_notices_active: safe(noticesRes),
      notification_campaigns: safe(campaignsRes),
    },
  });
}
