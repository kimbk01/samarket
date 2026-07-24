/**
 * Phase 11B — Live Domain batch fetchers (read-only SELECT).
 * DB → Domain Loader map → BootstrapPort. Shell/raw 미전달.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  timedSelect,
  type Phase11bQueryTiming,
} from "@/lib/messenger/contracts/phase11b-live-readonly-client";
import { assertPhase11bLiveConstraints } from "@/lib/messenger/contracts/phase11b-isolated-qa-gate";
import {
  createGeneralDirectDbLoaderSource,
  type GeneralDirectLoaderBatchRow,
} from "@/lib/messenger/general-direct/phase11a-db-loader";
import {
  createGroupDbLoaderSource,
  type GroupLoaderBatchRow,
} from "@/lib/messenger/group/phase11a-db-loader";
import {
  createTradeDbLoaderSource,
  type TradeLoaderBatchRow,
} from "@/lib/messenger/trade/phase11a-db-loader";
import {
  createStoreOrderCustomerDbLoaderSource,
  type StoreOrderCustomerLoaderBatchRow,
} from "@/lib/messenger/store-order/phase11a-db-loader-customer";
import {
  createStoreOrderOwnerDbLoaderSource,
  type StoreOrderOwnerLoaderBatchRow,
} from "@/lib/messenger/store-order/phase11a-db-loader-owner";
import type { GroupSubtype } from "@/lib/messenger/group/types";
import { parseTradeIdentityKey } from "@/lib/messenger/trade/identity";
import { resolveTradeItemStatus } from "@/lib/messenger/trade/item-status";
import { parseGeneralDirectIdentityKey } from "@/lib/messenger/general-direct/identity";
import { storeOrderRoomIdentity } from "@/lib/chat-domain/room-identity";
import type { GeneralDirectBootstrapSource } from "@/lib/messenger/general-direct/phase6-bootstrap";
import type { GroupBootstrapSource } from "@/lib/messenger/group/phase6-bootstrap";
import type { TradeBootstrapSource } from "@/lib/messenger/trade/phase6-bootstrap";
import type { StoreOrderBootstrapSource } from "@/lib/messenger/store-order/phase6-bootstrap";
import {
  STORE_ORDER_CUSTOMER_UNREAD_TARGET_TYPE,
  STORE_ORDER_OWNER_UNREAD_TARGET_TYPE,
  buildStoreOrderOwnerUnreadTargetIndex,
  resolveStoreOrderListUnreadCount,
  resolveStoreOrderOwnerListUnreadCount,
} from "@/lib/messenger/store-order/unread-from-notification-targets";
import { resolveTradeListUnreadCount } from "@/lib/messenger/trade/unread-from-notification-targets";
import {
  resolveMessengerChatRoomListUnreadCount,
} from "@/lib/messenger/contracts/chat-room-unread-from-notification-targets";

export const PHASE11B_MAX_ROWS = 200 as const;

export type Phase11bLiveLoadMeta = Readonly<{
  queryTimings: ReadonlyArray<Phase11bQueryTiming>;
  dbDurationMs: number;
  maxRows: typeof PHASE11B_MAX_ROWS;
  paginationVerified: false;
}>;

/** Supabase embed may return object or 1-element array — normalize at loader boundary. */
function unwrapJoinedRow<T extends object>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function profileName(row: {
  display_name?: string | null;
  nickname?: string | null;
}): string | null {
  return row.display_name?.trim() || row.nickname?.trim() || null;
}

async function loadLatestMessagesByRoomIds(
  sb: SupabaseClient,
  roomIds: string[]
): Promise<{
  map: Map<string, { bodyText: string | null; isSystem: boolean; createdAt: string }>;
  timing: Phase11bQueryTiming;
}> {
  if (roomIds.length === 0) {
    return {
      map: new Map(),
      timing: { label: "latest_messages", durationMs: 0, rowCount: 0 },
    };
  }
  const { data, timing } = await timedSelect("latest_messages", () =>
    sb
      .from("community_messenger_messages")
      .select("room_id, content, message_type, created_at")
      .in("room_id", roomIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(roomIds.length * 3, 600))
  );
  const map = new Map<string, { bodyText: string | null; isSystem: boolean; createdAt: string }>();
  for (const row of (data ?? []) as Array<{
    room_id?: string;
    content?: string | null;
    message_type?: string | null;
    created_at?: string;
  }>) {
    const rid = String(row.room_id ?? "");
    if (!rid || map.has(rid)) continue;
    const mt = String(row.message_type ?? "");
    map.set(rid, {
      bodyText: typeof row.content === "string" ? row.content : null,
      isSystem: mt === "system" || mt === "call_stub",
      createdAt: String(row.created_at ?? ""),
    });
  }
  return { map, timing };
}

