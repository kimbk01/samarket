/**
 * PRODUCT CUT 3-D — Notification + Action Queue + deeplink contracts.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDeliveryAdHumanOwnerDedupeKey,
  buildDeliveryAdLifecycleOwnerDedupeKey,
  mapDeliveryAdHumanOwnerNotification,
  mapDeliveryAdLifecycleOwnerNotification,
  resolveDeliveryAdOpsAdminDestination,
  tryResolveDeliveryAdOpsOwnerDestinationFromMeta,
} from "@/lib/stores/advertising/delivery-ad-operations-notification-map";
import {
  DELIVERY_AD_ADMIN_ROUTES,
  DELIVERY_AD_OWNER_ROUTES,
} from "@/lib/stores/advertising/delivery-ad-routes";
import {
  deliveryAdAdminQueueFundingAllowsIntake,
  listDeliveryAdAdminActionQueue,
} from "@/lib/stores/advertising/delivery-ad-operations-action-queue";
import { DELIVERY_AD_CANONICAL_BC_FUNDINGS_TABLE } from "@/lib/stores/advertising/canonical-business-cash-contract";
import { resolveNotificationDestination } from "@/lib/notifications/resolve-notification-destination";
import { notificationMessages } from "@/lib/i18n/catalog/notifications";
import {
  safeNotifyDeliveryAdHumanOwner,
  safeNotifyDeliveryAdLifecycleOwner,
} from "@/lib/stores/advertising/delivery-ad-operations-notification";

const ROOT = process.cwd();

vi.mock("@/lib/notifications/append-user-notification", () => ({
  appendUserNotification: vi.fn(async () => true),
}));
vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: vi.fn(async () => "ko"),
}));

/** Minimal chainable Supabase mock for Action Queue + Stage 1 funding batch loader. */
function createActionQueueSb(input: {
  cases: Array<Record<string, unknown>>;
  campaigns: Record<string, Record<string, unknown>>;
  threads: Record<string, { id: string }>;
  /** application_id → SECURED/other */
  canonicalFundingByApplicationId?: Record<string, string>;
  /** campaign_id → legacy spend status */
  legacySpendByCampaignId?: Record<string, string>;
}) {
  const canonical = input.canonicalFundingByApplicationId ?? {};
  const legacy = input.legacySpendByCampaignId ?? {};

  return {
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        inIds: string[] | null;
        head?: boolean;
      } = { filters: {}, inIds: null };
      const api: Record<string, unknown> = {};
      const self = () => api;

      api.select = (_cols?: string, opts?: { head?: boolean; count?: string }) => {
        state.head = Boolean(opts?.head);
        return self();
      };
      api.eq = (col: string, val: unknown) => {
        state.filters[col] = val;
        if (state.head && table === "delivery_ad_operations_cases") {
          const status = state.filters.status;
          const count = status === "WAITING_ADMIN" ? input.cases.length : 0;
          return Promise.resolve({ count, error: null });
        }
        return self();
      };
      api.in = (col: string, vals: unknown[]) => {
        state.inIds = (vals ?? []).map((v) => String(v));
        state.filters[`in:${col}`] = state.inIds;
        return self();
      };
      api.order = () => self();
      api.limit = async () => {
        if (table === "delivery_ad_operations_cases") {
          expect(state.filters.status).toBe("WAITING_ADMIN");
          return { data: input.cases, error: null };
        }
        return { data: [], error: null };
      };
      // Batch funding loaders await the builder after .in() (thenable).
      api.then = (resolve: (v: unknown) => unknown) => {
        if (table === DELIVERY_AD_CANONICAL_BC_FUNDINGS_TABLE) {
          const ids = state.inIds ?? [];
          const data = ids
            .filter((id) => canonical[id])
            .map((id) => ({ application_id: id, status: canonical[id] }));
          return Promise.resolve(resolve({ data, error: null }));
        }
        if (table === "delivery_ad_store_cash_spends") {
          const ids = state.inIds ?? [];
          const data = ids
            .filter((id) => legacy[id])
            .map((id) => ({ campaign_id: id, status: legacy[id] }));
          return Promise.resolve(resolve({ data, error: null }));
        }
        return Promise.resolve(resolve({ data: [], error: null }));
      };
      api.maybeSingle = async () => {
        if (table === "store_paid_ad_campaigns" || table === "store_banner_ad_campaigns") {
          const id = String(state.filters.id ?? "");
          return { data: input.campaigns[id] ?? null, error: null };
        }
        if (table === "delivery_ad_operations_threads") {
          const caseId = String(state.filters.case_id ?? "");
          return { data: input.threads[caseId] ?? null, error: null };
        }
        return { data: null, error: null };
      };
      return api;
    },
  } as never;
}

