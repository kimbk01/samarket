import { afterEach, describe, expect, it } from "vitest";
import {
  LOCAL_READ_GUARD_TTL_MS,
  __forceLocalReadGuardHardGcAgeForTest,
  __forceLocalReadGuardSoftExpiredForTest,
  clearLocalReadGuardsForTests,
  resolveUnreadWithLocalReadGuard,
  setLocalReadGuard,
  shouldSuppressStaleUnread,
} from "@/lib/community-messenger/read/local-read-guard";

const TS = "2026-07-23T10:00:00.000Z";
const TS_NEWER = "2026-07-23T10:05:00.000Z";

describe("local-read-guard high-water (TTL alone must not re-admit stale unread)", () => {
  afterEach(() => {
    clearLocalReadGuardsForTests();
  });

  it("suppresses stale unread while soft TTL is active", () => {
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: TS, source: "manual" });
    expect(
      shouldSuppressStaleUnread({
        roomId: "r1",
        incomingUnread: 3,
        incomingLastMessageAt: TS,
      }),
    ).toBe(true);
    expect(
      resolveUnreadWithLocalReadGuard({
        roomId: "r1",
        incomingUnread: 3,
        incomingLastMessageAt: TS,
      }),
    ).toEqual({ unreadCount: 0, suppressed: true, allowedNewMessage: false });
  });

  it("still suppresses stale unread after soft TTL elapses (same lastMessageAt)", () => {
    setLocalReadGuard({
      roomId: "r1",
      referenceLastMessageAt: TS,
      source: "manual",
      ttlMs: LOCAL_READ_GUARD_TTL_MS,
    });
    __forceLocalReadGuardSoftExpiredForTest("r1");
    expect(
      shouldSuppressStaleUnread({
        roomId: "r1",
        incomingUnread: 4,
        incomingLastMessageAt: TS,
      }),
    ).toBe(true);
    expect(
      resolveUnreadWithLocalReadGuard({
        roomId: "r1",
        incomingUnread: 4,
        incomingLastMessageAt: TS,
      }),
    ).toEqual({ unreadCount: 0, suppressed: true, allowedNewMessage: false });
  });

  it("allows unread when lastMessageAt is newer than watermark (even after soft TTL)", () => {
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: TS, source: "manual" });
    __forceLocalReadGuardSoftExpiredForTest("r1");
    expect(
      resolveUnreadWithLocalReadGuard({
        roomId: "r1",
        incomingUnread: 2,
        incomingLastMessageAt: TS_NEWER,
      }),
    ).toEqual({ unreadCount: 2, suppressed: false, allowedNewMessage: true });
  });

  it("shouldSuppress returns false and clears watermark on newer lastMessageAt", () => {
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: TS, source: "manual" });
    expect(
      shouldSuppressStaleUnread({
        roomId: "r1",
        incomingUnread: 2,
        incomingLastMessageAt: TS_NEWER,
      }),
    ).toBe(false);
    // Guard cleared — subsequent same-at stale is not suppressed without a new set.
    expect(
      shouldSuppressStaleUnread({
        roomId: "r1",
        incomingUnread: 9,
        incomingLastMessageAt: TS,
      }),
    ).toBe(false);
  });

  it("hard GC removes watermark so subsequent stale unread is not suppressed", () => {
    setLocalReadGuard({ roomId: "r1", referenceLastMessageAt: TS, source: "manual" });
    __forceLocalReadGuardHardGcAgeForTest("r1");
    expect(
      shouldSuppressStaleUnread({
        roomId: "r1",
        incomingUnread: 3,
        incomingLastMessageAt: TS,
      }),
    ).toBe(false);
    expect(
      resolveUnreadWithLocalReadGuard({
        roomId: "r1",
        incomingUnread: 3,
        incomingLastMessageAt: TS,
      }),
    ).toEqual({ unreadCount: 3, suppressed: false, allowedNewMessage: false });
  });
});
