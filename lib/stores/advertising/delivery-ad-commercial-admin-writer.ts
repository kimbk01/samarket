/**
 * P0-A — Admin commercial catalog write authority (server).
 * Does NOT mutate existing campaign commercial snapshots when catalog prices change.
 * No UI.
 */

import { isAdPhpPriceOverCap } from "@/lib/admin/ads-commercial/ad-price-change-guard";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DELIVERY_AD_COMMERCIAL_OVERRIDE_AUDIT_TABLE,
  DELIVERY_AD_EXTENSION_POLICY_TABLE,
  DELIVERY_AD_PACKAGE_TABLE,
  DELIVERY_AD_PARTNER_CONFIG_TABLE,
  DELIVERY_AD_PLACEMENT_COMMERCIAL_TABLE,
  type DeliveryAdPackageRow,
  mapDeliveryAdPackageRow,
} from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import { assertDeliveryAdMoneyMinor } from "@/lib/stores/advertising/delivery-ad-billing-contract";
import type { DeliveryAdProductKey } from "@/lib/stores/advertising/delivery-ad-product-registry";

export type DeliveryAdCommercialOverrideInput = {
  entityType:
    | "package"
    | "placement_commercial"
    | "product"
    | "extension_policy"
    | "partner_config"
    | "campaign_commercial"
    | "partner_membership";
  entityId: string;
  actorUserId: string;
  reason: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

export async function recordDeliveryAdCommercialOverride(
  sb: SupabaseClient,
  input: DeliveryAdCommercialOverrideInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = input.reason.trim();
  if (!reason || !input.actorUserId) return { ok: false, error: "reason_required" };
  const { error } = await sb.from(DELIVERY_AD_COMMERCIAL_OVERRIDE_AUDIT_TABLE).insert({
    entity_type: input.entityType,
    entity_id: input.entityId,
    actor_user_id: input.actorUserId,
    reason,
    before_json: input.before,
    after_json: input.after,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function adminUpdateDeliveryAdPackagePrice(
  sb: SupabaseClient,
  input: {
    packageId: string;
    priceAmountMinor?: number | null;
    enabled?: boolean;
    durationDays?: number;
    displayName?: string;
    displayOrder?: number;
    /** SA-12: 화면이 읽은 `updated_at` — 다르면 덮어쓰지 않고 `stale_updated_at` */
    expectedUpdatedAt?: string;
    actorUserId: string;
    reason: string;
  }
): Promise<{ ok: true; package: DeliveryAdPackageRow } | { ok: false; error: string }> {
  if (
    input.priceAmountMinor != null &&
    (!assertDeliveryAdMoneyMinor(input.priceAmountMinor) || input.priceAmountMinor <= 0)
  ) {
    return { ok: false, error: "invalid_price" };
  }
  /** D-13: 금액 상한(₱100,000) — 오타 방지 */
  if (input.priceAmountMinor != null && isAdPhpPriceOverCap(input.priceAmountMinor)) {
    return { ok: false, error: "price_over_cap" };
  }
  const { data: beforeRaw, error: loadErr } = await sb
    .from(DELIVERY_AD_PACKAGE_TABLE)
    .select("*")
    .eq("id", input.packageId)
    .maybeSingle();
  if (loadErr || !beforeRaw) return { ok: false, error: loadErr?.message ?? "not_found" };
  const before = mapDeliveryAdPackageRow(beforeRaw as Record<string, unknown>);
  if (!before) return { ok: false, error: "invalid_row" };

  if (input.enabled === true) {
    const price =
      input.priceAmountMinor !== undefined
        ? input.priceAmountMinor
        : before.priceAmountMinor;
    if (price == null || price <= 0) {
      return { ok: false, error: "price_required_to_enable" };
    }
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.priceAmountMinor !== undefined) {
    patch.price_amount_minor = input.priceAmountMinor;
  }
  if (input.enabled != null) patch.enabled = input.enabled;
  if (input.durationDays != null) {
    if (!Number.isInteger(input.durationDays) || input.durationDays < 1) {
      return { ok: false, error: "invalid_duration" };
    }
    /**
     * SA-12: 한 번이라도 팔린 기간 상품은 기간을 바꾸지 않는다 — 요금 기록(스냅샷)의 기간과 상품 기간이 갈라진다.
     * 다른 기간이 필요하면 새 상품을 만든다.
     */
    if (input.durationDays !== before.durationDays) {
      /**
       * R-13: 「팔렸다」 = 이 상품의 요금 기록이 있는 신청 중 캐시가 실제로 확보된 적이 있는 것(SECURED·REFUNDED).
       * 요금 기록만으로 보면 캐시 부족·자리 없음으로 실패한 제출까지 잠갔다.
       */
      /**
       * R-27: 요금 기록을 100건씩 끝까지 확인한다(예전 500건 한 번 · 정렬 없음 → 500 초과면 잠금 누락 가능).
       * 반복은 정해진 횟수(50쪽 = 5,000건)만 — 넘으면 확인을 끝낼 수 없으므로 막는다(`sold_check_failed`). 중간 오류도 같다.
       */
      const PAGE = 100;
      const MAX_PAGES = 50;
      let finished = false;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const { data: snaps, error: snapErr } = await sb
          .from("delivery_ad_campaign_commercial_snapshots")
          .select("campaign_id")
          .eq("package_id", input.packageId)
          .order("campaign_id", { ascending: true })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (snapErr) return { ok: false, error: "sold_check_failed" };
        const rows = snaps ?? [];
        const campaignIds = [
          ...new Set(rows.map((r) => String((r as { campaign_id?: unknown }).campaign_id ?? "")).filter(Boolean)),
        ];
        if (campaignIds.length > 0) {
          const { data: paid, error: paidErr } = await sb
            .from("delivery_ad_canonical_bc_fundings")
            .select("id")
            .in("application_id", campaignIds)
            .in("status", ["SECURED", "REFUNDED"])
            .limit(1);
          if (paidErr) return { ok: false, error: "sold_check_failed" };
          if ((paid ?? []).length > 0) return { ok: false, error: "duration_locked_sold" };
          /**
           * R-31: 옛 결제 표(매장 캐시 직접 차감)도 같은 요금 기록에 연결된다 — 삭제 막기(`admin-delivery-ad-delete.ts`)와 같이 두 표를 본다.
           * (2026-11-26 운영 DB 읽기 전용: REFUNDED 1건 · 요금 기록 연결 1건)
           */
          const { data: legacyPaid, error: legacyErr } = await sb
            .from("delivery_ad_store_cash_spends")
            .select("id")
            .in("campaign_id", campaignIds)
            .in("status", ["SECURED", "REFUNDED"])
            .limit(1);
          if (legacyErr) return { ok: false, error: "sold_check_failed" };
          if ((legacyPaid ?? []).length > 0) return { ok: false, error: "duration_locked_sold" };
        }
        if (rows.length < PAGE) {
          finished = true;
          break;
        }
      }
      /** R-42: 상한까지 다 못 봤으면 「팔렸음」이 아니라 「확인 못 함」(막는 것은 같음) */
      if (!finished) return { ok: false, error: "sold_check_failed" };
    }
    patch.duration_days = input.durationDays;
  }
  if (input.displayName != null) {
    const name = input.displayName.trim();
    if (!name) return { ok: false, error: "invalid_name" };
    patch.display_name = name;
  }
  if (input.displayOrder != null) {
    if (!Number.isInteger(input.displayOrder)) return { ok: false, error: "invalid_order" };
    patch.display_order = input.displayOrder;
  }

  let updateQ = sb.from(DELIVERY_AD_PACKAGE_TABLE).update(patch).eq("id", input.packageId);
  if (input.expectedUpdatedAt) updateQ = updateQ.eq("updated_at", input.expectedUpdatedAt);
  const { data: afterRaw, error } = await updateQ.select("*").maybeSingle();
  if (error) return { ok: false, error: error.message ?? "update_failed" };
  if (!afterRaw) return { ok: false, error: input.expectedUpdatedAt ? "stale_updated_at" : "update_failed" };
  const after = mapDeliveryAdPackageRow(afterRaw as Record<string, unknown>);
  if (!after) return { ok: false, error: "invalid_row" };

  const audit = await recordDeliveryAdCommercialOverride(sb, {
    entityType: "package",
    entityId: input.packageId,
    actorUserId: input.actorUserId,
    reason: input.reason,
    before: before as unknown as Record<string, unknown>,
    after: after as unknown as Record<string, unknown>,
  });
  if (!audit.ok) return audit;
  return { ok: true, package: after };
}

export async function adminUpdateDeliveryAdPartnerConfig(
  sb: SupabaseClient,
  input: {
    monthlyFeeMinor: number | null;
    advertisingDiscountPercent: number;
    enabled?: boolean;
    acceptingNewMembers?: boolean;
    actorUserId: string;
    reason: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (
    input.monthlyFeeMinor != null &&
    !assertDeliveryAdMoneyMinor(input.monthlyFeeMinor)
  ) {
    return { ok: false, error: "invalid_fee" };
  }
  if (
    !Number.isInteger(input.advertisingDiscountPercent) ||
    input.advertisingDiscountPercent < 0 ||
    input.advertisingDiscountPercent > 100
  ) {
    return { ok: false, error: "invalid_discount" };
  }

  const { data: before, error: loadErr } = await sb
    .from(DELIVERY_AD_PARTNER_CONFIG_TABLE)
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };

  const patch: Record<string, unknown> = {
    monthly_fee_minor: input.monthlyFeeMinor,
    advertising_discount_percent: input.advertisingDiscountPercent,
    updated_at: new Date().toISOString(),
  };
  if (input.enabled != null) patch.enabled = input.enabled;
  if (input.acceptingNewMembers != null) patch.accepting_new_members = input.acceptingNewMembers;
  if (before && typeof (before as { version?: number }).version === "number") {
    patch.version = Number((before as { version: number }).version) + 1;
  }

  const { data: after, error } = await sb
    .from(DELIVERY_AD_PARTNER_CONFIG_TABLE)
    .update(patch)
    .eq("id", "default")
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  return recordDeliveryAdCommercialOverride(sb, {
    entityType: "partner_config",
    entityId: "default",
    actorUserId: input.actorUserId,
    reason: input.reason,
    before: (before as Record<string, unknown>) ?? {},
    after: (after as Record<string, unknown>) ?? {},
  });
}

export async function adminUpdateDeliveryAdExtensionPolicy(
  sb: SupabaseClient,
  input: {
    extensionEnabled: boolean;
    additionalDayPriceMinor: number | null;
    minimumExtensionDays?: number;
    maximumExtensionDays?: number;
    actorUserId: string;
    reason: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (
    input.additionalDayPriceMinor != null &&
    !assertDeliveryAdMoneyMinor(input.additionalDayPriceMinor)
  ) {
    return { ok: false, error: "invalid_price" };
  }
  const { data: before } = await sb
    .from(DELIVERY_AD_EXTENSION_POLICY_TABLE)
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  const patch: Record<string, unknown> = {
    extension_enabled: input.extensionEnabled,
    additional_day_price_minor: input.additionalDayPriceMinor,
    updated_at: new Date().toISOString(),
  };
  if (input.minimumExtensionDays != null) patch.minimum_extension_days = input.minimumExtensionDays;
  if (input.maximumExtensionDays != null) patch.maximum_extension_days = input.maximumExtensionDays;

  const { data: after, error } = await sb
    .from(DELIVERY_AD_EXTENSION_POLICY_TABLE)
    .update(patch)
    .eq("id", "default")
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  return recordDeliveryAdCommercialOverride(sb, {
    entityType: "extension_policy",
    entityId: "default",
    actorUserId: input.actorUserId,
    reason: input.reason,
    before: (before as Record<string, unknown>) ?? {},
    after: (after as Record<string, unknown>) ?? {},
  });
}

export async function adminUpdateDeliveryAdProductCommercial(
  sb: SupabaseClient,
  input: {
    productKey: DeliveryAdProductKey;
    displayName?: string;
    description?: string | null;
    enabled?: boolean;
    acceptingApplications?: boolean;
    actorUserId: string;
    reason: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: before, error: loadErr } = await sb
    .from("delivery_ad_products")
    .select("*")
    .eq("key", input.productKey)
    .maybeSingle();
  if (loadErr || !before) return { ok: false, error: loadErr?.message ?? "not_found" };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.displayName != null) {
    const name = input.displayName.trim();
    if (!name) return { ok: false, error: "invalid_name" };
    patch.display_name = name;
  }
  if (input.description !== undefined) patch.description = input.description;
  if (input.enabled != null) patch.is_active = input.enabled;
  if (input.acceptingApplications != null) {
    patch.accepting_applications = input.acceptingApplications;
  }

  const { data: after, error } = await sb
    .from("delivery_ad_products")
    .update(patch)
    .eq("key", input.productKey)
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  return recordDeliveryAdCommercialOverride(sb, {
    entityType: "product",
    entityId: input.productKey,
    actorUserId: input.actorUserId,
    reason: input.reason,
    before: before as Record<string, unknown>,
    after: (after as Record<string, unknown>) ?? {},
  });
}

export async function adminCreateDeliveryAdPackage(
  sb: SupabaseClient,
  input: {
    productKind: DeliveryAdProductKey;
    inventoryKey: string;
    code: string;
    displayName: string;
    durationDays: number;
    priceAmountMinor: number | null;
    enabled: boolean;
    displayOrder: number;
    actorUserId: string;
    reason: string;
  }
): Promise<{ ok: true; package: DeliveryAdPackageRow } | { ok: false; error: string }> {
  const code = input.code.trim();
  const displayName = input.displayName.trim();
  if (!code || !displayName) return { ok: false, error: "invalid_code" };
  if (!Number.isInteger(input.durationDays) || input.durationDays < 1) {
    return { ok: false, error: "invalid_duration" };
  }
  if (
    input.priceAmountMinor != null &&
    (!assertDeliveryAdMoneyMinor(input.priceAmountMinor) || input.priceAmountMinor <= 0)
  ) {
    return { ok: false, error: "invalid_price" };
  }
  /** D-13: 금액 상한(₱100,000) — 오타 방지 */
  if (input.priceAmountMinor != null && isAdPhpPriceOverCap(input.priceAmountMinor)) {
    return { ok: false, error: "price_over_cap" };
  }
  if (input.enabled && (input.priceAmountMinor == null || input.priceAmountMinor <= 0)) {
    return { ok: false, error: "price_required_to_enable" };
  }

  const { data, error } = await sb
    .from(DELIVERY_AD_PACKAGE_TABLE)
    .insert({
      product_kind: input.productKind,
      inventory_key: input.inventoryKey,
      code,
      display_name: displayName,
      duration_days: input.durationDays,
      price_amount_minor: input.priceAmountMinor,
      currency: "PHP",
      enabled: input.enabled,
      display_order: input.displayOrder,
    })
    .select("*")
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };
  const row = mapDeliveryAdPackageRow(data as Record<string, unknown>);
  if (!row) return { ok: false, error: "invalid_row" };

  const audit = await recordDeliveryAdCommercialOverride(sb, {
    entityType: "package",
    entityId: row.id,
    actorUserId: input.actorUserId,
    reason: input.reason,
    before: {},
    after: row as unknown as Record<string, unknown>,
  });
  if (!audit.ok) return audit;
  return { ok: true, package: row };
}

export async function adminSetPlacementSellable(
  sb: SupabaseClient,
  input: {
    productKind: DeliveryAdProductKey;
    inventoryKey: string;
    sellable: boolean;
    actorUserId: string;
    reason: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: before } = await sb
    .from(DELIVERY_AD_PLACEMENT_COMMERCIAL_TABLE)
    .select("*")
    .eq("product_kind", input.productKind)
    .eq("inventory_key", input.inventoryKey)
    .maybeSingle();

  const { data: after, error } = await sb
    .from(DELIVERY_AD_PLACEMENT_COMMERCIAL_TABLE)
    .upsert(
      {
        product_kind: input.productKind,
        inventory_key: input.inventoryKey,
        sellable: input.sellable,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "product_kind,inventory_key" }
    )
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  return recordDeliveryAdCommercialOverride(sb, {
    entityType: "placement_commercial",
    entityId: `${input.productKind}:${input.inventoryKey}`,
    actorUserId: input.actorUserId,
    reason: input.reason,
    before: (before as Record<string, unknown>) ?? {},
    after: (after as Record<string, unknown>) ?? {},
  });
}
