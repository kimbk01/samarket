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

export function setAppBootLoading(): void {
  state = { ...INITIAL, status: "loading" };
  emit();
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

export function mergeAppBootProfileFull(profile: ProfileRow): void {
  if (!state.profile) {
    setAppBootProfile(profile);
    return;
  }
  state = {
    ...state,
    status: "ready",
    profile: { ...state.profile, ...profile },
    bootedAt: Date.now(),
  };
  emit();
  emitProfileUpdated();
}

export function peekAppBootProfile(): ProfileRow | null {
  return state.profile;
}

export function isAppBootReady(): boolean {
  return state.status === "ready" || state.status === "anonymous";
}
