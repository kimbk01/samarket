import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("CUT-D stores consumer header + hub FAB", () => {
  it("header action order — full: search · orders · cart · bell / 배민 미러링 home: bell · cart / browse: search · cart", () => {
    const src = read("components/stores/home/hub/StoresConsumerHeaderActions.tsx");
    const homeBell = src.indexOf('data-stores-consumer-header-action="bell"');
    const search = src.indexOf('data-stores-consumer-header-action="search"');
    const orders = src.indexOf('data-stores-consumer-header-action="orders"');
    const cart = src.indexOf('data-stores-consumer-header-action="cart"');
    const fullBell = src.lastIndexOf('data-stores-consumer-header-action="bell"');
    expect(homeBell).toBeGreaterThan(-1);
    expect(search).toBeGreaterThan(homeBell);
    expect(orders).toBeGreaterThan(search);
    expect(cart).toBeGreaterThan(orders);
    expect(fullBell).toBeGreaterThan(cart);
    expect(src).toContain('const showSearch = variant !== "home"');
    expect(src).toContain('const showOrders = variant === "full"');
    /** Owner 2026-10-30 — 배달 홈·목록 헤더 아이콘은 앱 공통(검색·주문·카트·알림) 그대로 */
    expect(read("components/stores/home/hub/StoresHomeHeaderChrome.tsx")).toContain("<StoresConsumerHeaderActions />");
    expect(read("components/stores/browse/StoresBrowseHeaderChrome.tsx")).toContain("<StoresConsumerHeaderActions />");
  });

  it("home + browse headers mount StoresConsumerHeaderActions", () => {
    expect(read("components/stores/home/hub/StoresHomeHeaderChrome.tsx")).toContain(
      "StoresConsumerHeaderActions"
    );
    expect(read("components/stores/browse/StoresBrowseHeaderChrome.tsx")).toContain(
      "StoresConsumerHeaderActions"
    );
  });

  it("consumer hub FAB surface gate is off; store detail cart chrome remains", () => {
    const fab = read("lib/main-menu/resolve-main-bottom-nav-fab.ts");
    expect(fab).toMatch(/isMainBottomNavFabDeliverySurface[\s\S]*return false/);
    expect(read("components/stores/detail/StoreDetailCartChrome.tsx")).toContain(
      "StoreDetailCartChrome"
    );
    expect(read("components/stores/StoreDetailPublic.tsx")).toContain("StoreDetailCartChrome");
  });
});
