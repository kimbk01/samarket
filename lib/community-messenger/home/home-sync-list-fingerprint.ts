import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { messengerTraceConsoleDebug } from "@/lib/community-messenger/messenger-trace-console";

function roomListFingerprintParts(rooms: CommunityMessengerRoomSummary[], prefix: "c" | "g"): string[] {
  const sorted = [...rooms].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return sorted.map((r) =>
    [
      prefix,
      r.id,
      r.lastMessageAt ?? "",
      r.unreadCount ?? 0,
      r.lastMessage ?? "",
      r.lastMessageType ?? "",
      /** D-6: 서버가 보관 값만 바꿔 보내도 「같음」으로 버리지 않게 */
      r.isArchivedByViewer ? "A" : "",
      /** A-8: 다른 기기에서 알림만 끈 응답도 「같음」으로 버리지 않게 */
      r.isMuted ? "M" : "",
      /** A-15: 다른 기기에서 고정만 바꾼 응답도 「같음」으로 버리지 않게 */
      r.isPinned ? "P" : "",
    ].join(":")
  );
}

/** silent home-sync·deferred flush — 동일 스냅샷이면 repaint skip (semantics 변경 없음) */
export function fingerprintHomeSyncLists(payload: {
  chats?: CommunityMessengerBootstrap["chats"];
  groups?: CommunityMessengerBootstrap["groups"];
}): string {
  const parts = [
    ...roomListFingerprintParts(payload.chats ?? [], "c"),
    ...roomListFingerprintParts(payload.groups ?? [], "g"),
  ];
  return parts.join("|");
}

export function fingerprintHomeBootstrapLists(data: CommunityMessengerBootstrap | null | undefined): string {
  if (!data) return "";
  return fingerprintHomeSyncLists({ chats: data.chats, groups: data.groups });
}

export function logHomeSyncIdenticalSkip(reason: string, detail?: Record<string, unknown>): void {
  messengerTraceConsoleDebug("[cm-home-sync-identical-skip]", { reason, ...detail });
}
