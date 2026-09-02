import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupportContext } from "@/lib/support/support-context";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";

export type ReferenceAuthorityResult =
  | { ok: true }
  | { ok: false; error: string };

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

/**
 * Server-side reference entity authority — client reference ids are never trusted alone.
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
  if (!referenceType || !referenceId) return { ok: true };

  if (!isUuid(referenceId) && referenceType !== "DELIVERY_AD_CAMPAIGN") {
    return { ok: false, error: "invalid_reference_id" };
  }

  switch (referenceType) {
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
    case "DELIVERY_AD_CAMPAIGN": {
      const storeId = (input.storeId ?? "").trim();
      if (!storeId) return { ok: false, error: "missing_store_id" };
      const gate = await getCachedStoreIfOwner(sb, input.userId, storeId);
      if (!gate.ok) return { ok: false, error: "store_forbidden" };
      const { data: sponsored } = await sb
        .from("store_paid_ad_campaigns")
        .select("id, store_id")
        .eq("id", referenceId)
        .maybeSingle();
      if (sponsored && String(sponsored.store_id) === storeId) return { ok: true };
      const { data: banner } = await sb
        .from("store_banner_ad_campaigns")
        .select("id, store_id")
        .eq("id", referenceId)
        .maybeSingle();
      if (banner && String(banner.store_id) === storeId) return { ok: true };
      return { ok: false, error: "reference_forbidden" };
    }
    default:
      return { ok: true };
  }
}

export function normalizeSupportContextForCase(context: SupportContext): {
  audience: "MEMBER" | "OWNER";
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
    category: context.category.trim() || "OTHER",
    sourceSurface: context.sourceSurface.trim() || "unknown",
    referenceType: context.referenceType?.trim() || undefined,
    referenceId: context.referenceId?.trim() || undefined,
    ownerStoreId,
  };
}
