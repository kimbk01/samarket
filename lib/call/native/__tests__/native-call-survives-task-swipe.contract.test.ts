import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Product rule (Owner): a live 1:1 call ends ONLY by an explicit end action. Swiping the app away
 * (recents) must keep the call alive (PiP / foreground service) — native call services must never
 * end the session from onTaskRemoved.
 */
const root = path.resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("native call survives task swipe", () => {
  for (const file of [
    "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallService.java",
    "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallService.java",
  ]) {
    it(`${path.basename(file)} does not end the call on task removal`, () => {
      expect(read(file)).not.toContain("onTaskRemoved");
    });
  }

  it("native runtimes expose no task-removed end path", () => {
    for (const file of [
      "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java",
      "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallRuntime.java",
    ]) {
      expect(read(file)).not.toContain("SOURCE_TASK_REMOVED");
    }
  });
});
