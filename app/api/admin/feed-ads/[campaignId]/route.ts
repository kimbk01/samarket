import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { listFeedAdCampaignsByIdsForAdmin } from "@/lib/ads/feed-ad-campaigns-db";
import {
  applyFeedAdCampaignPatch,
  planFeedAdCampaignPatch,
  type FeedAdCampaignPatchInput,
} from "@/lib/ads/update-feed-ad-campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/feed-ads/[campaignId] — 피드 배너 1건 (수정 화면용) */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ campaignId: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const { campaignId } = await ctx.params;
  const [campaign] = await listFeedAdCampaignsByIdsForAdmin(sb, [campaignId]);
  if (!campaign) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, campaign });
}

/** PATCH — 피드 배너 수정 (감사 AD-10 · Owner J-8). 범위 규칙은 `planFeedAdCampaignPatch`. */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ campaignId: string }> }
): Promise<NextResponse> {
  // IA-04 (K-2): 광고·홍보 콘텐츠 쓰기 = ads 키 (메뉴·CTA·API 동일 — admin-route-access.ts)
  const gate = await requireAdminPermission("ads");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const { campaignId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as FeedAdCampaignPatchInput;

  const [before] = await listFeedAdCampaignsByIdsForAdmin(sb, [campaignId]);
  if (!before) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const plan = planFeedAdCampaignPatch(before, body);
  if (!plan.ok) return NextResponse.json({ ok: false, error: plan.error }, { status: plan.status });

  const applied = await applyFeedAdCampaignPatch(sb, campaignId, before.status, plan);
  if (!applied.ok) return NextResponse.json({ ok: false, error: applied.error }, { status: applied.status });

  const [after] = await listFeedAdCampaignsByIdsForAdmin(sb, [campaignId]);
  await appendAdminRouteAudit(sb, req, {
    actorId: admin.userId,
    targetType: "feed_ad_campaign",
    targetId: campaignId,
    action: "feed_ad_campaign.update",
    before: before as unknown as Record<string, unknown>,
    after: (after ?? null) as unknown as Record<string, unknown> | null,
  });
  return NextResponse.json({ ok: true, campaign: after ?? null });
}
