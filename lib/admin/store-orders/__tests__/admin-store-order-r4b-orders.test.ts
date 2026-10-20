/**
 * R4 Area B (주문) — DEF-8 / E-1 legacy write gate, meta PATCH concurrency (updated_at CAS),
 * DEF-49 single-order links, DEF-60 single order-chat path, DEF-23 wording, payment events ?order_id=.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const audit = vi.hoisted(() => ({ appendAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/audit/append-audit-log", () => audit);
vi.mock("@/lib/stores/apply-store-order-status-transition", () => ({ applyStoreOrderStatusTransition: vi.fn() }));
vi.mock("@/lib/stores/store-order-counts-cache", () => ({ invalidateStoreOrderCountsCache: vi.fn() }));
vi.mock("@/lib/chats/owner-hub-badge-cache", () => ({ invalidateOwnerHubBadgeCache: vi.fn() }));
vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: vi.fn() }));

import {
  adminOrderTimestampMicros,
  adminPatchStoreOrderMeta,
  sameAdminOrderTimestamp,
} from "@/lib/stores/apply-admin-store-order-operations";
import {
  ADMIN_LEGACY_ORDER_WRITE_DISABLED_ROUTES,
  adminLegacyOrderWriteGoneBody,
  isAdminLegacyOrderWriteDisabled,
} from "@/lib/admin/store-orders/admin-legacy-order-write-gate";
import { legacyStoreOrdersRedirectTarget } from "@/lib/admin/store-orders/admin-store-order-ops-contract";
import { ADMIN_STORE_ORDER_INTERVENTION_LABEL } from "@/lib/admin/store-orders/admin-store-order-intervention-contract";
import {
  adminStoreOrderChatSenderRole,
  mapAdminStoreOrderChatMessages,
} from "@/lib/admin-delivery-orders/load-admin-store-order-chat";
import { adminDeliveryR4BMessages } from "@/lib/i18n/catalog/admin-delivery-r4-orders";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const AUDIT = { adminUserId: "admin-1", ip: null, user_agent: null };
const OID = "11111111-2222-3333-4444-555555555555";

type Call = { table: string; op: string; args: unknown[] };

/** Supabase stub for adminPatchStoreOrderMeta: records calls; `writeRows` = rows the conditional update returns. */
function metaSb(opts: { order: Record<string, unknown> | null; writeRows?: unknown[]; writeError?: { message: string } }) {
  const calls: Call[] = [];
  const sb = {
    from(table: string) {
      let mode: "select" | "update" = "select";
      const chain: Record<string, unknown> = {
        select: (...args: unknown[]) => {
          calls.push({ table, op: mode === "update" ? "update.select" : "select", args });
          if (mode === "update") {
            return Promise.resolve({ data: opts.writeError ? null : opts.writeRows ?? [], error: opts.writeError ?? null });
          }
          return chain;
        },
        update: (...args: unknown[]) => {
          mode = "update";
          calls.push({ table, op: "update", args });
          return chain;
        },
        eq: (...args: unknown[]) => {
          calls.push({ table, op: "eq", args });
          return chain;
        },
        maybeSingle: async () => ({
          data: table === "store_orders" ? opts.order : { owner_user_id: "owner-1" },
          error: null,
        }),
      };
      return chain;
    },
  };
  return { sb: sb as never, calls };
}

const ORDER = {
  id: OID,
  store_id: "store-1",
  admin_locked: false,
  admin_flagged: false,
  admin_note: null,
  dispute_status: null,
  needs_admin_attention: false,
  updated_at: "2026-10-19T03:04:05.123456+00:00",
};

beforeEach(() => audit.appendAuditLog.mockClear());

