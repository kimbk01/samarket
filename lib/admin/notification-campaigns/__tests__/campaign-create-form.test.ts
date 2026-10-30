import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_APP_SCREEN_PRESETS,
  campaignCreateErrorMessage,
  campaignCreateMissingForSend,
  campaignCreateMissingForTest,
  campaignDestinationPayload,
  isCampaignSourcePickable,
  resolveCampaignCreateType,
  type CampaignCreateFormState,
} from "@/lib/admin/notification-campaigns/campaign-create-form";
import {
  resolveApprovedMarketingLandingRoute,
  validateOfficialCampaignSource,
} from "@/lib/admin/notification-campaigns/campaign-source-authority";

const base: CampaignCreateFormState = {
  destination: "inbox",
  title: "업데이트 안내",
  body: "업데이트 부탁 드립니다",
  postId: "",
  eventId: "",
  appPath: "",
  targetType: "all",
  regionCode: "",
  selectedIds: "",
  sendMode: "immediate",
  scheduledAt: "",
};

describe("알림 보내기 v3 — 필수 항목", () => {
  it("기본(알림 내용 보기 · 전체 · 지금)은 제목·메시지만으로 발송 가능 — 2026-10-30 발송 불가 해소", () => {
    expect(campaignCreateMissingForSend(base)).toEqual([]);
    expect(campaignCreateMissingForSend({ ...base, title: "", body: "" }).map((m) => m.id)).toEqual(["title", "body"]);
  });

  it("목적지별로 고를 대상이 있어야 한다", () => {
    expect(campaignCreateMissingForTest({ ...base, destination: "post" }).map((m) => m.id)).toEqual(["post"]);
    expect(campaignCreateMissingForTest({ ...base, destination: "event" }).map((m) => m.id)).toEqual(["event"]);
    expect(campaignCreateMissingForTest({ ...base, destination: "app" }).map((m) => m.id)).toEqual(["app"]);
    expect(campaignCreateMissingForTest({ ...base, destination: "app", appPath: "/notifications" }).map((m) => m.id)).toEqual([
      "app",
    ]);
    expect(campaignCreateMissingForTest({ ...base, destination: "app", appPath: "/market" })).toEqual([]);
  });

  it("실발송은 받는 사람·예약 시각까지 확인, 테스트는 확인하지 않음", () => {
    expect(campaignCreateMissingForSend({ ...base, targetType: "selected_users" }).map((m) => m.id)).toEqual(["selected_users"]);
    expect(campaignCreateMissingForSend({ ...base, sendMode: "scheduled" }).map((m) => m.id)).toEqual(["scheduled_at"]);
    expect(campaignCreateMissingForTest({ ...base, targetType: "selected_users", sendMode: "scheduled" })).toEqual([]);
  });
});

describe("알림 보내기 v3 — 유형은 받는 사람·목적지로 결정", () => {
  it("광고 수신 동의 회원 = 마케팅, 그 외 = 공지, 이벤트 = 마케팅, 글 = 글의 게시판", () => {
    expect(resolveCampaignCreateType({ destination: "inbox", targetType: "all" })).toBe("notice");
    expect(resolveCampaignCreateType({ destination: "inbox", targetType: "marketing_opt_in" })).toBe("marketing");
    expect(resolveCampaignCreateType({ destination: "event", targetType: "all" })).toBe("marketing");
    expect(resolveCampaignCreateType({ destination: "post", targetType: "all", postContentType: "system" })).toBe("system");
  });

  it("화면이 보내는 목적지 표시는 서버 원본 규칙을 통과한다", () => {
    expect(
      validateOfficialCampaignSource({ campaign_type: "notice", target_payload: campaignDestinationPayload("inbox") }).ok
    ).toBe(true);
    expect(
      validateOfficialCampaignSource({
        campaign_type: "notice",
        target_payload: campaignDestinationPayload("app"),
        deeplink_url: "/market",
      }).ok
    ).toBe(true);
  });

  it("앱 화면 바로 고르기 경로는 모두 서버 허용 경로", () => {
    for (const p of CAMPAIGN_APP_SCREEN_PRESETS) {
      expect(resolveApprovedMarketingLandingRoute(p.path), p.path).toBe(p.path);
    }
  });
});

describe("알림 보내기 v3 — 고객센터 글 목록", () => {
  const live = { is_active: true, starts_at: null, ends_at: null, archived_at: null, deleted_at: null };
  it("게시 중인 글만", () => {
    expect(isCampaignSourcePickable(live)).toBe(true);
    expect(isCampaignSourcePickable({ ...live, is_active: false })).toBe(false);
    expect(isCampaignSourcePickable({ ...live, ends_at: "2000-01-01T00:00:00Z" })).toBe(false);
  });
});

describe("알림 보내기 v3 — 오류 문구", () => {
  it("서버 코드 → 한국어, 모르는 코드는 코드만, 원문은 숨김", () => {
    expect(campaignCreateErrorMessage("content_source_unavailable", "ko")).toContain("숨김");
    expect(campaignCreateErrorMessage("weird_code", "ko")).toBe("처리하지 못했습니다. (weird_code)");
    expect(campaignCreateErrorMessage("duplicate key value violates", "ko")).toBe("처리하지 못했습니다.");
  });
});
