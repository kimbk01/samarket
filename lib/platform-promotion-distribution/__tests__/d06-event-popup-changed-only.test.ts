/**
 * D-06 (+R3-P-05 · 재감사 3차 2026-11-07) — 이벤트 배포 저장과 팝업.
 * - 같은 값 재저장 → 노출 중 팝업 상태·소재 그대로 (예전: 매번 재검토 + 새 소재 행)
 * - 그림만 교체 → 재검토 + 「다시 승인 필요」 신호
 * - 관리자 종료 팝업 → 건드리지 않음(noop · 예전: 409 ended_immutable)
 * - 빈도 → 억제 모드 맞춤
 */
import { describe, expect, it, vi } from "vitest";
import { makeFakeSb, type Row } from "@/lib/ads/__tests__/helpers/fake-supabase-1104f";

vi.mock("@/lib/admin/notification-campaigns/campaign-create-service", () => ({ createAdminNotificationCampaign: vi.fn() }));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));

import { saveEventDistribution } from "@/lib/platform-promotion-distribution/save-event-distribution";

const EVENT = "11111111-2222-3333-4444-555555555555";
const past = new Date(Date.now() - 86_400_000).toISOString();
const future = new Date(Date.now() + 5 * 86_400_000).toISOString();

function seed(campaign: Row = {}) {
  return makeFakeSb({
    platform_promotion_distributions: [
      { id: "d1", content_type: "platform_event", content_id: EVENT, channel: "popup", enabled: true, channel_ref_id: "p1", channel_ref_type: "platform_popup_campaign", config: {} },
    ],
    platform_popup_campaigns: [
      {
        id: "p1",
        name: "가을 세일 팝업",
        status: "active",
        approval_status: "approved",
        priority: 100,
        timezone: "Asia/Manila",
        start_at: past,
        end_at: future,
        suppression_mode: "TODAY",
        suppression_duration_seconds: null,
        presentation_type: "center_modal",
        frequency_mode: "once_per_day",
        cta_type: "event_detail",
        cta_target: EVENT,
        external_url: null,
        cta_label: null,
        title: null,
        body: null,
        owner_request_id: null,
        ...campaign,
      },
    ],
    platform_popup_campaign_surfaces: [{ campaign_id: "p1", surface: "TRADE" }],
    platform_popup_creatives: [
      { id: "cr-1", campaign_id: "p1", asset_path: "events/a.png", asset_url: "https://cdn.example.com/a.png", creative_mode: "card", alt_text: "가을 세일 팝업", status: "ready" },
    ],
    platform_events: [{ id: EVENT, status: "published", starts_at: past, ends_at: future }],
  });
}

const save = (sb: unknown, popup: Row = {}) =>
  saveEventDistribution(sb as never, {
    eventId: EVENT,
    eventTitle: "가을 세일",
    adminUserId: "admin-1",
    toggles: { popup: true, banner: false, push: false, bell: false },
    popup: {
      name: "가을 세일 팝업",
      surfaces: ["TRADE"],
      presentationType: "center_modal",
      frequencyMode: "once_per_day",
      creativeMode: "card",
      imageUrl: "https://cdn.example.com/a.png",
      imagePath: "events/a.png",
      startAt: past,
      endAt: future,
      ...popup,
    },
    onlyChannels: ["popup"],
    eventPublication: { status: "published", startsAt: past, endsAt: future },
  });

describe("D-06 이벤트 팝업 = 바뀐 칸만", () => {
  it("같은 값 재저장 → 상태 active · 소재 그대로 · 재검토 신호 없음", async () => {
    const fake = seed();
    const r = await save(fake.sb);
    expect(r.channels.popup).toMatchObject({ ok: true, action: "noop" });
    expect((r.channels.popup as { revertedToReview?: boolean }).revertedToReview).toBeUndefined();
    expect(fake.tables.platform_popup_campaigns![0]).toMatchObject({ status: "active", approval_status: "approved" });
    expect(fake.tables.platform_popup_creatives).toEqual([expect.objectContaining({ id: "cr-1", status: "ready" })]);
    expect(fake.calls.filter((c) => c.table === "platform_popup_campaigns" && c.mode === "update")).toHaveLength(0);
  });

  it("이름만 바꿈 → 이름만 저장 · 재검토 아님", async () => {
    const fake = seed();
    const r = await save(fake.sb, { name: "새 이름" });
    expect(r.channels.popup).toMatchObject({ ok: true, action: "updated" });
    expect(fake.tables.platform_popup_campaigns![0]).toMatchObject({ name: "새 이름", status: "active" });
  });

  it("그림만 교체 → 새 소재 · 재검토 + revertedToReview", async () => {
    const fake = seed();
    const r = await save(fake.sb, { imageUrl: "https://cdn.example.com/b.png", imagePath: "events/b.png" });
    expect(r.channels.popup).toMatchObject({ ok: true, revertedToReview: true });
    expect(fake.tables.platform_popup_campaigns![0]).toMatchObject({ status: "pending_review" });
    expect(fake.tables.platform_popup_creatives!.filter((c) => c.status === "ready")).toEqual([
      expect.objectContaining({ asset_path: "events/b.png" }),
    ]);
  });

  it("관리자 종료 팝업 → noop (409 아님 · 아무것도 안 씀)", async () => {
    const fake = seed({ status: "ended" });
    const r = await save(fake.sb, { name: "새 이름", imageUrl: "https://cdn.example.com/b.png", imagePath: "events/b.png" });
    expect(r.channels.popup).toMatchObject({ ok: true, action: "noop" });
    expect(r.ok).toBe(true);
    expect(fake.tables.platform_popup_campaigns![0]).toMatchObject({ status: "ended", name: "가을 세일 팝업" });
    expect(fake.tables.platform_popup_creatives).toHaveLength(1);
  });

  it("R3-P-05: 빈도를 바꾸면 억제 모드도 같이 맞춘다", async () => {
    const fake = seed();
    await save(fake.sb, { frequencyMode: "once_campaign" });
    expect(fake.tables.platform_popup_campaigns![0]).toMatchObject({
      frequency_mode: "once_campaign",
      suppression_mode: "CAMPAIGN",
    });
  });
});
