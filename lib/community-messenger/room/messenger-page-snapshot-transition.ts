"use client";

/**
 * 채팅방 진입·퇴장 흰 화면 제거 — 화면 전환 순간에만 현재 화면을 시각 복사본(DOM clone)으로 덮는다.
 * 라우트·레이아웃 구조는 바꾸지 않는다(목록을 방 뒤에 상주시키는 구조 변경은 기기에서 실패해 되돌림).
 *
 * - 진입: 탭 직전 목록 화면 복사본을 최상단에 고정 → 라우트가 바뀌는 동안(흰 화면 구간) 목록이 그대로 보인다.
 *   방이 마운트되어 우→좌로 들어올 때, 복사본은 방의 왼쪽 가장자리까지만 보이도록 같은 시간·곡선으로 잘라 낸다
 *   (= 방이 목록 위로 밀고 들어오는 모습). 방 준비가 늦으면 복사본 위에 작은 로딩 표시.
 * - 퇴장: 방 화면 복사본을 최상단에 고정한 채 즉시 목록으로 이동 → 목록이 그려지면 복사본을 오른쪽으로 밀어낸다.
 *
 * 복사본은 pointer-events 없음·inert·aria-hidden. 스크립트가 찾는 표식(data-*)과 id 는 제거해 실제 화면과 혼동 없음.
 * 어떤 경우에도 시간 제한으로 반드시 제거된다.
 */

const LAYER_ATTR = "data-cm-page-snapshot";
const LAYER_Z_INDEX = "2147483000";
/** 진입 복사본 최대 유지 — 방이 끝내 안 열리면(네비게이션 취소 등) 걷어 낸다 */
const ENTRY_MAX_MS = 3000;
/** 이 시간 안에 방이 안 들어오면 복사본 위에 로딩 표시 */
const ENTRY_SPINNER_DELAY_MS = 450;
/** 퇴장: 목록이 그려지기를 기다리는 최대 시간 */
const EXIT_WAIT_LIST_MAX_MS = 1500;

/** 복사본에서 제거하는 표식 — 문서 전역 querySelector 로 실제 화면을 찾는 코드가 복사본에 걸리지 않게 */
const STRIP_ATTRS = [
  "id",
  "data-main-hub-scroll-body",
  "data-cm-timeline-message-row",
  "data-cm-message-id",
  "data-messenger-room-animation-phase",
  "data-cm-messenger-home-root",
  "data-messenger-shell",
  "data-app-sticky-header",
  "data-cm-room-segment-layout",
] as const;

type Layer = {
  el: HTMLDivElement;
  timers: number[];
  removed: boolean;
};

let entryLayer: Layer | null = null;

function canRun(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  return true;
}

function buildLayer(kind: "entry" | "exit"): Layer | null {
  const root = document.querySelector<HTMLElement>(".app-shell");
  if (!root) return null;
  let clone: HTMLElement;
  try {
    clone = root.cloneNode(true) as HTMLElement;
  } catch {
    return null;
  }
  const rect = root.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.setAttribute(LAYER_ATTR, kind);
  layer.setAttribute("aria-hidden", "true");
  layer.inert = true;
  const bg = getComputedStyle(document.body).backgroundColor;
  Object.assign(layer.style, {
    position: "fixed",
    inset: "0",
    zIndex: LAYER_Z_INDEX,
    pointerEvents: "none",
    overflow: "hidden",
    /** 고정 위치 자손도 이 레이어 기준으로 그려지고 잘리도록(clip-path·transform 적용 대상) */
    transform: "translate3d(0,0,0)",
    background: bg && bg !== "rgba(0, 0, 0, 0)" ? bg : "#fff",
    contain: "layout paint",
  } satisfies Partial<CSSStyleDeclaration>);
  Object.assign(clone.style, {
    position: "absolute",
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
  } satisfies Partial<CSSStyleDeclaration>);
  layer.appendChild(clone);
  document.body.appendChild(layer);

  /** 스크롤 위치 복사 — cloneNode 는 scrollTop 을 복사하지 않는다(목록·대화가 맨 위로 튀지 않게). DOM 순서 동일. */
  try {
    const src = root.querySelectorAll<HTMLElement>("*");
    const dst = clone.querySelectorAll<HTMLElement>("*");
    if (src.length === dst.length) {
      for (let i = 0; i < src.length; i += 1) {
        const s = src[i]!;
        if (s.scrollTop > 0 || s.scrollLeft > 0) {
          const d = dst[i]!;
          d.scrollTop = s.scrollTop;
          d.scrollLeft = s.scrollLeft;
        }
      }
    }
  } catch {
    /* 시각 보조 — 실패해도 진행 */
  }
  try {
    clone.querySelectorAll("video, audio, iframe, script, object, embed").forEach((n) => n.remove());
    const all = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];
    for (const el of all) {
      for (const a of STRIP_ATTRS) {
        if (el.hasAttribute(a)) el.removeAttribute(a);
      }
    }
  } catch {
    /* noop */
  }
  return { el: layer, timers: [], removed: false };
}

function removeLayer(layer: Layer | null, fadeMs = 0): void {
  if (!layer || layer.removed) return;
  layer.removed = true;
  for (const t of layer.timers) window.clearTimeout(t);
  const el = layer.el;
  if (fadeMs <= 0) {
    el.remove();
    return;
  }
  el.style.transition = `opacity ${fadeMs}ms ease-out`;
  el.style.opacity = "0";
  window.setTimeout(() => el.remove(), fadeMs + 40);
}

