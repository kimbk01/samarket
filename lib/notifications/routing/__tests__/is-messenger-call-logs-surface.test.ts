import { describe, expect, it } from "vitest";
import { isMessengerCallLogsSurface } from "@/lib/notifications/routing/is-messenger-call-logs-surface";

describe("isMessengerCallLogsSurface", () => {
  it("matches home call_logs section", () => {
    expect(isMessengerCallLogsSurface("/community-messenger", "call_logs")).toBe(true);
    expect(isMessengerCallLogsSurface("/community-messenger", "chats")).toBe(false);
  });

  it("matches dedicated call logs route", () => {
    expect(isMessengerCallLogsSurface("/community-messenger/calls/logs", null)).toBe(true);
  });

  it("does not match trade-chats", () => {
    expect(isMessengerCallLogsSurface("/community-messenger/trade-chats", null)).toBe(false);
  });
});
