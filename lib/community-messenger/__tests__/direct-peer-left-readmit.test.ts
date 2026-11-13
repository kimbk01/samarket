/**
 * S-1 (Owner 2026-11-02) — 상대가 나간 일반 1:1: 게이트가 되살릴 상대를 정하고(차단·거절·거래·주문 제외),
 * 모든 보내기 경로가 같은 되살림 함수를 쓴다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/social/user-block-ssot", () => ({
  fetchBlockedPairFromSb: vi.fn(async () => ({ blockedByMe: false, blockedByPeer: false, blockedEitherWay: false })),
}));
vi.mock("@/lib/community-messenger/social-relations", () => ({
  fetchFriendRequestRejectedByPeer: vi.fn(async () => false),
}));

let participantRows: Array<{ user_id: string; left_at?: string | null }> = [];
let directKey = "peer-a:peer-b";

function chainable(terminalData: () => unknown) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  for (const kind of ["select", "eq", "or", "in", "is", "not", "order", "limit"]) builder[kind] = self;
  builder.maybeSingle = async () => ({ data: terminalData(), error: null });
  builder.then = (resolve: (v: { data: unknown; error: null }) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data: terminalData(), error: null }).then(resolve, reject);
  return builder;
}

const sb = {
  from: vi.fn((table: string) => {
    if (table === "community_messenger_rooms") {
      return chainable(() => ({ room_type: "direct", direct_key: directKey, chat_domain: "general_direct" }));
    }
    if (table === "community_messenger_participants") return chainable(() => participantRows);
    return chainable(() => null);
  }),
};

import { fetchBlockedPairFromSb } from "@/lib/social/user-block-ssot";
import { assertDirectRoomCommunicationNotBlocked } from "@/lib/community-messenger/direct-room-communication-gate";

const general = (over: Partial<{ hasProductChatLink: boolean; hasStoreOrderLink: boolean; directKey: string }> = {}) => ({
  roomType: "direct",
  chatDomain: "general_direct",
  directKey: over.directKey ?? directKey,
  hasProductChatLink: over.hasProductChatLink ?? false,
  hasStoreOrderLink: over.hasStoreOrderLink ?? false,
});

describe("S-1 gate — readmitPeerUserId", () => {
  beforeEach(() => {
    directKey = "peer-a:peer-b";
    participantRows = [{ user_id: "peer-a" }];
    vi.mocked(fetchBlockedPairFromSb).mockResolvedValue({ blockedByMe: false, blockedByPeer: false, blockedEitherWay: false });
  });

  it("peer left (row deleted) → peer from direct_key, readmit candidate", async () => {
    const r = await assertDirectRoomCommunicationNotBlocked({ viewerUserId: "peer-a", roomId: "r", supabase: sb as any, domainEvidence: general() });
    expect(r).toMatchObject({ ok: true, peerUserId: "peer-b", readmitPeerUserId: "peer-b" });
  });

  it("peer left_at set → readmit candidate", async () => {
    participantRows = [{ user_id: "peer-a" }, { user_id: "peer-b", left_at: "2026-11-01T00:00:00Z" }];
    const r = await assertDirectRoomCommunicationNotBlocked({ viewerUserId: "peer-a", roomId: "r", supabase: sb as any, domainEvidence: general() });
    expect(r).toMatchObject({ ok: true, readmitPeerUserId: "peer-b" });
  });

  it("peer still participating → no readmit", async () => {
    participantRows = [{ user_id: "peer-a" }, { user_id: "peer-b" }];
    const r = await assertDirectRoomCommunicationNotBlocked({ viewerUserId: "peer-a", roomId: "r", supabase: sb as any, domainEvidence: general() });
    expect(r).toMatchObject({ ok: true, peerUserId: "peer-b", readmitPeerUserId: null });
  });

  it("blocked either way → deny, never a readmit candidate", async () => {
    vi.mocked(fetchBlockedPairFromSb).mockResolvedValue({ blockedByMe: false, blockedByPeer: true, blockedEitherWay: true });
    const r = await assertDirectRoomCommunicationNotBlocked({ viewerUserId: "peer-a", roomId: "r", supabase: sb as any, domainEvidence: general() });
    expect(r.ok).toBe(false);
    expect((r as { readmitPeerUserId?: unknown }).readmitPeerUserId).toBeUndefined();
  });

  it("store order link → no readmit (주문은 자체 규칙)", async () => {
    const r = await assertDirectRoomCommunicationNotBlocked({
      viewerUserId: "peer-a",
      roomId: "r",
      supabase: sb as any,
      domainEvidence: general({ hasStoreOrderLink: true }),
    });
    expect(r.ok && (r as { readmitPeerUserId?: string | null }).readmitPeerUserId).toBeFalsy();
  });
});

describe("S-1 contract — every send path readmits through one function", () => {
  const root = process.cwd();
  const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

  it("message-saving routes use prepareMessengerRoomSend (not the bare gate)", () => {
    for (const rel of [
      "app/api/community-messenger/rooms/[roomId]/images/route.ts",
      "app/api/community-messenger/rooms/[roomId]/voice/route.ts",
      "app/api/community-messenger/rooms/[roomId]/files/route.ts",
    ]) {
      const src = read(rel);
      expect(src, rel).toContain("prepareMessengerRoomSend(");
      expect(src, rel).not.toContain("assertMessengerRoomSendAllowed");
      expect(src, rel).not.toContain("readmit: false");
    }
  });

  it("upload-url routes gate only (readmit:false)", () => {
    for (const rel of [
      "app/api/community-messenger/rooms/[roomId]/images/upload-urls/route.ts",
      "app/api/community-messenger/rooms/[roomId]/files/upload-url/route.ts",
    ]) {
      expect(read(rel), rel).toContain("readmit: false");
    }
  });

  it("service: text path readmits after the block gate; sticker·share·forward use prepare", () => {
    const src = read("lib/community-messenger/service.ts");
    expect(src).not.toContain("assertMessengerRoomSendAllowed(");
    // sticker · post share · 메시지 전달(통합 공유 S6 2026-11-14)
    expect(src.match(/prepareMessengerRoomSend\(/g)?.length).toBe(3);
    expect(src).toContain("blockGate.readmitPeerUserId");
  });

  it("only prepare-messenger-room-send calls the bare gate", () => {
    const src = read("lib/community-messenger/server/prepare-messenger-room-send.ts");
    expect(src).toContain("readmitLeftGeneralDirectPeerForSend");
  });
});

describe("S-1 L-1 — 일반 1:1 상대 신원 = direct_key", async () => {
  const { generalDirectKeyPeerUserId } = await import("@/lib/community-messenger/service");
  const row = (direct_key: string, room_type = "direct") => ({ id: "r", room_type, direct_key }) as never;

  it("pair key → the other id regardless of participant rows", () => {
    expect(generalDirectKeyPeerUserId(row("u1:u2"), "u1")).toBe("u2");
    expect(generalDirectKeyPeerUserId(row("u1:u2"), "u2")).toBe("u1");
  });

  it("commerce keys · groups · outsiders → null", () => {
    expect(generalDirectKeyPeerUserId(row("trade_pc:abc"), "u1")).toBeNull();
    expect(generalDirectKeyPeerUserId(row("u1:u2", "private_group"), "u1")).toBeNull();
    expect(generalDirectKeyPeerUserId(row("u1:u2"), "u3")).toBeNull();
  });
});

describe("S-1 L-5 — 1:1 나가기는 방장 거부 대상이 아님", () => {
  it("owner_cannot_leave only for non-direct rooms", () => {
    const src = readFileSync(
      path.join(process.cwd(), "lib/messenger-policy/leave-chat-room-orchestration.server.ts"),
      "utf8"
    );
    expect(src).toContain('if (roomTypeForLeave !== "direct" && ownerId === uid)');
  });
});

describe("S-2c — call start in a peer-left general 1:1", () => {
  it("resolves the peer from direct_key and readmits right before the ringing insert (after all gates)", () => {
    const src = readFileSync(path.join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
    expect(src).toContain("const peerUserId = peers[0] ?? generalDirectKeyPeerUserId(roomData as RoomRow, userId);");
    const readmitAt = src.indexOf('if (resolved.kind === "directLight" && !resolved.peerParticipating && peerUserId)');
    const insertAt = src.indexOf("const insertWithDomain = {");
    const gateAt = src.indexOf('gateTag: "api_gate_start"');
    expect(readmitAt).toBeGreaterThan(gateAt);
    expect(readmitAt).toBeLessThan(insertAt);
  });
});
