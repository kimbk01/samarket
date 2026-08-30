/**
 * PRODUCT CUT 3-E — Delivery Ads ops unread (read cursor + derived count).
 * Action Queue ≠ unread. Message send ≠ lifecycle. No parallel unread_count columns.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BANNER_AD_CAMPAIGN_TABLE,
  STORE_SPONSORED_CAMPAIGN_TABLE,
  isDeliveryAdProductKind,
  type DeliveryAdProductKind,
} from "@/lib/stores/advertising/delivery-ad-domain";
import {
  getDeliveryAdOperationsCase,
} from "@/lib/stores/advertising/delivery-ad-operations-case-service";
import {
  DELIVERY_AD_OPERATIONS_MESSAGE_TABLE,
  mapDeliveryAdOperationsMessageRow,
  type DeliveryAdOperationsTimelineMessage,
} from "@/lib/stores/advertising/delivery-ad-operations-message";
import { isOwnerOpsUnreadLifecycleEvent } from "@/lib/stores/advertising/delivery-ad-operations-notification-map";

export const DELIVERY_AD_OPERATIONS_THREAD_READS_TABLE =
  "delivery_ad_operations_thread_reads" as const;

export type DeliveryAdOpsReaderRole = "owner" | "admin";

export type DeliveryAdOpsUnreadError =
  | "invalid_identity"
  | "forbidden"
  | "campaign_not_found"
  | "case_failed"
  | "thread_missing"
  | "db_error";

type CursorRow = {
  last_read_message_id: string | null;
  last_read_at: string;
};

function messageOrderKey(m: Pick<DeliveryAdOperationsTimelineMessage, "occurredAt" | "createdAt" | "id">): string {
  return `${m.occurredAt}\0${m.createdAt}\0${m.id}`;
}

function isMessageAfterCursor(
  message: DeliveryAdOperationsTimelineMessage,
  cursorMessage: DeliveryAdOperationsTimelineMessage | null
): boolean {
  if (!cursorMessage) return true;
  return messageOrderKey(message) > messageOrderKey(cursorMessage);
}

export function isDeliveryAdOpsUnreadMessageForRole(
  message: DeliveryAdOperationsTimelineMessage,
  readerRole: DeliveryAdOpsReaderRole
): boolean {
  if (message.kind === "human") {
    if (readerRole === "owner") return message.senderRole === "admin";
    return message.senderRole === "owner";
  }
  // System: Owner only for 3-D notification-worthy lifecycle events. Admin: never.
  if (readerRole === "admin") return false;
  return isOwnerOpsUnreadLifecycleEvent(message.eventType);
}

async function assertViewerAuthorized(
  sb: SupabaseClient,
  input: {
    actorUserId: string;
    actorRole: DeliveryAdOpsReaderRole;
    productKind: DeliveryAdProductKind;
    campaignId: string;
  }
): Promise<{ ok: true } | { ok: false; error: DeliveryAdOpsUnreadError }> {
  if (input.actorRole === "admin") return { ok: true };
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

async function loadCursor(
  sb: SupabaseClient,
  threadId: string,
  readerRole: DeliveryAdOpsReaderRole
): Promise<CursorRow | null> {
  const { data, error } = await sb
    .from(DELIVERY_AD_OPERATIONS_THREAD_READS_TABLE)
    .select("last_read_message_id, last_read_at")
    .eq("thread_id", threadId)
    .eq("reader_role", readerRole)
    .maybeSingle();
  if (error || !data) return null;
  return {
    last_read_message_id:
      (data as { last_read_message_id?: string | null }).last_read_message_id == null
        ? null
        : String((data as { last_read_message_id: string }).last_read_message_id),
    last_read_at: String((data as { last_read_at?: string }).last_read_at ?? ""),
  };
}

async function loadMessageById(
  sb: SupabaseClient,
  messageId: string
): Promise<DeliveryAdOperationsTimelineMessage | null> {
  const { data, error } = await sb
    .from(DELIVERY_AD_OPERATIONS_MESSAGE_TABLE)
    .select("*")
    .eq("id", messageId)
    .maybeSingle();
  if (error || !data) return null;
  return mapDeliveryAdOperationsMessageRow(data as Record<string, unknown>);
}

export async function getDeliveryAdOperationsUnread(
  sb: SupabaseClient,
  input: {
    actorUserId: string;
    actorRole: DeliveryAdOpsReaderRole;
    productKind: unknown;
    campaignId: unknown;
  }
): Promise<
  | {
      ok: true;
      threadId: string;
      caseId: string;
      unreadCount: number;
      lastReadMessageId: string | null;
      lastReadAt: string | null;
    }
  | { ok: false; error: DeliveryAdOpsUnreadError }
> {
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
      return {
        ok: true,
        threadId: "",
        caseId: "",
        unreadCount: 0,
        lastReadMessageId: null,
        lastReadAt: null,
      };
    }
    return {
      ok: false,
      error: existing.error === "campaign_not_found" ? "campaign_not_found" : "case_failed",
    };
  }
  const threadId = existing.case.threadId;
  if (!threadId) {
    return {
      ok: true,
      threadId: "",
      caseId: existing.case.id,
      unreadCount: 0,
      lastReadMessageId: null,
      lastReadAt: null,
    };
  }

  const cursor = await loadCursor(sb, threadId, input.actorRole);
  const cursorMessage = cursor?.last_read_message_id
    ? await loadMessageById(sb, cursor.last_read_message_id)
    : null;

  const { data, error } = await sb
    .from(DELIVERY_AD_OPERATIONS_MESSAGE_TABLE)
    .select("*")
    .eq("thread_id", threadId)
    .order("occurred_at", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(200);
  if (error) return { ok: false, error: "db_error" };

  let unreadCount = 0;
  for (const raw of data ?? []) {
    const message = mapDeliveryAdOperationsMessageRow(raw as Record<string, unknown>);
    if (!message) continue;
    if (!isMessageAfterCursor(message, cursorMessage)) continue;
    if (isDeliveryAdOpsUnreadMessageForRole(message, input.actorRole)) {
      unreadCount += 1;
    }
  }

  return {
    ok: true,
    threadId,
    caseId: existing.case.id,
    unreadCount,
    lastReadMessageId: cursor?.last_read_message_id ?? null,
    lastReadAt: cursor?.last_read_at ?? null,
  };
}

/**
 * Batch Owner hub unread — one pass over owned campaign cases (bounded by input ids).
 */
