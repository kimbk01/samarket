/**
 * PRODUCT CUT 3-C — Human Owner↔Admin operations messaging (write/read).
 * MESSAGE SEND ≠ CAMPAIGN LIFECYCLE. Storage + auth only (no 3-D/3-E surfaces).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BANNER_AD_CAMPAIGN_TABLE,
  STORE_SPONSORED_CAMPAIGN_TABLE,
  isDeliveryAdProductKind,
} from "@/lib/stores/advertising/delivery-ad-domain";
import {
  ensureDeliveryAdOperationsCase,
  getDeliveryAdOperationsCase,
} from "@/lib/stores/advertising/delivery-ad-operations-case-service";
import type { DeliveryAdOperationsCaseStatus } from "@/lib/stores/advertising/delivery-ad-operations-case";
import {
  DELIVERY_AD_OPERATIONS_MESSAGE_TABLE,
  DELIVERY_AD_OPS_HUMAN_MESSAGE_MAX_CHARS,
  DELIVERY_AD_OPS_MESSAGE_LIST_DEFAULT_LIMIT,
  DELIVERY_AD_OPS_MESSAGE_LIST_MAX_LIMIT,
  mapDeliveryAdOperationsMessageRow,
  type DeliveryAdOpsHumanMessage,
  type DeliveryAdOperationsTimelineMessage,
} from "@/lib/stores/advertising/delivery-ad-operations-message";

export type DeliveryAdOpsMessagingActorRole = "owner" | "admin";

export type DeliveryAdOpsMessagingError =
  | "invalid_identity"
  | "invalid_body"
  | "forbidden"
  | "campaign_not_found"
  | "case_failed"
  | "thread_missing"
  | "db_error";

export type SendDeliveryAdOperationsMessageResult =
  | {
      ok: true;
      message: DeliveryAdOpsHumanMessage;
      caseId: string;
      threadId: string;
      caseStatus: DeliveryAdOperationsCaseStatus;
    }
  | { ok: false; error: DeliveryAdOpsMessagingError; detail?: string };

export type ListDeliveryAdOperationsMessagesResult =
  | {
      ok: true;
      caseId: string;
      threadId: string;
      messages: DeliveryAdOperationsTimelineMessage[];
    }
  | { ok: false; error: DeliveryAdOpsMessagingError };

function normalizeBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, DELIVERY_AD_OPS_HUMAN_MESSAGE_MAX_CHARS);
}

async function assertViewerAuthorized(
  sb: SupabaseClient,
  input: {
    actorUserId: string;
    actorRole: DeliveryAdOpsMessagingActorRole;
    productKind: "store_sponsored" | "banner";
    campaignId: string;
  }
): Promise<{ ok: true } | { ok: false; error: DeliveryAdOpsMessagingError }> {
  if (input.actorRole === "admin") {
    return { ok: true };
  }
  const table =
    input.productKind === "store_sponsored"
      ? STORE_SPONSORED_CAMPAIGN_TABLE
      : BANNER_AD_CAMPAIGN_TABLE;
  const { data, error } = await sb
    .from(table)
    .select("id, owner_user_id")
    .eq("id", input.campaignId)
    .maybeSingle();
  if (error) return { ok: false, error: "db_error" };
  if (!data) return { ok: false, error: "campaign_not_found" };
  const owner =
    (data as { owner_user_id?: string | null }).owner_user_id == null
      ? ""
      : String((data as { owner_user_id: string }).owner_user_id);
  if (owner !== input.actorUserId) return { ok: false, error: "forbidden" };
  return { ok: true };
}

/**
 * Canonical human message writer. Does NOT call campaign lifecycle RPCs/writers.
 * Case status effect via shared delivery_ad_ops_apply_case_status inside send RPC.
 */
