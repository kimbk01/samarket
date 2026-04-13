"use client";

import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";
import { fetchChatRoomBootstrapApi } from "@/lib/chats/fetch-chat-room-bootstrap-api";
import type { ChatRoomSource } from "@/lib/types/chat";

const WARM_TTL_MS = 45_000;
const warmedAtByHref = new Map<string, number>();

function extractChatRoomIdFromHrefPath(pathname: string): string | null {
  const tradeSeg = TRADE_CHAT_SURFACE.hubPath.replace(/^\//, "").replace(/\//g, "\\/");
  const cmRoom = /^\/community-messenger\/rooms\/([^/?#]+)/.exec(pathname);
  if (cmRoom?.[1]?.trim()) return cmRoom[1].trim();
  const m = new RegExp(`^\\/(?:chats|${tradeSeg})\\/([^/?#]+)`).exec(pathname);
  const roomId = m?.[1]?.trim();
  return roomId || null;
}

/** `/chats/x?source=product_chat` 등 전체 href에서 roomId + 부트스트랩 source 힌트 */
function extractPrewarmChatParams(hrefRaw: string): {
  roomId: string | null;
  sourceHint: ChatRoomSource | null;
} {
  const href = hrefRaw.trim();
  if (!href) return { roomId: null, sourceHint: null };
  let pathname = href;
  let search = "";
  try {
    const u = href.startsWith("http://") || href.startsWith("https://")
      ? new URL(href)
      : new URL(href, "https://samarket.local");
    pathname = u.pathname;
    search = u.search;
  } catch {
    const q = href.indexOf("?");
    if (q >= 0) {
      pathname = href.slice(0, q);
      search = href.slice(q);
    }
  }
  const roomId = extractChatRoomIdFromHrefPath(pathname);
  let sourceHint: ChatRoomSource | null = null;
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const s = params.get("source")?.trim();
    if (s === "chat_room" || s === "product_chat") sourceHint = s;
  } catch {
    /* ignore */
  }
  return { roomId, sourceHint };
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
  const { roomId, sourceHint } = extractPrewarmChatParams(hrefRaw);
  if (!roomId) return;
  void loadRoomDetailAndMessages(roomId, sourceHint);
}
