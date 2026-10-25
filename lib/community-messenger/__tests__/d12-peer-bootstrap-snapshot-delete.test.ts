import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** 1단계 결함 D-12 ① (2026-10-26): 읽음 후 1:1 상대의 저장 스냅샷 행 삭제(재계산 예약 없음). */

const calls: Array<{ table: string; op: string; filters: Array<[string, string, unknown]> }> = [];
let participantRows: Array<{ user_id: string }> = [];

function builder(table: string) {
  const rec = { table, op: "select", filters: [] as Array<[string, string, unknown]> };
  calls.push(rec);
  const b: Record<string, unknown> = {};
  const chain = (name: string) => (col: string, val?: unknown) => {
    rec.filters.push([name, col, val]);
    return b;
  };
  b.select = () => b;
  b.delete = () => {
    rec.op = "delete";
    return b;
  };
  b.eq = chain("eq");
  b.neq = chain("neq");
  b.is = chain("is");
  b.limit = () => Promise.resolve({ data: participantRows, error: null });
  b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res);
  return b;
}

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({ from: (t: string) => builder(t) }),
}));
vi.mock("@/lib/community-messenger/room-bootstrap-snapshot-refresh", () => ({
  scheduleRoomBootstrapSnapshotRefreshForRoom: vi.fn(),
}));

const ROOM = "c202326f-8109-4ce4-aa61-394f0a799e7d";
const READER = "edc8c2f0-2673-4ca8-9d63-92a609d556f4";
const PEER = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";

describe("D-12 ① 상대 저장 스냅샷 삭제", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("1:1(상대 1명): 상대 user_id+room_id 행만 삭제, 재계산 예약 없음", async () => {
    participantRows = [{ user_id: PEER }];
    const { deleteDirectPeerRoomBootstrapSnapshotRows } = await import(
      "@/lib/community-messenger/room-bootstrap-snapshot-cache"
    );
    const refresh = await import("@/lib/community-messenger/room-bootstrap-snapshot-refresh");
    expect(await deleteDirectPeerRoomBootstrapSnapshotRows(ROOM, READER)).toBe(PEER);
    const del = calls.find((c) => c.op === "delete");
    expect(del?.table).toBe("community_messenger_room_bootstrap_snapshots");
    expect(del?.filters).toEqual([
      ["eq", "user_id", PEER],
      ["eq", "room_id", ROOM],
    ]);
    expect(refresh.scheduleRoomBootstrapSnapshotRefreshForRoom).not.toHaveBeenCalled();
  });

  it("단체방(상대 2명 이상)·상대 없음: 삭제하지 않음", async () => {
    const { deleteDirectPeerRoomBootstrapSnapshotRows } = await import(
      "@/lib/community-messenger/room-bootstrap-snapshot-cache"
    );
    participantRows = [{ user_id: PEER }, { user_id: "x" }];
    expect(await deleteDirectPeerRoomBootstrapSnapshotRows(ROOM, READER)).toBeNull();
    participantRows = [];
    expect(await deleteDirectPeerRoomBootstrapSnapshotRows(ROOM, READER)).toBeNull();
    expect(calls.some((c) => c.op === "delete")).toBe(false);
  });

  it("읽음 PATCH: 실제 읽음이 앞으로 간 경우(broadcastSkipped 아님)에만 응답 뒤 호출 (계약)", () => {
    const route = readFileSync(join(process.cwd(), "app/api/community-messenger/rooms/[roomId]/route.ts"), "utf8");
    const i = route.indexOf("if (result.ok && !result.broadcastSkipped) {");
    const j = route.indexOf("deleteDirectPeerRoomBootstrapSnapshotRows(roomId, auth.userId)");
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(route.slice(i, j)).toContain("after(async () => {");
  });
});
