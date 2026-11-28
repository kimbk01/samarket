"use client";
/**
 * 앱 숨김·보임 시계 — 다시 열기 조회 판정(R5 `resume-resync-gate.ts`)과 재동기화 묶음(R2 `messenger-realtime-resync.ts`)이 같이 쓴다.
 * 2026-11-28 `resume-resync-gate.ts` 에서 옮김(동작 같음) + 「보이게 됨」 알림·지금 숨김 여부 추가.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/hidden-reconnect-resync-design-2026-11-28.md §3
 *
 * 숨김 = 문서 `visibilityState === "hidden"` 또는 네이티브 `appStateChange(isActive=false)` 뒤 아직 활성 신호 없음.
 * 보임 = `visibilitychange` visible 또는 네이티브 `appStateChange(isActive=true)` 중 먼저 오는 것
 *        (네이티브 WebView 는 복귀 때 visibilitychange 를 보내지 않는 경우가 있다 — 2026-10-25 실기).
 */

/**
 * 「방금 다시 열림」으로 보는 창. 보임이 된 지 이보다 오래면 지금 신호(창 포커스 등)는 새 다시 열기가 아니다 —
 * 그 사이 숨김이 없었으므로 숨김 시간 0으로 본다(옛 숨김 시간으로 매 포커스마다 조회하지 않게).
 */
export const RESUME_SIGNAL_WINDOW_MS = 5_000;

let hiddenAt: number | null = null;
let visibleAt: number | null = null;
let installed = false;
/** 네이티브가 비활성을 알린 뒤 아직 활성을 알리지 않았는가 */
let nativeInactive = false;
const visibleListeners = new Set<() => void>();

function emitVisible(): void {
  for (const cb of [...visibleListeners]) {
    try {
      cb();
    } catch {
      /* 받는 쪽 오류가 다른 받는 쪽을 막지 않게 */
    }
  }
}

/** 숨김 시작 — 이미 숨김 중이면(보임 이후 첫 숨김 신호가 아니면) 처음 시각을 유지한다 */
function markHidden(): void {
  const now = Date.now();
  if (hiddenAt != null && (visibleAt == null || hiddenAt > visibleAt)) return;
  hiddenAt = now;
}

/**
 * 숨김·보임 시각 기록을 단다(1번만). 쓰는 쪽이 시작할 때 부른다 — 모듈을 불러오는 것만으로는 달지 않는다.
 * 기록을 달기 전 숨김은 모르므로 0으로 본다(그 전 다시 열기는 앱 시작 직후뿐이다).
 */
export function ensureResumeVisibilityClock(): void {
  if (installed) return;
  if (typeof document === "undefined" || typeof document.addEventListener !== "function") return;
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  installed = true;
  if (document.visibilityState === "hidden") hiddenAt = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") markHidden();
    else {
      visibleAt = Date.now();
      /** 문서가 보이면 네이티브 활성 신호를 놓쳤어도 숨김이 아니다(분할 화면 등 짝이 안 맞는 신호 — 독립 재감사 2026-11-28) */
      nativeInactive = false;
      emitVisible();
    }
  });
  window.addEventListener("pagehide", markHidden);
  /** 네이티브 앱 상태 — WebView 숨김 이벤트가 늦거나 빠져도 백그라운드 시작 시각을 남긴다 */
  void import("@capacitor/core")
    .then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;
      return import("@capacitor/app").then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) {
            nativeInactive = true;
            markHidden();
            return;
          }
          nativeInactive = false;
          if (hiddenAt != null && (visibleAt == null || visibleAt < hiddenAt)) visibleAt = Date.now();
          emitVisible();
        })
      );
    })
    .catch(() => {
      /* 웹 이벤트만 쓴다 */
    });
}

/** 순수 계산 — 가장 최근 숨김 시간(ms). 기록을 달지 못했으면 모름 = 무한(→ 조회한다), 숨긴 적이 없으면 0 */
export function hiddenSpanFrom(input: {
  installed: boolean;
  hiddenAt: number | null;
  visibleAt: number | null;
  now: number;
}): number {
  const { installed: on, hiddenAt: h, visibleAt: v, now } = input;
  if (!on) return Number.POSITIVE_INFINITY;
  if (h == null) return 0;
  if (v != null && v >= h) {
    /** 보임이 된 지 오래 — 이번 신호는 새 다시 열기가 아니다(데스크톱 창 포커스 등) */
    if (now - v > RESUME_SIGNAL_WINDOW_MS) return 0;
    return v - h;
  }
  /** 아직 보임 시각이 안 찍혔다(네이티브 appStateChange 가 visibilitychange 보다 먼저 옴) — 숨김 시작부터 지금까지 */
  return Math.max(0, now - h);
}

/** 가장 최근에 숨겨져 있던 시간(ms) */
export function lastHiddenSpanMs(now: number = Date.now()): number {
  return hiddenSpanFrom({ installed, hiddenAt, visibleAt, now });
}

/** 지금 앱이 숨겨져 있는가 — 문서 숨김 또는 네이티브 비활성 */
export function appHiddenNow(): boolean {
  if (nativeInactive) return true;
  if (typeof document === "undefined") return false;
  return document.visibilityState === "hidden";
}

/** 앱이 보이게 될 때마다(웹·네이티브 신호 중 하나라도) 부른다. 반환 = 해제 */
export function onAppBecameVisible(cb: () => void): () => void {
  visibleListeners.add(cb);
  return () => {
    visibleListeners.delete(cb);
  };
}

/** 시험 전용 */
export function __resetAppVisibilityForTests(): void {
  hiddenAt = null;
  visibleAt = null;
  installed = false;
  nativeInactive = false;
  visibleListeners.clear();
}

/** 시험 전용 — 시계 이벤트 흉내 */
export function __simulateAppVisibilityForTests(ev: "native_inactive" | "native_active" | "doc_visible"): void {
  if (ev === "native_inactive") {
    nativeInactive = true;
    markHidden();
    return;
  }
  if (ev === "native_active" || ev === "doc_visible") nativeInactive = false;
  visibleAt = Date.now();
  emitVisible();
}