describe("meta PATCH concurrency (updated_at CAS)", () => {
  it("timestamps compare at microsecond precision across formats", () => {
    expect(sameAdminOrderTimestamp("2026-10-19T03:04:05.123456+00:00", "2026-10-19T03:04:05.123456Z")).toBe(true);
    expect(sameAdminOrderTimestamp("2026-10-19 11:04:05.123456+08", "2026-10-19T03:04:05.123456Z")).toBe(true);
    expect(sameAdminOrderTimestamp("2026-10-19T03:04:05.123456Z", "2026-10-19T03:04:05.123457Z")).toBe(false);
    expect(adminOrderTimestampMicros("")).toBeNull();
    expect(sameAdminOrderTimestamp(null, "2026-10-19T03:04:05Z")).toBe(false);
  });

  it("lock / review mark / urgent without expected_updated_at → 400 (no write)", async () => {
    for (const patch of [{ admin_locked: true }, { admin_flagged: true }, { dispute_status: "urgent" }]) {
      const { sb, calls } = metaSb({ order: ORDER });
      const r = await adminPatchStoreOrderMeta(sb, OID, patch, AUDIT);
      expect(r).toMatchObject({ ok: false, error: "expected_updated_at_required", httpStatus: 400 });
      expect(calls.some((c) => c.op === "update")).toBe(false);
    }
  });

  it("stale expected_updated_at → 409 stale_updated_at before writing", async () => {
    const { sb, calls } = metaSb({ order: ORDER });
    const r = await adminPatchStoreOrderMeta(sb, OID, { admin_locked: true }, AUDIT, {
      expectedUpdatedAt: "2026-10-19T03:00:00Z",
    });
    expect(r).toMatchObject({ ok: false, error: "stale_updated_at", httpStatus: 409, currentUpdatedAt: ORDER.updated_at });
    expect(calls.some((c) => c.op === "update")).toBe(false);
    expect(audit.appendAuditLog).not.toHaveBeenCalled();
  });

  it("matching version → conditional write on the DB's own updated_at, bumps updated_at, audits", async () => {
    const { sb, calls } = metaSb({ order: ORDER, writeRows: [{ id: OID, updated_at: "2026-10-19T03:10:00.000001+00:00" }] });
    const r = await adminPatchStoreOrderMeta(sb, OID, { admin_locked: true, admin_note: " 확인 중 " }, AUDIT, {
      expectedUpdatedAt: "2026-10-19T03:04:05.123456Z",
    });
    expect(r).toEqual({ ok: true, updatedAt: "2026-10-19T03:10:00.000001+00:00" });
    const upd = calls.find((c) => c.op === "update");
    const row = upd?.args[0] as Record<string, unknown>;
    expect(row.admin_locked).toBe(true);
    expect(row.admin_note).toBe("확인 중");
    expect(typeof row.updated_at).toBe("string");
    expect(calls).toContainEqual({ table: "store_orders", op: "eq", args: ["updated_at", ORDER.updated_at] });
    expect(audit.appendAuditLog).toHaveBeenCalledTimes(1);
  });

  it("row changed between read and write (0 rows) → 409, no audit", async () => {
    const { sb } = metaSb({ order: ORDER, writeRows: [] });
    const r = await adminPatchStoreOrderMeta(sb, OID, { dispute_status: "urgent" }, AUDIT, {
      expectedUpdatedAt: ORDER.updated_at,
    });
    expect(r).toMatchObject({ ok: false, error: "stale_updated_at", httpStatus: 409 });
    expect(audit.appendAuditLog).not.toHaveBeenCalled();
  });

  it("attention flag alone (field screens) stays allowed without a version; DB errors are not leaked", async () => {
    const ok = metaSb({ order: ORDER, writeRows: [{ id: OID, updated_at: "x" }] });
    expect(await adminPatchStoreOrderMeta(ok.sb, OID, { needs_admin_attention: true }, AUDIT)).toMatchObject({ ok: true });
    expect(ok.calls.some((c) => c.op === "eq" && (c.args as unknown[])[0] === "updated_at")).toBe(false);
    const bad = metaSb({ order: ORDER, writeError: { message: "permission denied for table store_orders" } });
    expect(await adminPatchStoreOrderMeta(bad.sb, OID, { needs_admin_attention: true }, AUDIT)).toMatchObject({
      ok: false,
      error: "db_error",
    });
  });

  it("route + detail screen send / honour the version", () => {
    const route = read("app/api/admin/store-orders/[orderId]/route.ts");
    expect(route).toContain('requireAdminPermission("business")');
    expect(route).toContain("expectedUpdatedAt");
    expect(route).toContain("current_updated_at");
    const loader = read("lib/admin/store-orders/load-admin-store-order-detail.ts");
    expect(loader).toContain('"updated_at"');
    expect(loader).toContain("updatedAt: sOrNull(order.updated_at)");
    const view = read("components/admin/store-orders/AdminOrderDetailView.tsx");
    expect(view).toContain("expected_updated_at: o.updatedAt");
    expect(view).toContain('t("admin_r4b_meta_conflict")');
    expect(view).not.toContain("dibayConfirm");
  });
});

