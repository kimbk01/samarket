/**
 * Phase 11C.5 — Layered Domain Cutover State (설계·검증만).
 * 실제 flag를 production ON으로 올리지 않음. 기본: 전 Layer off.
 *
 * Cutover 순서 (한 스위치 금지):
 * Read projection → Cache → Realtime → Badge display →
 * Atomic Read → Notification/Sound → Legacy 제거
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export const PHASE11C5_LAYER_CUTOVER_PRODUCTION_ON = false as const;

export type Phase11c5CutoverLayer =
  | "bootstrap_read"
  | "cache_write"
  | "realtime_apply"
  | "shell_read"
  | "badge_read"
  | "read_write"
  | "notification_write";

export type Phase11c5CutoverMode = "off" | "isolated" | "canary" | "on" | "killed";

export type Phase11c5Surface = "default" | "customer" | "owner";

export type Phase11c5LayerState = Readonly<{
  domain: ChatDomain;
  /** store_order only — customer/owner 분리 필수 */
  surface: Phase11c5Surface;
  layer: Phase11c5CutoverLayer;
  mode: Phase11c5CutoverMode;
}>;

export const PHASE11C5_CUTOVER_LAYERS: ReadonlyArray<Phase11c5CutoverLayer> = [
  "bootstrap_read",
  "cache_write",
  "realtime_apply",
  "shell_read",
  "badge_read",
  "read_write",
  "notification_write",
] as const;

export const PHASE11C5_DOMAINS: ReadonlyArray<ChatDomain> = [
  "general_direct",
  "group",
  "trade",
  "store_order",
] as const;

/** Atomic Read / Phase9 notification production 준비 플래그 — 현재 미준비 */
export const PHASE11C5_ATOMIC_READ_RUNTIME_PASS = false as const;
export const PHASE11C5_NOTIFICATION_PRODUCTION_WIRING_READY = false as const;

export function buildPhase11c5DefaultOffMatrix(): Phase11c5LayerState[] {
  const out: Phase11c5LayerState[] = [];
  for (const domain of PHASE11C5_DOMAINS) {
    const surfaces: Phase11c5Surface[] =
      domain === "store_order" ? ["customer", "owner"] : ["default"];
    for (const surface of surfaces) {
      for (const layer of PHASE11C5_CUTOVER_LAYERS) {
        out.push({ domain, surface, layer, mode: "off" });
      }
    }
  }
  return out;
}

export type Phase11c5InvariantContext = Readonly<{
  states: ReadonlyArray<Phase11c5LayerState>;
  atomicReadRuntimePass?: boolean;
  notificationProductionReady?: boolean;
  /** same domain+surface+layer 에 active writers */
  activeWriters?: ReadonlyArray<"legacy" | "domain">;
}>;

function modeOf(
  states: ReadonlyArray<Phase11c5LayerState>,
  domain: ChatDomain,
  surface: Phase11c5Surface,
  layer: Phase11c5CutoverLayer
): Phase11c5CutoverMode {
  const row = states.find(
    (s) => s.domain === domain && s.surface === surface && s.layer === layer
  );
  return row?.mode ?? "off";
}

function isActive(mode: Phase11c5CutoverMode): boolean {
  return mode === "isolated" || mode === "canary" || mode === "on";
}

/**
 * 불가능 조합 / dual-write / Atomic·Notification 미준비 on 금지.
 * 검증만 — 상태를 변경하지 않음.
 */
export function assertPhase11c5CutoverInvariants(ctx: Phase11c5InvariantContext): void {
  if (PHASE11C5_LAYER_CUTOVER_PRODUCTION_ON) {
    throw new Error("dibay_phase11c5_production_cutover_on_forbidden");
  }
  const atomicPass = ctx.atomicReadRuntimePass ?? PHASE11C5_ATOMIC_READ_RUNTIME_PASS;
  const notifReady =
    ctx.notificationProductionReady ?? PHASE11C5_NOTIFICATION_PRODUCTION_WIRING_READY;

  if (ctx.activeWriters) {
    const set = new Set(ctx.activeWriters);
    if (set.has("legacy") && set.has("domain")) {
      throw new Error("dibay_phase11c5_dual_write_forbidden");
    }
  }

  for (const domain of PHASE11C5_DOMAINS) {
    const surfaces: Phase11c5Surface[] =
      domain === "store_order" ? ["customer", "owner"] : ["default"];
    for (const surface of surfaces) {
      const bootstrap = modeOf(ctx.states, domain, surface, "bootstrap_read");
      const cache = modeOf(ctx.states, domain, surface, "cache_write");
      const realtime = modeOf(ctx.states, domain, surface, "realtime_apply");
      const shell = modeOf(ctx.states, domain, surface, "shell_read");
      const badge = modeOf(ctx.states, domain, surface, "badge_read");
      const readWrite = modeOf(ctx.states, domain, surface, "read_write");
      const notification = modeOf(ctx.states, domain, surface, "notification_write");

      if (shell !== "off" && shell !== "killed" && bootstrap === "off") {
        throw new Error(`dibay_phase11c5_shell_requires_bootstrap:${domain}:${surface}`);
      }
      if (isActive(cache) && bootstrap === "off") {
        throw new Error(`dibay_phase11c5_cache_requires_bootstrap:${domain}:${surface}`);
      }
      if (isActive(realtime) && !isActive(cache) && cache !== "killed") {
        // realtime_apply=on requires cache_write active (not off)
        if (cache === "off") {
          throw new Error(`dibay_phase11c5_realtime_requires_cache:${domain}:${surface}`);
        }
      }
      if (isActive(badge) && bootstrap === "off") {
        throw new Error(`dibay_phase11c5_badge_requires_bootstrap:${domain}:${surface}`);
      }
      if (isActive(readWrite) && !atomicPass) {
        throw new Error(`dibay_phase11c5_read_write_requires_atomic_pass:${domain}:${surface}`);
      }
      if (isActive(notification) && !notifReady) {
        throw new Error(
          `dibay_phase11c5_notification_requires_phase9_wiring:${domain}:${surface}`
        );
      }
      // killed → writer must not be active
      for (const layer of PHASE11C5_CUTOVER_LAYERS) {
        const m = modeOf(ctx.states, domain, surface, layer);
        if (m === "killed" && ctx.activeWriters?.includes("domain")) {
          throw new Error(`dibay_phase11c5_killed_blocks_domain_writer:${domain}:${layer}`);
        }
      }
    }
  }

  // store_order customer/owner must not share a single undifferentiated state for cache/realtime
  const soCust = ctx.states.filter((s) => s.domain === "store_order" && s.surface === "customer");
  const soOwner = ctx.states.filter((s) => s.domain === "store_order" && s.surface === "owner");
  if (soCust.length === 0 || soOwner.length === 0) {
    throw new Error("dibay_phase11c5_store_order_surfaces_required");
  }
}

/** canary/on 제안 전 검증용 — 제안 states 가 invariants 통과하는지 */
export function validatePhase11c5ProposedStates(
  proposed: ReadonlyArray<Phase11c5LayerState>,
  extras?: Omit<Phase11c5InvariantContext, "states">
): { ok: true } | { ok: false; error: string } {
  try {
    assertPhase11c5CutoverInvariants({ states: proposed, ...extras });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid" };
  }
}

export function isPhase11c5LayerWritable(mode: Phase11c5CutoverMode): boolean {
  if (mode === "killed" || mode === "off") return false;
  return mode === "isolated" || mode === "canary" || mode === "on";
}
