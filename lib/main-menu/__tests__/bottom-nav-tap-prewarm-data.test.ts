import { describe, expect, it } from "vitest";
import { shouldDeferMessengerPrewarmOnDeliverySurface } from "@/lib/main-menu/bottom-nav-tap-prewarm-data";

describe("shouldDeferMessengerPrewarmOnDeliverySurface", () => {
  it("defers ambient messenger prewarm on /stores", () => {
    expect(shouldDeferMessengerPrewarmOnDeliverySurface("/stores", "pointer_intent")).toBe(true);
    expect(shouldDeferMessengerPrewarmOnDeliverySurface("/stores/browse", "idle")).toBe(true);
  });

  it("allows messenger prewarm after tab route commit on /stores", () => {
    expect(shouldDeferMessengerPrewarmOnDeliverySurface("/stores", "route_commit")).toBe(false);
  });

  it("does not defer on trade or messenger surfaces", () => {
    expect(shouldDeferMessengerPrewarmOnDeliverySurface("/market", "pointer_intent")).toBe(false);
    expect(shouldDeferMessengerPrewarmOnDeliverySurface("/community-messenger", "pointer_intent")).toBe(
      false
    );
  });
});
