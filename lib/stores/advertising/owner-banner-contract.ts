/**
 * CUT E — Owner Banner application contracts.
 * ACTIVE inventory only; creative aspect from inventory SSOT (no fake 16:9 swap).
 */

import {
  ACTIVE_DELIVERY_AD_INVENTORY_KEYS,
  inventorySeedByKey,
  isRuntimeActiveInventory,
  type DeliveryAdInventoryKey,
} from "@/lib/stores/advertising/delivery-ad-inventory";
import {
  creativeMatchesInventoryAspect,
  isDeliveryAdCtaTarget,
  isForbiddenExternalCta,
  type DeliveryAdCtaTarget,
} from "@/lib/stores/advertising/delivery-ad-creative";
import {
  DELIVERY_AD_OWNER_PRICING_PRODUCT,
  validateOwnerStoreSponsoredSchedule,
} from "@/lib/stores/advertising/owner-store-sponsored-contract";
import {
  BANNER_AD_DB_SURFACE,
  type BannerAdDbSurface,
} from "@/lib/stores/advertising/delivery-ad-placement";

/**
 * Owner-selectable banner inventories (launch sellable only).
 * SEARCH_TOP removed from sale — see delivery-ad-product-recovery-contract.
 */
export const OWNER_BANNER_INVENTORY_KEYS = [
  "STORES_HOME_HERO",
] as const satisfies ReadonlyArray<DeliveryAdInventoryKey>;

export type OwnerBannerInventoryKey = (typeof OWNER_BANNER_INVENTORY_KEYS)[number];

/** Historical / runtime-loaded banner keys (may include unsellable SEARCH_TOP). */
export type OwnerBannerInventoryKeyLoaded =
  | OwnerBannerInventoryKey
  | "STORES_SEARCH_TOP";

export const OWNER_BANNER_CTA_LABEL_KEYS = [
  "owner_ads_banner_cta_store",
  "owner_ads_banner_cta_menu",
  "owner_ads_banner_cta_promo",
] as const;

export type OwnerBannerCtaLabelKey = (typeof OWNER_BANNER_CTA_LABEL_KEYS)[number];

export const OWNER_BANNER_CTA_TARGET_TO_LABEL_KEY: Record<
  DeliveryAdCtaTarget,
  OwnerBannerCtaLabelKey
> = {
  store_detail: "owner_ads_banner_cta_store",
  store_menu: "owner_ads_banner_cta_menu",
  store_promotion: "owner_ads_banner_cta_promo",
};

export const OWNER_BANNER_PRICING = DELIVERY_AD_OWNER_PRICING_PRODUCT;

export const OWNER_BANNER_CROP_POLICY = {
  mode: "crop_capable" as const,
  stretchForbidden: true,
  exactUploadOptional: false,
  note: "Owner crops to inventory aspect before submit; server re-validates ratio",
} as const;

export function isOwnerBannerInventoryKey(value: unknown): value is OwnerBannerInventoryKey {
  return (
    typeof value === "string" &&
    (OWNER_BANNER_INVENTORY_KEYS as readonly string[]).includes(value)
  );
}

export function validateOwnerBannerInventory(
  raw: unknown
):
  | { ok: true; key: OwnerBannerInventoryKey }
  | { ok: false; error: "no_inventory" | "invalid_inventory" | "future_inventory" } {
  if (raw == null || raw === "") return { ok: false, error: "no_inventory" };
  if (!isOwnerBannerInventoryKey(raw)) {
    if (typeof raw === "string" && (ACTIVE_DELIVERY_AD_INVENTORY_KEYS as readonly string[]).includes(raw) === false) {
      return { ok: false, error: "future_inventory" };
    }
    return { ok: false, error: "invalid_inventory" };
  }
  if (!isRuntimeActiveInventory(raw)) return { ok: false, error: "future_inventory" };
  return { ok: true, key: raw };
}

export function validateOwnerBannerCreativeAspect(input: {
  inventoryKey: DeliveryAdInventoryKey;
  sourceWidth: number;
  sourceHeight: number;
}): { ok: true } | { ok: false; error: "aspect_mismatch" | "invalid_dimensions" } {
  if (!(input.sourceWidth > 0) || !(input.sourceHeight > 0)) {
    return { ok: false, error: "invalid_dimensions" };
  }
  const inv = inventorySeedByKey(input.inventoryKey);
  if (!creativeMatchesInventoryAspect(input.sourceWidth, input.sourceHeight, inv)) {
    return { ok: false, error: "aspect_mismatch" };
  }
  return { ok: true };
}

