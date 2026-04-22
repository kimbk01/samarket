import type { CommunityMessengerPeerPresenceSnapshot } from "@/lib/community-messenger/types";

/** 1:1 헤더·점메뉴 상단과 동일한 한 줄 문구 */
export function formatMessengerPeerPresenceLine(snapshot: CommunityMessengerPeerPresenceSnapshot | null | undefined): string {
  if (!snapshot) return "오프라인";
  const state = snapshot.state;
  if (state === "online") return "온라인";
  if (state === "away") return "자리 비움";
  const lastSeenAt = snapshot.lastSeenAt;
  if (!lastSeenAt) return "오프라인";
  const time = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(time)) return "오프라인";
  const date = new Date(time);
  return `마지막 접속 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
