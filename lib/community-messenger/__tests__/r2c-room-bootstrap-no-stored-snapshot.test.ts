import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * R2-c (2026-10-27): 방 진입은 저장 스냅샷 행을 읽고 쓰지 않고 매번 통합 RPC 결과를 쓴다.
 * D-12(읽음 후 상대가 옛 읽음 위치를 받던 문제)는 저장 행이 없어져 구조적으로 사라진다 — 상대 행 삭제도 불필요.
 */

const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
const fromCalls: string[] = [];

function fakeSb(payload: unknown) {
  return {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { data: payload, error: null };
    }),
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      throw new Error(`unexpected table access: ${table}`);
    }),
  };
}

vi.mock("@/lib/community-messenger/room-bootstrap-snapshot-assemble", () => ({
  parseRoomBootstrapSnapshotRpcData: (data: unknown) => data,
  parseRoomBootstrapSnapshotPayload: (_uid: string, payload: { room?: unknown }) =>
    payload?.room ? { room: payload.room } : null,
}));

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("R2-c room bootstrap — no stored snapshot", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    fromCalls.length = 0;
  });

  it("each entry calls the unified RPC once and never touches the snapshot table", async () => {
    const { tryLoadRoomBootstrapCriticalWaveAFromSnapshot, ROOM_BOOTSTRAP_SNAPSHOT_RPC } = await import(
      "@/lib/community-messenger/room-bootstrap-snapshot"
    );
    const sb = fakeSb({ room: { id: "room-1" } });
    const first = await tryLoadRoomBootstrapCriticalWaveAFromSnapshot(sb as never, "user-1", "room-1", 24);
    const second = await tryLoadRoomBootstrapCriticalWaveAFromSnapshot(sb as never, "user-1", "room-1", 24);
    expect(first?.waveA).toEqual({ room: { id: "room-1" } });
    expect(second?.waveA).toEqual({ room: { id: "room-1" } });
    expect(rpcCalls.map((c) => c.fn)).toEqual([ROOM_BOOTSTRAP_SNAPSHOT_RPC, ROOM_BOOTSTRAP_SNAPSHOT_RPC]);
    expect(rpcCalls[0]?.args).toMatchObject({ p_user_id: "user-1", p_room_id: "room-1", p_snapshot_tier: "critical", p_message_limit: 24 });
    expect(fromCalls).toEqual([]);
  });

  it("RPC unavailable → null (caller keeps its legacy fallback)", async () => {
    const { tryLoadRoomBootstrapCriticalWaveAFromSnapshot } = await import(
      "@/lib/community-messenger/room-bootstrap-snapshot"
    );
    expect(await tryLoadRoomBootstrapCriticalWaveAFromSnapshot(fakeSb(null) as never, "user-1", "room-2", 24)).toBeNull();
  });

  it("events invalidate only the in-memory route cache (no row delete, no rebuild per participant)", () => {
    const cacheSrc = read("lib/community-messenger/room-bootstrap-snapshot-cache.ts");
    expect(cacheSrc).toContain("invalidateRoomBootstrapRouteCacheForRoom(rid)");
    expect(cacheSrc).not.toContain(".delete()");
    expect(cacheSrc).not.toContain("scheduleRoomBootstrapSnapshotRefresh");
  });

  it("read PATCH no longer deletes the peer's stored row (D-12 removed by design)", () => {
    const route = read("app/api/community-messenger/rooms/[roomId]/route.ts");
    expect(route).not.toContain("deleteDirectPeerRoomBootstrapSnapshotRows");
  });
});
