/**
 * PRODUCT CUT 3-F — Security / idempotency / authority contracts (static + unit).
 * No Production mutation. Unapplied Production migrations reported separately.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildDeliveryAdHumanOwnerDedupeKey,
  buildDeliveryAdLifecycleOwnerDedupeKey,
  isOwnerOpsUnreadLifecycleEvent,
} from "@/lib/stores/advertising/delivery-ad-operations-notification-map";
import {
  isDeliveryAdOpsUnreadMessageForRole,
  markDeliveryAdOperationsRead,
} from "@/lib/stores/advertising/delivery-ad-operations-unread";
import type { DeliveryAdOperationsTimelineMessage } from "@/lib/stores/advertising/delivery-ad-operations-message";
import { DELIVERY_AD_OWNER_ROUTES, DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const MIG_3A = "supabase/migrations/20261201200000_delivery_ads_cut3a_operations_case.sql";
const MIG_PRE3B = "supabase/migrations/20261201210000_delivery_ads_pre3b_owner_transition_durable.sql";
const MIG_3B = "supabase/migrations/20261201220000_delivery_ads_cut3b_operations_timeline.sql";
const MIG_3C = "supabase/migrations/20261201230000_delivery_ads_cut3c_operations_messaging.sql";
const MIG_3E = "supabase/migrations/20261201240000_delivery_ads_cut3e_operations_thread_reads.sql";

describe("CUT 3-F authority snapshot", () => {
  it("canonical tables/services/UI wiring match disk", () => {
    expect(existsSync(join(ROOT, MIG_3A))).toBe(true);
    expect(existsSync(join(ROOT, MIG_3B))).toBe(true);
    expect(existsSync(join(ROOT, MIG_3C))).toBe(true);
    expect(existsSync(join(ROOT, MIG_3E))).toBe(true);
    expect(read("lib/stores/advertising/delivery-ad-operations-case-service.ts")).toContain(
      "ensureDeliveryAdOperationsCase"
    );
    expect(read("lib/stores/advertising/delivery-ad-operations-case-service.ts")).toContain(
      "updateDeliveryAdOperationsCaseStatus"
    );
    expect(read("lib/stores/advertising/delivery-ad-operations-lifecycle-fanout.ts")).toContain(
      "fanOutDeliveryAdLifecycleAudit"
    );
    expect(read("lib/stores/advertising/delivery-ad-operations-messaging.ts")).toContain(
      "sendDeliveryAdOperationsMessage"
    );
    expect(read("lib/stores/advertising/delivery-ad-operations-unread.ts")).toContain(
      "markDeliveryAdOperationsRead"
    );
    expect(read("lib/stores/advertising/delivery-ad-operations-action-queue.ts")).toContain(
      "listDeliveryAdAdminActionQueue"
    );
    expect(read("components/business/owner/ads/OwnerDeliveryAdDetailView.tsx")).toContain(
      "DeliveryAdOperationsPanel"
    );
    expect(read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx")).toContain(
      "DeliveryAdOperationsPanel"
    );
    expect(DELIVERY_AD_OWNER_ROUTES.detail("x")).toBe("/stores/owner/ads/x");
    expect(DELIVERY_AD_ADMIN_ROUTES.detail("x")).toBe("/admin/delivery-ads/x");
  });
});

describe("CUT 3-F RPC grants + SECURITY DEFINER", () => {
  it("owner/admin transition + send + case status: anon/auth EXECUTE revoked; service_role only", () => {
    for (const [path, fn] of [
      [MIG_PRE3B, "owner_delivery_ad_transition"],
      [MIG_3B, "admin_delivery_ad_transition"],
      [MIG_3C, "send_delivery_ad_operations_message"],
      [MIG_3C, "delivery_ad_ops_apply_case_status"],
    ] as const) {
      const sql = read(path);
      expect(sql).toContain(`FUNCTION public.${fn}`);
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}[\\s\\S]*FROM anon, authenticated`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}[\\s\\S]*TO service_role`));
      expect(sql).toContain("SECURITY DEFINER");
      expect(sql).toContain("SET search_path = public");
    }
  });

  it("no read-cursor RPC (TS service + table only)", () => {
    const mig3e = read(MIG_3E);
    expect(mig3e).not.toMatch(/CREATE OR REPLACE FUNCTION/);
    expect(mig3e).toContain("delivery_ad_operations_thread_reads");
  });
});

describe("CUT 3-F table RLS / append-only / cardinality", () => {
  it("cases/threads/messages: authenticated SELECT RLS; no INSERT/UPDATE/DELETE policies", () => {
    const a = read(MIG_3A);
    const b = read(MIG_3B);
    expect(a).toContain("ENABLE ROW LEVEL SECURITY");
    expect(a).toContain("delivery_ad_ops_cases_owner_select");
    expect(a).toContain("owner_user_id = auth.uid()");
    expect(a).toContain("is_platform_admin(auth.uid())");
    expect(a).toContain("delivery_ad_ops_cases_sponsored_campaign_uidx");
    expect(a).toContain("delivery_ad_ops_cases_banner_campaign_uidx");
    expect(a).toContain("case_id uuid NOT NULL UNIQUE");
    expect(b).toContain("ENABLE ROW LEVEL SECURITY");
    expect(b).toContain("UNIQUE (source_audit_id)");
    expect(b).toContain("No authenticated INSERT/UPDATE/DELETE");
    // No RLS write policies for authenticated (SELECT policies only)
    expect(b).toContain("delivery_ad_ops_messages_owner_select");
    expect(b).toContain("delivery_ad_ops_messages_admin_select");
    const policyBlocks = [...b.matchAll(/CREATE POLICY[\s\S]*?(?=CREATE POLICY|CREATE OR REPLACE|-- ──|COMMIT;)/g)].map(
      (m) => m[0]
    );
    expect(policyBlocks.length).toBeGreaterThanOrEqual(2);
    for (const block of policyBlocks) {
      expect(block).toMatch(/FOR SELECT/);
      expect(block).not.toMatch(/FOR INSERT|FOR UPDATE|FOR DELETE/);
    }
  });

  it("human CHECK: source_audit_id NULL; system requires audit FK", () => {
    const c = read(MIG_3C);
    expect(c).toMatch(/kind = 'human'[\s\S]*source_audit_id IS NULL/);
    expect(c).toMatch(/kind = 'system_lifecycle'[\s\S]*source_audit_id IS NOT NULL/);
  });

  it("message+case same transaction via RAISE on status failure", () => {
    const c = read(MIG_3C);
    expect(c).toContain("INSERT INTO public.delivery_ad_operations_messages");
    expect(c).toContain("delivery_ad_ops_apply_case_status");
    expect(c).toContain("RAISE EXCEPTION 'case_status_failed");
  });

  it("unread table sole persisted authority; no parallel unread_count column", () => {
    const e = read(MIG_3E);
    expect(e).toContain("UNIQUE (thread_id, reader_role)");
    expect(e).toContain("ENABLE ROW LEVEL SECURITY");
    expect(e).toContain("REVOKE ALL ON TABLE public.delivery_ad_operations_thread_reads FROM anon, authenticated");
    expect(e).not.toMatch(/\bunread_count\b/);
    const adsLib = readdirSync(join(ROOT, "lib/stores/advertising"))
      .filter((n) => n.includes("operations"))
      .map((n) => read(`lib/stores/advertising/${n}`))
      .join("\n");
    expect(adsLib).not.toMatch(/owner_unread_count|admin_unread_count|case\.unread_count|thread\.unread_count/);
  });
});

describe("CUT 3-F API auth contracts", () => {
  it("Owner messages + mark-read: session + store owner gate; reject sender fabrication", () => {
    const msg = read(
      "app/api/me/stores/[storeId]/delivery-ads/[campaignId]/messages/route.ts"
    );
    const readRt = read(
      "app/api/me/stores/[storeId]/delivery-ads/[campaignId]/messages/read/route.ts"
    );
    expect(msg).toContain("getStoreIfOwner");
    expect(msg).toContain("validateActiveSession");
    expect(msg).toContain("source_audit_id");
    expect(msg).toContain('actorRole: "owner"');
    expect(readRt).toContain("getStoreIfOwner");
    expect(readRt).toContain('actorRole: "owner"');
    expect(readRt).not.toMatch(/reader_role|readerRole/);
  });

  it("Admin messages + mark-read + action-queue: requireAdminApiUser only", () => {
    const msg = read("app/api/admin/delivery-ads/[campaignId]/messages/route.ts");
    const readRt = read("app/api/admin/delivery-ads/[campaignId]/messages/read/route.ts");
    const aq = read("app/api/admin/delivery-ads/action-queue/route.ts");
    expect(msg).toContain("requireAdminApiUser");
    expect(readRt).toContain("requireAdminApiUser");
    expect(aq).toContain("requireAdminApiUser");
    expect(aq).toContain("listDeliveryAdAdminActionQueue");
  });

  it("UI send does not call notification writer; fanout is server-side only", () => {
    const panel = read("components/stores/advertising/DeliveryAdOperationsPanel.tsx");
    expect(panel).not.toMatch(/appendUserNotification|safeNotifyDeliveryAd|createAndDispatchNotificationEvent/);
    const messaging = read("lib/stores/advertising/delivery-ad-operations-messaging.ts");
    expect(messaging).toContain("safeNotifyDeliveryAdHumanOwner");
    expect(messaging).not.toMatch(/transitionOwner|transitionAdmin|owner_delivery_ad_transition/);
  });
});

describe("CUT 3-F notification dedupe + unread policy", () => {
  it("dedupe keys include audit_id / message.id", () => {
    expect(buildDeliveryAdLifecycleOwnerDedupeKey("audit-1")).toBe(
      "delivery-ad:lifecycle:audit-1:owner"
    );
    expect(buildDeliveryAdHumanOwnerDedupeKey("msg-1")).toBe("delivery-ad:message:msg-1:owner");
  });

  it("Owner unread uses OWNER_LIFECYCLE_NOTIFY SSOT; Admin unread human-owner only", () => {
    expect(isOwnerOpsUnreadLifecycleEvent("CHANGES_REQUESTED")).toBe(true);
    expect(isOwnerOpsUnreadLifecycleEvent("SUBMITTED")).toBe(false);
    const adminHuman: DeliveryAdOperationsTimelineMessage = {
      id: "1",
      threadId: "t",
      kind: "human",
      senderRole: "admin",
      senderUserId: "a",
      sourceAuditId: null,
      eventType: null,
      messageKey: null,
      body: "x",
      occurredAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const ownerHuman = { ...adminHuman, id: "2", senderRole: "owner" as const };
    expect(isDeliveryAdOpsUnreadMessageForRole(adminHuman, "owner")).toBe(true);
    expect(isDeliveryAdOpsUnreadMessageForRole(ownerHuman, "owner")).toBe(false);
    expect(isDeliveryAdOpsUnreadMessageForRole(ownerHuman, "admin")).toBe(true);
    expect(isDeliveryAdOpsUnreadMessageForRole(adminHuman, "admin")).toBe(false);
  });
});

describe("CUT 3-F Action Queue ≠ unread", () => {
  it("Action Queue filters WAITING_ADMIN only; unread uses thread_reads", () => {
    const aq = read("lib/stores/advertising/delivery-ad-operations-action-queue.ts");
    const unread = read("lib/stores/advertising/delivery-ad-operations-unread.ts");
    expect(aq).toContain('eq("status", "WAITING_ADMIN")');
    expect(aq).not.toContain("thread_reads");
    expect(unread).toContain("delivery_ad_operations_thread_reads");
    expect(unread).not.toContain("WAITING_ADMIN");
  });
});

describe("CUT 3-F mark-read server derives role (no client role select)", () => {
  it("Owner mark-read route hardcodes actorRole owner", () => {
    const readRt = read(
      "app/api/me/stores/[storeId]/delivery-ads/[campaignId]/messages/read/route.ts"
    );
    expect(readRt).toContain('actorRole: "owner"');
    expect(readRt).not.toMatch(/body\.reader|body\.role|actorRole:\s*body/);
  });
});

describe("CUT 3-F no Business Cash / billing / CUT4 in 3-F scope files", () => {
  it("operations UI/unread sources do not introduce billing", () => {
    const panel = read("components/stores/advertising/DeliveryAdOperationsPanel.tsx");
    expect(panel).not.toMatch(/business.?cash|billing|wallet/i);
  });
});

// silence unused import if monotonic test removed
void markDeliveryAdOperationsRead;
