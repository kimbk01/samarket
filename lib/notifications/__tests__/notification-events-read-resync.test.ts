import { beforeEach, describe, expect, it, vi } from "vitest";

const requestMessengerHubBadgeResync = vi.fn();
const requestNotificationBadgeCountResync = vi.fn();
const commitNotificationEventReadFact = vi.fn((_event: unknown): boolean => true);

vi.mock("@/lib/community-messenger/notifications/messenger-notification-contract", () => ({
  requestMessengerHubBadgeResync: (...args: unknown[]) => requestMessengerHubBadgeResync(...args),
}));

vi.mock("@/lib/notifications/projection-authority", () => ({
  commitNotificationEventReadFact: (event: unknown) => commitNotificationEventReadFact(event),
}));

vi.mock("@/lib/notifications/notification-badge-count-store", () => ({
  requestNotificationBadgeCountResync: (...args: unknown[]) =>
    requestNotificationBadgeCountResync(...args),
}));

import {
  applyCallLogsOrphanMissedReadFact,
  applyTier1InboxMarkAllReadOptimistic,
  resyncBadgesAfterNotificationEventsRead,
} from "@/lib/notifications/client/notification-events-read-resync";

describe("notification-events-read-resync (P0-3 event fact)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commitNotificationEventReadFact.mockReturnValue(true);
  });

  it("resyncs hub room count and Domain badge-count authority", () => {
    resyncBadgesAfterNotificationEventsRead("call_logs_viewed");
    expect(requestMessengerHubBadgeResync).toHaveBeenCalledTimes(1);
    expect(requestMessengerHubBadgeResync).toHaveBeenCalledWith("call_logs_viewed");
    expect(requestNotificationBadgeCountResync).toHaveBeenCalledTimes(1);
    expect(requestNotificationBadgeCountResync).toHaveBeenCalledWith("call_logs_viewed");
  });

  it("tier1 mark-all commits admin_notice_absolute=0 event fact only (no surface rebuild)", () => {
    applyTier1InboxMarkAllReadOptimistic();
    expect(commitNotificationEventReadFact).toHaveBeenCalledTimes(1);
    const arg = commitNotificationEventReadFact.mock.calls[0]?.[0] as {
      fact: { kind: string; absolute: number };
      source: string;
      eventVersion: number;
      eventIdentity: string;
    };
    expect(arg.fact).toEqual({ kind: "admin_notice_absolute", absolute: 0 });
    expect(arg.source).toBe("tier1_mark_all");
    expect(arg.eventVersion).toBeGreaterThan(0);
    expect(arg.eventIdentity).toContain("tier1_mark_all:");
    expect(requestNotificationBadgeCountResync).not.toHaveBeenCalled();
  });

  it("call_logs orphan read commits orphan_missed_absolute=0 event fact only", () => {
    applyCallLogsOrphanMissedReadFact();
    expect(commitNotificationEventReadFact).toHaveBeenCalledTimes(1);
    const arg = commitNotificationEventReadFact.mock.calls[0]?.[0] as {
      fact: { kind: string; absolute: number };
      source: string;
      scope: string;
    };
    expect(arg.fact).toEqual({ kind: "orphan_missed_absolute", absolute: 0 });
    expect(arg.source).toBe("call_logs_viewed");
    expect(arg.scope).toBe("call_logs");
    expect(requestNotificationBadgeCountResync).not.toHaveBeenCalled();
  });

  it("falls back to badge-count resync when baseline missing (commit returns false)", () => {
    commitNotificationEventReadFact.mockReturnValue(false);
    applyTier1InboxMarkAllReadOptimistic();
    expect(requestNotificationBadgeCountResync).toHaveBeenCalledWith(
      "optimistic_admin_baseline_missing"
    );

    vi.clearAllMocks();
    commitNotificationEventReadFact.mockReturnValue(false);
    applyCallLogsOrphanMissedReadFact();
    expect(requestNotificationBadgeCountResync).toHaveBeenCalledWith(
      "optimistic_missed_baseline_missing"
    );
  });

  it("produces unique event identities across same-ms calls", () => {
    applyTier1InboxMarkAllReadOptimistic();
    applyTier1InboxMarkAllReadOptimistic();
    const a = commitNotificationEventReadFact.mock.calls[0]?.[0] as { eventIdentity: string };
    const b = commitNotificationEventReadFact.mock.calls[1]?.[0] as { eventIdentity: string };
    expect(a.eventIdentity).not.toBe(b.eventIdentity);
  });
});
