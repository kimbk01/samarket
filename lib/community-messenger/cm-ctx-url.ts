import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import {
  parseCommunityMessengerRoomContextMeta,
  serializeCommunityMessengerRoomContextMeta,
} from "@/lib/community-messenger/room-context-meta";

/**
 * 딥링크용 — `?cm_ctx=` (base64url UTF-8 JSON) 로 방 입장 시 목록 메타를 동기화한다.
 * 스토어·주문 UI는 `buildCommunityMessengerRoomUrlWithContext` 로 링크를 만든다.
 */
export function encodeCommunityMessengerRoomCmCtx(meta: CommunityMessengerRoomContextMetaV1): string {
  const json = serializeCommunityMessengerRoomContextMeta(meta);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCommunityMessengerRoomCmCtx(enc: string): CommunityMessengerRoomContextMetaV1 | null {
  const t = enc.trim();
  if (!t) return null;
  try {
    const pad = t.length % 4 === 0 ? "" : "=".repeat(4 - (t.length % 4));
    const b64 = t.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    return parseCommunityMessengerRoomContextMeta(json);
  } catch {
    return null;
  }
}

export function buildCommunityMessengerRoomUrlWithContext(
  roomId: string,
  meta: CommunityMessengerRoomContextMetaV1
): string {
  const id = String(roomId ?? "").trim();
  const enc = encodeCommunityMessengerRoomCmCtx(meta);
  return `/community-messenger/rooms/${encodeURIComponent(id)}?cm_ctx=${encodeURIComponent(enc)}`;
}
