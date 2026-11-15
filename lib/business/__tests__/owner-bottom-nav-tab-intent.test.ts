/** 사장님 하단 탭 계약 v2 S5 — 하단 탭 이동만 슬라이드 없음(1회 소비), 그 밖의 스택 이동은 기존 슬라이드 */
import { afterEach, describe, expect, it } from "vitest";
import {
  __resetOwnerBottomNavTabIntentForTest,
  consumeOwnerBottomNavTabIntent,
  markOwnerBottomNavTabIntent,
} from "@/lib/business/owner-bottom-nav-tab-intent";
import { readFileSync } from "node:fs";
import { join } from "node:path";

afterEach(() => __resetOwnerBottomNavTabIntentForTest());

describe("owner bottom nav tab intent", () => {
  it("같은 경로 도착 때 1회만 소비", () => {
    markOwnerBottomNavTabIntent("/stores/owner/products?storeId=s1", 1000);
    expect(consumeOwnerBottomNavTabIntent("/stores/owner/orders", 1100)).toBe(false);
    expect(consumeOwnerBottomNavTabIntent("/stores/owner/products/", 1200)).toBe(true);
    expect(consumeOwnerBottomNavTabIntent("/stores/owner/products", 1300)).toBe(false);
  });
  it("8초 지나면 무효", () => {
    markOwnerBottomNavTabIntent("/stores/owner/products", 0);
    expect(consumeOwnerBottomNavTabIntent("/stores/owner/products", 8_001)).toBe(false);
  });
  it("사장님 하단 탭: pointerdown 피드백 없음 · click 에서 햅틱·표식 · 슬라이드 셸이 표식을 소비", () => {
    const nav = readFileSync(join(process.cwd(), "components/stores/owner/OwnerMobileBottomNav.tsx"), "utf8");
    expect(nav).not.toContain("onPointerDown");
    expect(nav).not.toContain("triggerLightTapFeedback");
    expect(nav).toContain("triggerBottomNavSelectionFeedback()");
    expect(nav).toContain("markOwnerBottomNavTabIntent(href)");
    expect(nav).toContain("useBottomNavResumeUiTask()");
    const shell = readFileSync(join(process.cwd(), "components/business/owner/OwnerStackPageSlideShell.tsx"), "utf8");
    expect(shell).toContain("consumeOwnerBottomNavTabIntent(pathKey)");
  });
});

describe("사장님 탭 뼈대 (Owner 2026-11-15 「사장님 뼈대 신설」)", () => {
  it("탭 4개 목적지만 뼈대 종류가 있다", async () => {
    const { resolveOwnerTabSkeletonKind } = await import("@/components/business/owner/OwnerTabSkeleton");
    expect(resolveOwnerTabSkeletonKind("/stores/owner/orders")).toBe("orders");
    expect(resolveOwnerTabSkeletonKind("/stores/owner/products/")).toBe("products");
    expect(resolveOwnerTabSkeletonKind("/stores/owner/customer-care")).toBe("customers");
    expect(resolveOwnerTabSkeletonKind("/stores/owner/settings?storeId=s1")).toBe("manage");
    expect(resolveOwnerTabSkeletonKind("/stores/owner")).toBeNull();
    expect(resolveOwnerTabSkeletonKind("/stores/owner/products/new")).toBeNull();
  });
  it("누른 프레임에 컨트롤러 시작 → 본문 뼈대·머리글 제목이 목적 화면 기준", () => {
    const nav = readFileSync(join(process.cwd(), "components/stores/owner/OwnerMobileBottomNav.tsx"), "utf8");
    expect(nav).toContain("beginBottomNavShowing({ tabId: item.id, href })");
    const shell = readFileSync(join(process.cwd(), "components/business/owner/OwnerStackPageSlideShell.tsx"), "utf8");
    expect(shell).toContain("<OwnerTabSkeleton kind={skeletonKind} />");
    const admin = readFileSync(join(process.cwd(), "components/business/admin/BusinessAdminShell.tsx"), "utf8");
    expect(admin).toContain("getBusinessAdminPageTitle(ownerShowingTarget.path, ownerShowingTarget.search)");
  });
});
