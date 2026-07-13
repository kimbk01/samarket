import { describe, expect, it } from "vitest";
import { shouldApplyColdBootstrapComplete } from "@/lib/community-messenger/home/use-community-messenger-home-bootstrap";

/**
 * COLD_COMPLETE_APPLY_SUPERSEDED_BY_HOME_SYNC_REQUEST 회귀 방지.
 *
 * 실제 훅의 generation 계약을 최소 시뮬레이션으로 재현한다.
 * - `applyGen`  : non-silent cold complete bootstrap(lite/full) apply 전용 generation (bootstrapApplyGenRef)
 * - `refreshReqId` : 공유 refresh generation (refreshRequestIdRef) — home_sync/silent 도 증가시킨다.
 *
 * 핵심: silent home_sync refresh 는 refreshReqId 만 올리고 applyGen 은 올리지 않으므로,
 * 아직 유효한 cold complete apply 를 stale 로 드롭하지 못한다.
 */
type Room = { id: string; unread?: number; lastMessageAt?: string };

class ColdBootstrapSim {
  applyGen = 0;
  refreshReqId = 0;
  store: Room[] = [];
  fullCache: Room[] = [];

  /** non-silent cold complete refresh 시작 — apply-gen 과 shared reqId 모두 증가 */
  beginColdComplete(): { applyGen: number; reqId: number } {
    this.refreshReqId += 1;
    this.applyGen += 1;
    return { applyGen: this.applyGen, reqId: this.refreshReqId };
  }

  /** silent home_sync refresh 시작 — shared reqId 만 증가 (apply-gen 불변) */
  beginHomeSync(): { reqId: number } {
    this.refreshReqId += 1;
    return { reqId: this.refreshReqId };
  }

  /** cold complete(lite/full) 응답 store apply — 실제 훅 guard 와 동일 판정 */
  applyComplete(capturedApplyGen: number, rooms: Room[], aborted = false): boolean {
    if (
      !shouldApplyColdBootstrapComplete({
        capturedApplyGen,
        currentApplyGen: this.applyGen,
        aborted,
      })
    ) {
      return false;
    }
    this.store = rooms.slice();
    this.fullCache = rooms.slice();
    return true;
  }

  /** home_sync capped partial_upsert — home_sync domain(shared reqId) guard, 축소 금지 */
  applyHomeSyncPartialUpsert(capturedReqId: number, incoming: Room[]): boolean {
    if (capturedReqId !== this.refreshReqId) return false;
    const byId = new Map(this.store.map((r) => [r.id, r]));
    for (const inc of incoming) {
      const prev = byId.get(inc.id);
      byId.set(inc.id, prev ? { ...prev, ...inc } : inc);
    }
    this.store = [...byId.values()];
    return true;
  }
}

function rooms(n: number, prefix = "r"): Room[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, unread: 0 }));
}

describe("shouldApplyColdBootstrapComplete", () => {
  it("apply-gen 이 최신이면 apply", () => {
    expect(
      shouldApplyColdBootstrapComplete({ capturedApplyGen: 1, currentApplyGen: 1, aborted: false })
    ).toBe(true);
  });

  it("home_sync 로 shared reqId 만 올라도 apply-gen 이 같으면 apply (드롭 금지)", () => {
    expect(
      shouldApplyColdBootstrapComplete({ capturedApplyGen: 1, currentApplyGen: 1, aborted: false })
    ).toBe(true);
  });

  it("더 새로운 cold complete 가 apply-gen 을 올리면 이전 complete 는 drop", () => {
    expect(
      shouldApplyColdBootstrapComplete({ capturedApplyGen: 1, currentApplyGen: 2, aborted: false })
    ).toBe(false);
  });

  it("aborted 면 drop", () => {
    expect(
      shouldApplyColdBootstrapComplete({ capturedApplyGen: 3, currentApplyGen: 3, aborted: true })
    ).toBe(false);
  });
});

