"use client";

/**
 * DIBAY Messenger — Cutover Runtime Gate 클라이언트 singleton (SCAFFOLD).
 *
 * 서버 응답 envelope(`runtimeMeta.cmHomeCutoverGate`)를 받아 **버전 단조**로 적용하고,
 * `dispatch.mode`(shadow.ts) 와 read source(projection-source-flag.ts) 가 **동일한 최신 snapshot**을
 * 보도록 단일 상태를 제공한다.
 *
 * 안전 계약:
 *  - 기본 `LEGACY` (fail-closed). runtimeMeta 가 없으면 현재 Gate 유지.
 *  - read(CANONICAL/DUAL) 는 **seedComplete 이후에만** 켠다.
 *  - `gateVersion` 만 적용 순서 권위. incoming < current → 무시.
 *  - `kill` 은 version 과 무관하게 즉시 LEGACY (이후 낮은 version canonical 복원 금지).
 *  - Multi-tab Kill 전파는 제품 messenger bus 가 아닌 **전용 BroadcastChannel** 사용 (control-plane).
 *  - cohort 계산은 서버 전용 — 클라이언트에서 하지 않는다.
 */

import {
  cmHomeCutoverStateToDispatchRead,
  CM_HOME_CUTOVER_GATE_BROADCAST_CHANNEL,
  CM_HOME_CUTOVER_GATE_BROADCAST_EVENT,
  CM_HOME_CUTOVER_GATE_CHANGED_EVENT,
  CM_HOME_CUTOVER_GATE_RUNTIME_META_KEY,
  normalizeCmHomeCutoverPillarScope,
  type CmHomeCutoverDispatchMode,
  type CmHomeCutoverPillarScope,
  type CmHomeCutoverReadSource,
  type CmHomeCutoverState,
} from "@/lib/community-messenger/home/cm-home-cutover-gate-keys";

type IncomingGateMeta = {
  gateVersion: number;
  effectiveState: CmHomeCutoverState;
  kill: boolean;
  pillarScope: CmHomeCutoverPillarScope;
};

type GateClientState = {
  /** 적용된 최고 version */
  appliedVersion: number;
  /** kill 로 잠긴 상태 (더 높은 non-kill version 만 해제) */
  killed: boolean;
  /** kill 반영 전 target 상태 */
  targetState: CmHomeCutoverState;
  pillarScope: CmHomeCutoverPillarScope;
  /** 현재 generation 의 canonical store seed 완료 여부 */
  seedComplete: boolean;
  /** useSyncExternalStore 용 단조 revision */
  revision: number;
};

const state: GateClientState = {
  appliedVersion: -1,
  killed: false,
  targetState: "LEGACY",
  pillarScope: "all",
  seedComplete: false,
  revision: 0,
};

const listeners = new Set<() => void>();

function notify(): void {
  state.revision += 1;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event(CM_HOME_CUTOVER_GATE_CHANGED_EVENT));
    } catch {
      /* ignore */
    }
  }
}

export type CmHomeCutoverGateSnapshot = {
  gateVersion: number;
  effectiveState: CmHomeCutoverState;
  dispatch: CmHomeCutoverDispatchMode;
  /** seedComplete 반영 전 target read (SHADOW_ONLY=legacy). */
  targetRead: CmHomeCutoverReadSource;
  /** seedComplete 반영 후 실제 read. */
  read: CmHomeCutoverReadSource;
  kill: boolean;
  pillarScope: CmHomeCutoverPillarScope;
  seedComplete: boolean;
};

function currentEffectiveState(): CmHomeCutoverState {
  return state.killed ? "LEGACY" : state.targetState;
}

export function peekCmHomeCutoverGate(): CmHomeCutoverGateSnapshot {
  const effectiveState = currentEffectiveState();
  const { dispatch, read: targetRead } = cmHomeCutoverStateToDispatchRead(effectiveState);
  let read: CmHomeCutoverReadSource = "legacy";
  if (!state.killed && state.seedComplete) {
    read = targetRead;
  }
  return {
    gateVersion: state.appliedVersion < 0 ? 0 : state.appliedVersion,
    effectiveState,
    dispatch,
    targetRead,
    read,
    kill: state.killed,
    pillarScope: state.pillarScope,
    seedComplete: state.seedComplete,
  };
}

/** shadow.ts 런타임 dispatch mode 권위. */
export function resolveCmHomeCutoverDispatchMode(): CmHomeCutoverDispatchMode {
  return peekCmHomeCutoverGate().dispatch;
}

