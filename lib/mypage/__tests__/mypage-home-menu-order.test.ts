import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMypageHomeMenuOrder,
  MYPAGE_HOME_ACCOUNT_ITEMS,
  MYPAGE_HOME_ASSET_ITEMS,
  MYPAGE_HOME_COMMUNITY_ITEMS,
  MYPAGE_HOME_DANGER_ITEMS,
  MYPAGE_HOME_MEMBER_GROUP_ORDER,
  MYPAGE_HOME_POLICY_ITEMS,
  MYPAGE_HOME_SERVICE_ITEMS,
  MYPAGE_HOME_STORE_TAIL_ITEMS,
  MYPAGE_HOME_SUPPORT_ITEMS,
  MYPAGE_HOME_TRADE_ITEMS,
} from "@/lib/mypage/mypage-home-menu-config";
import { MYPAGE_IA_CATEGORIES, MYPAGE_IA_GUEST_PUBLIC_ROWS } from "@/lib/mypage/mypage-ia";
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

describe("내정보 홈 = 분류 허브 (IA 2026-11-02)", () => {
  it("홈 순서: 프로필 → 필수 정보(항상) → 진행 중 4칸 → 배너 → 분류 카드 — 메뉴 행 나열 없음", () => {
    const src = readFileSync(path.join(root, "components/mypage/MyPageHomeDashboard.tsx"), "utf8");
    const jsx = src.slice(src.indexOf("return ("));
    const order = [
      "<MypageProfileSummary",
      "<MypageRequiredInfoSummary\n                projection={projection}",
      "<MyInfoHomeNowStrip",
      "<MypageHomeCmsBanner",
      "<MyInfoHomeCategoryGrid",
    ].map((needle) => jsx.indexOf(needle));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // 조회 실패 분기에도 필수정보 3행을 렌더 (real-screen-redesign §11)
    expect(jsx.indexOf("<MypageRequiredInfoSummary")).toBeGreaterThan(jsx.indexOf('data-testid="mypage-home-load-failed"'));
    for (const banned of [
      "<MyInfoTradeMenuSection",
      "<MyInfoAccountMenuSection",
      "<MyInfoServiceMenuSection",
      "<MyInfoDangerMenuSection",
      "<MyPageAdminMenuEntry",
    ]) {
      expect(jsx).not.toContain(banned);
    }
  });

  it("분류 카드 6개 = IA 분류 순서, 관리자 행은 「설정·지원」 분류 끝에만", () => {
    expect(MYPAGE_IA_CATEGORIES.map((c) => c.id)).toEqual(["trade", "community", "store", "asset", "account", "settings"]);
    const adminIn = MYPAGE_IA_CATEGORIES.filter((c) => c.groups.some((g) => g.rows.some((r) => "kind" in r && r.kind === "admin")));
    expect(adminIn.map((c) => c.id)).toEqual(["settings"]);
    const settings = MYPAGE_IA_CATEGORIES.find((c) => c.id === "settings")!;
    const lastRows = settings.groups.at(-1)!.rows;
    expect("kind" in lastRows.at(-1)! && lastRows.at(-1)!.kind).toBe("admin");
    expect(MYPAGE_IA_CATEGORIES.find((c) => c.id === "account")?.showRequiredInfo).toBe(true);
  });

  it("IA 구조 스냅샷", () => {
    const shape = MYPAGE_IA_CATEGORIES.map((c) => ({
      id: c.id,
      groups: c.groups.map((g) => ({
        title: g.titleKey,
        rows: g.rows.map((r) => ("href" in r ? `${String(r.titleKey)} → ${r.href}` : `kind:${r.kind}`)),
      })),
    }));
    expect(shape).toMatchSnapshot();
  });

  it("UI-6·C-4: 구매 내역 행 없음, 국가·맞춤·동영상 자동재생 행 없음", () => {
    const hrefs = MYPAGE_IA_CATEGORIES.flatMap((c) => c.groups.flatMap((g) => g.rows)).map((r) => ("href" in r ? r.href : ""));
    expect(hrefs.some((h) => /purchase/i.test(h))).toBe(false);
    expect(hrefs.some((h) => /video-autoplay|personalization|settings\/country/.test(h))).toBe(false);
  });
});

describe("비로그인 /mypage = 로그인 화면 (Owner 2026-11-02)", () => {
  it("로그인 본문 + 공개 행만 — 「—」 요약·회원 메뉴·관리자·로그아웃 없음", () => {
    const src = readFileSync(path.join(root, "components/mypage/MyPageGuestHomeDashboard.tsx"), "utf8");
    const jsx = src.slice(src.indexOf("return ("));
    expect(jsx).toContain("<AuthLoginPanel");
    expect(jsx).toContain("MYPAGE_IA_GUEST_PUBLIC_ROWS");
    for (const banned of [
      "MyInfoStatGrid",
      "MyInfoQuickAccessSection",
      "MyInfoAccountMenuSection",
      "MyInfoServiceMenuSection",
      "MyInfoStoreMenuSection",
      "MyInfoDangerMenuSection",
      "MyPageAdminMenuEntry",
      "LogoutActionTrigger",
    ]) {
      expect(jsx).not.toContain(banned);
    }
    for (const row of MYPAGE_IA_GUEST_PUBLIC_ROWS) {
      expect(row.href).toMatch(/^\/(mypage\/customer-center|mypage\/section\/settings\/(terms|version)|privacy|business-info)$/);
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
