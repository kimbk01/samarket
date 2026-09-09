/**
 * CUT-B — Open-room same-purpose terminal refresh coalescing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { createTrailingRefreshScheduler } from "@/lib/community-messenger/realtime/community-messenger-realtime-schedulers";
import { MESSENGER_ROOM_TERMINAL_CATCHUP_COALESCE_MS } from "@/lib/community-messenger/messenger-latency-config";

describe("CUT-B open-room terminal catch-up coalesce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("window is 200ms (meta-aligned; absorbs session→stub→rooms tip)", () => {
    expect(MESSENGER_ROOM_TERMINAL_CATCHUP_COALESCE_MS).toBe(200);
  });

  it("1. session-only schedule → 1 refresh", () => {
    const run = vi.fn();
    const { schedule } = createTrailingRefreshScheduler(run, {
      coalesceMs: MESSENGER_ROOM_TERMINAL_CATCHUP_COALESCE_MS,
    });
    schedule();
    vi.advanceTimersByTime(MESSENGER_ROOM_TERMINAL_CATCHUP_COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("2–3. call_logs / stub-rooms alone → 1 refresh each", () => {
    for (const _ of ["call_logs", "stub_rooms"]) {
      const run = vi.fn();
      const { schedule } = createTrailingRefreshScheduler(run, {
        coalesceMs: MESSENGER_ROOM_TERMINAL_CATCHUP_COALESCE_MS,
      });
      schedule();
      vi.advanceTimersByTime(MESSENGER_ROOM_TERMINAL_CATCHUP_COALESCE_MS);
      expect(run).toHaveBeenCalledTimes(1);
    }
  });

  it("4–7. mixed terminal producers same burst → 1 refresh", () => {
    const run = vi.fn();
    const { schedule } = createTrailingRefreshScheduler(run, {
      coalesceMs: MESSENGER_ROOM_TERMINAL_CATCHUP_COALESCE_MS,
    });
    schedule(); // session
    schedule(); // call_logs
    schedule(); // stub/rooms
    schedule(); // bump-owned burst schedule
    vi.advanceTimersByTime(MESSENGER_ROOM_TERMINAL_CATCHUP_COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("8. repeated burst inside window → 1 refresh", () => {
    const run = vi.fn();
    const { schedule } = createTrailingRefreshScheduler(run, {
      coalesceMs: MESSENGER_ROOM_TERMINAL_CATCHUP_COALESCE_MS,
    });
    schedule();
    vi.advanceTimersByTime(80);
    schedule();
    vi.advanceTimersByTime(80);
    schedule();
    vi.advanceTimersByTime(MESSENGER_ROOM_TERMINAL_CATCHUP_COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("9. separate later event → second refresh", () => {
    const run = vi.fn();
    const { schedule } = createTrailingRefreshScheduler(run, {
      coalesceMs: MESSENGER_ROOM_TERMINAL_CATCHUP_COALESCE_MS,
    });
    schedule();
    vi.advanceTimersByTime(MESSENGER_ROOM_TERMINAL_CATCHUP_COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
    schedule();
    vi.advanceTimersByTime(MESSENGER_ROOM_TERMINAL_CATCHUP_COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("10–11. cancel clears pending; no refresh after cleanup", () => {
    const run = vi.fn();
    const { schedule, cancel, hasPending } = createTrailingRefreshScheduler(run, {
      coalesceMs: MESSENGER_ROOM_TERMINAL_CATCHUP_COALESCE_MS,
    });
    schedule();
    expect(hasPending()).toBe(true);
    cancel();
    expect(hasPending()).toBe(false);
    vi.advanceTimersByTime(MESSENGER_ROOM_TERMINAL_CATCHUP_COALESCE_MS * 2);
    expect(run).not.toHaveBeenCalled();
  });

  it("trailing: late stub after session still one fire", () => {
    const run = vi.fn();
    const { schedule } = createTrailingRefreshScheduler(run, {
      coalesceMs: MESSENGER_ROOM_TERMINAL_CATCHUP_COALESCE_MS,
    });
    schedule();
    vi.advanceTimersByTime(90);
    schedule();
    vi.advanceTimersByTime(199);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("wiring: session terminal no longer immediate emit; uses scheduleOpenRoomTerminalCatchUp", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/realtime/global-messenger-room-bundle-channel.ts"),
      "utf8"
    );
    expect(src).toContain("scheduleOpenRoomTerminalCatchUp");
    expect(src).toContain("openRoomTerminalCatchUp");
    expect(src).toContain("MESSENGER_ROOM_TERMINAL_CATCHUP_COALESCE_MS");
    expect(src).toContain("notifyOpenRoomTerminalCatchUpFromCallLog");
    expect(src).not.toMatch(/table:\s*"community_messenger_call_logs"/);
    expect(src).toContain('table: "community_messenger_call_sessions"');
    expect(src).toContain('messageType === "call_stub"');
    expect(src).toContain('table: "community_messenger_rooms"');
    // Terminal status must not immediate-emit anymore
    const terminalBlock = src.slice(
      src.indexOf('status === "ended"'),
      src.indexOf("sched.roomCallBundle.schedule()", src.indexOf('status === "ended"'))
    );
    expect(terminalBlock).toContain("scheduleOpenRoomTerminalCatchUp");
    expect(terminalBlock).not.toContain("emitRoomRefreshForRoom(entry, rid)");
  });

  it("CUT-1 bump after= skip when coalesce pending; messages/{id} path preserved", () => {
    const catchup = readFileSync(
      join(process.cwd(), "lib/community-messenger/room/use-messenger-room-remote-catchup.ts"),
      "utf8"
    );
    expect(catchup).toContain("isOpenRoomTerminalCatchUpPendingForRoom");
    expect(catchup).toContain("tryMergeSingleMessageFromBump");
    expect(catchup).toContain("realtime_bump_catchup");
    const bump = readFileSync(
      join(process.cwd(), "lib/community-messenger/room/use-messenger-room-bump-broadcast-subscription.ts"),
      "utf8"
    );
    expect(bump).toContain("catchUpAfterRemoteBump");
    expect(bump).toContain("subscribeCommunityMessengerRoomBumpBroadcast");
  });

  it("CUT-1 publisher + History/Home owners untouched", () => {
    const service = readFileSync(join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
    expect(service).toContain("publishTerminalCallStubRoomBumpBestEffort");
    expect(service).toContain("publishMessengerRoomBumpAfterMutation");
    const history = readFileSync(
      join(process.cwd(), "lib/community-messenger/call-history/use-community-call-history-realtime-sync.ts"),
      "utf8"
    );
    expect(history).toContain("createCallHistoryRefreshScheduler");
    expect(history).toContain("CALL_HISTORY_REFETCH_COALESCE_MS");
    const home = readFileSync(
      join(process.cwd(), "lib/community-messenger/realtime/community-messenger-home-realtime-channels.ts"),
      "utf8"
    );
    expect(home).toContain('table: "community_messenger_call_logs"');
    expect(home).toContain("notifyOpenRoomTerminalCatchUpFromCallLog");
  });
});
