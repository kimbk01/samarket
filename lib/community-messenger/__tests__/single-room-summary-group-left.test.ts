/**
 * 단건 방 요약(`home-summary`) — 그룹은 활성 참가(`left_at IS NULL`)만. 목록 누락 그룹 복구가 나간 그룹을 다시 넣지 않게 한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type TableResult = { data: unknown; error: unknown };
const tables: Record<string, TableResult> = {};

function builder(table: string) {
  const result = () => tables[table] ?? { data: null, error: null };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit", "neq", "is", "or", "filter", "match", "insert", "upsert", "delete", "update"]) {
    b[m] = () => b;
  }
  b.maybeSingle = async () => result();
  b.single = async () => result();
  b.then = (resolve: (v: TableResult) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve, reject);
  return b;
}

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: (table: string) => builder(table),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

import { getCommunityMessengerSingleRoomSummaryForViewer } from "@/lib/community-messenger/service";

const ROOM = "72a97f0f-65d9-4162-bae1-de33f0c30090";
const ME = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";

function setRoom(roomType: string, leftAt: string | null) {
  tables.community_messenger_rooms = {
    data: [{ id: ROOM, room_type: roomType, title: "B2B TEST", last_message_at: "2026-11-05T13:55:43Z" }],
    error: null,
  };
  tables.community_messenger_participants = {
    data: [{ id: "p1", room_id: ROOM, user_id: ME, role: "member", left_at: leftAt }],
    error: null,
  };
}

describe("getCommunityMessengerSingleRoomSummaryForViewer — 그룹 나간 참가자", () => {
  beforeEach(() => {
    for (const k of Object.keys(tables)) delete tables[k];
  });

  it.each(["private_group", "open_group"])("%s — left_at 이 있으면 요약을 주지 않는다", async (roomType) => {
    setRoom(roomType, "2026-11-05T14:00:00Z");
    expect(await getCommunityMessengerSingleRoomSummaryForViewer(ME, ROOM)).toBeNull();
  });

  it("활성 참가자는 요약을 받는다", async () => {
    setRoom("private_group", null);
    expect((await getCommunityMessengerSingleRoomSummaryForViewer(ME, ROOM))?.id).toBe(ROOM);
  });

  it("참가 행이 없으면 요약을 주지 않는다", async () => {
    setRoom("private_group", null);
    tables.community_messenger_participants = { data: [], error: null };
    expect(await getCommunityMessengerSingleRoomSummaryForViewer(ME, ROOM)).toBeNull();
  });
});
