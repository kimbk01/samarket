import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupportContext } from "@/lib/support/support-context";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";

export type ReferenceAuthorityResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Support reference_type inventory (CUT 3B).
 *
 * TYPE                    | VALIDATOR              | AUTHORITY KEY                         | STATUS
 * ----------------------- | ---------------------- | ------------------------------------- | -----------
 * GIFT_INSTANCE           | gift_certificate_instances.current_owner_user_id | requester ownership | ACTIVE
 * STORE_ORDER             | store_orders.buyer_user_id | requester ownership              | ACTIVE
 * STORE_PRODUCT           | store_products.store_id + owner store gate | owner store scope | ACTIVE
 * AD_CAMPAIGN             | store_*_ad_campaigns.store_id + owner store gate | owner store scope | ACTIVE (FAB)
 * DELIVERY_AD_CAMPAIGN    | alias of AD_CAMPAIGN   | owner store scope                    | ACTIVE
 * STORE_SETTLEMENT        | store_settlements.store_id + OWNER audience + owner store gate | owner store scope | ACTIVE
 *
 * Any other / unknown type → DENY (fail-closed). No default pass-through.
 */
export const SUPPORT_REFERENCE_TYPES = [
  "GIFT_INSTANCE",
  "STORE_ORDER",
  "STORE_PRODUCT",
  "AD_CAMPAIGN",
  "DELIVERY_AD_CAMPAIGN",
  "STORE_SETTLEMENT",
] as const;

export type SupportReferenceType = (typeof SUPPORT_REFERENCE_TYPES)[number];

const ACTIVE_REFERENCE_TYPES = new Set<string>(SUPPORT_REFERENCE_TYPES);

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

async function assertOwnerStoreCampaign(
  sb: SupabaseClient,
  input: { userId: string; storeId: string; referenceId: string }
): Promise<ReferenceAuthorityResult> {
  const storeId = input.storeId.trim();
  if (!storeId) return { ok: false, error: "missing_store_id" };
  const gate = await getCachedStoreIfOwner(sb, input.userId, storeId);
  if (!gate.ok) return { ok: false, error: "store_forbidden" };

  const { data: sponsored } = await sb
    .from("store_paid_ad_campaigns")
    .select("id, store_id")
    .eq("id", input.referenceId)
    .maybeSingle();
  if (sponsored && String(sponsored.store_id) === storeId) return { ok: true };

  const { data: banner } = await sb
    .from("store_banner_ad_campaigns")
    .select("id, store_id")
    .eq("id", input.referenceId)
    .maybeSingle();
  if (banner && String(banner.store_id) === storeId) return { ok: true };

  return { ok: false, error: "reference_forbidden" };
}

/**
 * Server-side reference entity authority — client reference ids are never trusted alone.
 * Fail-closed: unknown / unimplemented types are DENY.
 */
export async function assertSupportReferenceAuthority(
  sb: SupabaseClient,
  input: {
    userId: string;
    audience: "MEMBER" | "OWNER";
    storeId?: string;
    referenceType?: string;
    referenceId?: string;
  }
): Promise<ReferenceAuthorityResult> {
  const referenceType = (input.referenceType ?? "").trim();
  const referenceId = (input.referenceId ?? "").trim();
  if (!referenceType && !referenceId) return { ok: true };
  if (!referenceType || !referenceId) {
    return { ok: false, error: "reference_incomplete" };
  }

  if (!ACTIVE_REFERENCE_TYPES.has(referenceType)) {
    return { ok: false, error: "reference_type_not_allowed" };
  }

  if (!isUuid(referenceId)) {
    return { ok: false, error: "invalid_reference_id" };
  }

  switch (referenceType as SupportReferenceType) {
    case "GIFT_INSTANCE": {
      const { data } = await sb
        .from("gift_certificate_instances")
        .select("id, current_owner_user_id")
        .eq("id", referenceId)
        .maybeSingle();
      if (!data || String(data.current_owner_user_id) !== input.userId) {
        return { ok: false, error: "reference_forbidden" };
      }
      return { ok: true };
    }
    case "STORE_ORDER": {
      const { data } = await sb
        .from("store_orders")
        .select("id, buyer_user_id")
        .eq("id", referenceId)
        .maybeSingle();
      if (!data || String(data.buyer_user_id) !== input.userId) {
        return { ok: false, error: "reference_forbidden" };
      }
      return { ok: true };
    }
    case "STORE_PRODUCT": {
      const storeId = (input.storeId ?? "").trim();
      if (!storeId) return { ok: false, error: "missing_store_id" };
      const gate = await getCachedStoreIfOwner(sb, input.userId, storeId);
      if (!gate.ok) return { ok: false, error: "store_forbidden" };
      const { data } = await sb
        .from("store_products")
        .select("id, store_id")
        .eq("id", referenceId)
        .maybeSingle();
      if (!data || String(data.store_id) !== storeId) {
        return { ok: false, error: "reference_forbidden" };
      }
      return { ok: true };
    }
    case "AD_CAMPAIGN":
    case "DELIVERY_AD_CAMPAIGN":
      return assertOwnerStoreCampaign(sb, {
        userId: input.userId,
        storeId: input.storeId ?? "",
        referenceId,
      });
    case "STORE_SETTLEMENT": {
      if (input.audience !== "OWNER") {
        return { ok: false, error: "reference_forbidden" };
      }
      const storeId = (input.storeId ?? "").trim();
      if (!storeId) return { ok: false, error: "missing_store_id" };
      const gate = await getCachedStoreIfOwner(sb, input.userId, storeId);
      if (!gate.ok) return { ok: false, error: "store_forbidden" };

      const { data } = await sb
        .from("store_settlements")
        .select("id, store_id")
        .eq("id", referenceId)
        .maybeSingle();
      if (!data || String(data.store_id) !== storeId) {
        return { ok: false, error: "reference_forbidden" };
      }
      return { ok: true };
    }
    default:
      // Exhaustiveness fail-closed — never pass through.
      return { ok: false, error: "reference_type_not_allowed" };
  }
}

export function normalizeSupportContextForCase(context: SupportContext): {
  audience: "MEMBER" | "OWNER";
  /** Raw category candidate — empty string if missing (never invent OTHER). */
  category: string;
  sourceSurface: string;
  referenceType?: string;
  referenceId?: string;
  ownerStoreId?: string;
} {
  const audience = context.audience === "OWNER" ? "OWNER" : "MEMBER";
  const ownerStoreId =
    audience === "OWNER" ? (context.storeId?.trim() || undefined) : undefined;
  return {
    audience,
    category: typeof context.category === "string" ? context.category.trim() : "",
    sourceSurface: context.sourceSurface.trim() || "unknown",
    referenceType: context.referenceType?.trim() || undefined,
    referenceId: context.referenceId?.trim() || undefined,
    ownerStoreId,
  };
}
