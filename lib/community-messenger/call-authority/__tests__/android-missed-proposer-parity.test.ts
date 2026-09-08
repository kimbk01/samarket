import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const voice = () =>
  readFileSync(
    join(ROOT, "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallRuntime.java"),
    "utf8",
  );
const video = () =>
  readFileSync(
    join(ROOT, "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java"),
    "utf8",
  );

describe("CUT7 Android missed proposer canonical boundary (source)", () => {
  it("A1–A5: propose before cleanup; early reject retries; accept cleans", () => {
    for (const src of [voice(), video()]) {
      expect(src).toContain("missed_propose");
      expect(src).toContain("ring_deadline_not_reached");
      expect(src).toContain("keep_presentation=1");
      expect(src).toContain("missed_early_rejected");
      expect(src).toContain("scheduleMissedRetry");
      expect(src).toContain("missed_retry_scheduled");
      expect(src).toContain("missed_canonical_accepted");
      expect(src).toContain("MISSED_RETRY_DELAY_MS");
      expect(src).toContain("MISSED_RETRY_MAX_ATTEMPTS");
    }
  });

  it("A3: early reject must not call cleanup before accept", () => {
    const v = voice();
    const propose = v.slice(v.indexOf("private static void proposeMissed"), v.indexOf("private static void handleMissedProposeResult"));
    expect(propose).not.toContain("cleanup(");
    const handle = v.slice(
      v.indexOf("private static void handleMissedProposeResult"),
      v.indexOf("private static void scheduleMissedRetry"),
    );
    expect(handle).toContain('cleanup(app, sid, "missed")');
    expect(handle.indexOf("ring_deadline_not_reached")).toBeLessThan(handle.indexOf('cleanup(app, sid, "missed")'));
  });

  it("A8/A9: Voice and Video share proposer semantics", () => {
    expect(voice()).toContain("proposeMissed");
    expect(video()).toContain("proposeMissed");
    expect(voice()).toContain('proposeMissed(context, callId, "local_timer")');
    expect(video()).toContain('proposeMissed(context, callId, "local_timer")');
  });

  it("does not hardcode admin timeout as terminal authority", () => {
    // Timer may remain 30s as UX propose timing; must retry rather than treat as truth.
    expect(voice()).toContain("MISSED_TIMEOUT_MS = 30_000L");
    expect(voice()).toContain("scheduleMissedRetry");
    expect(video()).toContain("MISSED_TIMEOUT_MS = 30_000L");
    expect(video()).toContain("scheduleMissedRetry");
  });
});
