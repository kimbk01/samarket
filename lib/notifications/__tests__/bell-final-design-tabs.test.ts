/**
 * 알림 최종 설계 §2-2 (Owner 승인 2026-11-01) — 종 분야 탭: 운영 소식(공지+시스템) · 주문·배달 · 거래 · 커뮤니티 ·
 * 혜택·이벤트 · 고객센터(신고 처리·제재·상담·문의).
 */
import { describe, expect, it } from "vitest";
import {
  bellTabDomains,
  bellTabForDomain,
  classifyMemberNotificationDomain,
  parseNotificationBellTabParam,
} from "@/lib/notifications/member-notification-domain";
import { matchesNotificationCenterMemberTab } from "@/lib/notifications/notification-center-tab-match";
import { buildNotificationCenterTabUnreadCounts } from "@/lib/notifications/notification-center-tab-unread";
import { resolveNotificationDestinationHintKey } from "@/lib/notifications/notification-destination-hint-key";

describe("bell tabs", () => {
  it("report results · sanctions · moderation → 고객센터 (운영 DB 실제 모양: system/notice push_kind)", () => {
    for (const kind of [
      "chat_report_result",
      "chat_report_sanction",
      "community_report_processed",
      "trade_report_processed",
      "community_sanction",
      "trade_sanction",
      "community_moderation",
      "trade_moderation",
    ]) {
      expect(classifyMemberNotificationDomain({ notification_type: "system", push_kind: "notice", meta_kind: kind })).toBe(
        "support"
      );
    }
    // 커뮤니티 고정·홍보 종료 같은 운영 알림은 원래 분야 그대로
    expect(
      classifyMemberNotificationDomain({ notification_type: "system", push_kind: "community", meta_kind: "community_pinned" })
    ).toBe("community");
  });

  it("point charge → 주문·배달; support_* → 고객센터", () => {
    expect(
      classifyMemberNotificationDomain({ notification_type: "commerce", meta_kind: "user_point_charge_approved" })
    ).toBe("delivery");
    expect(classifyMemberNotificationDomain({ event_type: "support_admin_replied", notification_type: "system" })).toBe(
      "support"
    );
  });

  it("운영 소식 = 공지 + 시스템", () => {
    expect(bellTabDomains("ops")).toEqual(["notice", "system"]);
    expect(bellTabForDomain("notice")).toBe("ops");
    expect(bellTabForDomain("system")).toBe("ops");
    expect(bellTabForDomain("support")).toBe("support");
    expect(parseNotificationBellTabParam("system")).toBe("ops");
    expect(parseNotificationBellTabParam("bogus")).toBe("invalid");
    const notice = { notification_type: "admin_notice", campaign_type: "notice" };
    const system = { notification_type: "admin_notice", campaign_type: "system" };
    expect(matchesNotificationCenterMemberTab(notice, "ops")).toBe(true);
    expect(matchesNotificationCenterMemberTab(system, "ops")).toBe(true);
    const counts = buildNotificationCenterTabUnreadCounts({
      memberRows: [
        { ...notice, is_read: false },
        { ...system, is_read: false },
        { notification_type: "system", push_kind: "notice", meta_kind: "chat_report_result", is_read: false } as never,
      ],
    });
    expect(counts.ops).toBe(2);
    expect(counts.all).toBe(3);
  });
});

describe("destination hint (줄의 「○○에서 보기」)", () => {
  it("maps stored final destinations to the list they belong to", () => {
    expect(resolveNotificationDestinationHintKey("/mypage/customer-center/notice/abc")).toBe("notif_dest_hint_notice");
    expect(resolveNotificationDestinationHintKey("/mypage/customer-center/system/abc")).toBe("notif_dest_hint_system");
    expect(resolveNotificationDestinationHintKey("/orders?expand=o1")).toBe("notif_dest_hint_orders");
    expect(resolveNotificationDestinationHintKey("/mypage/reports/messenger/r1")).toBe("notif_dest_hint_reports");
    expect(resolveNotificationDestinationHintKey("/support/cases/c1")).toBe("notif_dest_hint_support");
    expect(resolveNotificationDestinationHintKey("/community-messenger?section=friends")).toBe("notif_dest_hint_friends");
    expect(resolveNotificationDestinationHintKey("/community-messenger/rooms/r1")).toBe("notif_dest_hint_chat");
    expect(resolveNotificationDestinationHintKey("/community/posts/p1")).toBe("notif_dest_hint_post");
    expect(resolveNotificationDestinationHintKey("/notifications/e1")).toBe("notif_dest_hint_detail");
    expect(resolveNotificationDestinationHintKey("")).toBeNull();
  });
});
