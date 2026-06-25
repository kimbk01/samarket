"use client";

import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import {
  isCallV4CalleeAcceptRoute,
  readCallV4SessionIdFromNativeRoute,
} from "@/lib/community-messenger/call-v4/call-v4-native-route";

const STORAGE_KEY = "dibay:call-v4:native-accept-inflight";
const INFLIGHT_TTL_MS = 120_000;

type NativeAcceptInflightRecord = {
  source: string;
  autostartConsumed: boolean;
  setAt: number;
};

type NativeAcceptInflightStore = Record<string, NativeAcceptInflightRecord>;

function normalizeCallId(callId: string): string {
  return callId.trim();
}

function readRouteSource(path: string): string {
  const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
  return new URLSearchParams(query).get("source")?.trim() || "native";
}

function readStore(): NativeAcceptInflightStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as NativeAcceptInflightStore;
    if (!parsed || typeof parsed !== "object") return {};
    const now = Date.now();
    let changed = false;
    for (const [callId, record] of Object.entries(parsed)) {
      if (!record || now - record.setAt > INFLIGHT_TTL_MS) {
        delete parsed[callId];
        changed = true;
      }
    }
    if (changed) writeStore(parsed);
    return parsed;
  } catch {
    return {};
  }
}

function writeStore(store: NativeAcceptInflightStore): void {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(store).length === 0) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // sessionStorage unavailable — inflight is best-effort only
  }
}

export function setNativeAcceptInflight(callId: string, source: string): void {
  const sid = normalizeCallId(callId);
  if (!sid) return;
  const store = readStore();
  const previous = store[sid];
  const normalizedSource = source.trim() || "native";
  if (previous?.autostartConsumed) {
    store[sid] = { ...previous, source: normalizedSource, setAt: Date.now() };
    writeStore(store);
    logCallV4("native_accept_inflight_refresh", { callId: sid, source: normalizedSource });
    return;
  }
  store[sid] = {
    source: normalizedSource,
    autostartConsumed: false,
    setAt: Date.now(),
  };
  writeStore(store);
  logCallV4("native_accept_inflight_set", { callId: sid, source: normalizedSource });
}

export function isNativeAcceptInflight(callId: string): boolean {
  const sid = normalizeCallId(callId);
  if (!sid) return false;
  return Boolean(readStore()[sid]);
}

export function consumeNativeAcceptAutostart(callId: string): boolean {
  const sid = normalizeCallId(callId);
  if (!sid) return false;
  const store = readStore();
  const record = store[sid];
  if (!record || record.autostartConsumed) return false;
  store[sid] = { ...record, autostartConsumed: true };
  writeStore(store);
  logCallV4("native_accept_web_autostart", { callId: sid, source: record.source });
  return true;
}

/** Native accept route — callV4Accept autostart once per callId. */
export function tryStartCallV4NativeAcceptAutostart(callId: string): boolean {
  const sid = normalizeCallId(callId);
  if (!sid) return false;
  if (!consumeNativeAcceptAutostart(sid)) {
    logCallV4("accept_once_skip_duplicate", { callId: sid });
    return false;
  }
  return true;
}

export function clearNativeAcceptInflight(callId: string, reason: string): void {
  const sid = normalizeCallId(callId);
  if (!sid) return;
  const store = readStore();
  if (!store[sid]) return;
  delete store[sid];
  writeStore(store);
  logCallV4("native_accept_inflight_clear", { callId: sid, reason: reason.trim() || "terminal" });
}

export function shouldSeedCallV4NativeAcceptInflightFromRoute(path: string): boolean {
  if (!isCallV4CalleeAcceptRoute(path)) return false;
  const source = readRouteSource(path);
  return source !== "sheet";
}

export function syncCallV4NativeAcceptInflightFromWindowLocation(): string | null {
  if (typeof window === "undefined") return null;
  const path = `${window.location.pathname}${window.location.search}`;
  return seedCallV4NativeAcceptInflightFromRoute(path);
}

export function seedCallV4NativeAcceptInflightFromRoute(path: string): string | null {
  if (!shouldSeedCallV4NativeAcceptInflightFromRoute(path)) return null;
  const callId = readCallV4SessionIdFromNativeRoute(path);
  if (!callId) return null;
  setNativeAcceptInflight(callId, readRouteSource(path));
  return callId;
}

export function resetNativeAcceptInflightForTests(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
