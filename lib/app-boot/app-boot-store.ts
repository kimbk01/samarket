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
/**
 * 미확정(idle·shell·hydrating·error) → 확정(ready·anonymous) 전환 회차.
 * 백그라운드 초기화(알림음·첫 뱃지·사장님 뱃지)는 회차당 1회만 예약한다.
 */
let settleSeq = 0;

function isSettledStatus(status: AppBootState["status"]): boolean {
  return status === "ready" || status === "anonymous";
}

function commitState(next: AppBootState): void {
  if (isSettledStatus(next.status) && !isSettledStatus(state.status)) settleSeq += 1;
  state = next;
}

export function getAppBootSettleSeq(): number {
  return settleSeq;
}

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

/**
 * C4 (Owner 승인 2026-11-10): `useSyncExternalStore` 서버 스냅샷 — 서버 HTML 과 hydration 첫 렌더가 같도록 항상 초기값.
 * (예전에는 서버 스냅샷 자리에 클라이언트 현재값 getter 를 넣어 hydration 전 부팅이 끝나면 프로필 사진 주소가 어긋날 수 있었다.)
 */
export function getAppBootServerSnapshot(): AppBootState {
  return INITIAL;
}

export function subscribeAppBoot(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetAppBootStore(): void {
  commitState(INITIAL);
  emit();
}

/**
 * Guest/anonymous → authenticated upgrade.
 * Clears anonymous "ready" so ensureAppBoot re-runs, without full idle wipe
 * (full wipe forces a second cold boot wave on every login).
 */
export function markAppBootAuthUpgradePending(): void {
  commitState({
    status: "hydrating",
    profile: null,
    bootedAt: null,
    error: null,
  });
  emit();
}

export function setAppBootShell(): void {
  if (
    state.status === "ready" ||
    state.status === "anonymous" ||
    state.status === "hydrating" ||
    state.status === "error"
  ) {
    return;
  }
  commitState({ ...INITIAL, status: "shell" });
  emit();
}

export function setAppBootHydrating(): void {
  if (state.status === "ready" || state.status === "anonymous") return;
  commitState({ ...state, status: "hydrating" });
  emit();
}

/**
 * 로그인은 확인됐으나 lite 프로필 조회가 실패(5xx·네트워크·마감 초과)한 상태.
 * 비회원(`anonymous`)이 아니며 시작 완료도 아니다 — READY 이벤트를 내지 않는다.
 * 복구는 `run-app-boot` 의 프로필 복구만 담당한다.
 */
export function setAppBootProfileUnavailable(reason: string): void {
  commitState({ status: "error", profile: null, bootedAt: Date.now(), error: reason });
  emit();
}

export function setAppBootLoading(): void {
  setAppBootHydrating();
}

export function setAppBootAnonymous(): void {
  commitState({ status: "anonymous", profile: null, bootedAt: Date.now(), error: null });
  emit();
  emitReady();
}

export function setAppBootProfile(profile: ProfileRow, status: "ready" | "error" = "ready", error: string | null = null): void {
  const prev = state.profile;
  commitState({
    status: profile ? status : "anonymous",
    profile,
    bootedAt: Date.now(),
    error,
  });
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
  commitState({
    ...state,
    status: "ready",
    profile: merged,
    bootedAt: Date.now(),
  });
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
