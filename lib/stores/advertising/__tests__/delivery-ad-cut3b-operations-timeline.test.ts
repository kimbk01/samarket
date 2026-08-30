/**
 * PRODUCT CUT 3-B — Lifecycle → system timeline orchestration contracts.
 */
import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DELIVERY_AD_OPS_REQUIRED_EVENT_COVERAGE,
  mapDeliveryAdLifecycleAuditToOpsEvent,
} from "@/lib/stores/advertising/delivery-ad-operations-lifecycle-event";
import { fanOutDeliveryAdLifecycleAudit } from "@/lib/stores/advertising/delivery-ad-operations-lifecycle-fanout";
import { DELIVERY_AD_OPERATIONS_MESSAGE_TABLE } from "@/lib/stores/advertising/delivery-ad-operations-message";
import { ownerDeliveryAdsMessages } from "@/lib/i18n/catalog/owner-delivery-ads";

const ROOT = process.cwd();
const MIG = join(
  ROOT,
  "supabase/migrations/20261201220000_delivery_ads_cut3b_operations_timeline.sql"
);
const CASE_MIG = join(
  ROOT,
  "supabase/migrations/20261201200000_delivery_ads_cut3a_operations_case.sql"
);

function migSrc(): string {
  expect(existsSync(MIG)).toBe(true);
  return readFileSync(MIG, "utf8");
}

describe("CUT 3-B SQL message + Admin audit_id return", () => {
  it("creates messages table with UNIQUE(source_audit_id) FK to audit", () => {
    const sql = migSrc();
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.delivery_ad_operations_messages");
    expect(sql).toContain("REFERENCES public.delivery_ad_audit_logs (id)");
    expect(sql).toContain("REFERENCES public.delivery_ad_operations_threads (id)");
    expect(sql).toContain("UNIQUE (source_audit_id)");
    expect(sql).toContain("system_lifecycle");
    expect(sql).toContain("GRANT SELECT ON TABLE public.delivery_ad_operations_messages TO authenticated");
    expect(sql).toContain("GRANT ALL ON TABLE public.delivery_ad_operations_messages TO service_role");
    // No authenticated INSERT policy
    expect(sql).not.toMatch(/FOR INSERT[\s\S]{0,80}authenticated/);
  });

  it("Admin RPC return-shape only extended with audit_id", () => {
    const sql = migSrc();
    expect(sql).toContain("RETURNING id INTO v_audit_id");
    expect(sql).toContain("'audit_id', v_audit_id");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_delivery_ad_transition");
  });

  it("does not redesign Case/Thread or add notification/outbox", () => {
    const sql = migSrc();
    expect(sql).not.toContain("CREATE TABLE IF NOT EXISTS public.delivery_ad_operations_cases");
    expect(sql).not.toMatch(/notification_events|outbox|action_queue|deeplink/);
    expect(existsSync(CASE_MIG)).toBe(true);
  });
});

