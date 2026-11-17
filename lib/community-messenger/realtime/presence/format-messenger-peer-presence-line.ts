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

export type MessengerPresenceLineKey = "cm_presence_online" | "cm_presence_offline" | "cm_presence_last_seen_at";

export type MessengerPresenceLineT = (key: MessengerPresenceLineKey, vars?: Record<string, string | number>) => string;

/**
 * 1:1 헤더·점메뉴 상단·친구 목록과 동일한 한 줄 문구 — i18n 키(`cm_presence_*`)로만.
 * P3(Owner 2026-11-18 레거시 기준): 「자리 비움」 없음 — `away`(구 클라이언트 값)는 오프라인과 같게 표시.
 */
export function formatMessengerPeerPresenceLine(
  snapshot: CommunityMessengerPeerPresenceSnapshot | null | undefined,
  t: MessengerPresenceLineT
): string {
  if (!snapshot) return t("cm_presence_offline");
  if (snapshot.state === "online") return t("cm_presence_online");
  const lastSeenAt = snapshot.lastSeenAt;
  if (!lastSeenAt) return t("cm_presence_offline");
  const stamped = formatMessengerLastSeenYyMmDdHhMm(lastSeenAt);
  if (!stamped) return t("cm_presence_offline");
  return t("cm_presence_last_seen_at", { stamp: stamped });
}