async function loadProfiles(
  sb: SupabaseClient,
  userIds: string[]
): Promise<{
  map: Map<string, { name: string | null; avatar: string | null }>;
  timing: Phase11bQueryTiming;
}> {
  const uniq = [...new Set(userIds.filter(Boolean))];
  if (uniq.length === 0) {
    return { map: new Map(), timing: { label: "profiles", durationMs: 0, rowCount: 0 } };
  }
  const { data, timing } = await timedSelect("profiles", () =>
    sb
      .from("profiles")
      .select("id, display_name, nickname, avatar_url")
      .in("id", uniq)
  );
  const map = new Map<string, { name: string | null; avatar: string | null }>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const id = String(row.id ?? "");
    if (!id) continue;
    map.set(id, {
      name: profileName(row as { display_name?: string; nickname?: string }),
      avatar: typeof row.avatar_url === "string" ? row.avatar_url : null,
    });
  }
  return { map, timing };
}

async function loadTradeListingPosts(
  sb: SupabaseClient,
  itemIds: string[]
): Promise<{
  map: Map<
    string,
    {
      title: string | null;
      imageUrl: string | null;
      statusBadgeLabel: string | null;
    }
  >;
  timing: Phase11bQueryTiming;
}> {
  const uniq = [...new Set(itemIds.map((id) => id.trim()).filter(Boolean))];
  if (uniq.length === 0) {
    return { map: new Map(), timing: { label: "trade_listing_posts", durationMs: 0, rowCount: 0 } };
  }
  const { data, timing } = await timedSelect("trade_listing_posts", () =>
    sb.from("posts").select("id, title, thumbnail_url, status, seller_listing_state").in("id", uniq)
  );
  const map = new Map<
    string,
    {
      title: string | null;
      imageUrl: string | null;
      statusBadgeLabel: string | null;
    }
  >();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const status = resolveTradeItemStatus({
      sellerListingStateRaw: row.seller_listing_state,
      postStatus: typeof row.status === "string" ? row.status : null,
    });
    map.set(id, {
      title: typeof row.title === "string" ? row.title.trim() || null : null,
      imageUrl: typeof row.thumbnail_url === "string" ? row.thumbnail_url.trim() || null : null,
      statusBadgeLabel: status.statusBadgeLabel,
    });
  }
  return { map, timing };
}

async function loadProductChatIdsByMessengerRoomIds(
  sb: SupabaseClient,
  roomIds: string[]
): Promise<{
  map: Map<string, string>;
  timing: Phase11bQueryTiming;
}> {
  const uniq = [...new Set(roomIds.map((id) => id.trim()).filter(Boolean))];
  if (uniq.length === 0) {
    return { map: new Map(), timing: { label: "trade_product_chats_by_room", durationMs: 0, rowCount: 0 } };
  }
  const { data, timing } = await timedSelect("trade_product_chats_by_room", () =>
    sb
      .from("product_chats")
      .select("id, community_messenger_room_id, post_id, seller_id, buyer_id, updated_at")
      .in("community_messenger_room_id", uniq)
      .limit(PHASE11B_MAX_ROWS)
  );
  const map = new Map<string, string>();
  const stamp = new Map<string, string>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const rid = typeof row.community_messenger_room_id === "string" ? row.community_messenger_room_id.trim() : "";
    const pcid = typeof row.id === "string" ? row.id.trim() : "";
    if (!rid || !pcid) continue;
    const updated = typeof row.updated_at === "string" ? row.updated_at : "";
    const prev = stamp.get(rid);
    if (prev && prev >= updated) continue;
    stamp.set(rid, updated);
    map.set(rid, pcid);
  }
  return { map, timing };
}

async function loadProductChatIdsByTradeParts(
  sb: SupabaseClient,
  parts: ReadonlyArray<{ itemId: string; sellerUserId: string; counterpartyUserId: string }>
): Promise<{
  map: Map<string, string>;
  timing: Phase11bQueryTiming;
}> {
  const itemIds = [...new Set(parts.map((p) => p.itemId.trim()).filter(Boolean))];
  if (itemIds.length === 0) {
    return { map: new Map(), timing: { label: "trade_product_chats_by_parts", durationMs: 0, rowCount: 0 } };
  }
  const { data, timing } = await timedSelect("trade_product_chats_by_parts", () =>
    sb
      .from("product_chats")
      .select("id, post_id, seller_id, buyer_id, updated_at")
      .in("post_id", itemIds)
      .limit(PHASE11B_MAX_ROWS)
  );
  const want = new Set(
    parts.map((p) => `${p.itemId}:${p.sellerUserId}:${p.counterpartyUserId}`)
  );
  const map = new Map<string, string>();
  const stamp = new Map<string, string>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const postId = typeof row.post_id === "string" ? row.post_id.trim() : "";
    const seller = typeof row.seller_id === "string" ? row.seller_id.trim() : "";
    const buyer = typeof row.buyer_id === "string" ? row.buyer_id.trim() : "";
    const pcid = typeof row.id === "string" ? row.id.trim() : "";
    if (!postId || !seller || !buyer || !pcid) continue;
    const key = `${postId}:${seller}:${buyer}`;
    if (!want.has(key)) continue;
    const updated = typeof row.updated_at === "string" ? row.updated_at : "";
    const prev = stamp.get(key);
    if (prev && prev >= updated) continue;
    stamp.set(key, updated);
    map.set(key, pcid);
  }
  return { map, timing };
}

