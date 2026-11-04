import type { SupabaseClient } from "@supabase/supabase-js";
import { isProductionReachableFeedAdCreativeUrl } from "@/lib/ads/feed-ad-creative-url";
import { filterFeedAdCampaignsByDestination } from "@/lib/ads/feed-ad-exposure-filter";
import type {
  FeedAdCampaignView,
  FeedAdCreativeSlide,
  FeedAdDomain,
  FeedAdPlacement,
  FeedAdDestinationType,
  FeedAdCampaignStatus,
} from "@/lib/ads/feed-ad-placement";

function mapCreative(row: Record<string, unknown>): FeedAdCreativeSlide {
  return {
    id: String(row.id ?? ""),
    sortOrder: Number(row.sort_order ?? 1),
    imageUrl: String(row.image_url ?? ""),
    altText: String(row.alt_text ?? ""),
    headline: String(row.headline ?? ""),
    description: String(row.description ?? ""),
    ctaLabel: String(row.cta_label ?? ""),
    destinationType: row.destination_type
      ? (String(row.destination_type) as FeedAdDestinationType)
      : null,
    destinationId: String(row.destination_id ?? ""),
    destinationUrl: String(row.destination_url ?? ""),
  };
}

function mapCampaign(
  row: Record<string, unknown>,
  slides: FeedAdCreativeSlide[]
): FeedAdCampaignView {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    domain: String(row.domain ?? "trade") as FeedAdDomain,
    placement: String(row.placement ?? "TRADE_HOME") as FeedAdPlacement,
    targetCategoryId: row.target_category_id != null ? String(row.target_category_id) : null,
    targetTopicSlug: row.target_topic_slug != null ? String(row.target_topic_slug) : null,
    status: String(row.status ?? "draft") as FeedAdCampaignStatus,
    priority: Number(row.priority ?? 100),
    startAt: row.start_at != null ? String(row.start_at) : null,
    endAt: row.end_at != null ? String(row.end_at) : null,
    destinationType: String(row.destination_type ?? "internal_page") as FeedAdDestinationType,
    destinationId: String(row.destination_id ?? ""),
    destinationUrl: String(row.destination_url ?? ""),
    source:
      String(row.source ?? "ADMIN_DIRECT") === "MEMBER_REQUESTED"
        ? "MEMBER_REQUESTED"
        : "ADMIN_DIRECT",
    requestId: row.request_id != null ? String(row.request_id) : null,
    slides: slides
      .filter((s) => s.imageUrl.trim().length > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .slice(0, 3),
  };
}

export async function listFeedAdCampaignsForAdmin(
  sb: SupabaseClient
): Promise<FeedAdCampaignView[]> {
  const { data, error } = await sb
    .from("feed_ad_campaigns")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) {
    if (error.message?.includes("feed_ad_campaigns")) return [];
    throw new Error(error.message);
  }
  const campaigns = data ?? [];
  const ids = campaigns.map((c) => String((c as { id?: string }).id ?? "")).filter(Boolean);
  if (ids.length === 0) return [];

  const { data: creatives } = await sb
    .from("feed_ad_creatives")
    .select("*")
    .in("campaign_id", ids)
    .order("sort_order", { ascending: true });

  const byCampaign = new Map<string, FeedAdCreativeSlide[]>();
  for (const row of creatives ?? []) {
    const r = row as Record<string, unknown>;
    const cid = String(r.campaign_id ?? "");
    const list = byCampaign.get(cid) ?? [];
    list.push(mapCreative(r));
    byCampaign.set(cid, list);
  }

  return campaigns.map((c) => {
    const row = c as Record<string, unknown>;
    const id = String(row.id ?? "");
    return {
      ...mapCampaign(row, byCampaign.get(id) ?? []),
      impressionCount: Number(row.impression_count ?? 0),
      clickCount: Number(row.click_count ?? 0),
    };
  });
}

/**
 * R7 — 관리자 광고 작업 화면 페이지 행 읽기 (id 목록 = 서버 페이지 행 — 후보 상한 아님). 입력 순서 유지.
 */
