/**
 * 언어 사후 검토 2026-11-27 (docs/audit/i18n-postmerge-fix-design-2026-11-27.md §2)
 * - E1: 알림함이 사람이 쓴 댓글·답글·메시지 미리보기를 알림 문구로 바꾸지 않는다 (「좋아요」 → 「Like」 결함)
 * - E4①: 대체 이름(「회원」·「상대」 등) 번역은 서버가 대체값을 넣은 행(meta peerFallback)만
 */
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import {
  isNotificationPreviewBodyRow,
  mapLegacyNotificationText,
  notificationCopyMeta,
  renderNotificationCopyFromMeta,
} from "@/lib/notifications/notification-stored-copy";
import {
  resolveNotificationInboxBody,
  resolveNotificationInboxTitle,
} from "@/lib/notifications/resolve-commerce-notification-inbox-text";

const HANGUL = /[가-힣]/;

describe("E1 사람 글 원문 유지", () => {
  it("댓글 알림 본문 「좋아요」·「댓글」은 영어 화면에서도 원문", () => {
    for (const preview of ["좋아요", "댓글", "회원", "상대", "사진"]) {
      const row = {
        notification_type: "report",
        body: preview,
        meta: { kind: "community_comment", titleKey: "notify_community_comment_title", vars: { name: "Kim" } },
      };
      expect(resolveNotificationInboxBody("en", row), preview).toBe(preview);
    }
  });

  it("옛 댓글 행(meta 키 없음)도 원문", () => {
    expect(resolveNotificationInboxBody("en", { notification_type: "report", body: "좋아요", meta: { kind: "community_comment" } })).toBe(
      "좋아요"
    );
  });

  it("meta.preview 표시 행은 종류와 상관없이 원문", () => {
    expect(resolveNotificationInboxBody("en", { notification_type: "system", body: "좋아요", meta: { kind: "x", preview: true } })).toBe(
      "좋아요"
    );
    expect(isNotificationPreviewBodyRow({ preview: true })).toBe(true);
    expect(isNotificationPreviewBodyRow({ kind: "trade_chat" })).toBe(true);
    expect(isNotificationPreviewBodyRow({ kind: "community_like" })).toBe(false);
    expect(isNotificationPreviewBodyRow(null)).toBe(false);
  });

  it("본문 — 제목·분류 이름 고정 문장과 같은 글은 meta 없는 행에서도 바꾸지 않는다", () => {
    const likeTitle = translate("ko", "notify_community_like_title");
    expect(mapLegacyNotificationText("en", likeTitle, "body")).toBeNull();
    expect(resolveNotificationInboxBody("en", { notification_type: "report", body: likeTitle, meta: null })).toBe(likeTitle);
    expect(mapLegacyNotificationText("en", translate("ko", "notify_community_restriction_scope_comment"), "body")).toBeNull();
  });

  it("제목은 지금처럼 알림 문구 전체로 대응", () => {
    const likeTitle = translate("ko", "notify_community_like_title");
    expect(resolveNotificationInboxTitle("en", { notification_type: "report", title: likeTitle, meta: null })).toBe(
      translate("en", "notify_community_like_title")
    );
  });

  it("시스템 본문 고정 문장·치환 틀 본문은 계속 대응", () => {
    const fixed = translate("ko", "notify_trade_buyer_confirmed_body");
    expect(resolveNotificationInboxBody("en", { notification_type: "status", body: fixed, meta: null })).toBe(
      translate("en", "notify_trade_buyer_confirmed_body")
    );
    const tpl = translate("ko", "notify_community_like_body", { name: "Kim" });
    const out = resolveNotificationInboxBody("en", { notification_type: "report", body: tpl, meta: { kind: "community_like" } });
    expect(out).toBe(translate("en", "notify_community_like_body", { name: "Kim" }));
    expect(HANGUL.test(out ?? "")).toBe(false);
  });
});

describe("E4① 대체 이름 조건", () => {
  it("새 행 — varKeys 가 있으면 peerFallback 표시, vars 에 대체 이름 없음", () => {
    const meta = notificationCopyMeta({
      titleKey: "notify_group_invite_received_title",
      messageKey: "notify_group_invite_received_body",
      vars: { name: undefined, room: "Weekend" },
      varKeys: { name: "notify_peer_fallback" },
    });
    expect(meta.peerFallback).toBe(true);
    expect((meta.vars as Record<string, unknown>).name).toBeUndefined();
    expect(renderNotificationCopyFromMeta("en", meta, "body")).toBe(
      translate("en", "notify_group_invite_received_body", { name: translate("en", "notify_peer_fallback"), room: "Weekend" })
    );
    expect(notificationCopyMeta({ titleKey: "notify_community_like_title", vars: { name: "Kim" } }).peerFallback).toBeUndefined();
  });

  it("사람이 정한 닉네임이 정확히 「회원」·「상대」·「그룹」이면 표시 없는 행에서 원문", () => {
    for (const nick of ["회원", "상대", "그룹", "Member"]) {
      const meta = notificationCopyMeta({
        titleKey: "notify_friend_request_received_title",
        vars: { name: nick },
      });
      expect(renderNotificationCopyFromMeta("en", meta, "title"), nick).toBe(
        translate("en", "notify_friend_request_received_title", { name: nick })
      );
    }
  });

  it("표시가 있는 행의 vars 대체 글자는 보는 사람 언어로", () => {
    const meta = {
      titleKey: "notify_friend_request_received_title",
      vars: { name: translate("ko", "notify_member_fallback_name") },
      peerFallback: true,
    };
    expect(renderNotificationCopyFromMeta("en", meta, "title")).toBe(
      translate("en", "notify_friend_request_received_title", { name: translate("en", "notify_member_fallback_name") })
    );
  });
});
