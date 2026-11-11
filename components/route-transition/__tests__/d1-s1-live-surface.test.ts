// @vitest-environment jsdom
/**
 * D1 S1 (Owner 승인 2026-11-12 · docs/audit/d1-root-cause-total-design-2026-11-12.md §2 S1)
 * 「살아 있는 화면은 옮기지 않는다」 — 머리글 없는 화면도 두 화면 연출(children 을 연출 칸으로 옮김 + 이전 화면 React 사본)을
 * 쓰지 않는다. 통화 화면만 예외(통화 변경 규정). 이전 화면은 DOM 밑그림으로 같은 시간·곡선에 밀려 나간다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  captureMainShellSurfaceUnderlay,
  mountMainShellSurfaceUnderlay,
} from "@/components/route-transition/main-shell-surface-underlay";

const src = readFileSync(join(process.cwd(), "components/route-transition/AppRouteTransition.tsx"), "utf8");

describe("D1 S1 살아 있는 화면 고정", () => {
  it("두 화면 연출은 통화 화면으로 갈 때만 — 그 밖에는 같은 surface + 밑그림", () => {
    expect(src).toContain("const liveSurfaceSlide = fallbackEligible || !isCommunityMessengerCallPath(pathKey);");
    expect(src).toMatch(/pushAxis &&\s*liveSurfaceSlide &&/);
    expect(src).toMatch(/deliveryStackMs \?\? mypageMotionPushDurationMs\(kind\),\s*!fallbackEligible\s*\)/);
    expect(src).toContain(
      "!hubChromeHeader && !mainShellChildScrollLocked && !isCommunityMessengerCallPath(toPath);"
    );
  });

  it("밑그림 복제본은 숨긴 요소(보관 허브)를 빼고 스크롤 위치는 그대로", () => {
    document.body.innerHTML = `<div id="host" style="position:relative"><div id="surface"><section id="vis"><div id="sc" style="overflow:auto;height:10px"><p style="height:100px">a</p></div></section><section id="hid" style="display: none !important"><p>hidden hub</p></section></div></div>`;
    const el = document.getElementById("surface")!;
    Object.defineProperty(el, "getBoundingClientRect", { value: () => ({ top: 0, left: 0, width: 300, height: 500 }) });
    const host = document.getElementById("host")!;
    Object.defineProperty(host, "getBoundingClientRect", { value: () => ({ top: 0, left: 0, width: 300, height: 500 }) });
    const sc = document.getElementById("sc")!;
    Object.defineProperty(sc, "scrollTop", { value: 40, writable: true, configurable: true });
    const cap = captureMainShellSurfaceUnderlay(el, "/a", "/b")!;
    expect(cap.node.textContent).not.toContain("hidden hub");
    expect(cap.scrollTargets).toHaveLength(1);
    expect(cap.scrollTargets[0]!.el?.parentElement?.tagName).toBe("SECTION");
  });

  it("exit 를 주면 밑그림이 들어오는 화면과 같은 곡선으로 반대쪽으로 나간다", () => {
    document.body.innerHTML = `<div id="host"><div id="surface"></div></div>`;
    const el = document.getElementById("surface")!;
    const node = document.createElement("div");
    const remove = mountMainShellSurfaceUnderlay(
      el,
      { fromPath: "/a", toPath: "/b", node, top: 0, left: 0, width: 300, height: 500, scrolls: [], scrollTargets: [] },
      1040,
      { exitAxis: "rtl", durationMs: 440 }
    );
    const wrap = document.querySelector<HTMLElement>("[data-main-shell-surface-underlay]")!;
    expect(wrap.style.transform).toBe("translate3d(-100%, 0, 0)");
    expect(wrap.style.transition).toContain("440ms");
    expect(wrap.style.transition).toContain("cubic-bezier(0.25, 0.9, 0.35, 1)");
    remove();
    expect(document.querySelector("[data-main-shell-surface-underlay]")).toBeNull();
  });
});
