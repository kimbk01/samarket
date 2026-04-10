"use client";

import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";
import { fetchChatRoomBootstrapApi } from "@/lib/chats/fetch-chat-room-bootstrap-api";
import type { ChatRoomSource } from "@/lib/types/chat";

const WARM_TTL_MS = 45_000;
const warmedAtByHref = new Map<string, number>();

function normalizeHrefPath(hrefRaw: string): string {
  const href = hrefRaw.trim();
  if (!href) return "";
  if (href.startsWith("http://") || href.startsWith("https://")) {
    try {
      return new URL(href).pathname;
    } catch {
      return href;
    }
  }
  return href;
}

function extractChatRoomIdFromHrefPath(pathname: string): string | null {
  const tradeSeg = TRADE_CHAT_SURFACE.hubPath.replace(/^\//, "").replace(/\//g, "\\/");
  const m = new RegExp(`^\\/(?:chats|${tradeSeg})\\/([^/?#]+)`).exec(pathname);
  const roomId = m?.[1]?.trim();
  return roomId || null;
}

/** 방 상세 → 메시지 GET — source 를 이미 알면 초기 진입에서 두 요청을 병렬로 시작한다. */
async function loadRoomDetailAndMessages(roomId: string, sourceHint?: ChatRoomSource | null): Promise<void> {
  await fetchChatRoomBootstrapApi(roomId, sourceHint);
}

/**
 * 채팅방 화면 마운트 직후 — 인증(`getCurrentUserIdForDb`)과 병행해 상세·메시지 캐시를 채워 체감 지연 완화.
 * (알림 호버용 `prewarmChatRouteData` 와 달리 TTL 없음)
 */
export function warmChatRoomEntryById(roomId: string, sourceHint?: ChatRoomSource | null): void {
  const id = roomId.trim();
  if (!id) return;
  void loadRoomDetailAndMessages(id, sourceHint);
}

export function shouldWarmChatRoute(hrefRaw: string): boolean {
  const href = hrefRaw.trim();
  if (!href) return false;
  const now = Date.now();
  const prev = warmedAtByHref.get(href) ?? 0;
  if (now - prev < WARM_TTL_MS) return false;
  warmedAtByHref.set(href, now);
  return true;
}

export function prewarmChatRouteData(hrefRaw: string): void {
  const pathname = normalizeHrefPath(hrefRaw);
  const roomId = extractChatRoomIdFromHrefPath(pathname);
  if (!roomId) return;
  void loadRoomDetailAndMessages(roomId);
}