describe("CUT 3-B lifecycle event mapping SSOT", () => {
  it("covers required wired transitions without catch-all", () => {
    for (const row of DELIVERY_AD_OPS_REQUIRED_EVENT_COVERAGE) {
      const mapped = mapDeliveryAdLifecycleAuditToOpsEvent({
        fromLifecycle: row.from,
        toLifecycle: row.to,
        auditAction: row.action,
        actorType: "admin",
      });
      expect(mapped?.eventType, row.label).toBe(row.expect);
      expect(mapped?.messageKey).toBe(`delivery_ad_ops_${row.expect.toLowerCase()}`);
    }
  });

  it("RESUBMITTED distinct from SUBMITTED; pause owner ≠ pause admin", () => {
    const submit = mapDeliveryAdLifecycleAuditToOpsEvent({
      fromLifecycle: "DRAFT",
      toLifecycle: "SUBMITTED",
      auditAction: "submitted",
      actorType: "owner",
    });
    const resub = mapDeliveryAdLifecycleAuditToOpsEvent({
      fromLifecycle: "CHANGES_REQUESTED",
      toLifecycle: "SUBMITTED",
      auditAction: "resubmitted",
      actorType: "owner",
    });
    expect(submit?.eventType).toBe("SUBMITTED");
    expect(submit?.caseEffect).toBe("WAITING_ADMIN");
    expect(resub?.eventType).toBe("RESUBMITTED");
    expect(resub?.caseEffect).toBe("WAITING_ADMIN");

    const po = mapDeliveryAdLifecycleAuditToOpsEvent({
      fromLifecycle: "ACTIVE",
      toLifecycle: "PAUSED_OWNER",
      auditAction: "paused_owner",
      actorType: "owner",
    });
    const pa = mapDeliveryAdLifecycleAuditToOpsEvent({
      fromLifecycle: "ACTIVE",
      toLifecycle: "PAUSED_ADMIN",
      auditAction: "paused_admin",
      actorType: "admin",
    });
    expect(po?.eventType).toBe("PAUSED_OWNER");
    expect(pa?.eventType).toBe("PAUSED_ADMIN");
    expect(pa?.caseEffect).toBe("WAITING_OWNER");
    expect(po?.eventType).not.toBe(pa?.eventType);
  });

  it("CHANGES_REQUESTED → WAITING_OWNER; REJECTED → RESOLVED (no resubmit wording key)", () => {
    const cr = mapDeliveryAdLifecycleAuditToOpsEvent({
      fromLifecycle: "UNDER_REVIEW",
      toLifecycle: "CHANGES_REQUESTED",
      auditAction: "changes_requested",
      actorType: "admin",
    });
    const rej = mapDeliveryAdLifecycleAuditToOpsEvent({
      fromLifecycle: "UNDER_REVIEW",
      toLifecycle: "REJECTED",
      auditAction: "rejected",
      actorType: "admin",
    });
    expect(cr?.caseEffect).toBe("WAITING_OWNER");
    expect(rej?.caseEffect).toBe("RESOLVED");
    // REJECTED must not imply CHANGES_REQUESTED-style "fix and resubmit this application"
    expect(ownerDeliveryAdsMessages.ko.delivery_ad_ops_rejected).not.toMatch(/수정해서/);
    expect(ownerDeliveryAdsMessages.ko.delivery_ad_ops_rejected).toMatch(/같은 신청으로 다시 제출할 수 없/);
    expect(ownerDeliveryAdsMessages.en.delivery_ad_ops_rejected).toMatch(/cannot resubmit/i);
  });

  it("unknown audit action skips (no generic status-change)", () => {
    const mapped = mapDeliveryAdLifecycleAuditToOpsEvent({
      fromLifecycle: null,
      toLifecycle: null,
      auditAction: "draft_created",
      actorType: "owner",
    });
    expect(mapped).toBeNull();
  });

  it("ko/en keys exist for every required event messageKey", () => {
    for (const row of DELIVERY_AD_OPS_REQUIRED_EVENT_COVERAGE) {
      const key = `delivery_ad_ops_${row.expect.toLowerCase()}` as keyof typeof ownerDeliveryAdsMessages.ko;
      expect(ownerDeliveryAdsMessages.ko[key], key).toBeTruthy();
      expect(ownerDeliveryAdsMessages.en[key], key).toBeTruthy();
    }
  });
});

type FanOutState = {
  audits: Record<string, Record<string, unknown>>;
  cases: Record<string, Record<string, unknown>>;
  threads: Record<string, Record<string, unknown>>;
  messages: Record<string, Record<string, unknown>>;
  campaigns: Record<string, { owner_user_id: string }>;
  insertFail?: boolean;
};

function makeFanOutSb(state: FanOutState) {
  const from = (table: string) => {
    const api: Record<string, unknown> = {};
    const filters: Array<{ col: string; val: unknown }> = [];
    let insertPayload: Record<string, unknown> | null = null;
    let updatePayload: Record<string, unknown> | null = null;

    const applyFilters = (rows: Record<string, unknown>[]) =>
      rows.filter((r) => filters.every((f) => r[f.col] === f.val));

    api.select = () => api;
    api.eq = (col: string, val: unknown) => {
      filters.push({ col, val });
      return api;
    };
    api.insert = (row: Record<string, unknown>) => {
      insertPayload = row;
      return api;
    };
    api.update = (row: Record<string, unknown>) => {
      updatePayload = row;
      return api;
    };
    api.maybeSingle = async () => {
      if (table === "delivery_ad_audit_logs") {
        const id = String(filters.find((f) => f.col === "id")?.val ?? "");
        const row = state.audits[id];
        return row ? { data: row, error: null } : { data: null, error: null };
      }
      if (table === DELIVERY_AD_OPERATIONS_MESSAGE_TABLE) {
        if (insertPayload) {
          if (state.insertFail) {
            return { data: null, error: { message: "forced insert fail", code: "XX000" } };
          }
          const auditId = String(insertPayload.source_audit_id);
          if (Object.values(state.messages).some((m) => m.source_audit_id === auditId)) {
            return {
              data: null,
              error: { code: "23505", message: "duplicate key value violates unique constraint" },
            };
          }
          const id = `msg-${Object.keys(state.messages).length + 1}`;
          const row = { id, ...insertPayload };
          state.messages[id] = row;
          return { data: row, error: null };
        }
        const auditId = filters.find((f) => f.col === "source_audit_id")?.val;
        const found = Object.values(state.messages).find((m) => m.source_audit_id === auditId);
        return found ? { data: found, error: null } : { data: null, error: null };
      }
      if (table === "delivery_ad_operations_cases") {
        if (insertPayload) {
          const id = `case-${Object.keys(state.cases).length + 1}`;
          const row = { id, ...insertPayload };
          state.cases[id] = row;
          const tid = `thread-${id}`;
          state.threads[tid] = { id: tid, case_id: id };
          return { data: row, error: null };
        }
        if (updatePayload) {
          const id = String(filters.find((f) => f.col === "id")?.val ?? "");
          const prev = state.cases[id];
          if (!prev) return { data: null, error: null };
          const next = { ...prev, ...updatePayload };
          state.cases[id] = next;
          return { data: next, error: null };
        }
        const sponsored = filters.find((f) => f.col === "store_sponsored_campaign_id")?.val;
        const banner = filters.find((f) => f.col === "banner_campaign_id")?.val;
        const found = Object.values(state.cases).find(
          (c) =>
            (sponsored && c.store_sponsored_campaign_id === sponsored) ||
            (banner && c.banner_campaign_id === banner)
        );
        return found ? { data: found, error: null } : { data: null, error: null };
      }
      if (table === "delivery_ad_operations_threads") {
        if (insertPayload) {
          const id = `thread-${Object.keys(state.threads).length + 1}`;
          const row = { id, ...insertPayload };
          state.threads[id] = row;
          return { data: row, error: null };
        }
        const caseId = filters.find((f) => f.col === "case_id")?.val;
        const id = filters.find((f) => f.col === "id")?.val;
        const found = Object.values(state.threads).find(
          (t) => (caseId && t.case_id === caseId) || (id && t.id === id)
        );
        return found ? { data: found, error: null } : { data: null, error: null };
      }
      if (table === "store_paid_ad_campaigns" || table === "store_banner_ad_campaigns") {
        const id = String(filters.find((f) => f.col === "id")?.val ?? "");
        const camp = state.campaigns[id];
        return camp
          ? { data: { id, owner_user_id: camp.owner_user_id }, error: null }
          : { data: null, error: null };
      }
      return { data: null, error: null };
    };
    return api;
  };
  return { from } as never;
}

