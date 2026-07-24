/**
 * Phase C — Domain create/find API (thin wrappers) + best-effort dual-write.
 * docs/community-messenger/2026-07-23-four-domain-phase-c.md
 *
 * DO NOT: replace hub/bell/list writers · delete REMOVE shells · touch Native Call.
 * Product route cutover still deferred (callers may adopt gradually).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatDomain } from "@/lib/chat-domain/four-domain-freeze";
import {
  legacyGeneralDirectKeyFromIdentity,
  plannedColumnsForGeneralDirect,
  plannedColumnsForGroup,
  plannedColumnsForStoreOrderRoom,
  plannedColumnsForTrade,
  type PlannedRoomDomainColumns,
} from "@/lib/chat-domain/domain-identity-legacy-map";
import {
  bestEffortWriteRoomDomainColumns,
  bestEffortWriteStoreOrderParticipantRoles,
} from "@/lib/chat-domain/dual-write-room-domain";
import { createGroupRoom } from "@/lib/community-messenger/group/group-room-service";
import {
  ensureCommunityMessengerDirectRoomFromProductChat,
  ensureGeneralFriendDirectRoom,
} from "@/lib/community-messenger/service";
import { ensureStoreOrderMessengerRoom } from "@/lib/community-messenger/store-order-chat-service";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type DomainRoomRef = {
  ok: true;
  roomId: string;
  chatDomain: ChatDomain;
  domainIdentity: string;
  plannedColumns: PlannedRoomDomainColumns;
  viaLegacyEnsure: true;
  dualWrite?: "written" | "skipped" | "failed";
};

export type DomainRoomError = {
  ok: false;
  error: string;
  status?: number;
};

export type DomainRoomResult = DomainRoomRef | DomainRoomError;

function resolveSb(explicit?: SupabaseClient<any> | null): SupabaseClient<any> | null {
  if (explicit) return explicit;
  return tryCreateSupabaseServiceClient() as SupabaseClient<any> | null;
}

export async function createOrFindGeneralDirectRoom(input: {
  userId: string;
  peerUserId: string;
}): Promise<DomainRoomResult> {
  const planned = plannedColumnsForGeneralDirect(input.userId, input.peerUserId);
  const out = await ensureGeneralFriendDirectRoom(input.userId, input.peerUserId);
  if (!out.ok || !out.roomId) {
    return { ok: false, error: out.error ?? "general_direct_ensure_failed" };
  }
  const dualWrite = await bestEffortWriteRoomDomainColumns(resolveSb(), out.roomId, planned);
  return {
    ok: true,
    roomId: out.roomId,
    chatDomain: planned.chat_domain,
    domainIdentity: planned.domain_identity,
    plannedColumns: planned,
    viaLegacyEnsure: true,
    dualWrite,
  };
}

export async function createOrFindGroupRoom(input: {
  userId: string;
  memberIds: string[];
  title?: string | null;
}): Promise<DomainRoomResult> {
  const out = await createGroupRoom({
    userId: input.userId,
    memberIds: input.memberIds,
    title: (input.title ?? "").trim(),
  });
  if (!out.ok) {
    return { ok: false, error: out.error };
  }
  if (!out.roomId) {
    return { ok: false, error: "group_create_failed" };
  }
  const planned = plannedColumnsForGroup(out.roomId);
  const dualWrite = await bestEffortWriteRoomDomainColumns(resolveSb(), out.roomId, planned);
  return {
    ok: true,
    roomId: out.roomId,
    chatDomain: planned.chat_domain,
    domainIdentity: planned.domain_identity,
    plannedColumns: planned,
    viaLegacyEnsure: true,
    dualWrite,
  };
}

export async function createOrFindTradeRoom(input: {
  userId: string;
  productChatId: string;
  itemId: string;
  sellerId: string;
  buyerId: string;
}): Promise<DomainRoomResult> {
  const planned = plannedColumnsForTrade(input.itemId, input.sellerId, input.buyerId);
  const out = await ensureCommunityMessengerDirectRoomFromProductChat(
    input.userId,
    input.productChatId,
  );
  if (!out.ok || !out.roomId) {
    return { ok: false, error: out.error ?? "trade_ensure_failed" };
  }
  const dualWrite = await bestEffortWriteRoomDomainColumns(resolveSb(), out.roomId, planned);
  return {
    ok: true,
    roomId: out.roomId,
    chatDomain: planned.chat_domain,
    domainIdentity: planned.domain_identity,
    plannedColumns: planned,
    viaLegacyEnsure: true,
    dualWrite,
  };
}

export async function createOrFindStoreOrderRoom(input: {
  sb: SupabaseClient<any>;
  orderId: string;
  userId?: string | null;
}): Promise<DomainRoomResult> {
  const planned = plannedColumnsForStoreOrderRoom(input.orderId);
  const out = await ensureStoreOrderMessengerRoom(input.sb, {
    orderId: input.orderId,
    userId: input.userId,
  });
  if (!out.ok) {
    return {
      ok: false,
      error: out.error,
      status: out.status,
    };
  }
  if (!out.roomId) {
    return { ok: false, error: "store_order_ensure_failed" };
  }
  const dualWrite = await bestEffortWriteRoomDomainColumns(input.sb, out.roomId, planned);
  if (out.buyerUserId && out.ownerUserId) {
    await bestEffortWriteStoreOrderParticipantRoles(
      input.sb,
      out.roomId,
      out.buyerUserId,
      out.ownerUserId,
    );
  }
  return {
    ok: true,
    roomId: out.roomId,
    chatDomain: planned.chat_domain,
    domainIdentity: planned.domain_identity,
    plannedColumns: planned,
    viaLegacyEnsure: true,
    dualWrite,
  };
}

export async function findRoomIdByDomainIdentity(
  sb: SupabaseClient<any>,
  domainIdentity: string,
): Promise<{ roomId: string; source: "domain_identity" | "legacy_direct_key" } | null> {
  const identity = domainIdentity.trim();
  if (!identity) return null;

  try {
    const { data, error } = await sb
      .from("community_messenger_rooms")
      .select("id")
      .eq("domain_identity_key", identity)
      .maybeSingle();
    if (!error) {
      const id = typeof data?.id === "string" ? data.id.trim() : "";
      if (id) return { roomId: id, source: "domain_identity" };
    }
  } catch {
    /* column missing until migration apply */
  }

  try {
    const { data, error } = await sb
      .from("community_messenger_rooms")
      .select("id")
      .eq("domain_identity", identity)
      .maybeSingle();
    if (!error) {
      const id = typeof data?.id === "string" ? data.id.trim() : "";
      if (id) return { roomId: id, source: "domain_identity" };
    }
  } catch {
    /* column missing until migration apply */
  }

  const legacyGd = legacyGeneralDirectKeyFromIdentity(identity);
  if (legacyGd) {
    const { data } = await sb
      .from("community_messenger_rooms")
      .select("id")
      .eq("room_type", "direct")
      .eq("direct_key", legacyGd)
      .maybeSingle();
    const id = typeof data?.id === "string" ? data.id.trim() : "";
    if (id) return { roomId: id, source: "legacy_direct_key" };
  }

  const storeOrderIdentityPrefix =
    identity.startsWith("store_order:")
      ? "store_order:"
      : identity.startsWith("so:order:")
        ? "so:order:"
        : null;
  if (storeOrderIdentityPrefix) {
    const orderId = identity.slice(storeOrderIdentityPrefix.length).trim();
    if (!orderId) return null;
    const keys = [`store_order:${orderId}`, `trade_order:${orderId}`];
    const { data } = await sb
      .from("community_messenger_rooms")
      .select("id")
      .eq("room_type", "direct")
      .in("direct_key", keys)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const id = typeof data?.id === "string" ? data.id.trim() : "";
    if (id) return { roomId: id, source: "legacy_direct_key" };
  }

  if (identity.startsWith("group:")) {
    const roomId = identity.slice("group:".length).trim();
    if (!roomId) return null;
    const { data } = await sb
      .from("community_messenger_rooms")
      .select("id")
      .eq("id", roomId)
      .maybeSingle();
    const id = typeof data?.id === "string" ? data.id.trim() : "";
    if (id) return { roomId: id, source: "legacy_direct_key" };
  }

  return null;
}
