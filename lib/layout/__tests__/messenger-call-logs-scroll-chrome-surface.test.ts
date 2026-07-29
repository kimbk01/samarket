import { describe, expect, it } from "vitest";
import {
  isMessengerBottomNavScrollHideSurface,
  isMessengerCallLogsBottomNavScrollHideSurface,
} from "@/lib/layout/messenger-call-logs-scroll-chrome-surface";
import { resolveBottomNavScrollHideEnabled } from "@/lib/layout/use-bottom-nav-scroll-hide-behavior";

describe("messenger bottom-nav scroll hide surface", () => {
  it("enables on hub regardless of section query", () => {
    expect(isMessengerBottomNavScrollHideSurface("/community-messenger", "")).toBe(true);
    expect(isMessengerBottomNavScrollHideSurface("/community-messenger", "section=chats")).toBe(true);
    expect(isMessengerBottomNavScrollHideSurface("/community-messenger", "section=friends")).toBe(true);
  });

  it("enables on trade/delivery list hubs", () => {
    expect(isMessengerBottomNavScrollHideSurface("/community-messenger/trade-chats", "")).toBe(true);
    expect(isMessengerBottomNavScrollHideSurface("/community-messenger/delivery-chats", "")).toBe(true);
  });

  it("enables on room path without requiring section", () => {
    expect(isMessengerBottomNavScrollHideSurface("/community-messenger/rooms/abc-123", "")).toBe(true);
    expect(
      isMessengerBottomNavScrollHideSurface("/community-messenger/rooms/abc-123", "section=chats")
    ).toBe(true);
  });

  it("enables on dedicated call logs route", () => {
    expect(isMessengerCallLogsBottomNavScrollHideSurface("/community-messenger/calls/logs", "")).toBe(
      true
    );
  });

  it("wires into resolveBottomNavScrollHideEnabled", () => {
    expect(resolveBottomNavScrollHideEnabled("/community-messenger", false, "")).toBe(true);
    expect(resolveBottomNavScrollHideEnabled("/community-messenger/trade-chats", false, "")).toBe(true);
    expect(resolveBottomNavScrollHideEnabled("/community-messenger/rooms/r1", false, "")).toBe(true);
  });
});
