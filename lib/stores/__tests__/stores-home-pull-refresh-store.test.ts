import { describe, expect, it } from "vitest";
import {
  computeStoresHomePullPxFromTouchDy,
  resolveStoresHomePullRefreshSlotPx,
  STORES_HOME_PULL_REFRESH_MAX_PX,
  STORES_HOME_PULL_REFRESH_THRESHOLD_PX,
} from "@/lib/stores/stores-home-pull-refresh-store";

describe("stores-home pull refresh thresholds", () => {
  it("requires 20% more pullPx than legacy 48px baseline", () => {
    expect(STORES_HOME_PULL_REFRESH_THRESHOLD_PX).toBe(Math.round(48 * 1.2));
  });

  it("allows 20% more header expansion than legacy 88px cap", () => {
    expect(STORES_HOME_PULL_REFRESH_MAX_PX).toBe(Math.round(88 * 1.2));
  });

  it("uses rubber-band pull curve under max", () => {
    const atMax = computeStoresHomePullPxFromTouchDy(400);
    expect(atMax).toBeLessThanOrEqual(STORES_HOME_PULL_REFRESH_MAX_PX);
    expect(atMax).toBeGreaterThan(STORES_HOME_PULL_REFRESH_THRESHOLD_PX);
  });

  it("keeps refresh slot at least threshold after release", () => {
    expect(resolveStoresHomePullRefreshSlotPx(30)).toBeGreaterThanOrEqual(
      STORES_HOME_PULL_REFRESH_THRESHOLD_PX
    );
  });
});
