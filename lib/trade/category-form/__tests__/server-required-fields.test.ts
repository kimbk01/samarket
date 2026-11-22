import { describe, expect, it } from "vitest";
import { applyTradeBehaviorAdapter } from "../behavior-adapters";
import { behaviorContextFromDetailMeta } from "../detail-spec-route";
import { resolveTradeComposition } from "../resolve-composition";
import {
  TRADE_REQUIRED_FIELDS_BASE_SKIP,
  TRADE_REQUIRED_FIELDS_ENFORCE,
  findMissingRequiredTradeFields,
  findNewlyMissingRequiredTradeFields,
} from "../server-required-fields";
import { validateAdaptedCompositionValues } from "@/components/write/trade/generic/GenericTradeWriteFields";

/** 운영 글과 같은 모양의 「모두 채운」 행 (posts 열 + meta) */
const FULL: Record<string, { icon: string; row: Record<string, unknown> }> = {
  general: { icon: "general", row: { price: 1000, meta: {} } },
  usedCarSell: {
    icon: "used-car",
    row: { price: 500000, meta: { car_trade: "sell", car_model: "Toyota Vios", car_year: "2018", mileage: "50000", has_accident: false } },
  },
  usedCarBuy: { icon: "used-car", row: { price: 400000, meta: { car_trade: "buy", car_year: "2018", car_body_type: "sedan" } } },
  realEstateSale: {
    icon: "real-estate",
    row: {
      price: 9000000,
      meta: { deal_type: "판매", estate_type: "콘도", size_sq: "30", room_count: "2", bathroom_count: "1", move_in_date: "now", building_name: "A" },
    },
  },
  realEstateRent: {
    icon: "real-estate",
    row: {
      price: null,
      meta: { deal_type: "임대", estate_type: "콘도", size_sq: "30", room_count: "2", bathroom_count: "1", move_in_date: "now", building_name: "A", deposit: "50000", monthly: "15000" },
    },
  },
  jobsHire: { icon: "jobs", row: { price: 500, meta: { listing_kind: "hire", work_category: "서빙", work_term: "short", pay_type: "hourly" } } },
  jobsWork: { icon: "jobs", row: { price: null, meta: { listing_kind: "work", work_category: "식당/주방", work_term: "short_alba", pay_type: "negotiate" } } },
  exchange: {
    icon: "exchange",
    row: {
      price: 1000,
      meta: { exchange_direction: "sell", from_currency: "PHP", to_currency: "KRW", exchange_rate_base: 24.5, exchange_rate: 24.5, amount: 1000, buyer_prep: ["id"] },
    },
  },
  rentCar: {
    icon: "rent-car",
    row: { price: 2500, meta: { car_model: "Toyota Vios", car_year: "2018", daily_price: "2500", pickup_location: "Cebu" } },
  },
};

function comp(icon: string) {
  return resolveTradeComposition({ icon_key: icon, fieldComposition: null });
}

