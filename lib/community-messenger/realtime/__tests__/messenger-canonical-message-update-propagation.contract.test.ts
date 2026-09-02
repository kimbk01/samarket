import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { resolveRoomBumpDedupeKey } from "@/lib/chat-domain/realtime/domain-realtime-envelope";
import {
  parseCommunityMessengerBumpMessageSnapshot,
  serializeCommunityMessengerMessageForBump,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const MESSAGE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROOM_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AUTHOR_ID = "11111111-1111-4111-8111-111111111111";
const PEER_ACTOR_ID = "22222222-2222-4222-8222-222222222222";

function giftMsg(status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED"): CommunityMessengerMessage {
  return {
    id: MESSAGE_ID,
    roomId: ROOM_ID,
    senderId: AUTHOR_ID,
    senderLabel: "Author",
    messageType: "gift_certificate",
    content: "Gift certificate",
    createdAt: "2026-09-01T00:00:00.000Z",
    metadata: {
      gift_transfer_id: "33333333-3333-4333-8333-333333333333",
      transfer_status: status,
      instance_id: "44444444-4444-4444-8444-444444444444",
      face_value: 1000,
      remaining_balance: 1000,
    },
    clientMessageId: null,
    isMine: false,
  };
}

describe("messenger canonical same-id UPDATE propagation", () => {
  it("T2/T3: PENDING → ACCEPTED same id replaces once", () => {
    const merged = mergeRoomMessages([giftMsg("PENDING")], [giftMsg("ACCEPTED")]);
    expect(merged).toHaveLength(1);
    expect((merged[0]!.metadata as { transfer_status?: string }).transfer_status).toBe("ACCEPTED");
  });

  it("T4: duplicate ACCEPTED update stays one row", () => {
    const once = mergeRoomMessages([giftMsg("PENDING")], [giftMsg("ACCEPTED")]);
    const twice = mergeRoomMessages(once, [giftMsg("ACCEPTED")]);
    expect(twice).toHaveLength(1);
  });

  it("T5: stale PENDING after ACCEPTED does not downgrade", () => {
    const accepted = mergeRoomMessages([giftMsg("PENDING")], [giftMsg("ACCEPTED")]);
    const stale = mergeRoomMessages(accepted, [giftMsg("PENDING")]);
    expect((stale[0]!.metadata as { transfer_status?: string }).transfer_status).toBe("ACCEPTED");
  });

  it("T11/T12: REJECTED and CANCELLED replace PENDING", () => {
    expect(
      (mergeRoomMessages([giftMsg("PENDING")], [giftMsg("REJECTED")])[0]!.metadata as { transfer_status?: string })
        .transfer_status
    ).toBe("REJECTED");
    expect(
      (mergeRoomMessages([giftMsg("PENDING")], [giftMsg("CANCELLED")])[0]!.metadata as { transfer_status?: string })
        .transfer_status
    ).toBe("CANCELLED");
  });

  it("T6: bump snapshot parse rejects peer-mutator payload (HTTP reconcile required)", () => {
    const serialized = serializeCommunityMessengerMessageForBump(giftMsg("ACCEPTED"));
    const parsed = parseCommunityMessengerBumpMessageSnapshot(
      {
        fromUserId: PEER_ACTOR_ID,
        canonicalRoomId: ROOM_ID,
        messageId: MESSAGE_ID,
        message: serialized,
      },
      AUTHOR_ID
    );
    expect(parsed).toBeNull();
  });

  it("T6b: bump snapshot still accelerates when fromUserId === message.senderId", () => {
    const serialized = serializeCommunityMessengerMessageForBump(giftMsg("ACCEPTED"));
    const parsed = parseCommunityMessengerBumpMessageSnapshot(
      {
        fromUserId: AUTHOR_ID,
        canonicalRoomId: ROOM_ID,
        messageId: MESSAGE_ID,
        message: serialized,
      },
      PEER_ACTOR_ID
    );
    expect(parsed?.metadata).toMatchObject({ transfer_status: "ACCEPTED" });
  });

  it("T7: domain bump dedupe distinguishes INSERT vs UPDATE via at", () => {
    const insertKey = resolveRoomBumpDedupeKey({
      chatDomain: "general_direct",
      domainIdentity: "direct:pair",
      canonicalRoomId: ROOM_ID,
      messageId: MESSAGE_ID,
      eventId: MESSAGE_ID,
      fromUserId: AUTHOR_ID,
      at: "2026-09-01T00:00:00.000Z",
    });
    const updateKey = resolveRoomBumpDedupeKey({
      chatDomain: "general_direct",
      domainIdentity: "direct:pair",
      canonicalRoomId: ROOM_ID,
      messageId: MESSAGE_ID,
      eventId: MESSAGE_ID,
      fromUserId: PEER_ACTOR_ID,
      at: "2026-09-01T00:00:05.000Z",
    });
    expect(insertKey).not.toBe(updateKey);
  });

  it("wiring: bump catch-up always HTTP-reconciles messageId (not after= only)", () => {
    const catchup = source("lib/community-messenger/room/use-messenger-room-remote-catchup.ts");
    expect(catchup).toContain("invalidation signal");
    expect(catchup).toContain("tryMergeSingleMessageFromBump(hint)");
    expect(catchup).not.toContain("mergedBySnapshot");
  });

  it("wiring: peer-mutated bump is not skipped as own insert", () => {
    const bump = source("lib/community-messenger/room/use-messenger-room-bump-broadcast-subscription.ts");
    expect(bump).toContain("rawSenderId === from");
    expect(bump).toContain("Peer-mutated same-id UPDATE");
  });

  it("wiring: messages table uses REPLICA IDENTITY FULL migration", () => {
    const mig = source(
      "supabase/migrations/20261202190000_community_messenger_messages_replica_identity_full.sql"
    );
    expect(mig).toContain("REPLICA IDENTITY FULL");
    expect(mig).toContain("community_messenger_messages");
  });
});
