import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MYPAGE_IA_CATEGORIES, MYPAGE_IA_GUEST_PUBLIC_ROWS } from "@/lib/mypage/mypage-ia";
import {
  mypageHomeCountRowProps,
  resolveMypageHomeCountValue,
  resolveMypageHomePointsValue,
} from "@/lib/mypage/mypage-home-row-values";
import type { MypageHomeSummaryState } from "@/lib/mypage/mypage-home-summary-client";

const root = process.cwd();

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

describe("분류 행 — HARD LOCK / IA guards", () => {
  const allRows = MYPAGE_IA_CATEGORIES.flatMap((c) => c.groups.flatMap((g) => g.rows));
  const linkRows = allRows.filter((r): r is Extract<typeof r, { href: string }> => "href" in r);

  it("거래 첫 행 = 진행중 거래 `/mypage/products` 직행 (§2.1)", () => {
    const trade = MYPAGE_IA_CATEGORIES.find((c) => c.id === "trade")!;
    const first = trade.groups[0]!.rows[0]!;
    expect("href" in first ? first.href : null).toBe("/mypage/products");
    expect(linkRows.map((r) => r.href)).not.toContain("/mypage/trade/sales");
  });

  it("UI-6: 구매 내역 행 없음", () => {
    expect(linkRows.some((r) => /purchase/i.test(r.href))).toBe(false);
    const src = readFileSync(path.join(root, "lib/mypage/mypage-ia.ts"), "utf8");
    expect(src).not.toContain("mypage_comp_nav_sec_trade_purchases_label");
  });

  it("한 분류 안에서는 같은 아이콘을 두 번 쓰지 않는다", () => {
    for (const cat of MYPAGE_IA_CATEGORIES) {
      const icons = cat.groups.flatMap((g) => g.rows).flatMap((r) => ("icon" in r ? [r.icon] : []));
      const dup = icons.filter((v, i) => icons.indexOf(v) !== i && v !== "users" && v !== "user-block");
      expect(dup, cat.id).toEqual([]);
    }
  });

  it("언어 행은 토글(K4/X4) — 「설정·지원」 분류", () => {
    const settings = MYPAGE_IA_CATEGORIES.find((c) => c.id === "settings")!;
    expect(settings.groups.some((g) => g.rows.some((r) => "kind" in r && r.kind === "language-toggle"))).toBe(true);
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