describe("서버 필수 칸 검사 — 주제·모드별", () => {
  it("1단계: 막기 스위치는 꺼져 있다", () => {
    expect(TRADE_REQUIRED_FIELDS_ENFORCE).toBe(false);
  });

  for (const [name, { icon, row }] of Object.entries(FULL)) {
    it(`${name}: 모두 채우면 빈 칸 없음`, () => {
      expect(findMissingRequiredTradeFields(comp(icon), row)).toEqual([]);
    });

    it(`${name}: 필수 칸을 하나씩 비우면 그 칸만 나온다`, () => {
      const c = comp(icon);
      const meta = row.meta as Record<string, unknown>;
      const required = applyTradeBehaviorAdapter(c, behaviorContextFromDetailMeta(meta)).filter(
        (f) =>
          f.visible &&
          f.effectiveRequired &&
          !TRADE_REQUIRED_FIELDS_BASE_SKIP.includes(f.id) &&
          f.definition.widget !== "derived" &&
          f.definition.widget !== "boolean"
      );
      expect(required.length).toBeGreaterThan(0);
      for (const f of required) {
        /** 행동 규칙을 정하는 칸(모드)을 비우면 모드가 바뀌어 다른 칸도 달라지므로 따로 본다 */
        if (["car_trade", "deal_type", "listing_kind", "exchange_direction"].includes(f.id)) continue;
        const st = f.definition.storage;
        const nextMeta = { ...meta };
        const next: Record<string, unknown> = { ...row, meta: nextMeta };
        if (st.kind === "meta") delete nextMeta[st.key];
        else if (st.kind === "combined_meta") delete nextMeta[st.writeKey];
        else if (st.kind === "column") next[st.column] = null;
        else if (st.kind === "meta_or_column") {
          delete nextMeta[st.metaKey];
          next[st.column] = null;
        }
        /** 제조사·모델은 같은 저장 칸(`car_model`)을 함께 쓴다 — 하나를 비우면 둘 다 빈 칸 */
        const expected =
          st.kind === "combined_meta"
            ? required
                .filter((g) => g.definition.storage.kind === "combined_meta" && (g.definition.storage as typeof st).writeKey === st.writeKey)
                .map((g) => g.id)
            : [f.id];
        expect(findMissingRequiredTradeFields(c, next).sort()).toEqual(expected.sort());
      }
    });
  }

  it("나눔 글은 가격을 보지 않는다", () => {
    expect(findMissingRequiredTradeFields(comp("general"), { price: null, is_free_share: true, meta: {} })).toEqual([]);
    expect(findMissingRequiredTradeFields(comp("general"), { price: null, is_free_share: false, meta: {} })).toEqual([
      "price",
    ]);
  });

  it("참/거짓 칸(사고 여부)은 false 도 값이다", () => {
    const { icon, row } = FULL.usedCarSell;
    const meta = { ...(row.meta as Record<string, unknown>) };
    delete meta.has_accident;
    expect(findMissingRequiredTradeFields(comp(icon), { ...row, meta })).toEqual([]);
  });
});

describe("서버 필수 칸 검사 — 수정 규칙", () => {
  it("예전부터 비어 있던 칸은 막지 않는다", () => {
    const c = comp("real-estate");
    const before = { price: null, meta: { deal_type: "임대", estate_type: "콘도" } };
    const after = { ...before, meta: { ...before.meta, building_name: "B" } };
    expect(findNewlyMissingRequiredTradeFields(c, before, after)).toEqual([]);
  });
  it("이번 수정으로 비운 칸은 잡는다", () => {
    const { icon, row } = FULL.realEstateRent;
    const meta = { ...(row.meta as Record<string, unknown>) };
    delete meta.monthly;
    expect(findNewlyMissingRequiredTradeFields(comp(icon), row, { ...row, meta })).toEqual(["monthly"]);
  });
  it("판매 → 임대로 바꾸면 새로 필요한 보증금·월세를 잡는다", () => {
    const { icon, row } = FULL.realEstateSale;
    const after = { ...row, price: null, meta: { ...(row.meta as Record<string, unknown>), deal_type: "임대" } };
    expect(findNewlyMissingRequiredTradeFields(comp(icon), row, after).sort()).toEqual(["deposit", "monthly"]);
  });
});

describe("화면 판정과 같은 기준 (계약)", () => {
  it("중고거래: 화면 구성 검사와 서버 판정이 같은 칸을 낸다", () => {
    const c = comp("general");
    const adapted = applyTradeBehaviorAdapter(c, {});
    const screen = validateAdaptedCompositionValues(adapted, { title: "t", description: "d", price: "" }, (id) => id);
    const server = findMissingRequiredTradeFields(c, { title: "t", content: "d", price: null, meta: {} });
    expect(Object.keys(screen).sort()).toEqual(server.sort());
  });
});
