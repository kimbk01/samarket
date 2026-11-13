import { describe, expect, it } from "vitest";
import {
  isTradeListingNew,
  resolveTradeListingAge,
  tradeListingAgeLabel,
} from "@/lib/trade/marketplace/trade-listing-age";

const NOW = Date.parse("2026-11-03T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

describe("trade listing age — 단위 경계(strict, round)", () => {
  it.each([
    [0, "seconds", 1],
    [59 * S, "seconds", 59],
    [60 * S, "minutes", 1],
    [59 * M, "minutes", 59],
    [60 * M, "hours", 1],
    [90 * M, "hours", 2],
    [23 * H + 59 * M, "hours", 24],
    [24 * H, "days", 1],
    [29 * D, "days", 29],
    [30 * D, "months", 1],
    [329 * D, "months", 11],
    [355 * D, "years", 1],
    [365 * D, "years", 1],
    [3 * 365 * D, "years", 3],
  ] as const)("%d ms → %s %d", (ms, unit, count) => {
    expect(resolveTradeListingAge(ago(ms), NOW)).toEqual({ unit, count });
  });

  it("미래 시각은 1초 전", () => {
    expect(resolveTradeListingAge(new Date(NOW + 5 * M).toISOString(), NOW)).toEqual({
      unit: "seconds",
      count: 1,
    });
  });

  it("값이 없거나 잘못되면 표시 없음", () => {
    expect(resolveTradeListingAge(null, NOW)).toBeNull();
    expect(resolveTradeListingAge("not-a-date", NOW)).toBeNull();
    expect(tradeListingAgeLabel(undefined, NOW, () => "x")).toBe("");
  });

  it("날짜로 바꾸지 않고 번역 키 + count 로만 만든다", () => {
    const calls: Array<[string, unknown]> = [];
    const label = tradeListingAgeLabel(ago(400 * D), NOW, (key, vars) => {
      calls.push([key, vars]);
      return `${key}:${String(vars?.count)}`;
    });
    expect(label).toBe("trade_age_years:1");
    expect(calls).toEqual([["trade_age_years", { count: 1 }]]);
  });
});

describe("NEW — 작성 후 24시간", () => {
  it("24시간 안이면 NEW", () => {
    expect(isTradeListingNew(ago(0), NOW)).toBe(true);
    expect(isTradeListingNew(ago(23 * H + 59 * M), NOW)).toBe(true);
  });
  it("24시간부터는 NEW 아님", () => {
    expect(isTradeListingNew(ago(24 * H), NOW)).toBe(false);
    expect(isTradeListingNew(ago(3 * D), NOW)).toBe(false);
  });
  it("값이 없으면 NEW 아님", () => {
    expect(isTradeListingNew(null, NOW)).toBe(false);
  });
});
