import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 검사한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatAdminPointBucketLine } from "@/lib/admin/points/admin-point-bucket-line";
import { adminPointBucketsFromSumsByKind } from "@/lib/admin/points/admin-point-ledger-bucket-sums";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("실기 A-7 — 관리자 포인트 원장 목록 칸별 합계 (DB 함수 1회 · sums_by_kind)", () => {
  it("운영 값 (11월: 관리자 지급 +1 · 관리자 회수 −2,001 3건 · 커뮤니티 보상 +57 · 상위노출 사용 −500)", () => {
    // 운영 DB 에서 같은 SQL 본문으로 뽑은 묶음 (2026-11-03 PHT)
    const b = adminPointBucketsFromSumsByKind([
      { entry_type: "admin_credit", related_type: "admin_manual", hold_captured: false, amount_in: 1, amount_out: 0, count: 1 },
      { entry_type: "admin_debit", related_type: "admin_manual", hold_captured: false, amount_in: 0, amount_out: -2001, count: 3 },
      { entry_type: "reward", related_type: "community_reward", hold_captured: false, amount_in: 57, amount_out: 0, count: 14 },
      { entry_type: "spend", related_type: "promotion_order", hold_captured: false, amount_in: 0, amount_out: -500, count: 1 },
    ])!;
    expect(b.grant).toBe(58);
    expect(b.reclaim).toBe(2001);
    expect(b.use).toBe(500);
    expect(b.rows).toBe(19);
    expect(formatAdminPointBucketLine(b, (n) => n.toLocaleString("en-US"))).toBe("지급 +58 P · 사용 −500 P · 회수·차감 −2,001 P");
  });

  it("보류: 확정 보류 = 사용, 미확정 보류 − 해제 = 보류 중 (회원 화면과 같은 규칙)", () => {
    const b = adminPointBucketsFromSumsByKind([
      { entry_type: "ad_hold", related_type: "feed_ad_request", hold_captured: true, amount_in: 0, amount_out: -282000, count: 30 },
      { entry_type: "ad_hold", related_type: "feed_ad_request", hold_captured: false, amount_in: 0, amount_out: -260000, count: 30 },
      { entry_type: "ad_hold_release", related_type: "feed_ad_request", hold_captured: false, amount_in: 154000, amount_out: 0, count: 17 },
    ])!;
    expect(b.use).toBe(282000);
    expect(b.hold).toBe(106000);
    expect(b.refund).toBe(0);
  });

  it("구 DB 함수(sums_by_kind 없음) → null (칸별 줄 숨김, 지어내지 않음)", () => {
    expect(adminPointBucketsFromSumsByKind(undefined)).toBeNull();
  });

  it("목록 경로는 DB 함수 1회 — 칸별 합계도 그 결과에서 (R7 계약 유지)", () => {
    for (const f of ["app/api/admin/trade/points/route.ts", "app/api/admin/community/points/route.ts"]) {
      const src = read(f);
      expect(src, f).toContain("adminPointBucketsFromSumsByKind(res.sums_by_kind)");
      expect(src.match(/sb\.rpc\(/g)?.length, f).toBe(1);
    }
    const sql = read("supabase/migrations/20271104140000_admin_point_ledger_domain_page_sums_by_kind.sql");
    expect(sql).toContain("'sums_by_kind'");
    expect(sql).toContain("'hold_captured'");
  });

  it("거래·커뮤니티 포인트 목록·회원 상세 포인트 = 절대 시각(PHT) + 칸별 합계 줄", () => {
    for (const f of ["components/admin/trade/points/TradePointsPage.tsx", "components/admin/community/points/AdminCommunityPointsPage.tsx"]) {
      const src = read(f);
      expect(src, f).toContain("<CommunityTimeCell iso={r.createdAt} absolute />");
      expect(src, f).toContain("formatAdminPointBucketLine");
    }
    expect(read("components/admin/trade/members/TradeMemberDetailPage.tsx")).toContain("<CommunityTimeCell iso={s(r.createdAt) || null} absolute />");
    expect(read("components/admin/community/members/AdminCommunityMemberDetailPage.tsx")).toContain("<CommunityTimeCell iso={s(r.created_at)} absolute />");
  });
});

describe("실기 A-9 — 주문 돈 흐름 머리글 시각", () => {
  it("UTC 원문(`{chain.date}`·`{ev.at}`)을 그대로 출력하지 않는다", () => {
    for (const f of ["components/finance/OrderMoneyChainView.tsx"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/\{chain\.date\}/);
      expect(src, f).not.toMatch(/>\{ev\.at\}</);
      expect(src, f).toContain("formatAdminManilaDateTime(chain.date)");
    }
  });
});
