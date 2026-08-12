/**
 * Slice 2-1 — Classification & Identity foundation tests.
 * Does not import product Bell / App Icon / FCM / Native runtime modules.
 */
import { describe, expect, it } from "vitest";
import {
  assertAuthorityCanProjectToSurface,
  assertAuthorityIdentityCompatible,
} from "@/lib/notifications/badge-authority-rebuild/badge-authority-assertions";
import { SLICE_2_1_FOUNDATION_VERSION } from "@/lib/notifications/badge-authority-rebuild/badge-authority-types";
import {
  asUnreadMessageCount,
  asUnreadRoomCount,
  buildMemberAppIconProjectionInput,
} from "@/lib/notifications/badge-authority-rebuild/badge-count-units";
import { classifyBadgeAuthority } from "@/lib/notifications/badge-authority-rebuild/badge-event-classifier";
import {
  memberAndStoreKeysDifferForSameRawId,
  memberBadgeIdentity,
  parseBadgeRecipientIdentityKey,
  storeBadgeIdentity,
} from "@/lib/notifications/badge-authority-rebuild/badge-recipient-identity";
import { resolveBadgeProjectionEligibility } from "@/lib/notifications/badge-authority-rebuild/badge-surface-eligibility";

describe("Slice 2-1 classification & identity foundation", () => {
  it("locks foundation version", () => {
    expect(SLICE_2_1_FOUNDATION_VERSION).toBe("badge_authority_rebuild_slice2_1_v1");
  });

  describe("identity", () => {
    it("user:abc and store:abc differ", () => {
      expect(memberAndStoreKeysDifferForSameRawId("abc")).toBe(true);
      expect(memberBadgeIdentity("abc")).toEqual({
        ok: true,
        identity: { scope: "member", key: "user:abc", userId: "abc" },
      });
      expect(storeBadgeIdentity("abc")).toEqual({
        ok: true,
        identity: { scope: "store", key: "store:abc", storeId: "abc" },
      });
    });

    it("raw UUID is not an identity", () => {
      const uuid = "11111111-1111-4111-8111-111111111111";
      expect(parseBadgeRecipientIdentityKey(uuid)).toEqual({
        ok: false,
        reason: "RAW_UUID_IS_NOT_A_BADGE_IDENTITY",
      });
    });

    it("A_member + member identity allowed; store identity fails", () => {
      const member = memberBadgeIdentity("u1");
      expect(member.ok).toBe(true);
      if (!member.ok) return;
      expect(
        assertAuthorityIdentityCompatible("A_MEMBER_NOTIFICATION", member.identity)
      ).toEqual({ ok: true });
      const store = storeBadgeIdentity("s1");
      expect(store.ok).toBe(true);
      if (!store.ok) return;
      expect(
        assertAuthorityIdentityCompatible("A_MEMBER_NOTIFICATION", store.identity)
      ).toEqual({ ok: false, reason: "MEMBER_AUTHORITY_REQUIRES_MEMBER_IDENTITY" });
    });

    it("B_member + store fails; B_store/C_store + member fail", () => {
      const member = memberBadgeIdentity("u1");
      const store = storeBadgeIdentity("s1");
      expect(member.ok && store.ok).toBe(true);
      if (!member.ok || !store.ok) return;
      expect(
        assertAuthorityIdentityCompatible("B_MEMBER_COMMUNICATION", store.identity).ok
      ).toBe(false);
      expect(
        assertAuthorityIdentityCompatible("B_STORE_COMMUNICATION", member.identity)
      ).toEqual({ ok: false, reason: "STORE_AUTHORITY_REQUIRES_STORE_IDENTITY" });
      expect(
        assertAuthorityIdentityCompatible("C_STORE_OPERATION", member.identity)
      ).toEqual({ ok: false, reason: "STORE_AUTHORITY_REQUIRES_STORE_IDENTITY" });
    });

    it("multi-store identities are independent", () => {
      const a = storeBadgeIdentity("store-a");
      const b = storeBadgeIdentity("store-b");
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.identity.key).not.toBe(b.identity.key);
    });
  });

  describe("classification", () => {
    it("owner_intake is C_store when storeId present", () => {
      const r = classifyBadgeAuthority({
        kind: "owner_intake",
        metaKind: "store_order_created",
        attentionKey: "order_status:owner_intake:ord-1",
        storeId: "store-9",
        userId: "owner-user",
      });
      expect(r.classification).toBe("C_STORE_OPERATION");
      expect(r.identity).toEqual({
        scope: "store",
        key: "store:store-9",
        storeId: "store-9",
      });
      expect(r.documentedRewriteTarget).toBe("notifyStoreOwnerNewOrder_user_id_writer");
    });

    it("owner_intake without storeId does not fallback to member", () => {
      const r = classifyBadgeAuthority({
        attentionKey: "order_status:owner_intake:ord-1",
        metaKind: "store_order_created",
        userId: "owner-user",
      });
      expect(r.classification).toBe("UNKNOWN_BLOCKED");
      expect(r.identity).toBeNull();
      expect(r.identityError).toEqual({
        ok: false,
        reason: "STORE_ID_REQUIRED_FOR_OWNER_INTAKE",
      });
    });

    it("customer→owner message is B_store; store→customer is B_member", () => {
      expect(
        classifyBadgeAuthority({
          kind: "customer_to_store_message",
          chatDomain: "store_order",
          storeId: "s1",
          userId: "buyer",
        }).classification
      ).toBe("B_STORE_COMMUNICATION");
      expect(
        classifyBadgeAuthority({
          kind: "store_to_customer_message",
          chatDomain: "store_order",
          userId: "buyer",
          storeId: "s1",
          recipientRole: "buyer",
        }).classification
      ).toBe("B_MEMBER_COMMUNICATION");
    });

    it("trade status A; trade message B_member; order status A; GD/Group B_member", () => {
      expect(
        classifyBadgeAuthority({ kind: "trade_status", userId: "u1" }).classification
      ).toBe("A_MEMBER_NOTIFICATION");
      expect(
        classifyBadgeAuthority({ kind: "trade_message", userId: "u1" }).classification
      ).toBe("B_MEMBER_COMMUNICATION");
      expect(
        classifyBadgeAuthority({ kind: "customer_order_status", userId: "u1" })
          .classification
      ).toBe("A_MEMBER_NOTIFICATION");
      expect(
        classifyBadgeAuthority({ kind: "general_message", userId: "u1" }).classification
      ).toBe("B_MEMBER_COMMUNICATION");
      expect(
        classifyBadgeAuthority({ kind: "group_message", userId: "u1" }).classification
      ).toBe("B_MEMBER_COMMUNICATION");
      expect(
        classifyBadgeAuthority({ kind: "community_activity", userId: "u1" }).classification
      ).toBe("A_MEMBER_NOTIFICATION");
    });

    it("marketing no badge; persistent notice A; unknown blocked; missed is B", () => {
      expect(
        classifyBadgeAuthority({ kind: "marketing_ephemeral", userId: "u1" })
          .classification
      ).toBe("EPHEMERAL_NO_BADGE");
      expect(
        classifyBadgeAuthority({
          kind: "service_notice",
          userId: "u1",
          persistsInInbox: true,
        }).classification
      ).toBe("A_MEMBER_NOTIFICATION");
      expect(
        classifyBadgeAuthority({ kind: "totally_unknown_xyz", userId: "u1" })
          .classification
      ).toBe("UNKNOWN_BLOCKED");
      expect(
        classifyBadgeAuthority({
          kind: "missed_call",
          userId: "u1",
          callOutcome: "missed",
        }).classification
      ).toBe("B_MEMBER_COMMUNICATION");
    });
  });

  describe("surface eligibility", () => {
    it("A allows Bell; B_member forbids Bell; C_store allows Bell/App Icon; B_store forbids App Icon", () => {
      expect(assertAuthorityCanProjectToSurface("A_MEMBER_NOTIFICATION", "MEMBER_BELL")).toEqual({
        ok: true,
      });
      expect(
        assertAuthorityCanProjectToSurface("B_MEMBER_COMMUNICATION", "MEMBER_BELL")
      ).toEqual({ ok: false, reason: "B_MEMBER_CANNOT_PROJECT_TO_MEMBER_BELL" });
      expect(
        assertAuthorityCanProjectToSurface("B_STORE_COMMUNICATION", "MEMBER_APP_ICON")
      ).toEqual({ ok: false, reason: "B_STORE_CANNOT_PROJECT_TO_MEMBER_APP_ICON" });
      // Product Bible: O → O_bell + App Icon
      expect(
        assertAuthorityCanProjectToSurface("C_STORE_OPERATION", "MEMBER_APP_ICON")
      ).toEqual({ ok: true });
      expect(
        assertAuthorityCanProjectToSurface("C_STORE_OPERATION", "MEMBER_BELL")
      ).toEqual({ ok: true });
      expect(
        assertAuthorityCanProjectToSurface("B_MEMBER_COMMUNICATION", "MEMBER_APP_ICON")
      ).toEqual({ ok: true });
      expect(
        resolveBadgeProjectionEligibility("B_STORE_COMMUNICATION").has("OWNER_CHAT_SURFACE")
      ).toBe(true);
      expect(
        resolveBadgeProjectionEligibility("C_STORE_OPERATION").has("OWNER_OPERATION_BADGE")
      ).toBe(true);
    });
  });

  describe("count units", () => {
    it("separates 20 messages from 1 room; Member App Icon rejects B_store rooms, allows O", () => {
      expect(asUnreadMessageCount(20)).toBe(20);
      expect(asUnreadRoomCount(1)).toBe(1);
      const ok = buildMemberAppIconProjectionInput({
        memberUnreadNotificationCount: 2,
        memberUnreadRoomCount: 1,
        memberUnresolvedMissedCallCount: 0,
      });
      expect(ok).toMatchObject({ ok: true, memberAppIconTotal: 3 });
      expect(
        buildMemberAppIconProjectionInput({
          memberUnreadNotificationCount: 0,
          memberUnreadRoomCount: 0,
          memberUnresolvedMissedCallCount: 0,
          storeUnreadRoomCount: 4,
        })
      ).toEqual({ ok: false, reason: "B_STORE_FORBIDDEN_IN_MEMBER_APP_ICON_INPUT" });
      expect(
        buildMemberAppIconProjectionInput({
          memberUnreadNotificationCount: 0,
          memberUnreadRoomCount: 0,
          memberUnresolvedMissedCallCount: 0,
          storeActionRequiredCount: 1,
        })
      ).toMatchObject({ ok: true, memberAppIconTotal: 1 });
    });
  });
});
