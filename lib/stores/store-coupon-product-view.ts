import {
  formatCouponWalletDay,
  isOpaqueId,
} from "@/lib/stores/customer-coupon-wallet-view";
import {
  resolveStoreCouponIssuerView,
  resolveStoreCouponPurposeView,
  resolveStoreCouponProviderView,
  storeCouponCustomerProviderKey,
  storeCouponTargetKey,
  type StoreCouponProviderView,
  type StoreCouponPurposeKey,
  type StoreCouponIssuerRoleKey,
} from "@/lib/stores/store-coupon-issuer-resolve";
import { computeCouponDiscountPhp } from "@/lib/stores/store-coupon-funding-math";
import { formatMoneyPhp } from "@/lib/utils/format";
import type { StoreCouponVisualContext } from "@/lib/stores/load-store-coupon-visual-context";

/** QA / internal titles must not surface as customer coupon names. */
export function isCustomerOpaqueCouponTitle(title: string): boolean {
  const raw = title.trim();
  if (!raw) return true;
  if (isOpaqueId(raw)) return true;
  if (/^DIBAY[_-]?QA/i.test(raw)) return true;
  if (/^QA[-_]/i.test(raw)) return true;
  if (/COUPON_E\d+/i.test(raw)) return true;
  if (/^[A-Z0-9_]{16,}$/.test(raw) && /_/.test(raw)) return true;
  return false;
}

export type CustomerCouponCardView = {
  entitlementId: string;
  campaignId: string;
  couponNumber: string | null;
  couponNumberLegacy: boolean;
  storeId: string;
  storeName: string;
  storeSlug: string | null;
  logoUrl: string | null;
  menuPreviewTitles: string[];
  menuPreviewIsPromotional: true;
  title: string;
  /** When true, Customer Face uses store-based fallback — never show raw QA title. */
  titleIsCustomerOpaque: boolean;
  purposeKey: StoreCouponPurposeKey;
  customerDescription: string | null;
  benefitLabel: string;
  maxDiscountLabel: string | null;
  minOrderPhp: number | null;
  targetKey: ReturnType<typeof storeCouponTargetKey>;
  validUntilLabel: string;
  providerKey: StoreCouponProviderView["providerKey"];
  issuerRoleKey: StoreCouponIssuerRoleKey;
  walletStatusKey:
    | "store_coupon_wallet_status_available"
    | "store_coupon_wallet_status_expiring"
    | "store_coupon_wallet_status_redeemed"
    | "store_coupon_wallet_status_expired"
    | "store_coupon_wallet_status_revoked";
  bucket: string;
  orderNo: string | null;
  redeemedOrderId: string | null;
  usedOnLabel: string | null;
  cta: "use" | "view_order" | "none";
  selectableInCart: boolean;
};

export type CartCouponLineView = {
  userCouponId: string;
  campaignId: string;
  couponNumber: string | null;
  title: string;
  benefitLabel: string;
  providerKey: StoreCouponProviderView["providerKey"];
  storeName: string;
  minOrderPhp: number | null;
  discountAmount: number;
  ineligibleReason: string | null;
  ineligibleReasonKey:
    | "store_err_coupon_min_order"
    | "store_coupon_wallet_status_expired"
    | "store_coupon_wallet_status_revoked"
    | "store_coupon_reason_first_order"
    | "store_coupon_unusable"
    | null;
  shortagePhp: number | null;
  isApplied: boolean;
  isBest: boolean;
  isSelectable: boolean;
};

export type CheckoutPaymentBreakdownLine = {
  labelKey:
    | "store_items_subtotal"
    | "store_discount_amount"
    | "store_owner_order_coupon_discount"
    | "store_estimated_delivery_fee"
    | "store_payment_due";
  amountPhp: number;
  tone?: "discount" | "normal";
  detail?: string;
};

export type CheckoutQuoteView = {
  subtotalPhp: number;
  menuDiscountPhp: number;
  couponDiscountPhp: number;
  couponTitle: string | null;
  couponNumber: string | null;
  deliveryFeePhp: number;
  finalPaymentPhp: number;
  lines: CheckoutPaymentBreakdownLine[];
};

