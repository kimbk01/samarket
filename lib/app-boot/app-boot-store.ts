"use client";

import type { AppBootState } from "@/lib/app-boot/app-boot-types";
import { APP_BOOT_PROFILE_UPDATED_EVENT, APP_BOOT_READY_EVENT } from "@/lib/app-boot/app-boot-types";
import type { ProfileRow } from "@/lib/profile/types";

const INITIAL: AppBootState = {
  status: "idle",
  profile: null,
  bootedAt: null,
  error: null,
};

let state: AppBootState = INITIAL;
const listeners = new Set<() => void>();

function emitReady(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(APP_BOOT_READY_EVENT));
  } catch {
    /* ignore */
  }
}

function emitProfileUpdated(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(APP_BOOT_PROFILE_UPDATED_EVENT));
  } catch {
    /* ignore */
  }
}

function emit(): void {
  for (const l of listeners) l();
}

export function getAppBootSnapshot(): AppBootState {
  return state;
}

export function subscribeAppBoot(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetAppBootStore(): void {
  state = INITIAL;
  emit();
}

/**
 * Guest/anonymous → authenticated upgrade.
 * Clears anonymous "ready" so ensureAppBoot re-runs, without full idle wipe
 * (full wipe forces a second cold boot wave on every login).
 */
export function markAppBootAuthUpgradePending(): void {
  state = {
    status: "hydrating",
    profile: null,
    bootedAt: null,
    error: null,
  };
  emit();
}

export function setAppBootShell(): void {
  if (state.status === "ready" || state.status === "anonymous" || state.status === "hydrating") return;
  state = { ...INITIAL, status: "shell" };
  emit();
}

export function setAppBootHydrating(): void {
  if (state.status === "ready" || state.status === "anonymous") return;
  state = { ...state, status: "hydrating" };
  emit();
}

export function setAppBootLoading(): void {
  setAppBootHydrating();
}

export function setAppBootAnonymous(): void {
  state = { status: "anonymous", profile: null, bootedAt: Date.now(), error: null };
  emit();
  emitReady();
}

export function setAppBootProfile(profile: ProfileRow, status: "ready" | "error" = "ready", error: string | null = null): void {
  const prev = state.profile;
  state = {
    status: profile ? status : "anonymous",
    profile,
    bootedAt: Date.now(),
    error,
  };
  emit();
  emitReady();
  if (profile && profile !== prev) emitProfileUpdated();
}

/** boot full merge — Region·browse geo·주소 헤더가 구독하는 슬라이스만 비교 */
function bootProfileSyncSliceChanged(prev: ProfileRow, next: ProfileRow): boolean {
  const keys = [
    "region_code",
    "region_name",
    "address_detail",
    "full_address",
    "latitude",
    "longitude",
  ] as const;
  for (const k of keys) {
    const a = prev[k];
    const b = next[k];
    if (a !== b) return true;
  }
  return false;
}

export function mergeAppBootProfileFull(profile: ProfileRow): void {
  if (!state.profile) {
    setAppBootProfile(profile);
    return;
  }
  const merged: ProfileRow = { ...state.profile, ...profile };
  const syncChanged = bootProfileSyncSliceChanged(state.profile, merged);
  state = {
    ...state,
    status: "ready",
    profile: merged,
    bootedAt: Date.now(),
  };
  emit();
  if (syncChanged) emitProfileUpdated();
}

export function peekAppBootProfile(): ProfileRow | null {
  return state.profile;
}

export function isAppBootReady(): boolean {
  return state.status === "ready" || state.status === "anonymous";
}

export function isAppBootShellVisible(): boolean {
  return (
    state.status === "shell" ||
    state.status === "hydrating" ||
    state.status === "ready" ||
    state.status === "anonymous"
  );
}
