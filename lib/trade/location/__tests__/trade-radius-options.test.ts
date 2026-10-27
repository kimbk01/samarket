import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRADE_RADIUS_OPTIONS_KM,
  normalizeTradeDefaultRadiusKm,
  normalizeTradeRadiusOptionsKm,
  snapTradeRadiusKm,
} from "@/lib/trade/location/trade-radius-options";
import { DEFAULT_APP_SETTINGS } from "@/lib/admin-settings/admin-settings-utils";

/** 거래 D (Owner 2026-10-28) — 반경 10·20·40·전체, 어드민 지정 */
describe("trade radius options", () => {
  it("초깃값은 10·20·40, 기본 반경은 「전체」(null)", () => {
    expect([...DEFAULT_TRADE_RADIUS_OPTIONS_KM]).toEqual([10, 20, 40]);
    expect(DEFAULT_APP_SETTINGS.tradeRadiusOptionsKm).toEqual([10, 20, 40]);
    expect(DEFAULT_APP_SETTINGS.tradeDefaultRadiusKm).toBeNull();
  });

  it("어드민 값 정리 — 오름차순·중복 제거·범위 밖 제거·비면 초깃값", () => {
    expect(normalizeTradeRadiusOptionsKm([40, "10", 10, 0, 999, "x"])).toEqual([10, 40]);
    expect(normalizeTradeRadiusOptionsKm([])).toEqual([10, 20, 40]);
    expect(normalizeTradeRadiusOptionsKm(undefined)).toEqual([10, 20, 40]);
  });

  it("옛 반경은 가장 가까운 선택지로(같은 거리면 작은 값)", () => {
    expect(snapTradeRadiusKm(5, [10, 20, 40])).toBe(10);
    expect(snapTradeRadiusKm(32, [10, 20, 40])).toBe(40);
    expect(snapTradeRadiusKm(30, [10, 20, 40])).toBe(20);
    expect(snapTradeRadiusKm(160, [10, 20, 40])).toBe(40);
  });

  it("기본 반경은 선택지에 있을 때만", () => {
    expect(normalizeTradeDefaultRadiusKm(20, [10, 20, 40])).toBe(20);
    expect(normalizeTradeDefaultRadiusKm(25, [10, 20, 40])).toBeNull();
    expect(normalizeTradeDefaultRadiusKm(null, [10, 20, 40])).toBeNull();
  });
});
