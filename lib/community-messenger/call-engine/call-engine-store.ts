"use client";

export const CALL_ENGINE_STORE_KEYS = {
  minimizedSession: "cm_minimized_call_session",
  minimizedRoom: "cm_minimized_call_room",
  dockedSession: "cm_docked_call_session",
  dockedRoom: "cm_docked_call_room",
  activeVideoSession: "cm_active_direct_video_call_session",
  pendingRoute: "dibay_call_pending_route",
  navigationSeed: "samarket.cm.call_session_seed.v1",
  returnPath: "samarket.cm.call_return_path.v1",
  nativeAcceptPending: "cm_native_callee_accept_pending",
} as const;

type PendingRoutePayload = { path: string; at: number; callId?: string };

function readSessionRaw(key: string): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionRaw(key: string, value: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

function removeSessionRaw(key: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

function readLocalRaw(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalRaw(key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

function removeLocalRaw(key: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export function readCallEngineMinimizedSessionId(): string | null {
  return readSessionRaw(CALL_ENGINE_STORE_KEYS.minimizedSession)?.trim() || null;
}

export function writeCallEngineMinimizedSession(sessionId: string, roomId?: string | null): void {
  const sid = sessionId.trim();
  if (!sid) return;
  writeSessionRaw(CALL_ENGINE_STORE_KEYS.minimizedSession, sid);
  const rid = roomId?.trim();
  if (rid) writeSessionRaw(CALL_ENGINE_STORE_KEYS.minimizedRoom, rid);
}

export function clearCallEngineMinimizedSession(): void {
  removeSessionRaw(CALL_ENGINE_STORE_KEYS.minimizedSession);
  removeSessionRaw(CALL_ENGINE_STORE_KEYS.minimizedRoom);
}

export function readCallEngineDockedSessionId(): string | null {
  return readSessionRaw(CALL_ENGINE_STORE_KEYS.dockedSession)?.trim() || null;
}

export function writeCallEngineDockedSession(sessionId: string, roomId?: string | null): void {
  const sid = sessionId.trim();
  if (!sid) return;
  writeSessionRaw(CALL_ENGINE_STORE_KEYS.dockedSession, sid);
  const rid = roomId?.trim();
  if (rid) writeSessionRaw(CALL_ENGINE_STORE_KEYS.dockedRoom, rid);
}

export function clearCallEngineDockedSession(): void {
  removeSessionRaw(CALL_ENGINE_STORE_KEYS.dockedSession);
  removeSessionRaw(CALL_ENGINE_STORE_KEYS.dockedRoom);
}

export function writeCallEnginePendingRoute(path: string, callId?: string): void {
  const normalizedPath = path.trim();
  if (!normalizedPath) return;
  const payload: PendingRoutePayload = {
    path: normalizedPath,
    at: Date.now(),
    ...(callId?.trim() ? { callId: callId.trim() } : {}),
  };
  writeSessionRaw(CALL_ENGINE_STORE_KEYS.pendingRoute, JSON.stringify(payload));
}

export function readCallEnginePendingRoute(now = Date.now(), ttlMs = 60_000): PendingRoutePayload | null {
  const raw = readSessionRaw(CALL_ENGINE_STORE_KEYS.pendingRoute);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingRoutePayload;
    const path = parsed.path?.trim();
    if (!path) return null;
    if (typeof parsed.at === "number" && parsed.at > 0 && now - parsed.at > ttlMs) {
      clearCallEnginePendingRoute();
      return null;
    }
    return { path, at: parsed.at, callId: parsed.callId?.trim() || undefined };
  } catch {
    return null;
  }
}

export function clearCallEnginePendingRoute(): void {
  removeSessionRaw(CALL_ENGINE_STORE_KEYS.pendingRoute);
}

export function writeCallEngineNavigationSeed(payload: unknown): void {
  writeSessionRaw(CALL_ENGINE_STORE_KEYS.navigationSeed, JSON.stringify(payload));
}

export function readCallEngineNavigationSeed<T>(): T | null {
  const raw = readSessionRaw(CALL_ENGINE_STORE_KEYS.navigationSeed);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearCallEngineNavigationSeed(): void {
  removeSessionRaw(CALL_ENGINE_STORE_KEYS.navigationSeed);
}

export function writeCallEngineReturnPath(path: string): void {
  const value = path.trim();
  if (!value) return;
  writeSessionRaw(CALL_ENGINE_STORE_KEYS.returnPath, value);
}

export function readCallEngineReturnPath(): string | null {
  return readSessionRaw(CALL_ENGINE_STORE_KEYS.returnPath)?.trim() || null;
}

export function clearCallEngineReturnPath(): void {
  removeSessionRaw(CALL_ENGINE_STORE_KEYS.returnPath);
}

export function writeCallEngineNativeAcceptPending(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  writeSessionRaw(
    CALL_ENGINE_STORE_KEYS.nativeAcceptPending,
    JSON.stringify({ sessionId: sid, at: Date.now() }),
  );
}

export function readCallEngineNativeAcceptPending(now = Date.now(), ttlMs = 60_000): string | null {
  const raw = readSessionRaw(CALL_ENGINE_STORE_KEYS.nativeAcceptPending);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { sessionId?: string; at?: number };
    const sid = parsed.sessionId?.trim();
    if (!sid) return null;
    const at = typeof parsed.at === "number" ? parsed.at : 0;
    if (at > 0 && now - at > ttlMs) {
      clearCallEngineNativeAcceptPending();
      return null;
    }
    return sid;
  } catch {
    return null;
  }
}

export function clearCallEngineNativeAcceptPending(): void {
  removeSessionRaw(CALL_ENGINE_STORE_KEYS.nativeAcceptPending);
}

export function writeCallEngineActiveVideoSession(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  writeSessionRaw(CALL_ENGINE_STORE_KEYS.activeVideoSession, sid);
}

export function readCallEngineActiveVideoSession(): string | null {
  return readSessionRaw(CALL_ENGINE_STORE_KEYS.activeVideoSession)?.trim() || null;
}

export function clearCallEngineActiveVideoSession(): void {
  removeSessionRaw(CALL_ENGINE_STORE_KEYS.activeVideoSession);
}

export function readCallEngineSessionItem(key: string): string | null {
  return readSessionRaw(key);
}

export function writeCallEngineSessionItem(key: string, value: string): void {
  writeSessionRaw(key, value);
}

export function removeCallEngineSessionItem(key: string): void {
  removeSessionRaw(key);
}

export function readCallEngineLocalItem(key: string): string | null {
  return readLocalRaw(key);
}

export function writeCallEngineLocalItem(key: string, value: string): void {
  writeLocalRaw(key, value);
}

export function removeCallEngineLocalItem(key: string): void {
  removeLocalRaw(key);
}
