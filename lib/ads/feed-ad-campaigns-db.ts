import type { SupabaseClient } from "@supabase/supabase-js";
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
    return mapCampaign(row, byCampaign.get(id) ?? []);
  });
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
    .or(`end_at.is.null,end_at.gte.${nowIso}`)
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

  return campaigns.map((c) => {
    const row = c as Record<string, unknown>;
    const id = String(row.id ?? "");
    return mapCampaign(row, byCampaign.get(id) ?? []);
  });
}