function benefitLabelFromCampaign(c: {
  discount_type?: string;
  discount_value?: number;
  max_discount?: number | null;
}): string {
  const dtype = String(c.discount_type ?? "");
  const val = Number(c.discount_value ?? 0);
  if (dtype === "percent") return `${val}%`;
  if (dtype === "fixed_amount" && val > 0) return formatMoneyPhp(val);
  return "";
}

export function ineligibleReasonToMessageKey(reason: string | null | undefined): CartCouponLineView["ineligibleReasonKey"] {
  const r = String(reason ?? "").trim();
  if (!r) return null;
  if (r === "coupon_min_order") return "store_err_coupon_min_order";
  if (r === "coupon_expired") return "store_coupon_wallet_status_expired";
  if (r === "COUPON_REVOKED") return "store_coupon_wallet_status_revoked";
  if (r === "first_order_ineligible") return "store_coupon_reason_first_order";
  return "store_coupon_unusable";
}

export function buildCustomerCouponCardView(input: {
  entitlement: Record<string, unknown>;
  campaign: Record<string, unknown>;
  visual: StoreCouponVisualContext | null;
  bucket: string;
  walletStatusKey: CustomerCouponCardView["walletStatusKey"];
  orderNo?: string | null;
  orderCreatedAt?: string | null;
  issuerLabel?: string | null;
}): CustomerCouponCardView {
  const e = input.entitlement;
  const c = input.campaign;
  const visual = input.visual;
  const snapRaw = e.offer_snapshot;
  const snap =
    snapRaw && typeof snapRaw === "object" && !Array.isArray(snapRaw)
      ? (snapRaw as Record<string, unknown>)
      : null;
  // SSOT Face: claim-time snapshot wins; historical NULL → live campaign JOIN.
  const faceCampaign: {
    title?: unknown;
    discount_type?: string;
    discount_value?: number;
    max_discount?: number | null;
    min_order_amount?: number | null;
    funding_mode?: string;
    campaign_purpose?: unknown;
  } = {
    ...c,
    title: snap?.title != null ? String(snap.title) : c.title,
    discount_type:
      snap?.discount_type != null ? String(snap.discount_type) : String(c.discount_type ?? ""),
    discount_value:
      snap?.discount_value != null ? Number(snap.discount_value) : Number(c.discount_value ?? 0),
    max_discount:
      snap?.max_discount !== undefined
        ? snap.max_discount == null
          ? null
          : Number(snap.max_discount)
        : c.max_discount == null
          ? null
          : Number(c.max_discount),
    min_order_amount:
      snap?.min_order_amount !== undefined
        ? snap.min_order_amount == null
          ? null
          : Number(snap.min_order_amount)
        : c.min_order_amount == null
          ? null
          : Number(c.min_order_amount),
    funding_mode: snap?.funding_mode != null ? String(snap.funding_mode) : String(c.funding_mode ?? ""),
    campaign_purpose: snap?.purpose != null ? String(snap.purpose) : c.campaign_purpose,
  };
  const purpose = resolveStoreCouponPurposeView(faceCampaign.campaign_purpose);
  const issuer = resolveStoreCouponIssuerView({
    issuerRole: c.issuer_role,
    createdByUserId: c.created_by_user_id,
    actorLabel: input.issuerLabel,
  });
  const provider = resolveStoreCouponProviderView(faceCampaign.funding_mode);
  const couponNumberRaw = e.coupon_number == null ? null : String(e.coupon_number).trim() || null;
  const status = String(e.status ?? "");
  const bucket = input.bucket;
  let cta: CustomerCouponCardView["cta"] = "none";
  if (bucket === "redeemed" && input.orderNo) cta = "view_order";
  else if (bucket === "available" || bucket === "expiring") cta = "use";

  const maxDisc =
    faceCampaign.max_discount == null ? null : Number(faceCampaign.max_discount);
  const dtype = String(faceCampaign.discount_type ?? "");
  const periodEnd =
    snap?.period_end != null ? String(snap.period_end) : String(e.expires_at ?? "");
  const rawTitle = String(faceCampaign.title ?? "").trim();
  const titleOpaque = isCustomerOpaqueCouponTitle(rawTitle);

  return {
    entitlementId: String(e.id ?? ""),
    campaignId: String(e.campaign_id ?? c.id ?? ""),
    couponNumber: couponNumberRaw,
    couponNumberLegacy: !couponNumberRaw,
    storeId: String(e.store_id ?? c.store_id ?? ""),
    storeName: visual?.storeName ?? "",
    storeSlug: visual?.storeSlug ?? null,
    logoUrl: visual?.logoUrl ?? null,
    menuPreviewTitles: visual?.menuPreviewTitles ?? [],
    menuPreviewIsPromotional: true,
    title: titleOpaque ? "" : rawTitle || benefitLabelFromCampaign(faceCampaign),
    titleIsCustomerOpaque: titleOpaque,
    purposeKey: purpose.purposeKey,
    customerDescription: c.terms_copy == null ? null : String(c.terms_copy),
    benefitLabel: benefitLabelFromCampaign(faceCampaign),
    maxDiscountLabel:
      dtype === "percent" && maxDisc != null && maxDisc > 0 ? formatMoneyPhp(maxDisc) : null,
    minOrderPhp:
      faceCampaign.min_order_amount == null ? null : Number(faceCampaign.min_order_amount),
    targetKey: storeCouponTargetKey(c.first_order_scope),
    validUntilLabel: formatCouponWalletDay(periodEnd),
    providerKey: provider.providerKey,
    issuerRoleKey: issuer.roleKey,
    walletStatusKey: input.walletStatusKey,
    bucket,
    orderNo: input.orderNo ?? null,
    redeemedOrderId: String(input.entitlement.redeemed_order_id ?? "") || null,
    usedOnLabel:
      status === "redeemed" && input.orderCreatedAt
        ? formatCouponWalletDay(input.orderCreatedAt)
        : null,
    cta,
    selectableInCart: (status === "available" || status === "restored") && bucket !== "expired",
  };
}

