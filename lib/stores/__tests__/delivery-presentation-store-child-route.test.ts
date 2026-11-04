import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isDeliveryStoreChildRoutePath } from "@/lib/stores/delivery-consumer-stack-slide";

/**
 * 2026-11-04 실기 D2 — 업종 목록 → 매장 → 상품(`/p/:id`)에서 배달 틀이 상품 페이지를 숨기고
 * 매장 화면을 그려 필수 옵션을 고를 수 없었다. 매장 하위 주소는 Next 페이지가 화면 주인이다.
 */
const SLUG_ENC = encodeURIComponent("맛업는식당-8db1803b");

describe("isDeliveryStoreChildRoutePath", () => {
  it("상품·가게정보·리뷰·신고 = 하위 주소", () => {
    expect(isDeliveryStoreChildRoutePath(`/stores/${SLUG_ENC}/p/9c205a36-e6db-46c4-bea6-b41d83fa59e8`)).toBe(true);
    expect(isDeliveryStoreChildRoutePath(`/stores/${SLUG_ENC}/info`)).toBe(true);
    expect(isDeliveryStoreChildRoutePath(`/stores/${SLUG_ENC}/reviews`)).toBe(true);
    expect(isDeliveryStoreChildRoutePath(`/stores/${SLUG_ENC}/report`)).toBe(true);
  });

  it("매장 메뉴 화면·장바구니·결제·목록·검색 = 하위 주소 아님", () => {
    expect(isDeliveryStoreChildRoutePath(`/stores/${SLUG_ENC}`)).toBe(false);
    expect(isDeliveryStoreChildRoutePath(`/stores/${SLUG_ENC}?focusProduct=x`)).toBe(false);
    expect(isDeliveryStoreChildRoutePath(`/stores/${SLUG_ENC}/cart`)).toBe(false);
    expect(isDeliveryStoreChildRoutePath(`/stores/${SLUG_ENC}/checkout`)).toBe(false);
    expect(isDeliveryStoreChildRoutePath("/stores")).toBe(false);
    expect(isDeliveryStoreChildRoutePath("/stores/browse/restaurant")).toBe(false);
    expect(isDeliveryStoreChildRoutePath("/stores/search")).toBe(false);
  });
});

describe("DeliveryPresentationShell — 매장 하위 주소 계약", () => {
  const src = readFileSync(
    join(process.cwd(), "components/delivery/presentation/DeliveryPresentationShell.tsx"),
    "utf8"
  );

  it("하위 주소에서는 Next 페이지를 숨기지 않고 소프트 매장 화면을 그리지 않는다", () => {
    expect(src).toMatch(/const onStoreChildRoute = isDeliveryStoreChildRoutePath\(pathKey\)/);
    expect(src).toMatch(
      /const paintSoftStoreSurface = showShellStore && !onCartCheckoutHardRoute && !onStoreChildRoute;/
    );
    expect(src).toMatch(/const suppressNextChildrenPaint =\s*!onCartCheckoutHardRoute &&\s*!onStoreChildRoute &&/);
  });

  it("하위 주소에서는 보관된 업종 목록이 화면·높이를 차지하지 않는다", () => {
    expect(src).toMatch(/if \(onStoreChildRoute\) return \{ display: "none" \};/);
  });

  it("소프트 매장 호스팅·목록→매장 슬라이드는 매장 메뉴 화면에서만", () => {
    expect(src).toMatch(/shouldHostStore: \(\) => softSession && onStoreRoot/);
    expect(src).toMatch(/isBrowsePath\(prev\) && onStoreRoot && dNext > dPrev/);
  });

  it("주소 조각의 slug 는 디코딩해 매장 화면에 넘긴다 (이중 인코딩 방지)", () => {
    expect(src).toMatch(/function parseStoreSlug[\s\S]*?decodeSlugSegment\(parts\[0\] \?\? ""\)/);
  });
});
