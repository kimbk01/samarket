/**
 * 언어 재감사 2026-11-27 §2-4·§4-3 — 알림 저장 문장을 보는 사람 언어로.
 * - 새 행: meta.titleKey·messageKey·vars 로 다시 그림
 * - 옛 행: 카탈로그 알림 문구(ko·en)를 거꾸로 찾아 키로 (변수 포함) · 사람이 쓴 글은 그대로
 * - 통화·채팅 행은 대응표를 쓰지 않음
 */
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import {
  mapLegacyNotificationText,
  notificationCopyMeta,
  renderNotificationCopyFromMeta,
} from "@/lib/notifications/notification-stored-copy";
import {
  resolveNotificationInboxBody,
  resolveNotificationInboxTitle,
} from "@/lib/notifications/resolve-commerce-notification-inbox-text";
import { ownerRowToInboxItem } from "@/components/stores/owner/owner-notification-inbox-items";
import { resolveMemberInAppNotificationBanner } from "@/lib/notifications/in-app-banner/member-in-app-notification-banner";

const HANGUL = /[가-힣]/;

describe("옛 알림 문장 대응표", () => {
  const ko = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate("ko", k, v);

  it("운영에서 본 고정 문장이 영어 화면에서 한글 0", () => {
    const observed = [
      ko("notify_friend_request_accepted_title"),
      ko("notify_friend_request_received_title", { name: "Kim" }),
      ko("notify_community_like_title"),
      ko("notify_community_promotion_ended_title"),
      ko("notify_trade_promotion_ended_title"),
      ko("notify_group_invite_received_title"),
      ko("notify_support_admin_replied_title"),
      ko("notify_app_release_title"),
      ko("offer_notif_received_title"),
      ko("offer_notif_accepted_title"),
      ko("offer_notif_rejected_title"),
      ko("offer_notif_accepted_body", { amount: "₱1,000" }),
      "삭제된 메시지입니다.",
    ];
    for (const s of observed) {
      const out = mapLegacyNotificationText("en", s);
      expect(out, s).toBeTruthy();
      expect(HANGUL.test(out!), `${s} → ${out}`).toBe(false);
    }
  });

  it("변수는 그대로 옮긴다 — 옛 행의 대체 이름 글자는 meta 표시가 없어 원문 유지(사후 검토 E4①)", () => {
    expect(mapLegacyNotificationText("en", ko("notify_friend_request_received_title", { name: "Kim" }))).toBe(
      translate("en", "notify_friend_request_received_title", { name: "Kim" })
    );
    const peer = ko("notify_peer_fallback");
    const out = mapLegacyNotificationText("en", ko("notify_friend_request_accepted_body", { name: peer }));
    expect(out).toBe(translate("en", "notify_friend_request_accepted_body", { name: peer }));
  });

  it("영어로 저장된 옛 행은 한국어 화면에서 한국어 (서버 영어 문장 0)", () => {
    const out = mapLegacyNotificationText("ko", translate("en", "offer_notif_rejected_title"));
    expect(out).toBe(translate("ko", "offer_notif_rejected_title"));
  });

  it("사람이 쓴 글은 대응하지 않는다", () => {
    expect(mapLegacyNotificationText("en", "내일 3시에 만나요")).toBeNull();
    expect(mapLegacyNotificationText("en", "")).toBeNull();
  });
});

