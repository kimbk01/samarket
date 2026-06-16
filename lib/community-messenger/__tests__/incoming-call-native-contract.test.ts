import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8");
}

describe("incoming-call native contract", () => {
  it("notification accept uses Activity trampoline (not BroadcastReceiver)", () => {
    const src = read("android/app/src/main/java/com/dibay/app/IncomingCallNotificationBuilder.java");
    expect(src).toContain("PendingIntent.getActivity");
    expect(src).toContain("IncomingCallActivity.ACTION_ACCEPT");
  });

  it("IncomingCallDeclineReceiver does not handle accept", () => {
    const src = read("android/app/src/main/java/com/dibay/app/IncomingCallDeclineReceiver.java");
    expect(src).not.toContain("ACTION_ACCEPT");
    expect(src).not.toContain("INCOMING_CALL_NOTIFICATION_ACCEPT");
    expect(src).toContain("ACTION_DECLINE");
    expect(src).toContain("handleReject");
  });
});

