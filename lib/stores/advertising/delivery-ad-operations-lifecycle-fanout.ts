/**
 * PRODUCT CUT 3-B/3-D — Fan-out durable audit_id → ensure Case → one system lifecycle event
 * → Owner notification (derived; failure does not roll back).
 * Does NOT transition campaigns. Idempotent on source_audit_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DELIVERY_AD_AUDIT_LOG_TABLE } from "@/lib/stores/advertising/delivery-ad-audit";
import {
  ensureDeliveryAdOperationsCase,
  updateDeliveryAdOperationsCaseStatus,
} from "@/lib/stores/advertising/delivery-ad-operations-case-service";
import {
  lifecycleFromAuditJson,
  mapDeliveryAdLifecycleAuditToOpsEvent,
} from "@/lib/stores/advertising/delivery-ad-operations-lifecycle-event";
import {
  DELIVERY_AD_OPERATIONS_MESSAGE_TABLE,
  DELIVERY_AD_OPS_LIFECYCLE_EVENT_TYPES,
  mapDeliveryAdOperationsMessageRow,
  type DeliveryAdOperationsMessageRow,
  type DeliveryAdOpsLifecycleEventType,
} from "@/lib/stores/advertising/delivery-ad-operations-message";
import { isDeliveryAdProductKind } from "@/lib/stores/advertising/delivery-ad-domain";
import { safeNotifyDeliveryAdLifecycleOwner } from "@/lib/stores/advertising/delivery-ad-operations-notification";

function asLifecycleEventType(v: string): DeliveryAdOpsLifecycleEventType | null {
  return (DELIVERY_AD_OPS_LIFECYCLE_EVENT_TYPES as readonly string[]).includes(v)
    ? (v as DeliveryAdOpsLifecycleEventType)
    : null;
}

export type FanOutDeliveryAdLifecycleAuditError =
  | "invalid_audit_id"
  | "audit_not_found"
  | "skipped"
  | "case_failed"
  | "thread_missing"
  | "db_error"
  | "campaign_mismatch";

export type FanOutDeliveryAdLifecycleAuditResult =
  | {
      ok: true;
      skipped?: false;
      message: DeliveryAdOperationsMessageRow;
      caseId: string;
      threadId: string;
      duplicated: boolean;
    }
  | { ok: true; skipped: true; reason: "unsupported_audit" }
  | { ok: false; error: FanOutDeliveryAdLifecycleAuditError; detail?: string };

function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(String(err.message ?? ""));
}

async function loadMessageByAuditId(
  sb: SupabaseClient,
  auditId: string
): Promise<DeliveryAdOperationsMessageRow | null> {
  const { data, error } = await sb
    .from(DELIVERY_AD_OPERATIONS_MESSAGE_TABLE)
    .select("*")
    .eq("source_audit_id", auditId)
    .maybeSingle();
  if (error || !data) return null;
  return mapDeliveryAdOperationsMessageRow(data as Record<string, unknown>);
}

/**
 * Canonical retryable fan-out. Input = audit_id only (server loads authoritative audit).
 */
