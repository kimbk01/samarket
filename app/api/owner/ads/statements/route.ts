/**
 * GET /api/owner/ads/statements?storeId=
 * Owner Advertising Statement (role mask) for store campaigns + popup requests.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  maskAdvertisingStatement,
  statementFromDeliveryCampaign,
  statementFromPlatformPopup,
} from "@/lib/ads/advertising-statement";
import { STORE_BANNER_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-banner-ad-campaign-authority";
import { STORE_PAID_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-paid-ad-campaign-authority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const storeId = (req.nextUrl.searchParams.get("storeId") ?? "").trim();
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "storeId_required" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { data: store } = await sb
    .from("stores")
    .select("id, store_name, owner_user_id")
    .eq("id", storeId)
    .maybeSingle();
  if (!store?.id || String((store as { owner_user_id?: string }).owner_user_id) !== auth.userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const [sponsored, banners, popups] = await Promise.all([
    sb
      .from(STORE_PAID_AD_CAMPAIGN_TABLE)
      .select("id, lifecycle_status, start_at, end_at, created_at, store_id")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(40),
    sb
      .from(STORE_BANNER_AD_CAMPAIGN_TABLE)
      .select("id, lifecycle_status, start_at, end_at, created_at, store_id, inventory_key")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(40),
    sb
      .from("platform_popup_owner_requests")
      .select("id, request_status, created_at, store_id, title")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const storeName = String((store as { store_name?: string }).store_name ?? "");
  const statements = [
    ...((sponsored.data ?? []) as Record<string, unknown>[]).map((row) =>
      maskAdvertisingStatement(
        statementFromDeliveryCampaign({
          campaignId: String(row.id ?? ""),
          productKind: "store_sponsored",
          inventoryKey: "STORES_HOME_FEED",
          source: "OWNER",
          storeId,
          storeName,
          lifecycleStatus: String(row.lifecycle_status ?? ""),
          startAt: row.start_at != null ? String(row.start_at) : null,
          endAt: row.end_at != null ? String(row.end_at) : null,
          createdAt: row.created_at != null ? String(row.created_at) : null,
        }),
        "owner"
      )
    ),
    ...((banners.data ?? []) as Record<string, unknown>[]).map((row) =>
      maskAdvertisingStatement(
        statementFromDeliveryCampaign({
          campaignId: String(row.id ?? ""),
          productKind: "banner",
          inventoryKey: String(row.inventory_key ?? "STORES_HOME_HERO"),
          source: "OWNER",
          storeId,
          storeName,
          lifecycleStatus: String(row.lifecycle_status ?? ""),
          startAt: row.start_at != null ? String(row.start_at) : null,
          endAt: row.end_at != null ? String(row.end_at) : null,
          createdAt: row.created_at != null ? String(row.created_at) : null,
        }),
        "owner"
      )
    ),
    ...((popups.data ?? []) as Record<string, unknown>[]).map((row) =>
      maskAdvertisingStatement(
        statementFromPlatformPopup({
          id: String(row.id ?? ""),
          surface: "DELIVERY",
          source: "OWNER",
          storeId,
          status: String(row.request_status ?? ""),
          advertiserLabel: String(row.title ?? storeName),
          createdAt: row.created_at != null ? String(row.created_at) : null,
        }),
        "owner"
      )
    ),
  ];

  return NextResponse.json({ ok: true, statements });
}