/** projection-source-flag read source 권위 (seed-gated). */
export function resolveCmHomeCutoverReadSource(): CmHomeCutoverReadSource {
  return peekCmHomeCutoverGate().read;
}

export function resolveCmHomeCutoverPillarScope(): CmHomeCutoverPillarScope {
  return peekCmHomeCutoverGate().pillarScope;
}

/** gate 가 read(canonical/dual) 를 목표로 하는지 (seed 무관). */
export function cmHomeCutoverGateWantsCanonicalRead(): boolean {
  const s = peekCmHomeCutoverGate();
  return !s.kill && (s.targetRead === "canonical" || s.targetRead === "dual");
}

function parseIncomingMeta(raw: unknown): IncomingGateMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const gateVersion = o.gateVersion;
  if (typeof gateVersion !== "number" || !Number.isFinite(gateVersion) || gateVersion < 0) return null;
  const stateStr = String(o.effectiveState ?? "").trim().toUpperCase();
  if (stateStr !== "LEGACY" && stateStr !== "SHADOW_ONLY" && stateStr !== "CANONICAL" && stateStr !== "DUAL") {
    return null;
  }
  return {
    gateVersion: Math.floor(gateVersion),
    effectiveState: stateStr as CmHomeCutoverState,
    kill: o.kill === true,
    pillarScope: normalizeCmHomeCutoverPillarScope(o.pillarScope),
  };
}

/**
 * 버전 단조 적용. 상태가 실제로 바뀌면 true.
 * kill 은 version 과 무관하게 즉시 LEGACY (더 높은 non-kill version 만 canonical 복원 가능).
 */
function applyIncomingMeta(meta: IncomingGateMeta): boolean {
  const beforeEffective = currentEffectiveState();
  const beforeKilled = state.killed;
  const beforeSeed = state.seedComplete;

  if (meta.kill) {
    state.appliedVersion = Math.max(state.appliedVersion, meta.gateVersion);
    if (!state.killed || state.targetState !== "LEGACY") {
      state.killed = true;
      state.targetState = "LEGACY";
      state.seedComplete = false;
    }
    state.pillarScope = meta.pillarScope;
    return beforeEffective !== "LEGACY" || !beforeKilled;
  }

  // non-kill
  if (meta.gateVersion < state.appliedVersion) return false; // 무시
  if (meta.gateVersion === state.appliedVersion) {
    // 동일 version 상태 충돌 → LEGACY 우선. kill 잠금 유지.
    if (state.killed) return false;
    if (meta.effectiveState !== state.targetState) {
      state.targetState = "LEGACY";
      state.seedComplete = false;
      return beforeEffective !== "LEGACY";
    }
    return false;
  }

  // strictly newer non-kill → 적용 (kill 해제, seed 재요구)
  state.appliedVersion = meta.gateVersion;
  state.killed = false;
  state.targetState = meta.effectiveState;
  state.pillarScope = meta.pillarScope;
  state.seedComplete = false;
  const changed =
    beforeEffective !== state.targetState || beforeKilled || beforeSeed !== state.seedComplete;
  return changed;
}

function broadcastGate(meta: IncomingGateMeta): void {
  if (typeof window === "undefined") return;
  const BC = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
  if (!BC) return;
  try {
    const ch = new BC(CM_HOME_CUTOVER_GATE_BROADCAST_CHANNEL);
    ch.postMessage({
      type: CM_HOME_CUTOVER_GATE_BROADCAST_EVENT,
      gateVersion: meta.gateVersion,
      effectiveState: meta.effectiveState,
      kill: meta.kill,
      pillarScope: meta.pillarScope,
    });
    ch.close();
  } catch {
    /* ignore */
  }
}

/**
 * 서버 응답 envelope 에서 gate 를 적용한다. runtimeMeta 없으면 no-op(현재 Gate 유지).
 * `fromPeer` 는 다른 탭 broadcast 재수신 — 재브로드캐스트 하지 않는다.
 */