export async function fanOutDeliveryAdLifecycleAudit(
  sb: SupabaseClient,
  input: { auditId: string }
): Promise<FanOutDeliveryAdLifecycleAuditResult> {
  const auditId = String(input.auditId ?? "").trim();
  if (!auditId) return { ok: false, error: "invalid_audit_id" };

  const existing = await loadMessageByAuditId(sb, auditId);
  if (existing) {
    const { data: thread } = await sb
      .from("delivery_ad_operations_threads")
      .select("case_id")
      .eq("id", existing.threadId)
      .maybeSingle();
    const caseId =
      thread && (thread as { case_id?: string }).case_id != null
        ? String((thread as { case_id: string }).case_id)
        : "";
    // Idempotent Owner notify retry (dedupe_key); no lifecycle mutation
    if (existing.kind === "system_lifecycle" && caseId) {
      const { data: caseRow } = await sb
        .from("delivery_ad_operations_cases")
        .select("owner_user_id, product_kind, store_sponsored_campaign_id, banner_campaign_id")
        .eq("id", caseId)
        .maybeSingle();
      const eventType = asLifecycleEventType(existing.eventType);
      if (caseRow && eventType && isDeliveryAdProductKind(caseRow.product_kind)) {
        const campId =
          caseRow.product_kind === "store_sponsored"
            ? String(caseRow.store_sponsored_campaign_id ?? "")
            : String(caseRow.banner_campaign_id ?? "");
        if (campId) {
          await safeNotifyDeliveryAdLifecycleOwner(sb, {
            ownerUserId: String(caseRow.owner_user_id ?? ""),
            productKind: caseRow.product_kind,
            campaignId: campId,
            auditId,
            eventType,
            caseId,
            threadId: existing.threadId,
          });
        }
      }
    }
    return {
      ok: true,
      message: existing,
      caseId,
      threadId: existing.threadId,
      duplicated: true,
    };
  }

  const { data: auditRaw, error: auditErr } = await sb
    .from(DELIVERY_AD_AUDIT_LOG_TABLE)
    .select(
      "id, product_kind, campaign_id, actor_type, action, before_json, after_json, reason, created_at"
    )
    .eq("id", auditId)
    .maybeSingle();
  if (auditErr) return { ok: false, error: "db_error", detail: auditErr.message };
  if (!auditRaw) return { ok: false, error: "audit_not_found" };

  const productKind = (auditRaw as { product_kind?: unknown }).product_kind;
  const campaignId =
    (auditRaw as { campaign_id?: unknown }).campaign_id == null
      ? ""
      : String((auditRaw as { campaign_id: string }).campaign_id);
  if (!isDeliveryAdProductKind(productKind) || !campaignId) {
    return { ok: true, skipped: true, reason: "unsupported_audit" };
  }

  const fromLifecycle = lifecycleFromAuditJson(
    (auditRaw as { before_json?: unknown }).before_json
  );
  const toLifecycle = lifecycleFromAuditJson(
    (auditRaw as { after_json?: unknown }).after_json
  );
  const auditAction = String((auditRaw as { action?: string }).action ?? "");
  const actorType = String((auditRaw as { actor_type?: string }).actor_type ?? "");

  const mapped = mapDeliveryAdLifecycleAuditToOpsEvent({
    fromLifecycle,
    toLifecycle,
    auditAction,
    actorType,
  });
  if (!mapped) {
    return { ok: true, skipped: true, reason: "unsupported_audit" };
  }

  const ensured = await ensureDeliveryAdOperationsCase(sb, {
    productKind,
    campaignId,
  });
  if (!ensured.ok) {
    return { ok: false, error: "case_failed", detail: ensured.error };
  }
  const threadId = ensured.case.threadId;
  if (!threadId) return { ok: false, error: "thread_missing" };

  // Campaign identity must match Case (audit → case binding)
  const caseCampaignId =
    ensured.case.productKind === "store_sponsored"
      ? ensured.case.storeSponsoredCampaignId
      : ensured.case.bannerCampaignId;
  if (caseCampaignId !== campaignId || ensured.case.productKind !== productKind) {
    return { ok: false, error: "campaign_mismatch" };
  }

  const occurredAt = String(
    (auditRaw as { created_at?: string }).created_at ?? new Date().toISOString()
  );
  const nowIso = new Date().toISOString();

  const { data: inserted, error: insertErr } = await sb
    .from(DELIVERY_AD_OPERATIONS_MESSAGE_TABLE)
    .insert({
      thread_id: threadId,
      kind: "system_lifecycle",
      sender_role: "system",
      sender_user_id: null,
      source_audit_id: auditId,
      event_type: mapped.eventType,
      message_key: mapped.messageKey,
      body: null,
      occurred_at: occurredAt,
      created_at: nowIso,
    })
    .select("*")
    .maybeSingle();

  if (insertErr) {
    if (isUniqueViolation(insertErr)) {
      const again = await loadMessageByAuditId(sb, auditId);
      if (!again) return { ok: false, error: "db_error", detail: insertErr.message };
      // Idempotent Owner notify retry (dedupe_key); no lifecycle mutation
      if (again.kind === "system_lifecycle") {
        const eventType = asLifecycleEventType(again.eventType);
        if (eventType) {
          await safeNotifyDeliveryAdLifecycleOwner(sb, {
            ownerUserId: ensured.case.ownerUserId,
            productKind,
            campaignId,
            auditId,
            eventType,
            caseId: ensured.case.id,
            threadId,
          });
        }
      }
      return {
        ok: true,
        message: again,
        caseId: ensured.case.id,
        threadId,
        duplicated: true,
      };
    }
    return { ok: false, error: "db_error", detail: insertErr.message };
  }
  if (!inserted) return { ok: false, error: "db_error" };

  const message = mapDeliveryAdOperationsMessageRow(inserted as Record<string, unknown>);
  if (!message || message.kind !== "system_lifecycle") return { ok: false, error: "db_error" };

  if (mapped.caseEffect) {
    const statusRes = await updateDeliveryAdOperationsCaseStatus(sb, {
      caseId: ensured.case.id,
      status: mapped.caseEffect,
    });
    if (!statusRes.ok) {
      console.error(
        "[fanOutDeliveryAdLifecycleAudit] case status update failed",
        ensured.case.id,
        statusRes.error
      );
    }
  }

  // CUT 3-D — Owner notification derived side effect (no lifecycle rollback)
  if (message.kind === "system_lifecycle") {
    const eventType = asLifecycleEventType(message.eventType);
    if (eventType) {
      await safeNotifyDeliveryAdLifecycleOwner(sb, {
        ownerUserId: ensured.case.ownerUserId,
        productKind,
        campaignId,
        auditId,
        eventType,
        caseId: ensured.case.id,
        threadId,
      });
    }
  }

  return {
    ok: true,
    message,
    caseId: ensured.case.id,
    threadId,
    duplicated: false,
  };
}

/**
 * Fire-and-forget after committed transition. Never rolls back campaign.
 * Safe to call twice (UNIQUE source_audit_id).
 */
export async function safeFanOutDeliveryAdLifecycleAudit(
  sb: SupabaseClient,
  auditId: string
): Promise<void> {
  try {
    const result = await fanOutDeliveryAdLifecycleAudit(sb, { auditId });
    if (!result.ok) {
      console.error("[safeFanOutDeliveryAdLifecycleAudit]", auditId, result.error, result.detail);
    }
  } catch (err) {
    console.error("[safeFanOutDeliveryAdLifecycleAudit]", auditId, err);
  }
}
