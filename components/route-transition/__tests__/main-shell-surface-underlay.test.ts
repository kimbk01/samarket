// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureMainShellSurfaceUnderlay,
  mountMainShellSurfaceUnderlay,
} from "@/components/route-transition/main-shell-surface-underlay";

function setup() {
  document.body.innerHTML = `
    <div id="host" style="position:relative">
      <div id="surface" data-main-shell-push-surface class="main-shell-push-surface">
        <header id="hdr" data-stores-home-header>홈</header>
        <main id="scroll" data-main-hub-scroll-body>목록</main>
      </div>
      <div id="handoff"></div>
    </div>`;
  const host = document.getElementById("host")!;
  const el = document.getElementById("surface") as HTMLDivElement;
  const rect = (top: number, left: number, w: number, h: number) =>
    ({ top, left, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top, toJSON() {} }) as DOMRect;
  host.getBoundingClientRect = () => rect(56, 0, 390, 700);
  el.getBoundingClientRect = () => rect(56, 0, 390, 700);
  document.getElementById("scroll")!.scrollTop = 420;
  return { host, el };
}

describe("MAIN surface 나가는 화면 밑그림 (배달 홈 ↔ 메뉴 페이지 흰 프레임 원인 수정)", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("커밋 직전 복제 — 스크롤 위치 기록·id 제거", () => {
    const { el } = setup();
    const cap = captureMainShellSurfaceUnderlay(el, "/stores", "/stores/browse/food")!;
    expect(cap).not.toBeNull();
    expect(cap.scrolls).toEqual([{ index: 1, top: 420, left: 0 }]);
    expect(cap.node.querySelector("[id]")).toBeNull();
    expect(cap.node.textContent).toContain("목록");
  });

  it("커밋 직후 surface 바로 뒤에 깔리고, surface 가 위(z 1)·불투명 — transform 전환 끝에 걷힌다", () => {
    const { host, el } = setup();
    const cap = captureMainShellSurfaceUnderlay(el, "/stores", "/stores/browse/food")!;
    el.innerHTML = '<header>메뉴 페이지</header><main data-main-hub-scroll-body id="newScroll">새 목록</main>';
    mountMainShellSurfaceUnderlay(el, cap, 720);

    const wrap = host.querySelector("[data-main-shell-surface-underlay]") as HTMLElement;
    expect(wrap).not.toBeNull();
    expect(el.nextSibling).toBe(wrap);
    expect(wrap.getAttribute("aria-hidden")).toBe("true");
    expect(wrap.style.pointerEvents).toBe("none");
    expect(el.style.zIndex).toBe("1");
    expect(el.style.backgroundColor).not.toBe("");
    /** 문서 순서상 실제 surface 가 먼저 — querySelector 는 복제본을 집지 않는다 */
    expect(document.querySelector("[data-main-hub-scroll-body]")?.id).toBe("newScroll");
    expect(wrap.querySelector("[data-main-shell-push-surface]")).toBeNull();

    const other = new Event("transitionend") as TransitionEvent;
    Object.defineProperty(other, "propertyName", { value: "opacity" });
    el.dispatchEvent(other);
    expect(host.querySelector("[data-main-shell-surface-underlay]")).not.toBeNull();

    const end = new Event("transitionend") as TransitionEvent;
    Object.defineProperty(end, "propertyName", { value: "transform" });
    el.dispatchEvent(end);
    expect(host.querySelector("[data-main-shell-surface-underlay]")).toBeNull();
    expect(el.style.zIndex).toBe("");
    expect(el.style.backgroundColor).toBe("");
  });

  it("전환 끝 신호가 없어도 상한 시간에 걷힌다 · 반환 함수로 즉시 걷기", () => {
    vi.useFakeTimers();
    const { host, el } = setup();
    mountMainShellSurfaceUnderlay(el, captureMainShellSurfaceUnderlay(el, "/stores", "/stores/browse/food")!, 720);
    vi.advanceTimersByTime(719);
    expect(host.querySelector("[data-main-shell-surface-underlay]")).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(host.querySelector("[data-main-shell-surface-underlay]")).toBeNull();

    const remove = mountMainShellSurfaceUnderlay(
      el,
      captureMainShellSurfaceUnderlay(el, "/stores/browse/food", "/stores")!,
      720
    );
    remove();
    expect(host.querySelector("[data-main-shell-surface-underlay]")).toBeNull();
  });
});