export async function listOwnerDeliveryAdOperationsUnreadByCampaignIds(
  sb: SupabaseClient,
  input: {
    ownerUserId: string;
    campaigns: Array<{ campaignId: string; productKind: DeliveryAdProductKind }>;
  }
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const bounded = input.campaigns.slice(0, 100);
  for (const c of bounded) {
    out[c.campaignId] = 0;
  }
  await Promise.all(
    bounded.map(async (c) => {
      const res = await getDeliveryAdOperationsUnread(sb, {
        actorUserId: input.ownerUserId,
        actorRole: "owner",
        productKind: c.productKind,
        campaignId: c.campaignId,
      });
      if (res.ok) out[c.campaignId] = res.unreadCount;
    })
  );
  return out;
}

/**
 * Advance read cursor after operations history was successfully loaded.
 * Monotonic forward only (never regress).
 */
export async function markDeliveryAdOperationsRead(
  sb: SupabaseClient,
  input: {
    actorUserId: string;
    actorRole: DeliveryAdOpsReaderRole;
    productKind: unknown;
    campaignId: unknown;
    lastReadMessageId?: unknown;
  }
): Promise<
  | {
      ok: true;
      threadId: string;
      lastReadMessageId: string | null;
      lastReadAt: string;
    }
  | { ok: false; error: DeliveryAdOpsUnreadError }
> {
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
      return { ok: false, error: "thread_missing" };
    }
    return {
      ok: false,
      error: existing.error === "campaign_not_found" ? "campaign_not_found" : "case_failed",
    };
  }
  const threadId = existing.case.threadId;
  if (!threadId) return { ok: false, error: "thread_missing" };

  let targetMessageId =
    typeof input.lastReadMessageId === "string" ? input.lastReadMessageId.trim() : "";
  if (!targetMessageId) {
    const { data: latest } = await sb
      .from(DELIVERY_AD_OPERATIONS_MESSAGE_TABLE)
      .select("id")
      .eq("thread_id", threadId)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    targetMessageId = latest?.id == null ? "" : String(latest.id);
  }

  if (!targetMessageId) {
    const nowIso = new Date().toISOString();
    const { error } = await sb.from(DELIVERY_AD_OPERATIONS_THREAD_READS_TABLE).upsert(
      {
        thread_id: threadId,
        reader_role: input.actorRole,
        last_read_message_id: null,
        last_read_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "thread_id,reader_role" }
    );
    if (error) return { ok: false, error: "db_error" };
    return { ok: true, threadId, lastReadMessageId: null, lastReadAt: nowIso };
  }

  const targetMessage = await loadMessageById(sb, targetMessageId);
  if (!targetMessage || targetMessage.threadId !== threadId) {
    return { ok: false, error: "invalid_identity" };
  }

  const existingCursor = await loadCursor(sb, threadId, input.actorRole);
  if (existingCursor?.last_read_message_id) {
    const existingMessage = await loadMessageById(sb, existingCursor.last_read_message_id);
    if (existingMessage && !isMessageAfterCursor(targetMessage, existingMessage)) {
      // Monotonic: keep existing cursor
      return {
        ok: true,
        threadId,
        lastReadMessageId: existingCursor.last_read_message_id,
        lastReadAt: existingCursor.last_read_at,
      };
    }
  }

  const nowIso = new Date().toISOString();
  const { error } = await sb.from(DELIVERY_AD_OPERATIONS_THREAD_READS_TABLE).upsert(
    {
      thread_id: threadId,
      reader_role: input.actorRole,
      last_read_message_id: targetMessageId,
      last_read_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "thread_id,reader_role" }
  );
  if (error) return { ok: false, error: "db_error" };
  return {
    ok: true,
    threadId,
    lastReadMessageId: targetMessageId,
    lastReadAt: nowIso,
  };
}
