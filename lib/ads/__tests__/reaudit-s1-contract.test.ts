/**
 * 재감사 S-1 (Owner 「S-1 진행」 2026-11-03) — P1 결함 묶음.
 * F-1 광고주 이름 · F-2 우선순위 안내 · F-3 서버 수용량 · C-1 커뮤니티 주제 탭 · P-a/P-b 팝업 · I-a 인트로 편집 보호 · H-5 링크.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { feedAdAdvertiserDisplayName, memberFeedAdCampaignName } from "@/lib/ads/feed-ad-advertiser-name";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("F-1 피드 광고주 이름 — 내부 코드가 고객에게 보이지 않는다", () => {
  it("회원 신청 코드 이름은 빈 값(머리에 「광고」), 이벤트 접두어는 제목만", () => {
    expect(feedAdAdvertiserDisplayName("Member · feed_banner_trade_7")).toBe("");
    expect(feedAdAdvertiserDisplayName("Event banner · 가을 세일")).toBe("가을 세일");
    expect(feedAdAdvertiserDisplayName("  DIBAY 마켓 ")).toBe("DIBAY 마켓");
    expect(feedAdAdvertiserDisplayName(null)).toBe("");
  });
  it("새 회원 신청 승인은 신청 회원 닉네임, 이벤트 배포는 이벤트 제목으로 이름을 만든다", () => {
    expect(memberFeedAdCampaignName(" 철수네 ")).toBe("철수네");
    expect(read("lib/ads/approve-feed-ad-request.ts")).toContain("name: campaignName,");
    expect(read("lib/ads/approve-feed-ad-request.ts")).not.toContain("Member · ");
    expect(read("lib/platform-promotion-distribution/adapters.ts")).not.toContain("Event banner · ");
  });
  it("피드 배너 머리·대체 문구는 표시용 이름을 쓴다", () => {
    const c = read("components/ads/FeedAdBannerCarousel.tsx");
    expect(c).toContain("const advertiserName = feedAdAdvertiserDisplayName(currentCampaign.name);");
    expect(c).toContain("{advertiserName || adLabel}");
    expect(c).not.toContain("currentCampaign.name.trim()");
  });
});

describe("F-2 · F-3 피드 배너 우선순위 안내 · 서버 수용량", () => {
  it("F-2: 수정 화면 안내가 실제 동작(공정 회전, 후보 50개 초과 때만 사용)과 같다", () => {
    const edit = read("components/admin/feed-ads/AdminFeedAdEditPage.tsx");
    expect(edit).not.toContain("우선순위 (작을수록 먼저)");
    expect(edit).toContain("후보가 50개를 넘을 때 먼저 남길 순서");
  });
  it("F-3: 어드민 진행 중 등록·회원 신청 승인이 서버에서 수용량을 검사한다", () => {
    expect(read("app/api/admin/feed-ads/route.ts")).toMatch(
      /if \(body\.status === "active"\) \{\s*const cap = await assertFeedAdPoolCapacityAvailable\(sb, placement\);/
    );
    const approve = read("lib/ads/approve-feed-ad-request.ts");
    expect(approve.indexOf("assertFeedAdPoolCapacityAvailable(sb")).toBeLessThan(approve.indexOf("// Claim (F6)"));
    expect(read("lib/ads/feed-ad-pool-capacity-server.ts")).toContain("feedAdPoolOccupiesCampaign(");
    expect(read("lib/admin/operator-ux/operator-labels.ts")).toContain("capacity_full:");
  });
});

describe("C-1 커뮤니티 주제 탭 — 주제로 거른 뒤 개수를 자른다", () => {
  it("후보는 넉넉히 읽고, 공개·주제 조건 뒤 limit", () => {
    const f = read("lib/promotion/community-paid-exposure-feed.ts");
    expect(f).toContain(".limit(candidateWindow)");
    expect(f).toMatch(/return !topicFilter \|\| topicMatches\(topicSlug, topicFilter\);\s*\}\)\s*\.slice\(0, limit\)/);
  });
});

describe("P-a · P-b 팝업 호스트", () => {
  const host = read("components/platform-popup/GlobalPopupHost.tsx");
  it("P-a: 깨진 소재 캠페인은 이번 실행 동안 제외한다", () => {
    expect(host).toContain("brokenCreativeCampaignIdsRef.current.add(winner.campaignId)");
    expect(host).toContain("brokenCreativeCampaignIdsRef.current.has(winnerId)");
  });
  it("P-b: 응답을 버리거나 받아들이지 못하면 RESOLVING 에 머물지 않는다", () => {
    expect(host).toContain('setHostState((s) => (s === "RESOLVING" ? reducePlatformPopupHostState(s, { type: "INVALIDATE" }) : s));');
    expect(host).toContain("if (!acceptWinner(json.winner as ResolveWinner, generation, surfaceAtStart)) {");
  });
});

describe("I-a 인트로 어드민 — 서버 초안이 바뀐 때만 편집 문서를 바꾼다", () => {
  it("초안 id·version 이 같으면 편집 중인 문서를 유지", () => {
    const page = read("components/admin/launch-intro/LaunchIntroAdminPage.tsx");
    expect(page).toMatch(/if \(appliedDraftKeyRef\.current !== draftKey\) \{\s*appliedDraftKeyRef\.current = draftKey;\s*setDoc\(/);
  });
});

describe("H-5 막힌 링크", () => {
  it("광고 이력: 배달 상세 = /admin/delivery-ads/{id}, 상위노출 = 주문 집어 열기", () => {
    const t = read("lib/admin/ads-history/project-history-timeline.ts");
    expect(t).not.toContain("detailHref: `/admin/stores/delivery-ads/");
    expect(t).toContain("detailHref: DELIVERY_AD_ADMIN_ROUTES.detail(input.id)");
    expect(t).toContain("detailHref: adsBoostOrderDeepLinkHref(input.id)");
  });
  it("공통 화면 행: 피드 캠페인 = 수정 화면, 상위노출 = 주문 집어 열기", () => {
    const rows = read("lib/admin/ads-control-plane/project-family-rows.ts");
    expect(rows).not.toContain('href: "/admin/feed-ads",');
    expect(rows.match(/href: `\/admin\/feed-ads\/\$\{encodeURIComponent\(id\)\}\/edit`/g)?.length).toBe(2);
    expect(rows).toContain("href: adsBoostOrderDeepLinkHref(id)");
  });
});