function appendSpinner(layer: Layer): void {
  if (layer.removed) return;
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "40px",
    height: "40px",
    marginLeft: "-20px",
    marginTop: "-20px",
    borderRadius: "9999px",
    background: "rgba(0,0,0,0.42)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } satisfies Partial<CSSStyleDeclaration>);
  const ring = document.createElement("div");
  ring.className = "animate-spin";
  Object.assign(ring.style, {
    width: "20px",
    height: "20px",
    borderRadius: "9999px",
    border: "2px solid rgba(255,255,255,0.95)",
    borderTopColor: "transparent",
  } satisfies Partial<CSSStyleDeclaration>);
  wrap.appendChild(ring);
  layer.el.appendChild(wrap);
}

/** 방으로 이동하기 직전(탭) — 목록 화면을 고정해 흰 화면 구간을 가린다. */
export function beginMessengerRoomEntrySnapshot(): void {
  if (!canRun()) return;
  removeLayer(entryLayer);
  entryLayer = null;
  const layer = buildLayer("entry");
  if (!layer) return;
  entryLayer = layer;
  layer.timers.push(window.setTimeout(() => appendSpinner(layer), ENTRY_SPINNER_DELAY_MS));
  layer.timers.push(
    window.setTimeout(() => {
      if (entryLayer === layer) entryLayer = null;
      removeLayer(layer, 160);
    }, ENTRY_MAX_MS)
  );
}

export function hasMessengerRoomEntrySnapshot(): boolean {
  return entryLayer != null && !entryLayer.removed;
}

/**
 * 방이 화면 밖(오른쪽 `startOffsetRatio`)에서 들어오기 시작할 때 — 복사본을 방의 왼쪽 가장자리까지만 보이게 잘라
 * 같은 시간·곡선으로 함께 줄인다. 끝나면 제거.
 */
export function revealMessengerRoomEntrySnapshot(args: {
  durationMs: number;
  easing: string;
  startOffsetRatio: number;
}): void {
  const layer = entryLayer;
  if (!layer || layer.removed) return;
  entryLayer = null;
  for (const t of layer.timers) window.clearTimeout(t);
  layer.timers = [];
  layer.el.querySelectorAll(":scope > div:not(.app-shell)").forEach((n) => n.remove());
  const el = layer.el;
  const rightInsetStart = Math.max(0, Math.min(100, (1 - args.startOffsetRatio) * 100));
  el.style.clipPath = `inset(0 ${rightInsetStart}% 0 0)`;
  void el.offsetWidth;
  el.style.transition = `clip-path ${args.durationMs}ms ${args.easing}`;
  el.style.clipPath = "inset(0 100% 0 0)";
  layer.timers.push(window.setTimeout(() => removeLayer(layer), args.durationMs + 60));
}

/** 진입 애니메이션 없이 방이 열리는 경우(축소 모션·분할 화면 등) — 즉시 제거 */
export function dismissMessengerRoomEntrySnapshot(): void {
  const layer = entryLayer;
  entryLayer = null;
  removeLayer(layer);
}

/**
 * 방에서 나가기 — 방 화면 복사본을 고정한 뒤 `navigate()` 로 즉시 목록 이동,
 * 목록이 그려지면 복사본을 오른쪽으로 밀어낸다. 복사본을 만들 수 없으면 false(호출부 기존 애니메이션 사용).
 */
export function runMessengerRoomExitWithSnapshot(args: {
  navigate: () => void;
  durationMs: number;
  easing: string;
}): boolean {
  if (!canRun()) return false;
  dismissMessengerRoomEntrySnapshot();
  const layer = buildLayer("exit");
  if (!layer) return false;
  args.navigate();
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const width = window.innerWidth || 400;
  const slideOut = () => {
    if (layer.removed) return;
    const el = layer.el;
    el.style.background = "transparent";
    void el.offsetWidth;
    el.style.transition = `transform ${args.durationMs}ms ${args.easing}`;
    el.style.transform = `translate3d(${width}px,0,0)`;
    layer.timers.push(window.setTimeout(() => removeLayer(layer), args.durationMs + 60));
  };
  let stableFrames = 0;
  const waitForList = () => {
    if (layer.removed) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const roomGone = !document.querySelector(".app-shell [data-messenger-room-animation-phase]");
    /** 메신저 목록이면 목록 루트가 그려질 때까지, 다른 화면이면 잠시 뒤 본문(main) 기준 */
    const listPainted =
      Boolean(document.querySelector(".app-shell [data-cm-messenger-home-root]")) ||
      (now - startedAt > 400 && Boolean(document.querySelector(".app-shell main")));
    if (roomGone && listPainted) stableFrames += 1;
    if (stableFrames >= 2 || now - startedAt > EXIT_WAIT_LIST_MAX_MS) {
      slideOut();
      return;
    }
    window.requestAnimationFrame(waitForList);
  };
  window.requestAnimationFrame(waitForList);
  layer.timers.push(window.setTimeout(() => removeLayer(layer, 160), EXIT_WAIT_LIST_MAX_MS + args.durationMs + 600));
  return true;
}
