import type { OwnerStorePagePhase } from "@/components/business/owner/OwnerStorePagePhaseGate";

export type OwnerStoreLoadPhase =
  | { kind: "loading" }
  | { kind: "need_store_id" }
  | { kind: "unauth" }
  | { kind: "config" }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "ok" };

export function toOwnerStorePagePhase(
  phase: OwnerStoreLoadPhase,
  opts?: { profile?: boolean },
): OwnerStorePagePhase {
  if (phase.kind === "ok") return { kind: "ok" };
  if (phase.kind === "need_store_id") {
    return { kind: "need_store_id", profile: opts?.profile };
  }
  return phase;
}
