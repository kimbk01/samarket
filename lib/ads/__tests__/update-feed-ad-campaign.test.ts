import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { planFeedAdCampaignPatch } from "@/lib/ads/update-feed-ad-campaign";

describe("피드 배너 수정 범위 (감사 AD-10 · Owner J-8)", () => {
  it("종료된 배너는 수정 불가", () => {
    expect(planFeedAdCampaignPatch({ status: "ended", source: "ADMIN_DIRECT" }, { name: "x" })).toMatchObject({
      ok: false,
      error: "campaign_ended",
      status: 409,
    });
  });

  it("회원 신청(유료) 배너는 소재만 — 캠페인 필드를 건드리면 거부", () => {
    const member = { status: "active" as const, source: "MEMBER_REQUESTED" as const };
    expect(planFeedAdCampaignPatch(member, { endAt: "2026-12-01T00:00:00Z" })).toMatchObject({
      ok: false,
      error: "member_requested_creative_only",
    });
    const ok = planFeedAdCampaignPatch(member, { slides: [{ sortOrder: 1, imageUrl: " https://x/a.png ", headline: "h" }] });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.campaign).toEqual({});
      expect(ok.slides).toEqual([{ sort_order: 1, image_url: "https://x/a.png", alt_text: "", headline: "h", is_active: true }]);
    }
  });

  it("관리자 직접 등록: 이름·우선순위·기간 반영, 종료 ≤ 시작은 거부", () => {
    const admin = { status: "active" as const, source: "ADMIN_DIRECT" as const };
    const plan = planFeedAdCampaignPatch(admin, {
      name: "  ",
      priority: 7.9,
      startAt: "2026-11-01T00:00:00Z",
      endAt: "2026-11-02T00:00:00Z",
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.campaign).toMatchObject({
        name: "Untitled",
        priority: 7,
        start_at: "2026-11-01T00:00:00Z",
        end_at: "2026-11-02T00:00:00Z",
      });
    }
    expect(
      planFeedAdCampaignPatch(admin, { startAt: "2026-11-02T00:00:00Z", endAt: "2026-11-01T00:00:00Z" })
    ).toMatchObject({ ok: false, error: "invalid_period" });
  });

  it("범위 밖 소재 순번은 무시, 빈 이미지는 비활성", () => {
    const plan = planFeedAdCampaignPatch(
      { status: "paused", source: "ADMIN_DIRECT" },
      { slides: [{ sortOrder: 0, imageUrl: "a" }, { sortOrder: 4, imageUrl: "b" }, { sortOrder: 2, imageUrl: "" }] }
    );
    expect(plan.ok && plan.slides).toEqual([{ sort_order: 2, image_url: "", alt_text: "", headline: "", is_active: false }]);
  });

  it("API: PATCH 는 상태 CAS 로 쓰고 감사 기록을 남긴다", () => {
    const root = process.cwd();
    const route = readFileSync(path.join(root, "app/api/admin/feed-ads/[campaignId]/route.ts"), "utf8");
    const lib = readFileSync(path.join(root, "lib/ads/update-feed-ad-campaign.ts"), "utf8");
    expect(route).toContain("export async function PATCH");
    expect(route).toContain('action: "feed_ad_campaign.update"');
    expect(lib).toContain('.eq("status", beforeStatus)');
    expect(lib).not.toMatch(/\.from\("feed_ad_creatives"\)[\s\S]{0,40}\.delete\(/);
  });
});
