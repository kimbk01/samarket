import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translateBy } from "@/lib/i18n/translate-by";
import type { MessageKey } from "@/lib/i18n/messages";
import { normalizeTradePriceForSave } from "@/lib/posts/trade-price-server-validation";
import { formatExchangeRatePlus } from "@/lib/exchange/exchange-feed-lines";
import { marketplacePublicStatusBadge } from "@/lib/trade/marketplace/public-listing-status";
import { buildUsedCarYearSelectOptions, localizeUsedCarModelLine } from "@/lib/trade/used-car-form-catalog";
import { validateRestrictedMetaPatch } from "@/lib/trade/trade-lifecycle-policy";
import { buildCompositionListAttributes } from "../list-attributes";
import { formatExchangeCompositionDetailField } from "../detail-field-formatters";
import { labelForTradeOption } from "../option-catalogs";
import { sanitizeAreaSqmInput } from "../real-estate-deal-persist-scope";
import { resolveTradeComposition } from "../resolve-composition";

const tEn = (key: MessageKey, vars?: Record<string, string | number>) => translateBy("en", key, vars);
const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("감사 G2·G3·G4 — 중고거래", () => {
  it("G2: 서버 가격 — 0 이상 유한한 숫자만, 나눔이면 null", () => {
    expect(normalizeTradePriceForSave(1500, false)).toEqual({ ok: true, price: 1500 });
    expect(normalizeTradePriceForSave("1,500", false)).toEqual({ ok: true, price: 1500 });
    expect(normalizeTradePriceForSave(null, false)).toEqual({ ok: true, price: null });
    expect(normalizeTradePriceForSave(99, true)).toEqual({ ok: true, price: null });
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, "abc"]) {
      expect(normalizeTradePriceForSave(bad, false).ok).toBe(false);
    }
  });
  it("G3: /write 닫기·뒤로는 마켓 목록", () => {
    const s = src("app/(main)/write/WritePageClient.tsx");
    expect(s).toContain('const WRITE_PAGE_CLOSE_HREF = "/market";');
    expect(s).not.toContain('"/philife"');
  });
  it("G4: 계약 문서가 평가 경로를 「구현됨」으로 적는다", () => {
    expect(src("docs/trade-chat-buyer-seller-process.md")).not.toContain("평가 경로는 아직 410");
  });
});

describe("감사 C4·C5 — 중고차", () => {
  it("C4: 연식 선택지가 화면 언어로", () => {
    const opts = buildUsedCarYearSelectOptions(tEn);
    expect(opts[1].label).not.toMatch(/년/);
  });
  it("C4: 저장된 「기타 모델」을 보는 사람 언어로", () => {
    expect(localizeUsedCarModelLine(`Toyota ${translateBy("ko", "used_car_model_other")}`, tEn)).toBe(
      `Toyota ${translateBy("en", "used_car_model_other")}`
    );
    expect(localizeUsedCarModelLine("Toyota Vios", tEn)).toBe("Toyota Vios");
  });
  it("C5: 목록에서 「삽니다」 연식은 「이하」", () => {
    const composition = resolveTradeComposition({ icon_key: "used-car", fieldComposition: null });
    const attrs = buildCompositionListAttributes({
      composition,
      meta: { car_trade: "buy", car_year: "2018", car_model: "Toyota Vios" },
      lang: "en",
    });
    const year = attrs.find((a) => a.fieldId === "year")?.text;
    expect(year).toBe(translateBy("en", "ui_meta_year_suffix", { year: "2018" }));
  });
  it("C8·R5: 제한 단계 잠금 안내에 내부 칸 이름이 없다", () => {
    const base = { title: "a", price: 1, trade_category_id: "c", region: "", city: "", barangay: "", images: null, thumbnail_url: null, content: "x", is_free_share: false, is_price_offer: false, meta: { car_model: "A" } };
    const r = validateRestrictedMetaPatch("used", base as never, { ...base, meta: { car_model: "B" } } as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toContain("car_model");
  });
});

describe("감사 R7 — 부동산 면적", () => {
  it("숫자·소수 둘째 자리까지만", () => {
    expect(sanitizeAreaSqmInput("30.555m²")).toBe("30.55");
    expect(sanitizeAreaSqmInput("abc")).toBe("");
    expect(sanitizeAreaSqmInput("1.2.3")).toBe("1.23");
  });
  it("목록 단위는 ㎡", () => {
    const composition = resolveTradeComposition({ icon_key: "real-estate", slug: "property", fieldComposition: null });
    const attrs = buildCompositionListAttributes({ composition, meta: { size_sq: "30" }, lang: "en" });
    const area = attrs.find((a) => a.fieldId === "floor_area")?.text;
    expect(area).toBe("30 ㎡");
  });
});

describe("감사 J4·J5 — 일자리", () => {
  it("J4: 구직 희망 업종이 업종 카탈로그 라벨로", () => {
    expect(labelForTradeOption("jobs_work_category", "식당/주방", "en")).toBe(
      translateBy("en", "jobs_seek_ind_restaurant")
    );
  });
  it("J5: 일자리 글 배지는 모집중·구직중·마감", () => {
    expect(marketplacePublicStatusBadge({ status: "active", meta: { listing_kind: "hire" } }, "list", tEn).label).toBe(
      translateBy("en", "ui_jobs_status_hiring_active")
    );
    expect(marketplacePublicStatusBadge({ status: "active", meta: { listing_kind: "work" } }, "list", tEn).label).toBe(
      translateBy("en", "ui_jobs_status_seeking_active")
    );
    expect(marketplacePublicStatusBadge({ status: "sold", meta: { listing_kind: "hire" } }, "list", tEn).label).toBe(
      translateBy("en", "ui_jobs_status_closed")
    );
    expect(marketplacePublicStatusBadge({ status: "active", meta: {} }, "list", tEn).label).toBe(
      translateBy("en", "trade_listing_step_inquiry")
    );
  });
});

describe("감사 X4·X5 — 환전", () => {
  it("X4: 음수 가산값은 「-0.5」", () => {
    expect(formatExchangeRatePlus(-0.5)).toBe("-0.5");
    expect(formatExchangeRatePlus(0.5)).toBe("+0.5");
  });
  it("X5: 합산 환율 줄이 있으면 기준 환율 줄은 숨김", () => {
    const meta = { exchange_rate_base: 24.5, exchange_rate_plus: 0, exchange_rate: 24.5 };
    expect(formatExchangeCompositionDetailField("exchange_rate_base", "24.5", meta, { t: tEn })).toBeNull();
    expect(formatExchangeCompositionDetailField("exchange_rate", "24.5", meta, { t: tEn })).toContain("24.5");
  });
});
