/**
 * C3 — 복귀 시 웹 버전 확인 · 안전한 순간에만 1회 새로고침
 * (docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md §4 C3 · R2).
 *
 * 배경: 운영 배포가 잦아(18.6시간 41회) 켜 둔 앱이 이전 배포 코드를 계속 실행한다. Skew Protection(7일)이 이전 배포의
 * 청크·RSC 를 계속 내주므로 화면이 깨지지는 않지만, 새 배포로는 넘어가지 않는다(문서 새로고침 전까지).
 *
 * 계약:
 * - 오래(≥30분) 백그라운드에 있다가 돌아온 순간에만 확인한다. 확인 간격 ≥30분. 요청 1건(no-store, DB 0).
 * - 새 배포가 있고 **안전한 순간**일 때만 새로고침 1회. 안전하지 않으면 아무것도 하지 않고 다음 복귀에서 다시 본다.
 *   안전 = 허브 목록 화면(하단 탭 첫 화면) · 내 통화 없음(readOwnLiveCall, 읽기만) · 입력 중 아님 · 열린 모달 없음 · 화면 보임.
 *   채팅방·작성·결제·주문·통화 화면에서는 절대 새로고침하지 않는다.
 * - 타이머로 강제 새로고침하지 않는다. 실패(네트워크·응답 이상)는 무시.
 */

import { readOwnLiveCall } from "@/lib/call/own-live-call";
import { isMainTabKeepAliveHubPath } from "@/lib/layout/resolve-main-surface";
import { noteEntryUpdateReload } from "@/lib/telemetry/entry-telemetry.client";

export const WEB_VERSION_ENDPOINT = "/api/app/web-version";
export const WEB_VERSION_CHECK_MIN_HIDDEN_MS = 30 * 60_000;
export const WEB_VERSION_CHECK_MIN_GAP_MS = 30 * 60_000;
const FETCH_TIMEOUT_MS = 4000;

export type SafeReloadInput = {
  pathname: string;
  visible: boolean;
  liveCall: boolean;
  editing: boolean;
  modalOpen: boolean;
};

export function isSafeMomentForWebUpdateReload(input: SafeReloadInput): boolean {
  if (!input.visible || input.liveCall || input.editing || input.modalOpen) return false;
  // 새로고침해도 잃는 것이 없는 화면 = 하단 탭 허브(목록) 정확 경로만 — 단일 정의 resolve-main-surface.
  // 하위 경로(채팅방·상세·작성·결제·주문·통화)는 허브가 아니다.
  return isMainTabKeepAliveHubPath(input.pathname);
}

/** 두 버전이 모두 있고 다를 때만 「새 배포 있음」. 어느 한쪽이라도 모르면 새로고침하지 않는다. */
export function hasNewerWebDeploy(localSha: string | null | undefined, remoteSha: string | null | undefined): boolean {
  const a = String(localSha ?? "").trim().toLowerCase();
  const b = String(remoteSha ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{7}$/.test(a) || !/^[0-9a-f]{7}$/.test(b)) return false;
  return a !== b;
}

function isEditingNow(): boolean {
  try {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return el.isContentEditable === true;
  } catch {
    return true;
  }
}

function isModalOpenNow(): boolean {
  try {
    return document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]') != null;
  } catch {
    return true;
  }
}

function hasLiveCallNow(): boolean {
  try {
    return readOwnLiveCall() != null;
  } catch {
    // 판정 실패 = 통화 중일 수 있음 → 새로고침 금지
    return true;
  }
}

async function fetchRemoteSha(): Promise<string | null> {
  try {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
    try {
      const res = await fetch(WEB_VERSION_ENDPOINT, {
        cache: "no-store",
        credentials: "omit",
        signal: ctrl?.signal,
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { sha?: unknown };
      return typeof body?.sha === "string" ? body.sha : null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

type Deps = {
  now: () => number;
  localSha: () => string | null;
  fetchRemoteSha: () => Promise<string | null>;
  reload: () => void;
  readState: () => SafeReloadInput;
};

const defaultDeps: Deps = {
  now: () => Date.now(),
  localSha: () => (process.env.NEXT_PUBLIC_WEB_DEPLOY_SHA ?? "").trim() || null,
  fetchRemoteSha,
  reload: () => window.location.reload(),
  readState: () => ({
    pathname: window.location.pathname,
    visible: document.visibilityState === "visible",
    liveCall: hasLiveCallNow(),
    editing: isEditingNow(),
    modalOpen: isModalOpenNow(),
  }),
};

let started = false;
let hiddenAt: number | null = null;
let lastCheckAt: number | null = null;
let inFlight = false;

/** 복귀 1회 처리 — 테스트에서 직접 부를 수 있게 분리. 새로고침했으면 true. */
export async function runWebVersionResumeCheck(hiddenMs: number, deps: Deps = defaultDeps): Promise<boolean> {
  if (hiddenMs < WEB_VERSION_CHECK_MIN_HIDDEN_MS || inFlight) return false;
  const now = deps.now();
  if (lastCheckAt != null && now - lastCheckAt < WEB_VERSION_CHECK_MIN_GAP_MS) return false;
  const local = deps.localSha();
  if (!local) return false;
  lastCheckAt = now;
  inFlight = true;
  try {
    const remote = await deps.fetchRemoteSha();
    if (!hasNewerWebDeploy(local, remote)) return false;
    // 응답을 기다리는 동안 사용자가 움직였을 수 있다 — 지금 상태로 다시 판정한다.
    if (!isSafeMomentForWebUpdateReload(deps.readState())) return false;
    noteEntryUpdateReload();
    deps.reload();
    return true;
  } catch {
    return false;
  } finally {
    inFlight = false;
  }
}

/** 문서당 1회 — AppBootProvider 마운트 시. */
export function startWebVersionResumeCheck(deps: Deps = defaultDeps): void {
  try {
    if (started || typeof document === "undefined") return;
    started = true;
    document.addEventListener("visibilitychange", () => {
      try {
        if (document.visibilityState === "hidden") {
          hiddenAt = deps.now();
          return;
        }
        if (hiddenAt == null) return;
        const hiddenMs = deps.now() - hiddenAt;
        hiddenAt = null;
        void runWebVersionResumeCheck(hiddenMs, deps);
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
}

export function resetWebVersionResumeCheckForTests(): void {
  started = false;
  hiddenAt = null;
  lastCheckAt = null;
  inFlight = false;
}