describe("CUT 3-B fanOutDeliveryAdLifecycleAudit", () => {
  it("Owner sponsored: ensure case + one system event; retry idempotent", async () => {
    const auditId = "audit-s1";
    const campId = "camp-s1";
    const state: FanOutState = {
      audits: {
        [auditId]: {
          id: auditId,
          product_kind: "store_sponsored",
          campaign_id: campId,
          actor_type: "owner",
          action: "submitted",
          before_json: { lifecycle_status: "DRAFT" },
          after_json: { lifecycle_status: "SUBMITTED" },
          reason: null,
          created_at: "2026-08-30T00:00:00.000Z",
        },
      },
      cases: {},
      threads: {},
      messages: {},
      campaigns: { [campId]: { owner_user_id: "owner-1" } },
    };
    const sb = makeFanOutSb(state);
    const first = await fanOutDeliveryAdLifecycleAudit(sb, { auditId });
    expect(first.ok && !("skipped" in first && first.skipped)).toBe(true);
    if (!first.ok || first.skipped) throw new Error("expected event");
    expect(first.message.eventType).toBe("SUBMITTED");
    expect(first.message.sourceAuditId).toBe(auditId);
    expect(first.duplicated).toBe(false);
    expect(Object.keys(state.messages)).toHaveLength(1);
    expect(Object.keys(state.cases)).toHaveLength(1);
    expect(state.cases[first.caseId]?.status).toBe("WAITING_ADMIN");

    const second = await fanOutDeliveryAdLifecycleAudit(sb, { auditId });
    expect(second.ok && !("skipped" in second && second.skipped)).toBe(true);
    if (!second.ok || second.skipped) throw new Error("expected dup");
    expect(second.duplicated).toBe(true);
    expect(second.message.id).toBe(first.message.id);
    expect(Object.keys(state.messages)).toHaveLength(1);
  });

  it("Owner banner PAUSED_OWNER and Admin PAUSED_ADMIN are distinct events", async () => {
    const campId = "camp-b1";
    const state: FanOutState = {
      audits: {
        "a-owner": {
          id: "a-owner",
          product_kind: "banner",
          campaign_id: campId,
          actor_type: "owner",
          action: "owner_banner_pause",
          before_json: { lifecycle: "ACTIVE" },
          after_json: { lifecycle: "PAUSED_OWNER" },
          created_at: "2026-08-30T01:00:00.000Z",
        },
        "a-admin": {
          id: "a-admin",
          product_kind: "banner",
          campaign_id: campId,
          actor_type: "admin",
          action: "paused_admin",
          before_json: { lifecycle: "ACTIVE" },
          after_json: { lifecycle: "PAUSED_ADMIN" },
          reason: "policy",
          created_at: "2026-08-30T02:00:00.000Z",
        },
      },
      cases: {},
      threads: {},
      messages: {},
      campaigns: { [campId]: { owner_user_id: "owner-1" } },
    };
    const sb = makeFanOutSb(state);
    const o = await fanOutDeliveryAdLifecycleAudit(sb, { auditId: "a-owner" });
    const a = await fanOutDeliveryAdLifecycleAudit(sb, { auditId: "a-admin" });
    expect(o.ok && !o.skipped && o.message.eventType).toBe("PAUSED_OWNER");
    expect(a.ok && !a.skipped && a.message.eventType).toBe("PAUSED_ADMIN");
    expect(Object.keys(state.cases)).toHaveLength(1);
    expect(Object.keys(state.threads)).toHaveLength(1);
    expect(Object.keys(state.messages)).toHaveLength(2);
  });

  it("Admin reject: RESOLVED case; reason stays on audit (not human message)", async () => {
    const campId = "camp-s2";
    const state: FanOutState = {
      audits: {
        "a-rej": {
          id: "a-rej",
          product_kind: "store_sponsored",
          campaign_id: campId,
          actor_type: "admin",
          action: "rejected",
          before_json: { lifecycle: "UNDER_REVIEW" },
          after_json: { lifecycle: "REJECTED" },
          reason: "policy violation",
          created_at: "2026-08-30T03:00:00.000Z",
        },
      },
      cases: {},
      threads: {},
      messages: {},
      campaigns: { [campId]: { owner_user_id: "owner-1" } },
    };
    const sb = makeFanOutSb(state);
    const res = await fanOutDeliveryAdLifecycleAudit(sb, { auditId: "a-rej" });
    expect(res.ok && !res.skipped).toBe(true);
    if (!res.ok || res.skipped) throw new Error("expected reject event");
    expect(res.message.eventType).toBe("REJECTED");
    expect(res.message.kind).toBe("system_lifecycle");
    expect(res.message.senderRole).toBe("system");
    expect(state.cases[res.caseId]?.status).toBe("RESOLVED");
    expect(Object.values(state.messages).every((m) => m.kind === "system_lifecycle")).toBe(true);
  });

  it("message insert failure does not attempt campaign compensation", async () => {
    const campId = "camp-s3";
    const state: FanOutState = {
      audits: {
        "a-fail": {
          id: "a-fail",
          product_kind: "store_sponsored",
          campaign_id: campId,
          actor_type: "owner",
          action: "submitted",
          before_json: { lifecycle_status: "DRAFT" },
          after_json: { lifecycle_status: "SUBMITTED" },
          created_at: "2026-08-30T04:00:00.000Z",
        },
      },
      cases: {},
      threads: {},
      messages: {},
      campaigns: { [campId]: { owner_user_id: "owner-1" } },
      insertFail: true,
    };
    const sb = makeFanOutSb(state);
    const rpcSpy = vi.fn();
    (sb as { rpc?: unknown }).rpc = rpcSpy;
    const res = await fanOutDeliveryAdLifecycleAudit(sb, { auditId: "a-fail" });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected fail");
    expect(res.error).toBe("db_error");
    expect(rpcSpy).not.toHaveBeenCalled();
    expect(Object.keys(state.messages)).toHaveLength(0);
  });
});

