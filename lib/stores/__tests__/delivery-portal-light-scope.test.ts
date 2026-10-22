import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * UI-08 — `.delivery-ui[data-delivery-consumer-surface]` 라이트 고정은 배달 셸(`StoresDeliveryLayoutShell`) 하위에만 걸린다.
 * body 포털로 셸 밖에 렌더되는 소비자 배달 시트·패널도 같은 스코프를 가져야 다크 모드에서
 * 흰 표면 위 `text-sam-fg`(밝은 글자) 1.12:1 이 생기지 않는다.
 */
const PORTAL_ROOTS = [
  "components/stores/product-sheet/StoreProductSheetShell.tsx",
  "components/stores/store-detail/StoreReviewsSlidePanel.tsx",
  "components/stores/home/hub/StoresHomeSearchModal.tsx",
  "components/mypage/BuyerStoreOrderChatSlidePanel.tsx",
  "components/mypage/BuyerStoreOrderReviewSlidePanel.tsx",
];

describe("UI-08 portaled consumer delivery overlays carry the light-lock scope", () => {
  it.each(PORTAL_ROOTS)("%s", (rel) => {
    const src = readFileSync(path.join(process.cwd(), rel), "utf8");
    expect(src).toMatch(/delivery-ui/);
    expect(src).toMatch(/data-delivery-consumer-surface=""/);
  });

  it("scope selector is defined once for light-lock in delivery tokens", () => {
    const css = readFileSync(path.join(process.cwd(), "app/delivery-tokens.css"), "utf8");
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)\s*\{[\s\S]*?\.delivery-ui\[data-delivery-consumer-surface\]/);
  });
});
