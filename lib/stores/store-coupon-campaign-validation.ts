import {
  isStoreCouponDiscountType,
  type StoreCouponDiscountType,
} from "@/lib/stores/store-coupon-campaign-authority";
import { isValidStoreDiscoveryCampaignWindow } from "@/lib/stores/store-discovery-campaign-authority";

export type StoreCouponCampaignCreateInput = {
  storeId: string;
  title: string;
  discountType: StoreCouponDiscountType;
  discountValue: number;
  minOrderAmount: number | null;
  termsCopy: string | null;
  startAt: string;
  endAt: string;
  isActive: boolean;
  maxDiscount: number | null;
  issueLimit: number | null;
  spendBudgetPhp: number | null;
  firstOrderScope: "STORE" | "PLATFORM" | null;
  usageEndAt: string | null;
  claimValidDays: number | null;
  storeFundedAmount: number | null;
};

export type StoreCouponCampaignUpdateInput = {
  id: string;
  title?: string;
  discountType?: StoreCouponDiscountType;
  discountValue?: number;
  minOrderAmount?: number | null;
  termsCopy?: string | null;
  startAt?: string;
  endAt?: string;
  isActive?: boolean;
};

type ParseOk<T> = { ok: true; value: T };
type ParseFail = { ok: false; error: string; forbidden?: string[] };

function readString(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  return typeof v === "string" ? v.trim() : "";
}

