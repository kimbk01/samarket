/**
 * Chrome title coverage — SOURCE contract.
 * Every chrome-relevant route must have a semantic title authority:
 * MAIN HUB / Delivery specialty / MainTier1 suppress local / resolve titleText non-empty.
 * Brand "dibaY" silent fallback is forbidden.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMainTier1Subpage } from "@/lib/layout/resolve-main-tier1";
import { resolveMainTabKeepAliveHub } from "@/lib/layout/resolve-main-surface";
import {
  getMobileTopTier1RuleSet,
  isTradeFloatingMenuSurface,
} from "@/lib/layout/mobile-top-tier1-rules";
import { isStoresBrowseHeaderPath } from "@/lib/design/delivery-chrome";

/** Representative chrome-relevant routes (110 inventory; patterns cover dynamic segments). */
export const DIBAY_CHROME_TITLE_COVERAGE_ROUTES: readonly string[] = [
  "/",
  "/home",
  "/community",
  "/philife",
  "/philife/my",
  "/philife/purchases",
  "/philife/sales",
  "/philife/reviews",
  "/philife/write",
  "/philife/00000000-0000-4000-8000-000000000001",
  "/community/posts/00000000-0000-4000-8000-000000000001",
  "/market",
  "/market/electronics",
  "/market/trade-meet-spot",
  "/post/x",
  "/write",
  "/write/c1",
  "/products/new",
  "/products/x/edit",
  "/posts/new",
  "/stores",
  "/stores/browse/restaurant",
  "/stores/search",
  "/stores/slug",
  "/stores/slug/info",
  "/stores/slug/reviews",
  "/stores/slug/p/p1",
  "/stores/slug/cart",
  "/stores/cart",
  "/stores/slug/order/o1",
  "/stores/slug/order/complete",
  "/stores/slug/report",
  "/orders",
  "/orders/store/o1/review",
  "/orders/store/o1/chat",
  "/community-messenger",
  "/community-messenger/trade-chats",
  "/community-messenger/delivery-chats",
  "/community-messenger/rooms/r1",
  "/community-messenger/calls/s1",
  "/community-messenger/calls/logs",
  "/community-messenger/calls/outgoing",
  "/community-messenger/calls-v3/c1",
  "/community-messenger/calls-v4/c1",
  "/chats/r1",
  "/group-chat/r1",
  "/group/tok",
  "/mypage",
  "/my",
  "/mypage/section/account",
  "/mypage/section/account/profile",
  "/mypage/section/account/profile/edit",
  "/mypage/trade",
  "/mypage/trade/purchases",
  "/mypage/trade/sales",
  "/mypage/trade/reviews",
  "/mypage/trade/favorites",
  "/mypage/purchases/c1",
  "/mypage/account",
  "/mypage/required/dibay-id",
  "/mypage/required/phone",
  "/mypage/addresses",
  "/mypage/addresses/edit",
  "/mypage/addresses/search",
  "/mypage/points",
  "/mypage/points/charge",
  "/mypage/points/expiring",
  "/mypage/points/promotions",
  "/mypage/ads",
  "/mypage/ads/apply",
  "/mypage/ads/feed-request",
  "/mypage/benefits",
  "/mypage/trust",
  "/mypage/products",
  "/mypage/recent-viewed",
  "/mypage/offers",
  "/mypage/offers/received",
  "/mypage/offers/sent",
  "/mypage/community-posts",
  "/mypage/community-activity",
  "/mypage/store-orders",
  "/mypage/store-orders/o1",
  "/mypage/store-orders/o1/chat",
  "/mypage/store-orders/o1/review",
  "/mypage/store-inquiries",
  "/mypage/customer-center",
  "/mypage/customer-center/notice",
  "/mypage/customer-center/notice/1",
  "/mypage/customer-center/system",
  "/mypage/customer-center/system/1",
  "/mypage/customer-center/marketing",
  "/mypage/customer-center/marketing/1",
  "/mypage/inbox",
  "/mypage/inbox/t1",
  "/mypage/inquiries",
  "/mypage/inquiries/t1",
  "/mypage/notices/n1",
  "/mypage/order-notifications",
  "/notifications",
  "/notifications/n1",
  "/notifications/notes/t1",
  "/onboarding/address",
  "/onboarding/profile",
  "/onboarding/username",
  "/address/select",
  "/u/user",
  "/my/ads/apply",
  "/my/store-orders/o1",
  "/my/store-orders/o1/review",
  "/philife/purchases/x",
];

