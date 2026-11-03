/**
 * 광고 S-3 (Owner 「S-3 진행」 2026-11-03) — 피드 배너 수용량 남은 경로 · 커뮤니티 승인형 중복 검사.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { feedAdPoolTargetKey, isFeedAdPoolCapacityDbError } from "@/lib/ads/feed-ad-pool-capacity";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("피드 배너 풀 = 위치 + 대상", () => {
  it("업종·주제는 대상별, 홈은 대상 없음", () => {
    expect(feedAdPoolTargetKey("TRADE_CATEGORY", { targetCategoryId: "c1", targetTopicSlug: "x" })).toBe("c1");
    expect(feedAdPoolTargetKey("COMMUNITY_TOPIC", { targetCategoryId: "c1", targetTopicSlug: "t1" })).toBe("t1");
    expect(feedAdPoolTargetKey("TRADE_HOME", { targetCategoryId: "c1" })).toBe("");
  });
  it("DB 트리거 오류를 「자리 없음」으로 알아본다", () => {
    expect(isFeedAdPoolCapacityDbError({ message: "feed_ad_pool_capacity_full" })).toBe(true);
    expect(isFeedAdPoolCapacityDbError({ message: "other" })).toBe(false);
    expect(isFeedAdPoolCapacityDbError(null)).toBe(false);
  });
});

describe("모든 경로가 같은 검사", () => {
  it("DB 트리거: 점유가 되는 INSERT/UPDATE 만 · 같은 풀 잠금 · 기존 점유 행 수정은 통과", () => {
    const sql = read("supabase/migrations/20271104040000_feed_ad_pool_capacity_guard.sql");
    expect(sql).toContain("pg_advisory_xact_lock(hashtext('feed_ad_pool:' || v_place || ':' || v_target))");
    expect(sql).toContain("NOT IN ('', 'ended', 'rejected', 'draft')");
    expect(sql).toContain("BEFORE INSERT OR UPDATE OF status, end_at, placement, target_category_id, target_topic_slug");
    expect(sql).toMatch(/IF v_old_occ[\s\S]+RETURN NEW;/);
  });
  it("회원 연장: 끝난 광고를 다시 켤 때 결제 전에 자리 확인 · 막히면 capacity_full", () => {
    const renew = read("lib/ads/renew-feed-ad-campaign.ts");
    expect(renew.indexOf("assertFeedAdPoolCapacityAvailable(")).toBeGreaterThan(0);
    expect(renew.indexOf("assertFeedAdPoolCapacityAvailable(")).toBeLessThan(renew.indexOf("const spent = await spendUserPoints"));
    expect(renew).toContain('if (isFeedAdPoolCapacityDbError(updErr)) {');
    expect(read("app/(main)/mypage/ads/MyAdsPageClient.tsx")).toContain('j.error === "capacity_full"');
  });
  it("이벤트 배포·어드민 등록·승인: DB 가 막으면 capacity_full", () => {
    const ev = read("lib/platform-promotion-distribution/save-event-distribution.ts");
    expect(ev.match(/isFeedAdPoolCapacityDbError\(error\)/g)?.length).toBe(2);
    expect(read("app/api/admin/feed-ads/route.ts")).toContain("isFeedAdPoolCapacityDbError(error)");
    expect(read("lib/ads/approve-feed-ad-request.ts")).toContain("isFeedAdPoolCapacityDbError(actErr)");
    expect(read("components/admin/platform-events/AdminPlatformEventDistributionPanel.tsx")).toContain(
      'adminOperatorErrorMessage(r.error || "FAIL"'
    );
  });
  it("등록 화면도 같은 풀(위치 + 대상)로 센다", () => {
    const page = read("components/admin/ads/AdminFeedAdCreatePage.tsx");
    expect(page).toContain("`${p}|${feedAdPoolTargetKey(p, c)}`");
  });
});

describe("커뮤니티 승인형 신청 중복 검사", () => {
  it("일시정지 주문도 중복 (즉시 결제형 DB 함수와 같음)", () => {
    expect(read("lib/promotion/apply-community-paid-exposure.ts")).toContain(
      '.in("order_status", ["pending_review", "active", "paused"])'
    );
  });
});
