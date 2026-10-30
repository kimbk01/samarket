import { describe, expect, it } from "vitest";
import {
  campaignCreateErrorMessage,
  campaignCreateMissingForDraft,
  campaignCreateMissingForSend,
  isCampaignSourcePickable,
  type CampaignCreateFormState,
} from "@/lib/admin/notification-campaigns/campaign-create-form";

const base: CampaignCreateFormState = {
  type: "notice",
  sourceMode: "existing",
  title: "업데이트 안내",
  body: "업데이트 부탁 드립니다",
  appNoticeId: "",
  deeplinkUrl: "",
  webUrl: "",
  targetType: "all",
  regionCode: "",
  selectedIds: "",
  sendMode: "immediate",
  scheduledAt: "",
};

describe("campaign-create-form — 남은 필수 항목 (2026-10-30 발송 불가 재현)", () => {
  it("공지 + 제목·본문만 → 원본 선택이 남은 항목으로 보인다 (버튼 비활성 사유)", () => {
    const missing = campaignCreateMissingForSend(base);
    expect(missing.map((m) => m.id)).toEqual(["source"]);
    expect(missing[0].ko).toContain("공지 원본");
  });

  it("자동 게시(원본 글 함께 만들기)면 제목·메시지만으로 준비 완료", () => {
    expect(campaignCreateMissingForSend({ ...base, sourceMode: "auto" })).toEqual([]);
    expect(campaignCreateMissingForSend({ ...base, sourceMode: "auto", body: "" }).map((m) => m.id)).toEqual(["body"]);
  });

  it("원본 연결 시 남은 항목 없음", () => {
    expect(campaignCreateMissingForSend({ ...base, appNoticeId: "366d11ab-c19f-497a-9894-04ff4f3225bc" })).toEqual([]);
  });

  it("마케팅은 랜딩 경로로 대체 가능, 알림센터 경로는 불가", () => {
    expect(campaignCreateMissingForDraft({ ...base, type: "marketing", deeplinkUrl: "/market" })).toEqual([]);
    expect(
      campaignCreateMissingForDraft({ ...base, type: "marketing", deeplinkUrl: "/notifications" }).map((m) => m.id)
    ).toEqual(["source"]);
  });

  it("발송 검토는 대상·예약 시각까지 확인", () => {
    const ok = { ...base, appNoticeId: "x" };
    expect(campaignCreateMissingForSend({ ...ok, targetType: "selected_users" }).map((m) => m.id)).toEqual([
      "selected_users",
    ]);
    expect(campaignCreateMissingForSend({ ...ok, targetType: "region" }).map((m) => m.id)).toEqual(["region"]);
    expect(campaignCreateMissingForSend({ ...ok, sendMode: "scheduled" }).map((m) => m.id)).toEqual(["scheduled_at"]);
    expect(campaignCreateMissingForDraft({ ...ok, sendMode: "scheduled" })).toEqual([]);
  });
});

describe("campaign-create-form — 원본 선택 목록", () => {
  const live = { content_type: "notice", is_active: true, starts_at: null, ends_at: null, archived_at: null, deleted_at: null };
  it("게시 중 + 같은 유형만", () => {
    expect(isCampaignSourcePickable(live, "notice")).toBe(true);
    expect(isCampaignSourcePickable(live, "system")).toBe(false);
    expect(isCampaignSourcePickable({ ...live, is_active: false }, "notice")).toBe(false);
    expect(isCampaignSourcePickable({ ...live, ends_at: "2000-01-01T00:00:00Z" }, "notice")).toBe(false);
    expect(isCampaignSourcePickable({ ...live, archived_at: "2026-01-01T00:00:00Z" }, "notice")).toBe(false);
  });
});

describe("campaign-create-form — 오류 문구", () => {
  it("서버 코드 → 한국어 문구, 모르는 코드는 코드만 덧붙임, 원문은 숨김", () => {
    expect(campaignCreateErrorMessage("content_source_unavailable", "ko")).toContain("숨김");
    expect(campaignCreateErrorMessage("weird_code", "ko")).toBe("처리하지 못했습니다. (weird_code)");
    expect(campaignCreateErrorMessage("duplicate key value violates", "ko")).toBe("처리하지 못했습니다.");
  });
});
