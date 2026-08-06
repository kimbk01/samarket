import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_CHARGE_ACTIONABLE = ["pending", "waiting_confirm", "on_hold"] as const;

/**
 * GET /api/admin/customer-platform/overview
 * Action Queue + Monitoring counts — existing tables only (no new SSOT).
 */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const storesSb = tryGetSupabaseForStores();
  const notesSb = tryCreateSupabaseServiceClient();

  const empty = {
    ok: true as const,
    action_queue: {
      member_inquiry_open: 0,
      store_inquiry_open: 0,
      platform_inquiry_open: 0,
      member_charge_pending: 0,
      store_charge_pending: 0,
      total: 0,
    },
    monitoring: {
      member_inbox_threads: 0,
      app_notices_active: 0,
      notification_campaigns: 0,
    },
  };

  if (!storesSb && !notesSb) {
    return NextResponse.json(empty);
  }

  const [
    memberInquiryRes,
    memberInboxRes,
    storeInquiryRes,
    platformInquiryRes,
    userChargesRes,
    storeChargesRes,
    noticesRes,
    campaignsRes,
  ] = await Promise.all([
    notesSb
      ? notesSb
          .from("member_admin_note_threads")
          .select("id", { count: "exact", head: true })
          .eq("started_by", "member")
          .eq("status", "open")
      : Promise.resolve({ count: 0, error: null }),
    notesSb
      ? notesSb
          .from("member_admin_note_threads")
          .select("id", { count: "exact", head: true })
          .eq("started_by", "admin")
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("store_inquiries")
          .select("id", { count: "exact", head: true })
          .eq("status", "open")
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("platform_admin_inquiries")
          .select("id", { count: "exact", head: true })
          .eq("status", "open")
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("point_charge_requests")
          .select("id", { count: "exact", head: true })
          .in("request_status", [...USER_CHARGE_ACTIONABLE])
      : Promise.resolve({ count: 0, error: null }),
    storesSb
      ? storesSb
          .from("store_point_charge_requests")
          .select("id", { count: "exact", head: true })
          .eq("request_status", "pending")
      : Promise.resolve({ count: 0, error: null }),
    notesSb
      ? notesSb.from("app_notices").select("id", { count: "exact", head: true }).eq("is_active", true)
      : Promise.resolve({ count: 0, error: null }),
    notesSb
      ? notesSb.from("admin_notification_campaigns").select("id", { count: "exact", head: true })
      : Promise.resolve({ count: 0, error: null }),
  ]);

  const safeCount = (res: { count?: number | null; error?: { message?: string } | null }) => {
    if (res.error) return 0;
    return res.count ?? 0;
  };

  const member_inquiry_open = safeCount(memberInquiryRes);
  const store_inquiry_open = safeCount(storeInquiryRes);
  const platform_inquiry_open = safeCount(platformInquiryRes);
  const member_charge_pending = safeCount(userChargesRes);
  const store_charge_pending = safeCount(storeChargesRes);
  const total =
    member_inquiry_open +
    store_inquiry_open +
    platform_inquiry_open +
    member_charge_pending +
    store_charge_pending;

  return NextResponse.json({
    ok: true,
    action_queue: {
      member_inquiry_open,
      store_inquiry_open,
      platform_inquiry_open,
      member_charge_pending,
      store_charge_pending,
      total,
    },
    monitoring: {
      member_inbox_threads: safeCount(memberInboxRes),
      app_notices_active: safeCount(noticesRes),
      notification_campaigns: safeCount(campaignsRes),
    },
  });
}
