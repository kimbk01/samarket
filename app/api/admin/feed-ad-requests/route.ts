import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  projectFeedAdOpsProductStatus,
  type FeedAdOpsProductStatus,
} from "@/lib/ads/feed-ad-ops-presentation";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/feed-ad-requests?status=pending_review|active|rejected|cancelled|ended| */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const status = (req.nextUrl.searchParams.get("status") || "").trim();
  let q = sb.from("feed_ad_requests").select("*").order("created_at", { ascending: false }).limit(100);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    if (error.message?.includes("feed_ad_requests")) {
      return NextResponse.json({ ok: true, requests: [], tableMissing: true, statusCounts: {} });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const ids = (data ?? []).map((r) => String((r as { id?: string }).id ?? "")).filter(Boolean);
  const userIds = [
    ...new Set(
      (data ?? [])
        .map((r) => String((r as { user_id?: string }).user_id ?? "").trim())
        .filter(Boolean)
    ),
  ];

  const [{ data: creatives }, { data: profiles }, countRows] = await Promise.all([
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
    Promise.all(
      (["pending_review", "active", "rejected", "cancelled", "ended"] as const).map(async (st) => {
        const { count } = await sb
          .from("feed_ad_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", st);
        return [st, count ?? 0] as const;
      })
    ),
  ]);

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

  const statusCounts: Record<string, number> = {};
  for (const [st, n] of countRows) statusCounts[st] = n;

  return NextResponse.json({
    ok: true,
    statusCounts,
    requests: (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const id = String(row.id ?? "");
      const userId = String(row.user_id ?? "");
      const requestStatus = String(row.status ?? "");
      const startAt = row.start_at != null ? String(row.start_at) : null;
      const endAt = row.end_at != null ? String(row.end_at) : null;
      const productStatus: FeedAdOpsProductStatus = projectFeedAdOpsProductStatus({
        requestStatus,
        startAt,
        endAt,
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
        campaignId: row.campaign_id != null ? String(row.campaign_id) : null,
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
    }),
  });
}
