import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRESENCE_HEARTBEAT_IDLE_IN_ROOM_MS,
  PRESENCE_HEARTBEAT_IDLE_OUTSIDE_ROOM_MS,
  isPresenceHeartbeatIdle,
} from "@/lib/community-messenger/realtime/presence/presence-heartbeat-idle";

/**
 * F1 (Owner 승인 2026-11-19) — 켜 두기만 한 기기의 12초 DB 하트비트 정지.
 * 근거: docs/audit/supabase-request-surge-2026-11-18/f1-presence-idle-heartbeat-design-2026-11-19.md
 */
describe("F1 presence heartbeat idle", () => {
  const t0 = 1_800_000_000_000;

  it("limits: outside room 5 min, in room 30 min", () => {
    expect(PRESENCE_HEARTBEAT_IDLE_OUTSIDE_ROOM_MS).toBe(5 * 60_000);
    expect(PRESENCE_HEARTBEAT_IDLE_IN_ROOM_MS).toBe(30 * 60_000);
  });

  it("outside room: active just under 5 min, idle at 5 min", () => {
    expect(
      isPresenceHeartbeatIdle({ nowMs: t0 + 5 * 60_000 - 1, lastActivityMs: t0, inRoom: false })
    ).toBe(false);
    expect(isPresenceHeartbeatIdle({ nowMs: t0 + 5 * 60_000, lastActivityMs: t0, inRoom: false })).toBe(true);
  });

  it("in room: 5 min of no touch is still active (reading), idle at 30 min", () => {
    expect(isPresenceHeartbeatIdle({ nowMs: t0 + 10 * 60_000, lastActivityMs: t0, inRoom: true })).toBe(false);
    expect(isPresenceHeartbeatIdle({ nowMs: t0 + 30 * 60_000, lastActivityMs: t0, inRoom: true })).toBe(true);
  });

  it("unknown activity time never pauses", () => {
    expect(isPresenceHeartbeatIdle({ nowMs: t0, lastActivityMs: 0, inRoom: false })).toBe(false);
    expect(isPresenceHeartbeatIdle({ nowMs: t0, lastActivityMs: Number.NaN, inRoom: false })).toBe(false);
  });

  describe("runtime wiring contract", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/realtime/presence/use-community-messenger-presence-runtime.ts"),
      "utf8"
    );

    it("keeps 12s cadence for active users (push suppression freshness 15s)", () => {
      expect(src).toMatch(/const HEARTBEAT_MS = 12_000/);
    });

    it("schedule and timer both stop when idle", () => {
      const at = src.indexOf("const scheduleHeartbeat = () =>");
      const body = src.slice(at, at + 1200);
      expect(body.match(/presenceHeartbeatIdleNow\(\)/g)?.length).toBeGreaterThanOrEqual(2);
      expect(body).toContain("heartbeatIdlePaused = true");
    });

    it("foreground HTTP heartbeat is skipped while idle, background/session-end still sent", () => {
      const at = src.indexOf("function postPresenceHeartbeatHttp");
      const body = src.slice(at, at + 900);
      expect(body).toContain('appVisibility === "foreground" && presenceHeartbeatIdleNow()');
    });

    it("any activity resumes immediately (no 20s throttle while paused)", () => {
      const at = src.indexOf("function maybeRecordThrottledActivity");
      const body = src.slice(at, at + 500);
      const pausedBranch = body.indexOf("if (heartbeatIdlePaused)");
      const throttle = body.indexOf("ACTIVITY_THROTTLE_MS");
      expect(pausedBranch).toBeGreaterThan(0);
      expect(pausedBranch).toBeLessThan(throttle);
      expect(body).toContain("resumePresenceHeartbeatFromIdle?.()");
      const bump = src.slice(src.indexOf("export function bumpCommunityMessengerPresenceActivity"));
      expect(bump.slice(0, 300)).toContain("resumePresenceHeartbeatFromIdle?.()");
    });

    it("resume sends once and re-arms the 12s timer", () => {
      const at = src.indexOf("resumePresenceHeartbeatFromIdle = () =>");
      const body = src.slice(at, at + 300);
      expect(body).toContain("void syncOwnState()");
      expect(body).toContain("scheduleHeartbeat()");
    });

    it("inner scroll containers count as activity (capture listener, removed on cleanup)", () => {
      expect(src).toContain('document.addEventListener("scroll", onActivity, { capture: true, passive: true })');
      expect(src).toContain('document.removeEventListener("scroll", onActivity, true)');
      expect(src).not.toContain('window.addEventListener("scroll", onActivity');
    });
  });
});
