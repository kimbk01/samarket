import { describe, expect, it } from "vitest";
import { translateBy } from "@/lib/i18n/translate-by";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatPrepKeysForDisplay } from "@/lib/exchange/form-options";
import { jobTimeSlotsDisplay, jobWorkCategoryDbLabel } from "@/lib/jobs/form-options";
import { formatJobsCompositionDetailField } from "@/lib/jobs/job-detail-composition-rows";
import { deriveTradeLifecycleStatus } from "@/lib/trade/trade-lifecycle-policy";
import { buildCompositionDetailAttributes } from "../detail-attributes";
import { buildCompositionListAttributes } from "../list-attributes";
import { formatExchangeCompositionDetailField } from "../detail-field-formatters";
import { getTradeOptionCatalog, isTradeOptionUnfilterable } from "../option-catalogs";
import { resolveTradeComposition } from "../resolve-composition";

const tEn = (key: MessageKey, vars?: Record<string, string | number>) => translateBy("en", key, vars);

describe("감사 P1·P2 — 끝난 상태는 글 열이 정한다", () => {
  it("판매완료 글은 meta 단계 값이 남아 있어도 completed", () => {
    for (const stale of ["active", "negotiating", "in_progress", "cancelled"]) {
      expect(
        deriveTradeLifecycleStatus({ status: "sold", meta: { trade_lifecycle_status: stale } })
      ).toBe("completed");
    }
  });
  it("숨김 글(관리자 숨김 포함)은 meta 단계 값과 상관없이 hidden", () => {
    expect(deriveTradeLifecycleStatus({ status: "hidden", meta: { trade_lifecycle_status: "in_progress" } })).toBe(
      "hidden"
    );
  });
  it("seller_listing_state=completed 도 meta 보다 먼저", () => {
    expect(
      deriveTradeLifecycleStatus({
        status: "active",
        seller_listing_state: "completed",
        meta: { trade_lifecycle_status: "active" },
      })
    ).toBe("completed");
  });
  it("판매중 글은 지금처럼 meta 단계 값을 쓴다", () => {
    expect(deriveTradeLifecycleStatus({ status: "active", meta: { trade_lifecycle_status: "negotiating" } })).toBe(
      "negotiating"
    );
    expect(deriveTradeLifecycleStatus({ status: "active", meta: {} })).toBe("active");
  });
});

describe("감사 C1~C3 — 중고차", () => {
  it("C1: 삽니다 연식 「이하」 영어는 or older", () => {
    expect(translateBy("en", "ui_meta_year_suffix", { year: 2018 })).toBe("2018 or older");
  });
  it("C2: 모델 선택지에 직접 입력 자리(__model_free__)가 없음", () => {
    const labels = getTradeOptionCatalog("used_car_models").map((o) => o.labelKo);
    expect(labels).not.toContain("__model_free__");
  });
  it("C2: 「기타」 브랜드는 필터로 고를 수 없음", () => {
    expect(isTradeOptionUnfilterable("used_car_brands", "other")).toBe(true);
    expect(isTradeOptionUnfilterable("used_car_brands", "toyota")).toBe(false);
  });
  it("C3: 사고 없음(false)이 상세에 「No accidents」로 나옴", () => {
    const composition = resolveTradeComposition({ icon_key: "used-car", fieldComposition: null });
    const attrs = buildCompositionDetailAttributes({
      composition,
      meta: { car_trade: "sell", has_accident: false, car_model: "Toyota Vios" },
      lang: "en",
    });
    expect(attrs.find((a) => a.fieldId === "has_accident")?.value).toBe(translateBy("en", "ui_car_accident_no"));
  });
});

describe("감사 J1·J3 — 일자리", () => {
  const base = { meta: {}, listingKind: "work", lang: "en" as const };
  it("J1: 구직 근무형태·급여 협의는 라벨로", () => {
    expect(formatJobsCompositionDetailField({ ...base, fieldId: "work_term", rawValue: "short_alba" })).toBe(
      translateBy("en", "jobs_term_short_alba")
    );
    expect(formatJobsCompositionDetailField({ ...base, fieldId: "pay_type", rawValue: "negotiate" })).toBe(
      translateBy("en", "jobs_pay_negotiate")
    );
  });
  it("J3: 구직 희망 업종이 영어로", () => {
    expect(jobWorkCategoryDbLabel("en", "식당/주방")).toBe(translateBy("en", "jobs_seek_ind_restaurant"));
  });
  it("J3: 근무 가능 시간은 저장된 키를 보는 사람 언어로", () => {
    expect(jobTimeSlotsDisplay({ seek_time_slots: "morning|weekend" }, "en")).toBe(
      `${translateBy("en", "jobs_seek_morning")}, ${translateBy("en", "jobs_seek_weekend")}`
    );
    expect(jobTimeSlotsDisplay({ available_time: "오전" }, "en")).toBe("");
  });
});

describe("감사 K1 — 렌터카 목록", () => {
  it("일일요금·기사 포함은 사양 줄 속성에 넣지 않음", () => {
    const composition = resolveTradeComposition({ icon_key: "rent-car", fieldComposition: null });
    const attrs = buildCompositionListAttributes({
      composition,
      meta: { car_model: "Toyota Vios", car_year: "2018", daily_price: "2500", with_driver: true },
      lang: "en",
    });
    const ids = attrs.map((a) => a.fieldId);
    expect(ids).not.toContain("daily_price");
    expect(ids).not.toContain("with_driver");
  });
});

describe("감사 X2·X3 — 환전", () => {
  it("X2: 원화 환산액이 상세에 소수 없이 나옴", () => {
    const composition = resolveTradeComposition({ icon_key: "exchange", fieldComposition: null });
    const meta = { exchange_direction: "sell", amount: 1000, exchange_rate: 24.567, converted_amount: 24567.4 };
    const attrs = buildCompositionDetailAttributes({
      composition,
      meta,
      lang: "en",
      formatField: (fieldId, rawValue, m) => formatExchangeCompositionDetailField(fieldId, rawValue, m, { t: tEn }),
    });
    const row = attrs.find((a) => a.fieldId === "converted_amount");
    expect(row?.value).toContain("24,567");
    expect(row?.value).not.toContain(".4");
  });
  it("X3: 준비물이 보는 사람 언어로", () => {
    expect(formatPrepKeysForDisplay(["id", "bankbook"], (k) => translateBy("en", k))).toBe(
      `${translateBy("en", "exchange_prep_id")}, ${translateBy("en", "exchange_prep_bankbook")}`
    );
  });
});