describe("새 행 meta 로 다시 그림", () => {
  it("titleKey·messageKey·vars·varKeys", () => {
    const meta = notificationCopyMeta({
      titleKey: "notify_friend_request_received_title",
      messageKey: "notify_friend_request_received_body",
      varKeys: { name: "notify_member_fallback_name" },
    });
    const en = renderNotificationCopyFromMeta("en", meta, "title")!;
    expect(en).toBe(translate("en", "notify_friend_request_received_title", { name: translate("en", "notify_member_fallback_name") }));
    expect(HANGUL.test(renderNotificationCopyFromMeta("en", meta, "body")!)).toBe(false);
    expect(renderNotificationCopyFromMeta("ko", meta, "title")).toBe(
      translate("ko", "notify_friend_request_received_title", { name: translate("ko", "notify_member_fallback_name") })
    );
  });

  it("모르는 키·빈 meta 는 null (저장 문장으로)", () => {
    expect(renderNotificationCopyFromMeta("en", { titleKey: "not_a_key_x" }, "title")).toBeNull();
    expect(renderNotificationCopyFromMeta("en", null, "title")).toBeNull();
  });

  it("알림함 — 가격 제안(status) 은 meta 로, 저장 한국어여도 영어 화면에 영어", () => {
    const row = {
      notification_type: "status",
      title: translate("ko", "offer_notif_accepted_title"),
      body: translate("ko", "offer_notif_accepted_body", { amount: "₱500" }),
      meta: {
        kind: "trade_offer",
        ...notificationCopyMeta({
          titleKey: "offer_notif_accepted_title",
          messageKey: "offer_notif_accepted_body",
          vars: { amount: "₱500" },
        }),
      },
    };
    expect(resolveNotificationInboxTitle("en", row)).toBe(translate("en", "offer_notif_accepted_title"));
    expect(resolveNotificationInboxBody("en", row)).toBe(translate("en", "offer_notif_accepted_body", { amount: "₱500" }));
  });
});

describe("통화·채팅은 그대로", () => {
  it("부재중(missed_call) 행은 저장 문장 그대로", () => {
    const row = { notification_type: "system", title: "부재중 전화", body: "홍길동 · 부재중 음성 통화", meta: { kind: "missed_call" } };
    expect(resolveNotificationInboxTitle("en", row)).toBe("부재중 전화");
    expect(resolveNotificationInboxBody("en", row)).toBe("홍길동 · 부재중 음성 통화");
  });

  it("채팅 행 본문(사람이 쓴 메시지)은 알림 문구와 같아도 바꾸지 않는다", () => {
    const like = translate("ko", "notify_community_like_title");
    expect(resolveNotificationInboxBody("en", { notification_type: "chat", body: like, meta: null })).toBe(like);
  });

  it("고객센터 삭제 메시지 키 → 보는 사람 언어", () => {
    const row = { notification_type: "system", body: "support_message_deleted", meta: null };
    expect(resolveNotificationInboxBody("en", row)).toBe(translate("en", "support_message_deleted"));
  });
});

describe("사장님 알림함·앱 안 배너도 같은 함수", () => {
  it("ownerRowToInboxItem — 옛 한국어 행이 영어 화면에서 영어", () => {
    const item = ownerRowToInboxItem(
      {
        id: "n1",
        notification_type: "system",
        title: translate("ko", "notify_support_admin_replied_title"),
        body: "삭제된 메시지입니다.",
        link_url: null,
        is_read: false,
        created_at: "2026-11-27T00:00:00Z",
        meta: null,
      },
      "store-1",
      "en",
      (no) => no
    );
    expect(item.title).toBe(translate("en", "notify_support_admin_replied_title"));
    expect(HANGUL.test(item.body ?? "")).toBe(false);
  });

  it("배너 — 언어가 있으면 다시 그림", () => {
    const d = resolveMemberInAppNotificationBanner(
      {
        source: "event",
        id: "e1",
        event_type: "trade_status",
        notification_type: "status",
        title: translate("ko", "offer_notif_rejected_title"),
        body: translate("ko", "offer_notif_rejected_body", { amount: "₱100" }),
        meta: { kind: "trade_offer" },
        link_url: "/post/1",
      },
      { pathname: "/home", visible: true, language: "en" }
    );
    if (!d.show) throw new Error(`hidden: ${d.reason}`);
    expect(d.push.presentation.title).toBe(translate("en", "offer_notif_rejected_title"));
    expect(HANGUL.test(d.push.presentation.body)).toBe(false);
  });
});