describe("DEF-8 / E-1 — legacy order write routes", () => {
  it("gate lists the UI-unused decision routes and answers 410 with the canonical route", () => {
    for (const r of ADMIN_LEGACY_ORDER_WRITE_DISABLED_ROUTES) expect(isAdminLegacyOrderWriteDisabled(r)).toBe(true);
    expect(adminLegacyOrderWriteGoneBody("POST /api/admin/store-orders/[orderId]/mark-paid")).toEqual({
      ok: false,
      error: "legacy_endpoint_disabled",
      route: "POST /api/admin/store-orders/[orderId]/mark-paid",
      use: "POST /api/admin/store-orders/[orderId]/intervene",
    });
  });

  it("approve-refund · cancel-request · mark-paid · PATCH decisions are gated (code kept), business permission", () => {
    for (const p of [
      "app/api/admin/store-orders/[orderId]/approve-refund/route.ts",
      "app/api/admin/store-orders/[orderId]/cancel-request/route.ts",
      "app/api/admin/store-orders/[orderId]/mark-paid/route.ts",
      "app/api/admin/store-orders/[orderId]/route.ts",
    ]) {
      const src = read(p);
      expect(src, p).toContain('requireAdminPermission("business")');
      expect(src, p).toContain("adminLegacyOrderWriteGoneResponse");
      expect(src, p).not.toContain("requireAdminApiUser");
    }
    const intervene = read("app/api/admin/store-orders/[orderId]/intervene/route.ts");
    expect(intervene).toContain('requireAdminPermission("business")');
    expect(intervene).toContain("expected_status_required");
  });

  it("no admin screen calls the gated routes", () => {
    for (const p of [
      "components/admin/store-orders/AdminOrderDetailView.tsx",
      "components/admin/delivery-orders/AdminStoreOrderInterventionPanel.tsx",
      "components/admin/stores/AdminStoreOrdersPage.tsx",
      "components/admin/delivery-orders/DeliveryRefundsClient.tsx",
      "components/admin/delivery-orders/DeliveryOrderDetailClient.tsx",
    ]) {
      const src = read(p);
      expect(src, p).not.toMatch(/\/approve-refund|\/cancel-request|\/mark-paid|force_cancel: true|complete_refund: true|reject_refund: true/);
    }
  });

  it("client components never import the server-only gate / loader", () => {
    for (const p of [
      "components/admin/store-orders/AdminOrderDetailView.tsx",
      "components/admin/delivery-orders/AdminStoreOrderChatViewer.tsx",
      "components/admin/stores/AdminStorePaymentEventsPage.tsx",
    ]) {
      const src = read(p);
      expect(src, p).not.toMatch(/admin-legacy-order-write-gate|from "@\/lib\/audit|next\/server|supabase-server/);
      expect(src, p).not.toMatch(/^import \{[^}]*\} from "@\/lib\/admin-delivery-orders\/load-admin-store-order-chat"/m);
    }
  });
});

describe("DEF-23 — 환불 처리 기록", () => {
  it("contract label + popup copy: no platform money movement; force cancel name", () => {
    const l = ADMIN_STORE_ORDER_INTERVENTION_LABEL.refund_approve;
    expect(l.ko).toBe("환불 처리 기록");
    expect(l.confirmKo).toContain("고객 결제는 매장에서 직접 처리, 플랫폼 자금 이동 없음");
    expect(ADMIN_STORE_ORDER_INTERVENTION_LABEL.force_cancel.ko).toBe("강제 취소");
    const all = JSON.stringify(ADMIN_STORE_ORDER_INTERVENTION_LABEL);
    expect(all).not.toContain("환불 승인");
  });

  it("i18n override removes 「환불 승인」 / 「매장 주문(액션)」 / 「원장」 (DEF-61), ko/en keys identical", () => {
    const ko = adminDeliveryR4BMessages.ko as Record<string, string>;
    const en = adminDeliveryR4BMessages.en as Record<string, string>;
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
    for (const v of Object.values(ko)) {
      expect(v).not.toMatch(/환불 승인|매장 주문\(액션\)|원장|store_payment_events|payload/);
    }
  });
});