export function buildCartCouponLineViews(input: {
  quotes: Array<{
    userCouponId: string;
    campaignId: string;
    title: string;
    discountAmount: number;
    fundingMode?: string;
    ineligibleReason: string | null;
    minOrderPhp?: number | null;
    shortagePhp?: number | null;
    couponNumber?: string | null;
  }>;
  appliedUserCouponId: string | null;
  bestUserCouponId: string | null;
  storeName: string;
  campaignMetaById: Record<
    string,
    { providerKey: ReturnType<typeof storeCouponCustomerProviderKey>; benefitLabel: string }
  >;
}): { applicable: CartCouponLineView[]; ineligible: CartCouponLineView[] } {
  const applicable: CartCouponLineView[] = [];
  const ineligible: CartCouponLineView[] = [];
  for (const q of input.quotes) {
    const meta = input.campaignMetaById[q.campaignId];
    const line: CartCouponLineView = {
      userCouponId: q.userCouponId,
      campaignId: q.campaignId,
      couponNumber: q.couponNumber ?? null,
      title: q.title?.trim() || meta?.benefitLabel || "",
      benefitLabel: meta?.benefitLabel || "",
      providerKey: meta?.providerKey ?? "store_coupon_provider_store",
      storeName: input.storeName,
      minOrderPhp: q.minOrderPhp ?? null,
      discountAmount: q.discountAmount,
      ineligibleReason: q.ineligibleReason,
      ineligibleReasonKey: ineligibleReasonToMessageKey(q.ineligibleReason),
      shortagePhp: q.shortagePhp ?? null,
      isApplied: input.appliedUserCouponId === q.userCouponId,
      isBest: input.bestUserCouponId === q.userCouponId,
      isSelectable: q.discountAmount > 0 && !q.ineligibleReason,
    };
    if (line.isSelectable) applicable.push(line);
    else ineligible.push(line);
  }
  applicable.sort((a, b) => b.discountAmount - a.discountAmount);
  return { applicable, ineligible };
}

