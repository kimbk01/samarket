import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateMissedTransitionGate,
  isRingingMissedDeadlineReached,
  resolveCanonicalRingTimeoutSeconds,
  resolveRingDeadlineMs,
  CALL_MISSED_DEADLINE_CONFIG_OWNER,
  CALL_MISSED_RING_START_COLUMN,
} from "@/lib/community-messenger/call-authority/call-missed-deadline-authority";
import { DEFAULT_INCOMING_RING_TIMEOUT_SECONDS } from "@/lib/community-messenger/messenger-call-ring-timeout";

const ROOT = join(__dirname, "../../../..");

function isoAgo(now: number, ms: number): string {
  return new Date(now - ms).toISOString();
}

describe("CUT2 missed deadline authority", () => {
  const timeoutSec = 30;
  const now = Date.now();

  it("exports config owners", () => {
    expect(CALL_MISSED_RING_START_COLUMN).toBe("started_at");
    expect(CALL_MISSED_DEADLINE_CONFIG_OWNER).toContain("incoming_ring_timeout_seconds");
    expect(resolveCanonicalRingTimeoutSeconds({ incoming_ring_timeout_seconds: 30 })).toBe(30);
    expect(DEFAULT_INCOMING_RING_TIMEOUT_SECONDS).toBe(30);
  });

  // M1
  it("M1 ringing deadline future → NOT MISSED", () => {
    const startedAt = isoAgo(now, 5_000);
    expect(isRingingMissedDeadlineReached(startedAt, timeoutSec, now)).toBe(false);
    expect(
      evaluateMissedTransitionGate({
        status: "ringing",
        startedAt,
        ringTimeoutSeconds: timeoutSec,
        nowMs: now,
      }),
    ).toEqual({ ok: false, error: "ring_deadline_not_reached" });
  });

  // M2
  it("M2 ringing deadline expired → MISSED ok", () => {
    const startedAt = isoAgo(now, 30_000);
    expect(isRingingMissedDeadlineReached(startedAt, timeoutSec, now)).toBe(true);
    expect(
      evaluateMissedTransitionGate({
        status: "ringing",
        startedAt,
        ringTimeoutSeconds: timeoutSec,
        nowMs: now,
      }),
    ).toEqual({ ok: true });
  });

  // M3
  it("M3 active + deadline expired → NOT MISSED", () => {
    expect(
      evaluateMissedTransitionGate({
        status: "active",
        startedAt: isoAgo(now, 60_000),
        answeredAt: isoAgo(now, 40_000),
        ringTimeoutSeconds: timeoutSec,
        nowMs: now,
      }),
    ).toEqual({ ok: false, error: "bad_action" });
  });

  // M4–M6
  it.each(["rejected", "cancelled", "ended"] as const)(
    "M4-6 %s + deadline expired → no overwrite (bad_action)",
    (status) => {
      expect(
        evaluateMissedTransitionGate({
          status,
          startedAt: isoAgo(now, 60_000),
          endedAt: isoAgo(now, 1_000),
          ringTimeoutSeconds: timeoutSec,
          nowMs: now,
        }),
      ).toEqual({ ok: false, error: "bad_action" });
    },
  );

  // M7
  it("M7 answered_device_id / answered_at → NOT MISSED", () => {
    expect(
      evaluateMissedTransitionGate({
        status: "ringing",
        startedAt: isoAgo(now, 60_000),
        answeredDeviceId: "device-a",
        ringTimeoutSeconds: timeoutSec,
        nowMs: now,
      }),
    ).toEqual({ ok: false, error: "already_answered" });
    expect(
      evaluateMissedTransitionGate({
        status: "ringing",
        startedAt: isoAgo(now, 60_000),
        answeredAt: isoAgo(now, 1_000),
        ringTimeoutSeconds: timeoutSec,
        nowMs: now,
      }),
    ).toEqual({ ok: false, error: "already_answered" });
  });

  // M8
  it("M8 repeated MISSED → idempotent", () => {
    expect(
      evaluateMissedTransitionGate({
        status: "missed",
        startedAt: isoAgo(now, 60_000),
        endedAt: isoAgo(now, 1_000),
        ringTimeoutSeconds: timeoutSec,
        nowMs: now,
      }),
    ).toEqual({ ok: false, error: "idempotent_missed", idempotent: true });
  });

  it("deadline ms uses started_at + timeout", () => {
    const startedAt = "2026-09-07T00:00:00.000Z";
    const deadline = resolveRingDeadlineMs(startedAt, 30);
    expect(deadline).toBe(Date.parse(startedAt) + 30_000);
  });
});

describe("CUT2 server missed writer contracts", () => {
  it("updateCommunityMessengerCallSession gates missed via deadline authority", () => {
    const service = readFileSync(join(ROOT, "lib/community-messenger/service.ts"), "utf8");
    expect(service).toContain("evaluateMissedTransitionGate");
    expect(service).toContain("missedGate.error");
    expect(service).toContain('action: "missed"');
    // reconcile expired ringing must not cancel
    expect(service).toContain('status === "ringing" ? "missed" : "end"');
    expect(service).not.toMatch(
      /status === "ringing"\s*\?\s*messengerUserIdsEqual\(row\.initiator_user_id[\s\S]*\?\s*"cancel"/,
    );
  });

  it("stale-cleanup cron expires ringing via cleanupExpiredRinging…", () => {
    const route = readFileSync(
      join(ROOT, "app/api/community-messenger/calls/sessions/stale-cleanup/route.ts"),
      "utf8",
    );
    expect(route).toContain("cleanupExpiredRingingCommunityMessengerCallSessions");
    expect(route).toContain("cleanupStaleActiveCommunityMessengerCallSessions");
    const cleanup = readFileSync(join(ROOT, "lib/community-messenger/call-stale-ringing-cleanup.ts"), "utf8");
    expect(cleanup).toContain('action: "missed"');
    expect(cleanup).toContain("isCanonicalRingingExpiredForMissed");
    expect(cleanup).not.toMatch(/action:\s*"cancel"/);
  });

  it("client native timers remain proposers only (no native change in CUT2)", () => {
    const androidVoice = readFileSync(
      join(ROOT, "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallRuntime.java"),
      "utf8",
    );
    expect(androidVoice).toContain("MISSED_TIMEOUT_MS");
    expect(androidVoice).toContain("missedAsync");
    const iosVideo = readFileSync(
      join(ROOT, "ios/App/App/Call/Video/NativeVideoCallRuntime.swift"),
      "utf8",
    );
    expect(iosVideo).toContain("scheduleMissedLocked");
    const iosVoice = readFileSync(join(ROOT, "ios/App/App/Call/NativeVoiceCallRuntime.swift"), "utf8");
    expect(iosVoice).not.toContain("scheduleMissed");
  });
});