describe("CUT 3-D notification mapper", () => {
  it("maps adverse/review lifecycle events to Owner notify; skips submit/owner-pause", () => {
    const changes = mapDeliveryAdLifecycleOwnerNotification({
      eventType: "CHANGES_REQUESTED",
      auditId: "a1",
      campaignId: "c1",
      productKind: "store_sponsored",
    });
    expect(changes.notify).toBe(true);
    if (!changes.notify) return;
    expect(changes.dedupeKey).toBe(buildDeliveryAdLifecycleOwnerDedupeKey("a1"));
    expect(changes.linkUrl).toBe(DELIVERY_AD_OWNER_ROUTES.detail("c1"));
    expect(changes.recipientRole).toBe("owner");

    expect(
      mapDeliveryAdLifecycleOwnerNotification({
        eventType: "SUBMITTED",
        auditId: "a2",
        campaignId: "c1",
        productKind: "banner",
      }).notify
    ).toBe(false);

    expect(
      mapDeliveryAdLifecycleOwnerNotification({
        eventType: "PAUSED_OWNER",
        auditId: "a3",
        campaignId: "c1",
        productKind: "banner",
      }).notify
    ).toBe(false);
  });

  it("banner lifecycle maps same Owner destination pattern", () => {
    const rejected = mapDeliveryAdLifecycleOwnerNotification({
      eventType: "REJECTED",
      auditId: "audit-b",
      campaignId: "banner-1",
      productKind: "banner",
    });
    expect(rejected.notify).toBe(true);
    if (!rejected.notify) return;
    expect(rejected.linkUrl).toBe("/stores/owner/ads/banner-1");
    expect(rejected.dedupeKey).toBe("delivery-ad:lifecycle:audit-b:owner");
  });

  it("Admin human → Owner notify; Owner human → no Owner notify", () => {
    const adminMsg = mapDeliveryAdHumanOwnerNotification({
      messageId: "m1",
      senderRole: "admin",
      campaignId: "c1",
      productKind: "banner",
    });
    expect(adminMsg.notify).toBe(true);
    if (!adminMsg.notify) return;
    expect(adminMsg.dedupeKey).toBe(buildDeliveryAdHumanOwnerDedupeKey("m1"));

    expect(
      mapDeliveryAdHumanOwnerNotification({
        messageId: "m2",
        senderRole: "owner",
        campaignId: "c1",
        productKind: "store_sponsored",
      }).notify
    ).toBe(false);
  });

  it("i18n keys exist for mapped notify MessageKeys", () => {
    const keys = [
      "notify_delivery_ad_changes_requested_title",
      "notify_delivery_ad_approved_title",
      "notify_delivery_ad_rejected_title",
      "notify_delivery_ad_paused_admin_title",
      "notify_delivery_ad_resumed_title",
      "notify_delivery_ad_ended_title",
      "notify_delivery_ad_terminated_title",
      "notify_delivery_ad_admin_message_title",
    ] as const;
    for (const k of keys) {
      expect(notificationMessages.ko[k]).toBeTruthy();
      expect(notificationMessages.en[k]).toBeTruthy();
    }
  });

  it("deeplink routes exist in repo; Admin destination helper", () => {
    expect(existsSync(join(ROOT, "app/(main)/stores/owner/ads/[campaignId]/page.tsx"))).toBe(
      true
    );
    expect(existsSync(join(ROOT, "app/admin/delivery-ads/[campaignId]/page.tsx"))).toBe(true);
    expect(resolveDeliveryAdOpsAdminDestination("x")).toBe(DELIVERY_AD_ADMIN_ROUTES.detail("x"));
    expect(
      tryResolveDeliveryAdOpsOwnerDestinationFromMeta({
        kind: "delivery_ad_changes_requested",
        campaign_id: "camp-9",
        product_kind: "store_sponsored",
      })
    ).toBe(DELIVERY_AD_OWNER_ROUTES.detail("camp-9"));
  });

  it("resolve-notification-destination heals Delivery Ads Owner meta", () => {
    const dest = resolveNotificationDestination({
      inboxRow: {
        notification_type: "commerce",
        link_url: null,
        meta: {
          kind: "delivery_ad_admin_message",
          campaign_id: "heal-1",
          product_kind: "banner",
        },
      },
    });
    expect(dest.href).toBe("/stores/owner/ads/heal-1");
    expect(dest.kind).toBe("canonical");
  });
});

describe("CUT 3-D safe notify failure isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notification writer failure does not throw (no lifecycle/message rollback)", async () => {
    const { appendUserNotification } = await import(
      "@/lib/notifications/append-user-notification"
    );
    vi.mocked(appendUserNotification).mockRejectedValueOnce(new Error("forced_fail"));

    await expect(
      safeNotifyDeliveryAdLifecycleOwner({} as never, {
        ownerUserId: "owner-1",
        productKind: "store_sponsored",
        campaignId: "c1",
        auditId: "audit-fail",
        eventType: "CHANGES_REQUESTED",
      })
    ).resolves.toBeUndefined();

    vi.mocked(appendUserNotification).mockRejectedValueOnce(new Error("forced_fail_msg"));
    await expect(
      safeNotifyDeliveryAdHumanOwner({} as never, {
        ownerUserId: "owner-1",
        productKind: "banner",
        campaignId: "c1",
        messageId: "m-fail",
        senderRole: "admin",
      })
    ).resolves.toBeUndefined();
  });
});

