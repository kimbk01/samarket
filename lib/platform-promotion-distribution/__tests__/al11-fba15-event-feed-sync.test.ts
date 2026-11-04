/**
 * AL-11 · FB-A15 (2026-11-04) — 이벤트 저장과 피드 배너.
 * - 이벤트 배너 이미지를 바꾸면 피드 소재도 바뀐다: 새 소재 행 + 옛 행 비활성(노출 기록 보존) · 공개 응답 이미지 = 새 이미지
 * - 관리자가 정지(paused_by='admin')한 캠페인은 이벤트 저장이 상태를 바꾸지 않는다(내용만 따름)
 * - 관리자가 종료한 캠페인은 이벤트 저장이 건드리지 않는다
 * - 이벤트가 스스로 끈 종료(paused_by='system')만 다시 켤 수 있다
 */
import { describe, expect, it, vi } from "vitest";
import { makeFakeSb, type Row } from "@/lib/ads/__tests__/helpers/fake-supabase-1104f";

vi.mock("@/lib/admin/notification-campaigns/campaign-create-service", () => ({ createAdminNotificationCampaign: vi.fn() }));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));

import { saveEventDistribution } from "@/lib/platform-promotion-distribution/save-event-distribution";
import { listEligibleFeedAdCampaigns } from "@/lib/ads/feed-ad-campaigns-db";
import { projectFeedAdPublicCampaign } from "@/lib/ads/feed-ad-public-projection";

const EVENT = "11111111-2222-3333-4444-555555555555";
const past = new Date(Date.now() - 86_400_000).toISOString();
const future = new Date(Date.now() + 5 * 86_400_000).toISOString();

function seed(campaign: Row) {
  return makeFakeSb({
    platform_promotion_distributions: [
      { id: "d1", content_type: "platform_event", content_id: EVENT, channel: "banner", enabled: true, channel_ref_id: "c1", channel_ref_type: "feed_ad_campaign", config: {} },
    ],
    feed_ad_campaigns: [
      {
        id: "c1",
        name: "가을 세일",
        domain: "trade",
        placement: "TRADE_HOME",
        status: "active",
        priority: 100,
        start_at: past,
        end_at: future,
        destination_type: "internal_page",
        destination_id: "",
        destination_url: `/events/${EVENT}`,
        source: "ADMIN_DIRECT",
        ...campaign,
      },
    ],
    feed_ad_creatives: [{ id: "cr-old", campaign_id: "c1", sort_order: 1, image_url: "https://cdn.example.com/old.png", headline: "옛 제목", is_active: true }],
    platform_events: [{ id: EVENT, status: "published", starts_at: past, ends_at: future }],
  });
}

const save = (sb: unknown, banner: Row, on = true) =>
  saveEventDistribution(sb as never, {
    eventId: EVENT,
    eventTitle: "가을 세일",
    adminUserId: "admin-1",
    toggles: { popup: false, banner: on, push: false, bell: false },
    banner: { placement: "TRADE_HOME", ...banner },
    onlyChannels: ["banner"],
    eventPublication: { status: "published", startsAt: past, endsAt: future },
  });

describe("FB-A15 이벤트 배너 수정 → 피드 소재", () => {
  it("이미지가 바뀌면 새 소재 행 + 옛 행 비활성 · 공개 응답 이미지 = 새 이미지", async () => {
    const fake = seed({});
    const r = await save(fake.sb, { imageUrl: "https://cdn.example.com/new.png", headline: "새 제목" });
    expect(r.channels.banner).toMatchObject({ ok: true, action: "updated" });
    const crs = fake.tables.feed_ad_creatives!;
    expect(crs.find((c) => c.id === "cr-old")).toMatchObject({ is_active: false, image_url: "https://cdn.example.com/old.png" });
    expect(crs.filter((c) => c.is_active)).toEqual([
      expect.objectContaining({ image_url: "https://cdn.example.com/new.png", headline: "새 제목", sort_order: 2 }),
    ]);
    const feed = (await listEligibleFeedAdCampaigns(fake.sb, "trade")).map(projectFeedAdPublicCampaign);
    expect(feed[0]!.slides.map((s) => s.imageUrl)).toEqual(["https://cdn.example.com/new.png"]);
  });

  it("이미지가 같으면 제목만 그 행에서 고친다 (새 행 없음)", async () => {
    const fake = seed({});
    await save(fake.sb, { imageUrl: "https://cdn.example.com/old.png", headline: "고친 제목" });
    expect(fake.tables.feed_ad_creatives).toEqual([
      expect.objectContaining({ id: "cr-old", headline: "고친 제목", is_active: true }),
    ]);
  });
});

describe("AL-11 관리자 조치가 이벤트 저장보다 우선", () => {
  it("관리자 정지: 이벤트를 다시 저장해도 정지 그대로 (내용은 따른다)", async () => {
    const fake = seed({ status: "paused", paused_by: "admin" });
    await save(fake.sb, { imageUrl: "https://cdn.example.com/old.png", headline: "x" });
    expect(fake.tables.feed_ad_campaigns![0]).toMatchObject({ status: "paused", paused_by: "admin" });
    // 이벤트 배너를 꺼도 관리자 정지 캠페인은 건드리지 않는다
    const off = await save(fake.sb, {}, false);
    expect(off.channels.banner).toMatchObject({ ok: true, action: "noop" });
    expect(fake.tables.feed_ad_campaigns![0]).toMatchObject({ status: "paused", paused_by: "admin" });
  });

  it("관리자 종료: 이벤트 저장이 상태·내용을 바꾸지 않는다", async () => {
    const fake = seed({ status: "ended", paused_by: null });
    const r = await save(fake.sb, { imageUrl: "https://cdn.example.com/new.png" });
    expect(r.channels.banner).toMatchObject({ ok: true, action: "noop" });
    expect(fake.tables.feed_ad_campaigns![0]).toMatchObject({ status: "ended" });
    expect(fake.tables.feed_ad_creatives).toHaveLength(1);
  });

  it("이벤트가 끈 종료(system)는 다시 켜면 active", async () => {
    const fake = seed({});
    await save(fake.sb, {}, false);
    expect(fake.tables.feed_ad_campaigns![0]).toMatchObject({ status: "ended", paused_by: "system" });
    await save(fake.sb, { imageUrl: "https://cdn.example.com/old.png" });
    expect(fake.tables.feed_ad_campaigns![0]).toMatchObject({ status: "active", paused_by: null });
  });
});
