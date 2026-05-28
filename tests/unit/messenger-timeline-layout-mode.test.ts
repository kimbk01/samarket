import { describe, expect, it } from "vitest";
import { resolveUseDirectMessengerTimelineLayout } from "@/lib/community-messenger/room/messenger-timeline-layout-mode";

describe("resolveUseDirectMessengerTimelineLayout", () => {
  it("forces direct layout for store order dock when hydrated with messages", () => {
    expect(
      resolveUseDirectMessengerTimelineLayout({
        hydrationPass: 3,
        displayMessageCount: 2,
        hasStoreOrderDock: true,
        virtualizerHasMeasuredRange: true,
      })
    ).toBe(true);
  });

  it("uses direct layout before virtualizer measures (no fallback absolute)", () => {
    expect(
      resolveUseDirectMessengerTimelineLayout({
        hydrationPass: 2,
        displayMessageCount: 5,
        hasStoreOrderDock: false,
        virtualizerHasMeasuredRange: false,
      })
    ).toBe(true);
  });

  it("uses virtualized layout when virtualizer measured and not store order", () => {
    expect(
      resolveUseDirectMessengerTimelineLayout({
        hydrationPass: 3,
        displayMessageCount: 20,
        hasStoreOrderDock: false,
        virtualizerHasMeasuredRange: true,
      })
    ).toBe(false);
  });

  it("uses seed message count when display list is still empty", () => {
    expect(
      resolveUseDirectMessengerTimelineLayout({
        hydrationPass: 2,
        displayMessageCount: 0,
        seedMessageCount: 4,
        hasStoreOrderDock: false,
        virtualizerHasMeasuredRange: false,
      })
    ).toBe(true);
  });

  it("does not direct-layout empty or pre-hydration timeline", () => {
    expect(
      resolveUseDirectMessengerTimelineLayout({
        hydrationPass: 1,
        displayMessageCount: 3,
        hasStoreOrderDock: true,
        virtualizerHasMeasuredRange: false,
      })
    ).toBe(false);
    expect(
      resolveUseDirectMessengerTimelineLayout({
        hydrationPass: 3,
        displayMessageCount: 0,
        hasStoreOrderDock: true,
        virtualizerHasMeasuredRange: false,
      })
    ).toBe(false);
  });
});