describe("CUT 3-D Action Queue", () => {
  it("funding intake gate matches go-live funding authority", () => {
    expect(
      deliveryAdAdminQueueFundingAllowsIntake({
        campaignSource: "OWNER_PAID",
        fundingStatus: "FUNDED",
      })
    ).toBe(true);
    expect(
      deliveryAdAdminQueueFundingAllowsIntake({
        campaignSource: "OWNER_PAID",
        fundingStatus: "UNFUNDED",
      })
    ).toBe(false);
    expect(
      deliveryAdAdminQueueFundingAllowsIntake({
        campaignSource: "DIBAY_FIRST_PARTY",
        fundingStatus: "UNFUNDED",
      })
    ).toBe(true);
  });

  it("WAITING_ADMIN listed; WAITING_OWNER/RESOLVED not queried into queue", async () => {
    const waitAdmin = {
      id: "case-wait-admin",
      product_kind: "store_sponsored",
      store_sponsored_campaign_id: "camp-1",
      banner_campaign_id: null,
      owner_user_id: "o1",
      status: "WAITING_ADMIN",
      updated_at: "2026-08-30T12:00:00.000Z",
    };

    const sb = createActionQueueSb({
      cases: [waitAdmin],
      campaigns: {
        "camp-1": {
          id: "camp-1",
          title: "T",
          lifecycle_status: "SUBMITTED",
          campaign_source: "OWNER_PAID",
          store_id: "store-1",
          review_notes: null,
          image_url: null,
        },
      },
      threads: { "case-wait-admin": { id: "th1" } },
      canonicalFundingByApplicationId: { "camp-1": "SECURED" },
    });

    const res = await listDeliveryAdAdminActionQueue(sb, {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.caseId).toBe("case-wait-admin");
    expect(res.items[0]?.caseStatus).toBe("WAITING_ADMIN");
    expect(res.items[0]?.destination).toBe(DELIVERY_AD_ADMIN_ROUTES.detail("camp-1"));
    expect(res.total).toBe(1);
  });

  it("unfunded Owner-paid WAITING_ADMIN is excluded from funded review intake", async () => {
    const waitAdmin = {
      id: "case-unfunded",
      product_kind: "store_sponsored",
      store_sponsored_campaign_id: "camp-unfunded",
      banner_campaign_id: null,
      owner_user_id: "o1",
      status: "WAITING_ADMIN",
      updated_at: "2026-08-30T12:00:00.000Z",
    };

    const sb = createActionQueueSb({
      cases: [waitAdmin],
      campaigns: {
        "camp-unfunded": {
          id: "camp-unfunded",
          title: "U",
          lifecycle_status: "SUBMITTED",
          campaign_source: "OWNER_PAID",
          store_id: "store-1",
          review_notes: null,
          image_url: null,
        },
      },
      threads: { "case-unfunded": { id: "th-u" } },
      canonicalFundingByApplicationId: {},
    });

    const res = await listDeliveryAdAdminActionQueue(sb, {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items).toHaveLength(0);
    expect(res.total).toBe(0);
  });
});

describe("CUT 3-D wiring hard locks", () => {
  it("fan-out and messaging call safe notify; no UI/unread schema", () => {
    const fan = readFileSync(
      join(ROOT, "lib/stores/advertising/delivery-ad-operations-lifecycle-fanout.ts"),
      "utf8"
    );
    const msg = readFileSync(
      join(ROOT, "lib/stores/advertising/delivery-ad-operations-messaging.ts"),
      "utf8"
    );
    expect(fan).toContain("safeNotifyDeliveryAdLifecycleOwner");
    expect(msg).toContain("safeNotifyDeliveryAdHumanOwner");
    expect(msg).not.toMatch(/last_read_at|unread_count|composer/);
    expect(fan).not.toMatch(/last_read_at|unread_count/);
  });

  it("Admin Action Queue route is Admin-auth only; Admin SSOT includes delivery_ad_ops", () => {
    const route = readFileSync(
      join(ROOT, "app/api/admin/delivery-ads/action-queue/route.ts"),
      "utf8"
    );
    const aq = readFileSync(join(ROOT, "lib/admin/admin-action-queue.ts"), "utf8");
    expect(route).toContain("requireAdminApiUser");
    expect(route).toContain("listDeliveryAdAdminActionQueue");
    expect(aq).toContain("delivery_ad_ops");
    expect(aq).toContain("WAITING_ADMIN");
  });

  it("notification uses appendUserNotification; no new notification/queue table migration", () => {
    const notif = readFileSync(
      join(ROOT, "lib/stores/advertising/delivery-ad-operations-notification.ts"),
      "utf8"
    );
    expect(notif).toContain("appendUserNotification");
    expect(notif).not.toMatch(/delivery_ad_notifications/);
    const migNames = readdirSync(join(ROOT, "supabase/migrations")).filter(
      (n) =>
        n.includes("cut3d") ||
        n.includes("delivery_ad_notif") ||
        n.includes("delivery_ad_action_queue")
    );
    expect(migNames).toEqual([]);
  });

  it("no timeline/composer/queue UI pages added for 3-D", () => {
    expect(existsSync(join(ROOT, "app/admin/delivery-ads/action-queue/page.tsx"))).toBe(false);
  });
});