export type ChromeTitleAuthority =
  | "main_hub"
  | "delivery_special"
  | "tier1_suppressed_local"
  | "resolve_title"
  | "extras_required";

/**
 * Routes that rely on page extras (not resolve alone) — each entry carries SOURCE evidence:
 * - `registers`: one of `files` registers a tier1 title (`MySubpageHeader`/`MyScreen` without
 *   `registerMainTier1={false}`, or `setMainTier1Extras({ tier1: { title… } })`).
 * - `redirect`: the page only redirects (never paints chrome) — file must contain `redirect(`.
 * A route listed here without matching source evidence FAILS (no false PASS — `/home` was one).
 */
type ExtrasEvidence =
  | { kind: "registers"; files: readonly string[] }
  | { kind: "redirect"; file: string };

const EXTRAS_REQUIRED: Readonly<Record<string, ExtrasEvidence>> = {
  "/philife/purchases": { kind: "redirect", file: "app/(main)/philife/purchases/page.tsx" },
  "/philife/purchases/x": { kind: "redirect", file: "app/(main)/philife/purchases/[chatId]/page.tsx" },
  "/philife/sales": { kind: "registers", files: ["app/(main)/philife/sales/page.tsx"] },
  "/philife/reviews": { kind: "registers", files: ["app/(main)/philife/reviews/page.tsx"] },
  "/community/posts/00000000-0000-4000-8000-000000000001": {
    kind: "registers",
    files: ["components/community/post-detail/CommunityPostDetailHeader.tsx"],
  },
  "/mypage/offers/received": { kind: "redirect", file: "app/(main)/mypage/offers/received/page.tsx" },
  "/mypage/offers/sent": { kind: "redirect", file: "app/(main)/mypage/offers/sent/page.tsx" },
  "/mypage/store-orders/o1/chat": {
    kind: "redirect",
    file: "app/(main)/mypage/store-orders/[orderId]/chat/page.tsx",
  },
  "/notifications": { kind: "registers", files: ["app/(main)/notifications/page.tsx"] },
  "/notifications/n1": { kind: "registers", files: ["app/(main)/notifications/[notificationId]/page.tsx"] },
  "/notifications/notes/t1": {
    kind: "redirect",
    file: "app/(main)/notifications/notes/[threadId]/page.tsx",
  },
  "/onboarding/address": { kind: "redirect", file: "app/(main)/onboarding/address/page.tsx" },
  "/onboarding/username": { kind: "redirect", file: "app/(main)/onboarding/username/page.tsx" },
};

/**
 * 1단 제목 누락 경로 — 2026-10-20 9경로 등록으로 0건. 새 누락이 생기면 이 목록이 아니라 제목을 등록한다.
 * 테스트가 이 목록과 실제 누락 집합의 **일치**를 강제.
 */
export const KNOWN_TIER1_TITLE_GAPS: readonly string[] = [];

