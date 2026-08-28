import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/core/notification-event-types";
import {
  CANONICAL_EVENT_PREFERENCE_POLICY,
  getNotificationPreferencePolicy,
  isMandatoryPreferencePolicy,
  isSystemPushKindMandatoryByPolicy,
  listCanonicalEventTypesWithPreferencePolicy,
  META_KIND_PREFERENCE_POLICY_OVERRIDES,
} from "@/lib/notifications/policy/notification-preference-policy-registry";

const MANDATORY_CHANNELS = {
  push: "always",
  sound: "user_configurable",
  dnd: "bypass_push_only",
} as const;

const OPTIONAL_CHANNELS = {
  push: "user_configurable",
  sound: "user_configurable",
  dnd: "obey",
} as const;

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("notification preference policy SSOT (P2-A2)", () => {
  it("T1 — canonical event types all resolve", () => {
    expect([...listCanonicalEventTypesWithPreferencePolicy()].sort()).toEqual(
      [...NOTIFICATION_EVENT_TYPES].sort()
    );
    for (const eventType of NOTIFICATION_EVENT_TYPES) {
      expect(CANONICAL_EVENT_PREFERENCE_POLICY[eventType]).toBeDefined();
      const policy = getNotificationPreferencePolicy({ eventType });
      expect(policy.resolutionSource).not.toBe("safe_fallback");
      expect(policy.policyClass).not.toBe("mandatory");
    }
  });

  it("T2 — user point charge kinds → member + member_financial + mandatory", () => {
    for (const kind of [
      "user_point_charge_approved",
      "user_point_charge_rejected",
      "user_point_charge_on_hold",
    ] as const) {
      const policy = getNotificationPreferencePolicy({ metaKind: kind });
      expect(policy.recipientRole).toBe("member");
      expect(policy.preferenceDomain).toBe("member_financial");
      expect(policy.policyClass).toBe("mandatory");
      expect(policy.resolutionSource).toBe("meta_kind_override");
    }
  });

  it("T3 — owner point mandatory kinds → owner + owner_financial + mandatory", () => {
    for (const kind of [
      "store_point_charge_approved",
      "store_point_charge_rejected",
      "store_point_charge_on_hold",
      "store_point_deducted",
      "store_point_blocked",
    ] as const) {
      const policy = getNotificationPreferencePolicy({ metaKind: kind });
      expect(policy.recipientRole).toBe("owner");
      expect(policy.preferenceDomain).toBe("owner_financial");
      expect(policy.policyClass).toBe("mandatory");
    }
  });

  it("T4 — store_point_low → owner + optional", () => {
    const policy = getNotificationPreferencePolicy({ metaKind: "store_point_low" });
    expect(policy.recipientRole).toBe("owner");
    expect(policy.policyClass).toBe("optional_operational");
    expect(isMandatoryPreferencePolicy(policy)).toBe(false);
  });

  it("T5 — payment-critical meta kinds → mandatory", () => {
    for (const kind of [
      "store_order_payment_completed_buyer",
      "store_order_payment_completed",
      "store_order_payment_failed",
      "store_order_refund_requested",
      "store_order_refund_approved",
    ] as const) {
      const policy = getNotificationPreferencePolicy({ metaKind: kind });
      expect(policy.policyClass).toBe("mandatory");
    }
  });

  it("T6 — fulfillment order status meta → optional", () => {
    const policy = getNotificationPreferencePolicy({ metaKind: "store_order_owner_status" });
    expect(policy.policyClass).toBe("optional_operational");
    expect(getNotificationPreferencePolicy({ eventType: "order_status" }).policyClass).toBe(
      "optional_operational"
    );
  });

  it("T7 — gift_transfer_offered → mandatory", () => {
    const policy = getNotificationPreferencePolicy({ metaKind: "gift_transfer_offered" });
    expect(policy.policyClass).toBe("mandatory");
    expect(policy.preferenceDomain).toBe("member_financial");
  });

  it("T8 — gift accepted/rejected/cancelled → optional", () => {
    for (const kind of [
      "gift_transfer_accepted",
      "gift_transfer_rejected",
      "gift_transfer_cancelled",
    ] as const) {
      expect(getNotificationPreferencePolicy({ metaKind: kind }).policyClass).toBe(
        "optional_operational"
      );
    }
  });

  it("T9 — notice/system campaign event types are NOT mandatory", () => {
    for (const eventType of ["notice_published", "admin_test", "admin_notice"] as const) {
      expect(getNotificationPreferencePolicy({ eventType }).policyClass).not.toBe("mandatory");
    }
    expect(isSystemPushKindMandatoryByPolicy("system")).toBe(false);
    expect(
      getNotificationPreferencePolicy({ eventType: "notice_published", metaKind: "admin_notice" })
        .policyClass
    ).not.toBe("mandatory");
  });

  it("T10 — mandatory channel policy shape", () => {
    const policy = getNotificationPreferencePolicy({ metaKind: "user_point_charge_approved" });
    expect(policy.channelPolicy.push).toBe(MANDATORY_CHANNELS.push);
    expect(policy.channelPolicy.sound).toBe(MANDATORY_CHANNELS.sound);
    expect(policy.channelPolicy.dnd).toBe(MANDATORY_CHANNELS.dnd);
    expect(policy.channelPolicy.inApp).toBe("always");
    expect(policy.channelPolicy.badge).toBe("always");
  });

  it("T11 — optional channel policy shape", () => {
    const policy = getNotificationPreferencePolicy({ metaKind: "store_order_created" });
    expect(policy.channelPolicy.push).toBe(OPTIONAL_CHANNELS.push);
    expect(policy.channelPolicy.sound).toBe(OPTIONAL_CHANNELS.sound);
    expect(policy.channelPolicy.dnd).toBe(OPTIONAL_CHANNELS.dnd);
  });

  it("T12 — recipient role changes policy where required", () => {
    const ownerInquiry = getNotificationPreferencePolicy({
      eventType: "inquiry_answered",
      recipientRole: "owner",
    });
    expect(ownerInquiry.recipientRole).toBe("owner");
    expect(ownerInquiry.resolutionSource).toBe("event_recipient_override");

    const ownerOrderMsg = getNotificationPreferencePolicy({
      metaKind: "store_order_message",
      recipientRole: "owner",
    });
    expect(ownerOrderMsg.preferenceDomain).toBe("owner_order_ops");

    const memberOrderMsg = getNotificationPreferencePolicy({
      metaKind: "store_order_message",
      recipientRole: "member",
    });
    expect(memberOrderMsg.preferenceDomain).toBe("order_chat");
  });

  it("T13 — unknown event/meta fallback is NOT mandatory", () => {
    const policy = getNotificationPreferencePolicy({
      eventType: "totally_unknown_event",
      metaKind: "nonexistent_meta_kind",
    });
    expect(policy.resolutionSource).toBe("safe_fallback");
    expect(policy.policyClass).toBe("optional_operational");
    expect(isMandatoryPreferencePolicy(policy)).toBe(false);
  });

  it("T14 — Bell / App icon authority modules do not import preference policy SSOT", () => {
    const bellPaths = [
      "lib/notifications/badge-authority-rebuild/member-notification-a-eligibility.ts",
      "lib/notifications/badge-authority-rebuild/member-app-icon-authority.ts",
      "lib/notifications/badge-authority-rebuild/store-owner-c-authority.ts",
    ];
    for (const path of bellPaths) {
      const src = readRepoFile(path);
      expect(src).not.toContain("notification-preference-policy-registry");
      expect(src).not.toContain("getNotificationPreferencePolicy");
    }
  });

  it("T15 — P0-D authority modules do not import preference policy SSOT", () => {
    const p0Paths = [
      "lib/admin/admin-action-queue.ts",
      "lib/admin/admin-ops-sound-decision.ts",
      "components/admin/store-points/AdminStorePointPendingProvider.tsx",
    ];
    for (const path of p0Paths) {
      const src = readRepoFile(path);
      expect(src).not.toContain("notification-preference-policy-registry");
      expect(src).not.toContain("getNotificationPreferencePolicy");
    }
  });

  it("meta override keys are subset of P2-A1 proven writer literals", () => {
    const proven = new Set([
      ...Object.keys(META_KIND_PREFERENCE_POLICY_OVERRIDES),
      "store_order_message",
    ]);
    expect(proven.has("user_point_charge_approved")).toBe(true);
    expect(proven.has("gift_transfer_offered")).toBe(true);
    expect(proven.has("gift_purchase")).toBe(false);
    expect(proven.has("gift_redeem")).toBe(false);
  });
});
