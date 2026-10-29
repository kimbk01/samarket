import { readdirSync, readFileSync } from "node:fs";
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

  it("no undefined sam-brand color anywhere (tokens are sam-primary / sam-primary-soft)", () => {
    const PENDING_CALL_APPROVAL = new Set<string>();
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name === "__tests__" || e.name === "node_modules") continue;
          walk(rel);
        } else if (/\.(tsx?|css)$/.test(e.name) && !PENDING_CALL_APPROVAL.has(rel)) {
          if (/sam-brand/.test(read(rel))) offenders.push(rel);
        }
      }
    };
    for (const d of ["app", "components", "lib"]) walk(d);
    expect(offenders).toEqual([]);
    expect(read("app/globals.css")).not.toContain("--color-sam-brand");
  });

  it("biz tokens resolve in body-portaled owner sheets", () => {
    expect(read("app/design-tokens.css")).toMatch(/:root,\n\[data-biz="1"\] \{[^}]*--biz-primary: var\(--sam-primary\);/);
  });

  it("delivery AA colors apply only under delivery scopes — :root shared values unchanged", () => {
    const tok = read("app/delivery-tokens.css");
    // :root 는 메신저 주문 채팅방 등과 공유 → 원래 값 유지
    expect(tok).toContain("  --delivery-text-muted: color-mix(in srgb, var(--dibay-muted) 72%, var(--dibay-card));");
    expect(tok).toContain("  --delivery-danger: #e74c3c;");
    expect(read("app/design-tokens.css")).toContain("--sm-color-danger: #d45252;");
    const scoped = tok.match(
      /\[data-delivery-consumer-surface\],\n\[data-store-orders-surface\],\n\[data-biz="1"\]:not\(\.app-bottom-nav-shell\),\n\[data-delivery-scope\] \{([^}]*)\}/
    );
    expect(scoped, "scoped AA block").not.toBeNull();
    expect(scoped![1]).toContain("--delivery-danger: color-mix(in srgb, var(--sm-color-danger) 86%, #000);");
    expect(scoped![1]).toContain("--delivery-text-muted: color-mix(in srgb, var(--dibay-muted) 84%, var(--dibay-card));");
    expect(scoped![1]).toContain("--sam-danger: var(--delivery-danger);");
    expect(scoped![1]).toContain("--overlay-danger: var(--sam-danger);");
    // `.delivery-ui` 는 메신저도 쓰므로 스코프 선택자로 쓰지 않는다
    expect(tok).not.toMatch(/^\.delivery-ui,\n/m);
    expect(tok).toMatch(/\[data-delivery-scope="admin"\] \{[^}]*--sam-text-muted: var\(--app-text-3\);/);
    expect(tok).not.toMatch(/prefers-color-scheme:\s*dark/);
  });

  it("portals carry the opener's delivery scope (overlay root + delivery custom portals)", () => {
    const root = read("components/ui/dibay-overlay/DibayOverlayRoot.tsx");
    expect(root).toContain("const scopeAttrs = useOverlayScopeAttrs();");
    expect(root).toContain("{...scopeAttrs}");
    for (const [f, needle] of [
      ["components/delivery/navigation/StoresDeliveryLayoutShell.tsx", "OverlayScopeProvider attrs={isConsumerSurface ? CONSUMER_SCOPE : null}"],
      ["app/(main)/stores/owner/StoresOwnerLayoutClient.tsx", "OverlayScopeProvider attrs={OWNER_SCOPE}"],
      ["components/mypage/MyStoreOrdersView.tsx", "OverlayScopeProvider attrs={isDeliveryHub ? ORDERS_HUB_SCOPE : ORDERS_MYPAGE_SCOPE}"],
      ["app/(main)/mypage/store-orders/[orderId]/page.tsx", "OverlayScopeProvider attrs={ORDER_DETAIL_SCOPE}"],
      ["app/(main)/orders/store/[orderId]/review/page.tsx", "OverlayScopeProvider attrs={ORDERS_SCOPE}"],
      ["components/admin/shell/AdminPlatformShell.tsx", "OverlayScopeProvider attrs={isDeliveryWorkspace ? ADMIN_DELIVERY_SCOPE : null}"],
    ] as const) {
      expect(read(f), f).toContain(needle);
    }
    for (const f of [
      "components/stores/detail/CategoryStickyTabs.tsx",
      "components/stores/store-order-detail/StoreOrderStickyHeader.tsx",
      "components/stores/commerce/StoreCommerceBottomActionShell.tsx",
      "components/stores/home/hub/StoresHomeSearchModal.tsx",
      "components/delivery/ui/DeliveryModal.tsx",
      "components/business/owner/OwnerMobileOpsMenuDrawer.tsx",
      "components/admin/ui/AdminDetailDrawer.tsx",
    ]) {
      expect(read(f), f).toContain("useOverlayScopeAttrs()");
    }
    // 공통 하단 내비(HARD LOCK)와 메신저 주문 채팅은 스코프를 받지 않는다
    expect(read("components/stores/owner/OwnerMobileBottomNav.tsx")).not.toContain("useOverlayScopeAttrs");
    expect(read("app/(main)/stores/owner/StoresOwnerLayoutClient.tsx")).toMatch(/if \(isOrderChatEnsure\) \{\n\s*return <>\{children\}<\/>;/);
  });

  it("delivery scopes have a base-layer pressed feedback and one unavailable style", () => {
    const css = read("app/delivery-components.css");
    expect(css).toMatch(
      /@layer base \{\s*:where\(\[data-delivery-consumer-surface\], \[data-store-orders-surface\], \[data-biz="1"\], \[data-delivery-scope\]\)/
    );
    expect(css).toContain(":not(.delivery-unavailable):not(.app-bottom-nav-shell *):active");
    expect(css).toMatch(/\.delivery-unavailable \{[^}]*opacity: 0\.7;/);
    /** WP6 (2026-10-29) — 인기 메뉴는 일반 메뉴 행(ProductMenuCard)을 그대로 써서 같은 unavailable 스타일을 물려받는다 */
    expect(read("components/stores/detail/PopularMenuSection.tsx")).toContain("<ProductMenuCard");
    for (const f of [
      "components/stores/detail/ProductMenuCard.tsx",
      "components/stores/detail/RecommendedMenuSection.tsx",
      "components/stores/StoreMenuBoardPreamble.tsx",
      "components/stores/modifiers/StoreModifierPicker.tsx",
    ]) {
      const s = read(f);
      expect(s, f).toContain("delivery-unavailable");
      expect(s, f).not.toMatch(/cursor-not-allowed opacity-4[05]/);
    }
  });
  it("home primary category ribbon centers when it fits (tablet) and keeps start alignment when it overflows (phone)", () => {
    const ui = read("lib/stores/stores-home-ui.ts");
    for (const name of ["STORES_HOME_PRIMARY_CATEGORY_SCROLL", "STORES_HOME_PRIMARY_CATEGORY_SCROLL_LOCKED"]) {
      const m = ui.match(new RegExp(`export const ${name} =\\n\\s*"([^"]*)"`));
      expect(m, name).not.toBeNull();
      expect(m![1], name).toContain("[justify-content:safe_center]");
    }
  });
});
