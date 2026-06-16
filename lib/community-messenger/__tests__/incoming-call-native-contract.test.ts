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

  it("native pending route consumption is logged", () => {
    const src = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(src).toContain("pending_route_consumed");
  });

  it("notification accept activity open is logged", () => {
    const src = read("android/app/src/main/java/com/dibay/app/IncomingCallActivity.java");
    expect(src).toContain("notification_accept_activity_open");
  });

  it("native plugin exposes markCallConsumed for Web consumed bridge", () => {
    const plugin = read("android/app/src/main/java/com/dibay/app/NativeIncomingCallPlugin.java");
    expect(plugin).toContain("markCallConsumed");
    expect(plugin).toContain("DibayCallConsumedStore.mark");
    const store = read("android/app/src/main/java/com/dibay/app/DibayCallConsumedStore.java");
    expect(store).toContain("isConsumed");
  });
});