export function applyCmHomeCutoverGateRuntimeMeta(runtimeMeta: unknown, opts?: { fromPeer?: boolean }): void {
  let raw: unknown = runtimeMeta;
  if (
    runtimeMeta &&
    typeof runtimeMeta === "object" &&
    CM_HOME_CUTOVER_GATE_RUNTIME_META_KEY in (runtimeMeta as object)
  ) {
    raw = (runtimeMeta as Record<string, unknown>)[CM_HOME_CUTOVER_GATE_RUNTIME_META_KEY];
  }
  const meta = parseIncomingMeta(raw);
  if (!meta) return; // gate 없음/malformed → 유지 (fail-closed)

  const changed = applyIncomingMeta(meta);
  // Kill 은 peer 로 즉시 전파 (로컬 발생분만).
  if (!opts?.fromPeer && meta.kill) broadcastGate(meta);
  if (changed) notify();
}

/** 응답 최상위 객체에서 runtimeMeta 를 꺼내 적용 (편의). */
export function applyCmHomeCutoverGateFromResponseJson(json: unknown): void {
  if (!json || typeof json !== "object") return;
  const runtimeMeta = (json as Record<string, unknown>).runtimeMeta;
  if (runtimeMeta == null) return; // gate 없는 응답 → 유지
  applyCmHomeCutoverGateRuntimeMeta(runtimeMeta);
}

function collectStoreRoomIds(peekState: () => { rooms: { keys: () => IterableIterator<string> } }): Set<string> {
  const out = new Set<string>();
  try {
    for (const id of peekState().rooms.keys()) out.add(String(id).trim().toLowerCase());
  } catch {
    /* ignore */
  }
  return out;
}

/**
 * 실제 네트워크 payload dispatch 이후 seedComplete 평가.
 *  - source 가 "cache" 면 무시 (synthetic/warm 은 canonical 승격 근거 아님).
 *  - gate 가 canonical/dual 목표 + shadow dispatch 일 때만 의미.
 *  - appliedRoomIds ⊆ canonical store (또는 빈 inbox) → seedComplete.
 */
export function noteCmHomeCutoverNetworkSeed(args: {
  source: string;
  appliedRoomIds: readonly string[];
  peekState: () => { rooms: { keys: () => IterableIterator<string> } };
}): void {
  if (args.source === "cache") return;
  const snapshot = peekCmHomeCutoverGate();
  if (snapshot.dispatch !== "shadow") return;
  if (!cmHomeCutoverGateWantsCanonicalRead()) return;
  if (state.seedComplete) return;

  const storeIds = collectStoreRoomIds(args.peekState);
  const applied = args.appliedRoomIds.map((id) => String(id).trim().toLowerCase()).filter(Boolean);
  const covered = applied.every((id) => storeIds.has(id)); // 빈 배열이면 true (빈 inbox)
  if (!covered) return;

  state.seedComplete = true;
  notify();
}

export function subscribeCmHomeCutoverGate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** useSyncExternalStore getSnapshot 용 단조 revision. */
export function getCmHomeCutoverGateRevision(): number {
  return state.revision;
}

let multiTabBound = false;
let boundChannel: BroadcastChannel | null = null;

/** Multi-tab Kill 전파 수신 시작 (홈 마운트 시 1회). */
export function startCmHomeCutoverGateMultiTab(): () => void {
  if (typeof window === "undefined") return () => {};
  if (multiTabBound) return () => {};
  const BC = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
  if (!BC) return () => {};
  try {
    boundChannel = new BC(CM_HOME_CUTOVER_GATE_BROADCAST_CHANNEL);
  } catch {
    return () => {};
  }
  multiTabBound = true;
  const onMsg = (e: MessageEvent) => {
    const d = e.data as Record<string, unknown> | null;
    if (!d || d.type !== CM_HOME_CUTOVER_GATE_BROADCAST_EVENT) return;
    applyCmHomeCutoverGateRuntimeMeta(
      {
        gateVersion: d.gateVersion,
        effectiveState: d.effectiveState,
        kill: d.kill,
        pillarScope: d.pillarScope,
      },
      { fromPeer: true }
    );
  };
  boundChannel.addEventListener("message", onMsg);
  return () => {
    try {
      boundChannel?.removeEventListener("message", onMsg);
      boundChannel?.close();
    } catch {
      /* ignore */
    }
    boundChannel = null;
    multiTabBound = false;
  };
}

/** 테스트 전용 — 상태 초기화. */
export function resetCmHomeCutoverGateForTests(): void {
  state.appliedVersion = -1;
  state.killed = false;
  state.targetState = "LEGACY";
  state.pillarScope = "all";
  state.seedComplete = false;
  state.revision = 0;
  listeners.clear();
  multiTabBound = false;
  boundChannel = null;
}