export async function fetchGeneralDirectLiveBatch(
  sb: SupabaseClient,
  viewerUserId: string
): Promise<{ rows: GeneralDirectLoaderBatchRow[]; meta: Phase11bLiveLoadMeta }> {
  assertPhase11bLiveConstraints();
  const timings: Phase11bQueryTiming[] = [];
  const tDb0 = Date.now();

  const { data: parts, timing: t1 } = await timedSelect("gd_participants_rooms", () =>
    sb
      .from("community_messenger_participants")
      .select(
        "room_id, unread_count, community_messenger_rooms!inner(id, chat_domain, domain_identity_key, title, last_message)"
      )
      .eq("user_id", viewerUserId)
      .eq("community_messenger_rooms.chat_domain", "general_direct")
      .limit(PHASE11B_MAX_ROWS)
  );
  timings.push(t1);

  type RoomEmbed = {
    id: string;
    chat_domain: string;
    domain_identity_key: string | null;
    title?: string | null;
    last_message?: string | null;
  };
  type RawPart = {
    room_id: string;
    unread_count: number | null;
    community_messenger_rooms: RoomEmbed | RoomEmbed[] | null;
  };

  const partRows = ((parts ?? []) as RawPart[])
    .map((p) => {
      const room = unwrapJoinedRow(p.community_messenger_rooms);
      return room ? { room_id: p.room_id, unread_count: p.unread_count, room } : null;
    })
    .filter((p): p is { room_id: string; unread_count: number | null; room: RoomEmbed } => p != null);
  const roomIds = partRows.map((p) => p.room_id);
  // Prefer direct select for timing rowCount (Set is opaque to timedSelect).
  const { data: gdTargetRows, timing: tUnread } = await timedSelect("gd_unread_targets", () =>
    sb
      .from("notification_targets")
      .select("target_id")
      .eq("user_id", viewerUserId)
      .eq("target_type", "chat_room")
      .eq("is_unread", true)
      .eq("scope", "consumer")
      .eq("chat_domain", "general_direct")
  );
  timings.push(tUnread);
  const gdUnreadRoomIds = new Set(
    ((gdTargetRows ?? []) as Array<{ target_id: string | null }>)
      .map((r) => String(r.target_id ?? "").trim())
      .filter(Boolean)
  );

  const { map: msgMap, timing: t2 } = await loadLatestMessagesByRoomIds(sb, roomIds);
  timings.push(t2);

  const peerIds: string[] = [];
  for (const p of partRows) {
    const key = String(p.room.domain_identity_key ?? "");
    try {
      const { userA, userB } = parseGeneralDirectIdentityKey(key);
      peerIds.push(userA === viewerUserId ? userB : userA);
    } catch {
      /* identity invalid — loader map will reject */
    }
  }
  const { map: profiles, timing: t3 } = await loadProfiles(sb, peerIds);
  timings.push(t3);

  const rows: GeneralDirectLoaderBatchRow[] = [];
  for (const p of partRows) {
    const room = p.room;
    const key = String(room.domain_identity_key ?? "").trim();
    let peerUserId = "";
    try {
      const { userA, userB } = parseGeneralDirectIdentityKey(key);
      peerUserId = userA === viewerUserId ? userB : userA;
    } catch {
      continue;
    }
    if (!peerUserId || peerUserId === viewerUserId) continue;
    const prof = profiles.get(peerUserId);
    const latest = msgMap.get(p.room_id) ?? null;
    rows.push({
      roomId: p.room_id,
      chatDomain: "general_direct",
      domainIdentityKey: key,
      unreadCount: resolveMessengerChatRoomListUnreadCount({
        roomId: p.room_id,
        unreadTargetRoomIds: gdUnreadRoomIds,
        participantUnreadCount: p.unread_count,
      }),
      peerUserId,
      peerDisplayName: prof?.name ?? null,
      peerAvatarUrl: prof?.avatar ?? null,
      latestMessage: latest
        ? {
            roomId: p.room_id,
            bodyText: latest.bodyText,
            isSystem: latest.isSystem,
            createdAt: latest.createdAt,
          }
        : null,
      roomLastMessageSummary: room.last_message ?? null,
      roomTitle: room.title ?? null,
    });
  }

  return {
    rows,
    meta: {
      queryTimings: timings,
      dbDurationMs: Date.now() - tDb0,
      maxRows: PHASE11B_MAX_ROWS,
      paginationVerified: false,
    },
  };
}

