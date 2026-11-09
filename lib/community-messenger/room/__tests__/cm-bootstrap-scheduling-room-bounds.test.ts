import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CM_BOOTSTRAP_ROOM_RECORDS_MAX,
  cmStrictEffectRunProbe,
  markCmBootstrapFetchResolve,
  markCmBootstrapFetchScheduled,
  markRoomPrefetchAttempt,
  markRoomPrefetchComplete,
  readCmBootstrapRoomRecordSizes,
  recordCmBootstrapTriggerChain,
  releaseCmBootstrapRoomLock,
  tryAcquireCmBootstrapRoomLock,
} from "@/lib/community-messenger/room/cm-bootstrap-scheduling";

/** 오래 켜 둔 앱에서 방을 계속 드나드는 흐름 — 방마다 트리거·스케줄·잠금·프리페치·StrictMode 탐침 1회 */
function visitRoom(id: string) {
  markRoomPrefetchAttempt(id);
  markRoomPrefetchComplete(id, true);
  const lock = tryAcquireCmBootstrapRoomLock(id, false);
  recordCmBootstrapTriggerChain({ trigger_source: "route_change", roomId: id, tier: "silent_delta" });
  markCmBootstrapFetchScheduled(id, 0);
  markCmBootstrapFetchResolve(id);
  if (lock.acquired) releaseCmBootstrapRoomLock(id);
  cmStrictEffectRunProbe("room-entry", id);
}

describe("cm-bootstrap-scheduling — 방별 기록 상한", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("상한의 3배 방을 드나들어도 모든 방별 Map 이 상한 이하, 최근 방 기록은 유지·가장 오래된 방은 잊는다", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const total = CM_BOOTSTRAP_ROOM_RECORDS_MAX * 3;
    for (let i = 0; i < total; i += 1) visitRoom(`room-${i}`);

    const sizes = readCmBootstrapRoomRecordSizes();
    for (const [name, size] of Object.entries(sizes)) {
      expect(size, name).toBeLessThanOrEqual(CM_BOOTSTRAP_ROOM_RECORDS_MAX);
    }
    expect(sizes.lastTriggerAtByRoom).toBe(CM_BOOTSTRAP_ROOM_RECORDS_MAX);
    expect(sizes.strictEffectRuns).toBe(CM_BOOTSTRAP_ROOM_RECORDS_MAX);
    expect(sizes.prefetchInflightRooms).toBe(0);

    // 최근 방: 직전 트리거 기록이 남아 있다 / 쿨다운 기억으로 프리페치 재시도 거절
    const recent = `room-${total - 1}`;
    expect(recordCmBootstrapTriggerChain({ trigger_source: "focus", roomId: recent, tier: "silent_delta" }).since_last_trigger_ms).not.toBeNull();
    expect(markRoomPrefetchAttempt(recent)).toBe(false);
    // 가장 오래된 방: 잊혀 「직전 기록 없음」에서 다시 시작
    expect(recordCmBootstrapTriggerChain({ trigger_source: "focus", roomId: "room-0", tier: "silent_delta" }).since_last_trigger_ms).toBeNull();
    expect(markRoomPrefetchAttempt("room-0")).toBe(true);
    markRoomPrefetchComplete("room-0", false);
  });

  it("진행 중 잠금은 다른 방이 상한 미만으로 오가는 동안 유지돼 중복 부트스트랩을 막는다", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(tryAcquireCmBootstrapRoomLock("busy-room", false).acquired).toBe(true);
    for (let i = 0; i < CM_BOOTSTRAP_ROOM_RECORDS_MAX - 1; i += 1) visitRoom(`other-${i}`);
    const again = tryAcquireCmBootstrapRoomLock("busy-room", false);
    expect(again.acquired).toBe(false);
    expect(again.dropped).toBe(true);
    releaseCmBootstrapRoomLock("busy-room");
  });
});
