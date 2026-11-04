/**
 * 알림 항목 SSOT 계약 — notification-admin-item-ssot-audit-2026-11-02 (Owner 설계 승인 2026-11-02).
 * 1) 운영 알림 행 형태(2026-11-02 실측 180일 · 93종)가 빠짐없이 항목 1개로 정해진다(작성 코드 없는 옛 형태 4종만 예외).
 * 2) 회원·사장님 항목은 자기 소리 키 1개 — 공유 없음. 키는 소리 등록부에 있다.
 * 3) 새 소리 키 시드 = 마이그레이션과 같다. 채널은 설치된 앱에 이미 있는 채널.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_ITEMS,
  getNotificationItem,
  notificationItemInputFromEvent,
  resolveNotificationItem,
} from "@/lib/notifications/notification-item-registry";
import { NOTIFICATION_ITEM_SOUND_SEEDS } from "@/lib/notifications/notification-item-sound-seeds";
import { getRegistryEvent } from "@/lib/notifications/notification-sound-registry";
import { resolveNotificationSoundEventKeyFromRow } from "@/lib/notifications/notification-sound-event-key-from-row";

/** [type, kind, receiverRole, campaignType, previewKind, 기대 항목] — 운영 notification_events 실측(2026-11-02). */
const PRODUCTION_SHAPES: readonly (readonly [string, string, string, string, string, string | null])[] = [
  ["admin_marketing_banner", "", "", "", "", "campaign_marketing"],
  ["admin_marketing_banner", "", "", "", "admin_campaign", "campaign_marketing"],
  ["admin_marketing_banner", "", "", "marketing", "admin_campaign", "campaign_marketing"],
  ["admin_marketing_banner", "delivery_ad_approved", "", "", "", "owner_ad_status"],
  ["admin_marketing_banner", "delivery_ad_business_cash_charge_rejected", "", "", "", "owner_ad_cash"],
  ["admin_marketing_banner", "delivery_ad_rejected", "", "", "", "owner_ad_status"],
  ["admin_notice", "", "", "", "", "admin_notice_legacy"],
  ["admin_notice", "", "", "", "admin_campaign", "admin_notice_legacy"],
  ["admin_notice", "", "", "notice", "admin_campaign", "campaign_notice"],
  ["admin_notice", "", "", "system", "admin_campaign", "campaign_system"],
  ["admin_notice", "", "", "system", "member_admin_note", "campaign_system"],
  ["admin_notice", "admin_store_decision", "", "", "", "owner_store_decision"],
  ["admin_notice", "admin_store_operational_notice", "", "", "", "owner_store_notice"],
  ["admin_notice", "app_release", "", "", "", "app_release"],
  ["admin_notice", "community_group_invite", "", "", "", "chat_group_invite"],
  ["admin_notice", "friend_accepted", "", "", "", "friend_accepted"],
  ["admin_notice", "friend_rejected", "", "", "", "friend_request"],
  ["admin_notice", "friend_request", "", "", "", "friend_request"],
  ["chat_message", "", "", "", "", "chat_direct"],
  ["chat_message", "", "", "", "hidden", "chat_direct"],
  ["chat_message", "", "", "", "image", "chat_direct"],
  ["chat_message", "", "", "", "text", "chat_direct"],
  ["community_activity", "", "", "", "", null],
  ["community_activity", "community_comment", "", "", "", "community_comment"],
  ["community_activity", "community_like", "", "", "", "community_like"],
  ["community_activity", "friend_accepted", "", "", "", "friend_accepted"],
  ["community_activity", "friend_request", "", "", "", "friend_request"],
  ["community_activity", "gift_transfer_accepted", "", "", "", "gift_result"],
  ["community_activity", "gift_transfer_cancelled", "", "", "", "gift_result"],
  ["community_activity", "gift_transfer_offered", "", "", "", "gift_offered"],
  ["community_activity", "gift_transfer_rejected", "", "", "", "gift_result"],
  ["community_activity", "trade_offer", "", "", "", "trade_offer"],
  ["group_message", "", "", "", "", "chat_group"],
  ["group_message", "", "", "", "hidden", "chat_group"],
  ["group_message", "", "", "", "image", "chat_group"],
  ["group_message", "", "", "", "text", "chat_group"],
  ["group_message", "community_group_invite", "", "", "", "chat_group_invite"],
  ["inbox_message_received", "", "", "", "member_admin_note", "admin_inbox_message"],
  ["inbox_message_received", "", "", "system", "member_admin_note", "admin_inbox_message"],
  ["inquiry_answered", "", "", "", "member_admin_note", "admin_note_reply"],
  ["inquiry_answered", "", "", "", "platform_admin_inquiry", "owner_inquiry_reply"],
  ["inquiry_answered", "", "", "system", "member_admin_note", "admin_note_reply"],
  ["mention_message", "", "", "", "text", "chat_mention"],
  ["missed_call", "", "", "", "", "call_missed"],
  ["missed_call", "missed_call", "", "", "", "call_missed"],
  ["notice_published", "", "", "notice", "admin_campaign", "campaign_notice"],
  ["notice_published", "", "", "system", "admin_campaign", "campaign_system"],
  ["notice_published", "admin_notice", "", "", "", "admin_notice_legacy"],
  ["order_status", "", "", "", "", null],
  ["order_status", "delivery_ad_approved", "", "", "", "owner_ad_status"],
  ["order_status", "delivery_ad_changes_requested", "", "", "", "owner_ad_status"],
  ["order_status", "delivery_ad_ended", "", "", "", "owner_ad_status"],
  ["order_status", "delivery_ad_paused_admin", "", "", "", "owner_ad_status"],
  ["order_status", "delivery_ad_rejected", "", "", "", "owner_ad_status"],
  ["order_status", "delivery_ad_resumed", "", "", "", "owner_ad_status"],
  ["order_status", "store_order_accept_reminder_30s", "", "", "", "owner_order_reminder"],
  ["order_status", "store_order_accept_reminder_60s", "", "", "", "owner_order_reminder"],
  ["order_status", "store_order_accept_timeout_cancelled", "", "", "", "owner_order_cancelled"],
  ["order_status", "store_order_buyer_cancelled", "", "", "", "owner_order_cancelled"],
  ["order_status", "store_order_created", "", "", "", "owner_order_new"],
  ["order_status", "store_order_owner_status", "", "", "", "order_status_member"],
  ["order_status", "store_order_payment_completed_buyer", "", "", "", "order_status_member"],
  ["order_status", "store_order_payment_failed", "", "", "", "order_payment_member"],
  ["order_status", "store_order_refund_approved", "", "", "", "order_payment_member"],
  ["order_status", "store_order_refund_requested", "", "", "", "owner_refund_requested"],
  ["order_status", "store_order_sold_out", "", "", "", "owner_order_sold_out"],
  ["order_status", "store_point_account_replied", "", "", "", "owner_store_point"],
  ["order_status", "store_point_blocked", "", "", "", "owner_store_point"],
  ["order_status", "store_point_charge_approved", "", "", "", "owner_store_point"],
  ["order_status", "store_point_deducted", "", "", "", "owner_store_point"],
  ["order_status", "user_point_charge_approved", "", "", "", "user_point_charge_approved"],
  ["order_status", "user_point_charge_rejected", "", "", "", "user_point_charge_rejected"],
  ["pin_message", "", "", "", "", "chat_group_pin"],
  ["store_order_message", "", "", "", "", "chat_store_order_member"],
  ["store_order_message", "store_order_message", "owner", "", "image", "chat_store_order_owner"],
  ["store_order_message", "store_order_message", "owner", "", "text", "chat_store_order_owner"],
  ["store_order_message", "store_order_message", "user", "", "hidden", "chat_store_order_member"],
  ["store_order_message", "store_order_message", "user", "", "text", "chat_store_order_member"],
  ["support_admin_replied", "", "", "", "support_case", "support_reply"],
  ["support_case_assigned", "", "", "", "support_case", "support_case_status"],
  ["support_case_created", "", "", "", "support_case", "support_case_status"],
  ["support_case_reopened", "", "", "", "support_case", "support_case_status"],
  ["support_case_resolved", "", "", "", "support_case", "support_case_status"],
  ["support_customer_replied", "", "", "", "support_case", "support_case_status"],
  ["trade_message", "", "", "", "", "chat_trade"],
  ["trade_message", "", "", "", "image", "chat_trade"],
  ["trade_message", "", "", "", "location", "chat_trade"],
  ["trade_message", "", "", "", "text", "chat_trade"],
  ["trade_status", "", "", "", "", null],
  ["trade_status", "trade_completed", "", "", "", "trade_completed"],
  ["trade_status", "trade_offer", "", "", "", "trade_offer"],
  ["trade_status", "trade_reserved", "", "", "", "trade_reserved"],
  ["trade_status", "trade_status", "", "", "", null],];