export function createGeneralDirectLiveBootstrapSource(
  sb: SupabaseClient,
  onMeta?: (meta: Phase11bLiveLoadMeta) => void
): GeneralDirectBootstrapSource {
  return createGeneralDirectDbLoaderSource(async (viewerUserId) => {
    const { rows, meta } = await fetchGeneralDirectLiveBatch(sb, viewerUserId);
    onMeta?.(meta);
    return rows;
  });
}

export async function fetchGroupLiveBatch(
  sb: SupabaseClient,
  viewerUserId: string
): Promise<{ rows: GroupLoaderBatchRow[]; meta: Phase11bLiveLoadMeta }> {
  assertPhase11bLiveConstraints();
  const timings: Phase11bQueryTiming[] = [];
  const tDb0 = Date.now();

  const { data: parts, timing: t1 } = await timedSelect("group_participants_rooms", () =>
    sb
      .from("community_messenger_participants")
      .select(
        "room_id, unread_count, community_messenger_rooms!inner(id, chat_domain, domain_identity_key, title, avatar_url, room_type, last_message)"
      )
      .eq("user_id", viewerUserId)
      .eq("community_messenger_rooms.chat_domain", "group")
      .limit(PHASE11B_MAX_ROWS)
  );
  timings.push(t1);

  type RoomEmbed = {
    id: string;
    chat_domain: string;
    domain_identity_key: string | null;
    title?: string | null;
    avatar_url?: string | null;
    room_type?: string | null;
    last_message?: string | null;
  };
  type RawPart = {
    room_id: string;
    unread_count: number | null;
    community_messenger_rooms: RoomEmbed | RoomEmbed[] | null;
  };
  const partRows = ((parts ?? []) as RawPart[])
    .map((p) => {
      const room = unwrapJoinedRow(p.community_messenger_rooms);
      return room ? { room_id: p.room_id, unread_count: p.unread_count, room } : null;
    })
    .filter((p): p is { room_id: string; unread_count: number | null; room: RoomEmbed } => p != null);
  const roomIds = partRows.map((p) => p.room_id);

  const { data: groupTargetRows, timing: tUnread } = await timedSelect("group_unread_targets", () =>
    sb
      .from("notification_targets")
      .select("target_id")
      .eq("user_id", viewerUserId)
      .eq("target_type", "chat_room")
      .eq("is_unread", true)
      .eq("scope", "consumer")
      .eq("chat_domain", "group")
  );
  timings.push(tUnread);
  const groupUnreadRoomIds = new Set(
    ((groupTargetRows ?? []) as Array<{ target_id: string | null }>)
      .map((r) => String(r.target_id ?? "").trim())
      .filter(Boolean)
  );

  const { data: memberRows, timing: tMembers } = await timedSelect("group_members_batch", () =>
    roomIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : sb
          .from("community_messenger_participants")
          .select("room_id, user_id")
          .in("room_id", roomIds)
          .limit(PHASE11B_MAX_ROWS * 50)
  );
  timings.push(tMembers);

  const membersByRoom = new Map<string, string[]>();
  for (const m of (memberRows ?? []) as Array<{ room_id: string; user_id: string }>) {
    const list = membersByRoom.get(m.room_id) ?? [];
    list.push(m.user_id);
    membersByRoom.set(m.room_id, list);
  }

  const { map: msgMap, timing: t2 } = await loadLatestMessagesByRoomIds(sb, roomIds);
  timings.push(t2);

  const rows: GroupLoaderBatchRow[] = [];
  for (const p of partRows) {
    const room = p.room;
    const key = String(room.domain_identity_key ?? "").trim();
    if (!key.startsWith("group:")) continue;
    const groupId = key.replace(/^group:/, "").trim();
    if (!groupId || groupId !== p.room_id) continue;
    const subtype: GroupSubtype =
      room.room_type === "open_group" ? "open_group" : "private_group";
    const members = membersByRoom.get(p.room_id) ?? [viewerUserId];
    const latest = msgMap.get(p.room_id) ?? null;
    rows.push({
      roomId: p.room_id,
      chatDomain: "group",
      domainIdentityKey: key,
      groupId,
      groupSubtype: subtype,
      groupName: room.title ?? null,
      groupImageUrl: room.avatar_url ?? null,
      memberCount: members.length,
      unreadCount: resolveMessengerChatRoomListUnreadCount({
        roomId: p.room_id,
        unreadTargetRoomIds: groupUnreadRoomIds,
        participantUnreadCount: p.unread_count,
      }),
      memberUserIds: members,
      openBrowseAllowed: subtype === "open_group",
      latestMessage: latest
        ? {
            roomId: p.room_id,
            bodyText: latest.bodyText,
            isSystem: latest.isSystem,
            createdAt: latest.createdAt,
          }
        : null,
      roomLastMessageSummary: room.last_message ?? null,
    });
  }

  return {
    rows,
    meta: {
      queryTimings: timings,
      dbDurationMs: Date.now() - tDb0,
      maxRows: PHASE11B_MAX_ROWS,
      paginationVerified: false,
    },
  };
}

