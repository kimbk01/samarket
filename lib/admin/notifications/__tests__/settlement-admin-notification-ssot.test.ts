import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_RECIPIENT_NOTIFICATION_TYPES,
  isAdminRecipientNotificationType,
  isSettlementAdminNotificationKind,
  SETTLEMENT_ADMIN_NOTIFICATION_KINDS,
  SETTLEMENT_SILENT_EVENTS,
  settlementWorkStatusFromAdjustment,
  type AdminNotificationDto,
} from "@/lib/admin/notifications/admin-notification-kinds";
import {
  authorityAllows,
  listAdminNotifications,
  withSettlementWorkStatus,
} from "@/lib/admin/notifications/admin-notification-service";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const MIG = read("supabase/migrations/20270510120000_store_commission_cash_ssot.sql");

function fn(name: string): string {
  const start = MIG.indexOf(`FUNCTION public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return MIG.slice(start, MIG.indexOf("\n$$;", start));
}

/** Minimal PostgREST fake for store_sale_fee_obligations reads. */
function obligationsDb(rows: Array<{ id: string; adjustment_status: string | null }>) {
  const reads: string[][] = [];
  const sb = {
    from(table: string) {
      expect(table).toBe("store_sale_fee_obligations");
      return {
        select: () => ({
          in: (_col: string, ids: string[]) => {
            reads.push(ids);
            return Promise.resolve({ data: rows.filter((r) => ids.includes(r.id)), error: null });
          },
        }),
      };
    },
  };
  return { sb: sb as never, reads };
}

function dto(p: Partial<AdminNotificationDto>): AdminNotificationDto {
  return {
    id: p.id ?? "n1",
    kind: p.kind ?? "settlement_commission_review",
    severity: p.severity ?? "warning",
    title: p.title ?? "t",
    body: null,
    linkUrl: null,
    workRefTable: p.workRefTable ?? "store_sale_fee_obligations",
    workRefId: p.workRefId ?? null,
    createdAt: "2026-10-17T00:00:00Z",
    readAt: p.readAt ?? null,
  };
}

describe("1. policy — exceptions only, normal flow is silent", () => {
  it("settlement kinds are admin-recipient types (never enter the member pipeline)", () => {
    for (const k of SETTLEMENT_ADMIN_NOTIFICATION_KINDS) {
      expect(ADMIN_RECIPIENT_NOTIFICATION_TYPES).toContain(k);
      expect(isAdminRecipientNotificationType(k)).toBe(true);
      expect(isSettlementAdminNotificationKind(k)).toBe(true);
    }
    // existing admin kinds unchanged
    expect(ADMIN_RECIPIENT_NOTIFICATION_TYPES).toContain("support_customer_replied");
    expect(ADMIN_RECIPIENT_NOTIFICATION_TYPES).toContain("support_case_assigned");
    expect(isSettlementAdminNotificationKind("support_case_assigned")).toBe(false);
  });

  it("silent events cover new order / accept / cooking charge / completion / top-up / auto-offset / decision / cash gate", () => {
    expect([...SETTLEMENT_SILENT_EVENTS].sort()).toEqual(
      [
        "order_created",
        "order_accepted",
        "cooking_started_commission_charged",
        "delivery_progress",
        "order_completed",
        "cash_top_up",
        "outstanding_auto_settled",
        "review_decided",
        "order_blocked_by_cash_gate",
      ].sort()
    );
  });

  it("the charge path never enqueues; only the cancel/refund branch notifies", () => {
    expect(fn("store_commission_charge_order_internal")).not.toMatch(/notify|outbox/);
    expect(fn("store_commission_debit_internal")).not.toMatch(/notify|outbox/);
    expect(fn("admin_decide_store_commission_adjustment")).not.toMatch(/notify|outbox/);
    expect(fn("store_orders_enforce_cash_order_gate")).not.toMatch(/notify|outbox/);
    const life = fn("store_orders_commission_lifecycle");
    expect(life.match(/store_commission_notify_review/g)?.length).toBe(1);
    const notifyAt = life.indexOf("store_commission_notify_review");
    const cancelAt = life.lastIndexOf("'cancelled'", notifyAt);
    const chargeAt = life.indexOf("store_commission_charge_order_internal(NEW.id, NEW.order_status)");
    expect(cancelAt).toBeGreaterThan(-1);
    expect(notifyAt).toBeGreaterThan(cancelAt);
    expect(chargeAt).toBeGreaterThan(-1);
    expect(life).toContain("RETURNING id INTO v_flagged");
    expect(fn("flag_store_commission_review")).toContain("store_commission_notify_review");
  });
});

describe("2. SSOT — one alert per event (idempotent source keys)", () => {
  it("review alert keyed by obligation id, only while review_required", () => {
    const body = fn("store_commission_notify_review");
    expect(body).toContain("'settlement_review:' || ");
    expect(body).toContain("review_required");
    expect(body).toContain("'settlement_commission_review'");
    expect(body).toContain("/admin/store-settlements?tab=ledger&order_no=");
    expect(body).toContain("&open=");
    expect(body).toContain("'store_sale_fee_obligations'");
  });

  it("notify_admin goes through the existing outbox (UNIQUE source_key) and never blocks the order", () => {
    const body = fn("store_commission_notify_admin");
    expect(body).toContain("admin_notification_outbox_enqueue");
    expect(body).toContain("to_regprocedure");
    expect(body).toContain("EXCEPTION WHEN OTHERS");
    expect(body).toContain("'broadcastPermission', 'business'");
    expect(body).toContain("'requiredPermission', 'business'");
    expect(body).toContain("'dedupeKey', p_source_key");
  });

  it("charge failure keyed per (order, target status); no alert if the transition actually happened", () => {
    const body = fn("store_commission_notify_charge_failure");
    expect(body).toContain("'settlement_exception:charge_failed:' || ");
    expect(body).toContain("v.order_status IS NOT DISTINCT FROM p_target_status");
    // recorded by a separate call after the refused UPDATE rolled back — the charge trigger never notifies
    expect(fn("store_orders_commission_lifecycle")).not.toContain("notify_charge_failure");
  });

  it("go-live baseline: pre-existing exceptions are recorded as handled, never pushed; reviews not baselined", () => {
    const body = fn("store_commission_notify_admin");
    expect(body).toContain("p_kind = 'settlement_financial_exception'");
    expect(body).toContain("current_setting('dibay.settlement_alert_baseline', true) = 'on'");
    expect(body).toContain("'delivered', NULL, 'baseline_preexisting'"); // no fake send time
    expect(body).toContain("ON CONFLICT (source_key) DO NOTHING");
    const tail = MIG.slice(MIG.indexOf("12. Alert go-live baseline"));
    expect(tail).toMatch(
      /PERFORM set_config\('dibay\.settlement_alert_baseline', 'on', true\);\s*PERFORM public\.store_commission_enqueue_exception_notifications\(\);\s*PERFORM set_config\('dibay\.settlement_alert_baseline', 'off', true\);\s*END;\s*\$\$;\s*COMMIT;/
    );
  });

  it("exception scan: balance mismatch, integrity, duplicate payout — stable keys, bigint ₱ format", () => {
    const body = fn("store_commission_enqueue_exception_notifications");
    expect(body).toContain("settlement_exception:balance_mismatch:");
    expect(body).toContain("cash_ledger_eq_fee_paid");
    expect(body).toContain("coin_over_credit");
    expect(body).toContain("[중복 지급 의심]");
    expect(body).toContain("store_commission_notify_review");
    expect(body).toContain("0)::bigint AS ledger_sum");
  });

  it("grants: helpers are service_role only; notify_review is internal (trigger/flag/scan only)", () => {
    for (const sig of [
      "store_commission_php_text(bigint)",
      "store_commission_notify_admin(text, text, text, text, text, text, text, text)",
      "store_commission_enqueue_exception_notifications()",
      "store_commission_notify_charge_failure(uuid, text, text)",
    ]) {
      expect(MIG).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`);
      expect(MIG).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`);
    }
    expect(MIG).toContain("REVOKE ALL ON FUNCTION public.store_commission_notify_review(uuid) FROM PUBLIC, anon, authenticated, service_role;");
    expect(MIG).not.toContain("GRANT EXECUTE ON FUNCTION public.store_commission_notify_review");
  });

  it("cron runs the scan before draining; status transition reports charge failures", () => {
    const cron = read("app/api/cron/admin-notification-delivery/route.ts");
    expect(cron.indexOf('rpc("store_commission_enqueue_exception_notifications")')).toBeGreaterThan(-1);
    expect(cron.indexOf('rpc("store_commission_enqueue_exception_notifications")')).toBeLessThan(
      cron.indexOf("runAdminNotificationDeliveryWorker(sb)")
    );
    const tx = read("lib/stores/apply-store-order-status-transition.ts");
    expect(tx).toContain('"store_commission_notify_charge_failure"');
  });
});

describe("3. work state is read live from the queue, separate from read state", () => {
  it("adjustment_status → label/state", () => {
    expect(settlementWorkStatusFromAdjustment("review_required")).toMatchObject({ state: "pending", labelKo: "검토 대기" });
    expect(settlementWorkStatusFromAdjustment("refunded")).toMatchObject({ state: "done", labelKo: "환급 승인 완료" });
    expect(settlementWorkStatusFromAdjustment("kept")).toMatchObject({ state: "done", labelKo: "환급 반려 완료" });
  });

  it("decision updates the existing alert's state (no new alert); read state untouched", async () => {
    const rows = [
      { id: "ob1", adjustment_status: "review_required" },
      { id: "ob2", adjustment_status: "refunded" },
      { id: "ob3", adjustment_status: "kept" },
    ];
    const { sb, reads } = obligationsDb(rows);
    const items = [
      dto({ id: "a", workRefId: "ob1" }),
      dto({ id: "b", workRefId: "ob2", readAt: "2026-10-17T01:00:00Z" }),
      dto({ id: "c", workRefId: "ob3" }),
      dto({ id: "d", kind: "settlement_financial_exception", severity: "critical", workRefTable: "stores", workRefId: "s1" }),
      dto({ id: "e", kind: "support_case_assigned", workRefTable: "support_cases", workRefId: "x" }),
    ];
    const out = await withSettlementWorkStatus(sb, items);
    expect(out).toHaveLength(5);
    expect(out[0].workStatus?.state).toBe("pending");
    expect(out[1].workStatus).toMatchObject({ state: "done", labelKo: "환급 승인 완료" });
    expect(out[1].readAt).toBe("2026-10-17T01:00:00Z");
    expect(out[0].readAt).toBeNull();
    expect(out[2].workStatus?.labelKo).toBe("환급 반려 완료");
    expect(out[3].workStatus).toMatchObject({ state: "attention", labelKo: "확인 필요" });
    expect(out[4]).toEqual(items[4]); // other admin kinds untouched
    expect(reads).toEqual([["ob1", "ob2", "ob3"]]); // one batched read

    rows[0].adjustment_status = "refunded"; // admin decided after the alert was created
    const again = await withSettlementWorkStatus(sb, items);
    expect(again[0].workStatus).toMatchObject({ state: "done", labelKo: "환급 승인 완료" });
  });

  it("no settlement items → no extra query", async () => {
    const { sb, reads } = obligationsDb([]);
    await withSettlementWorkStatus(sb, [dto({ kind: "support_case_assigned", workRefId: "x" })]);
    expect(reads).toHaveLength(0);
  });
});

describe("4. non-admin / no business permission cannot see settlement alerts", () => {
  it("inactive authority is refused before any query", async () => {
    const sb = { from: () => { throw new Error("must not query"); } } as never;
    expect(await listAdminNotifications(sb, { adminUserId: "u", authority: { active: false } })).toEqual({ ok: false, error: "admin_only" });
  });

  it("required permission 'business' gates visibility", () => {
    expect(authorityAllows({ active: false }, "business")).toBe(false);
    expect(authorityAllows({ active: true, isSuperAdmin: false, permissions: [] }, "business")).toBe(false);
    expect(authorityAllows({ active: true, isSuperAdmin: false, permissions: ["business"] }, "business")).toBe(true);
    expect(authorityAllows({ active: true, isSuperAdmin: true, permissions: [] }, "business")).toBe(true);
  });

  it("inbox API requires an admin actor; settlement routes stay admin-gated", () => {
    expect(read("app/api/admin/inbox/route.ts")).toContain("requireAdminApiActor()");
    expect(read("app/api/admin/store-commission-ledger/route.ts")).toMatch(/requireAdmin/);
  });
});
