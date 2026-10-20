import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMypageHomeMenuOrder,
  MYPAGE_HOME_ACCOUNT_ITEMS,
  MYPAGE_HOME_ASSET_ITEMS,
  MYPAGE_HOME_COMMUNITY_ITEMS,
  MYPAGE_HOME_DANGER_ITEMS,
  MYPAGE_HOME_GUEST_GROUP_ORDER,
  MYPAGE_HOME_MEMBER_GROUP_ORDER,
  MYPAGE_HOME_POLICY_ITEMS,
  MYPAGE_HOME_SERVICE_ITEMS,
  MYPAGE_HOME_STORE_TAIL_ITEMS,
  MYPAGE_HOME_SUPPORT_ITEMS,
  MYPAGE_HOME_TRADE_ITEMS,
} from "@/lib/mypage/mypage-home-menu-config";
import {
  mypageHomeCountRowProps,
  resolveMypageHomeCountValue,
  resolveMypageHomePointsValue,
} from "@/lib/mypage/mypage-home-row-values";
import type { MypageHomeSummaryState } from "@/lib/mypage/mypage-home-summary-client";

const root = process.cwd();

describe("mypage home menu order — snapshot per role", () => {
  it("guest", () => {
    expect(buildMypageHomeMenuOrder("guest")).toMatchSnapshot();
  });
  it("member", () => {
    expect(buildMypageHomeMenuOrder("member")).toMatchSnapshot();
  });
  it("owner (approved store → first store row = store enter)", () => {
    const order = buildMypageHomeMenuOrder("owner");
    expect(order.find((g) => g.group === "store_order")?.rows[0]).toBe("mypage_comp_menu_store_enter_title");
    expect(order).toMatchSnapshot();
  });
  it("admin (admin row last, after danger)", () => {
    const order = buildMypageHomeMenuOrder("admin");
    expect(order.map((g) => g.group)).toEqual([...MYPAGE_HOME_MEMBER_GROUP_ORDER]);
    expect(order.at(-1)?.group).toBe("admin");
    expect(order.at(-2)?.group).toBe("danger");
    expect(order).toMatchSnapshot();
  });
  it("member/owner have no admin group", () => {
    expect(buildMypageHomeMenuOrder("member").some((g) => g.group === "admin")).toBe(false);
    expect(buildMypageHomeMenuOrder("owner").some((g) => g.group === "admin")).toBe(false);
  });
});

describe("dashboard JSX follows MYPAGE_HOME_MEMBER_GROUP_ORDER", () => {
  it("component order = group order; admin entry rendered last", () => {
    const src = readFileSync(path.join(root, "components/mypage/MyPageHomeDashboard.tsx"), "utf8");
    const jsx = src.slice(src.indexOf("return ("));
    const componentForGroup: Record<string, string> = {
      identity: "<MypageProfileSummary",
      activity: "<MyInfoTradeMenuSection",
      store_order: "<MyInfoStoreMenuSection",
      assets: "<MypagePointsAssetSummary",
      account: "<MyInfoAccountMenuSection",
      service: "<MyInfoServiceMenuSection",
      support: "<MyInfoSupportMenuSection",
      policy: "<MyInfoPolicyMenuSection",
      danger: "<MyInfoDangerMenuSection",
      admin: "<MyPageAdminMenuEntry",
    };
    const idx = MYPAGE_HOME_MEMBER_GROUP_ORDER.map((g) => jsx.indexOf(componentForGroup[g]!));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    // 활동 = 거래+커뮤니티 한 그룹 — 홈에서 커뮤니티 섹션 별도 렌더 금지
    expect(jsx).not.toContain("<MyInfoCommunityMenuSection");
    // 배너 = 프로필 블록(필수정보 포함) 바로 아래
    // 조회 실패 분기에도 필수정보 3행을 렌더 (real-screen-redesign §11) — 정상 분기 순서는 마지막 등장 기준
    const req = jsx.lastIndexOf("<MypageRequiredInfoSummary");
    expect(jsx.indexOf("<MypageRequiredInfoSummary")).toBeGreaterThan(jsx.indexOf('data-testid="mypage-home-load-failed"'));
    const banner = jsx.indexOf("<MypageHomeCmsBanner");
    expect(req).toBeGreaterThan(jsx.indexOf("<MypageProfileSummary"));
    expect(banner).toBeGreaterThan(req);
    expect(banner).toBeLessThan(jsx.indexOf("<MyInfoTradeMenuSection"));
  });
});

describe("guest dashboard JSX follows MYPAGE_HOME_GUEST_GROUP_ORDER", () => {
  it("guest structure kept; no activity / assets / danger / admin", () => {
    const src = readFileSync(path.join(root, "components/mypage/MyPageGuestHomeDashboard.tsx"), "utf8");
    const jsx = src.slice(src.indexOf("return ("));
    const componentForGroup: Record<string, string> = {
      identity: "<MyInfoGuestProfileCard",
      guest_stats: "<MyInfoStatGrid",
      guest_quick: "<MyInfoQuickAccessSection",
      store_order: "<MyInfoStoreMenuSection",
      account: "<MyInfoAccountMenuSection",
      service: "<MyInfoServiceMenuSection",
      support: "<MyInfoSupportMenuSection",
      policy: "<MyInfoPolicyMenuSection",
    };
    const idx = MYPAGE_HOME_GUEST_GROUP_ORDER.map((g) => jsx.indexOf(componentForGroup[g]!));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(buildMypageHomeMenuOrder("guest").map((g) => g.group)).toEqual([...MYPAGE_HOME_GUEST_GROUP_ORDER]);
    for (const banned of ["MyInfoDangerMenuSection", "MyPageAdminMenuEntry", "MypagePointsAssetSummary", "LogoutActionTrigger"]) {
      expect(jsx).not.toContain(banned);
    }
  });
});