export function createGroupLiveBootstrapSource(
  sb: SupabaseClient,
  onMeta?: (meta: Phase11bLiveLoadMeta) => void
): GroupBootstrapSource {
  return createGroupDbLoaderSource(async (viewerUserId) => {
    const { rows, meta } = await fetchGroupLiveBatch(sb, viewerUserId);
    onMeta?.(meta);
    return rows;
  });
}

export async function fetchTradeLiveBatch(
  sb: SupabaseClient,
  viewerUserId: string
): Promise<{ rows: TradeLoaderBatchRow[]; meta: Phase11bLiveLoadMeta }> {
  assertPhase11bLiveConstraints();
  const timings: Phase11bQueryTiming[] = [];
  const tDb0 = Date.now();

  const { data: parts, timing: t1 } = await timedSelect("trade_participants_rooms", () =>
    sb
      .from("community_messenger_participants")
      .select(
        "room_id, unread_count, community_messenger_rooms!inner(id, chat_domain, domain_identity_key, title, avatar_url, last_message)"
      )
      .eq("user_id", viewerUserId)
      .eq("community_messenger_rooms.chat_domain", "trade")
      .limit(PHASE11B_MAX_ROWS)
  );
  timings.push(t1);

  type RoomEmbed = {
    id: string;
    chat_domain: string;
    domain_identity_key: string | null;
    title?: string | null;
    avatar_url?: string | null;
    last_message?: string | null;
  };
  type RawPart = {
    room_id: string;
    unread_count: number | null;
    community_messenger_rooms: RoomEmbed | RoomEmbed[] | null;
  };
  const partRows = ((parts ?? []) as RawPart[])
    .map((p) => {
      const room = unwrapJoinedRow(p.community_messenger_rooms);
      return room ? { room_id: p.room_id, unread_count: p.unread_count, room } : null;
    })
    .filter((p): p is { room_id: string; unread_count: number | null; room: RoomEmbed } => p != null);
  const roomIds = partRows.map((p) => p.room_id);
  // Badge SSOT: trade targets (chat_domain_trade axis) — not participants.unread_count.
  const { data: tradeTargetRows, timing: tUnread } = await timedSelect(
    "trade_unread_targets",
    () =>
      sb
        .from("notification_targets")
        .select("domain_identity_key")
        .eq("user_id", viewerUserId)
        .eq("target_type", "trade")
        .eq("is_unread", true)
        .eq("scope", "consumer")
        .eq("chat_domain", "trade")
  );
  timings.push(tUnread);
  const tradeUnreadIdentityKeys = new Set(
    ((tradeTargetRows ?? []) as Array<{ domain_identity_key: string | null }>)
      .map((r) => String(r.domain_identity_key ?? "").trim())
      .filter(Boolean)
  );

  const { map: msgMap, timing: t2 } = await loadLatestMessagesByRoomIds(sb, roomIds);
  timings.push(t2);

  const peerIds: string[] = [];
  const itemIds: string[] = [];
  for (const p of partRows) {
    try {
      const parsed = parseTradeIdentityKey(String(p.room.domain_identity_key ?? ""));
      itemIds.push(parsed.itemId);
      peerIds.push(
        parsed.sellerUserId === viewerUserId ? parsed.counterpartyUserId : parsed.sellerUserId
      );
    } catch {
      /* skip */
    }
  }
  const { map: profiles, timing: t3 } = await loadProfiles(sb, peerIds);
  timings.push(t3);
  const { map: listings, timing: t4 } = await loadTradeListingPosts(sb, itemIds);
  timings.push(t4);
  const { map: pcByRoom, timing: t5 } = await loadProductChatIdsByMessengerRoomIds(sb, roomIds);
  timings.push(t5);
  const tradePartsForFallback: Array<{
    itemId: string;
    sellerUserId: string;
    counterpartyUserId: string;
  }> = [];
  for (const p of partRows) {
    if (pcByRoom.has(p.room_id)) continue;
    try {
      const parsed = parseTradeIdentityKey(String(p.room.domain_identity_key ?? ""));
      tradePartsForFallback.push({
        itemId: parsed.itemId,
        sellerUserId: parsed.sellerUserId,
        counterpartyUserId: parsed.counterpartyUserId,
      });
    } catch {
      /* skip */
    }
  }
  const { map: pcByParts, timing: t6 } = await loadProductChatIdsByTradeParts(sb, tradePartsForFallback);
  timings.push(t6);

  const rows: TradeLoaderBatchRow[] = [];
  for (const p of partRows) {
    const room = p.room;
    const key = String(room.domain_identity_key ?? "");
    let parsed: ReturnType<typeof parseTradeIdentityKey>;
    try {
      parsed = parseTradeIdentityKey(key);
    } catch {
      continue;
    }
    const peerId =
      parsed.sellerUserId === viewerUserId ? parsed.counterpartyUserId : parsed.sellerUserId;
    if (!peerId || peerId === viewerUserId) continue;
    const prof = profiles.get(peerId);
    const listing = listings.get(parsed.itemId);
    const latest = msgMap.get(p.room_id) ?? null;
    const roomTitle = room.title?.trim() || null;
    const roomImage = room.avatar_url?.trim() || null;
    const partsKey = `${parsed.itemId}:${parsed.sellerUserId}:${parsed.counterpartyUserId}`;
    const productChatId = pcByRoom.get(p.room_id) ?? pcByParts.get(partsKey) ?? null;
    rows.push({
      roomId: p.room_id,
      chatDomain: "trade",
      domainIdentityKey: key,
      itemId: parsed.itemId,
      sellerUserId: parsed.sellerUserId,
      counterpartyUserId: parsed.counterpartyUserId,
      // Listing SSOT: posts → room denormalized fields.
      itemTitle: listing?.title || roomTitle,
      itemImageUrl: listing?.imageUrl || roomImage,
      peerDisplayName: prof?.name ?? null,
      peerAvatarUrl: prof?.avatar ?? null,
      productChatId,
      tradeStatusLabel: listing?.statusBadgeLabel ?? null,
      unreadCount: resolveTradeListUnreadCount({
        domainIdentityKey: key,
        unreadTargetIdentityKeys: tradeUnreadIdentityKeys,
        participantUnreadCount: p.unread_count,
      }),
      latestMessage: latest
        ? {
            roomId: p.room_id,
            bodyText: latest.bodyText,
            isSystem: latest.isSystem,
            createdAt: latest.createdAt,
          }
        : null,
      roomLastMessageSummary: room.last_message ?? null,
      productSummary: room.last_message ?? null,
    });
  }

  return {
    rows,
    meta: {
      queryTimings: timings,
      dbDurationMs: Date.now() - tDb0,
      maxRows: PHASE11B_MAX_ROWS,
      paginationVerified: false,
    },
  };
}