export async function sendDeliveryAdOperationsMessage(
  sb: SupabaseClient,
  input: {
    actorUserId: string;
    actorRole: DeliveryAdOpsMessagingActorRole;
    productKind: unknown;
    campaignId: unknown;
    body: unknown;
  }
): Promise<SendDeliveryAdOperationsMessageResult> {
  if (!isDeliveryAdProductKind(input.productKind)) {
    return { ok: false, error: "invalid_identity" };
  }
  const campaignId =
    typeof input.campaignId === "string" ? input.campaignId.trim() : "";
  if (!campaignId || !input.actorUserId.trim()) {
    return { ok: false, error: "invalid_identity" };
  }
  if (input.actorRole !== "owner" && input.actorRole !== "admin") {
    return { ok: false, error: "forbidden" };
  }

  const body = normalizeBody(input.body);
  if (!body) return { ok: false, error: "invalid_body" };

  const auth = await assertViewerAuthorized(sb, {
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    productKind: input.productKind,
    campaignId,
  });
  if (!auth.ok) return auth;

  const ensured = await ensureDeliveryAdOperationsCase(sb, {
    productKind: input.productKind,
    campaignId,
  });
  if (!ensured.ok) {
    return {
      ok: false,
      error: ensured.error === "campaign_not_found" ? "campaign_not_found" : "case_failed",
    };
  }
  const threadId = ensured.case.threadId;
  if (!threadId) return { ok: false, error: "thread_missing" };

  const { data, error } = await sb.rpc("send_delivery_ad_operations_message", {
    p_actor_user_id: input.actorUserId,
    p_actor_role: input.actorRole,
    p_product_kind: input.productKind,
    p_campaign_id: campaignId,
    p_case_id: ensured.case.id,
    p_thread_id: threadId,
    p_body: body,
  });
  if (error) {
    console.error("[sendDeliveryAdOperationsMessage]", error.message);
    return { ok: false, error: "db_error", detail: error.message };
  }
  const payload = data as {
    ok?: boolean;
    error?: string;
    detail?: string;
    message?: Record<string, unknown>;
    case_id?: string;
    thread_id?: string;
    case_status?: string;
  } | null;
  if (!payload?.ok || !payload.message) {
    const err = payload?.error;
    if (err === "forbidden") return { ok: false, error: "forbidden" };
    if (err === "empty_body") return { ok: false, error: "invalid_body" };
    if (err === "campaign_not_found") return { ok: false, error: "campaign_not_found" };
    return { ok: false, error: "db_error", detail: payload?.detail ?? err };
  }

  const message = mapDeliveryAdOperationsMessageRow(payload.message);
  if (!message || message.kind !== "human") {
    return { ok: false, error: "db_error" };
  }
  const caseStatus = payload.case_status;
  if (
    caseStatus !== "WAITING_ADMIN" &&
    caseStatus !== "WAITING_OWNER" &&
    caseStatus !== "OPEN" &&
    caseStatus !== "RESOLVED"
  ) {
    return { ok: false, error: "db_error" };
  }

  return {
    ok: true,
    message,
    caseId: String(payload.case_id ?? ensured.case.id),
    threadId: String(payload.thread_id ?? threadId),
    caseStatus,
  };
}

/**
 * Canonical timeline reader (system_lifecycle + human). Bounded. No UI.
 */
export async function listDeliveryAdOperationsMessages(
  sb: SupabaseClient,
  input: {
    actorUserId: string;
    actorRole: DeliveryAdOpsMessagingActorRole;
    productKind: unknown;
    campaignId: unknown;
    limit?: number;
  }
): Promise<ListDeliveryAdOperationsMessagesResult> {
  if (!isDeliveryAdProductKind(input.productKind)) {
    return { ok: false, error: "invalid_identity" };
  }
  const campaignId =
    typeof input.campaignId === "string" ? input.campaignId.trim() : "";
  if (!campaignId || !input.actorUserId.trim()) {
    return { ok: false, error: "invalid_identity" };
  }

  const auth = await assertViewerAuthorized(sb, {
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    productKind: input.productKind,
    campaignId,
  });
  if (!auth.ok) return auth;

  const existing = await getDeliveryAdOperationsCase(sb, {
    productKind: input.productKind,
    campaignId,
  });
  if (!existing.ok) {
    if (existing.error === "case_not_found") {
      return { ok: true, caseId: "", threadId: "", messages: [] };
    }
    return {
      ok: false,
      error: existing.error === "campaign_not_found" ? "campaign_not_found" : "case_failed",
    };
  }
  const threadId = existing.case.threadId;
  if (!threadId) return { ok: true, caseId: existing.case.id, threadId: "", messages: [] };

  let limit: number = DELIVERY_AD_OPS_MESSAGE_LIST_DEFAULT_LIMIT;
  if (typeof input.limit === "number" && Number.isFinite(input.limit)) {
    limit = Math.max(
      1,
      Math.min(DELIVERY_AD_OPS_MESSAGE_LIST_MAX_LIMIT, Math.floor(input.limit))
    );
  }

  const { data, error } = await sb
    .from(DELIVERY_AD_OPERATIONS_MESSAGE_TABLE)
    .select("*")
    .eq("thread_id", threadId)
    .order("occurred_at", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);

  if (error) return { ok: false, error: "db_error" };

  const messages: DeliveryAdOperationsTimelineMessage[] = [];
  for (const row of data ?? []) {
    const mapped = mapDeliveryAdOperationsMessageRow(row as Record<string, unknown>);
    if (mapped) messages.push(mapped);
  }

  return {
    ok: true,
    caseId: existing.case.id,
    threadId,
    messages,
  };
}