const TIER1_TITLE_REGISTRATION_RE =
  /<(?:MySubpageHeader|MyScreen)\b(?![^>]*registerMainTier1=\{false\})[^>]*\btitle(?:Key)?=|setMainTier1Extras\(\{\s*tier1:\s*\{[^}]*\btitle(?:Text)?:/;

function hasExtrasSourceEvidence(evidence: ExtrasEvidence): boolean {
  if (evidence.kind === "redirect") {
    return /\bredirect\(/.test(readFileSync(join(process.cwd(), evidence.file), "utf8"));
  }
  return evidence.files.some((f) =>
    TIER1_TITLE_REGISTRATION_RE.test(readFileSync(join(process.cwd(), f), "utf8"))
  );
}

export function resolveChromeTitleAuthority(pathname: string): ChromeTitleAuthority {
  const hub = resolveMainTabKeepAliveHub(pathname);
  if (hub === "community" || hub === "trade" || hub === "chat" || hub === "mypage") {
    return "main_hub";
  }
  const rules = getMobileTopTier1RuleSet(pathname);
  /** Match RegionBar MAIN HUB branch for trade floating surfaces (e.g. `/market/[slug]`). */
  if (
    isTradeFloatingMenuSurface(pathname) &&
    rules.showRegionPicker &&
    !rules.showTradeHubLeading
  ) {
    return "main_hub";
  }
  if (pathname === "/stores" || isStoresBrowseHeaderPath(pathname) || pathname.startsWith("/stores/search")) {
    return "delivery_special";
  }
  if (!rules.showRegionBar) {
    return "tier1_suppressed_local";
  }
  const resolved = resolveMainTier1Subpage(pathname);
  if (resolved && resolved.titleText.trim() && resolved.titleText !== "dibaY") {
    return "resolve_title";
  }
  const evidence = EXTRAS_REQUIRED[pathname];
  if (evidence && hasExtrasSourceEvidence(evidence)) {
    return "extras_required";
  }
  throw new Error(`Chrome title authority missing for ${pathname}`);
}

describe("dibay chrome title coverage", () => {
  it("covers inventory routes with non-missing title authority", () => {
    expect(DIBAY_CHROME_TITLE_COVERAGE_ROUTES.length).toBeGreaterThanOrEqual(110);
    const missing: string[] = [];
    for (const route of DIBAY_CHROME_TITLE_COVERAGE_ROUTES) {
      try {
        resolveChromeTitleAuthority(route);
      } catch {
        missing.push(route);
      }
    }
    expect(missing).toEqual([...KNOWN_TIER1_TITLE_GAPS]);
  });

  it("every EXTRAS_REQUIRED route has source evidence (no false PASS)", () => {
    const noEvidence = Object.entries(EXTRAS_REQUIRED)
      .filter(([, ev]) => !hasExtrasSourceEvidence(ev))
      .map(([route]) => route);
    expect(noEvidence).toEqual([]);
  });

  it("/home is the community MAIN HUB (same as `/`), not an extras route", () => {
    expect(resolveChromeTitleAuthority("/home")).toBe("main_hub");
    expect(resolveChromeTitleAuthority("/")).toBe("main_hub");
    expect(EXTRAS_REQUIRED["/home"]).toBeUndefined();
  });

  it("mypage section routes resolve a title in the route table (`/mypage/section/` bug)", () => {
    expect(resolveChromeTitleAuthority("/mypage/section/account")).toBe("resolve_title");
    expect(resolveMainTier1Subpage("/mypage/section/zzz/unknown")?.titleText).toBe("tier1_myinfo");
  });

  it("maps trade hub children via resolve (no empty title)", () => {
    for (const p of [
      "/mypage/trade/sales",
      "/mypage/trade/purchases",
      "/mypage/trade/favorites",
      "/mypage/trade/reviews",
    ]) {
      const r = resolveMainTier1Subpage(p);
      expect(r?.titleText.trim()).toBeTruthy();
      expect(r?.titleText).not.toBe("dibaY");
    }
  });

  it("forbids RegionBar brand dibaY silent fallback", () => {
    const src = readFileSync(join(process.cwd(), "components/layout/RegionBar.tsx"), "utf8");
    expect(src).not.toMatch(/["']dibaY["']/);
  });
});