export function createTradeLiveBootstrapSource(
  sb: SupabaseClient,
  onMeta?: (meta: Phase11bLiveLoadMeta) => void
): TradeBootstrapSource {
  return createTradeDbLoaderSource(async (viewerUserId) => {
    const { rows, meta } = await fetchTradeLiveBatch(sb, viewerUserId);
    onMeta?.(meta);
    return rows;
  });
}

export async function fetchStoreOrderCustomerLiveBatch(
  sb: SupabaseClient,
  viewerUserId: string
): Promise<{ rows: StoreOrderCustomerLoaderBatchRow[]; meta: Phase11bLiveLoadMeta }> {
  assertPhase11bLiveConstraints();
  const timings: Phase11bQueryTiming[] = [];
  const tDb0 = Date.now();

  const { data: orders, timing: t1 } = await timedSelect("store_orders_buyer", () =>
    sb
      .from("store_orders")
      .select(
        "id, store_id, buyer_user_id, community_messenger_room_id, order_status, fulfillment_type, stores!inner(id, store_name, profile_image_url)"
      )
      .eq("buyer_user_id", viewerUserId)
      .not("community_messenger_room_id", "is", null)
      .limit(PHASE11B_MAX_ROWS)
  );
  timings.push(t1);

  type StoreEmbed = { id: string; store_name?: string | null; profile_image_url?: string | null };
  type OrderRow = {
    id: string;
    store_id: string;
    buyer_user_id: string;
    community_messenger_room_id: string;
    order_status: string | null;
    fulfillment_type: string | null;
    stores: StoreEmbed;
  };
  type RawOrder = {
    id: string;
    store_id: string;
    buyer_user_id: string;
    community_messenger_room_id: string;
    order_status?: string | null;
    fulfillment_type?: string | null;
    stores: StoreEmbed | StoreEmbed[] | null;
  };
  const orderRows: OrderRow[] = [];
  for (const o of (orders ?? []) as RawOrder[]) {
    const stores = unwrapJoinedRow(o.stores);
    if (!stores) continue;
    orderRows.push({
      id: o.id,
      store_id: o.store_id,
      buyer_user_id: o.buyer_user_id,
      community_messenger_room_id: o.community_messenger_room_id,
      order_status: o.order_status ?? null,
      fulfillment_type: o.fulfillment_type ?? null,
      stores,
    });
  }
  const roomIds = orderRows.map((o) => o.community_messenger_room_id);

  const { data: rooms, timing: tRooms } = await timedSelect("store_order_rooms", () =>
    roomIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : sb
          .from("community_messenger_rooms")
          .select("id, chat_domain, domain_identity_key, last_message")
          .in("id", roomIds)
          .eq("chat_domain", "store_order")
  );
  timings.push(tRooms);
  const roomById = new Map(
    ((rooms ?? []) as Array<{
      id: string;
      chat_domain: string;
      domain_identity_key: string | null;
      last_message?: string | null;
    }>).map((r) => [r.id, r])
  );

  // Badge SSOT: buyer_order targets (bottom_nav_delivery) — not participants.unread_count.
  const { data: targetRows, timing: tParts } = await timedSelect(
    "store_order_unread_targets",
    () =>
      sb
        .from("notification_targets")
        .select("target_id")
        .eq("user_id", viewerUserId)
        .eq("target_type", STORE_ORDER_CUSTOMER_UNREAD_TARGET_TYPE)
        .eq("is_unread", true)
        .eq("chat_domain", "store_order")
  );
  timings.push(tParts);
  const unreadTargetOrderIds = new Set(
    ((targetRows ?? []) as Array<{ target_id: string | null }>)
      .map((r) => String(r.target_id ?? "").trim())
      .filter(Boolean)
  );

  const { map: msgMap, timing: t2 } = await loadLatestMessagesByRoomIds(sb, roomIds);
  timings.push(t2);

  const rows: StoreOrderCustomerLoaderBatchRow[] = [];
  for (const o of orderRows) {
    const room = roomById.get(o.community_messenger_room_id);
    if (!room) continue;
    const expectedKey = storeOrderRoomIdentity(o.id).identityKey;
    const key = String(room.domain_identity_key ?? "").trim();
    if (key !== expectedKey) continue;
    const latest = msgMap.get(o.community_messenger_room_id) ?? null;
    rows.push({
      roomId: o.community_messenger_room_id,
      chatDomain: "store_order",
      domainIdentityKey: key,
      orderId: o.id,
      storeId: o.store_id,
      storeName: o.stores.store_name ?? null,
      storeImageUrl: o.stores.profile_image_url ?? null,
      customerUserId: o.buyer_user_id,
      unreadCount: resolveStoreOrderListUnreadCount({
        orderId: o.id,
        unreadTargetOrderIds,
      }),
      latestMessage: latest
        ? {
            roomId: o.community_messenger_room_id,
            bodyText: latest.bodyText,
            isSystem: latest.isSystem,
            createdAt: latest.createdAt,
          }
        : null,
      orderStatusLabel: o.order_status ?? null,
      fulfillmentType: o.fulfillment_type ?? null,
      roomLastMessageSummary: room.last_message ?? null,
    });
  }

  return {
    rows,
    meta: {
      queryTimings: timings,
      dbDurationMs: Date.now() - tDb0,
      maxRows: PHASE11B_MAX_ROWS,
      paginationVerified: false,
    },
  };
}