describe("CUT 3-B writer wiring (source)", () => {
  it("Owner + Admin transition writers call safeFanOut after auditId", () => {
    const sponsored = readFileSync(
      join(ROOT, "lib/stores/advertising/owner-store-sponsored-writer.ts"),
      "utf8"
    );
    const banner = readFileSync(
      join(ROOT, "lib/stores/advertising/owner-banner-writer.ts"),
      "utf8"
    );
    const admin = readFileSync(
      join(ROOT, "lib/stores/advertising/admin-delivery-ad-writer.ts"),
      "utf8"
    );
    expect(sponsored).toContain("safeFanOutDeliveryAdLifecycleAudit");
    expect(banner).toContain("safeFanOutDeliveryAdLifecycleAudit");
    expect(admin).toContain("safeFanOutDeliveryAdLifecycleAudit");
    expect(admin).toContain("auditId");
    expect(admin).toContain("payload.audit_id");
  });

  it("routes do not ensureCase / notify / expose timeline UI hooks", () => {
    const ownerRoute = readFileSync(
      join(ROOT, "app/api/me/stores/[storeId]/delivery-ads/[campaignId]/actions/route.ts"),
      "utf8"
    );
    const adminRoute = readFileSync(
      join(ROOT, "app/api/admin/delivery-ads/[campaignId]/actions/route.ts"),
      "utf8"
    );
    expect(ownerRoute).not.toMatch(/notification|deeplink|fanOut|ensureDeliveryAdOperationsCase/);
    expect(adminRoute).not.toMatch(/notification|deeplink|ensureDeliveryAdOperationsCase/);
  });
});