describe("Cold Terminal Set Race — generation contract", () => {
  it("8.1 race order 1: home_sync capped apply → lite/full complete apply → terminal 53", () => {
    const sim = new ColdBootstrapSim();
    const cold = sim.beginColdComplete();
    // critical 이후 home_sync capped(29) 가 먼저 도착
    const hs = sim.beginHomeSync();
    expect(sim.applyHomeSyncPartialUpsert(hs.reqId, rooms(29))).toBe(true);
    expect(sim.store.length).toBe(29);
    // 이어서 cold complete(53) 도착 — apply-gen 은 여전히 최신
    expect(sim.applyComplete(cold.applyGen, rooms(53))).toBe(true);
    expect(sim.store.length).toBe(53);
    expect(sim.fullCache.length).toBe(53);
  });

  it("8.2 race order 2: complete 시작 → home_sync refresh reqId 증가 → complete apply drop 금지 → 53", () => {
    const sim = new ColdBootstrapSim();
    const cold = sim.beginColdComplete(); // applyGen=1, reqId=1
    // complete 응답 대기 중 home_sync followup 이 shared reqId 증가
    sim.beginHomeSync(); // reqId=2, applyGen 불변=1
    // 늦게 도착한 cold complete — 과거엔 reqId 불일치로 drop 됐으나 이제 apply-gen 으로 생존
    expect(sim.applyComplete(cold.applyGen, rooms(53))).toBe(true);
    expect(sim.store.length).toBe(53);
    expect(sim.fullCache.length).toBe(53);
  });

  it("8.3 race order 3: complete apply → home_sync partial_upsert → 53 유지 + 최신 필드 반영", () => {
    const sim = new ColdBootstrapSim();
    const cold = sim.beginColdComplete();
    expect(sim.applyComplete(cold.applyGen, rooms(53))).toBe(true);
    expect(sim.store.length).toBe(53);
    // home_sync capped 가 r0 unread 갱신 — 축소 없이 필드만 반영
    const hs = sim.beginHomeSync();
    expect(
      sim.applyHomeSyncPartialUpsert(hs.reqId, [{ id: "r0", unread: 7 }])
    ).toBe(true);
    expect(sim.store.length).toBe(53);
    expect(sim.store.find((r) => r.id === "r0")?.unread).toBe(7);
  });

  it("8.4 newer complete wins: gen1 늦게 도착하면 drop", () => {
    const sim = new ColdBootstrapSim();
    const gen1 = sim.beginColdComplete(); // applyGen=1
    const gen2 = sim.beginColdComplete(); // applyGen=2
    // gen2 먼저 정착
    expect(sim.applyComplete(gen2.applyGen, rooms(53))).toBe(true);
    expect(sim.store.length).toBe(53);
    // gen1 늦게 도착 → drop
    expect(sim.applyComplete(gen1.applyGen, rooms(10))).toBe(false);
    expect(sim.store.length).toBe(53);
  });

  it("8.5 newer home_sync wins: 기존 home_sync stale guard 유지", () => {
    const sim = new ColdBootstrapSim();
    const cold = sim.beginColdComplete();
    sim.applyComplete(cold.applyGen, rooms(53));
    const hs1 = sim.beginHomeSync(); // reqId=2
    const hs2 = sim.beginHomeSync(); // reqId=3
    // 늦게 도착한 hs1 은 stale → drop
    expect(sim.applyHomeSyncPartialUpsert(hs1.reqId, [{ id: "r0", unread: 1 }])).toBe(false);
    // hs2 는 적용
    expect(sim.applyHomeSyncPartialUpsert(hs2.reqId, [{ id: "r0", unread: 2 }])).toBe(true);
    expect(sim.store.find((r) => r.id === "r0")?.unread).toBe(2);
    expect(sim.store.length).toBe(53);
  });

  it("8.6 cache parity: complete 53 apply 후 store 53 = full cache 53", () => {
    const sim = new ColdBootstrapSim();
    const cold = sim.beginColdComplete();
    sim.applyComplete(cold.applyGen, rooms(53));
    expect(sim.store.length).toBe(53);
    expect(sim.fullCache.length).toBe(53);
    // 이후 home_sync capped 가 와도 둘 다 53 유지
    const hs = sim.beginHomeSync();
    sim.applyHomeSyncPartialUpsert(hs.reqId, rooms(29));
    expect(sim.store.length).toBe(53);
    expect(sim.fullCache.length).toBe(53);
  });
});