function readNumber(body: Record<string, unknown>, key: string): number | null {
  const v = body[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseStoreCouponCampaignCreateBody(
  raw: unknown
): ParseOk<StoreCouponCampaignCreateInput> | ParseFail {
  if (!raw || typeof raw !== "object") return { ok: false, error: "invalid_json" };
  const body = raw as Record<string, unknown>;
  const forbidden = Object.keys(body).filter(
    (k) =>
      ![
        "storeId",
        "store_id",
        "title",
        "discountType",
        "discount_type",
        "discountValue",
        "discount_value",
        "minOrderAmount",
        "min_order_amount",
        "termsCopy",
        "terms_copy",
        "startAt",
        "start_at",
        "endAt",
        "end_at",
        "isActive",
        "is_active",
        "fundingMode",
        "funding_mode",
        "maxDiscount",
        "max_discount",
        "issueLimit",
        "issue_limit",
        "spendBudgetPhp",
        "spend_budget_php",
        "firstOrderScope",
        "first_order_scope",
        "usageEndAt",
        "usage_end_at",
        "claimValidDays",
        "claim_valid_days",
        "storeFundedAmount",
        "store_funded_amount",
      ].includes(k)
  );
  if (forbidden.length) return { ok: false, error: "forbidden_fields", forbidden };

  const storeId = readString(body, "storeId") || readString(body, "store_id");
  const discountTypeRaw = readString(body, "discountType") || readString(body, "discount_type");
  const discountType = isStoreCouponDiscountType(discountTypeRaw) ? discountTypeRaw : null;
  const discountValue =
    readNumber(body, "discountValue") ?? readNumber(body, "discount_value");
  const minOrderRaw = body.minOrderAmount ?? body.min_order_amount;
  const minOrderAmount =
    minOrderRaw == null || minOrderRaw === ""
      ? null
      : readNumber(body, "minOrderAmount") ?? readNumber(body, "min_order_amount");
  const termsRaw = body.termsCopy ?? body.terms_copy;
  const termsCopy =
    termsRaw == null ? null : String(termsRaw).trim() ? String(termsRaw).trim() : null;
  const title = readString(body, "title");
  const startAt = readString(body, "startAt") || readString(body, "start_at");
  const endAt = readString(body, "endAt") || readString(body, "end_at");
  const isActive = body.isActive !== false && body.is_active !== false;

  if (!storeId) return { ok: false, error: "missing_store_id" };
  if (!title) return { ok: false, error: "empty_title" };
  if (!discountType) return { ok: false, error: "invalid_discount_type" };
  if (discountValue == null || discountValue <= 0) return { ok: false, error: "invalid_discount_value" };
  if (discountType === "percent" && discountValue > 100) {
    return { ok: false, error: "invalid_discount_value" };
  }
  if (!startAt) return { ok: false, error: "invalid_start_at" };
  if (!endAt) return { ok: false, error: "invalid_end_at" };
  if (!isValidStoreDiscoveryCampaignWindow({ startAt, endAt })) {
    return { ok: false, error: "invalid_window" };
  }

  const maxDiscount = readNumber(body, "maxDiscount") ?? readNumber(body, "max_discount");
  const issueLimit = readNumber(body, "issueLimit") ?? readNumber(body, "issue_limit");
  const spendBudgetPhp = readNumber(body, "spendBudgetPhp") ?? readNumber(body, "spend_budget_php");
  const firstRaw = readString(body, "firstOrderScope") || readString(body, "first_order_scope");
  const firstOrderScope =
    firstRaw === "STORE" || firstRaw === "PLATFORM" ? firstRaw : firstRaw === "" ? null : null;
  const usageEndAt = readString(body, "usageEndAt") || readString(body, "usage_end_at") || null;
  const claimValidDays = readNumber(body, "claimValidDays") ?? readNumber(body, "claim_valid_days");
  const storeFundedAmount =
    readNumber(body, "storeFundedAmount") ?? readNumber(body, "store_funded_amount");

  if (discountType === "percent" && spendBudgetPhp != null && spendBudgetPhp > 0 && (maxDiscount == null || maxDiscount <= 0)) {
    return { ok: false, error: "max_discount_required" };
  }

  return {
    ok: true,
    value: {
      storeId,
      title,
      discountType,
      discountValue,
      minOrderAmount,
      termsCopy,
      startAt,
      endAt,
      isActive,
      maxDiscount: maxDiscount != null && maxDiscount > 0 ? maxDiscount : null,
      issueLimit: issueLimit != null && issueLimit > 0 ? Math.floor(issueLimit) : null,
      spendBudgetPhp: spendBudgetPhp != null && spendBudgetPhp > 0 ? spendBudgetPhp : null,
      firstOrderScope,
      usageEndAt,
      claimValidDays: claimValidDays != null && claimValidDays > 0 ? Math.floor(claimValidDays) : null,
      storeFundedAmount: storeFundedAmount != null && storeFundedAmount >= 0 ? storeFundedAmount : null,
    },
  };
}

export function parseStoreCouponCampaignUpdateBody(
  raw: unknown
): ParseOk<StoreCouponCampaignUpdateInput> | ParseFail {
  if (!raw || typeof raw !== "object") return { ok: false, error: "invalid_json" };
  const body = raw as Record<string, unknown>;
  const id = readString(body, "id");
  if (!id) return { ok: false, error: "missing_id" };

  const out: StoreCouponCampaignUpdateInput = { id };
  if ("title" in body) {
    const title = readString(body, "title");
    if (!title) return { ok: false, error: "empty_title" };
    out.title = title;
  }
  if ("discountType" in body || "discount_type" in body) {
    const dt = readString(body, "discountType") || readString(body, "discount_type");
    if (!isStoreCouponDiscountType(dt)) return { ok: false, error: "invalid_discount_type" };
    out.discountType = dt;
  }
  if ("discountValue" in body || "discount_value" in body) {
    const dv = readNumber(body, "discountValue") ?? readNumber(body, "discount_value");
    if (dv == null || dv <= 0) return { ok: false, error: "invalid_discount_value" };
    out.discountValue = dv;
  }
  if ("minOrderAmount" in body || "min_order_amount" in body) {
    const rawMin = body.minOrderAmount ?? body.min_order_amount;
    out.minOrderAmount =
      rawMin == null || rawMin === ""
        ? null
        : readNumber(body, "minOrderAmount") ?? readNumber(body, "min_order_amount");
  }
  if ("termsCopy" in body || "terms_copy" in body) {
    const rawTerms = body.termsCopy ?? body.terms_copy;
    out.termsCopy =
      rawTerms == null ? null : String(rawTerms).trim() ? String(rawTerms).trim() : null;
  }
  if ("startAt" in body || "start_at" in body) {
    const startAt = readString(body, "startAt") || readString(body, "start_at");
    if (!startAt) return { ok: false, error: "invalid_start_at" };
    out.startAt = startAt;
  }
  if ("endAt" in body || "end_at" in body) {
    const endAt = readString(body, "endAt") || readString(body, "end_at");
    if (!endAt) return { ok: false, error: "invalid_end_at" };
    out.endAt = endAt;
  }
  if ("isActive" in body || "is_active" in body) {
    out.isActive = body.isActive !== false && body.is_active !== false;
  }
  return { ok: true, value: out };
}

export function resolveStoreCouponCampaignUpdateWindow(
  current: { startAt: string; endAt: string },
  patch: StoreCouponCampaignUpdateInput
): { startAt: string; endAt: string } | null {
  const startAt = patch.startAt ?? current.startAt;
  const endAt = patch.endAt ?? current.endAt;
  if (!isValidStoreDiscoveryCampaignWindow({ startAt, endAt })) return null;
  return { startAt, endAt };
}
