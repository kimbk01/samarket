import { describe, expect, it } from "vitest";
import {
  isStoreDetailReadyToReveal,
  resolveStoreDetailReadyPhase,
} from "@/lib/dibay/store-detail-ready-authority";

describe("store-detail-ready-authority", () => {
  it("general detail ready when shell+menus", () => {
    expect(
      resolveStoreDetailReadyPhase({
        shellReady: true,
        menusReady: true,
        focusRequired: false,
        focusTargetReady: false,
      })
    ).toBe("ready_to_reveal");
  });

  it("focus detail requires focusTargetReady", () => {
    expect(
      resolveStoreDetailReadyPhase({
        shellReady: true,
        menusReady: true,
        focusRequired: true,
        focusTargetReady: false,
      })
    ).toBe("boot");
    expect(
      isStoreDetailReadyToReveal({
        shellReady: true,
        menusReady: true,
        focusRequired: true,
        focusTargetReady: true,
      })
    ).toBe(true);
  });

  it("stays revealed once previously revealed", () => {
    expect(
      resolveStoreDetailReadyPhase(
        {
          shellReady: false,
          menusReady: false,
          focusRequired: true,
          focusTargetReady: false,
        },
        true
      )
    ).toBe("revealed");
  });
});
