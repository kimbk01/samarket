/**
 * 진입 감사 5단계 IN-1·IN-3·IN-8 (2026-11-17) — 네이티브 인트로 ↔ 웹.
 *
 * - 네이티브가 이번 실행에 인트로를 그렸으면 문서 시작 스크립트로 `window.__DIBAY_NATIVE_INTRO__` = 소재 id 를 넣는다.
 *   그 실행에서 웹 인트로는 나오지 않고(시작 목적지 = 홈), 팝업은 네이티브 인트로가 끝날 때까지 보류한다.
 * - 발견(`/api/launch-intro/live`) 응답의 `pool` 을 네이티브 저장소에 맞춘다(다음 「새로 켬」에 쓰임).
 * - 네이티브가 보낸 노출·건너뛰기·누름·완료를 서버에 기록하고, 누름이면 목적지를 연다.
 * 네이티브 플러그인이 없는 앱(구 바이너리·웹)에서는 아무것도 하지 않는다.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { LaunchIntroPoolPayload } from "@/lib/launch-intro/pool";
import { ensureClientInstanceId } from "@/lib/auth/client-instance-id";

type IntroEvent = {
  type: "impression" | "skip" | "click" | "complete" | "done";
  creativeId: string;
  exposureId: string;
  href?: string;
};

type DibayNativeIntroPlugin = {
  sync(options: LaunchIntroPoolPayload): Promise<{ ok: boolean }>;
  getState(): Promise<{ active?: boolean; creativeId?: string | null; revision?: string }>;
  addListener(event: "introEvent", cb: (e: IntroEvent) => void): Promise<PluginListenerHandle>;
};

let nativeIntro: DibayNativeIntroPlugin | null = null;
/** 처음 쓸 때만 등록 — 네이티브 인트로가 없는 실행은 Capacitor 를 건드리지 않는다 */
function plugin(): DibayNativeIntroPlugin {
  nativeIntro ??= registerPlugin<DibayNativeIntroPlugin>("DibayNativeIntro");
  return nativeIntro;
}
/** 이 실행(launch epoch)에서 끝난 네이티브 인트로 — 같은 프로세스의 문서 다시 열기에서 팝업을 다시 막지 않는다 */
const DONE_KEY = "dibay:native-intro:done";
/** 끝 신호가 끝내 안 와도 팝업 보류를 푸는 상한(네이티브 상한 10초 + 여유) */
export const NATIVE_INTRO_WEB_HOLD_CAP_MS = 15_000;

function launchEpoch(): string {
  const v = (window as unknown as { __DIBAY_LAUNCH_EPOCH__?: unknown }).__DIBAY_LAUNCH_EPOCH__;
  return typeof v === "string" ? v : "";
}

function doneMarker(id: string): string {
  return `${launchEpoch()}:${id}`;
}

function readDoneMarker(): string | null {
  try {
    return window.sessionStorage.getItem(DONE_KEY);
  } catch {
    return null;
  }
}

declare global {
  interface Window {
    __DIBAY_NATIVE_INTRO__?: string;
  }
}

let doneThisDocument = false;
const listeners = new Set<() => void>();

/** 이번 문서 시작 때 네이티브 인트로가 떠 있었는가(소재 id) */
export function readNativeIntroLaunchId(): string | null {
  if (typeof window === "undefined") return null;
  const v = window.__DIBAY_NATIVE_INTRO__;
  if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) return null;
  // 재감사 H1: 문서 시작 값은 같은 프로세스의 모든 문서에 다시 들어간다 — 이 실행에서 이미 끝난 인트로면 없음
  if (readDoneMarker() === doneMarker(v)) return null;
  return v;
}

/** 지금 네이티브 인트로가 화면을 덮고 있는가 — 팝업 보류 판단 */
export function isNativeIntroActive(): boolean {
  return readNativeIntroLaunchId() != null && !doneThisDocument;
}

export function subscribeNativeIntro(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function markDone(): void {
  if (doneThisDocument) return;
  const id = typeof window !== "undefined" ? window.__DIBAY_NATIVE_INTRO__ : undefined;
  doneThisDocument = true;
  if (typeof id === "string" && id) {
    try {
      window.sessionStorage.setItem(DONE_KEY, doneMarker(id));
    } catch {
      /* 저장소 없음 — 이 문서만 */
    }
  }
  for (const cb of [...listeners]) cb();
}

function hasNativePlugin(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("DibayNativeIntro");
  } catch {
    return false;
  }
}

/** 발견 응답의 묶음을 네이티브 저장소에 맞춘다(같은 판이면 건너뜀). null = 서버 읽기 실패 → 이전 저장 유지 */
export async function syncNativeIntroPool(pool: LaunchIntroPoolPayload | null | undefined): Promise<void> {
  if (!pool || !hasNativePlugin()) return;
  try {
    // 재감사 L4: 기기 저장소의 판과 비교한다(웹 저장 표시가 아니라) — 네이티브 저장이 지워졌으면 다시 맞춘다
    const state = await plugin().getState();
    if (state?.revision === pool.revision) return;
    await plugin().sync(pool);
  } catch {
    /* 다음 발견 때 다시 */
  }
}

function platformTag(): string {
  return Capacitor.getPlatform();
}

function safeDeviceKey(): string | undefined {
  try {
    return ensureClientInstanceId();
  } catch {
    return undefined;
  }
}

function postEvent(e: IntroEvent): void {
  if (e.type === "done") return;
  void fetch("/api/launch-intro/events", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creativeId: e.creativeId,
      eventType: e.type,
      renderer: "native",
      exposureId: e.exposureId,
      platform: platformTag(),
      deviceKey: safeDeviceKey(),
      href: e.href ?? undefined,
    }),
    keepalive: true,
  }).catch(() => {});
}

let bridgeStarted = false;

/**
 * 네이티브 이벤트 받기 — 앱 시작 때 1번. `openHref` = 누름 목적지 열기(호출 쪽 라우터).
 * 네이티브 인트로가 없는 실행이면 팝업 보류도 없다.
 */
export function startNativeIntroBridge(openHref: (href: string) => void): void {
  if (bridgeStarted || typeof window === "undefined") return;
  bridgeStarted = true;
  // 이번 실행에 네이티브 인트로가 없으면 받을 신호도 없다
  if (!readNativeIntroLaunchId()) {
    doneThisDocument = true;
    return;
  }
  if (!hasNativePlugin()) {
    markDone();
    return;
  }
  void plugin().addListener("introEvent", (e) => {
    if (!e || typeof e.creativeId !== "string") return;
    postEvent(e);
    if (e.type === "click" && typeof e.href === "string" && e.href) openHref(e.href);
    if (e.type === "done") markDone();
  }).catch(() => markDone());
  // 재감사 H2: 네이티브가 그리지 못했거나(그림 오류) 이미 끝났으면 바로 푼다
  void plugin()
    .getState()
    .then((st) => {
      if (!st?.active) markDone();
    })
    .catch(() => markDone());
  // 끝 신호가 끝내 안 와도 팝업을 영원히 막지 않는다
  window.setTimeout(markDone, NATIVE_INTRO_WEB_HOLD_CAP_MS);
}

/** @internal vitest */
export function __resetNativeIntroClientForTests(): void {
  try {
    window.sessionStorage.removeItem(DONE_KEY);
  } catch {
    /* ignore */
  }
  doneThisDocument = false;
  bridgeStarted = false;
  listeners.clear();
}
