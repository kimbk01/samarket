import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * P3-c1 — participant decrease / room phase2 mark_read 중복 fresh 제거.
 *
 * 계약:
 *   한 번의 mark_read 사실
 *   → Generation Owner 는 ACK 1개
 *   → room fact apply 가능
 *   → participant/phase2 추가 fresh 0
 *   → 추가 server force rebuild 0
 *   단, ACK 실패 fallback 은 별도(정확히 1회).
 *
 * P3-a(ACK 계산·소유권), participant increase, poll/resume/reconnect 는 변경하지 않는다.
 */

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("P3-c1 static contract", () => {
  it("participant decrease skips fresh when room fact committed to Authority", () => {
    const src = read(
      "lib/community-messenger/notifications/use-cm-participants-hub-sync.ts"
    );
    const code = stripComments(src);
    // decrease resync 는 room fact 미적용(authorityApplied === false)일 때만 실행.
    expect(code).toContain("!applied.authorityApplied");
    const decreaseIdx = code.indexOf('participantUnreadDirection: "decrease"');
    expect(decreaseIdx).toBeGreaterThan(-1);
    // decrease resync 가 fallback 가드 안쪽에 있어야 한다.
    const guardIdx = code.indexOf("decreaseFallback");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(decreaseIdx);
    // increase 는 그대로 무조건 resync 유지.
    expect(code).toContain('participantUnreadDirection: "increase"');
  });

  it("room-open mark_read has no unconditional room_phase2_mark_read fresh after ACK", () => {
    const src = read(
      "lib/community-messenger/room/use-messenger-room-open-mark-read-effect.ts"
    );
    const code = stripComments(src);
    // ACK 성공 여부와 무관하게 fresh 를 발행하던 notificationReadDone 분기 제거.
    expect(code).not.toContain("notificationReadDone");
    // 방 진입은 ACK 결과(requiresFallbackResync)로만 fallback.
    expect(code).toContain("postNotificationRoomReadWithAck");
    expect(code).toContain("res.requiresFallbackResync");
    expect(code).toContain("reconcileUnreadFromServer()");
    // room_phase2_mark_read fresh 발행은 fallback(reconcileUnreadFromServer) 정의 안쪽으로만 한정.
    const reconcileStart = code.indexOf("const reconcileUnreadFromServer");
    const reconcileEnd = code.indexOf("const tryEarlyOptimisticListBadgeClear");
    expect(reconcileStart).toBeGreaterThan(-1);
    expect(reconcileEnd).toBeGreaterThan(reconcileStart);
    const outsideReconcile =
      code.slice(0, reconcileStart) + code.slice(reconcileEnd);
    expect(outsideReconcile).not.toContain('requestMessengerHubBadgeResync("room_phase2_mark_read"');
  });

  it("read client returns AckApplyResult without firing its own fallback on ACK path", () => {
    const src = read("lib/notifications/client/notification-event-read-client.ts");
    expect(src).toContain("export type AckApplyResult");
    expect(src).toContain("export async function postNotificationRoomReadWithAck");
    expect(src).toContain("requiresFallbackResync");
    // P3-a 소유권 계산은 유지.
    expect(src).toContain("applyDomainBadgeAuthorityFromReadAck");
    expect(src).toContain("skipBadgeCount: true");
  });
});

// ---- Runtime: postNotificationRoomReadWithAck fallback semantics ----

const applyDomainBadgeAuthorityFromReadAck = vi.fn();
const resyncBadgesAfterNotificationEventsRead = vi.fn();
const applyCallLogsOrphanMissedReadFact = vi.fn();
const requestMessengerHubBadgeResync = vi.fn();

vi.mock("@/lib/community-messenger/notifications/messenger-notification-contract", () => ({
  requestMessengerHubBadgeResync: (...a: unknown[]) => requestMessengerHubBadgeResync(...a),
}));
vi.mock("@/lib/notifications/client/notification-events-read-resync", () => ({
  resyncBadgesAfterNotificationEventsRead: (...a: unknown[]) =>
    resyncBadgesAfterNotificationEventsRead(...a),
  applyCallLogsOrphanMissedReadFact: (...a: unknown[]) => applyCallLogsOrphanMissedReadFact(...a),
  applyDomainBadgeAuthorityFromReadAck: (...a: unknown[]) =>
    applyDomainBadgeAuthorityFromReadAck(...a),
}));
vi.mock("@/lib/notifications/core/notification-logs", () => ({ logNotifyOpen: vi.fn() }));
vi.mock("@/lib/http/run-single-flight", () => ({
  runSingleFlight: (_k: string, fn: () => Promise<boolean>) => fn(),
}));

import { postNotificationRoomReadWithAck } from "@/lib/notifications/client/notification-event-read-client";

describe("P3-c1 runtime: room-read ACK apply result", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyDomainBadgeAuthorityFromReadAck.mockReturnValue(false);
  });

  it("ACK apply success → requiresFallbackResync=false, no fresh, skipBadgeCount hub shell", async () => {
    applyDomainBadgeAuthorityFromReadAck.mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, authority: "domain_badge", projectionVersionMs: 1 }),
      }))
    );
    const res = await postNotificationRoomReadWithAck("room-1");
    expect(res).toEqual({ ok: true, applied: true, generationAccepted: true, requiresFallbackResync: false });
    expect(resyncBadgesAfterNotificationEventsRead).not.toHaveBeenCalled();
    expect(requestMessengerHubBadgeResync).toHaveBeenCalledWith("room_read", { skipBadgeCount: true });
  });

  it("ACK not applicable → requiresFallbackResync=true, no self fresh (caller owns fallback)", async () => {
    applyDomainBadgeAuthorityFromReadAck.mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, cleared: 1 }) }))
    );
    const res = await postNotificationRoomReadWithAck("room-2");
    expect(res.ok).toBe(true);
    expect(res.requiresFallbackResync).toBe(true);
    expect(resyncBadgesAfterNotificationEventsRead).not.toHaveBeenCalled();
    expect(requestMessengerHubBadgeResync).not.toHaveBeenCalled();
  });

  it("HTTP failure → requiresFallbackResync=true", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    const res = await postNotificationRoomReadWithAck("room-3");
    expect(res.ok).toBe(false);
    expect(res.requiresFallbackResync).toBe(true);
    expect(resyncBadgesAfterNotificationEventsRead).not.toHaveBeenCalled();
  });
});
