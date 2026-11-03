import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isOwnerStoreCommerceNotificationRow,
  OWNER_STORE_OPS_NOTICE_META_KINDS,
} from "@/lib/notifications/owner-store-commerce-notification-meta";
import { isMemberNotificationAUnread } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility";
import { ownerHubOrderAlertsFromMeta } from "@/lib/stores/owner-hub-order-counts-cache";
import { OWNER_NOTIF_GROUPS } from "@/components/stores/owner/owner-notification-inbox-items";

function opsRow(kind: string, storeId: string | null) {
  return {
    id: "e1",
    type: "admin_notice",
    category: "admin_notice",
    unread: true,
    read_at: null,
    display_payload: {
      routeUrl: "/stores/owner",
      legacyMeta: { kind, ...(storeId ? { store_id: storeId } : {}) },
    },
  };
}

describe("B-04 (Owner 승인 2026-10-28) — 관리자 → 오너 운영 알림 분리", () => {
  it("매장 id 가 있으면 오너 알림(회원 A 아님)", () => {
    for (const kind of OWNER_STORE_OPS_NOTICE_META_KINDS) {
      expect(isMemberNotificationAUnread(opsRow(kind, "store-1")), kind).toBe(false);
      expect(isOwnerStoreCommerceNotificationRow({ meta: { kind, store_id: "store-1" } }), kind).toBe(true);
    }
  });

  it("재감사 2026-11-02 D7: 사장님 플랫폼 문의 답변(최상위 kind·store_id 저장) = 오너 알림, 회원 A 아님 · 매장 운영 탭", () => {
    const row = {
      id: "e2",
      type: "inquiry_answered",
      category: "inquiry_answered",
      unread: true,
      read_at: null,
      display_payload: {
        kind: "store_platform_inquiry_replied",
        store_id: "store-1",
        previewKind: "platform_admin_inquiry",
        routeUrl: "/stores/owner/inquiries/q1",
      },
    };
    expect(isMemberNotificationAUnread(row)).toBe(false);
    // 종류가 없는 옛 행(운영 1건)은 회원 쪽에 그대로
    expect(
      isMemberNotificationAUnread({ ...row, display_payload: { previewKind: "platform_admin_inquiry", routeUrl: "/x" } })
    ).toBe(true);
    const writer = readFileSync(join(process.cwd(), "lib/notifications/notify-store-points.ts"), "utf8");
    expect(writer).toContain('kind: "store_platform_inquiry_replied",');
    expect(writer).toContain("store_id: storeId,");
    expect(
      OWNER_NOTIF_GROUPS.find((g) => g.id === "store_ops")!.match({
        id: "e2",
        notification_type: "commerce",
        title: "t",
        body: null,
        link_url: "/stores/owner/inquiries/q1",
        is_read: false,
        created_at: "2026-11-02T00:00:00Z",
        meta: { kind: "store_platform_inquiry_replied" },
      })
    ).toBe(true);
  });

  it("매장 id 가 없는 과거 행은 회원 쪽에 그대로(어디에서도 안 보이는 행 방지)", () => {
    expect(isMemberNotificationAUnread(opsRow("admin_store_operational_notice", null))).toBe(true);
    expect(isOwnerStoreCommerceNotificationRow({ meta: { kind: "delivery_ad_approved" } })).toBe(false);
  });

  it("TS 목록 = SQL owner_store_ops_notice_notification_kinds()", () => {
    const sql = readFileSync(
      // 마지막 정의 파일(재감사 R1 2026-11-03 에서 Coin 출금 반려·지급 완료 추가)
      join(process.cwd(), "supabase/migrations/20271104120000_owner_coin_withdrawal_outcome_kinds.sql"),
      "utf8"
    );
    const body = sql.slice(sql.indexOf("owner_store_ops_notice_notification_kinds()"));
    const arr = body.slice(body.indexOf("ARRAY["), body.indexOf("]::text[]"));
    const kinds = [...arr.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]).sort();
    expect(kinds).toEqual([...OWNER_STORE_OPS_NOTICE_META_KINDS].sort());
  });
});

describe("D-Q1 (Owner 2026-10-28) — 오너 「주문」 = 접수대기 + 환불 + 취소요청", () => {
  it("취소 요청을 합산", () => {
    expect(
      ownerHubOrderAlertsFromMeta({ pending_accept_count: 2, refund_requested_count: 1, cancel_requested_count: 3 })
    ).toBe(6);
  });
  it("구 응답(필드 없음)은 0 으로", () => {
    expect(ownerHubOrderAlertsFromMeta({ pending_accept_count: 2, refund_requested_count: 1 })).toBe(3);
  });
});