export async function listFeedAdCampaignsByIdsForAdmin(
  sb: SupabaseClient,
  ids: readonly string[]
): Promise<FeedAdCampaignView[]> {
  const uniq = [...new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (uniq.length === 0) return [];
  const { data, error } = await sb.from("feed_ad_campaigns").select("*").in("id", uniq);
  if (error) {
    if (error.message?.includes("feed_ad_campaigns")) return [];
    throw new Error(error.message);
  }
  const { data: creatives } = await sb
    .from("feed_ad_creatives")
    .select("*")
    .in("campaign_id", uniq)
    .order("sort_order", { ascending: true });
  const byCampaign = new Map<string, FeedAdCreativeSlide[]>();
  for (const row of creatives ?? []) {
    const r = row as Record<string, unknown>;
    const cid = String(r.campaign_id ?? "");
    const list = byCampaign.get(cid) ?? [];
    list.push(mapCreative(r));
    byCampaign.set(cid, list);
  }
  const byId = new Map<string, FeedAdCampaignView>();
  for (const c of data ?? []) {
    const row = c as Record<string, unknown>;
    const id = String(row.id ?? "");
    byId.set(id, {
      ...mapCampaign(row, byCampaign.get(id) ?? []),
      // Owner 결정 O-4 — 공통 광고 화면 행에 노출·클릭 수
      impressionCount: Number(row.impression_count ?? 0),
      clickCount: Number(row.click_count ?? 0),
    });
  }
  return uniq.map((id) => byId.get(id)).filter((c): c is FeedAdCampaignView => c != null);
}

export async function listEligibleFeedAdCampaigns(
  sb: SupabaseClient,
  domain: FeedAdDomain
): Promise<FeedAdCampaignView[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("feed_ad_campaigns")
    .select("*")
    .eq("domain", domain)
    .eq("status", "active")
    .or(`start_at.is.null,start_at.lte.${nowIso}`)
    // ends_at > now (resolver contract) — equal instant is not eligible
    .or(`end_at.is.null,end_at.gt.${nowIso}`)
    .order("priority", { ascending: true })
    .limit(50);

  if (error) {
    if (error.message?.includes("feed_ad_campaigns")) return [];
    return [];
  }

  const campaigns = data ?? [];
  const ids = campaigns.map((c) => String((c as { id?: string }).id ?? "")).filter(Boolean);
  if (ids.length === 0) return [];

  const { data: creatives } = await sb
    .from("feed_ad_creatives")
    .select("*")
    .in("campaign_id", ids)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const byCampaign = new Map<string, FeedAdCreativeSlide[]>();
  for (const row of creatives ?? []) {
    const r = row as Record<string, unknown>;
    const cid = String(r.campaign_id ?? "");
    const list = byCampaign.get(cid) ?? [];
    list.push(mapCreative(r));
    byCampaign.set(cid, list);
  }

  // FB-C17 ③: 회원 신청 광고의 광고주 이름 = 보는 시점의 신청 회원 닉네임 (신청 id → 회원 id → 닉네임, 묶음 조회 2번)
  const nicknameByRequest = await loadMemberNicknamesByRequestId(
    sb,
    campaigns
      .filter((c) => String((c as { source?: string }).source ?? "") === "MEMBER_REQUESTED")
      .map((c) => String((c as { request_id?: string | null }).request_id ?? ""))
      .filter(Boolean)
  );

  // Defense-in-depth: drop Production-invalid creatives (localhost / QA sample / non-https).
  const mapped = campaigns
    .map((c) => {
      const row = c as Record<string, unknown>;
      const id = String(row.id ?? "");
      const view = mapCampaign(row, byCampaign.get(id) ?? []);
      return {
        ...view,
        memberNickname: view.requestId ? (nicknameByRequest.get(view.requestId) ?? null) : null,
        slides: view.slides.filter((s) =>
          isProductionReachableFeedAdCreativeUrl(s.imageUrl)
        ),
      };
    })
    .filter((c) => c.slides.length > 0);
  // DS-3 · DS-4: 목적지 없음·삭제/숨김 글·비공개 매장·끝난 이벤트로 가는 소재는 노출하지 않는다
  return filterFeedAdCampaignsByDestination(sb, mapped);
}

async function loadMemberNicknamesByRequestId(
  sb: SupabaseClient,
  requestIds: readonly string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(requestIds)];
  if (ids.length === 0) return out;
  const { data: reqs, error } = await sb.from("feed_ad_requests").select("id, user_id").in("id", ids);
  if (error) return out;
  const userByRequest = new Map<string, string>();
  for (const r of (reqs ?? []) as { id?: string; user_id?: string }[]) {
    if (r.id && r.user_id) userByRequest.set(String(r.id), String(r.user_id));
  }
  const userIds = [...new Set(userByRequest.values())];
  if (userIds.length === 0) return out;
  const { data: profiles } = await sb.from("profiles").select("id, nickname").in("id", userIds);
  const nickByUser = new Map<string, string>();
  for (const p of (profiles ?? []) as { id?: string; nickname?: string | null }[]) {
    if (p.id) nickByUser.set(String(p.id), String(p.nickname ?? ""));
  }
  for (const [rid, uid] of userByRequest) out.set(rid, nickByUser.get(uid) ?? "");
  return out;
}
