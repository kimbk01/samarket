import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMainTier1Subpage } from "@/lib/layout/resolve-main-tier1";
import { getMobileTopTier1RuleSet } from "@/lib/layout/mobile-top-tier1-rules";

/**
 * 크롬 S2 (2026-11-02) — 전역 1단이 보이는 화면에 페이지 자체 헤더(두 번째 ‹ 줄)를 두지 않는다.
 * docs/audit/dibay-chrome-header-tab-bottomnav-audit-2026-11-02.md §1-3 H-R1 · §7-5
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("chrome S2 — no duplicate page header under the global tier1", () => {
  it("events · services · group chat room · feature list show the global tier1 (not suppressed)", () => {
    for (const p of ["/events", "/events/abc", "/services", "/group-chat/room-1", "/features/x"]) {
      expect(getMobileTopTier1RuleSet(p).showRegionBar, p).toBe(true);
    }
  });

  it("global tier1 has a real title and back target for events/services (no 'content unavailable')", () => {
    expect(resolveMainTier1Subpage("/events")).toMatchObject({ titleText: "tier1_events", backHref: "/market" });
    expect(resolveMainTier1Subpage("/events/abc")).toMatchObject({ titleText: "tier1_events", backHref: "/events" });
    expect(resolveMainTier1Subpage("/services")).toMatchObject({ titleText: "tier1_all_services" });
  });

  it("those pages no longer render their own back button / header row", () => {
    for (const rel of [
      "components/platform-events/PlatformEventBoardClient.tsx",
      "components/platform-events/PlatformEventDetailPageClient.tsx",
      "app/(main)/services/AllServicesContent.tsx",
      "components/group-chat/GroupChatRoomClient.tsx",
    ]) {
      const src = read(rel);
      expect(src, rel).not.toContain("AppBackButton");
      expect(src, rel).not.toContain("<header");
    }
    expect(read("components/group-chat/GroupChatRoomClient.tsx")).toContain("useRegisterMainTier1Header(");
  });

  it("feature category list registers its title in tier1 — the second back row is gone", () => {
    expect(existsSync(join(ROOT, "components/category/CategoryListSubheader.tsx"))).toBe(false);
    expect(read("components/layout/AppStickyHeader.tsx")).not.toContain("CategoryListSubheader");
    expect(read("components/category/CategoryListLayout.tsx")).toContain("useRegisterMainTier1Header(");
  });

  it("messenger opened from the community header uses the standard DetailHeader (embedded — stack owns safe-top)", () => {
    const src = read("components/community-messenger/CommunityMessengerHome.tsx");
    expect(src).toMatch(/<DetailHeader\s+embedded\s+title=\{t\("nav_bottom_messenger"\)\}/);
    expect(src).not.toContain("AppBackButton");
  });

  it("split top bar title uses the header title tokens (no hand-copied 17px/600)", () => {
    const src = read("components/community-messenger/MessengerSplitTopBar.tsx");
    expect(src).toContain("var(--sector-header-title-size)");
    expect(src).not.toContain("text-[17px]");
  });
});