/** 작성 코드가 없는 옛 행(kind 없음) — 항목 없음이 정상. 새 행은 생기지 않는다. */
const LEGACY_UNMATCHED = new Set(["community_activity|", "order_status|", "trade_status|", "trade_status|trade_status"]);

describe("notification item registry", () => {
  it("운영 알림 형태마다 항목이 정확히 정해진다", () => {
    for (const [type, kind, rr, ct, pk, expected] of PRODUCTION_SHAPES) {
      const item = resolveNotificationItem({
        eventType: type,
        kind: kind || null,
        receiverRole: rr || null,
        campaignType: ct || null,
        previewKind: pk || null,
      });
      if (expected === null) {
        expect(LEGACY_UNMATCHED.has(`${type}|${kind}`), `${type}|${kind}`).toBe(true);
        expect(item).toBeNull();
      } else {
        expect(item?.key, `${type}|${kind}|${rr}|${ct}|${pk}`).toBe(expected);
      }
    }
  });

  it("항목 키 중복 없음 · 견본은 자기 항목으로 돌아온다", () => {
    const keys = NOTIFICATION_ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const it of NOTIFICATION_ITEMS) {
      expect(it.samples.length).toBeGreaterThan(0);
      for (const s of it.samples) expect(resolveNotificationItem(s)?.key, `${it.key}`).toBe(it.key);
    }
  });

  it("회원·사장님 항목은 자기 소리 키 1개 (공유 없음) · 등록부에 있음", () => {
    const seen = new Map<string, string>();
    for (const it of NOTIFICATION_ITEMS) {
      if (it.audience === "admin" || it.key === "admin_test") {
        expect(it.soundEventKey).toBeNull();
        continue;
      }
      expect(it.soundEventKey, it.key).toBeTruthy();
      const key = it.soundEventKey!;
      expect(seen.get(key), `${key} shared by ${seen.get(key)} and ${it.key}`).toBeUndefined();
      seen.set(key, it.key);
      expect(getRegistryEvent(key), key).toBeTruthy();
    }
  });

  it("새 소리 키 = 시드 표 = 마이그레이션 · 채널은 기존 채널", () => {
    // 항목 소리 키 시드 마이그레이션 — 처음 묶음 + 이후 추가(재감사 E-1 Coin 출금 결과)
    const sql = [
      "supabase/migrations/20271102030000_notification_item_sound_events.sql",
      "supabase/migrations/20271104160000_notification_item_owner_coin_withdrawal_sound.sql",
    ]
      .map((f) => readFileSync(join(process.cwd(), f), "utf8"))
      .join("\n");
    const itemKeys = NOTIFICATION_ITEMS.map((i) => i.soundEventKey).filter((k): k is string => !!k?.startsWith("item_"));
    expect(new Set(NOTIFICATION_ITEM_SOUND_SEEDS.map((s) => s.eventKey))).toEqual(new Set(itemKeys));
    const existingChannels = new Set(
      NOTIFICATION_ITEM_SOUND_SEEDS.map((s) => getRegistryEvent(s.channelFrom)?.android_channel_id)
    );
    for (const s of NOTIFICATION_ITEM_SOUND_SEEDS) {
      expect(sql).toContain(`('${s.eventKey}', `);
      const ev = getRegistryEvent(s.eventKey)!;
      expect(ev.android_channel_id).toBe(getRegistryEvent(s.channelFrom)!.android_channel_id);
      expect(existingChannels.has(ev.android_channel_id)).toBe(true);
      expect(ev.fallback_event_key).toBe(s.mappingFrom);
    }
  });

  it("앱 안·푸시 소리 키 = 항목 소리 키 (같은 행 → 같은 키)", () => {
    const giftPush = resolveNotificationSoundEventKeyFromRow({
      event_type: "community_activity",
      meta: { kind: "gift_transfer_offered" },
    });
    const giftInApp = resolveNotificationSoundEventKeyFromRow({
      event_type: "community_activity",
      notification_type: "chat",
      meta: { kind: "gift_transfer_offered", push_kind: "chat" },
    });
    expect(giftPush).toBe("item_gift_offered");
    expect(giftInApp).toBe("item_gift_offered");
    expect(
      resolveNotificationSoundEventKeyFromRow({ event_type: "notice_published", campaign_type: "system" })
    ).toBe("item_campaign_system");
    expect(
      resolveNotificationSoundEventKeyFromRow({ event_type: "notice_published", campaign_type: "notice" })
    ).toBe("admin_notice_received");
    // 항목이 없는 통화 수신 신호는 기존 규칙 그대로
    expect(resolveNotificationSoundEventKeyFromRow({ event_type: "missed_call" })).toBe("call_missed");
  });

  it("행 → 판정 입력: legacyMeta.kind · 최상위 kind · 수신 역할 · 캠페인 · 미리보기", () => {
    expect(
      notificationItemInputFromEvent("store_order_message", { legacyMeta: { kind: "store_order_message", receiverRole: "owner" } })
    ).toMatchObject({ kind: "store_order_message", receiverRole: "owner" });
    expect(notificationItemInputFromEvent("missed_call", { kind: "missed_call" }).kind).toBe("missed_call");
    // 부재중 통화 소리 키는 항목표 도입 전과 같다(통화 변경 규정 — 바꾸지 않음).
    expect(getNotificationItem("call_missed")).toMatchObject({ soundEventKey: "call_missed" });
    // kind 를 넣기 전 리뷰 답글(운영 2026-10-21 행) — notification_type "review" 로 같은 항목
    expect(
      resolveNotificationItem(
        notificationItemInputFromEvent("order_status", { legacyNotificationType: "review", legacyMeta: { store_id: "s" } })
      )?.key
    ).toBe("order_review_reply");
    expect(resolveNotificationItem(notificationItemInputFromEvent("order_status", {}))).toBeNull();
  });
});
