import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R2 — ClientPresenceRateLimitReached: duplicate Realtime track coalescing contract.
 * Does not change HEARTBEAT_MS; only requires min-gap + fingerprint skip + cleanup untrack order.
 */
describe("cm presence track dedupe contract (R2)", () => {
  const src = readFileSync(
    join(
      process.cwd(),
      "lib/community-messenger/realtime/presence/use-community-messenger-presence-runtime.ts"
    ),
    "utf8"
  );

  it("throttles identical Realtime track without raising HEARTBEAT_MS; state change still sends", () => {
    expect(src).toMatch(/const HEARTBEAT_MS = 12_000/);
    expect(src).toMatch(/PRESENCE_TRACK_MIN_GAP_MS = 10_000/);
    expect(src).toContain("lastPresenceTrackFingerprint");
    expect(src).toContain("identical && withinGap");
    expect(src).toContain("동일 상태 중복 track 만 억제");
    expect(src).not.toMatch(/상태 변경도 2s/);
  });

  it("untracks on cleanup before clearing subscribe flag (no dead untrack)", () => {
    const cleanupAt = src.indexOf("presenceCleanup = () =>");
    expect(cleanupAt).toBeGreaterThan(0);
    const window = src.slice(cleanupAt, cleanupAt + 900);
    expect(window).toContain("const wasSubscribed = channelSubscribed");
    expect(window).toContain("if (wasSubscribed && ch)");
    expect(window).toContain("ch.untrack()");
    const falseBeforeUntrack =
      window.indexOf("channelSubscribed = false") < window.indexOf("const wasSubscribed");
    expect(falseBeforeUntrack).toBe(false);
  });
});
