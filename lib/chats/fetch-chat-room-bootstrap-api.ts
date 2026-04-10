"use client";

import type { ChatMessage, ChatRoom, ChatRoomSource } from "@/lib/types/chat";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  peekChatRoomDetailMemory,
  updateChatRoomDetailMemory,
} from "@/lib/chats/fetch-chat-room-detail-api";
import {
  peekIntegratedChatRoomMessagesCache,
  peekLegacyChatRoomMessagesCache,
  updateIntegratedChatRoomMessagesCache,
  updateLegacyChatRoomMessagesCache,
} from "@/lib/chats/fetch-chat-room-messages-api";

type FetchBootstrapResult =
  | { ok: true; room: ChatRoom; messages: ChatMessage[]; cache: "memory" | "network" }
  | { ok: false; status: number; code: "not_found" | "auth" | "load_failed" | "network" };

function isChatRoomPayload(j: unknown): j is ChatRoom {
  if (!j || typeof j !== "object") return false;
  const o = j as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.buyerId === "string" &&
    typeof o.sellerId === "string" &&
    !("error" in o && o.error != null)
  );
}

function normalizeBootstrapMessages(_room: ChatRoom, raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw as ChatMessage[];
}

export async function fetchChatRoomBootstrapApi(
  roomId: string,
  sourceHint?: ChatRoomSource | null
): Promise<FetchBootstrapResult> {
  const key = roomId.trim();
  if (!key) return { ok: false, status: 400, code: "load_failed" };

  const cachedRoom = peekChatRoomDetailMemory(key);
  if (cachedRoom) {
    const cachedMessages =
      cachedRoom.source === "chat_room"
        ? peekIntegratedChatRoomMessagesCache(cachedRoom.id)
        : peekLegacyChatRoomMessagesCache(cachedRoom.id);
    if (cachedMessages) {
      return { ok: true, room: cachedRoom, messages: cachedMessages, cache: "memory" };
    }
  }

  return runSingleFlight(`chat:room-bootstrap:${key}`, async () => {
    try {
      const qs =
        sourceHint === "chat_room" || sourceHint === "product_chat"
          ? `?source=${encodeURIComponent(sourceHint)}`
          : "";
      const res = await fetch(`/api/chat/room/${encodeURIComponent(key)}/bootstrap${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | { room?: unknown; messages?: unknown }
        | null;
      const room = json?.room;
      if (res.status === 404) return { ok: false, status: 404, code: "not_found" as const };
      if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, code: "auth" as const };
      if (!res.ok || !isChatRoomPayload(room)) {
        return { ok: false, status: res.status, code: "load_failed" as const };
      }
      const typedRoom = room as ChatRoom;
      const messages = normalizeBootstrapMessages(typedRoom, json?.messages);
      updateChatRoomDetailMemory(key, typedRoom);
      if (typedRoom.source === "chat_room") {
        updateIntegratedChatRoomMessagesCache(typedRoom.id, messages);
      } else {
        updateLegacyChatRoomMessagesCache(typedRoom.id, messages);
      }
      return { ok: true, room: typedRoom, messages, cache: "network" } as const;
    } catch {
      return { ok: false, status: 0, code: "network" as const };
    }
  });
}
