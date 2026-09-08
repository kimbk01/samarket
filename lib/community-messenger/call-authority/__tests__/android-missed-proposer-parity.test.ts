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
  it("Voice missed uses beginLocalTerminal immediate cleanup", () => {
    const v = voice();
    expect(v).toContain('beginLocalTerminal(context, callId, "missed")');
    expect(v).not.toContain("proposeMissed");
    expect(v).not.toContain("scheduleMissedRetry");
    expect(v).not.toContain("ring_deadline_not_reached");
  });

  it("Video missed uses terminalPatch (NORMAL)", () => {
    const v = video();
    expect(v).toContain('terminalPatch(context, callId, "missed")');
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
