/**
 * Member Control Center — chat/group METADATA only.
 * 4-domain freeze. DO NOT select message body/content tables.
 * DO NOT union community_messenger group with group_room_members.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_DOMAINS, type ChatDomain } from "@/lib/chat-domain/four-domain-freeze";
import { asCount, isMissingRelation, type OverviewMetric } from "@/lib/admin-users/member-tab-query";

const PARTICIPANT_CAP = 1000;
const ROOM_SELECT_FULL = "id, chat_domain, room_type, room_status, domain_identity, title, last_message_at, created_at";
const ROOM_SELECT_MIN = "id, chat_domain, last_message_at, created_at";

export type MemberChatSummary = {
  byDomain: Record<ChatDomain, OverviewMetric<number>>;
  lastMessageAt: OverviewMetric<string | null>;
  legacyGroup: OverviewMetric<number>;
};

export type MemberChatRoomRow = {
  id: string;
  domain: string;
  source: "community_messenger" | "legacy_group_rooms";
  identity: string;
  title: string;
  roomStatus: string;
  lastMessageAt: string | null;
  createdAt: string | null;
};

export type MemberChatTabPayload = {
  summary: MemberChatSummary;
  domain: ChatDomain | "all" | "legacy_group";
  page: number;
  pageSize: number;
  total: OverviewMetric<number>;
  rooms: MemberChatRoomRow[];
};

function str(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "").trim();
}

function failedChat(error: string): MemberChatSummary {
  return {
    byDomain: {
      general_direct: { ok: false, error },
      group: { ok: false, error },
      trade: { ok: false, error },
      store_order: { ok: false, error },
    },
    lastMessageAt: { ok: false, error },
    legacyGroup: { ok: false, error },
  };
}

async function loadMessengerRooms(
  sb: SupabaseClient,
  userId: string,
): Promise<{ ids: string[]; error: string | null }> {
  const { data, error } = await sb
    .from("community_messenger_participants")
    .select("room_id")
    .eq("user_id", userId)
    .is("left_at", null)
    .limit(PARTICIPANT_CAP);
  if (error) return { ids: [], error: error.message };
  return {
    ids: [
      ...new Set(
        (data ?? [])
          .map((row) => String((row as { room_id?: string }).room_id ?? "").trim())
          .filter(Boolean),
      ),
    ],
    error: null,
  };
}

async function selectRooms(
  sb: SupabaseClient,
  ids: string[],
  select: string,
): Promise<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }> {
  const rooms: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await sb.from("community_messenger_rooms").select(select).in("id", chunk);
    if (error) return { data: null, error };
    if (Array.isArray(data)) rooms.push(...((data as unknown) as Record<string, unknown>[]));
  }
  return { data: rooms, error: null };
}

function mapMessengerRoom(row: Record<string, unknown>): MemberChatRoomRow {
  const domain = str(row, "chat_domain");
  return {
    id: str(row, "id"),
    domain,
    source: "community_messenger",
    identity: str(row, "domain_identity") || str(row, "id"),
    title: str(row, "title"),
    roomStatus: str(row, "room_status"),
    lastMessageAt: str(row, "last_message_at") || null,
    createdAt: str(row, "created_at") || null,
  };
}

export async function loadMemberChatTab(
  sb: SupabaseClient,
  userId: string,
  opts: {
    domain: ChatDomain | "all" | "legacy_group";
    page: number;
    pageSize: number;
    from: number;
    to: number;
  },
): Promise<MemberChatTabPayload> {
  const uid = userId.trim();
  const { ids, error: partErr } = await loadMessengerRooms(sb, uid);
  if (partErr) {
    return {
      summary: failedChat(partErr),
      domain: opts.domain,
      page: opts.page,
      pageSize: opts.pageSize,
      total: { ok: false, error: partErr },
      rooms: [],
    };
  }

  let roomRows: Record<string, unknown>[] = [];
  if (ids.length > 0) {
    let loaded = await selectRooms(sb, ids, ROOM_SELECT_FULL);
    if (loaded.error) {
      loaded = await selectRooms(sb, ids, ROOM_SELECT_MIN);
    }
    if (loaded.error) {
      const message = loaded.error.message ?? "rooms_failed";
      return {
        summary: failedChat(message),
        domain: opts.domain,
        page: opts.page,
        pageSize: opts.pageSize,
        total: { ok: false, error: message },
        rooms: [],
      };
    }
    roomRows = loaded.data ?? [];
  }

  const counts: Record<ChatDomain, number> = {
    general_direct: 0,
    group: 0,
    trade: 0,
    store_order: 0,
  };
  let latest: string | null = null;
  const messengerMapped = roomRows.map(mapMessengerRoom);
  for (const room of messengerMapped) {
    if ((CHAT_DOMAINS as readonly string[]).includes(room.domain)) {
      counts[room.domain as ChatDomain] += 1;
    }
    if (room.lastMessageAt && (!latest || room.lastMessageAt > latest)) latest = room.lastMessageAt;
  }

  const legacyCount = await asCount(
    sb.from("group_room_members").select("id", { count: "exact", head: true }).eq("user_id", uid).is("left_at", null),
  );
  const legacyGroup: OverviewMetric<number> =
    !legacyCount.ok && isMissingRelation(legacyCount.error, "group_room_members")
      ? { ok: true, value: 0 }
      : legacyCount;

  const summary: MemberChatSummary = {
    byDomain: {
      general_direct: { ok: true, value: counts.general_direct },
      group: { ok: true, value: counts.group },
      trade: { ok: true, value: counts.trade },
      store_order: { ok: true, value: counts.store_order },
    },
    lastMessageAt: { ok: true, value: latest },
    legacyGroup,
  };

  if (opts.domain === "legacy_group") {
    const { data, error } = await sb
      .from("group_room_members")
      .select("room_id, role, joined_at, left_at")
      .eq("user_id", uid)
      .is("left_at", null)
      .order("joined_at", { ascending: false })
      .range(opts.from, opts.to);
    if (error) {
      const missing = isMissingRelation(error.message, "group_room_members");
      return {
        summary,
        domain: opts.domain,
        page: opts.page,
        pageSize: opts.pageSize,
        total: missing ? { ok: true, value: 0 } : { ok: false, error: error.message },
        rooms: [],
      };
    }
    const members = (data ?? []) as Record<string, unknown>[];
    const roomIds = members.map((row) => str(row, "room_id")).filter(Boolean);
    const meta = new Map<string, Record<string, unknown>>();
    if (roomIds.length > 0) {
      const rooms = await sb.from("group_rooms").select("id, title, last_message_at, created_at").in("id", roomIds);
      if (!rooms.error) {
        for (const row of (rooms.data ?? []) as Record<string, unknown>[]) {
          meta.set(str(row, "id"), row);
        }
      }
    }
    return {
      summary,
      domain: opts.domain,
      page: opts.page,
      pageSize: opts.pageSize,
      total: summary.legacyGroup,
      rooms: members.map((row) => {
        const id = str(row, "room_id");
        const room = meta.get(id) ?? {};
        return {
          id,
          domain: "group",
          source: "legacy_group_rooms" as const,
          identity: id,
          title: str(room, "title"),
          roomStatus: str(row, "left_at") ? "left" : "active",
          lastMessageAt: str(room, "last_message_at") || null,
          createdAt: str(room, "created_at") || str(row, "joined_at") || null,
        };
      }),
    };
  }

  const filtered =
    opts.domain === "all" ? messengerMapped : messengerMapped.filter((room) => room.domain === opts.domain);
  filtered.sort((a, b) => String(b.lastMessageAt ?? "").localeCompare(String(a.lastMessageAt ?? "")));
  const totalValue = opts.domain === "all" ? messengerMapped.length : counts[opts.domain] ?? 0;
  return {
    summary,
    domain: opts.domain,
    page: opts.page,
    pageSize: opts.pageSize,
    total: { ok: true, value: totalValue },
    rooms: filtered.slice(opts.from, opts.to + 1),
  };
}
