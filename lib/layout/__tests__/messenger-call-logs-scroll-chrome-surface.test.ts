import { describe, expect, it } from "vitest";
import { isMessengerCallLogsBottomNavScrollHideSurface } from "@/lib/layout/messenger-call-logs-scroll-chrome-surface";
import { resolveBottomNavScrollHideEnabled } from "@/lib/layout/use-bottom-nav-scroll-hide-behavior";

describe("messenger call logs scroll chrome surface", () => {
  it("enables on hub call_logs section", () => {
    expect(
      isMessengerCallLogsBottomNavScrollHideSurface(
        "/community-messenger",
        "section=call_logs&from=delivery"
      )
    ).toBe(true);
  });

  it("enables on hub friends section", () => {
    expect(isMessengerCallLogsBottomNavScrollHideSurface("/community-messenger", "section=friends")).toBe(
      true
    );
  });

  it("enables on hub chats and archive sections", () => {
    expect(isMessengerCallLogsBottomNavScrollHideSurface("/community-messenger", "section=chats")).toBe(
      true
    );
    expect(
      isMessengerCallLogsBottomNavScrollHideSurface("/community-messenger", "section=archive")
    ).toBe(true);
  });

  it("disables when hub has no section", () => {
    expect(isMessengerCallLogsBottomNavScrollHideSurface("/community-messenger", "")).toBe(false);
  });

  it("enables on sticky room path with section query", () => {
    expect(
      isMessengerCallLogsBottomNavScrollHideSurface(
        "/community-messenger/rooms/abc-123",
        "section=friends"
      )
    ).toBe(true);
  });

  it("enables on dedicated call logs route", () => {
    expect(isMessengerCallLogsBottomNavScrollHideSurface("/community-messenger/calls/logs", "")).toBe(true);
  });

  it("wires into resolveBottomNavScrollHideEnabled", () => {
    expect(
      resolveBottomNavScrollHideEnabled(
        "/community-messenger",
        false,
        "section=call_logs&from=delivery"
      )
    ).toBe(true);
    expect(resolveBottomNavScrollHideEnabled("/community-messenger", false, "section=friends")).toBe(
      true
    );
  });
});
