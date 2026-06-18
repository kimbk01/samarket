import { describe, expect, it, beforeEach } from "vitest";
import {
  resetNotificationDedupeForTests,
  shouldSkipPushForEventDedupe,
  shouldSkipSoundForRoomMessage,
} from "@/lib/notifications/core/notification-dedupe";

describe("notification-dedupe", () => {
  beforeEach(() => {
    resetNotificationDedupeForTests();
  });

  it("dedupes notification event id within 10s", () => {
    expect(shouldSkipPushForEventDedupe("evt-1")).toBe(false);
    expect(shouldSkipPushForEventDedupe("evt-1")).toBe(true);
  });

  it("dedupes room+message within 10s", () => {
    expect(shouldSkipSoundForRoomMessage("room-a", "msg-1")).toBe(false);
    expect(shouldSkipSoundForRoomMessage("room-a", "msg-1")).toBe(true);
    expect(shouldSkipSoundForRoomMessage("room-a", "msg-2")).toBe(false);
  });
});
