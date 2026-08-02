/**
 * P2-a/b parity — same Domain/orphan Facts as the legacy five-loader + row-scan path.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { partitionDomainBadgeTargetFacts } from "@/lib/notifications/load-domain-badge-target-facts";
import { aggregateOrphanMissedCallFacts } from "@/lib/notifications/load-orphan-missed-call-facts";
import {
  buildMessengerChatRoomUnreadTargetRoomIds,
} from "@/lib/messenger/contracts/chat-room-unread-from-notification-targets";
import { buildTradeUnreadTargetIdentityKeys } from "@/lib/messenger/trade/unread-from-notification-targets";
import {
  buildStoreOrderOwnerUnreadTargetIndex,
} from "@/lib/messenger/store-order/unread-from-notification-targets";

describe("P2-a domain badge target facts parity", () => {
  const rows = [
    {
      target_id: "gd-1",
      chat_domain: "general_direct",
      target_type: "chat_room",
      is_unread: true,
      scope: "consumer",
    },
    {
      target_id: "gd-2",
      chat_domain: "general_direct",
      target_type: "chat_room",
      is_unread: true,
      scope: "consumer",
    },
    {
      target_id: "grp-1",
      chat_domain: "group",
      target_type: "chat_room",
      is_unread: true,
      scope: "consumer",
    },
    // non-consumer chat_room ignored (legacy loader filters scope=consumer)
    {
      target_id: "gd-owner",
      chat_domain: "general_direct",
      target_type: "chat_room",
      is_unread: true,
      scope: "owner",
    },
    {
      target_id: "trade-tid",
      domain_identity_key: "trade:item:s:b",
      chat_domain: "trade",
      target_type: "trade",
      is_unread: true,
      scope: "consumer",
    },
    {
      target_id: "order-1",
      chat_domain: "store_order",
      target_type: "buyer_order",
      is_unread: true,
      scope: "consumer",
    },
    {
      target_id: "owner-room-1",
      domain_identity_key: "store_order:order-99",
      chat_domain: "store_order",
      target_type: "owner_order_chat",
      is_unread: true,
      scope: "owner",
    },
    { target_id: "read-skip", chat_domain: "general_direct", target_type: "chat_room", is_unread: false, scope: "consumer" },
  ];

  it("matches legacy five-loader set sizes", () => {
    const unified = partitionDomainBadgeTargetFacts(rows);

    // Mirror SQL filters of the five legacy loaders (not the pure set builders alone).
    const gdRows = rows.filter(
      (r) =>
        r.target_type === "chat_room" &&
        r.scope === "consumer" &&
        r.is_unread !== false &&
        r.chat_domain === "general_direct"
    );
    const groupRows = rows.filter(
      (r) =>
        r.target_type === "chat_room" &&
        r.scope === "consumer" &&
        r.is_unread !== false &&
        r.chat_domain === "group"
    );
    const gd = buildMessengerChatRoomUnreadTargetRoomIds(gdRows, ["general_direct"]);
    const group = buildMessengerChatRoomUnreadTargetRoomIds(groupRows, ["group"]);
    const trade = buildTradeUnreadTargetIdentityKeys(
      rows.filter(
        (r) =>
          r.target_type === "trade" &&
          r.scope === "consumer" &&
          r.is_unread !== false &&
          r.chat_domain === "trade"
      )
    );
    const buyerIds = new Set(
      rows
        .filter(
          (r) =>
            r.target_type === "buyer_order" && r.is_unread !== false && r.chat_domain === "store_order"
        )
        .map((r) => String(r.target_id))
    );
    const owner = buildStoreOrderOwnerUnreadTargetIndex(
      rows.filter(
        (r) =>
          r.target_type === "owner_order_chat" &&
          r.is_unread !== false &&
          r.chat_domain === "store_order"
      )
    );

    const storeOrderAttention = new Set<string>();
    for (const id of buyerIds) storeOrderAttention.add(`buyer:${id}`);
    for (const id of owner.roomIds) storeOrderAttention.add(`owner_room:${id}`);
    for (const id of owner.orderIds) storeOrderAttention.add(`owner_order:${id}`);

    expect(unified.domainUnreadRooms.general_direct).toBe(gd.size);
    expect(unified.domainUnreadRooms.group).toBe(group.size);
    expect(unified.domainUnreadRooms.trade).toBe(trade.size);
    expect(unified.domainUnreadRooms.store_order).toBe(storeOrderAttention.size);
    expect(unified.storeOrderBuyerDeliveryUnread).toBe(buyerIds.size);
    expect(unified.storeOrderOwnerChatUnread).toBe(owner.roomIds.size);
  });

  it("badge-count HTTP builder uses participant Facts for messenger/trade/SO (not five target loaders)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/pipeline/build-domain-badge-authority-http.ts"),
      "utf8"
    );
    expect(src).toContain("loadMessengerUnreadRoomFactsFromParticipants");
    expect(src).toContain("loadTradeStoreOrderUnreadRoomFactsFromParticipants");
    expect(src).toContain("loadOrphanMissedCallFacts");
    expect(src).not.toContain("loadDomainBadgeTargetFacts");
    expect(src).not.toContain("loadMessengerChatRoomUnreadTargetRoomIds");
    expect(src).not.toContain("loadTradeUnreadTargetIdentityKeys");
    expect(src).not.toContain("loadStoreOrderUnreadTargetOrderIds");
    expect(src).not.toContain("loadStoreOrderOwnerUnreadTargetIndex");
    expect(src).not.toContain("countOrphanMissedCallEvents");
  });
});

describe("P2-b orphan missed facts (byRoom required)", () => {
  it("counts orphan and byRoom with eligibility; excludes muted-badge payloads", () => {
    const out = aggregateOrphanMissedCallFacts([
      { id: "e1", room_id: null, display_payload: null },
      { id: "e2", room_id: "", display_payload: {} },
      { room_id: "room-a", display_payload: {} },
      { room_id: "room-a", display_payload: {} },
      { room_id: "room-b", display_payload: {} },
      { id: "e-muted", room_id: null, display_payload: { exclude_from_badge: true } },
      { room_id: "room-c", display_payload: { badge_enabled: false } },
    ]);
    expect(out.orphan).toBe(2);
    expect(out.orphanEventIds).toEqual(["e1", "e2"]);
    expect(out.orphanCallIds).toEqual(["event:e1", "event:e2"]);
    expect(out.byRoom).toEqual({ "room-a": 2, "room-b": 1 });
  });

  it("dedupes orphan missed by call session id", () => {
    const out = aggregateOrphanMissedCallFacts([
      {
        id: "a",
        room_id: null,
        dedupe_key: "missed:sess-1:u1",
        display_payload: {},
      },
      {
        id: "b",
        room_id: null,
        dedupe_key: "missed:sess-1:u1",
        display_payload: {},
      },
      {
        id: "c",
        room_id: null,
        dedupe_key: "missed:sess-2:u1",
        display_payload: {},
      },
    ]);
    expect(out.orphan).toBe(3);
    expect(out.orphanCallIds).toEqual(["sess-1", "sess-2"]);
  });

  it("documents byRoom product consumers remain (cannot drop for COUNT-only)", () => {
    const storeSrc = readFileSync(
      join(process.cwd(), "lib/notifications/client/room-missed-call-badge-store.ts"),
      "utf8"
    );
    const canarySrc = readFileSync(
      join(process.cwd(), "components/community-messenger/domain-shell-canary/DomainShellCanaryHomeGate.tsx"),
      "utf8"
    );
    expect(storeSrc).toContain("missedCallByRoom");
    expect(canarySrc).toContain("publishRoomMissedCallBadgeByRoom");
  });
});
