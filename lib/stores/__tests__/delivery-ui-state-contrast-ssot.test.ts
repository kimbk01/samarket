import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 배달 UI 상태·대비 SSOT — 렌더 측정(컴파일 CSS + Chromium)으로 찾은 결함의 재발 방지.
 * - 장바구니 「포장 픽업」 선택: `sam-text-body-secondary` 가 선택 칩 글자색을 덮어 녹색 위 어두운 글씨(1.46:1)
 * - 수령 방식·결제 방법 선택 표현 불일치 → `delivery-choice` 단일 규칙
 * - 정의 없는 `sam-brand` 색 → 버튼 배경 투명(흰 글씨 안 보임)
 * - 사장님 시트(body 포털)에서 `--biz-*` 미정의 → 주문 접수 CTA 투명
 * - 눌림 반응 없는 버튼(전역 tap-highlight 투명) → 배달 스코프 base 눌림 기본값
 */
const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("delivery UI state / contrast SSOT", () => {
  it("cart fulfillment and payment use the same single-choice SSOT", () => {
    const cart = read("components/stores/StoreCommerceCartPageClient.tsx");
    expect(cart).not.toContain("delivery-fulfillment-chip");
    expect(cart).toContain('name="cart-checkout-fulfillment"');
    expect(cart).toContain('name="cart-checkout-payment"');
    expect(cart.match(/className=\{`delivery-choice \$\{/g)?.length).toBe(2);
    // delivery-choice 와 sam-text-* 를 같은 요소에 쓰면 글자색이 덮인다
    for (const m of cart.matchAll(/className=\{`delivery-choice[^`]*`/g)) {
      expect(m[0]).not.toMatch(/sam-text-/);
    }
    const css = read("app/delivery-components.css");
    expect(css).toMatch(/\.delivery-choice\.delivery-choice--selected \{[^}]*color: var\(--delivery-text-main\)/);
    expect(css).not.toContain(".delivery-fulfillment-chip");
  });

  it("no undefined sam-brand color in delivery surfaces", () => {
    for (const f of [
      "components/stores/advertising/DeliveryAdOperationsComposer.tsx",
      "components/stores/advertising/DeliveryAdOperationsPanel.tsx",
      "components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx",
      "components/business/owner/ads/OwnerPlatformPopupApplyView.tsx",
    ]) {
      expect(read(f), f).not.toMatch(/(bg|text|border|ring)-sam-brand\b/);
    }
    expect(read("app/globals.css")).not.toContain("--color-sam-brand");
  });

  it("biz tokens resolve in body-portaled owner sheets", () => {
    expect(read("app/design-tokens.css")).toMatch(/:root,\n\[data-biz="1"\] \{[^}]*--biz-primary: var\(--sam-primary\);/);
  });

  it("delivery status colors are AA-darkened in delivery scopes only", () => {
    const tok = read("app/delivery-tokens.css");
    expect(tok).toContain("--delivery-danger: color-mix(in srgb, var(--sm-color-danger) 86%, #000);");
    expect(tok).toContain("--delivery-text-muted: color-mix(in srgb, var(--dibay-muted) 84%, var(--dibay-card));");
    expect(tok).toMatch(/\.delivery-ui,\n\[data-store-orders-surface\],\n\[data-biz="1"\] \{[^}]*--sam-danger: var\(--delivery-danger\);/);
    // 앱 공통 값은 그대로 (다른 도메인 비변경)
    expect(read("app/design-tokens.css")).toContain("--sm-color-danger: #d45252;");
    expect(tok).not.toMatch(/prefers-color-scheme:\s*dark/);
  });

  it("delivery scopes have a base-layer pressed feedback and one unavailable style", () => {
    const css = read("app/delivery-components.css");
    expect(css).toMatch(/@layer base \{\s*:where\(\.delivery-ui, \[data-store-orders-surface\], \[data-biz="1"\]\)/);
    expect(css).toMatch(/\.delivery-unavailable \{[^}]*opacity: 0\.7;/);
    for (const f of [
      "components/stores/detail/ProductMenuCard.tsx",
      "components/stores/detail/PopularMenuSection.tsx",
      "components/stores/detail/RecommendedMenuSection.tsx",
      "components/stores/StoreMenuBoardPreamble.tsx",
      "components/stores/modifiers/StoreModifierPicker.tsx",
    ]) {
      const s = read(f);
      expect(s, f).toContain("delivery-unavailable");
      expect(s, f).not.toMatch(/cursor-not-allowed opacity-4[05]/);
    }
  });
});
