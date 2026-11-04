import { NextRequest, NextResponse } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { listEligibleFeedAdCampaigns } from "@/lib/ads/feed-ad-campaigns-db";
import {
  listEligibleCampaignsForPlacement,
  selectCampaignsForPlacement,
  type FeedAdDomain,
  type FeedAdPlacement,
} from "@/lib/ads/feed-ad-placement";
import { feedAdPublicValidUntil, projectFeedAdPublicCampaign } from "@/lib/ads/feed-ad-public-projection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" };

/**
 * GET /api/feed-ads/active?domain=&placement=&categoryId=&topicSlug=&slotOrdinal=&pool=1
 * - default: select up to 3 campaigns for slot (also `campaign` = first for compat)
 * - pool=1: return eligible campaign pool for surface (no slot selection) — feed-level fetch
 *
 * PV-3 (2026-11-04): 응답은 공개 투영(`projectFeedAdPublicCampaign`)만 — 기간·우선순위·출처·신청 id·상태·원래 이름 없음.
 * 서버가 지금 노출 가능한 것만 순서대로 보내고, 다음 재조회 시각 `validUntil` 만 싣는다(종료일 자체는 싣지 않음).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const domain = (req.nextUrl.searchParams.get("domain") === "community"
    ? "community"
    : "trade") as FeedAdDomain;
  const placement = (req.nextUrl.searchParams.get("placement") ??
    (domain === "trade" ? "TRADE_HOME" : "COMMUNITY_HOME")) as FeedAdPlacement;
  const categoryId = req.nextUrl.searchParams.get("categoryId");
  const topicSlug = req.nextUrl.searchParams.get("topicSlug");
  const wantPool = req.nextUrl.searchParams.get("pool") === "1";

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, campaign: null, campaigns: [], validUntil: null });
  }

  try {
    const nowMs = Date.now();
    const all = await listEligibleFeedAdCampaigns(sb, domain);
    if (wantPool) {
      const pool = listEligibleCampaignsForPlacement(all, {
        domain,
        placement,
        categoryId,
        topicSlug,
        nowMs,
      });
      const campaigns = pool.map(projectFeedAdPublicCampaign);
      return NextResponse.json(
        { ok: true, campaigns, campaign: campaigns[0] ?? null, validUntil: feedAdPublicValidUntil(pool, nowMs) },
        { headers: CACHE }
      );
    }

    const slotOrdinalRaw = req.nextUrl.searchParams.get("slotOrdinal");
    const slotOrdinal = slotOrdinalRaw != null ? Number(slotOrdinalRaw) : 0;
    const feedSessionId = req.nextUrl.searchParams.get("feedSessionId");
    const viewerSalt = req.nextUrl.searchParams.get("viewerSalt");
    const picked = selectCampaignsForPlacement(all, {
      domain,
      placement,
      categoryId,
      topicSlug,
      nowMs,
      slotOrdinal: Number.isFinite(slotOrdinal) ? Math.max(0, Math.floor(slotOrdinal)) : 0,
      feedSessionId,
      viewerSalt,
    });
    const campaigns = picked.map(projectFeedAdPublicCampaign);
    return NextResponse.json(
      { ok: true, campaigns, campaign: campaigns[0] ?? null, validUntil: feedAdPublicValidUntil(picked, nowMs) },
      { headers: CACHE }
    );
  } catch {
    return NextResponse.json({ ok: true, campaign: null, campaigns: [], validUntil: null });
  }
}
