/**
 * Shadow compare ConversationStore vs legacy hub lists — no product paint.
 */
import { normalizeConversationRoomId } from "@/lib/community-messenger/conversation-engine/identity";
import { getConversationStore } from "@/lib/community-messenger/conversation-engine/conversation-store";
import { messageTypeFromPreviewKind } from "@/lib/community-messenger/conversation-engine/mapper-from-room-summary";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";

export type ConversationShadowMismatch = Readonly<{
  roomId: string;
  field: string;
  legacy: unknown;
  engine: unknown;
}>;

export type ConversationShadowCompareResult = Readonly<{
  ok: boolean;
  mismatches: ConversationShadowMismatch[];
  legacyCount: number;
  engineHubCount: number;
}>;

function stripCommerceIds(data: CommunityMessengerBootstrap): Set<string> {
  const ids = new Set<string>();
  for (const r of [...(data.chats ?? []), ...(data.groups ?? [])]) {
    const d = String(r.chatDomain ?? "");
    if (d === "trade" || d === "store_order") continue;
    ids.add(normalizeConversationRoomId(r.id));
  }
  return ids;
}

export function compareConversationStoreToLegacyBootstrap(
  legacy: CommunityMessengerBootstrap | null
): ConversationShadowCompareResult {
  if (!legacy) {
    return { ok: true, mismatches: [], legacyCount: 0, engineHubCount: 0 };
  }
  const store = getConversationStore();
  const hub = store.selectHubConversations();
  const legacyIds = stripCommerceIds(legacy);
  const mismatches: ConversationShadowMismatch[] = [];

  const engineById = new Map(hub.map((c) => [normalizeConversationRoomId(c.roomId), c]));
  const legacyRooms = [...(legacy.chats ?? []), ...(legacy.groups ?? [])].filter((r) => {
    const d = String(r.chatDomain ?? "");
    return d !== "trade" && d !== "store_order";
  });

  for (const id of legacyIds) {
    if (!engineById.has(id)) {
      mismatches.push({ roomId: id, field: "presence", legacy: true, engine: false });
    }
  }
  for (const [id] of engineById) {
    if (!legacyIds.has(id)) {
      mismatches.push({ roomId: id, field: "presence", legacy: false, engine: true });
    }
  }

  for (const room of legacyRooms) {
    const id = normalizeConversationRoomId(room.id);
    const eng = engineById.get(id);
    if (!eng) continue;
    if (String(room.lastMessageAt ?? "") !== String(eng.lastActivityAt ?? "")) {
      mismatches.push({
        roomId: id,
        field: "lastActivityAt",
        legacy: room.lastMessageAt,
        engine: eng.lastActivityAt,
      });
    }
    if (String(room.lastMessage ?? "") !== String(eng.preview.text ?? "")) {
      mismatches.push({
        roomId: id,
        field: "preview",
        legacy: room.lastMessage,
        engine: eng.preview.text,
      });
    }
    const legacyType = String(room.lastMessageType ?? "text");
    const engineType = messageTypeFromPreviewKind(eng.preview.kind);
    if (legacyType !== engineType) {
      mismatches.push({
        roomId: id,
        field: "previewKind",
        legacy: legacyType,
        engine: engineType,
      });
    }
    if (Number(room.unreadCount ?? 0) !== Number(eng.unreadCount ?? 0)) {
      mismatches.push({
        roomId: id,
        field: "unread",
        legacy: room.unreadCount,
        engine: eng.unreadCount,
      });
    }
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
    legacyCount: legacyRooms.length,
    engineHubCount: hub.length,
  };
}

export function logConversationShadowCompare(
  legacy: CommunityMessengerBootstrap | null,
  tag = "conversation_engine_shadow"
): ConversationShadowCompareResult {
  const result = compareConversationStoreToLegacyBootstrap(legacy);
  if (typeof console !== "undefined") {
    if (!result.ok) {
      console.info(`[${tag}] mismatch`, {
        count: result.mismatches.length,
        sample: result.mismatches.slice(0, 8),
        legacyCount: result.legacyCount,
        engineHubCount: result.engineHubCount,
      });
    } else if (process.env.NODE_ENV !== "production") {
      console.debug(`[${tag}] ok`, {
        legacyCount: result.legacyCount,
        engineHubCount: result.engineHubCount,
      });
    }
  }
  if (typeof window !== "undefined") {
    (window as Window & { __DIBAY_CONVERSATION_ENGINE_SHADOW__?: unknown }).__DIBAY_CONVERSATION_ENGINE_SHADOW__ = {
      ...result,
      metrics: getConversationStore().getMetrics(),
      at: Date.now(),
    };
  }
  return result;
}
