/**
 * 실기 v6 FAIL 2 (Owner 「설계안대로 진행」 2026-11-07 · docs/audit/ads-v6-device-fail-design-2026-11-07.md)
 * 원장 행 S-F(e8199d8c): 기간 UTC · 남은 기간 8시간 어긋남 · 대상/소재 「운영자」·uuid · 종료 광고 「승인 전」·「종료까지 N」.
 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 검사한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatAdsPeriodRange } from "@/lib/admin/ads-exposure/canonical-location-period";
import { parseAdsLedgerRow } from "@/lib/admin/ads-ledger/ad-ledger-presentation";
import {
  applyAdsLedgerToItem,
  projectFeedCampaignToActionItem,
  projectFeedRequestToActionItem,
  type AdsLedgerRowMeta,
} from "@/lib/admin/ads-control-plane/project-family-rows";
import { toAdsShellListRow } from "@/lib/admin/ads-exposure/shell-row";

const START = "2026-11-07T12:37:41.987Z"; // 20:37 PHT
const END = "2026-11-13T12:37:41.987Z"; // 11-13 20:37 PHT
const NOW = Date.parse("2026-11-07T12:51:00.000Z"); // 20:51 PHT (실기 시각)

const meta = (over: Partial<AdsLedgerRowMeta> = {}): AdsLedgerRowMeta => ({
  family: "feed_campaign",
  sourceId: "e8199d8c-5060-4404-ac15-a5114c3a6037",
  itemId: "feed_campaign:e8199d8c-5060-4404-ac15-a5114c3a6037",
  ops: "live",
  statusTab: "live",
  at: START,
  domain: "feed",
  product: "feed_banner",
  sourceKind: "admin_direct",
  title: "가을 할인 캠페인",
  imageUrl: "https://x/a.png",
  destination: null,
  priority: null,
  ...over,
});

const ledgerRow = (over: Record<string, unknown> = {}) =>
  parseAdsLedgerRow({
    kind: "feed_admin",
    status_tab: "live",
    ledger_domain: "trade",
    location_key: "TRADE_HOME",
    advertiser_type: "operator",
    pay_currency: "NONE",
    pay_status: "none",
    start_at: START,
    end_at: END,
    delete_kind: "feed_campaign",
    ...over,
  })!;

describe("v6 FAIL 2-1 기간 = PHT (실행 기계 시간대와 무관)", () => {
  const prevTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = prevTz;
  });
  it.each(["UTC", "America/Los_Angeles", "Asia/Manila"])("TZ=%s → 2026.11.07 20:37 ~ 2026.11.13 20:37", (tz) => {
    process.env.TZ = tz;
    expect(formatAdsPeriodRange(START, END, true).label).toBe("2026.11.07 20:37 ~ 2026.11.13 20:37");
  });
});

describe("v6 FAIL 2-2~2-6 원장 행 → 목록 줄", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const feedCampaign = (name: string) =>
    projectFeedCampaignToActionItem({
      id: "e8199d8c-5060-4404-ac15-a5114c3a6037",
      name,
      status: "active",
      startAt: START,
      endAt: END,
      placement: "TRADE_HOME",
      source: "ADMIN_DIRECT",
      slides: [{ imageUrl: "https://x/a.png" }],
    } as unknown as Parameters<typeof projectFeedCampaignToActionItem>[0]);

  it("2-3 운영자 피드 행 대상/소재 = 캠페인 이름(「운영자」 아님) · 광고주 = 운영자", () => {
    const item = applyAdsLedgerToItem(feedCampaign("가을 할인 캠페인"), meta(), ledgerRow());
    const row = toAdsShellListRow(item, true);
    expect(row.targetLabel).toBe("가을 할인 캠페인");
    expect(row.title).toBe("가을 할인 캠페인");
    expect(row.applicantLabel).toBe("운영자");
  });

  it("2-4 회원 피드 신청 행 대상/소재에 글 uuid 가 없다 (원장 제목 = 캠페인 이름)", () => {
    const req = projectFeedRequestToActionItem({
      id: "d27757fe-c354-4fef-8f9f-f78a82b808b3",
      user_id: "u1",
      status: "approved",
      domain: "trade",
      destination_id: "6b14bb48-0000-4000-8000-000000000000",
      created_at: START,
      start_at: START,
      end_at: END,
      creative_image_url: "https://x/b.png",
    });
    const item = applyAdsLedgerToItem(
      req,
      meta({ family: "feed_request", itemId: "feed:d27757fe", sourceKind: "member", title: "q테스트1" }),
      ledgerRow({ kind: "feed_member", advertiser_type: "member", advertiser_name: "q테스트1" })
    );
    const row = toAdsShellListRow(item, true);
    expect(row.targetLabel).toBe("q테스트1");
    expect(row.targetLabel).not.toMatch(/6b14bb48/);
  });

  it("2-2 남은 기간 = 저장 시각 기준 (5일 23시간) · 기간 글자를 다시 읽지 않는다", () => {
    const item = applyAdsLedgerToItem(feedCampaign("캠페인"), meta(), ledgerRow());
    const row = toAdsShellListRow(item, true);
    expect(row.remainingLabel).toBe("종료까지 5일 23시간");
    expect(row.periodLabel).toBe("2026.11.07 20:37 ~ 2026.11.13 20:37");
  });

  it("2-5·2-6 종료(일찍 끝남) → 「승인 전」·「종료까지」 없음 · 「종료」·「종료됨」", () => {
    const req = projectFeedRequestToActionItem({
      id: "d27757fe-c354-4fef-8f9f-f78a82b808b3",
      user_id: "u1",
      status: "ended",
      domain: "trade",
      created_at: START,
      start_at: START,
      end_at: END,
    });
    const item = applyAdsLedgerToItem(
      req,
      meta({ family: "feed_request", ops: "ended", statusTab: "ended", sourceKind: "member" }),
      ledgerRow({ kind: "feed_member", status_tab: "ended", advertiser_type: "member" })
    );
    const row = toAdsShellListRow(item, true);
    expect(row.runtimeExposureStatusLabel).not.toBe("승인 전");
    expect(row.runtimeExposureStatusLabel).toBe("종료");
    expect(row.remainingLabel).toBe("종료됨");
  });

  it("확인중(검토 대기) 신청은 그대로 「승인 전」", () => {
    const req = projectFeedRequestToActionItem({
      id: "r2",
      user_id: "u1",
      status: "pending",
      domain: "trade",
      created_at: START,
      start_at: START,
      end_at: END,
    });
    const item = applyAdsLedgerToItem(
      req,
      meta({ family: "feed_request", ops: "pending", statusTab: "pending", sourceKind: "member" }),
      ledgerRow({ kind: "feed_member", status_tab: "pending", advertiser_type: "member" })
    );
    expect(toAdsShellListRow(item, true).runtimeExposureStatusLabel).toBe("승인 전");
  });
});
