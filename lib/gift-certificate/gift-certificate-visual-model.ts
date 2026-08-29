/**
 * ONE Gift Certificate Visual Model — semantic fields only.
 * Forbidden: displayAmount, sale_price, merging face/purchase/remaining.
 */

import { DIBAY_LOGO_MARK_PATH, dibayBrandAssetUrl } from "@/lib/brand/brand-asset-paths";
import {
  resolveGiftVisual,
  type GiftScope,
  type GiftVisualInput,
} from "@/lib/gift-certificate/resolve-gift-visual";

export type GiftCertificateVisualKind = GiftScope;

export type GiftCertificateVisualContext =
  | "mall"
  | "wallet"
  | "detail"
  | "transfer"
  | "chat"
  | "admin_preview"
  | "used";

export type GiftCertificateValueMode = "mall" | "wallet" | "used";

export type GiftCertificateVisualModel = {
  kind: GiftCertificateVisualKind;
  context: GiftCertificateVisualContext;
  title: string;
  issuerName: string;
  issuerBadge: string;
  heroImageSrc: string | null;
  usePlatformFallback: boolean;
  useStoreInitialFallback: boolean;
  storeInitial: string;
  faceValue: number | null;
  purchasePrice: number | null;
  remainingBalance: number | null;
  /** Preformatted expiry line; null = omit (never invent). */
  expirationDisplay: string | null;
  /** Instance public number only; mall must be null. */
  certificateDisplayNumber: string | null;
  valueMode: GiftCertificateValueMode;
};

export type BuildGiftCertificateVisualModelInput = {
  giftScope: GiftScope;
  context: GiftCertificateVisualContext;
  title?: string | null;
  issuerName?: string | null;
  imageUrl?: string | null;
  storeLogoUrl?: string | null;
  storeName?: string | null;
  faceValue?: number | null;
  purchasePrice?: number | null;
  remainingBalance?: number | null;
  expirationDisplay?: string | null;
  certificateDisplayNumber?: string | null;
  /** Override valueMode; otherwise derived from context. */
  valueMode?: GiftCertificateValueMode;
  issuerBadgePlatform?: string;
  issuerBadgeStore?: string;
};

function resolveValueMode(
  context: GiftCertificateVisualContext,
  override?: GiftCertificateValueMode
): GiftCertificateValueMode {
  if (override) return override;
  if (context === "mall" || context === "admin_preview") return "mall";
  if (context === "used") return "used";
  return "wallet";
}

export function buildGiftCertificateVisualModel(
  input: BuildGiftCertificateVisualModelInput
): GiftCertificateVisualModel {
  const kind: GiftCertificateVisualKind = input.giftScope === "PLATFORM" ? "PLATFORM" : "STORE";
  const visualInput: GiftVisualInput = {
    giftScope: kind,
    imageUrl: input.imageUrl,
    storeLogoUrl: input.storeLogoUrl,
    storeName: input.storeName ?? input.issuerName,
    title: input.title,
  };
  const resolved = resolveGiftVisual(visualInput);
  const issuerName =
    input.issuerName?.trim() ||
    (kind === "PLATFORM" ? "DIBAY" : input.storeName?.trim() || "");
  const title = input.title?.trim() || "";
  const badgePlatform = input.issuerBadgePlatform?.trim() || "DIBAY 상품권";
  const badgeStore = input.issuerBadgeStore?.trim() || "매장 상품권";
  const issuerBadge = kind === "PLATFORM" ? badgePlatform : badgeStore;

  let heroImageSrc = resolved.imageSrc;
  if (resolved.usePlatformFallback) {
    heroImageSrc = dibayBrandAssetUrl(DIBAY_LOGO_MARK_PATH);
  }

  return {
    kind,
    context: input.context,
    title,
    issuerName,
    issuerBadge,
    heroImageSrc,
    usePlatformFallback: resolved.usePlatformFallback,
    useStoreInitialFallback: resolved.useStoreInitialFallback,
    storeInitial: resolved.storeInitial,
    faceValue: input.faceValue ?? null,
    purchasePrice: input.purchasePrice ?? null,
    remainingBalance: input.remainingBalance ?? null,
    expirationDisplay: input.expirationDisplay?.trim() || null,
    certificateDisplayNumber: input.certificateDisplayNumber?.trim() || null,
    valueMode: resolveValueMode(input.context, input.valueMode),
  };
}

/** Mall discount row: show strike+arrow only when purchase < face. */
export function giftMallShowsDiscountArrow(
  faceValue: number | null,
  purchasePrice: number | null
): boolean {
  if (faceValue == null || purchasePrice == null) return false;
  return purchasePrice < faceValue;
}
