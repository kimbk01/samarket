/**
 * MAIN push surface — 나가는 화면 밑그림(underlay).
 *
 * 원인 (실측 2026-10-30 · Xiaomi): 배달 홈 → 메뉴 페이지(`/stores` → `/stores/browse/*`)는
 * `beginHubFallbackEnter` 가 **하나의** push surface 를 `translate3d(100%)` 에 세운 뒤 들어오게 한다.
 * 같은 커밋에서 홈 DOM 은 이미 새 페이지로 바뀌어 있어, 슬라이드 동안(그리고 새 층 첫 래스터가 늦는
 * 저사양 기기에서는 그보다 길게) surface 뒤 빈 배경(흰색)이 그대로 보였다.
 * 네이티브 push 처럼 **나가는 화면이 밑에 남아 있어야** 흰 프레임이 없다.
 *
 * 방법: 커밋 직전(`getSnapshotBeforeUpdate` — DOM 이 바뀌기 전) 마지막으로 그려진 surface 를 그대로 복제하고
 * (스크롤 위치 포함), 커밋 직후 surface 바로 뒤에 깔아 들어오는 슬라이드가 끝나면 걷는다.
 * 복제본은 `inert`·`aria-hidden`·포인터 없음 — 누름·포커스·보조기기에서 보이지 않는다.
 */

export type MainShellSurfaceUnderlayCapture = {
  fromPath: string;
  toPath: string;
  node: HTMLElement;
  /** surface 기준 host 안 위치 */
  top: number;
  left: number;
  width: number;
  height: number;
  scrolls: Array<{ index: number; top: number; left: number }>;
  /** 복제본 안 스크롤 위치를 다시 줄 요소(숨긴 요소를 뺀 뒤에도 같은 요소) */
  scrollTargets: Array<{ el: HTMLElement | null; top: number; left: number }>;
};

function isTransparent(color: string): boolean {
  return !color || color === "transparent" || /rgba\([^)]*,\s*0\)$/.test(color);
}

function resolveBackdropColor(from: HTMLElement): string {
  for (let n: HTMLElement | null = from; n; n = n.parentElement) {
    const c = getComputedStyle(n).backgroundColor;
    if (!isTransparent(c)) return c;
  }
  return "#ffffff";
}

/** 커밋 직전 surface 복제 — DOM 이 아직 나가는 화면일 때만 호출한다 */
export function captureMainShellSurfaceUnderlay(
  el: HTMLElement,
  fromPath: string,
  toPath: string
): MainShellSurfaceUnderlayCapture | null {
  const host = el.parentElement;
  if (!host) return null;
  const rect = el.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const all = el.querySelectorAll<HTMLElement>("*");
  const scrolls: MainShellSurfaceUnderlayCapture["scrolls"] = [];
  for (let i = 0; i < all.length; i += 1) {
    const n = all[i]!;
    if (n.scrollTop > 0 || n.scrollLeft > 0) scrolls.push({ index: i, top: n.scrollTop, left: n.scrollLeft });
  }

  const node = el.cloneNode(true) as HTMLElement;
  node.removeAttribute("id");
  for (const n of node.querySelectorAll("[id]")) n.removeAttribute("id");
  /**
   * D1 S1: 숨겨 둔 요소(하단 탭 보관 허브 — `display: none`)는 화면에 안 보이므로 복제본에서 뺀다.
   * 보이는 모습은 같고, 숨긴 허브 수천 개 요소를 복제·배치하지 않는다. 스크롤 기록(index)은 복제 직후 기준이라
   * 지운 뒤에도 맞도록 지우기 전에 대상 요소를 잡아 둔다.
   */
  const cloneAll = node.querySelectorAll<HTMLElement>("*");
  const scrollTargets = scrolls.map((s) => ({ el: cloneAll[s.index] ?? null, top: s.top, left: s.left }));
  for (const n of Array.from(node.querySelectorAll<HTMLElement>("[style]"))) {
    if (n.style.getPropertyValue("display") === "none") n.remove();
  }

  return {
    fromPath,
    toPath,
    node,
    top: rect.top - hostRect.top,
    left: rect.left - hostRect.left,
    width: rect.width,
    height: rect.height,
    scrolls,
    scrollTargets,
  };
}

