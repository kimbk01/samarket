"use client";

import { samarketRuntimeDebugEnabled, samarketRuntimeDebugLog } from "@/lib/runtime/samarket-runtime-debug";

/** BN14 — direct room URL cold 진입 분해 (E2E·debug 전용, sessionStorage) */
export type Bn14DirectColdMarkKey =
  | "segment_loading_probe_mount"
  | "segment_layout_module_eval"
  | "segment_layout_mount"
  | "layout_inline_shell_hydrate"
  | "segment_shell_host_dom"
  | "page_client_entry_module_eval"
  | "page_client_entry_mount"
  | "deferred_chunk_import_start"
  | "deferred_chunk_import_done"
  | "deferred_mount"
  | "route_entry_shell_dom";

const K_SESSION = "samarket:cm:bn14:direct_cold";

type Bn14DirectColdSession = {
  marks: Partial<Record<Bn14DirectColdMarkKey, number>>;
  direct_nav: boolean;
};

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function readSession(): Bn14DirectColdSession {
  if (typeof sessionStorage === "undefined") {
    return { marks: {}, direct_nav: false };
  }
  try {
    const raw = sessionStorage.getItem(K_SESSION);
    if (!raw) return { marks: {}, direct_nav: false };
    return JSON.parse(raw) as Bn14DirectColdSession;
  } catch {
    return { marks: {}, direct_nav: false };
  }
}

function writeSession(session: Bn14DirectColdSession): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(K_SESSION, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function resetBn14DirectColdProbeForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(K_SESSION);
  } catch {
    /* ignore */
  }
}

export function resetBn14DirectColdProbeSession(): void {
  resetBn14DirectColdProbeForTests();
}

/** direct URL 진입( list 경유 없음) — E2E S4 setup 직전 호출 */
export function armBn14DirectColdNavigation(): void {
  if (!samarketRuntimeDebugEnabled()) return;
  writeSession({ marks: {}, direct_nav: true });
}

export function noteBn14DirectColdMark(key: Bn14DirectColdMarkKey, at?: number): void {
  if (!samarketRuntimeDebugEnabled()) return;
  const session = readSession();
  if (session.marks[key] != null) return;
  session.marks[key] = at ?? perfNow();
  writeSession(session);
  samarketRuntimeDebugLog("bn14-direct-cold", key, { ms: session.marks[key] });
}

export function getBn14DirectColdSession(): Bn14DirectColdSession {
  return readSession();
}
