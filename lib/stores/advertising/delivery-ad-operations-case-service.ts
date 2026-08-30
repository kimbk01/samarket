/**
 * PRODUCT CUT 3-A — Canonical Delivery Ads operations Case/Thread service.
 * ONE writer authority for Case status. No lifecycle fan-out · no messaging · no notification.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BANNER_AD_CAMPAIGN_TABLE,
  STORE_SPONSORED_CAMPAIGN_TABLE,
} from "@/lib/stores/advertising/delivery-ad-domain";
import {
  campaignIdentityToCaseFkColumns,
  DELIVERY_AD_OPERATIONS_CASE_TABLE,
  DELIVERY_AD_OPERATIONS_THREAD_TABLE,
  isDeliveryAdOperationsCaseStatus,
  parseDeliveryAdCampaignIdentity,
  type DeliveryAdCampaignIdentity,
  type DeliveryAdOperationsCaseRow,
  type DeliveryAdOperationsCaseStatus,
} from "@/lib/stores/advertising/delivery-ad-operations-case";

export type DeliveryAdOperationsCaseError =
  | "invalid_identity"
  | "campaign_not_found"
  | "owner_missing"
  | "db_error"
  | "invalid_status"
  | "case_not_found";

type CaseResult =
  | { ok: true; case: DeliveryAdOperationsCaseRow }
  | { ok: false; error: DeliveryAdOperationsCaseError };

type CampaignOwnerLoad =
  | { ok: true; ownerUserId: string }
  | { ok: false; error: "campaign_not_found" | "owner_missing" | "db_error" };

function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(String(err.message ?? ""));
}

function mapCaseRow(
  raw: Record<string, unknown>,
  threadId: string | null
): DeliveryAdOperationsCaseRow | null {
  const id = raw.id == null ? "" : String(raw.id);
  const productKind = raw.product_kind;
  const status = raw.status;
  const ownerUserId = raw.owner_user_id == null ? "" : String(raw.owner_user_id);
  if (!id || !ownerUserId) return null;
  if (productKind !== "store_sponsored" && productKind !== "banner") return null;
  if (!isDeliveryAdOperationsCaseStatus(status)) return null;
  return {
    id,
    productKind,
    storeSponsoredCampaignId:
      raw.store_sponsored_campaign_id == null
        ? null
        : String(raw.store_sponsored_campaign_id),
    bannerCampaignId:
      raw.banner_campaign_id == null ? null : String(raw.banner_campaign_id),
    ownerUserId,
    status,
    createdAt: String(raw.created_at ?? ""),
    updatedAt: String(raw.updated_at ?? ""),
    resolvedAt: raw.resolved_at == null ? null : String(raw.resolved_at),
    threadId,
  };
}

async function loadCampaignOwnerUserId(
  sb: SupabaseClient,
  identity: DeliveryAdCampaignIdentity
): Promise<CampaignOwnerLoad> {
  const table =
    identity.productKind === "store_sponsored"
      ? STORE_SPONSORED_CAMPAIGN_TABLE
      : BANNER_AD_CAMPAIGN_TABLE;
  const { data, error } = await sb
    .from(table)
    .select("id, owner_user_id")
    .eq("id", identity.campaignId)
    .maybeSingle();
  if (error) return { ok: false, error: "db_error" };
  if (!data) return { ok: false, error: "campaign_not_found" };
  const ownerUserId =
    (data as { owner_user_id?: string | null }).owner_user_id == null
      ? ""
      : String((data as { owner_user_id?: string | null }).owner_user_id).trim();
  if (!ownerUserId) return { ok: false, error: "owner_missing" };
  return { ok: true, ownerUserId };
}

async function loadThreadIdForCase(
  sb: SupabaseClient,
  caseId: string
): Promise<string | null> {
  const { data } = await sb
    .from(DELIVERY_AD_OPERATIONS_THREAD_TABLE)
    .select("id")
    .eq("case_id", caseId)
    .maybeSingle();
  return data?.id == null ? null : String(data.id);
}

async function fetchCaseByCampaign(
  sb: SupabaseClient,
  identity: DeliveryAdCampaignIdentity
): Promise<CaseResult> {
  const fk = campaignIdentityToCaseFkColumns(identity);
  let q = sb.from(DELIVERY_AD_OPERATIONS_CASE_TABLE).select("*");
  if (identity.productKind === "store_sponsored") {
    q = q.eq("store_sponsored_campaign_id", identity.campaignId);
  } else {
    q = q.eq("banner_campaign_id", identity.campaignId);
  }
  const { data, error } = await q.maybeSingle();
  if (error) return { ok: false, error: "db_error" };
  if (!data) return { ok: false, error: "case_not_found" };
  const threadId = await loadThreadIdForCase(sb, String((data as { id: string }).id));
  const mapped = mapCaseRow(data as Record<string, unknown>, threadId);
  if (!mapped) return { ok: false, error: "db_error" };
  // Defensive: product_kind must match FK population (DB CHECK also enforces).
  if (
    mapped.productKind !== fk.product_kind ||
    mapped.storeSponsoredCampaignId !== fk.store_sponsored_campaign_id ||
    mapped.bannerCampaignId !== fk.banner_campaign_id
  ) {
    return { ok: false, error: "db_error" };
  }
  return { ok: true, case: mapped };
}

async function ensureThreadForCase(
  sb: SupabaseClient,
  caseId: string
): Promise<{ ok: true; threadId: string } | { ok: false; error: "db_error" }> {
  const existing = await loadThreadIdForCase(sb, caseId);
  if (existing) return { ok: true, threadId: existing };

  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from(DELIVERY_AD_OPERATIONS_THREAD_TABLE)
    .insert({ case_id: caseId, created_at: nowIso, updated_at: nowIso })
    .select("id")
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      const again = await loadThreadIdForCase(sb, caseId);
      if (again) return { ok: true, threadId: again };
    }
    return { ok: false, error: "db_error" };
  }
  if (!data?.id) return { ok: false, error: "db_error" };
  return { ok: true, threadId: String(data.id) };
}

/**
 * Idempotent ensure: ONE campaign → ONE case → ONE thread.
 * Initial status always OPEN (no lifecycle inference).
 */
