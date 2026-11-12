/**
 * D1 S2 (Owner 승인 2026-11-12 · docs/audit/d1-root-cause-total-design-2026-11-12.md §2 S2)
 * 보관 허브를 CSS 로 숨기고, 숨김 중 돌면 안 되는 효과(분류표 HIGH — docs/audit/d1-s2-hub-effects-inventory-2026-11-12.md)는
 * `useHubActive` 로 멈춘다. 포털은 `HubPortalGate`(또는 활성 조건)로 같이 숨긴다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const gated = JSON.parse(read("lib/layout/__tests__/fixtures/d1-s2-gated-files.json")) as string[];

describe("D1 S2 허브 CSS 숨김 + 활성 신호", () => {
  it("보관대는 Activity 대신 display:none/contents + HubActiveContext", () => {
    const src = read("components/layout/HubRetentionStack.tsx");
    expect(src).not.toMatch(/<Activity\b/);
    expect(src).toContain('const HUB_HIDDEN_STYLE = { display: "none" } as const;');
    expect(src).toContain('const HUB_VISIBLE_STYLE = { display: "contents" } as const;');
    expect(src).toContain("<HubActiveContext.Provider value={visible}>");
  });

  it("분류표 HIGH 효과가 있는 파일은 모두 활성 신호를 쓴다", () => {
    expect(gated.length).toBeGreaterThanOrEqual(60);
    for (const f of gated) {
      expect(read(f), f).toMatch(/useHubActive\(\)/);
    }
  });

  it("허브 트리 안 포털은 숨김 문 또는 활성 조건을 거친다", () => {
    const portals: Array<[string, RegExp]> = [
      ["components/ui/dibay-overlay/DibayOverlayRoot.tsx", /<HubPortalGate>/],
      ["components/common/media/PostImageViewer.tsx", /createPortal\(<HubPortalGate>\{node\}<\/HubPortalGate>/],
      ["components/layout/BodyPortal.tsx", /createPortal\(<HubPortalGate>\{children\}<\/HubPortalGate>/],
      ["components/stores/browse/StoreListFilterChips.tsx", /<HubPortalGate>/],
      ["components/stores/commerce/StoreCommerceBottomActionShell.tsx", /<HubPortalGate>\{shell\}<\/HubPortalGate>/],
      ["components/stores/detail/CategoryStickyTabs.tsx", /<HubPortalGate>/],
      ["components/stores/store-order-detail/StoreOrderStickyHeader.tsx", /<HubPortalGate>\{header\}<\/HubPortalGate>/],
      ["components/philife/PhilifeHeaderNotificationInbox.tsx", /<HubPortalGate>/],
      ["components/community/CommunityFeed.tsx", /allSortOpen && allSortMenuPos && hubActive/],
    ];
    for (const [f, re] of portals) expect(read(f), f).toMatch(re);
  });

  it("구독이 네트워크를 시작하는 저장소는 숨김 중 빈 구독", () => {
    expect(read("lib/stores/use-owner-lite-store.ts")).toMatch(/hubActive \? subscribeOwnerLiteStore : noopHubSubscribe/);
    expect(read("lib/chats/use-owner-hub-badge-total.ts")).toMatch(/hubActive \? subscribeOwnerHubBadge : noopHubSubscribe/);
    expect(read("components/philife/PhilifeHeaderNotificationInbox.tsx")).toMatch(
      /hubActive \? subscribeNotificationBadgeCount : noopHubSubscribe/
    );
  });

  it("허브 밖(Provider 없음)은 항상 활성 — 다른 화면 동작 변화 없음", () => {
    expect(read("lib/layout/hub-active-context.ts")).toContain("createContext<boolean>(true)");
  });
});
