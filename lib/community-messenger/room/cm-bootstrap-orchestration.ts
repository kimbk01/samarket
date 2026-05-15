import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { cmDevHmrFlags } from "@/lib/community-messenger/dev/cm-event-loop-dev";
import { getSingleFlightPromise } from "@/lib/http/run-single-flight";

/** 동일 room+tier bootstrap 최소 간격 */
export const CM_BOOTSTRAP_DEBOUNCE_MS = 1_200;
/** 최근 성공 snapshot 재사용 TTL — fetch skip */
export const CM_BOOTSTRAP_STALE_TTL_MS = 5_000;

export type CmBootstrapTier =
  | "silent_delta"
  | "critical_block"
  | "instant_legacy"
  | "lite"
  | "other";

export type CmBootstrapStaleEntry = {
  expiresAt: number;
  snap: CommunityMessengerRoomSnapshot;
  bootstrapTierHdr: string;
  isSilentDelta: boolean;
};

const lastBootstrapAtByRoomTier = new Map<string, number>();
const debounceTimerByRoomTier = new Map<string, ReturnType<typeof setTimeout>>();
const staleSnapshotByFlightKey = new Map<string, CmBootstrapStaleEntry>();

let lastModuleEvalPerf =
  typeof performance !== "undefined" ? performance.now() : Date.now();

const modHot =
  typeof module !== "undefined"
    ? (module as unknown as { hot?: { accept?: (cb: () => void) => void } }).hot
    : undefined;
if (modHot?.accept) {
  try {
    modHot.accept(() => {
      lastModuleEvalPerf = typeof performance !== "undefined" ? performance.now() : Date.now();
    });
  } catch {
    /* ignore */
  }
}

export function bootstrapTierFromQuery(query: string): CmBootstrapTier {
  if (query.includes("snapshotTier=silent_delta")) return "silent_delta";
  if (query.includes("cmReqSrc=room_client_block")) return "critical_block";
  if (query.includes("cmReqSrc=room_client_legacy")) return "instant_legacy";
  if (query.includes("mode=lite")) return "lite";
  return "other";
}

export function roomTierKey(roomId: string, tier: CmBootstrapTier): string {
  return `${roomId.trim()}:${tier}`;
}

export function devBootstrapHmrFlags(): {
  dev_hmr_active: boolean;
  dev_fast_refresh_detected: boolean;
  ms_since_module_eval: number;
} {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const hot = typeof module !== "undefined" && Boolean((module as { hot?: unknown }).hot);
  const msSinceEval = Math.round(now - lastModuleEvalPerf);
  return {
    dev_hmr_active: hot,
    dev_fast_refresh_detected: hot && msSinceEval < 800,
    ms_since_module_eval: msSinceEval,
  };
}

export function logCmBootstrapTrigger(payload: {
  reason: string;
  roomId: string;
  tier: CmBootstrapTier;
  since_last_bootstrap_ms: number | null;
  inflight_existing: boolean;
  debounced: boolean;
  skipped_reason: string | null;
  flight_key?: string;
}): void {
  const hmr = { ...devBootstrapHmrFlags(), ...cmDevHmrFlags() };
  const deduped = payload.skipped_reason === "stale_reuse";
  console.log("[cm-bootstrap-trigger]", {
    ...payload,
    ts: Date.now(),
    since_last_ms: payload.since_last_bootstrap_ms,
    inflight: payload.inflight_existing,
    deduped,
    ...hmr,
  });
}

export type CmBootstrapGateResult = {
  proceed: boolean;
  skippedReason: string | null;
  inflightExisting: boolean;
  debounced: boolean;
  sinceLastBootstrapMs: number | null;
  staleEntry: CmBootstrapStaleEntry | null;
};

export function evaluateCmBootstrapGate(args: {
  roomId: string;
  tier: CmBootstrapTier;
  flightKey: string;
  forceNetwork: boolean;
}): CmBootstrapGateResult {
  const rtKey = roomTierKey(args.roomId, args.tier);
  const now = Date.now();
  const lastAt = lastBootstrapAtByRoomTier.get(rtKey);
  const sinceLast = lastAt != null ? now - lastAt : null;
  const inflightExisting = Boolean(getSingleFlightPromise(args.flightKey));

  if (!args.forceNetwork) {
    const stale = staleSnapshotByFlightKey.get(args.flightKey);
    if (stale && stale.expiresAt > now) {
      return {
        proceed: false,
        skippedReason: "stale_reuse",
        inflightExisting,
        debounced: false,
        sinceLastBootstrapMs: sinceLast,
        staleEntry: stale,
      };
    }
    if (inflightExisting) {
      return {
        proceed: false,
        skippedReason: "inflight_join",
        inflightExisting: true,
        debounced: false,
        sinceLastBootstrapMs: sinceLast,
        staleEntry: null,
      };
    }
    if (sinceLast != null && sinceLast < CM_BOOTSTRAP_DEBOUNCE_MS) {
      return {
        proceed: false,
        skippedReason: "debounced",
        inflightExisting,
        debounced: true,
        sinceLastBootstrapMs: sinceLast,
        staleEntry: null,
      };
    }
  }

  lastBootstrapAtByRoomTier.set(rtKey, now);
  return {
    proceed: true,
    skippedReason: null,
    inflightExisting,
    debounced: false,
    sinceLastBootstrapMs: sinceLast,
    staleEntry: null,
  };
}

export function noteCmBootstrapCompleted(args: {
  roomId: string;
  tier: CmBootstrapTier;
  flightKey: string;
  snap: CommunityMessengerRoomSnapshot;
  bootstrapTierHdr: string;
}): void {
  const isSilentDelta = args.bootstrapTierHdr === "silent_delta" || args.tier === "silent_delta";
  staleSnapshotByFlightKey.set(args.flightKey, {
    expiresAt: Date.now() + CM_BOOTSTRAP_STALE_TTL_MS,
    snap: args.snap,
    bootstrapTierHdr: args.bootstrapTierHdr,
    isSilentDelta,
  });
  if (staleSnapshotByFlightKey.size > 400) {
    const cutoff = Date.now();
    for (const [k, v] of staleSnapshotByFlightKey) {
      if (v.expiresAt < cutoff || staleSnapshotByFlightKey.size > 300) staleSnapshotByFlightKey.delete(k);
      if (staleSnapshotByFlightKey.size <= 300) break;
    }
  }
}

export function scheduleCmBootstrapDebounceRetry(args: {
  roomId: string;
  tier: CmBootstrapTier;
  delayMs: number;
  run: () => void;
}): void {
  const rtKey = roomTierKey(args.roomId, args.tier);
  const prev = debounceTimerByRoomTier.get(rtKey);
  if (prev != null) clearTimeout(prev);
  const t = setTimeout(() => {
    debounceTimerByRoomTier.delete(rtKey);
    args.run();
  }, Math.max(1, args.delayMs));
  debounceTimerByRoomTier.set(rtKey, t);
}

export function clearCmBootstrapDebounceForRoom(roomId: string): void {
  const prefix = `${roomId.trim()}:`;
  for (const k of [...debounceTimerByRoomTier.keys()]) {
    if (k.startsWith(prefix)) {
      const t = debounceTimerByRoomTier.get(k);
      if (t != null) clearTimeout(t);
      debounceTimerByRoomTier.delete(k);
    }
  }
}