export function validateOwnerBannerCta(input: {
  ctaType: unknown;
  ctaTargetId: unknown;
  externalUrl?: unknown;
}):
  | { ok: true; ctaType: DeliveryAdCtaTarget; ctaTargetId: string }
  | {
      ok: false;
      error: "external_cta_forbidden" | "invalid_cta_type" | "cta_target_required";
    } {
  if (isForbiddenExternalCta(input.externalUrl)) {
    return { ok: false, error: "external_cta_forbidden" };
  }
  if (!isDeliveryAdCtaTarget(input.ctaType)) {
    return { ok: false, error: "invalid_cta_type" };
  }
  const targetId = String(input.ctaTargetId ?? "").trim();
  if (!targetId) return { ok: false, error: "cta_target_required" };
  return { ok: true, ctaType: input.ctaType, ctaTargetId: targetId };
}

export const validateOwnerBannerSchedule = validateOwnerStoreSponsoredSchedule;

/** Map CTA allowlist → canonical internal path (never external). */
export function resolveOwnerBannerCtaHref(input: {
  ctaType: DeliveryAdCtaTarget;
  storeSlug: string;
}): string {
  const slug = encodeURIComponent(input.storeSlug.trim());
  if (!slug) return "";
  switch (input.ctaType) {
    case "store_menu":
      return `/stores/${slug}#menu`;
    case "store_promotion":
      return `/stores/${slug}?tab=promo`;
    case "store_detail":
    default:
      return `/stores/${slug}`;
  }
}

export function ownerBannerInventoryToLegacySurface(
  key: OwnerBannerInventoryKeyLoaded
): BannerAdDbSurface {
  if (key === "STORES_SEARCH_TOP") return "stores_search";
  return BANNER_AD_DB_SURFACE;
}

/** Owner/Admin UX label key — never expose technical inventory keys. */
export function ownerBannerInventoryLabelKey(
  key: OwnerBannerInventoryKeyLoaded
): "owner_ads_inventory_home_hero" | "owner_ads_inventory_search_top" {
  if (key === "STORES_SEARCH_TOP") return "owner_ads_inventory_search_top";
  return "owner_ads_inventory_home_hero";
}

export function ownerBannerAspectGuideCopy(inventoryKey: DeliveryAdInventoryKey): {
  ratioLabel: string;
  width: number;
  height: number;
} {
  const inv = inventorySeedByKey(inventoryKey);
  return {
    ratioLabel: `${inv.aspectRatioWidth}:${inv.aspectRatioHeight}`,
    width: inv.aspectRatioWidth,
    height: inv.aspectRatioHeight,
  };
}

/** IMG-04c — 오너 배너 업로드 경로 접두(`upload-banner-image` route 가 서버에서 만든 경로). */
export function ownerBannerUploadPathPrefix(storeId: string): string {
  return `_owner/delivery-ads/banner/${storeId.trim()}/`;
}

/** IMG-04c — 소재 픽셀 상한(업로드 sharp 파이프라인 상한과 동일, `OWNER_PRODUCT_IMAGE_MAX_EDGE_PX`). */
const OWNER_BANNER_SOURCE_MAX_EDGE_PX = 8192;

/**
 * IMG-04c — 클라이언트가 보낸 소재 경로·크기 검증.
 * - 새 소재: 이 매장 업로드 접두 안의 저장 경로만(외부 URL·다른 매장·상대 경로 탈출 금지).
 * - 기존 소재 재사용(수정 요청 재제출 등): 교체 대상 소재의 경로·크기와 정확히 같을 때만.
 * - 크기: 정수 1…8192 (비율·최소 픽셀은 이어서 기존 aspect 게이트가 본다).
 */
export function validateOwnerBannerAssetInput(input: {
  storeId: string;
  assetPath: string;
  sourceWidth: number;
  sourceHeight: number;
  existing?: { assetPath: string; sourceWidth: number | null; sourceHeight: number | null } | null;
}): { ok: true } | { ok: false; error: "invalid_asset_path" | "invalid_dimensions" } {
  const w = input.sourceWidth;
  const h = input.sourceHeight;
  const dimsOk =
    Number.isInteger(w) &&
    Number.isInteger(h) &&
    w > 0 &&
    h > 0 &&
    w <= OWNER_BANNER_SOURCE_MAX_EDGE_PX &&
    h <= OWNER_BANNER_SOURCE_MAX_EDGE_PX;
  if (!dimsOk) return { ok: false, error: "invalid_dimensions" };

  const path = input.assetPath.trim();
  const existing = input.existing;
  if (existing && existing.assetPath.trim() && path === existing.assetPath.trim()) {
    if (existing.sourceWidth !== w || existing.sourceHeight !== h) {
      return { ok: false, error: "invalid_dimensions" };
    }
    return { ok: true };
  }
  const sid = input.storeId.trim();
  if (!sid || !path) return { ok: false, error: "invalid_asset_path" };
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("/")) {
    return { ok: false, error: "invalid_asset_path" };
  }
  if (path.includes("..") || path.includes("%") || path.includes("\\") || path.includes("//")) {
    return { ok: false, error: "invalid_asset_path" };
  }
  const prefix = ownerBannerUploadPathPrefix(sid);
  if (!path.startsWith(prefix) || path.length <= prefix.length) {
    return { ok: false, error: "invalid_asset_path" };
  }
  return { ok: true };
}
