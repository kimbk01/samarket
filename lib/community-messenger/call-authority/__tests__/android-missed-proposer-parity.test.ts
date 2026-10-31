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

describe("NORMAL Android missed dismiss (source)", () => {
  it("Voice missed uses terminalPatch → cleanup (H1 twin / Wave-1 R1)", () => {
    const v = voice();
    // call-termination-authority-audit §2-2: local missed timer → 종료 판단(NO_ANSWER_LOCAL_TIMER) → terminalPatch.
    expect(v).toContain('terminalPatch(context, callId, "missed", null, CallTerminationPolicy.Cause.NO_ANSWER_LOCAL_TIMER');
    expect(v).not.toContain("beginLocalTerminal");
    expect(v).not.toContain("proposeMissed");
    expect(v).not.toContain("scheduleMissedRetry");
    expect(v).not.toContain("ring_deadline_not_reached");
  });

  it("Video missed uses terminalPatch (NORMAL)", () => {
    const v = video();
    expect(v).toContain('terminalPatch(context, callId, "missed", CallTerminationPolicy.Cause.NO_ANSWER_LOCAL_TIMER');
    expect(v).not.toContain("proposeMissed");
    expect(v).not.toContain("scheduleMissedRetry");
  });

  it("no TerminalLifecycle phase machine / no Voice outgoing observer", () => {
    expect(voice()).not.toContain("NativeCallTerminalLifecycle");
    expect(video()).not.toContain("NativeCallTerminalLifecycle");
    expect(voice()).not.toContain("startOutgoingTerminalObserver");
    expect(video()).not.toContain("startOutgoingTerminalObserver");
  });
});
