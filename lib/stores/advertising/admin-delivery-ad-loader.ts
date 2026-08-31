/**
 * CUT F — Admin Delivery Ads list/detail batch loader (no N+1).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  lifecycleToAdminListBucket,
  normalizeAdminDisplayLifecycle,
  type AdminDeliveryAdListBucket,
  type AdminDeliveryAdProduct,
} from "@/lib/stores/advertising/admin-delivery-ad-contract";
import { isAdminBannerNeedsCreativeProduction } from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import {
  BANNER_AD_CAMPAIGN_TABLE,
  STORE_SPONSORED_CAMPAIGN_TABLE,
} from "@/lib/stores/advertising/delivery-ad-domain";
import { DELIVERY_AD_AUDIT_LOG_TABLE } from "@/lib/stores/advertising/delivery-ad-audit";
import type {
  DeliveryAdLifecycleStatus,
  DeliveryAdReviewStatus,
} from "@/lib/stores/advertising/delivery-ad-lifecycle";
import {
  bucketPolicyCampaignCounts,
  type PolicyCampaignCounts,
} from "@/lib/stores/advertising/delivery-ad-policy-campaign-counts";

function embedSlug(
  rel: { slug?: string | null } | { slug?: string | null }[] | null | undefined
): string | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  const slug = row?.slug == null ? null : String(row.slug).trim().toLowerCase();
  return slug || null;
}

const SPONSORED_SELECT = [
  "id",
  "store_id",
  "placement",
  "title",
  "headline",
  "body_copy",
  "image_url",
  "start_at",
  "end_at",
  "is_active",
  "owner_user_id",
  "lifecycle_status",
  "review_status",
  "pricing_model",
  "review_notes",
  "submitted_at",
  "created_at",
  "updated_at",
  "campaign_source",
].join(", ");

const BANNER_SELECT = [
  "id",
  "surface",
  "title",
  "subtitle",
  "image_url",
  "cta_href",
  "start_at",
  "end_at",
  "is_active",
  "owner_user_id",
  "store_id",
  "creative_id",
  "lifecycle_status",
  "review_status",
  "pricing_model",
  "review_notes",
  "submitted_at",
  "created_at",
  "updated_at",
  "campaign_source",
].join(", ");

export type AdminDeliveryAdListItem = {
  id: string;
  productKind: AdminDeliveryAdProduct;
  storeId: string | null;
  storeName: string | null;
  storeThumbnailUrl: string | null;
  /** Browse taxonomy primary (store_categories.slug) for policy↔campaign scope. */
  storePrimarySlug: string | null;
  /** Browse taxonomy sub (store_topics.slug). */
  storeSubSlug: string | null;
  ownerUserId: string | null;
  ownerDisplayName: string | null;
  inventoryKeys: string[];
  lifecycleStatus: DeliveryAdLifecycleStatus;
  reviewStatus: DeliveryAdReviewStatus;
  reviewNotes: string | null;
  title: string | null;
  headline: string | null;
  imageUrl: string | null;
  /** Banner only — Admin final destination (Owner request → Admin authority). */
  ctaHref: string | null;
  /** Store public slug for destination resolver UI. */
  storeSlug: string | null;
  creativeId: string | null;
  startAt: string;
  endAt: string;
  pricingModel: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  listBucket: Exclude<AdminDeliveryAdListBucket, "all"> | null;
  scheduleHint: "in_window" | "not_started" | "ended" | "invalid";
  /** OWNER_PAID | DIBAY_FIRST_PARTY */
  campaignSource: "OWNER_PAID" | "DIBAY_FIRST_PARTY";
};

export type AdminDeliveryAdSummary = {
  total: number;
  review: number;
  active: number;
  held: number;
  ended: number;
};

export type AdminDeliveryAdAuditRow = {
  id: string;
  action: string;
  actorType: string;
  actorUserId: string | null;
  reason: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  createdAt: string;
};

