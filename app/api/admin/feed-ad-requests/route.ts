import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  projectFeedAdOpsProductStatus,
  type FeedAdOpsProductStatus,
} from "@/lib/ads/feed-ad-ops-presentation";
import { syncFeedAdRequestEndedWithCampaign } from "@/lib/ads/sync-feed-ad-request-ended";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPS_FILTERS = new Set([
  "pending_review",
  "scheduled",
  "active",
  "rejected",
  "cancelled",
  "ended",
]);

type CampRow = {
  id: string;
  status: string;
  start_at: string | null;
  end_at: string | null;
};

/**
 * GET /api/admin/feed-ad-requests?status=pending_review|scheduled|active|rejected|cancelled|ended|
 *
 * CONTRACT: filter + statusCounts use **productStatus** (campaign status + window),
 * not raw feed_ad_requests.status alone. Stale request=active + campaign=ended ⇒ ended.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const statusFilter = (req.nextUrl.searchParams.get("status") || "").trim();
  if (statusFilter && !OPS_FILTERS.has(statusFilter)) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("feed_ad_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    if (error.message?.includes("feed_ad_requests")) {
      return NextResponse.json({ ok: true, requests: [], tableMissing: true, statusCounts: {} });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = rows.map((r) => String(r.id ?? "")).filter(Boolean);
  const userIds = [
    ...new Set(rows.map((r) => String(r.user_id ?? "").trim()).filter(Boolean)),
  ];
  const campaignIds = [
    ...new Set(
      rows
        .map((r) => (r.campaign_id != null ? String(r.campaign_id) : ""))
        .filter(Boolean)
    ),
  ];

  const [{ data: creatives }, { data: profiles }, { data: campaigns }] = await Promise.all([
    ids.length
      ? sb
          .from("feed_ad_request_creatives")
          .select("*")
          .in("request_id", ids)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
    userIds.length
      ? sb.from("profiles").select("id, nickname").in("id", userIds)
      : Promise.resolve({ data: [] as unknown[] }),
    campaignIds.length
      ? sb
          .from("feed_ad_campaigns")
          .select("id, status, start_at, end_at")
          .in("id", campaignIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const campById = new Map<string, CampRow>();
  for (const c of campaigns ?? []) {
    const row = c as Record<string, unknown>;
    const id = String(row.id ?? "");
    if (!id) continue;
    campById.set(id, {
      id,
      status: String(row.status ?? ""),
      start_at: row.start_at != null ? String(row.start_at) : null,
      end_at: row.end_at != null ? String(row.end_at) : null,
    });
  }

  // Repair: campaign already ended but request still open → sync request (idempotent).
  const repairJobs: Promise<unknown>[] = [];
  for (const r of rows) {
    const rid = String(r.id ?? "");
    const cid = r.campaign_id != null ? String(r.campaign_id) : "";
    const reqSt = String(r.status ?? "").toLowerCase();
    if (!rid || !cid) continue;
    if (reqSt !== "active" && reqSt !== "approved") continue;
    const camp = campById.get(cid);
    if (!camp || String(camp.status).toLowerCase() !== "ended") continue;
    repairJobs.push(
      syncFeedAdRequestEndedWithCampaign(sb, {
        requestId: rid,
        reason: "campaign_ended_repair",
        endAt: camp.end_at,
      }).then((res) => {
        if (res.ok && res.updated) {
          r.status = "ended";
          if (camp.end_at) r.end_at = camp.end_at;
        }
      })
    );
  }
  if (repairJobs.length) await Promise.all(repairJobs);

  const byReq = new Map<string, unknown[]>();
  for (const c of creatives ?? []) {
    const row = c as Record<string, unknown>;
    const rid = String(row.request_id ?? "");
    const list = byReq.get(rid) ?? [];
    list.push(row);
    byReq.set(rid, list);
  }
  const nickByUser = new Map<string, string>();
  for (const p of profiles ?? []) {
    const row = p as { id?: string; nickname?: string | null };
    const id = String(row.id ?? "");
    if (id) nickByUser.set(id, String(row.nickname ?? "").trim());
  }

  const mapped = rows.map((row) => {
    const id = String(row.id ?? "");
    const userId = String(row.user_id ?? "");
    const requestStatus = String(row.status ?? "");
    const cid = row.campaign_id != null ? String(row.campaign_id) : "";
    const camp = cid ? campById.get(cid) : undefined;
    const productStatus: FeedAdOpsProductStatus = projectFeedAdOpsProductStatus({
      requestStatus,
      startAt: row.start_at != null ? String(row.start_at) : null,
      endAt: row.end_at != null ? String(row.end_at) : null,
      campaignStatus: camp?.status ?? null,
      campaignStartAt: camp ? camp.start_at : undefined,
      campaignEndAt: camp ? camp.end_at : undefined,
    });
    return {
      id,
      userId,
      memberLabel: nickByUser.get(userId) || `${userId.slice(0, 8)}…`,
      status: requestStatus,
      productStatus,
      domain: String(row.domain ?? ""),
      placement: String(row.placement ?? ""),
      productId: String(row.product_id ?? ""),
      pointCost: Number(row.point_cost ?? 0),
      durationDays: Number(row.duration_days ?? 0),
      targetCategoryId: row.target_category_id != null ? String(row.target_category_id) : null,
      targetTopicSlug: row.target_topic_slug != null ? String(row.target_topic_slug) : null,
      destinationType: String(row.destination_type ?? ""),
      destinationId: String(row.destination_id ?? ""),
      destinationUrl: String(row.destination_url ?? ""),
      reviewReason: row.review_reason != null ? String(row.review_reason) : null,
      campaignId: cid || null,
      campaignStatus: camp?.status ?? null,
      startAt: camp?.start_at ?? (row.start_at != null ? String(row.start_at) : null),
      endAt: camp?.end_at ?? (row.end_at != null ? String(row.end_at) : null),
      createdAt: String(row.created_at ?? ""),
      creatives: (byReq.get(id) ?? []).map((c) => {
        const cr = c as Record<string, unknown>;
        return {
          sortOrder: Number(cr.sort_order ?? 1),
          imageUrl: String(cr.image_url ?? ""),
          altText: String(cr.alt_text ?? ""),
          headline: String(cr.headline ?? ""),
        };
      }),
    };
  });

  const statusCounts: Record<string, number> = {
    pending_review: 0,
    scheduled: 0,
    active: 0,
    rejected: 0,
    cancelled: 0,
    ended: 0,
  };
  for (const row of mapped) {
    statusCounts[row.productStatus] = (statusCounts[row.productStatus] ?? 0) + 1;
  }

  const requests = statusFilter
    ? mapped.filter((r) => r.productStatus === statusFilter)
    : mapped;

  return NextResponse.json({
    ok: true,
    statusCounts,
    requests,
  });
}
