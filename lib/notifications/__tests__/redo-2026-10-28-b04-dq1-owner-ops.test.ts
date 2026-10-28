import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isOwnerStoreCommerceNotificationRow,
  OWNER_STORE_OPS_NOTICE_META_KINDS,
} from "@/lib/notifications/owner-store-commerce-notification-meta";
import { isMemberNotificationAUnread } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility";
import { ownerHubOrderAlertsFromMeta } from "@/lib/stores/owner-hub-order-counts-cache";

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

  it("매장 id 가 없는 과거 행은 회원 쪽에 그대로(어디에서도 안 보이는 행 방지)", () => {
    expect(isMemberNotificationAUnread(opsRow("admin_store_operational_notice", null))).toBe(true);
    expect(isOwnerStoreCommerceNotificationRow({ meta: { kind: "delivery_ad_approved" } })).toBe(false);
  });

  it("TS 목록 = SQL owner_store_ops_notice_notification_kinds()", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261028004405_owner_store_ops_notice_kinds.sql"),
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
