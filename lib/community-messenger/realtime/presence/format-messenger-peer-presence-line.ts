import type { CommunityMessengerPeerPresenceSnapshot } from "@/lib/community-messenger/types";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatClock } from "@/lib/community-messenger/chat-list/chat-list-kakao-time";
import { formatMessengerCalendarDate } from "@/lib/community-messenger/messenger-clock-time";

/** 마지막 접속 시각이 표시 가능한 값인지 (잘못된 값이면 「오프라인」) */
export function parseMessengerLastSeenAt(at: string | Date | null | undefined): Date | null {
  if (at == null) return null;
  const time = at instanceof Date ? at.getTime() : new Date(at).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time);
}

export type MessengerPresenceLineT = (key: MessageKey, vars?: Record<string, string | number>) => string;

function sameLocalDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * 마지막 접속 문구 — P4-B (Owner 2026-11-18 「권장안대로 반영」, 레거시 Telegram 기준).
 * 예전 `yy-mm-dd hh:mm` 고정(「마지막 접속 26-11-14 04:15」)은 폐기. 시각은 메신저 시각 1형식(`formatClock`).
 * - 오늘: ko 「오전 1:48까지 접속함」 / en 「last seen today at 1:48 AM」
 * - 어제: ko 「어제 오후 11:57까지 접속함」 / en 「last seen yesterday at 11:57 PM」
 * - 올해: ko 「11월 15일 오후 11:57까지 접속함」 / en 「last seen Nov 15 at 11:57 PM」
 * - 다른 해: 날짜에 연도 (ko 「2025년 11월 15일 …」 / en 「Nov 15, 2025 …」)
 * 기기 기준 현지 시각. 레거시는 24시간 설정 기기에서 「23:57」 — 웹은 기기 설정을 읽을 수 없어 12시간 고정.
 */
export function formatMessengerLastSeenLine(lastSeen: Date, t: MessengerPresenceLineT, now: Date = new Date()): string {
  const time = formatClock(lastSeen, t);
  if (sameLocalDate(lastSeen, now)) return t("cm_presence_last_seen_today", { time });
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameLocalDate(lastSeen, yesterday)) return t("cm_presence_last_seen_yesterday", { time });
  return t("cm_presence_last_seen_date", { date: formatMessengerCalendarDate(lastSeen, t, "short", now), time });
}

/**
 * 1:1 헤더·점메뉴 상단·친구 목록과 동일한 한 줄 문구 — i18n 키(`cm_presence_*`)로만.
 * P3(Owner 2026-11-18 레거시 기준): 「자리 비움」 없음 — `away`(구 클라이언트 값)는 오프라인과 같게 표시.
 */
export function formatMessengerPeerPresenceLine(
  snapshot: CommunityMessengerPeerPresenceSnapshot | null | undefined,
  t: MessengerPresenceLineT,
  now: Date = new Date()
): string {
  if (!snapshot) return t("cm_presence_offline");
  if (snapshot.state === "online") return t("cm_presence_online");
  const lastSeen = parseMessengerLastSeenAt(snapshot.lastSeenAt);
  if (!lastSeen) return t("cm_presence_offline");
  return formatMessengerLastSeenLine(lastSeen, t, now);
}
