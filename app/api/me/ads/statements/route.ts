/**
 * GET /api/me/ads/statements — Member Advertising Statement (role mask).
 * Same canonical facts as Admin; no internal memo.
 */
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  maskAdvertisingStatement,
  statementFromFeedAd,
  statementFromPointPromotionOrder,
} from "@/lib/ads/advertising-statement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const [boostRes, feedRes] = await Promise.all([
    sb
      .from("point_promotion_orders")
      .select("*")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(40),
    sb
      .from("feed_ad_requests")
      .select(
        "id, user_id, status, placement, domain, point_cost, start_at, end_at, created_at, review_reason, title"
      )
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const statements = [
    ...((boostRes.data ?? []) as Record<string, unknown>[]).map((row) =>
      maskAdvertisingStatement(statementFromPointPromotionOrder(row), "member")
    ),
    ...((feedRes.data ?? []) as Record<string, unknown>[]).map((row) =>
      maskAdvertisingStatement(
        statementFromFeedAd({
          id: String(row.id ?? ""),
          domain: String(row.domain) === "community" ? "community" : "trade",
          placement: String(row.placement ?? ""),
          source: "MEMBER",
          applicantId: String(row.user_id ?? ""),
          status: String(row.status ?? ""),
          pointCost: row.point_cost != null ? Number(row.point_cost) : null,
          startAt: row.start_at != null ? String(row.start_at) : null,
          endAt: row.end_at != null ? String(row.end_at) : null,
          publicAdminMessage: row.review_reason != null ? String(row.review_reason) : null,
          createdAt: row.created_at != null ? String(row.created_at) : null,
        }),
        "member"
      )
    ),
  ];

  return NextResponse.json({
    ok: true,
    statements,
    boostError: boostRes.error?.message ?? null,
    feedError: feedRes.error?.message ?? null,
  });
}