export async function ensureDeliveryAdOperationsCase(
  sb: SupabaseClient,
  input: { productKind: unknown; campaignId: unknown }
): Promise<CaseResult> {
  const identity = parseDeliveryAdCampaignIdentity(input);
  if (!identity) return { ok: false, error: "invalid_identity" };

  const existing = await fetchCaseByCampaign(sb, identity);
  if (existing.ok) {
    if (!existing.case.threadId) {
      const thread = await ensureThreadForCase(sb, existing.case.id);
      if (!thread.ok) return { ok: false, error: "db_error" };
      return { ok: true, case: { ...existing.case, threadId: thread.threadId } };
    }
    return existing;
  }
  if (existing.error !== "case_not_found") return existing;

  const owner = await loadCampaignOwnerUserId(sb, identity);
  if (!owner.ok) return { ok: false, error: owner.error };

  const fk = campaignIdentityToCaseFkColumns(identity);
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from(DELIVERY_AD_OPERATIONS_CASE_TABLE)
    .insert({
      ...fk,
      owner_user_id: owner.ownerUserId,
      status: "OPEN",
      created_at: nowIso,
      updated_at: nowIso,
      resolved_at: null,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      return fetchCaseByCampaign(sb, identity);
    }
    return { ok: false, error: "db_error" };
  }
  if (!data) return { ok: false, error: "db_error" };

  const caseId = String((data as { id: string }).id);
  const thread = await ensureThreadForCase(sb, caseId);
  if (!thread.ok) return { ok: false, error: "db_error" };

  const mapped = mapCaseRow(data as Record<string, unknown>, thread.threadId);
  if (!mapped) return { ok: false, error: "db_error" };
  return { ok: true, case: mapped };
}

export async function getDeliveryAdOperationsCase(
  sb: SupabaseClient,
  input: { productKind: unknown; campaignId: unknown }
): Promise<CaseResult> {
  const identity = parseDeliveryAdCampaignIdentity(input);
  if (!identity) return { ok: false, error: "invalid_identity" };
  return fetchCaseByCampaign(sb, identity);
}

/**
 * Sole Case status mutation authority (server-only).
 * CUT 3-C: delegates to delivery_ad_ops_apply_case_status (shared with human-send RPC).
 * UI / Owner / Admin routes must not PATCH status directly.
 */
export async function updateDeliveryAdOperationsCaseStatus(
  sb: SupabaseClient,
  input: { caseId: string; status: DeliveryAdOperationsCaseStatus }
): Promise<CaseResult> {
  const caseId = String(input.caseId ?? "").trim();
  if (!caseId) return { ok: false, error: "case_not_found" };
  if (!isDeliveryAdOperationsCaseStatus(input.status)) {
    return { ok: false, error: "invalid_status" };
  }

  const { data, error } = await sb.rpc("delivery_ad_ops_apply_case_status", {
    p_case_id: caseId,
    p_status: input.status,
  });
  if (error) return { ok: false, error: "db_error" };
  const payload = data as { ok?: boolean; error?: string; case?: Record<string, unknown> } | null;
  if (!payload?.ok || !payload.case) {
    const err = payload?.error;
    if (err === "case_not_found" || err === "invalid_status") {
      return { ok: false, error: err };
    }
    return { ok: false, error: "db_error" };
  }

  const threadId = await loadThreadIdForCase(sb, caseId);
  const mapped = mapCaseRow(payload.case, threadId);
  if (!mapped) return { ok: false, error: "db_error" };
  return { ok: true, case: mapped };
}

/** Test/helper: resolve owner from campaign without creating a case. */
export async function resolveDeliveryAdCampaignOwnerUserId(
  sb: SupabaseClient,
  input: { productKind: unknown; campaignId: unknown }
): Promise<CampaignOwnerLoad | { ok: false; error: "invalid_identity" }> {
  const identity = parseDeliveryAdCampaignIdentity(input);
  if (!identity) return { ok: false, error: "invalid_identity" };
  return loadCampaignOwnerUserId(sb, identity);
}
