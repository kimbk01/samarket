import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("CUT-D stores consumer header + hub FAB", () => {
  it("header action order is search · orders · cart · bell", () => {
    const src = read("components/stores/home/hub/StoresConsumerHeaderActions.tsx");
    const search = src.indexOf('data-stores-consumer-header-action="search"');
    const orders = src.indexOf('data-stores-consumer-header-action="orders"');
    const cart = src.indexOf('data-stores-consumer-header-action="cart"');
    const bell = src.indexOf('data-stores-consumer-header-action="bell"');
    expect(search).toBeGreaterThan(-1);
    expect(orders).toBeGreaterThan(search);
    expect(cart).toBeGreaterThan(orders);
    expect(bell).toBeGreaterThan(cart);
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
