"use client";

import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";

const ANONYMOUS_PERMISSION_USER_ID = "anonymous";
const STABLE_CLIENT_ID_KEY = "dibay.device.stableClientId";
const SESSION_LATER_KEY = "dibay.fsi.guide.session_later";
const SESSION_HANDLED_KEY = "dibay.fsi.guide.session_handled";

function sanitizePermissionKeyPart(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "unknown";
  return encodeURIComponent(trimmed).replace(/\./g, "%2E");
}

function readLs(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLs(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function removeLs(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function readSs(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSs(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function getDiBaYStableClientId(): string {
  if (typeof window === "undefined") return "server";
  const existing = readLs(STABLE_CLIENT_ID_KEY)?.trim();
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  writeLs(STABLE_CLIENT_ID_KEY, next);
  return next;
}

function permanentDismissKey(): string {
  const userId = sanitizePermissionKeyPart(getSyncViewerUserIdForClient() ?? ANONYMOUS_PERMISSION_USER_ID);
  const deviceId = sanitizePermissionKeyPart(getDiBaYStableClientId());
  return `dibay.permission.${userId}.${deviceId}.full_screen_intent.dismissed`;
}

export function isFsiSessionLater(): boolean {
  return readSs(SESSION_LATER_KEY) === "1";
}

export function markFsiSessionLater(): void {
  writeSs(SESSION_LATER_KEY, "1");
  markFsiSessionGuideHandled();
}

export function isFsiSessionGuideHandled(): boolean {
  return readSs(SESSION_HANDLED_KEY) === "1";
}

export function markFsiSessionGuideHandled(): void {
  writeSs(SESSION_HANDLED_KEY, "1");
}

export function isFsiPermanentDismiss(): boolean {
  return readLs(permanentDismissKey()) === "1";
}

export function markFsiPermanentDismiss(): void {
  writeLs(permanentDismissKey(), "1");
  markFsiSessionGuideHandled();
}

export function resetFullScreenIntentGuideStorageForTests(): void {
  if (typeof window === "undefined") return;
  removeLs(permanentDismissKey());
  try {
    window.sessionStorage.removeItem(SESSION_LATER_KEY);
    window.sessionStorage.removeItem(SESSION_HANDLED_KEY);
  } catch {
    /* ignore */
  }
}
