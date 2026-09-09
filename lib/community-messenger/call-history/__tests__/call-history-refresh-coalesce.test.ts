/**
 * CUT-2C-IMPL — History same-purpose refresh coalescing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  CALL_HISTORY_REFETCH_COALESCE_MS,
  appendCommunityMessengerCallLogsById,
  createCallHistoryRefreshScheduler,
} from "@/lib/community-messenger/call-history/use-community-call-history-realtime-sync";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";

describe("CUT-2C history refresh coalescing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("window is 120ms (prior terminal wait; merges table+terminal burst)", () => {
    expect(CALL_HISTORY_REFETCH_COALESCE_MS).toBe(120);
  });

  it("1–3. call_logs / session / bus alone each schedule one fetch", () => {
    for (const _label of ["call_logs", "session", "bus"]) {
      const run = vi.fn();
      const { schedule } = createCallHistoryRefreshScheduler(run);
      schedule();
      expect(run).not.toHaveBeenCalled();
      vi.advanceTimersByTime(CALL_HISTORY_REFETCH_COALESCE_MS);
      expect(run).toHaveBeenCalledTimes(1);
    }
  });

  it("4–7. mixed sources in same burst → 1 fetch", () => {
    const cases: Array<() => void> = [
      () => {
        const run = vi.fn();
        const { schedule } = createCallHistoryRefreshScheduler(run);
        schedule(); // call_logs
        schedule(); // session
        vi.advanceTimersByTime(CALL_HISTORY_REFETCH_COALESCE_MS);
        expect(run).toHaveBeenCalledTimes(1);
      },
      () => {
        const run = vi.fn();
        const { schedule } = createCallHistoryRefreshScheduler(run);
        schedule(); // call_logs
        schedule(); // bus
        vi.advanceTimersByTime(CALL_HISTORY_REFETCH_COALESCE_MS);
        expect(run).toHaveBeenCalledTimes(1);
      },
      () => {
        const run = vi.fn();
        const { schedule } = createCallHistoryRefreshScheduler(run);
        schedule(); // session
        schedule(); // bus
        vi.advanceTimersByTime(CALL_HISTORY_REFETCH_COALESCE_MS);
        expect(run).toHaveBeenCalledTimes(1);
      },
      () => {
        const run = vi.fn();
        const { schedule } = createCallHistoryRefreshScheduler(run);
        schedule();
        schedule();
        schedule();
        vi.advanceTimersByTime(CALL_HISTORY_REFETCH_COALESCE_MS);
        expect(run).toHaveBeenCalledTimes(1);
      },
    ];
    for (const runCase of cases) runCase();
  });

  it("8. repeated same-source events inside window → 1 fetch", () => {
    const run = vi.fn();
    const { schedule } = createCallHistoryRefreshScheduler(run);
    schedule();
    vi.advanceTimersByTime(40);
    schedule();
    vi.advanceTimersByTime(40);
    schedule();
    vi.advanceTimersByTime(CALL_HISTORY_REFETCH_COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("9. event outside window → second fetch", () => {
    const run = vi.fn();
    const { schedule } = createCallHistoryRefreshScheduler(run);
    schedule();
    vi.advanceTimersByTime(CALL_HISTORY_REFETCH_COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
    schedule();
    vi.advanceTimersByTime(CALL_HISTORY_REFETCH_COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("10–11. unmount clears pending timer; no fetch after cancel", () => {
    const run = vi.fn();
    let cancelled = false;
    const { schedule, cancel, hasPending } = createCallHistoryRefreshScheduler(run, {
      isCancelled: () => cancelled,
    });
    schedule();
    expect(hasPending()).toBe(true);
    cancel();
    cancelled = true;
    expect(hasPending()).toBe(false);
    vi.advanceTimersByTime(CALL_HISTORY_REFETCH_COALESCE_MS * 2);
    expect(run).not.toHaveBeenCalled();
  });

  it("trailing debounce: late call_logs after session still one fetch", () => {
    const run = vi.fn();
    const { schedule } = createCallHistoryRefreshScheduler(run);
    schedule(); // session/bus at T0 → would fire T+120
    vi.advanceTimersByTime(50);
    schedule(); // call_logs arrives → reset to T+170
    vi.advanceTimersByTime(119);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("12. CUT-2B first-page replace clears older pages (append helper + replace)", () => {
    const mk = (id: string): CommunityMessengerCallLog =>
      ({
        id,
        sessionId: null,
        roomId: "r1",
        sessionMode: "direct",
        title: "Peer",
        peerLabel: "Peer",
        peerAvatarUrl: null,
        peerUserId: "peer",
        participantCount: 2,
        participantLabels: [],
        callKind: "voice",
        status: "ended",
        startedAt: "2026-07-01T00:00:00.000Z",
        durationSeconds: 1,
        endedAt: null,
        isOutgoing: true,
        endedReason: null,
        displayType: "outgoing",
      }) as CommunityMessengerCallLog;

    const loaded = appendCommunityMessengerCallLogsById([mk("p1"), mk("p2")], [mk("p3")]);
    expect(loaded.map((c) => c.id)).toEqual(["p1", "p2", "p3"]);
    const replaced = [mk("fresh")];
    expect(replaced.map((c) => c.id)).toEqual(["fresh"]);
  });

  it("hook wires call_logs + sessions + bus to one scheduleHistoryRefetch", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/call-history/use-community-call-history-realtime-sync.ts"),
      "utf8"
    );
    expect(src).toContain("createCallHistoryRefreshScheduler");
    expect(src).toContain("scheduleHistoryRefetch");
    expect(src).not.toContain("scheduleTableRefetch");
    expect(src).not.toContain("scheduleTerminalRefetch");
    expect(src).not.toContain("CALL_HISTORY_TABLE_DEBOUNCE_MS");
    expect(src).not.toContain("CALL_HISTORY_TERMINAL_REFETCH_DELAY_MS");
    expect(src.match(/scheduleHistoryRefetch\(\)/g)?.length).toBeGreaterThanOrEqual(5);
    expect(src).toContain('table: "community_messenger_call_logs"');
    expect(src).toContain('table: "community_messenger_call_sessions"');
    expect(src).toContain('ev.type !== "cm.call.session_terminal"');
  });
});