export function buildCheckoutPaymentBreakdown(input: {
  subtotalPhp: number;
  menuDiscountPhp: number;
  couponTitle: string | null;
  couponNumber: string | null;
  couponDiscountPhp: number;
  deliveryFeePhp: number;
  finalPaymentPhp: number;
}): CheckoutPaymentBreakdownLine[] {
  const lines: CheckoutPaymentBreakdownLine[] = [
    { labelKey: "store_items_subtotal", amountPhp: input.subtotalPhp, tone: "normal" },
  ];
  if (input.menuDiscountPhp > 0) {
    lines.push({
      labelKey: "store_discount_amount",
      amountPhp: -input.menuDiscountPhp,
      tone: "discount",
    });
  }
  if (input.couponDiscountPhp > 0) {
    const detail = [input.couponTitle, input.couponNumber].filter(Boolean).join(" · ") || undefined;
    lines.push({
      labelKey: "store_owner_order_coupon_discount",
      amountPhp: -input.couponDiscountPhp,
      tone: "discount",
      detail,
    });
  }
  lines.push({
    labelKey: "store_estimated_delivery_fee",
    amountPhp: input.deliveryFeePhp,
    tone: "normal",
  });
  lines.push({
    labelKey: "store_payment_due",
    amountPhp: input.finalPaymentPhp,
    tone: "normal",
  });
  return lines;
}

export function buildCheckoutQuoteView(input: {
  subtotalPhp: number;
  menuDiscountPhp: number;
  couponTitle: string | null;
  couponNumber: string | null;
  couponDiscountPhp: number;
  deliveryFeePhp: number;
}): CheckoutQuoteView {
  const finalPaymentPhp = Math.max(
    0,
    Math.round(
      input.subtotalPhp -
        input.menuDiscountPhp -
        input.couponDiscountPhp +
        input.deliveryFeePhp
    )
  );
  return {
    subtotalPhp: input.subtotalPhp,
    menuDiscountPhp: input.menuDiscountPhp,
    couponDiscountPhp: input.couponDiscountPhp,
    couponTitle: input.couponTitle,
    couponNumber: input.couponNumber,
    deliveryFeePhp: input.deliveryFeePhp,
    finalPaymentPhp,
    lines: buildCheckoutPaymentBreakdown({
      subtotalPhp: input.subtotalPhp,
      menuDiscountPhp: input.menuDiscountPhp,
      couponTitle: input.couponTitle,
      couponNumber: input.couponNumber,
      couponDiscountPhp: input.couponDiscountPhp,
      deliveryFeePhp: input.deliveryFeePhp,
      finalPaymentPhp,
    }),
  };
}

export function previewDiscountForBasket(input: {
  discountType: string;
  discountValue: number;
  maxDiscount: number | null;
  minOrderPhp: number | null;
  itemGrossPhp: number;
}): number {
  if (
    input.minOrderPhp != null &&
    Number.isFinite(input.minOrderPhp) &&
    input.minOrderPhp > 0 &&
    input.itemGrossPhp < input.minOrderPhp
  ) {
    return 0;
  }
  return computeCouponDiscountPhp({
    discountType: input.discountType === "percent" ? "percent" : "fixed_amount",
    discountValue: input.discountValue,
    itemSubtotalPhp: input.itemGrossPhp,
    maxDiscountPhp: input.maxDiscount,
  });
}

export function buildStoreDetailCouponCardViews(input: {
  campaigns: Array<Record<string, unknown>>;
  heldByCampaignId: Record<string, { entitlementId: string; couponNumber: string | null }>;
  ineligibleByCampaignId: Record<string, string | null>;
  visualByStoreId: Record<string, StoreCouponVisualContext>;
  storeId: string;
}): Array<CustomerCouponCardView & { detailState: "login" | "claim" | "held" | "unusable" | "hidden" }> {
  const out: Array<
    CustomerCouponCardView & { detailState: "login" | "claim" | "held" | "unusable" | "hidden" }
  > = [];
  const visual = input.visualByStoreId[input.storeId] ?? null;
  for (const c of input.campaigns) {
    const cid = String(c.id ?? "");
    const held = input.heldByCampaignId[cid];
    const inel = input.ineligibleByCampaignId[cid] ?? null;
    const detailState: "claim" | "held" | "unusable" = held ? "held" : inel ? "unusable" : "claim";
    const card = buildCustomerCouponCardView({
      entitlement: held
        ? { id: held.entitlementId, campaign_id: cid, store_id: input.storeId, coupon_number: held.couponNumber, status: "available", expires_at: c.end_at }
        : { id: "", campaign_id: cid, store_id: input.storeId, coupon_number: null, status: "available", expires_at: c.end_at },
      campaign: c,
      visual,
      bucket: held ? "available" : "available",
      walletStatusKey: held ? "store_coupon_wallet_status_available" : "store_coupon_wallet_status_available",
    });
    out.push({ ...card, detailState });
  }
  return out;
}
