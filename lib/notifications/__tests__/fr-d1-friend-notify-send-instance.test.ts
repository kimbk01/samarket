import { beforeEach, describe, expect, it, vi } from "vitest";

const appended = vi.hoisted(() => [] as Array<{ dedupe_key?: string }>);
vi.mock("@/lib/notifications/append-user-notification", () => ({
  appendUserNotification: vi.fn(async (_sb: unknown, row: { dedupe_key?: string }) => {
    appended.push(row);
  }),
}));
vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: vi.fn(async () => "ko"),
}));

import {
  notifyCommunityMessengerFriendRequestAccepted,
  notifyCommunityMessengerFriendRequestReceived,
} from "@/lib/notifications/community-messenger-friend-inapp-notify";

/**
 * FR-D1 (10-27 09:52 실기기): 취소 뒤 같은 날 재요청은 같은 요청 id 를 다시 써서
 * 「id + 날짜」 키로는 두 번째 알림·푸시가 중복으로 버려졌다.
 */
describe("FR-D1 친구 알림 중복 키 = 요청 id + 보낸 회차", () => {
  beforeEach(() => {
    appended.length = 0;
  });

  const base = { addresseeUserId: "w", requesterUserId: "q", requesterLabel: "q테스트1", requestId: "req-1" };

  it("같은 요청 id 라도 회차(created_at)가 다르면 다른 키 — 재요청 알림이 버려지지 않는다", async () => {
    await notifyCommunityMessengerFriendRequestReceived({} as never, { ...base, sendInstanceAt: "2026-10-27T01:48:31.138Z" });
    await notifyCommunityMessengerFriendRequestReceived({} as never, { ...base, sendInstanceAt: "2026-10-27T01:52:50.062Z" });
    expect(appended[0]!.dedupe_key).not.toBe(appended[1]!.dedupe_key);
  });

  it("같은 회차 재시도는 같은 키 — 한 번만", async () => {
    await notifyCommunityMessengerFriendRequestReceived({} as never, { ...base, sendInstanceAt: "2026-10-27T01:48:31.138Z" });
    await notifyCommunityMessengerFriendRequestReceived({} as never, { ...base, sendInstanceAt: "2026-10-27T01:48:31.138Z" });
    expect(appended[0]!.dedupe_key).toBe(appended[1]!.dedupe_key);
  });

  it("수락 알림도 회차별 — 삭제 뒤 다시 친구가 된 수락도 알린다", async () => {
    const acc = { requesterUserId: "q", accepterUserId: "w", accepterLabel: "w테스트1", requestId: "req-1" };
    await notifyCommunityMessengerFriendRequestAccepted({} as never, { ...acc, sendInstanceAt: "2026-10-27T01:52:50Z" });
    await notifyCommunityMessengerFriendRequestAccepted({} as never, { ...acc, sendInstanceAt: "2026-10-27T03:00:00Z" });
    expect(appended[0]!.dedupe_key).not.toBe(appended[1]!.dedupe_key);
  });

  it("회차를 모르면 지금처럼 날짜로 묶는다", async () => {
    await notifyCommunityMessengerFriendRequestReceived({} as never, base);
    expect(appended[0]!.dedupe_key).toMatch(/^cm_friend_request:req-1:\d{4}-\d{2}-\d{2}$/);
  });

  it("서버 요청·수락 경로가 요청 행 created_at 을 회차로 넘긴다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/community-messenger/service.ts", "utf8");
    expect(src.match(/sendInstanceAt: await readFriendRequestCreatedAt\(/g)?.length).toBe(2);
  });
});
