/**
 * Slice 2-5 — C_store Authority Contract tests (pure).
 * Does not import product Hub / Bell / App Icon / FCM / Native / DB runtime.
 */
import { describe, expect, it } from "vitest";
import { assertAuthorityIdentityCompatible } from "@/lib/notifications/badge-authority-rebuild/badge-authority-assertions";
import {
  memberBadgeIdentity,
  storeBadgeIdentity,
} from "@/lib/notifications/badge-authority-rebuild/badge-recipient-identity";
import {
  C_STORE_ACTION_SSOT,
  C_STORE_AUTHORITY_CONTRACT_VERSION,
  C_STORE_ONE_LINER,
  assertCStoreIdentity,
  assertCStoreSurfaceForbidden,
  buildCStoreActionId,
  cStoreAllowsSurface,
  cStoreHubFormulaCandidate,
  cancelRequestedRequiresStoreAction,
  classifyStoreOperationEvent,
  createCStoreActionLedger,
  forbidMaxAsCStoreAuthority,
  isForbiddenCStoreDecrease,
  notificationReadClearsCStore,
  ownerIntakeNotificationIsCTruth,
  ownerPresentationTotal,
  rejectUserIdentityForCStore,
  screenOpenClearsCStore,
} from "@/lib/notifications/badge-authority-rebuild/c-store-authority-contract";

