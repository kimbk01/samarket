import { beforeEach, describe, expect, it } from "vitest";
import {
  clearBootstrapCache,
  cmWarmNetworkPayloadFingerprint,
  cmWarmNetworkRoomIdsFingerprint,
  consumeWarmNetworkProvenance,
  peekWarmNetworkProvenance,
  primeBootstrapCache,
  primeMessengerBootstrapFull,
  recordWarmNetworkProvenance,
  resetWarmNetworkProvenanceForTests,
  type CmWarmNetworkProvenanceSlot,
} from "@/lib/community-messenger/bootstrap-cache";
import {
  applyCmHomeCutoverGateRuntimeMeta,
  noteCmHomeCutoverNetworkSeed,
  peekCmHomeCutoverGate,
  resetCmHomeCutoverGateForTests,
} from "@/lib/community-messenger/home/cm-home-cutover-gate-client";
import { CM_HOME_CUTOVER_GATE_RUNTIME_META_KEY } from "@/lib/community-messenger/home/cm-home-cutover-gate-keys";
import type {
  CmHomeCutoverState,
  CmHomeCutoverPillarScope,
} from "@/lib/community-messenger/home/cm-home-cutover-gate-keys";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

type Room = Pick<CommunityMessengerRoomSummary, "id">;

function rooms(n: number, prefix = "r"): Room[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}` }));
}

function bootstrapFromRooms(chats: Room[]): CommunityMessengerBootstrap {
  return {
    me: { id: "user-a" },
    tabs: { chats: chats.length, groups: 0, calls: 0, friends: 0 },
    chats,
    groups: [],
    friends: [],
    following: [],
    hidden: [],
    blocked: [],
    discoverableGroups: [],
    requests: [],
    calls: [],
  } as unknown as CommunityMessengerBootstrap;
}

function applyGate(meta: {
  gateVersion: number;
  effectiveState: CmHomeCutoverState;
  kill?: boolean;
  pillarScope?: CmHomeCutoverPillarScope;
}): void {
  applyCmHomeCutoverGateRuntimeMeta({
    [CM_HOME_CUTOVER_GATE_RUNTIME_META_KEY]: {
      gateVersion: meta.gateVersion,
      effectiveState: meta.effectiveState,
      kill: meta.kill ?? false,
      pillarScope: meta.pillarScope ?? "all",
    },
  });
}

function peekStateFor(ids: readonly string[]): () => { rooms: { keys: () => IterableIterator<string> } } {
  const map = new Map<string, boolean>();
  for (const id of ids) map.set(String(id).trim().toLowerCase(), true);
  return () => ({ rooms: map });
}

/** production `seedCanonicalFromTrustedFullProvenance` 와 동일한 결정 로직을 테스트에서 재현. */
function trySeedFullFromProvenance(slot: CmWarmNetworkProvenanceSlot, applied: Room[]): void {
  const gate = peekCmHomeCutoverGate();
  if (gate.kill || gate.dispatch !== "shadow") return;
  if (!(gate.targetRead === "canonical" || gate.targetRead === "dual")) return;
  const roomIdsFingerprint = cmWarmNetworkRoomIdsFingerprint(applied);
  const payloadFingerprint = cmWarmNetworkPayloadFingerprint(applied);
  const prov = consumeWarmNetworkProvenance(slot, {
    gateVersion: gate.gateVersion,
    kill: gate.kill,
    dispatch: gate.dispatch,
    wantsCanonicalRead: true,
    payloadFingerprint,
    roomIdsFingerprint,
  });
  if (!prov || prov.tier === "critical") return;
  noteCmHomeCutoverNetworkSeed({
    source: prov.tier,
    appliedRoomIds: applied.map((r) => r.id),
    peekState: peekStateFor(applied.map((r) => r.id)),
  });
}

function recordFull(tier: "critical" | "lite" | "full", gateVersion: number, applied: Room[]): void {
  recordWarmNetworkProvenance("full", {
    tier,
    gateVersion,
    payloadFingerprint: cmWarmNetworkPayloadFingerprint(applied),
    roomIdsFingerprint: cmWarmNetworkRoomIdsFingerprint(applied),
  });
}

describe("warm network provenance — bootstrap-cache", () => {
  beforeEach(() => {
    clearBootstrapCache();
    resetWarmNetworkProvenanceForTests();
    resetCmHomeCutoverGateForTests();
  });

  it("1) 실제 network record 만 provenance 생성", () => {
    const r = rooms(3);
    recordFull("lite", 1, r);
    const prov = peekWarmNetworkProvenance("full");
    expect(prov?.source).toBe("actual_network");
    expect(prov?.tier).toBe("lite");
    expect(prov?.consumed).toBe(false);
  });

  it("2) prime/sessionStorage 복원 경로는 provenance 를 만들지 않는다", () => {
    primeMessengerBootstrapFull(bootstrapFromRooms(rooms(3)));
    expect(peekWarmNetworkProvenance("full")).toBeNull();
  });

  it("3) synthetic prime(record 없음)은 provenance 없음", () => {
    primeBootstrapCache(bootstrapFromRooms(rooms(2)));
    expect(peekWarmNetworkProvenance("full")).toBeNull();
  });

  it("4) non-network prime 이 동일 slot 기존 provenance 를 clear", () => {
    recordFull("lite", 1, rooms(3));
    expect(peekWarmNetworkProvenance("full")).not.toBeNull();
    primeMessengerBootstrapFull(bootstrapFromRooms(rooms(3)));
    expect(peekWarmNetworkProvenance("full")).toBeNull();
  });

  it("10) one-shot 소비 후 재사용 불가", () => {
    const r = rooms(4);
    applyGate({ gateVersion: 2, effectiveState: "CANONICAL" });
    recordFull("lite", 2, r);
    const first = consumeWarmNetworkProvenance("full", {
      gateVersion: 2,
      kill: false,
      dispatch: "shadow",
      wantsCanonicalRead: true,
      payloadFingerprint: cmWarmNetworkPayloadFingerprint(r),
      roomIdsFingerprint: cmWarmNetworkRoomIdsFingerprint(r),
    });
    expect(first?.tier).toBe("lite");
    const second = consumeWarmNetworkProvenance("full", {
      gateVersion: 2,
      kill: false,
      dispatch: "shadow",
      wantsCanonicalRead: true,
      payloadFingerprint: cmWarmNetworkPayloadFingerprint(r),
      roomIdsFingerprint: cmWarmNetworkRoomIdsFingerprint(r),
    });
    expect(second).toBeNull();
  });

  it("fingerprint 는 roomId 순서와 무관하다", () => {
    const a = [{ id: "z" }, { id: "a" }, { id: "m" }];
    const b = [{ id: "a" }, { id: "m" }, { id: "z" }];
    expect(cmWarmNetworkRoomIdsFingerprint(a)).toBe(cmWarmNetworkRoomIdsFingerprint(b));
    expect(cmWarmNetworkPayloadFingerprint(a)).toBe(cmWarmNetworkPayloadFingerprint(b));
  });
});

describe("warm network provenance — seedComplete 전이(gate 연동)", () => {
  beforeEach(() => {
    clearBootstrapCache();
    resetWarmNetworkProvenanceForTests();
    resetCmHomeCutoverGateForTests();
  });

  it("6) final lite provenance 는 seedComplete 승격 가능", () => {
    const r = rooms(53);
    applyGate({ gateVersion: 5, effectiveState: "CANONICAL" });
    recordFull("lite", 5, r);
    expect(peekCmHomeCutoverGate().seedComplete).toBe(false);
    trySeedFullFromProvenance("full", r);
    const gate = peekCmHomeCutoverGate();
    expect(gate.seedComplete).toBe(true);
    expect(gate.read).toBe("canonical");
  });

  it("5) critical provenance 만으로는 seedComplete 불가", () => {
    const crit = rooms(30);
    applyGate({ gateVersion: 5, effectiveState: "CANONICAL" });
    // critical 은 "critical" slot 에만 기록 — "full" slot 소비는 null → seed 없음.
    recordWarmNetworkProvenance("critical", {
      tier: "critical",
      gateVersion: 5,
      payloadFingerprint: cmWarmNetworkPayloadFingerprint(crit),
      roomIdsFingerprint: cmWarmNetworkRoomIdsFingerprint(crit),
    });
    trySeedFullFromProvenance("full", crit);
    expect(peekCmHomeCutoverGate().seedComplete).toBe(false);
    expect(peekCmHomeCutoverGate().read).toBe("legacy");
  });

  it("critical tier 가 full slot 에 있어도 seed 하지 않는다", () => {
    const crit = rooms(30);
    applyGate({ gateVersion: 5, effectiveState: "CANONICAL" });
    recordFull("critical", 5, crit);
    trySeedFullFromProvenance("full", crit);
    expect(peekCmHomeCutoverGate().seedComplete).toBe(false);
  });

  it("11) critical(30) 은 seed 안 되고, 이후 full(53) 은 seed 된다", () => {
    const crit = rooms(30);
    const full = rooms(53);
    applyGate({ gateVersion: 7, effectiveState: "CANONICAL" });
    // critical 단계
    recordWarmNetworkProvenance("critical", {
      tier: "critical",
      gateVersion: 7,
      payloadFingerprint: cmWarmNetworkPayloadFingerprint(crit),
      roomIdsFingerprint: cmWarmNetworkRoomIdsFingerprint(crit),
    });
    trySeedFullFromProvenance("full", crit);
    expect(peekCmHomeCutoverGate().seedComplete).toBe(false);
    // full 승격 단계
    recordFull("lite", 7, full);
    trySeedFullFromProvenance("full", full);
    const gate = peekCmHomeCutoverGate();
    expect(gate.seedComplete).toBe(true);
    expect(gate.read).toBe("canonical");
  });

  it("7) payload fingerprint 불일치 시 거부", () => {
    const recorded = rooms(53);
    const applied = rooms(52); // 다른 room set
    applyGate({ gateVersion: 5, effectiveState: "CANONICAL" });
    recordFull("lite", 5, recorded);
    trySeedFullFromProvenance("full", applied);
    expect(peekCmHomeCutoverGate().seedComplete).toBe(false);
  });

  it("8) gateVersion 불일치 시 거부", () => {
    const r = rooms(10);
    applyGate({ gateVersion: 5, effectiveState: "CANONICAL" });
    recordFull("lite", 4, r); // provenance 는 낮은 version
    trySeedFullFromProvenance("full", r);
    expect(peekCmHomeCutoverGate().seedComplete).toBe(false);
  });

  it("9) kill/LEGACY 상태에서 provenance 거부 (seed 안 됨)", () => {
    const r = rooms(10);
    applyGate({ gateVersion: 5, effectiveState: "CANONICAL" });
    recordFull("lite", 5, r);
    // kill 발생 (동일 version)
    applyGate({ gateVersion: 5, effectiveState: "LEGACY", kill: true });
    trySeedFullFromProvenance("full", r);
    const gate = peekCmHomeCutoverGate();
    expect(gate.kill).toBe(true);
    expect(gate.seedComplete).toBe(false);
    expect(gate.read).toBe("legacy");
  });

  it("9b) consume 단계에서 kill snapshot 은 stale 로 삭제하고 null 반환", () => {
    const r = rooms(10);
    applyGate({ gateVersion: 5, effectiveState: "CANONICAL" });
    recordFull("lite", 5, r);
    const consumed = consumeWarmNetworkProvenance("full", {
      gateVersion: 5,
      kill: true,
      dispatch: "shadow",
      wantsCanonicalRead: false,
      payloadFingerprint: cmWarmNetworkPayloadFingerprint(r),
      roomIdsFingerprint: cmWarmNetworkRoomIdsFingerprint(r),
    });
    expect(consumed).toBeNull();
    expect(peekWarmNetworkProvenance("full")).toBeNull();
  });

  it("12) 낮은/동일 version provenance 가 Kill 을 되돌리지 못한다", () => {
    const r = rooms(10);
    applyGate({ gateVersion: 5, effectiveState: "CANONICAL" });
    applyGate({ gateVersion: 5, effectiveState: "LEGACY", kill: true });
    // kill 이후 동일 version canonical 재적용 시도 → 잠금 유지
    applyGate({ gateVersion: 5, effectiveState: "CANONICAL" });
    recordFull("lite", 5, r);
    trySeedFullFromProvenance("full", r);
    const gate = peekCmHomeCutoverGate();
    expect(gate.kill).toBe(true);
    expect(gate.read).toBe("legacy");
    expect(gate.seedComplete).toBe(false);
  });
});
