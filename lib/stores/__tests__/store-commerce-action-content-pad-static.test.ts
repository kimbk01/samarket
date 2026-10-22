import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STORE_COMMERCE_ACTION_BTN_DISABLED_CLASS,
  STORE_COMMERCE_ACTION_CONTENT_PAD_CLASS,
  STORE_COMMERCE_ACTION_SUBMIT_FULL_CLASS,
  STORE_COMMERCE_ACTION_VARIANT_MIN_HEIGHT,
  STORE_DETAIL_ROOT_BOTTOM_PADDING_NO_STRIP_CLASS,
  STORE_DETAIL_ROOT_BOTTOM_PADDING_WITH_CART_STRIP_CLASS,
  storeCommerceActionContentPadClass,
  type StoreCommerceActionVariant,
} from "@/lib/stores/store-commerce-bottom-action-bar";

const SRC = readFileSync(join(process.cwd(), "lib/stores/store-commerce-bottom-action-bar.ts"), "utf8");
const VARIANTS = Object.keys(STORE_COMMERCE_ACTION_VARIANT_MIN_HEIGHT) as StoreCommerceActionVariant[];

describe("UI-07 본문 하단 여백 — Tailwind 가 스캔할 수 있는 정적 리터럴", () => {
  it.each(VARIANTS)("%s: 완성된 클래스 문자열이 소스에 리터럴로 있다", (variant) => {
    const cls = storeCommerceActionContentPadClass(variant);
    expect(cls).toBe(STORE_COMMERCE_ACTION_CONTENT_PAD_CLASS[variant]);
    expect(cls).toBe(`pb-[calc(${STORE_COMMERCE_ACTION_VARIANT_MIN_HEIGHT[variant]}+var(--safe-bottom))]`);
    // 따옴표로 감싼 완전한 리터럴 — 템플릿 조합이면 스캐너가 만들지 못한다
    expect(SRC).toContain(`"${cls}"`);
  });

  it("템플릿 보간으로 pb-[calc(...)] 를 조합하지 않는다", () => {
    expect(SRC).not.toMatch(/pb-\[calc\(\$\{/);
  });

  it("매장 상세 루트 여백 상수 = 정적 맵 값", () => {
    expect(STORE_DETAIL_ROOT_BOTTOM_PADDING_WITH_CART_STRIP_CLASS).toBe("pb-[calc(5.75rem+var(--safe-bottom))]");
    expect(STORE_DETAIL_ROOT_BOTTOM_PADDING_NO_STRIP_CLASS).toBe("pb-[calc(4.75rem+var(--safe-bottom))]");
  });
});

describe("UI-02 · UI-05 · UI-09 비활성·제출 CTA", () => {
  it("비활성·처리 중 CTA 는 회색 배경 + 짙은 글자 토큰 (흰 글자 금지)", () => {
    expect(STORE_COMMERCE_ACTION_BTN_DISABLED_CLASS).toContain("bg-[color:var(--delivery-btn-disabled)]");
    expect(STORE_COMMERCE_ACTION_BTN_DISABLED_CLASS).toContain("text-[color:var(--delivery-btn-disabled-fg)]");
    expect(STORE_COMMERCE_ACTION_BTN_DISABLED_CLASS).not.toMatch(/\btext-white\b/);
  });

  it("전폭 제출 CTA = 배달 primary, 비활성은 opacity 없이 회색 토큰", () => {
    expect(STORE_COMMERCE_ACTION_SUBMIT_FULL_CLASS).toContain("bg-[color:var(--delivery-primary)]");
    expect(STORE_COMMERCE_ACTION_SUBMIT_FULL_CLASS).not.toContain("--delivery-dark");
    expect(STORE_COMMERCE_ACTION_SUBMIT_FULL_CLASS).not.toMatch(/disabled:opacity-/);
    expect(STORE_COMMERCE_ACTION_SUBMIT_FULL_CLASS).toContain("disabled:text-[color:var(--delivery-btn-disabled-fg)]");
  });

  it("disabled 글자 토큰이 정의돼 있다", () => {
    const tokens = readFileSync(join(process.cwd(), "app/delivery-tokens.css"), "utf8");
    expect(tokens).toMatch(/--delivery-btn-disabled-fg:\s*var\(--delivery-text-main\)/);
    const comps = readFileSync(join(process.cwd(), "app/delivery-components.css"), "utf8");
    const disabledBlocks = comps.match(/[^{}]*:disabled\s*\{[^}]*--delivery-btn-disabled\)[^}]*\}/g) ?? [];
    expect(disabledBlocks.length).toBeGreaterThanOrEqual(5);
    for (const b of disabledBlocks) expect(b, b).toContain("--delivery-btn-disabled-fg");
  });
});