/**
 * 커밋 직후 — 복제본을 surface 뒤에 깔고, surface 의 들어오는 transform 전환이 끝나면 걷는다.
 * 반환 함수 = 즉시 걷기 (다음 경로 변경·언마운트).
 */
export function mountMainShellSurfaceUnderlay(
  el: HTMLElement,
  capture: MainShellSurfaceUnderlayCapture,
  maxMs: number,
  /** D1 S1: 주면 밑그림이 들어오는 화면과 같은 시간·곡선으로 반대쪽으로 밀려 나간다(예전 두 화면 연출과 같은 모양) */
  exit?: { exitAxis: "ltr" | "rtl"; durationMs: number }
): () => void {
  const host = el.parentElement;
  if (!host) return () => {};

  const wrap = document.createElement("div");
  wrap.setAttribute("data-main-shell-surface-underlay", capture.fromPath);
  wrap.setAttribute("aria-hidden", "true");
  wrap.inert = true;
  Object.assign(wrap.style, {
    position: "absolute",
    top: `${capture.top}px`,
    left: `${capture.left}px`,
    width: `${capture.width}px`,
    height: `${capture.height}px`,
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "0",
  } satisfies Partial<CSSStyleDeclaration>);

  const node = capture.node;
  node.removeAttribute("data-main-shell-push-surface");
  node.style.transform = "none";
  node.style.transition = "none";
  node.style.width = "100%";
  node.style.height = "100%";
  wrap.appendChild(node);

  /**
   * surface 가 밑그림 위에 그려지도록 (host 는 `relative isolate`).
   * surface 자체 배경이 투명이면 들어오는 화면의 빈 곳으로 밑그림이 비치므로, 지금까지 보이던
   * 바탕(가장 가까운 불투명 조상 배경)을 surface 에 잠시 준다.
   */
  const prevZ = el.style.zIndex;
  const prevBg = el.style.backgroundColor;
  el.style.zIndex = "1";
  if (isTransparent(getComputedStyle(el).backgroundColor)) {
    el.style.backgroundColor = resolveBackdropColor(host);
  }
  host.insertBefore(wrap, el.nextSibling);

  for (const s of capture.scrollTargets) {
    if (!s.el || !s.el.isConnected) continue;
    s.el.scrollTop = s.top;
    s.el.scrollLeft = s.left;
  }

  if (exit) {
    /** 들어오는 surface 의 enter 클래스와 같은 프레임에 시작 — 같은 곡선(`globals.css` main-shell-push-surface-enter-*) */
    wrap.style.transform = "translate3d(0, 0, 0)";
    wrap.style.willChange = "transform";
    void wrap.offsetWidth;
    wrap.style.transition = `transform ${exit.durationMs}ms cubic-bezier(0.25, 0.9, 0.35, 1)`;
    wrap.style.transform = exit.exitAxis === "rtl" ? "translate3d(-100%, 0, 0)" : "translate3d(100%, 0, 0)";
  }

  let done = false;
  const remove = () => {
    if (done) return;
    done = true;
    el.removeEventListener("transitionend", onEnd);
    window.clearTimeout(timer);
    wrap.remove();
    el.style.zIndex = prevZ;
    el.style.backgroundColor = prevBg;
  };
  const onEnd = (ev: TransitionEvent) => {
    if (ev.target !== el || ev.propertyName !== "transform") return;
    remove();
  };
  el.addEventListener("transitionend", onEnd);
  const timer = window.setTimeout(remove, maxMs);
  return remove;
}
