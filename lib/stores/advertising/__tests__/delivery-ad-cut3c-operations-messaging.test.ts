/**
 * PRODUCT CUT 3-C — Human Owner↔Admin operations messaging contracts.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mapDeliveryAdOperationsMessageRow,
  DELIVERY_AD_OPS_HUMAN_MESSAGE_MAX_CHARS,
} from "@/lib/stores/advertising/delivery-ad-operations-message";
import {
  listDeliveryAdOperationsMessages,
  sendDeliveryAdOperationsMessage,
} from "@/lib/stores/advertising/delivery-ad-operations-messaging";

const ROOT = process.cwd();
const MIG = join(
  ROOT,
  "supabase/migrations/20261201230000_delivery_ads_cut3c_operations_messaging.sql"
);
const MIG_3B = join(
  ROOT,
  "supabase/migrations/20261201220000_delivery_ads_cut3b_operations_timeline.sql"
);

function migSrc(): string {
  expect(existsSync(MIG)).toBe(true);
  return readFileSync(MIG, "utf8");
}

describe("CUT 3-C SQL human messaging contract", () => {
  it("extends messages table; preserves UNIQUE(source_audit_id); human CHECK", () => {
    const sql = migSrc();
    expect(sql).toContain("ALTER COLUMN source_audit_id DROP NOT NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS body text NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS sender_user_id uuid NULL");
    expect(sql).toContain("kind = 'human'");
    expect(sql).toContain("source_audit_id IS NULL");
    expect(sql).toContain("kind = 'system_lifecycle'");
    expect(sql).toContain("source_audit_id IS NOT NULL");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.send_delivery_ad_operations_message");
    expect(sql).toContain("delivery_ad_ops_apply_case_status");
    expect(sql).toContain("WAITING_ADMIN");
    expect(sql).toContain("WAITING_OWNER");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.owner_delivery_ad_transition");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.admin_delivery_ad_transition");
    expect(sql).not.toContain("notification_events");
    expect(sql).not.toMatch(/UPDATE public\.store_paid_ad_campaigns|UPDATE public\.store_banner_ad_campaigns/);
  });

  it("3-B UNIQUE(source_audit_id) still present in foundation migration", () => {
    const b = readFileSync(MIG_3B, "utf8");
    expect(b).toContain("UNIQUE (source_audit_id)");
  });

  it("service_role execute only for send + status RPCs", () => {
    const sql = migSrc();
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.send_delivery_ad_operations_message"
    );
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.delivery_ad_ops_apply_case_status");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.send_delivery_ad_operations_message");
    expect(sql).toMatch(/FROM anon, authenticated/);
  });
});

describe("CUT 3-C message row mapping", () => {
  it("maps system vs human unions; rejects mixed shapes", () => {
    const sys = mapDeliveryAdOperationsMessageRow({
      id: "m1",
      thread_id: "t1",
      kind: "system_lifecycle",
      sender_role: "system",
      source_audit_id: "a1",
      event_type: "SUBMITTED",
      message_key: "delivery_ad_ops_submitted",
      body: null,
      sender_user_id: null,
      occurred_at: "t0",
      created_at: "t0",
    });
    expect(sys?.kind).toBe("system_lifecycle");
    if (sys?.kind === "system_lifecycle") {
      expect(sys.sourceAuditId).toBe("a1");
      expect(sys.body).toBeNull();
    }

    const human = mapDeliveryAdOperationsMessageRow({
      id: "m2",
      thread_id: "t1",
      kind: "human",
      sender_role: "owner",
      source_audit_id: null,
      event_type: null,
      message_key: null,
      body: "hello",
      sender_user_id: "u1",
      occurred_at: "t1",
      created_at: "t1",
    });
    expect(human?.kind).toBe("human");
    if (human?.kind === "human") {
      expect(human.sourceAuditId).toBeNull();
      expect(human.body).toBe("hello");
    }

    expect(
      mapDeliveryAdOperationsMessageRow({
        id: "bad",
        thread_id: "t1",
        kind: "human",
        sender_role: "owner",
        source_audit_id: "a1",
        body: "x",
        sender_user_id: "u1",
      })
    ).toBeNull();
  });

  it("human body max chars matches Care convention", () => {
    expect(DELIVERY_AD_OPS_HUMAN_MESSAGE_MAX_CHARS).toBe(4000);
  });
});

type MsgState = {
  campaigns: Record<string, { owner_user_id: string; lifecycle_status: string }>;
  cases: Record<string, Record<string, unknown>>;
  threads: Record<string, Record<string, unknown>>;
  messages: Record<string, Record<string, unknown>>;
  failMessageInsert?: boolean;
  failCaseStatus?: boolean;
};

function makeMessagingSb(state: MsgState) {
  const from = (table: string) => {
    const filters: Array<{ col: string; val: unknown }> = [];
    let insertPayload: Record<string, unknown> | null = null;
    const api: Record<string, unknown> = {};
    api.select = () => api;
    api.eq = (col: string, val: unknown) => {
      filters.push({ col, val });
      return api;
    };
    api.order = () => api;
    api.limit = () => api;
    api.insert = (row: Record<string, unknown>) => {
      insertPayload = row;
      return api;
    };
    api.maybeSingle = async () => {
      if (table === "store_paid_ad_campaigns" || table === "store_banner_ad_campaigns") {
        const id = String(filters.find((f) => f.col === "id")?.val ?? "");
        const c = state.campaigns[id];
        return c
          ? { data: { id, owner_user_id: c.owner_user_id, lifecycle_status: c.lifecycle_status }, error: null }
          : { data: null, error: null };
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
        const found = Object.values(state.threads).find((t) => t.case_id === caseId);
        return found ? { data: found, error: null } : { data: null, error: null };
      }
      if (table === "delivery_ad_operations_messages") {
        const threadId = filters.find((f) => f.col === "thread_id")?.val;
        const rows = Object.values(state.messages).filter((m) => m.thread_id === threadId);
        return { data: rows, error: null };
      }
      return { data: null, error: null };
    };
    // list uses thenable without maybeSingle on messages — support thenable chain
    (api as { then?: unknown }).then = undefined;
    return api;
  };

  // Override messages list path: select().eq().order().order().order().limit() returns array
  const fromWrapped = (table: string) => {
    if (table !== "delivery_ad_operations_messages") return from(table);
    const filters: Array<{ col: string; val: unknown }> = [];
    const api: Record<string, unknown> = {};
    const finish = async () => {
      const threadId = filters.find((f) => f.col === "thread_id")?.val;
      const rows = Object.values(state.messages)
        .filter((m) => m.thread_id === threadId)
        .sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
      return { data: rows, error: null };
    };
    api.select = () => api;
    api.eq = (col: string, val: unknown) => {
      filters.push({ col, val });
      return api;
    };
    api.order = () => api;
    api.limit = () => finish();
    return api;
  };

  return {
    from: fromWrapped,
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "send_delivery_ad_operations_message") {
        if (state.failMessageInsert) {
          return { data: { ok: false, error: "db_error", detail: "forced" }, error: null };
        }
        if (state.failCaseStatus) {
          // Simulate transactional failure: neither message nor status commit
          return { data: { ok: false, error: "db_error", detail: "case_status_failed" }, error: null };
        }
        const actorRole = String(args.p_actor_role);
        const actorId = String(args.p_actor_user_id);
        const campId = String(args.p_campaign_id);
        const caseId = String(args.p_case_id);
        const threadId = String(args.p_thread_id);
        const body = String(args.p_body ?? "").trim();
        const camp = state.campaigns[campId];
        if (!camp) return { data: { ok: false, error: "campaign_not_found" }, error: null };
        if (actorRole === "owner" && camp.owner_user_id !== actorId) {
          return { data: { ok: false, error: "forbidden" }, error: null };
        }
        if (!body) return { data: { ok: false, error: "empty_body" }, error: null };
        const caseStatus = actorRole === "owner" ? "WAITING_ADMIN" : "WAITING_OWNER";
        const id = `msg-${Object.keys(state.messages).length + 1}`;
        const msg = {
          id,
          thread_id: threadId,
          kind: "human",
          sender_role: actorRole,
          sender_user_id: actorId,
          source_audit_id: null,
          event_type: null,
          message_key: null,
          body,
          occurred_at: "2026-08-30T10:00:00.000Z",
          created_at: "2026-08-30T10:00:00.000Z",
        };
        state.messages[id] = msg;
        if (state.cases[caseId]) {
          state.cases[caseId] = {
            ...state.cases[caseId],
            status: caseStatus,
            resolved_at: null,
          };
        }
        return {
          data: {
            ok: true,
            message: msg,
            case_id: caseId,
            thread_id: threadId,
            case_status: caseStatus,
          },
          error: null,
        };
      }
      if (name === "delivery_ad_ops_apply_case_status") {
        return { data: { ok: true, case: {} }, error: null };
      }
      return { data: null, error: { message: name } };
    },
  } as never;
}

describe("CUT 3-C send/list service", () => {
  it("T1/T13 Owner Sponsored send → WAITING_ADMIN; lifecycle untouched in service", async () => {
    const campId = "camp-s1";
    const state: MsgState = {
      campaigns: { [campId]: { owner_user_id: "owner-1", lifecycle_status: "ACTIVE" } },
      cases: {},
      threads: {},
      messages: {},
    };
    const sb = makeMessagingSb(state);
    const before = state.campaigns[campId].lifecycle_status;
    const res = await sendDeliveryAdOperationsMessage(sb, {
      actorUserId: "owner-1",
      actorRole: "owner",
      productKind: "store_sponsored",
      campaignId: campId,
      body: "please check creative",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.message.kind).toBe("human");
    expect(res.message.senderRole).toBe("owner");
    expect(res.message.sourceAuditId).toBeNull();
    expect(res.caseStatus).toBe("WAITING_ADMIN");
    expect(state.campaigns[campId].lifecycle_status).toBe(before);
    expect(Object.keys(state.cases)).toHaveLength(1);
    expect(Object.keys(state.threads)).toHaveLength(1);
  });

  it("T2 Owner Banner send same Case/Thread contract", async () => {
    const campId = "camp-b1";
    const state: MsgState = {
      campaigns: { [campId]: { owner_user_id: "owner-1", lifecycle_status: "SUBMITTED" } },
      cases: {},
      threads: {},
      messages: {},
    };
    const sb = makeMessagingSb(state);
    const res = await sendDeliveryAdOperationsMessage(sb, {
      actorUserId: "owner-1",
      actorRole: "owner",
      productKind: "banner",
      campaignId: campId,
      body: "banner note",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.message.senderRole).toBe("owner");
    expect(res.caseStatus).toBe("WAITING_ADMIN");
  });

  it("T3/T14 Admin Sponsored send → WAITING_OWNER", async () => {
    const campId = "camp-s2";
    const state: MsgState = {
      campaigns: { [campId]: { owner_user_id: "owner-1", lifecycle_status: "UNDER_REVIEW" } },
      cases: {},
      threads: {},
      messages: {},
    };
    const sb = makeMessagingSb(state);
    const before = state.campaigns[campId].lifecycle_status;
    const res = await sendDeliveryAdOperationsMessage(sb, {
      actorUserId: "admin-1",
      actorRole: "admin",
      productKind: "store_sponsored",
      campaignId: campId,
      body: "please revise CTA",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.message.senderRole).toBe("admin");
    expect(res.caseStatus).toBe("WAITING_OWNER");
    expect(state.campaigns[campId].lifecycle_status).toBe(before);
  });

  it("T4 Admin Banner send", async () => {
    const campId = "camp-b2";
    const state: MsgState = {
      campaigns: { [campId]: { owner_user_id: "owner-1", lifecycle_status: "ACTIVE" } },
      cases: {},
      threads: {},
      messages: {},
    };
    const res = await sendDeliveryAdOperationsMessage(makeMessagingSb(state), {
      actorUserId: "admin-1",
      actorRole: "admin",
      productKind: "banner",
      campaignId: campId,
      body: "admin note",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.caseStatus).toBe("WAITING_OWNER");
  });

  it("T7/T8 cross-owner send blocked", async () => {
    const campId = "camp-s3";
    const state: MsgState = {
      campaigns: { [campId]: { owner_user_id: "owner-1", lifecycle_status: "ACTIVE" } },
      cases: {},
      threads: {},
      messages: {},
    };
    const res = await sendDeliveryAdOperationsMessage(makeMessagingSb(state), {
      actorUserId: "owner-other",
      actorRole: "owner",
      productKind: "store_sponsored",
      campaignId: campId,
      body: "intrusion",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("forbidden");
    expect(Object.keys(state.messages)).toHaveLength(0);
  });

  it("T5/T6 Owner+Admin read same chronological timeline", async () => {
    const campId = "camp-s4";
    const state: MsgState = {
      campaigns: { [campId]: { owner_user_id: "owner-1", lifecycle_status: "ACTIVE" } },
      cases: {
        c1: {
          id: "c1",
          product_kind: "store_sponsored",
          store_sponsored_campaign_id: campId,
          banner_campaign_id: null,
          owner_user_id: "owner-1",
          status: "WAITING_ADMIN",
          created_at: "t0",
          updated_at: "t0",
          resolved_at: null,
        },
      },
      threads: { th1: { id: "th1", case_id: "c1" } },
      messages: {
        m0: {
          id: "m0",
          thread_id: "th1",
          kind: "system_lifecycle",
          sender_role: "system",
          source_audit_id: "audit-1",
          event_type: "SUBMITTED",
          message_key: "delivery_ad_ops_submitted",
          body: null,
          sender_user_id: null,
          occurred_at: "2026-08-30T09:00:00.000Z",
          created_at: "2026-08-30T09:00:00.000Z",
        },
        m1: {
          id: "m1",
          thread_id: "th1",
          kind: "human",
          sender_role: "owner",
          source_audit_id: null,
          event_type: null,
          message_key: null,
          body: "hi",
          sender_user_id: "owner-1",
          occurred_at: "2026-08-30T10:00:00.000Z",
          created_at: "2026-08-30T10:00:00.000Z",
        },
      },
    };
    const ownerList = await listDeliveryAdOperationsMessages(makeMessagingSb(state), {
      actorUserId: "owner-1",
      actorRole: "owner",
      productKind: "store_sponsored",
      campaignId: campId,
    });
    const adminList = await listDeliveryAdOperationsMessages(makeMessagingSb(state), {
      actorUserId: "admin-1",
      actorRole: "admin",
      productKind: "store_sponsored",
      campaignId: campId,
    });
    expect(ownerList.ok && adminList.ok).toBe(true);
    if (!ownerList.ok || !adminList.ok) return;
    expect(ownerList.messages.map((m) => m.id)).toEqual(["m0", "m1"]);
    expect(adminList.messages.map((m) => m.id)).toEqual(["m0", "m1"]);
    expect(ownerList.messages[0]?.kind).toBe("system_lifecycle");
    expect(ownerList.messages[1]?.kind).toBe("human");
  });

  it("T22 message+case transactional failure leaves no message", async () => {
    const campId = "camp-s5";
    const state: MsgState = {
      campaigns: { [campId]: { owner_user_id: "owner-1", lifecycle_status: "ACTIVE" } },
      cases: {},
      threads: {},
      messages: {},
      failCaseStatus: true,
    };
    const res = await sendDeliveryAdOperationsMessage(makeMessagingSb(state), {
      actorUserId: "owner-1",
      actorRole: "owner",
      productKind: "store_sponsored",
      campaignId: campId,
      body: "will fail",
    });
    expect(res.ok).toBe(false);
    expect(Object.keys(state.messages)).toHaveLength(0);
  });
});

describe("CUT 3-C wiring / hard locks (source)", () => {
  it("messaging service never imports lifecycle transition writers", () => {
    const src = readFileSync(
      join(ROOT, "lib/stores/advertising/delivery-ad-operations-messaging.ts"),
      "utf8"
    );
    expect(src).not.toMatch(
      /owner_delivery_ad_transition|admin_delivery_ad_transition|transitionOwner|adminTransitionDeliveryAd/
    );
    expect(src).not.toMatch(/appendUserNotification|createNotificationEvent|notification_events/);
  });

  it("routes reject client kind/sender/audit fabrication; no UI", () => {
    const owner = readFileSync(
      join(
        ROOT,
        "app/api/me/stores/[storeId]/delivery-ads/[campaignId]/messages/route.ts"
      ),
      "utf8"
    );
    const admin = readFileSync(
      join(ROOT, "app/api/admin/delivery-ads/[campaignId]/messages/route.ts"),
      "utf8"
    );
    expect(owner).toContain("sendDeliveryAdOperationsMessage");
    expect(owner).toContain("listDeliveryAdOperationsMessages");
    expect(owner).toContain("source_audit_id");
    expect(admin).toContain("requireAdminApiUser");
    expect(owner).not.toMatch(/composer|chat bubble|unread|deeplink|notification/i);
  });

  it("status sole authority still updateDeliveryAdOperationsCaseStatus → apply RPC", () => {
    const svc = readFileSync(
      join(ROOT, "lib/stores/advertising/delivery-ad-operations-case-service.ts"),
      "utf8"
    );
    expect(svc).toContain("delivery_ad_ops_apply_case_status");
    expect(svc).toContain("export async function updateDeliveryAdOperationsCaseStatus");
  });

  it("3-B fan-out still writes system_lifecycle only", () => {
    const fan = readFileSync(
      join(ROOT, "lib/stores/advertising/delivery-ad-operations-lifecycle-fanout.ts"),
      "utf8"
    );
    expect(fan).toContain('kind: "system_lifecycle"');
    expect(fan).toContain("mapDeliveryAdOperationsMessageRow");
  });
});
