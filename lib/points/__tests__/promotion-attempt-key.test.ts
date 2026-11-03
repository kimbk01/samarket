/**
 * 재감사 S-0 (X-1 · P0) — 상위노출 결제 요청 키: 같은 결제 시도는 같은 키, 결과가 확정된 뒤에만 새 키.
 * (R2 이후 광고 중 재결제 = 연장이라, 응답이 끊긴 뒤 새 키로 다시 보내면 한 번 더 차감됐다)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPromotionAttemptKeyStore } from "@/lib/points/promotion-attempt-key";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("createPromotionAttemptKeyStore", () => {
  let n = 0;
  const store = () => createPromotionAttemptKeyStore(() => `k${++n}`);

  it("응답을 못 받음(null)·5xx → 다시 눌러도 같은 키", () => {
    const s = store();
    const first = s.keyFor("post-1", "trade_promote_7");
    s.settleIfFinal(null);
    expect(s.keyFor("post-1", "trade_promote_7")).toBe(first);
    s.settleIfFinal(503);
    expect(s.keyFor("post-1", "trade_promote_7")).toBe(first);
  });

  it("성공·4xx(결과 확정) → 다음 결제는 새 키", () => {
    const s = store();
    const a = s.keyFor("post-1", "trade_promote_7");
    s.settleIfFinal(200);
    const b = s.keyFor("post-1", "trade_promote_7");
    expect(b).not.toBe(a);
    s.settleIfFinal(409);
    expect(s.keyFor("post-1", "trade_promote_7")).not.toBe(b);
  });

  it("재감사 R-01·R-02: 결과를 모르는 동안 상품이 바뀌어도 같은 키 · 그 상품을 알려 준다", () => {
    const s = store();
    const a = s.keyFor("post-1", "community_promote_7");
    s.settleIfFinal(null);
    expect(s.pendingProductFor("post-1")).toBe("community_promote_7");
    expect(s.keyFor("post-1", "community_promote_3")).toBe(a);
    expect(s.pendingProductFor("post-2")).toBeNull();
    s.settleIfFinal(200);
    expect(s.pendingProductFor("post-1")).toBeNull();
    expect(s.keyFor("post-1", "community_promote_3")).not.toBe(a);
  });

  it("다른 글 = 다른 시도(새 키) · reset = 처음부터", () => {
    const s = store();
    const a = s.keyFor("post-1", "trade_promote_7");
    expect(s.keyFor("post-2", "trade_promote_14")).not.toBe(a);
    const c = s.keyFor("post-2", "trade_promote_14");
    s.reset();
    expect(s.keyFor("post-2", "trade_promote_14")).not.toBe(c);
  });
});

describe("결제 화면 4곳이 같은 규칙을 쓴다", () => {
  const screens = [
    "components/trade/seller-ad/TradeAdQuickSheet.tsx",
    "components/post/MemberPostPromoteSheet.tsx",
    "app/(main)/mypage/points/promotions/page.tsx",
    "app/(main)/mypage/ads/apply/MyAdsApplyPageClient.tsx",
  ];
  it.each(screens)("%s: 클릭마다 새 키를 만들지 않고, 끝에 settleIfFinal(status)", (f) => {
    const src = read(f);
    expect(src).toContain("createPromotionAttemptKeyStore()");
    expect(src).toMatch(/attemptKeys\.current\.keyFor\(/);
    expect(src).toContain("attemptKeys.current.settleIfFinal(status)");
    expect(src).not.toMatch(/randomUUID\(\)/);
    expect(src).toContain('typeof j.ok !== "boolean"');
  });
  it("마이 신청 폼은 키를 만들지 않는다(화면이 붙임)", () => {
    expect(read("components/points/PointPromotionOrderForm.tsx")).not.toMatch(/randomUUID\(\)/);
  });
  it("판매자 창·커뮤니티 창은 응답을 못 받으면 상태를 다시 불러온다", () => {
    for (const f of screens.slice(0, 2)) {
      expect(read(f)).toMatch(/catch \{\s*\/\*\*[^*]*\*\/\s*await load\(\);/);
    }
  });
});

describe("H-1 — 전체 광고에서 거래 상위노출 종료도 귀책을 보낸다", () => {
  const ws = read("components/admin/ads/AdminAdvertisingWorkspace.tsx");
  it("종료 요청에 귀책 · 귀책·환급 미리보기 폼을 거래에도 쓴다", () => {
    expect(ws).toContain('action === "end" && (fam === "boost_community" || fam === "boost_trade") ? fault ?? undefined : undefined');
    expect(ws).toContain('boostEndFamily === "boost_community" || boostEndFamily === "boost_trade" ? pendingMutation : null');
    expect(ws).toContain("family: boostEndFamily,");
    expect(ws).toContain("j.refund_points");
  });
});
