import { describe, expect, it } from "vitest";
import {
  buildTradeListLocationParams,
  decodeTradeListCursor,
  encodeTradeListCursor,
} from "@/lib/trade/marketplace/list-contract/trade-list-page.server";
import { resolveTradeFeedLocationConstraint } from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import { resolveListLocationPlan } from "@/lib/trade/marketplace/list-contract/list-location-blocks";

const QUEZON = "1381300000";

describe("trade_list_page 지역 맵 (재설계 4-3)", () => {
  it("기준 위치 없음(전국) — 한 구간, 맵 비어 있음", () => {
    const p = buildTradeListLocationParams({ lguCityId: null, radiusKm: null, hood: null, withDistance: false });
    expect(p.loc_default).toBe(0);
    expect(p.loc_parts).toEqual([""]);
    expect(Object.keys(p.loc_lgu)).toHaveLength(0);
    expect(p.loc_hood).toBeNull();
  });

  it("기준 시 · 거리 전체 — 시 → 주변 → 그 외, 맵의 구간이 앱 분류와 같다", () => {
    const p = buildTradeListLocationParams({ lguCityId: QUEZON, radiusKm: null, hood: null, withDistance: false });
    const plan = resolveListLocationPlan(resolveTradeFeedLocationConstraint(QUEZON, null), null);
    expect(p.loc_parts).toEqual(plan.blocks.map((b) => (b.part ? `loc:${b.part}` : "")));
    expect(p.loc_default).toBe(plan.blocks.length - 1);
    expect(p.loc_lgu[QUEZON]?.[0]).toBe(0);
    for (const [id, [tier]] of Object.entries(p.loc_lgu)) {
      expect(tier).toBe(plan.blockOf({ trade_lgu_id: id, region: null, city: null }));
      expect(tier).toBeLessThan(p.loc_default);
    }
  });

  it("내 동네 — 기준 시 구간 안에서 동네가 같으면 앞 구간", () => {
    const hood = { regionId: "quezon", cityId: "q30" };
    const p = buildTradeListLocationParams({ lguCityId: QUEZON, radiusKm: null, hood, withDistance: false });
    expect(p.loc_hood).toEqual({ r: "quezon", c: "q30", from: 1, to: 0 });
    expect(p.loc_lgu[QUEZON]?.[0]).toBe(1);
    expect(p.loc_parts[0]).toBe("");
    expect(p.loc_parts[1]).toBe("loc:city");
  });

  it("거리순 — 모든 시에 km, 기준 시는 0", () => {
    const p = buildTradeListLocationParams({ lguCityId: QUEZON, radiusKm: null, hood: null, withDistance: true });
    expect(Object.keys(p.loc_lgu).length).toBeGreaterThan(1000);
    expect(p.loc_lgu[QUEZON]?.[1]).toBe(0);
  });

  it("반경 지정 — 반경 안 → 주변 → 그 외", () => {
    const p = buildTradeListLocationParams({ lguCityId: QUEZON, radiusKm: 5, hood: null, withDistance: false });
    expect(p.loc_lgu[QUEZON]?.[0]).toBe(0);
    expect(p.loc_hood).toBeNull();
  });
});

describe("trade_list_page cursor", () => {
  it("키를 그대로 왕복한다(실수 포함)", () => {
    const key = [0, 2, 0, 1, 1, 3, -1793106026.053, 0, "577bab28-0000-0000-0000-000000000000"];
    expect(decodeTradeListCursor(encodeTradeListCursor(key))).toEqual(key);
  });

  it("잘못된 값은 null(첫 페이지처럼)", () => {
    expect(decodeTradeListCursor("")).toBeNull();
    expect(decodeTradeListCursor("not-base64-json")).toBeNull();
    expect(decodeTradeListCursor(encodeTradeListCursor([1, 2]))).toBeNull();
  });
});
