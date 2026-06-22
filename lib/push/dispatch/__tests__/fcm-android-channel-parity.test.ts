import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveNotificationSoundProfile } from "@/lib/notifications/policy/notification-sound-profiles";

function readJava(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("fcm android channel parity", () => {
  it("maps TS P0 categories to channel ids also declared in FcmPayloadResolver", () => {
    const java = readJava("android/app/src/main/java/com/dibay/app/FcmPayloadResolver.java");
    const pairs: Array<[string, string]> = [
      ["chat_message", resolveNotificationSoundProfile("chat_message").androidChannelId],
      ["admin_marketing_banner", resolveNotificationSoundProfile("admin_marketing_banner").androidChannelId],
      ["order_status", resolveNotificationSoundProfile("order_status").androidChannelId],
      ["missed_call", resolveNotificationSoundProfile("missed_call").androidChannelId],
    ];
    for (const [category, channelId] of pairs) {
      expect(java).toContain('case "' + category + '":');
      expect(java).toContain('return "' + channelId + '"');
    }
  });

  it("posts tray notifications with resolver channel id in DibayFirebaseMessagingService", () => {
    const java = readJava("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
    expect(java).toContain("FcmPayloadResolver.resolveNotificationChannelId(data)");
    expect(java).toContain("new NotificationCompat.Builder(this, channelId)");
    expect(java).toContain('"dibay_marketing"');
    expect(java).toContain('"dibay_orders"');
  });
});