describe("DEF-49 — a single-order link opens the order detail", () => {
  it("/admin/store-orders?order_id=<uuid> → /admin/stores/orders/{id} (returnTo kept)", () => {
    expect(legacyStoreOrdersRedirectTarget(new URLSearchParams(`order_id=${OID}`))).toBe(`/admin/stores/orders/${OID}`);
    expect(
      legacyStoreOrdersRedirectTarget(new URLSearchParams(`order_id=${OID}&returnTo=${encodeURIComponent("/admin/finance?x=1")}`))
    ).toBe(`/admin/stores/orders/${OID}?returnTo=${encodeURIComponent("/admin/finance?x=1")}`);
    // not a uuid → still the list filter (old behaviour)
    expect(legacyStoreOrdersRedirectTarget(new URLSearchParams("order_id=abc"))).toBe("/admin/stores/orders?order_id=abc");
  });

  it("payment events page links to the detail and honours ?order_id= from the URL", () => {
    const page = read("components/admin/stores/AdminStorePaymentEventsPage.tsx");
    // R7 — 주소가 조회 조건 (`order_id`·`source`·`event_type` = useAdminListQuery extras), 바뀌면 다시 조회.
    expect(page).toContain('extras: ["order_id", "source", "event_type"]');
    expect(page).toContain("lq.query.extras.order_id");
    expect(page).toContain("[lq.refreshKey]");
    expect(page).toContain("/admin/stores/orders/${encodeURIComponent(r.order_id)}");
    expect(page).toContain('titleKey="admin_menu_store_payment_events"');
    expect(page).toContain("AdminTechDetails");
    const api = read("app/api/admin/store-payment-events/route.ts");
    expect(api).toContain('q = q.eq("order_id", orderId)');
    expect(api).not.toContain("error: error.message");
  });
});

describe("DEF-60 — one admin order-chat path, read-only, not via messenger admin", () => {
  it("chat page renders the order-chat viewer (no redirect to /admin/chats/messenger)", () => {
    const page = read("app/admin/stores/orders/[orderId]/chat/page.tsx");
    expect(page).toContain("AdminStoreOrderChatViewer");
    expect(page).not.toContain("/admin/chats/messenger");
    expect(page).not.toContain("redirect(");
    const loader = read("lib/admin-delivery-orders/load-admin-store-order-chat.ts");
    expect(loader).not.toMatch(/ensureStoreOrderMessengerRoom|\.insert\(|\.update\(|\.upsert\(|unread_count|last_read/);
  });

  it("sender role from the order's buyer / store owner; oldest first", () => {
    const ids = { buyerUserId: "b", ownerUserId: "o" };
    expect(adminStoreOrderChatSenderRole(null, ids)).toBe("system");
    expect(adminStoreOrderChatSenderRole("b", ids)).toBe("buyer");
    expect(adminStoreOrderChatSenderRole("o", ids)).toBe("store");
    expect(adminStoreOrderChatSenderRole("x", ids)).toBe("other");
    const out = mapAdminStoreOrderChatMessages(
      [
        { id: "2", sender_id: "o", message_type: "text", content: "네", created_at: "2026-10-19T02:00:00Z" },
        { id: "1", sender_id: "b", message_type: null, content: "문의", created_at: "2026-10-19T01:00:00Z", is_hidden_by_admin: true },
      ],
      { ...ids, buyerLabel: "구매자A", storeName: "매장B", profileLabel: () => "—" }
    );
    expect(out.map((m) => m.id)).toEqual(["1", "2"]);
    expect(out[0]).toMatchObject({ senderRole: "buyer", senderLabel: "구매자A", messageType: "text", hiddenByAdmin: true });
    expect(out[1]).toMatchObject({ senderRole: "store", senderLabel: "매장B" });
  });
});

describe("header standard — title = menu name", () => {
  it("order screens use AdminPageHeader with the menu key", () => {
    const ops = read("components/admin/store-orders/AdminOrderOpsScreen.tsx");
    expect(ops).toContain("<AdminPageHeader titleKey={ADMIN_ORDER_OPS_TITLE_KEY[screen]}");
    expect(ops).not.toContain("<h1");
    const logs = read("components/admin/store-orders/AdminOrderAuditLogsScreen.tsx");
    expect(logs).toContain('titleKey="admin_menu_delivery_logs"');
    expect(logs).not.toContain("<h1");
    expect(read("app/admin/order-chats/page.tsx")).toContain('titleKey="admin_menu_order_chats"');
  });
});
