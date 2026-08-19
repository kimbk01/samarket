import { describe, expect, it } from "vitest";
import { buildTradeHeaderLocationHintParts } from "@/components/trade/TradeHeaderLocationPinButton";

describe("buildTradeHeaderLocationHintParts", () => {
  it("ALL uses user place + 전체 (no fake km)", () => {
    expect(
      buildTradeHeaderLocationHintParts({
        mode: "all",
        cityLabel: null,
        radiusKm: null,
        userPlaceLabel: "Quezon City",
        allLabel: "전체",
        fallbackPlaceLabel: "지역",
      })
    ).toEqual({ place: "Quezon City", suffix: "전체" });
  });

  it("ALL without user place shows 전체 only", () => {
    expect(
      buildTradeHeaderLocationHintParts({
        mode: "all",
        cityLabel: null,
        radiusKm: null,
        userPlaceLabel: null,
        allLabel: "전체",
        fallbackPlaceLabel: "지역",
      })
    ).toEqual({ place: null, suffix: "전체" });
  });

  it("CITY without explicit radius shows 전체 suffix", () => {
    expect(
      buildTradeHeaderLocationHintParts({
        mode: "city",
        cityLabel: "Makati City",
        radiusKm: null,
        userPlaceLabel: "Quezon City",
        allLabel: "전체",
        fallbackPlaceLabel: "지역",
      })
    ).toEqual({ place: "Makati City", suffix: "전체" });
  });

  it("CITY keeps Nkm suffix for untruncated render", () => {
    expect(
      buildTradeHeaderLocationHintParts({
        mode: "city",
        cityLabel: "Makati City",
        radiusKm: 64,
        userPlaceLabel: "Quezon City",
        allLabel: "전체",
        fallbackPlaceLabel: "지역",
      })
    ).toEqual({ place: "Makati City", suffix: "64km" });
  });

  it("UNSET does not show nationwide 전체 as committed", () => {
    expect(
      buildTradeHeaderLocationHintParts({
        mode: "unset",
        cityLabel: null,
        radiusKm: null,
        userPlaceLabel: "Quezon City",
        allLabel: "지역을 확인하는 중…",
        fallbackPlaceLabel: "지역",
      })
    ).toEqual({ place: null, suffix: "지역을 확인하는 중…" });
  });

  it("INVALID uses invalid label, not 전체", () => {
    expect(
      buildTradeHeaderLocationHintParts({
        mode: "invalid",
        cityLabel: null,
        radiusKm: null,
        userPlaceLabel: null,
        allLabel: "전체",
        fallbackPlaceLabel: "지역",
        invalidLabel: "지역을 확인할 수 없습니다",
      })
    ).toEqual({ place: null, suffix: "지역을 확인할 수 없습니다" });
  });
});
