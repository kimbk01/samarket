import type { CommunityMessengerPeerPresenceSnapshot } from "@/lib/community-messenger/types";

/** 친구 목록·1:1 헤더·점메뉴 — lastSeen 은 `yy-mm-dd hh:mm` 고정 (기기 간 날짜 누락 차이 방지) */
export function formatMessengerLastSeenYyMmDdHhMm(at: string | Date): string | null {
  const time = at instanceof Date ? at.getTime() : new Date(at).getTime();
  if (!Number.isFinite(time)) return null;
  const date = new Date(time);
  const yy = String(date.getFullYear() % 100).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yy}-${mm}-${dd} ${hh}:${mi}`;
}

/** 1:1 헤더·점메뉴 상단과 동일한 한 줄 문구 */
export function formatMessengerPeerPresenceLine(snapshot: CommunityMessengerPeerPresenceSnapshot | null | undefined): string {
  if (!snapshot) return "오프라인";
  const state = snapshot.state;
  if (state === "online") return "온라인";
  if (state === "away") return "자리 비움";
  const lastSeenAt = snapshot.lastSeenAt;
  if (!lastSeenAt) return "오프라인";
  const stamped = formatMessengerLastSeenYyMmDdHhMm(lastSeenAt);
  if (!stamped) return "오프라인";
  return `마지막 접속 ${stamped}`;
}