function asLifecycle(v: unknown): DeliveryAdLifecycleStatus {
  return String(v ?? "DRAFT") as DeliveryAdLifecycleStatus;
}

function asReview(v: unknown): DeliveryAdReviewStatus {
  return String(v ?? "NOT_SUBMITTED") as DeliveryAdReviewStatus;
}

export async function loadAdminDeliveryAdCampaignList(
  sb: SupabaseClient,
  filters: {
    product?: AdminDeliveryAdProduct | "all";
    bucket?: AdminDeliveryAdListBucket;
    storeId?: string | null;
    ownerUserId?: string | null;
    /** Filter campaigns that include this inventory key. */
    inventoryKey?: string | null;
    /** BROWSE taxonomy scope (with inventoryKey=STORES_CATEGORY_FEED). */
    primarySlug?: string | null;
    subSlug?: string | null;
    limit?: number;
  } = {}
): Promise<{
  items: AdminDeliveryAdListItem[];
  summary: AdminDeliveryAdSummary;
  policyCounts: PolicyCampaignCounts | null;
  error?: string;
}> {
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
  const wantSponsored = filters.product !== "banner";
  const wantBanner = filters.product !== "store_sponsored";

  const sponsoredQ = wantSponsored
    ? sb
        .from(STORE_SPONSORED_CAMPAIGN_TABLE)
        .select(SPONSORED_SELECT)
        .order("updated_at", { ascending: false })
        .limit(limit)
    : null;
  const bannerQ = wantBanner
    ? sb
        .from(BANNER_AD_CAMPAIGN_TABLE)
        .select(BANNER_SELECT)
        .order("updated_at", { ascending: false })
        .limit(limit)
    : null;

  if (filters.storeId && sponsoredQ) sponsoredQ.eq("store_id", filters.storeId);
  if (filters.storeId && bannerQ) bannerQ.eq("store_id", filters.storeId);
  if (filters.ownerUserId && sponsoredQ) sponsoredQ.eq("owner_user_id", filters.ownerUserId);
  if (filters.ownerUserId && bannerQ) bannerQ.eq("owner_user_id", filters.ownerUserId);

  const [sponsoredRes, bannerRes] = await Promise.all([
    sponsoredQ ?? Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    bannerQ ?? Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);

  if (sponsoredRes.error) {
    return {
      items: [],
      summary: emptySummary(),
      policyCounts: null,
      error: sponsoredRes.error.message,
    };
  }
  if (bannerRes.error) {
    return {
      items: [],
      summary: emptySummary(),
      policyCounts: null,
      error: bannerRes.error.message,
    };
  }

  const sponsoredRows = (sponsoredRes.data ?? []) as Record<string, unknown>[];
  const bannerRows = (bannerRes.data ?? []) as Record<string, unknown>[];
  const campaignIdsSponsored = sponsoredRows.map((r) => String(r.id));
  const campaignIdsBanner = bannerRows.map((r) => String(r.id));
  const storeIds = [
    ...new Set(
      [...sponsoredRows, ...bannerRows]
        .map((r) => (r.store_id == null ? null : String(r.store_id)))
        .filter((x): x is string => Boolean(x))
    ),
  ];
  const ownerIds = [
    ...new Set(
      [...sponsoredRows, ...bannerRows]
        .map((r) => (r.owner_user_id == null ? null : String(r.owner_user_id)))
        .filter((x): x is string => Boolean(x))
    ),
  ];

  const [storesRes, profilesRes, sponsoredInvRes, bannerInvRes] = await Promise.all([
    storeIds.length
      ? sb
          .from("stores")
          .select(
            "id, store_name, slug, profile_image_url, store_categories ( slug ), store_topics ( slug )"
          )
          .in("id", storeIds)
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length
      ? sb.from("profiles").select("id, display_name, nickname").in("id", ownerIds)
      : Promise.resolve({ data: [], error: null }),
    campaignIdsSponsored.length
      ? sb
          .from("delivery_store_sponsored_campaign_inventories")
          .select("campaign_id, inventory_id, delivery_ad_inventories(key)")
          .in("campaign_id", campaignIdsSponsored)
      : Promise.resolve({ data: [], error: null }),
    campaignIdsBanner.length
      ? sb
          .from("delivery_banner_campaign_inventories")
          .select("campaign_id, inventory_id, delivery_ad_inventories(key)")
          .in("campaign_id", campaignIdsBanner)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const storeMap = new Map<
    string,
    {
      name: string | null;
      thumb: string | null;
      slug: string | null;
      primarySlug: string | null;
      subSlug: string | null;
    }
  >();
  for (const s of (storesRes.data ?? []) as Record<string, unknown>[]) {
    storeMap.set(String(s.id), {
      name: s.store_name == null ? null : String(s.store_name),
      thumb: s.profile_image_url == null ? null : String(s.profile_image_url),
      slug: s.slug == null ? null : String(s.slug).trim() || null,
      primarySlug: embedSlug(
        s.store_categories as { slug?: string | null } | { slug?: string | null }[] | null
      ),
      subSlug: embedSlug(
        s.store_topics as { slug?: string | null } | { slug?: string | null }[] | null
      ),
    });
  }
  const ownerMap = new Map<string, string | null>();
  for (const p of (profilesRes.data ?? []) as Record<string, unknown>[]) {
    const name =
      (p.display_name == null ? null : String(p.display_name)) ||
      (p.nickname == null ? null : String(p.nickname));
    ownerMap.set(String(p.id), name);
  }

  const invByCampaign = new Map<string, string[]>();
  for (const row of [
    ...((sponsoredInvRes.data ?? []) as Record<string, unknown>[]),
    ...((bannerInvRes.data ?? []) as Record<string, unknown>[]),
  ]) {
    const cid = String(row.campaign_id);
    const inv = row.delivery_ad_inventories as { key?: string } | { key?: string }[] | null;
    const key = Array.isArray(inv) ? inv[0]?.key : inv?.key;
    if (!key) continue;
    const cur = invByCampaign.get(cid) ?? [];
    cur.push(String(key));
    invByCampaign.set(cid, cur);
  }

  const mapRow = (
    raw: Record<string, unknown>,
    productKind: AdminDeliveryAdProduct
  ): AdminDeliveryAdListItem => {
    const lifecycle = asLifecycle(raw.lifecycle_status);
    const startAt = String(raw.start_at);
    const endAt = String(raw.end_at);
    const display = normalizeAdminDisplayLifecycle({
      lifecycleStatus: lifecycle,
      startAt,
      endAt,
    });
    const storeId = raw.store_id == null ? null : String(raw.store_id);
    const ownerUserId = raw.owner_user_id == null ? null : String(raw.owner_user_id);
    const store = storeId ? storeMap.get(storeId) : null;
    const imageUrl = raw.image_url == null ? null : String(raw.image_url);
    const lifecycleBucket = lifecycleToAdminListBucket(lifecycle);
    const needsCreative =
      productKind === "banner" &&
      isAdminBannerNeedsCreativeProduction({
        productKind: "banner",
        creativeAssetPath: imageUrl,
      });
    return {
      id: String(raw.id),
      productKind,
      storeId,
      storeName: store?.name ?? null,
      storeThumbnailUrl: store?.thumb ?? null,
      storePrimarySlug: store?.primarySlug ?? null,
      storeSubSlug: store?.subSlug ?? null,
      ownerUserId,
      ownerDisplayName: ownerUserId ? ownerMap.get(ownerUserId) ?? null : null,
      inventoryKeys: invByCampaign.get(String(raw.id)) ?? [],
      lifecycleStatus: lifecycle,
      reviewStatus: asReview(raw.review_status),
      reviewNotes: raw.review_notes == null ? null : String(raw.review_notes),
      title: raw.title == null ? null : String(raw.title),
      headline:
        productKind === "banner"
          ? raw.subtitle == null
            ? null
            : String(raw.subtitle)
          : raw.headline == null
            ? null
            : String(raw.headline),
      imageUrl,
      ctaHref:
        productKind === "banner"
          ? raw.cta_href == null
            ? null
            : String(raw.cta_href)
          : null,
      storeSlug: store?.slug ?? null,
      creativeId: raw.creative_id == null ? null : String(raw.creative_id),
      startAt,
      endAt,
      pricingModel: raw.pricing_model == null ? null : String(raw.pricing_model),
      submittedAt: raw.submitted_at == null ? null : String(raw.submitted_at),
      createdAt: String(raw.created_at),
      updatedAt: String(raw.updated_at),
      listBucket: needsCreative ? "needs_creative" : lifecycleBucket,
      scheduleHint: display.scheduleHint,
      campaignSource:
        String(raw.campaign_source ?? "OWNER_PAID") === "DIBAY_FIRST_PARTY"
          ? "DIBAY_FIRST_PARTY"
          : "OWNER_PAID",
    };
  };

  let items = [
    ...sponsoredRows.map((r) => mapRow(r, "store_sponsored")),
    ...bannerRows.map((r) => mapRow(r, "banner")),
  ].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  const inventoryKey = filters.inventoryKey?.trim() || null;
  const primarySlug = filters.primarySlug?.trim() || null;
  const subSlug = filters.subSlug?.trim() || null;

  const policyCounts = inventoryKey
    ? bucketPolicyCampaignCounts(
        items.map((i) => ({
          inventoryKeys: i.inventoryKeys,
          lifecycleStatus: i.lifecycleStatus,
          storePrimarySlug: i.storePrimarySlug,
          storeSubSlug: i.storeSubSlug,
        })),
        { inventoryKey, primarySlug, subSlug }
      )
    : null;

  if (inventoryKey) {
    items = items.filter((i) => {
      if (!i.inventoryKeys.includes(inventoryKey)) return false;
      if (inventoryKey === "STORES_CATEGORY_FEED" && primarySlug) {
        if ((i.storePrimarySlug ?? "").toLowerCase() !== primarySlug.toLowerCase()) return false;
        if (subSlug && (i.storeSubSlug ?? "").toLowerCase() !== subSlug.toLowerCase()) return false;
      }
      return true;
    });
  }

  const summary = summarize(items);
  if (filters.bucket && filters.bucket !== "all") {
    items = items.filter((i) => i.listBucket === filters.bucket);
  }

  return { items: items.slice(0, limit), summary, policyCounts };
}

export async function loadAdminDeliveryAdCampaignDetail(
  sb: SupabaseClient,
  campaignId: string,
  productHint?: AdminDeliveryAdProduct | null
): Promise<
  | {
      ok: true;
      item: AdminDeliveryAdListItem;
      audits: AdminDeliveryAdAuditRow[];
      creative: {
        id: string;
        assetPath: string;
        headline: string | null;
        subcopy: string | null;
        version: number;
        ctaType: string | null;
        ctaLabel: string | null;
        supersedesCreativeId: string | null;
      } | null;
    }
  | { ok: false; error: "not_found" | "db_error"; detail?: string }
> {
  const tryLoad = async (product: AdminDeliveryAdProduct) => {
    const table = product === "banner" ? BANNER_AD_CAMPAIGN_TABLE : STORE_SPONSORED_CAMPAIGN_TABLE;
    const select = product === "banner" ? BANNER_SELECT : SPONSORED_SELECT;
    const { data, error } = await sb.from(table).select(select).eq("id", campaignId).maybeSingle();
    if (error) return { error: error.message as string, row: null as Record<string, unknown> | null };
    return { error: null as string | null, row: data as Record<string, unknown> | null };
  };

  let product: AdminDeliveryAdProduct | null = productHint ?? null;
  let row: Record<string, unknown> | null = null;
  if (product) {
    const r = await tryLoad(product);
    if (r.error) return { ok: false, error: "db_error", detail: r.error };
    row = r.row;
  } else {
    const sponsored = await tryLoad("store_sponsored");
    if (sponsored.error) return { ok: false, error: "db_error", detail: sponsored.error };
    if (sponsored.row) {
      product = "store_sponsored";
      row = sponsored.row;
    } else {
      const banner = await tryLoad("banner");
      if (banner.error) return { ok: false, error: "db_error", detail: banner.error };
      if (banner.row) {
        product = "banner";
        row = banner.row;
      }
    }
  }

  if (!product || !row) return { ok: false, error: "not_found" };

  const list = await loadAdminDeliveryAdCampaignList(sb, {
    product,
    storeId: row.store_id == null ? null : String(row.store_id),
    limit: 50,
  });
  const item = list.items.find((i) => i.id === campaignId);
  if (!item) {
    // Fallback map without list batch (still enrich)
    const alone = await loadAdminDeliveryAdCampaignList(sb, { product, limit: 500 });
    const found = alone.items.find((i) => i.id === campaignId);
    if (!found) return { ok: false, error: "not_found" };
    return loadDetailExtras(sb, found);
  }
  return loadDetailExtras(sb, item);
}

async function loadDetailExtras(sb: SupabaseClient, item: AdminDeliveryAdListItem) {
  const [auditsRes, creativeRes] = await Promise.all([
    sb
      .from(DELIVERY_AD_AUDIT_LOG_TABLE)
      .select("id, action, actor_type, actor_user_id, reason, before_json, after_json, created_at")
      .eq("product_kind", item.productKind)
      .eq("campaign_id", item.id)
      .order("created_at", { ascending: false })
      .limit(100),
    item.creativeId
      ? sb
          .from("delivery_ad_creatives")
          .select(
            "id, asset_path, headline, subcopy, version, cta_type, cta_label, supersedes_creative_id, source_width, source_height, review_status, created_at"
          )
          .eq("id", item.creativeId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (auditsRes.error) {
    return { ok: false as const, error: "db_error" as const, detail: auditsRes.error.message };
  }

  const audits: AdminDeliveryAdAuditRow[] = ((auditsRes.data ?? []) as Record<string, unknown>[]).map(
    (a) => ({
      id: String(a.id),
      action: String(a.action),
      actorType: String(a.actor_type),
      actorUserId: a.actor_user_id == null ? null : String(a.actor_user_id),
      reason: a.reason == null ? null : String(a.reason),
      beforeJson: a.before_json,
      afterJson: a.after_json,
      createdAt: String(a.created_at),
    })
  );

  const c = creativeRes.data as Record<string, unknown> | null;
  const creative = c
    ? {
        id: String(c.id),
        assetPath: String(c.asset_path ?? ""),
        headline: c.headline == null ? null : String(c.headline),
        subcopy: c.subcopy == null ? null : String(c.subcopy),
        version: Number(c.version ?? 1),
        ctaType: c.cta_type == null ? null : String(c.cta_type),
        ctaLabel: c.cta_label == null ? null : String(c.cta_label),
        sourceWidth: c.source_width == null ? null : Number(c.source_width),
        sourceHeight: c.source_height == null ? null : Number(c.source_height),
        reviewStatus: c.review_status == null ? null : String(c.review_status),
        createdAt: c.created_at == null ? null : String(c.created_at),
        supersedesCreativeId:
          c.supersedes_creative_id == null ? null : String(c.supersedes_creative_id),
      }
    : null;

  return { ok: true as const, item, audits, creative };
}

function emptySummary(): AdminDeliveryAdSummary {
  return { total: 0, review: 0, active: 0, held: 0, ended: 0 };
}

function summarize(items: AdminDeliveryAdListItem[]): AdminDeliveryAdSummary {
  const s = emptySummary();
  s.total = items.length;
  for (const i of items) {
    if (i.listBucket === "review") s.review += 1;
    else if (i.listBucket === "active") s.active += 1;
    else if (i.listBucket === "held") s.held += 1;
    else if (i.listBucket === "ended" || i.listBucket === "rejected") s.ended += 1;
  }
  return s;
}
