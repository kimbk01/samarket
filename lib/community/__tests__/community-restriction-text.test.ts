/**
 * 활동 제한 응답 문구 — 차단 문구와 분리, 해제일 표시 (감사 L1). 동작 시험.
 */
import { describe, expect, it } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { communityRestrictionText, COMMUNITY_COMMENT_ERROR_KEYS } from "@/lib/community/community-api-error-text";
import { resolveApiErrorText } from "@/lib/i18n/api-error-text";

const t = (k: MessageKey, vars?: Record<string, string | number>) => translate("ko", k, vars);

describe("communityRestrictionText", () => {
  it("해제일이 있으면 날짜까지", () => {
    const text = communityRestrictionText(
      { ok: false, error: "community_restricted", code: "community_restricted", params: { until: "2026-12-05T03:00:00.000Z" } },
      t,
      "ko"
    );
    expect(text).toContain("12월 5일");
    expect(text).not.toContain(t("community_comment_blocked_relation"));
  });
  it("영구 제한", () => {
    expect(communityRestrictionText({ error: "community_restricted" }, t, "ko")).toBe(t("community_restricted_generic"));
  });
  it("제한 응답이 아니면 null — 차단은 차단 문구", () => {
    expect(communityRestrictionText({ error: "community_comment_blocked_relation" }, t, "ko")).toBeNull();
    expect(
      resolveApiErrorText({
        json: { error: "community_comment_blocked_relation", code: "community_comment_blocked_relation" },
        status: 403,
        map: COMMUNITY_COMMENT_ERROR_KEYS,
        fallbackKey: "community_comment_action_failed",
        t,
      })
    ).toBe(t("community_comment_blocked_relation"));
  });
  it("다른 403(정지 등)은 차단 문구가 아니다", () => {
    const text = resolveApiErrorText({
      json: { error: "account_suspended" },
      status: 403,
      map: COMMUNITY_COMMENT_ERROR_KEYS,
      fallbackKey: "community_comment_action_failed",
      t,
    });
    expect(text).not.toBe(t("community_comment_blocked_relation"));
  });
});