describe("Slice 2-5 C_store Authority Contract", () => {
  it("locks contract version and one-liner", () => {
    expect(C_STORE_AUTHORITY_CONTRACT_VERSION).toBe(
      "badge_authority_rebuild_slice2_5_c_store_contract_v1"
    );
    expect(C_STORE_ONE_LINER).toContain("unfinished store work");
  });

  describe("event classification", () => {
    it("NEW_ORDER_PENDING is C_store CONFIRMED", () => {
      const r = classifyStoreOperationEvent("NEW_ORDER_PENDING");
      expect(r.authority).toBe("C_store");
      expect(r.status).toBe("CONFIRMED");
    });

    it("REFUND_REQUESTED is C_store CONFIRMED", () => {
      const r = classifyStoreOperationEvent("REFUND_REQUESTED");
      expect(r.authority).toBe("C_store");
      expect(r.status).toBe("CONFIRMED");
    });

    it("CANCEL_REQUESTED is C_store GAP_ADD", () => {
      const r = classifyStoreOperationEvent("CANCEL_REQUESTED");
      expect(r.authority).toBe("C_store");
      expect(r.status).toBe("GAP_ADD");
    });

    it("OPEN_STORE_INQUIRY is C_store CONFIRMED (ticket status, not chat unread)", () => {
      const r = classifyStoreOperationEvent("OPEN_STORE_INQUIRY");
      expect(r.authority).toBe("C_store");
      expect(r.status).toBe("CONFIRMED");
      expect(r.sourceState).toContain("store_inquiries");
    });

    it("OWNER_CHAT_UNREAD is B_store EXCLUDED", () => {
      const r = classifyStoreOperationEvent("OWNER_CHAT_UNREAD");
      expect(r.authority).toBe("B_store");
      expect(r.status).toBe("EXCLUDED");
    });

    it("owner_intake notification row is not C truth", () => {
      const r = classifyStoreOperationEvent("OWNER_INTAKE_NOTIFICATION");
      expect(r.authority).toBe("notification_transport");
      expect(r.status).toBe("REWRITE");
      expect(ownerIntakeNotificationIsCTruth()).toBe(false);
    });

    it("REVIEW_ACTION is UNKNOWN_BLOCKED", () => {
      const r = classifyStoreOperationEvent("REVIEW_ACTION");
      expect(r.authority).toBe("UNKNOWN_BLOCKED");
      expect(r.status).toBe("UNKNOWN_BLOCKED");
    });

    it("cooking/delivery CTA are OUT_OF_BADGE by default", () => {
      expect(classifyStoreOperationEvent("COOKING_STAGE").status).toBe("OUT_OF_BADGE");
      expect(classifyStoreOperationEvent("DELIVERY_STAGE").status).toBe("OUT_OF_BADGE");
    });

    it("SSOT table includes required action types", () => {
      const types = C_STORE_ACTION_SSOT.map((r) => r.actionType);
      expect(types).toEqual(
        expect.arrayContaining([
          "NEW_ORDER_PENDING",
          "REFUND_REQUESTED",
          "CANCEL_REQUESTED",
          "OPEN_STORE_INQUIRY",
          "OWNER_CHAT_UNREAD",
          "OWNER_INTAKE_NOTIFICATION",
          "COOKING_STAGE",
          "DELIVERY_STAGE",
          "REVIEW_ACTION",
        ])
      );
    });
  });

  describe("identity", () => {
    it("C_store allows store identity only", () => {
      const ok = assertCStoreIdentity("store-a");
      expect(ok).toEqual({
        ok: true,
        key: "store:store-a",
        storeId: "store-a",
      });
      const store = storeBadgeIdentity("store-a");
      expect(store.ok).toBe(true);
      if (!store.ok) return;
      expect(
        assertAuthorityIdentityCompatible("C_STORE_OPERATION", store.identity)
      ).toEqual({ ok: true });
    });

    it("owner user identity fails for C_store", () => {
      expect(rejectUserIdentityForCStore("owner-1")).toEqual({
        ok: false,
        reason: "C_STORE_FORBIDS_USER_IDENTITY",
      });
      const member = memberBadgeIdentity("owner-1");
      expect(member.ok).toBe(true);
      if (!member.ok) return;
      expect(
        assertAuthorityIdentityCompatible("C_STORE_OPERATION", member.identity)
      ).toEqual({ ok: false, reason: "STORE_AUTHORITY_REQUIRES_STORE_IDENTITY" });
    });

    it("store A action does not change store B count", () => {
      const ledger = createCStoreActionLedger();
      ledger.openAction({
        storeId: "store-a",
        actionType: "NEW_ORDER_PENDING",
        sourceDomain: "store_orders",
        sourceEntityId: "ord-1",
      });
      expect(ledger.countForStore("store-a")).toBe(1);
      expect(ledger.countForStore("store-b")).toBe(0);
    });
  });

  describe("increase / decrease", () => {
    it("new action opens +1; same source re-open does not increase", () => {
      const ledger = createCStoreActionLedger();
      const a = ledger.openAction({
        storeId: "s1",
        actionType: "NEW_ORDER_PENDING",
        sourceDomain: "store_orders",
        sourceEntityId: "ord-1",
      });
      expect(a.delta).toBe(1);
      expect(ledger.countForStore("s1")).toBe(1);
      const again = ledger.openAction({
        storeId: "s1",
        actionType: "NEW_ORDER_PENDING",
        sourceDomain: "store_orders",
        sourceEntityId: "ord-1",
      });
      expect(again.delta).toBe(0);
      expect(ledger.countForStore("s1")).toBe(1);
    });

    it("screen open and notification read do not decrease", () => {
      expect(screenOpenClearsCStore()).toBe(false);
      expect(notificationReadClearsCStore()).toBe(false);
      expect(isForbiddenCStoreDecrease("OWNER_HUB_OPEN")).toBe(true);
      expect(isForbiddenCStoreDecrease("NOTIFICATION_READ")).toBe(true);
      expect(isForbiddenCStoreDecrease("NOTIFICATION_INBOX_DELETE")).toBe(true);
      expect(isForbiddenCStoreDecrease("CHAT_ROOM_READ")).toBe(true);

      const ledger = createCStoreActionLedger();
      const opened = ledger.openAction({
        storeId: "s1",
        actionType: "NEW_ORDER_PENDING",
        sourceDomain: "store_orders",
        sourceEntityId: "ord-1",
      });
      expect(
        ledger.completeAction(opened.action.actionId, "OWNER_HUB_OPEN").delta
      ).toBe(0);
      expect(
        ledger.completeAction(opened.action.actionId, "NOTIFICATION_READ").delta
      ).toBe(0);
      expect(ledger.countForStore("s1")).toBe(1);
      expect(ledger.applyForbiddenTrigger("SCREEN_REFRESH", "s1")).toBe(1);
    });

    it("order accept / reject complete decreases once", () => {
      const ledger = createCStoreActionLedger();
      const opened = ledger.openAction({
        storeId: "s1",
        actionType: "NEW_ORDER_PENDING",
        sourceDomain: "store_orders",
        sourceEntityId: "ord-1",
      });
      expect(
        ledger.completeAction(opened.action.actionId, "ORDER_ACCEPT_COMPLETE").delta
      ).toBe(-1);
      expect(ledger.countForStore("s1")).toBe(0);
      expect(
        ledger.completeAction(opened.action.actionId, "ORDER_ACCEPT_COMPLETE").delta
      ).toBe(0);

      const opened2 = ledger.openAction({
        storeId: "s1",
        actionType: "NEW_ORDER_PENDING",
        sourceDomain: "store_orders",
        sourceEntityId: "ord-2",
      });
      expect(
        ledger.completeAction(opened2.action.actionId, "ORDER_REJECT_COMPLETE").delta
      ).toBe(-1);
    });

    it("refund and cancel resolve complete decrease", () => {
      const ledger = createCStoreActionLedger();
      const refund = ledger.openAction({
        storeId: "s1",
        actionType: "REFUND_REQUESTED",
        sourceDomain: "store_orders",
        sourceEntityId: "ord-r",
      });
      const cancel = ledger.openAction({
        storeId: "s1",
        actionType: "CANCEL_REQUESTED",
        sourceDomain: "store_orders",
        sourceEntityId: "ord-c",
      });
      expect(ledger.countForStore("s1")).toBe(2);
      expect(
        ledger.completeAction(refund.action.actionId, "REFUND_RESOLVE_COMPLETE").delta
      ).toBe(-1);
      expect(
        ledger.completeAction(cancel.action.actionId, "CANCEL_RESOLVE_COMPLETE").delta
      ).toBe(-1);
      expect(ledger.countForStore("s1")).toBe(0);
    });

    it("inquiry resolve decreases; B_store chat read does not", () => {
      const ledger = createCStoreActionLedger();
      const inq = ledger.openAction({
        storeId: "s1",
        actionType: "OPEN_STORE_INQUIRY",
        sourceDomain: "store_inquiries",
        sourceEntityId: "inq-1",
      });
      expect(
        ledger.completeAction(inq.action.actionId, "CHAT_ROOM_READ").delta
      ).toBe(0);
      expect(ledger.countForStore("s1")).toBe(1);
      expect(
        ledger.completeAction(inq.action.actionId, "INQUIRY_RESOLVE_COMPLETE").delta
      ).toBe(-1);
    });

    it("notification delete does not change C_store", () => {
      const ledger = createCStoreActionLedger();
      const opened = ledger.openAction({
        storeId: "s1",
        actionType: "NEW_ORDER_PENDING",
        sourceDomain: "store_orders",
        sourceEntityId: "ord-1",
      });
      expect(
        ledger.completeAction(
          opened.action.actionId,
          "NOTIFICATION_INBOX_DELETE"
        ).reason
      ).toBe("FORBIDDEN_DECREASE_TRIGGER");
      expect(ledger.countForStore("s1")).toBe(1);
    });

    it("same actionId is unique across refresh/bootstrap re-receive", () => {
      const id1 = buildCStoreActionId({
        storeId: "s1",
        actionType: "NEW_ORDER_PENDING",
        sourceEntityId: "ord-1",
      });
      const id2 = buildCStoreActionId({
        storeId: "s1",
        actionType: "NEW_ORDER_PENDING",
        sourceEntityId: "ord-1",
      });
      expect(id1).toBe(id2);
      expect(id1).toBe("store:s1|NEW_ORDER_PENDING|ord-1");
    });
  });

  describe("surfaces and separation", () => {
    it("C_store forbids Member Bell / Member App Icon / Owner Chat", () => {
      expect(assertCStoreSurfaceForbidden("MEMBER_BELL")).toBe(true);
      expect(assertCStoreSurfaceForbidden("MEMBER_APP_ICON")).toBe(true);
      expect(assertCStoreSurfaceForbidden("OWNER_CHAT_SURFACE")).toBe(true);
      expect(assertCStoreSurfaceForbidden("NATIVE_MEMBER_APP_ICON")).toBe(true);
      expect(cStoreAllowsSurface("MEMBER_BELL")).toBe(false);
      expect(cStoreAllowsSurface("MEMBER_APP_ICON")).toBe(false);
      expect(cStoreAllowsSurface("OWNER_CHAT_SURFACE")).toBe(false);
      expect(cStoreAllowsSurface("OWNER_OPERATION_BADGE")).toBe(true);
      expect(cStoreAllowsSurface("OWNER_ADMIN_OPERATION")).toBe(true);
    });

    it("B_store message does not change C_store ledger", () => {
      const ledger = createCStoreActionLedger();
      ledger.openAction({
        storeId: "s1",
        actionType: "NEW_ORDER_PENDING",
        sourceDomain: "store_orders",
        sourceEntityId: "ord-1",
      });
      const before = ledger.countForStore("s1");
      // Chat unread is EXCLUDED — no openAction for OWNER_CHAT_UNREAD on C ledger.
      expect(classifyStoreOperationEvent("OWNER_CHAT_UNREAD").authority).toBe("B_store");
      expect(ledger.countForStore("s1")).toBe(before);
    });

    it("presentation total is presentation-only, not authority", () => {
      const p = ownerPresentationTotal(3, 2);
      expect(p).toEqual({ presentationOnly: true, total: 5 });
    });
  });

  describe("dual authority ban + hub formula", () => {
    it("max(sourceA, sourceB) is forbidden as authority", () => {
      expect(forbidMaxAsCStoreAuthority(2, 5)).toEqual({
        ok: false,
        reason: "C_STORE_FORBIDS_MAX_DUAL_AUTHORITY",
      });
    });

    it("hub formula candidate includes cancel + inquiry as distinct actions", () => {
      expect(
        cStoreHubFormulaCandidate({
          pendingOrderActions: 1,
          refundActions: 1,
          cancelActions: 1,
          openInquiryActions: 1,
        })
      ).toBe(4);
    });

    it("cancel_requested requires store action flag for inclusion", () => {
      expect(
        cancelRequestedRequiresStoreAction({
          orderStatus: "cancel_requested",
          storeActionRequired: true,
        })
      ).toBe(true);
      expect(
        cancelRequestedRequiresStoreAction({
          orderStatus: "cancel_requested",
          storeActionRequired: false,
        })
      ).toBe(false);
    });
  });
});