describe("home rows — HARD LOCK / IA guards", () => {
  it("activity: trade rows then community rows; first row goes straight to /mypage/products (§2.1)", () => {
    expect(MYPAGE_HOME_TRADE_ITEMS[0]?.href).toBe("/mypage/products");
    const all = [...MYPAGE_HOME_TRADE_ITEMS, ...MYPAGE_HOME_COMMUNITY_ITEMS].map((i) => i.href);
    expect(all).not.toContain("/mypage/trade/sales");
  });

  it("UI-6: no purchases row on home", () => {
    const hrefs = [...MYPAGE_HOME_TRADE_ITEMS, ...MYPAGE_HOME_COMMUNITY_ITEMS].map((i) => i.href);
    expect(hrefs.some((h) => /purchase/i.test(h))).toBe(false);
    const src = readFileSync(path.join(root, "lib/mypage/mypage-home-menu-config.ts"), "utf8");
    expect(src).not.toContain("mypage_comp_nav_sec_trade_purchases_label");
  });

  it("C-4: autoplay / personalization / country rows stay hidden on home", () => {
    const hrefs = [...MYPAGE_HOME_SERVICE_ITEMS, ...MYPAGE_HOME_ACCOUNT_ITEMS].map((i) =>
      "href" in i ? i.href : "",
    );
    expect(hrefs.some((h) => /video-autoplay|personalization|settings\/country/.test(h))).toBe(false);
  });

  it("one meaning one icon — no duplicate icons across home rows", () => {
    const icons = [
      ...MYPAGE_HOME_TRADE_ITEMS,
      ...MYPAGE_HOME_COMMUNITY_ITEMS,
      ...MYPAGE_HOME_STORE_TAIL_ITEMS,
      ...MYPAGE_HOME_ASSET_ITEMS,
      ...MYPAGE_HOME_ACCOUNT_ITEMS,
      ...MYPAGE_HOME_SERVICE_ITEMS,
      ...MYPAGE_HOME_SUPPORT_ITEMS,
      ...MYPAGE_HOME_POLICY_ITEMS,
      ...MYPAGE_HOME_DANGER_ITEMS,
    ].map((i) => i.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("language row stays a toggle (K4/X4) and shows the current value", () => {
    expect(MYPAGE_HOME_ACCOUNT_ITEMS.some((i) => i.kind === "language-toggle")).toBe(true);
    const src = readFileSync(path.join(root, "components/mypage/myinfo/MyInfoLanguageToggleRow.tsx"), "utf8");
    expect(src).toContain("aria-checked={active}");
    expect(src).toContain("data-current-language");
  });
});

describe("home row values — 0 is never a failure substitute", () => {
  const base: MypageHomeSummaryState = { viewerId: "u1", fields: null, fetchedAt: 1, loading: false, failed: false };
  const withFields = (fields: Record<string, unknown>): MypageHomeSummaryState => ({
    ...base,
    fields: fields as never,
  });

  it("count: >0 shown, known 0 hidden, unavailable empty, loading skeleton, hidden = no slot", () => {
    expect(resolveMypageHomeCountValue(withFields({ favoritesCount: { status: "ok", value: 3 } }), "favoritesCount")).toEqual(
      { kind: "count", count: 3 },
    );
    expect(resolveMypageHomeCountValue(withFields({ favoritesCount: { status: "ok", value: 0 } }), "favoritesCount")).toEqual(
      { kind: "empty" },
    );
    expect(
      resolveMypageHomeCountValue(withFields({ favoritesCount: { status: "unavailable" } }), "favoritesCount"),
    ).toEqual({ kind: "empty" });
    expect(resolveMypageHomeCountValue({ ...base, loading: true }, "favoritesCount")).toEqual({ kind: "loading" });
    expect(resolveMypageHomeCountValue({ ...base, failed: true }, "favoritesCount")).toEqual({ kind: "empty" });
    expect(resolveMypageHomeCountValue(withFields({ adsActiveCount: { status: "hidden" } }), "adsActiveCount")).toEqual({
      kind: "hidden",
    });
    expect(mypageHomeCountRowProps({ kind: "hidden" }, String)).toEqual({});
    expect(mypageHomeCountRowProps({ kind: "empty" }, String)).toEqual({ valueState: "empty" });
    expect(mypageHomeCountRowProps({ kind: "count", count: 4 }, (n) => `판매중 ${n}`)).toEqual({
      value: "판매중 4",
      valueState: "ready",
    });
  });

  it("points: amount incl. 0/negative; failure = unknown (\"—\")", () => {
    expect(resolveMypageHomePointsValue(withFields({ pointsBalance: { status: "ok", value: -5 } }))).toEqual({
      kind: "amount",
      amount: -5,
    });
    expect(resolveMypageHomePointsValue(withFields({ pointsBalance: { status: "unavailable" } }))).toEqual({
      kind: "unknown",
    });
    expect(resolveMypageHomePointsValue({ ...base, loading: true })).toEqual({ kind: "loading" });
  });
});
