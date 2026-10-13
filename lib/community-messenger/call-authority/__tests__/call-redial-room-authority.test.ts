/**
 * Call history redial — room is resolved server-authoritatively before launch.
 * Historic room kept only while callable; otherwise canonical general direct room
 * (created / re-admitted / un-archived).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateHistoricRedialRoom } from "@/lib/community-messenger/call-authority/call-redial-room-authority";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

function makeBuilder(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let patch: Row | null = null;
  const matching = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    eq: (col: string, value: unknown) => {
      filters.push((row) => row[col] === value);
      return builder;
    },
    in: (col: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[col]));
      return builder;
    },
    update: (p: Row) => {
      patch = p;
      return builder;
    },
    insert: async (rows: Row | Row[]) => {
      const list = Array.isArray(rows) ? rows : [rows];
      tables[table] = [...(tables[table] ?? []), ...list.map((r) => ({ left_at: null, is_archived: false, ...r }))];
      return { error: null };
    },
    maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[] | null; error: null }) => unknown) => {
      if (patch) {
        for (const row of matching()) Object.assign(row, patch);
        return resolve({ data: null, error: null });
      }
      return resolve({ data: matching(), error: null });
    },
  };
  return builder;
}

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({ from: (table: string) => makeBuilder(table) }),
}));

vi.mock("@/lib/community-messenger/social-relations", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isBlockedEitherWay: vi.fn(async () => false),
  resolveDirectInteractionGuard: vi.fn(async () => ({ canMessage: true, canCall: true, reason: null })),
}));

import { resolveCommunityMessengerRedialRoom } from "@/lib/community-messenger/service";

const VIEWER = "user-a";
const PEER = "user-b";
const GD_ROOM = "room-gd";
const TRADE_ROOM = "room-trade";

function seed() {
  for (const key of Object.keys(tables)) delete tables[key];
  tables.community_messenger_rooms = [
    {
      id: GD_ROOM,
      room_type: "direct",
      room_status: "active",
      is_readonly: false,
      deleted_at: null,
      direct_key: `${VIEWER}:${PEER}`,
      chat_domain: "general_direct",
      domain_identity_key: `general_direct:${VIEWER}:${PEER}`,
    },
    {
      id: TRADE_ROOM,
      room_type: "direct",
      room_status: "active",
      is_readonly: false,
      deleted_at: null,
      direct_key: `trade:item-1:${PEER}:${VIEWER}`,
      chat_domain: "trade",
      domain_identity_key: `trade:item-1:${PEER}:${VIEWER}`,
    },
  ];
  tables.community_messenger_participants = [
    { room_id: GD_ROOM, user_id: VIEWER, role: "owner", left_at: null, is_archived: false },
    { room_id: GD_ROOM, user_id: PEER, role: "member", left_at: null, is_archived: false },
    { room_id: TRADE_ROOM, user_id: VIEWER, role: "member", left_at: null, is_archived: false },
    { room_id: TRADE_ROOM, user_id: PEER, role: "owner", left_at: null, is_archived: false },
  ];
}

function participant(roomId: string, userId: string): Row | undefined {
  return tables.community_messenger_participants!.find((r) => r.room_id === roomId && r.user_id === userId);
}

describe("evaluateHistoricRedialRoom (pure)", () => {
  const base = {
    viewerUserId: VIEWER,
    peerUserId: PEER,
    room: { room_type: "direct", room_status: "active", is_readonly: false, deleted_at: null },
    isGroupRoom: false,
    quarantined: false,
    domainEnvelopePresent: true,
    participants: [
      { user_id: VIEWER, left_at: null },
      { user_id: PEER, left_at: null },
    ],
  };

  it("callable when room active and both parties are active participants", () => {
    expect(evaluateHistoricRedialRoom(base)).toEqual({ callable: true });
  });

  it.each([
    [{ room: null }, "room_not_found"],
    [{ room: { ...base.room, deleted_at: "2026-01-01" } }, "room_deleted"],
    [{ quarantined: true }, "call_room_quarantined"],
    [{ domainEnvelopePresent: false }, "room_domain_required"],
    [{ room: { ...base.room, is_readonly: true } }, "room_unavailable"],
    [{ room: { ...base.room, room_status: "blocked" } }, "room_unavailable"],
    [{ participants: [{ user_id: PEER, left_at: null }] }, "viewer_not_participant"],
    [
      { participants: [{ user_id: VIEWER, left_at: "2026-01-01" }, { user_id: PEER, left_at: null }] },
      "viewer_not_participant",
    ],
    [{ participants: [{ user_id: VIEWER, left_at: null }] }, "peer_not_participant"],
  ] as const)("rejects %o → %s", (patch, reason) => {
    expect(evaluateHistoricRedialRoom({ ...base, ...(patch as object) })).toEqual({ callable: false, reason });
  });

  it("group rooms do not require the peer to be a member", () => {
    expect(
      evaluateHistoricRedialRoom({ ...base, isGroupRoom: true, participants: [{ user_id: VIEWER, left_at: null }] })
    ).toEqual({ callable: true });
  });
});

describe("resolveCommunityMessengerRedialRoom (server)", () => {
  beforeEach(seed);

  it("keeps a still-callable trade room (domain preserved)", async () => {
    const result = await resolveCommunityMessengerRedialRoom({
      userId: VIEWER,
      peerUserId: PEER,
      historicRoomId: TRADE_ROOM,
    });
    expect(result).toEqual({ ok: true, roomId: TRADE_ROOM, source: "historic_room" });
  });

  it("falls back to the canonical general direct room when the viewer is no longer a participant", async () => {
    tables.community_messenger_participants = tables.community_messenger_participants!.filter(
      (r) => !(r.room_id === TRADE_ROOM && r.user_id === VIEWER)
    );
    const result = await resolveCommunityMessengerRedialRoom({
      userId: VIEWER,
      peerUserId: PEER,
      historicRoomId: TRADE_ROOM,
    });
    expect(result).toEqual({
      ok: true,
      roomId: GD_ROOM,
      source: "canonical_direct",
      historicRejectReason: "viewer_not_participant",
    });
  });

  it("re-admits the viewer into the canonical direct room when their participant row is missing", async () => {
    tables.community_messenger_participants = tables.community_messenger_participants!.filter(
      (r) => !(r.room_id === GD_ROOM && r.user_id === VIEWER)
    );
    const result = await resolveCommunityMessengerRedialRoom({
      userId: VIEWER,
      peerUserId: PEER,
      historicRoomId: GD_ROOM,
    });
    expect(result).toEqual({
      ok: true,
      roomId: GD_ROOM,
      source: "canonical_direct",
      historicRejectReason: "viewer_not_participant",
    });
    expect(participant(GD_ROOM, VIEWER)).toEqual(expect.objectContaining({ left_at: null }));
  });

  it("re-admits a left (left_at) viewer and revives an archived canonical room", async () => {
    Object.assign(participant(GD_ROOM, VIEWER)!, { left_at: "2026-05-01T00:00:00.000Z", is_archived: true });
    const result = await resolveCommunityMessengerRedialRoom({
      userId: VIEWER,
      peerUserId: PEER,
      historicRoomId: GD_ROOM,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.roomId).toBe(GD_ROOM);
    expect(participant(GD_ROOM, VIEWER)).toEqual(expect.objectContaining({ left_at: null, is_archived: false }));
  });

  it("peer-only redial (legacy log without room) ensures the canonical room", async () => {
    const result = await resolveCommunityMessengerRedialRoom({ userId: VIEWER, peerUserId: PEER, historicRoomId: null });
    expect(result).toEqual({ ok: true, roomId: GD_ROOM, source: "canonical_direct" });
  });

  it("room-only redial with a non-callable room fails explicitly (no guessing)", async () => {
    tables.community_messenger_rooms!.find((r) => r.id === TRADE_ROOM)!.is_readonly = true;
    const result = await resolveCommunityMessengerRedialRoom({ userId: VIEWER, peerUserId: null, historicRoomId: TRADE_ROOM });
    expect(result).toEqual({ ok: false, error: "room_unavailable" });
  });

  it("runs the canonical-ensure policy gate only when the canonical path is needed", async () => {
    const gate = vi.fn(async () => ({ ok: false as const, error: "profile_incomplete" }));
    const kept = await resolveCommunityMessengerRedialRoom({
      userId: VIEWER,
      peerUserId: PEER,
      historicRoomId: TRADE_ROOM,
      beforeEnsureCanonical: gate,
    });
    expect(kept.ok).toBe(true);
    expect(gate).not.toHaveBeenCalled();
    const blocked = await resolveCommunityMessengerRedialRoom({
      userId: VIEWER,
      peerUserId: PEER,
      historicRoomId: null,
      beforeEnsureCanonical: gate,
    });
    expect(blocked).toEqual({ ok: false, error: "profile_incomplete" });
    expect(gate).toHaveBeenCalledTimes(1);
  });
});
