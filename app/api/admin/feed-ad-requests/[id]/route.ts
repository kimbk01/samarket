import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  captureHeldPointsForFeedAdRequest,
  releaseHeldPointsForFeedAdRequest,
} from "@/lib/ads/feed-ad-request-point-flow";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/feed-ad-requests/[id]
 * body: { action: "approve" | "reject", reason?: string }
 *
 * Approve: validate → CAPTURE → create MEMBER_REQUESTED campaign + creatives → link.
 * Reject: reason required → RELEASE → status rejected · campaign 0.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await params;
  const requestId = id.trim();
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  let body: { action?: string; reason?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action ?? "").trim();
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: reqRow, error: fetchErr } = await sb
    .from("feed_ad_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (fetchErr || !reqRow) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const row = reqRow as Record<string, unknown>;
  if (String(row.status) !== "pending_review") {
    return NextResponse.json({ ok: false, error: "not_pending" }, { status: 409 });
  }

  const userId = String(row.user_id ?? "");
  const pointCost = Number(row.point_cost ?? 0);
  const durationDays = Number(row.duration_days ?? 7);
  const now = new Date();
  const end = new Date(now.getTime() + durationDays * 86_400_000);

  if (action === "reject") {
    const reason = String(body.reason ?? "").trim();
    if (!reason) {
      return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
    }
    const released = await releaseHeldPointsForFeedAdRequest(sb, { requestId });
    if (!released.ok) {
      return NextResponse.json({ ok: false, error: released.error }, { status: 500 });
    }
    const { error: upd } = await sb
      .from("feed_ad_requests")
      .update({
        status: "rejected",
        review_reason: reason.slice(0, 500),
        reviewed_by: admin.userId,
        reviewed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", requestId);
    if (upd) {
      return NextResponse.json({ ok: false, error: upd.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  if (action !== "approve") {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const { data: creatives, error: crErr } = await sb
    .from("feed_ad_request_creatives")
    .select("*")
    .eq("request_id", requestId)
    .order("sort_order", { ascending: true });
  if (crErr) {
    return NextResponse.json({ ok: false, error: crErr.message }, { status: 500 });
  }
  const slides = (creatives ?? []).filter(
    (c) => String((c as { image_url?: string }).image_url ?? "").trim().length > 0
  );
  if (slides.length < 1) {
    return NextResponse.json({ ok: false, error: "creatives_missing" }, { status: 400 });
  }

  const captured = await captureHeldPointsForFeedAdRequest(sb, {
    requestId,
    userId,
    pointCost,
  });
  if (!captured.ok) {
    return NextResponse.json({ ok: false, error: captured.error }, { status: 500 });
  }

  const { data: campaign, error: campErr } = await sb
    .from("feed_ad_campaigns")
    .insert({
      name: `Member · ${String(row.product_id ?? "")}`,
      domain: String(row.domain),
      placement: String(row.placement),
      target_category_id: row.target_category_id,
      target_topic_slug: row.target_topic_slug,
      status: "active",
      priority: 50,
      start_at: now.toISOString(),
      end_at: end.toISOString(),
      destination_type: String(row.destination_type ?? "internal_page"),
      destination_id: String(row.destination_id ?? ""),
      destination_url: String(row.destination_url ?? ""),
      source: "MEMBER_REQUESTED",
      request_id: requestId,
      created_by: admin.userId,
    })
    .select("id")
    .maybeSingle();

  if (campErr || !campaign?.id) {
    // Campaign failed after capture — release funds so member is not charged without ad.
    await releaseHeldPointsForFeedAdRequest(sb, { requestId }).catch(() => null);
    return NextResponse.json(
      { ok: false, error: campErr?.message ?? "campaign_create_failed" },
      { status: 500 }
    );
  }

  const campaignId = String(campaign.id);
  const { error: slideErr } = await sb.from("feed_ad_creatives").insert(
    slides.map((c, i) => {
      const cr = c as Record<string, unknown>;
      return {
        campaign_id: campaignId,
        sort_order: i + 1,
        image_url: String(cr.image_url ?? ""),
        alt_text: String(cr.alt_text ?? ""),
        headline: String(cr.headline ?? ""),
        is_active: true,
      };
    })
  );

  if (slideErr) {
    await sb.from("feed_ad_campaigns").delete().eq("id", campaignId);
    await releaseHeldPointsForFeedAdRequest(sb, { requestId }).catch(() => null);
    return NextResponse.json({ ok: false, error: slideErr.message }, { status: 500 });
  }

  const { error: updReq } = await sb
    .from("feed_ad_requests")
    .update({
      status: "active",
      campaign_id: campaignId,
      start_at: now.toISOString(),
      end_at: end.toISOString(),
      reviewed_by: admin.userId,
      reviewed_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", requestId);

  if (updReq) {
    return NextResponse.json({ ok: false, error: updReq.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: "active", campaignId });
}
