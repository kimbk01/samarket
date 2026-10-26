import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveParticipantUnreadDeltaInAppEffects } from "@/lib/community-messenger/notifications/messenger-message-notification-policy";
import { getParticipantRoomMuted } from "@/lib/community-messenger/notifications/cm-participant-notification-types";

/**
 * A-9 (10-27 07:14:51 Samsung 재현): 알림 끈 방(is_muted=true)에 iPhone 메시지 → 앱 안 배너 「w테스트1 Qqq」.
 * 정책 함수는 roomMuted 를 받았지만 쓰지 않았고, 호출부는 Realtime 행의 is_muted 를 넘기지 않았다.
 */
const base = {
  targetRoomId: "c202326f-8109-4ce4-aa61-394f0a799e7d",
  nextUnread: 1,
  prevUnread: 0,
  activeCommunityRoomId: null,
  appVisibility: "foreground" as const,
  windowFocused: true,
};

describe("A-9 알림 끈 방은 앱 안 배너가 없다", () => {
  it("다른 화면·포그라운드 — 알림 켠 방은 배너, 끈 방은 없음", () => {
    expect(resolveParticipantUnreadDeltaInAppEffects(base).showAppLevelBanner).toBe(true);
    const muted = resolveParticipantUnreadDeltaInAppEffects({ ...base, roomMuted: true });
    expect(muted.showAppLevelBanner).toBe(false);
    expect(muted.playInAppMessageSound).toBe(false);
  });

  it("Realtime 참가자 행의 is_muted 를 그대로 읽는다", () => {
    expect(getParticipantRoomMuted({ room_id: "r", is_muted: true })).toBe(true);
    expect(getParticipantRoomMuted({ room_id: "r", is_muted: false })).toBe(false);
    expect(getParticipantRoomMuted({ room_id: "r" })).toBe(false);
    expect(getParticipantRoomMuted(null)).toBe(false);
  });

  it("호출 경로가 서버 값을 넘기고, 알림 끈 방은 배너·데스크톱 알림을 건너뛴다 (계약)", () => {
    const hub = readFileSync("lib/community-messenger/notifications/use-cm-participants-hub-sync.ts", "utf8");
    expect(hub).toContain("roomMuted: getParticipantRoomMuted(");
    const fx = readFileSync("lib/community-messenger/notifications/cm-participant-unread-full-effects.ts", "utf8");
    expect(fx).toContain("roomMuted: args.roomMuted === true,");
    expect(fx.match(/if \(args\.roomMuted === true\) return;/g)?.length).toBe(2);
  });
});
