/**
 * 푸시·알림 발송 시안 v3 (Owner 구현 승인 2026-11-02) — 목록·받은 사람 창이 같은 회원 단위 계산을 쓴다.
 * 운영 실측(2026-11-02): 「테스트입니다」 128명 = 성공 22 · 실패 6 · 없음 100 · 열람 3.
 */
import { describe, expect, it } from "vitest";
import {
  applyKindFilter,
  memberOutcomes,
  memberStatsFromOutcomes,
} from "@/lib/admin/notification-campaigns/campaign-list-service";
import { parseCampaignListQuery } from "@/lib/admin/notification-campaigns/campaign-status-machine";
import { campaignSkipReasonLabel, pushFailureLabel } from "@/lib/admin/notification-campaigns/campaign-recipient-labels";
import {
  campaignListKindOf,
  campaignResultBadge,
  matchesCampaignResultFilter,
  pickCampaignMetaKeys,
} from "@/lib/admin/notification-campaigns/campaign-list-kind";

const d = (user_id: string, channel: string, status: string) => ({ occurrence_id: "o1", user_id, channel, status });

describe("회원 단위 결과", () => {
  it("한 회원 = 한 결과: 성공 > 실패 > 없음 · 열람은 opened 1건 이상", () => {
    const rows = [
      d("a", "in_app", "sent"), d("a", "push", "sent"), d("a", "push", "failed"),
      d("b", "in_app", "sent"), d("b", "push", "failed"), d("b", "push", "failed"),
      d("c", "in_app", "sent"), d("c", "push", "skipped"),
      d("e", "in_app", "opened"), d("e", "push", "opened"),
      d("f", "in_app", "skipped"),
    ];
    const s = memberStatsFromOutcomes(memberOutcomes(rows));
    expect(s).toEqual({ target: 5, inbox: 4, push_ok: 2, push_fail: 1, push_none: 2, opened: 1 });
  });

  it("빈 회차 = 0", () => {
    expect(memberStatsFromOutcomes(memberOutcomes([]))).toEqual({ target: 0, inbox: 0, push_ok: 0, push_fail: 0, push_none: 0, opened: 0 });
  });
});

describe("분류 탭", () => {
  it("URL type 은 공지·시스템·이벤트·마케팅만", () => {
    for (const t of ["notice", "system", "event", "marketing"]) {
      expect(parseCampaignListQuery(new URLSearchParams({ type: t })).type).toBe(t);
    }
    expect(parseCampaignListQuery(new URLSearchParams({ type: "x" })).type).toBeNull();
  });

  it("이벤트·마케팅 = 보낸 때 고른 분류(notice_category) · 없는 과거 발송은 이벤트 연결 여부 (Owner 결정 2026-11-02)", () => {
    const calls: string[] = [];
    const b: Record<string, (...a: unknown[]) => unknown> = {};
    for (const k of ["eq", "not", "is", "or"]) b[k] = (...a: unknown[]) => (calls.push(`${k}:${a.map(String).join(",")}`), b);
    applyKindFilter(b as never, "event");
    expect(calls).toEqual([
      "eq:type,marketing",
      "or:target_payload->>notice_category.eq.event,and(target_payload->>notice_category.is.null,target_payload->>platform_event_id.not.is.null)",
    ]);
    calls.length = 0;
    applyKindFilter(b as never, "marketing");
    expect(calls).toEqual([
      "eq:type,marketing",
      "or:target_payload->>notice_category.eq.marketing,and(target_payload->>notice_category.is.null,target_payload->>platform_event_id.is.null)",
    ]);
    calls.length = 0;
    applyKindFilter(b as never, "system");
    expect(calls).toEqual(["eq:type,system"]);
    // 화면 분류(campaignListKindOf)도 같은 규칙
    expect(campaignListKindOf({ type: "marketing", target_payload: { notice_category: "event" } })).toBe("event");
    expect(campaignListKindOf({ type: "marketing", target_payload: { notice_category: "marketing", platform_event_id: "e1" } })).toBe("marketing");
    expect(campaignListKindOf({ type: "marketing", target_payload: { platform_event_id: "e1" } })).toBe("event");
    expect(campaignListKindOf({ type: "marketing", target_payload: {} })).toBe("marketing");
    expect(campaignListKindOf({ type: "notice", target_payload: { notice_category: "event" } })).toBe("notice");
  });

  it("분류·다시 보낸 원본은 저장 때 남긴다 — 유형과 맞지 않는 분류는 거부", () => {
    expect(pickCampaignMetaKeys({ notice_category: "event", resend_of: "88db384a-86df-41ba-9b91-69de4f84e82d" }, "marketing")).toEqual({
      ok: true,
      meta: { notice_category: "event", resend_of: "88db384a-86df-41ba-9b91-69de4f84e82d" },
    });
    expect(pickCampaignMetaKeys({ notice_category: "event" }, "notice")).toEqual({ ok: false, error: "invalid_notice_category" });
    expect(pickCampaignMetaKeys({ resend_of: "not-a-uuid" }, "notice")).toEqual({ ok: true, meta: {} });
  });

  it("결과 열 — 발송 중·반복 진행·실패 있음·푸시 없음 있음·전부 성공", () => {
    const stats = (push_fail: number, push_none: number) => ({ push_fail, push_none });
    expect(campaignResultBadge({ status: "sending", stats: null })).toBe("pending");
    expect(campaignResultBadge({ status: "active", sendMode: "recurring", stats: null })).toBe("repeating");
    expect(campaignResultBadge({ status: "sent", stats: stats(1, 5) })).toBe("fail");
    expect(campaignResultBadge({ status: "partially_failed", stats: stats(0, 5) })).toBe("none");
    expect(campaignResultBadge({ status: "sent", stats: stats(0, 0) })).toBe("ok");
    expect(campaignResultBadge({ status: "draft", stats: null })).toBe("status");
    expect(matchesCampaignResultFilter("fail", stats(2, 0))).toBe(true);
    expect(matchesCampaignResultFilter("ok", stats(0, 9))).toBe(true);
    expect(matchesCampaignResultFilter("ok", null)).toBe(false);
  });
});

describe("사유 문구", () => {
  it("운영에 있는 생략 사유·실패 응답을 사람이 읽는 말로", () => {
    expect(campaignSkipReasonLabel("token_missing", true)).toBe("등록된 기기 없음");
    expect(campaignSkipReasonLabel("foreground_no_os_push", true)).toContain("앱 사용 중");
    expect(campaignSkipReasonLabel("voip_reserved_for_call_push", true)).toContain("통화 전용");
    expect(pushFailureLabel({ code: "NOT_FOUND", error: "NotRegistered", provider: "fcm" }, true)).toContain("NotRegistered");
    expect(pushFailureLabel(null, true)).toBe("발송 실패");
  });
});
