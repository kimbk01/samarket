/**
 * PRODUCT CUT 2 — Load one store for placement preview (no full HOME/BROWSE feed).
 * Real DB fields only; fail closed when store missing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBrowseStoreCommerceSnapshot } from "@/lib/stores/browse-store-commerce-snapshot";
import { formatBrowseStoreRowLabels } from "@/lib/stores/browse-store-row-labels";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";

export type DeliveryAdPlacementPreviewStoreTaxonomy = {
  primarySlug: string | null;
  primaryLabel: string | null;
  subSlug: string | null;
  subLabel: string | null;
};

export type DeliveryAdPlacementPreviewStoreLoad =
  | {
      ok: true;
      store: StoreHomeFeedItem;
      eligibilityWarning: boolean;
      taxonomy: DeliveryAdPlacementPreviewStoreTaxonomy;
    }
  | { ok: false; error: "store_not_found" | "db_error" };

function embedName(
  rel: { name?: string | null; slug?: string | null } | { name?: string | null; slug?: string | null }[] | null | undefined
): { name: string | null; slug: string | null } {
  if (!rel) return { name: null, slug: null };
  const row = Array.isArray(rel) ? rel[0] : rel;
  return {
    name: row?.name == null ? null : String(row.name),
    slug: row?.slug == null ? null : String(row.slug).trim().toLowerCase() || null,
  };
}

/**
 * Single-store preview payload for Store Sponsored cards.
 * Does not call home-feed or browse list APIs.
 */
export async function loadDeliveryAdPlacementPreviewStore(
  sb: SupabaseClient,
  storeId: string,
  locale: "ko" | "en" = "ko"
): Promise<DeliveryAdPlacementPreviewStoreLoad> {
  const sid = String(storeId ?? "").trim();
  if (!sid) return { ok: false, error: "store_not_found" };

  const { data, error } = await sb
    .from("stores")
    .select(
      [
        "id",
        "slug",
        "store_name",
        "profile_image_url",
        "rating_avg",
        "review_count",
        "delivery_available",
        "pickup_available",
        "is_visible",
        "approval_status",
        "business_hours_json",
        "store_categories ( name, slug )",
        "store_topics ( name, slug )",
      ].join(", ")
    )
    .eq("id", sid)
    .maybeSingle();

  if (error) return { ok: false, error: "db_error" };
  if (!data) return { ok: false, error: "store_not_found" };

  const raw = data as unknown as Record<string, unknown>;
  const cat = embedName(
    raw.store_categories as
      | { name?: string | null; slug?: string | null }
      | { name?: string | null; slug?: string | null }[]
      | null
  );
  const topic = embedName(
    raw.store_topics as
      | { name?: string | null; slug?: string | null }
      | { name?: string | null; slug?: string | null }[]
      | null
  );
  const taxonomy: DeliveryAdPlacementPreviewStoreTaxonomy = {
    primarySlug: cat.slug,
    primaryLabel: cat.name,
    subSlug: topic.slug,
    subLabel: topic.name,
  };
  const commerce = buildBrowseStoreCommerceSnapshot(raw.business_hours_json);
  const extras = parseCommerceExtrasFromHoursJson(raw.business_hours_json);
  const deliveryAvailable = raw.delivery_available === true;
  const labels = formatBrowseStoreRowLabels(locale, commerce, {
    deliveryAvailable,
    rideMinutes: null,
    routeContextPresent: false,
    deliveryRideTimeSource: "google",
  });

  const { data: products } = await sb
    .from("store_products")
    .select("id, title, price, thumbnail_url, product_status")
    .eq("store_id", sid)
    .eq("product_status", "active")
    .order("sort_order", { ascending: true })
    .limit(4);

  const featuredItems = ((products ?? []) as Record<string, unknown>[]).map((p) => ({
    productId: String(p.id),
    name: String(p.title ?? ""),
    price: Number(p.price ?? 0),
    imageUrl: p.thumbnail_url == null ? null : String(p.thumbnail_url),
  }));

  const approval = String(raw.approval_status ?? "");
  const isVisible = raw.is_visible === true;
  const eligibilityWarning =
    approval !== "approved" || !isVisible || deliveryAvailable !== true;

  const store: StoreHomeFeedItem = {
    id: String(raw.id),
    slug: String(raw.slug ?? ""),
    nameKo: String(raw.store_name ?? ""),
    tagline: null,
    primarySlug: cat.slug,
    primaryNameKo: cat.name,
    regionLabel: "",
    status: deliveryAvailable ? "open" : "closed",
    rating: raw.rating_avg == null ? 0 : Number(raw.rating_avg),
    reviewCount: raw.review_count == null ? 0 : Number(raw.review_count),
    deliveryAvailable,
    pickupAvailable: raw.pickup_available !== false,
    minOrderLabel: labels.minOrderLabel,
    estPrepLabel: extras.estPrepLabel || labels.etaLabel || "—",
    prepMinutes: extras.prepMinutes,
    rideMinutes: null,
    etaLabel: labels.etaLabel || extras.estPrepLabel || "—",
    deliveryFeeLabel: labels.deliveryFeeLabel,
    deliveryFeeStrikePhp: labels.deliveryFeeStrikePhp,
    paymentMethodsLine: labels.paymentMethodsLine ?? "",
    distanceKm: null,
    featuredItems,
    profileImageUrl: raw.profile_image_url == null ? null : String(raw.profile_image_url),
    isFeatured: false,
    commerce,
  };

  if (!store.slug.trim() || !store.nameKo.trim()) {
    return { ok: false, error: "store_not_found" };
  }

  return { ok: true, store, eligibilityWarning, taxonomy };
}
