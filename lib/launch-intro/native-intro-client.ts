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

type IntroEvent = {
  type: "impression" | "skip" | "click" | "complete" | "done";
  creativeId: string;
  exposureId: string;
  href?: string;
};

type DibayNativeIntroPlugin = {
  sync(options: LaunchIntroPoolPayload): Promise<{ ok: boolean }>;
  addListener(event: "introEvent", cb: (e: IntroEvent) => void): Promise<PluginListenerHandle>;
};

let nativeIntro: DibayNativeIntroPlugin | null = null;
/** 처음 쓸 때만 등록 — 네이티브 인트로가 없는 실행은 Capacitor 를 건드리지 않는다 */
function plugin(): DibayNativeIntroPlugin {
  nativeIntro ??= registerPlugin<DibayNativeIntroPlugin>("DibayNativeIntro");
  return nativeIntro;
}
const SYNCED_REVISION_KEY = "dibay:native-intro:synced-revision";

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
  return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
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
  doneThisDocument = true;
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
    if (window.localStorage.getItem(SYNCED_REVISION_KEY) === pool.revision) return;
  } catch {
    /* 저장소 없음 — 매번 맞춘다 */
  }
  try {
    const r = await plugin().sync(pool);
    if (r?.ok) {
      try {
        window.localStorage.setItem(SYNCED_REVISION_KEY, pool.revision);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* 다음 발견 때 다시 */
  }
}

function platformTag(): string {
  return Capacitor.getPlatform();
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
}

/** @internal vitest */
export function __resetNativeIntroClientForTests(): void {
  doneThisDocument = false;
  bridgeStarted = false;
  listeners.clear();
}