export function createStoreOrderCustomerLiveBootstrapSource(
  sb: SupabaseClient,
  onMeta?: (meta: Phase11bLiveLoadMeta) => void
): StoreOrderBootstrapSource {
  return createStoreOrderCustomerDbLoaderSource(async (viewerUserId) => {
    const { rows, meta } = await fetchStoreOrderCustomerLiveBatch(sb, viewerUserId);
    onMeta?.(meta);
    return rows;
  });
}

export async function fetchStoreOrderOwnerLiveBatch(
  sb: SupabaseClient,
  viewerUserId: string
): Promise<{
  rows: StoreOrderOwnerLoaderBatchRow[];
  meta: Phase11bLiveLoadMeta;
  measurable: boolean;
  reason?: string;
}> {
  assertPhase11bLiveConstraints();
  const timings: Phase11bQueryTiming[] = [];
  const tDb0 = Date.now();

  const { data: stores, timing: tStores } = await timedSelect("owner_stores", () =>
    sb.from("stores").select("id").eq("owner_user_id", viewerUserId).limit(50)
  );
  timings.push(tStores);
  const storeIds = ((stores ?? []) as Array<{ id: string }>).map((s) => s.id);
  if (storeIds.length === 0) {
    return {
      rows: [],
      meta: {
        queryTimings: timings,
        dbDurationMs: Date.now() - tDb0,
        maxRows: PHASE11B_MAX_ROWS,
        paginationVerified: false,
      },
      measurable: false,
      reason: "viewer_has_no_owned_stores",
    };
  }

  const { data: orders, timing: t1 } = await timedSelect("store_orders_owner", () =>
    sb
      .from("store_orders")
      .select("id, store_id, buyer_user_id, community_messenger_room_id, order_status, fulfillment_type")
      .in("store_id", storeIds)
      .not("community_messenger_room_id", "is", null)
      .limit(PHASE11B_MAX_ROWS)
  );
  timings.push(t1);
  type OrderRow = {
    id: string;
    store_id: string;
    buyer_user_id: string;
    community_messenger_room_id: string;
    order_status?: string | null;
    fulfillment_type?: string | null;
  };
  const orderRows = (orders ?? []) as OrderRow[];
  const roomIds = orderRows.map((o) => o.community_messenger_room_id);
  const buyerIds = orderRows.map((o) => o.buyer_user_id);

  const { data: rooms, timing: tRooms } = await timedSelect("store_order_rooms_owner", () =>
    roomIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : sb
          .from("community_messenger_rooms")
          .select("id, chat_domain, domain_identity_key, last_message")
          .in("id", roomIds)
          .eq("chat_domain", "store_order")
  );
  timings.push(tRooms);
  const roomById = new Map(
    ((rooms ?? []) as Array<{
      id: string;
      domain_identity_key: string | null;
      last_message?: string | null;
    }>).map((r) => [r.id, r])
  );

  // Badge SSOT: owner_order_chat targets (target_id=room_id) — not participants.unread_count.
  const { data: ownerTargetRows, timing: tParts } = await timedSelect(
    "store_order_unread_targets_owner",
    () =>
      sb
        .from("notification_targets")
        .select("target_id, domain_identity_key")
        .eq("user_id", viewerUserId)
        .eq("target_type", STORE_ORDER_OWNER_UNREAD_TARGET_TYPE)
        .eq("is_unread", true)
        .eq("chat_domain", "store_order")
  );
  timings.push(tParts);
  const ownerUnreadIndex = buildStoreOrderOwnerUnreadTargetIndex(
    (ownerTargetRows ?? []) as Array<{
      target_id: string | null;
      domain_identity_key: string | null;
    }>
  );

  const { map: msgMap, timing: t2 } = await loadLatestMessagesByRoomIds(sb, roomIds);
  timings.push(t2);
  const { map: profiles, timing: t3 } = await loadProfiles(sb, buyerIds);
  timings.push(t3);

  const rows: StoreOrderOwnerLoaderBatchRow[] = [];
  for (const o of orderRows) {
    const room = roomById.get(o.community_messenger_room_id);
    if (!room) continue;
    const expectedKey = storeOrderRoomIdentity(o.id).identityKey;
    const key = String(room.domain_identity_key ?? "").trim();
    if (key !== expectedKey) continue;
    const latest = msgMap.get(o.community_messenger_room_id) ?? null;
    const prof = profiles.get(o.buyer_user_id);
    rows.push({
      roomId: o.community_messenger_room_id,
      chatDomain: "store_order",
      domainIdentityKey: key,
      orderId: o.id,
      storeId: o.store_id,
      customerUserId: o.buyer_user_id,
      customerName: prof?.name ?? null,
      customerAvatarUrl: prof?.avatar ?? null,
      unreadCount: resolveStoreOrderOwnerListUnreadCount({
        orderId: o.id,
        roomId: o.community_messenger_room_id,
        index: ownerUnreadIndex,
      }),
      storeOwnerUserIds: [viewerUserId],
      latestMessage: latest
        ? {
            roomId: o.community_messenger_room_id,
            bodyText: latest.bodyText,
            isSystem: latest.isSystem,
            createdAt: latest.createdAt,
          }
        : null,
      orderStatusLabel: o.order_status ?? null,
      fulfillmentType: o.fulfillment_type ?? null,
      roomLastMessageSummary: room.last_message ?? null,
    });
  }

  return {
    rows,
    meta: {
      queryTimings: timings,
      dbDurationMs: Date.now() - tDb0,
      maxRows: PHASE11B_MAX_ROWS,
      paginationVerified: false,
    },
    measurable: true,
  };
}

export function createStoreOrderOwnerLiveBootstrapSource(
  sb: SupabaseClient,
  onMeta?: (meta: Phase11bLiveLoadMeta) => void
): StoreOrderBootstrapSource {
  return createStoreOrderOwnerDbLoaderSource(async (viewerUserId) => {
    const { rows, meta } = await fetchStoreOrderOwnerLiveBatch(sb, viewerUserId);
    onMeta?.(meta);
    return rows;
  });
}
