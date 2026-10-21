import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMessengerRoomResumeCatchupController,
  notifyMessengerRoomRealtimeResumed,
  VISIBILITY_CATCHUP_COOLDOWN_MS,
  VISIBILITY_RESTORE_QUIET_MS,
} from "@/lib/community-messenger/room/use-messenger-room-visibility-bus-catchup";

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  vi.useRealTimers();
});

function make() {
  const full = vi.fn(async () => undefined);
  const catchup = vi.fn(async () => undefined);
  const c = createMessengerRoomResumeCatchupController({ runFullResume: full, runCatchUpOnly: catchup });
  return { c, full, catchup };
}

describe("M-7 resume within 900ms is deferred, not dropped", () => {
  it("hidden → visible after 300ms schedules at hiddenAt+900ms", async () => {
    const { c, full } = make();
    c.onHidden();
    vi.advanceTimersByTime(300);
    c.onRoomRealtimeResumed("visibilitychange");
    await flush();
    expect(full).not.toHaveBeenCalled();
    vi.advanceTimersByTime(VISIBILITY_RESTORE_QUIET_MS - 300 - 1);
    await flush();
    expect(full).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await flush();
    expect(full).toHaveBeenCalledTimes(1);
  });

  it("resume after the quiet window runs immediately", async () => {
    const { c, full } = make();
    c.onHidden();
    vi.advanceTimersByTime(2_000);
    c.onRoomRealtimeResumed("app_state_active");
    await flush();
    expect(full).toHaveBeenCalledTimes(1);
  });

  it("resume inside cooldown is deferred to cooldown end (one coalesced timer)", async () => {
    const { c, full } = make();
    c.onRoomRealtimeResumed("pageshow");
    await flush();
    expect(full).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000);
    c.onRoomRealtimeResumed("visibilitychange");
    c.onRoomRealtimeResumed("app_state_active");
    await flush();
    expect(full).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(VISIBILITY_CATCHUP_COOLDOWN_MS - 1_000);
    await flush();
    expect(full).toHaveBeenCalledTimes(2);
  });

  it("hiding again cancels a deferred resume", async () => {
    const { c, full } = make();
    c.onHidden();
    vi.advanceTimersByTime(100);
    c.onRoomRealtimeResumed("visibilitychange");
    c.onHidden();
    vi.advanceTimersByTime(5_000);
    await flush();
    expect(full).not.toHaveBeenCalled();
  });
});

describe("I-2 single-flight with one rerun", () => {
  it("triggers during a running catch-up run exactly once more afterwards", async () => {
    let release!: () => void;
    const full = vi.fn(
      () =>
        new Promise<void>((r) => {
          release = r;
        })
    );
    const catchup = vi.fn(async () => undefined);
    const c = createMessengerRoomResumeCatchupController({ runFullResume: full, runCatchUpOnly: catchup });
    c.onRoomRealtimeResumed("visibilitychange");
    await flush();
    expect(full).toHaveBeenCalledTimes(1);
    c.onRoomRealtimeResumed("resubscribed");
    c.onRoomRealtimeResumed("resubscribed");
    await flush();
    expect(catchup).not.toHaveBeenCalled();
    release();
    await flush();
    expect(catchup).toHaveBeenCalledTimes(1);
    expect(full).toHaveBeenCalledTimes(1);
  });

  it("resubscribed runs catch-up only, without quiet/cooldown", async () => {
    const { c, full, catchup } = make();
    c.onHidden();
    c.onRoomRealtimeResumed("resubscribed");
    await flush();
    expect(catchup).toHaveBeenCalledTimes(1);
    expect(full).not.toHaveBeenCalled();
  });

  it("notify with no listener is a no-op", () => {
    expect(() => notifyMessengerRoomRealtimeResumed("no-room", "resubscribed")).not.toThrow();
  });
});

describe("M-7 Capacitor appStateChange wiring", () => {
  it("hook listens to appStateChange via dynamic import, guarded for web", () => {
    const src = readFileSync(join(process.cwd(), "lib/community-messenger/room/use-messenger-room-visibility-bus-catchup.ts"), "utf8");
    expect(src).toContain('import("@capacitor/app")');
    expect(src).toContain('App.addListener("appStateChange"');
    expect(src).toContain("if (isCapacitorNativePlatform())");
    expect(src).toContain('controller.onRoomRealtimeResumed("app_state_active")');
  });
});
