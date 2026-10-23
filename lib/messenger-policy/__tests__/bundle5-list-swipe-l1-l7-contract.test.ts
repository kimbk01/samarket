import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getSwipeActions, getSwipeLeaveConfirmI18nKey } from "@/lib/messenger-policy/chat-room-swipe-actions";
import {
  isViewerDeliveryStoreOwner,
  isViewerGroupRoomOwner,
  shouldOmitSwipeLeaveAction,
} from "@/lib/messenger-policy/messenger-swipe-leave-visibility";
import {
  parseDeliveryLeaveLookupFromRoom,
  resolveStoreOwnerCannotLeaveError,
} from "@/lib/messenger-policy/resolve-delivery-store-owner-for-leave";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("§2 bundle5 list swipe L-1~L-7", () => {
  it("L-1/L-2 list item cancel/lostcapture force-close + ignore lostcapture after up", () => {
    const src = read("components/community-messenger/MessengerChatListItem.tsx");
    expect(src).toContain("ignoreNextLostCaptureRef");
    expect(src).toContain("forceCloseSwipeOnCancel");
    expect(src).toContain("onLostPointerCapture");
  });

  it("L-3 open row tap checks parent open + local drag before navigate", () => {
    const src = read("components/community-messenger/MessengerChatListItem.tsx");
    expect(src).toContain("openByParent");
    expect(src).toContain("openByLocal");
    expect(src).toMatch(/openedSwipeItemId === swipeItemId \|\| dragXRef\.current < -16 \|\| swipeOpen/);
  });

  it("L-6 omits leave for group owner", () => {
    expect(
      isViewerGroupRoomOwner({
        policyType: "group",
        viewerUserId: "u1",
        roomOwnerUserId: "u1",
      })
    ).toBe(true);
    expect(
      isViewerGroupRoomOwner({
        policyType: "group",
        viewerUserId: "u1",
        roomOwnerUserId: "u2",
      })
    ).toBe(false);
    expect(
      isViewerGroupRoomOwner({
        policyType: "direct",
        viewerUserId: "u1",
        roomOwnerUserId: "u1",
      })
    ).toBe(false);
    const actions = getSwipeActions({
      policyType: "group",
      listContext: "default",
      viewerIsGroupOwner: true,
    });
    expect(actions.map((a) => a.kind)).toEqual(["archive", "read"]);
  });

  it("L-7 omits leave for delivery store owner via stores.owner id (not room owner)", () => {
    expect(
      isViewerDeliveryStoreOwner({
        isDeliveryRoom: true,
        viewerUserId: "owner-1",
        storeOwnerUserId: "owner-1",
      })
    ).toBe(true);
    expect(
      isViewerDeliveryStoreOwner({
        isDeliveryRoom: true,
        viewerUserId: "buyer-1",
        storeOwnerUserId: "owner-1",
      })
    ).toBe(false);
    expect(shouldOmitSwipeLeaveAction({ viewerIsGroupOwner: false, viewerIsDeliveryStoreOwner: true })).toBe(
      true
    );
    const actions = getSwipeActions({
      policyType: "direct",
      listContext: "default",
      viewerIsDeliveryStoreOwner: true,
    });
    expect(actions.map((a) => a.kind)).not.toContain("leave");
  });

  it("L-7 leave confirm key for delivery + server guard helpers", () => {
    expect(getSwipeLeaveConfirmI18nKey("direct", { isDeliveryRoom: true })).toBe(
      "cm_ui_leave_confirm_delivery"
    );
    expect(getSwipeLeaveConfirmI18nKey("direct")).toBe("cm_ui_leave_confirm_direct");
    expect(
      parseDeliveryLeaveLookupFromRoom({
        contextMetaKind: "delivery",
        storeOrderId: "ord-1",
        storeId: "st-1",
        directKey: null,
      }).isDeliveryRoom
    ).toBe(true);
    expect(
      parseDeliveryLeaveLookupFromRoom({
        contextMetaKind: null,
        storeOrderId: null,
        storeId: null,
        directKey: "store_order:ord-9",
      }).storeOrderId
    ).toBe("ord-9");
    expect(
      resolveStoreOwnerCannotLeaveError({ viewerUserId: "owner-1", storeOwnerUserId: "owner-1" })
    ).toBe("store_owner_cannot_leave");
    expect(
      resolveStoreOwnerCannotLeaveError({ viewerUserId: "buyer-1", storeOwnerUserId: "owner-1" })
    ).toBeNull();
  });

  it("leave orchestration wires delivery store-owner deny via stores.owner_user_id", () => {
    const src = read("lib/messenger-policy/leave-chat-room-orchestration.server.ts");
    expect(src).toContain("resolveStoreOwnerCannotLeaveError");
    expect(src).toContain("parseDeliveryLeaveLookupFromRoom");
    expect(src).toContain("stores(owner_user_id)");
  });

  it("i18n catalog has delivery leave confirm ko/en", () => {
    const cat = read("lib/i18n/catalog/community-messenger-ui.ts");
    expect(cat).toContain("cm_ui_leave_confirm_delivery:");
    expect(cat.match(/cm_ui_leave_confirm_delivery:/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
