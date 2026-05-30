import { describe, expect, it } from "vitest";
import {
  isMainBottomNavRiskyNavigation,
  MAIN_BOTTOM_NAV_SAFE_RISKY_STATE,
  probeMainBottomNavRiskyNavigation,
} from "@/lib/navigation/main-bottom-nav-risky-navigation";

describe("main-bottom-nav-risky-navigation", () => {
  it("MAIN_BOTTOM_NAV_SAFE_RISKY_STATE — not risky", () => {
    expect(isMainBottomNavRiskyNavigation(MAIN_BOTTOM_NAV_SAFE_RISKY_STATE)).toBe(false);
  });

  it("probeMainBottomNavRiskyNavigation — open without draft is safe", () => {
    expect(
      probeMainBottomNavRiskyNavigation({
        tradeWriteOpen: true,
        tradeWriteBlocking: false,
      })
    ).toEqual({ writeSheetBlocking: false });
  });

  it("probeMainBottomNavRiskyNavigation — trade write blocking", () => {
    expect(
      probeMainBottomNavRiskyNavigation({
        tradeWriteOpen: true,
        tradeWriteBlocking: true,
      })
    ).toEqual({ writeSheetBlocking: true });
    expect(
      isMainBottomNavRiskyNavigation(
        probeMainBottomNavRiskyNavigation({
          tradeWriteOpen: true,
          tradeWriteBlocking: true,
        })
      )
    ).toBe(true);
  });

  it("probeMainBottomNavRiskyNavigation — philife write blocking", () => {
    expect(
      probeMainBottomNavRiskyNavigation({
        philifeWriteOpen: true,
        philifeWriteBlocking: true,
      })
    ).toEqual({ writeSheetBlocking: true });
  });
});
