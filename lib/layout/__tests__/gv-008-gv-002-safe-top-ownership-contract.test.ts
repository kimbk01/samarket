import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getMobileTopTier1RuleSet } from "@/lib/layout/mobile-top-tier1-rules";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import { resolvesMainHubScrollColumn } from "@/lib/layout/main-hub-scroll-column";
import { resolvesMainScrollInMainColumn } from "@/lib/layout/main-shell-viewport";

const ROOT = join(__dirname, "..", "..", "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("GV-008 /philife/my local AppTopHeader safe-top ownership", () => {
  it("suppresses Tier1 while hub column stays eligible", () => {
    const path = "/philife/my";
    const tier1 = getMobileTopTier1RuleSet(path);
    expect(tier1.showRegionBar).toBe(false);

    const f = resolveConditionalAppShellFlags(path, true);
    const mainScroll = resolvesMainScrollInMainColumn({
      isChatRoomDetail: f.isChatRoomDetail,
      isStoreOwnerAdminRoute: f.isStoreOwnerAdminRoute,
      isMainColumnViewportLocked: f.isMainColumnViewportLocked,
    });
    const hub = resolvesMainHubScrollColumn({
      regionBarInLayout: true,
      mainScrollInMainColumn: mainScroll,
      isChatRoomDetail: f.isChatRoomDetail,
    });
    expect(hub).toBe(true);
    expect(f.showRegionBar).toBe(false);
  });

  it("page local AppTopHeader outer owns safe-top without mutating AppBarShell SSOT", () => {
    const page = read("app/(main)/philife/my/page.tsx");
    expect(page).toContain("AppTopHeader");
    expect(page).toContain("pt-[var(--safe-top)]");
    expect(page).toMatch(/className=\{?["'][^"']*pt-\[var\(--safe-top\)\]/);

    const shell = read("components/layout/TradePrimaryAppBarShell.tsx");
    expect(shell).not.toContain("pt-[var(--safe-top)]");
    expect(shell).toContain("sector-header-shell--embedded");
  });
});

describe("GV-002 /address/select Type B local header ownership", () => {
  it("does not mount Tier1 chrome under main regionBarInLayout", () => {
    const path = "/address/select";
    const f = resolveConditionalAppShellFlags(path, true);
    const mainScroll = resolvesMainScrollInMainColumn({
      isChatRoomDetail: f.isChatRoomDetail,
      isStoreOwnerAdminRoute: f.isStoreOwnerAdminRoute,
      isMainColumnViewportLocked: f.isMainColumnViewportLocked,
    });
    const hub = resolvesMainHubScrollColumn({
      regionBarInLayout: true,
      mainScrollInMainColumn: mainScroll,
      isChatRoomDetail: f.isChatRoomDetail,
    });
    expect(f.isChatRoomDetail).toBe(true);
    expect(hub).toBe(false);
    expect(f.showRegionBar).toBe(false);
  });

  it("AddressSelectClient uses inlineChrome Type B contract (self-render safe-top)", () => {
    const client = read("components/map/AddressSelectClient.tsx");
    const openTags = client.match(/<MySubpageHeader\b/g) ?? [];
    expect(openTags.length).toBe(2);
    expect((client.match(/\binlineChrome\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((client.match(/registerMainTier1=\{false\}/g) ?? []).length).toBeGreaterThanOrEqual(2);

    const my = read("components/my/MySubpageHeader.tsx");
    expect(my).toContain("DELIVERY_LOCKED_SUBPAGE_HEADER_CLASS");
    expect(my).toMatch(/if \(inlineChrome \|\| !tier1Provider\)/);
  });
});
