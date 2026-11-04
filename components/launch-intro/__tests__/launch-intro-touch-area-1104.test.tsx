// @vitest-environment jsdom
/**
 * IN-N1 (2026-11-04) — 건너뛰기·CTA 누르는 영역 최소 44×44. 보이는 모양(패딩·배경·둥근 모서리)은 그대로,
 * 버튼 안 투명 hit area 가 최소 44px 를 보장하고 누르면 버튼 onClick 이 실행된다.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LAUNCH_INTRO_MIN_TOUCH_PX, LaunchIntroSceneView } from "@/components/launch-intro/LaunchIntroSceneView";
import { emptyLaunchIntroScene } from "@/lib/launch-intro/document";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});

async function render(onCta: () => void, onSkip: () => void) {
  const scene = { ...emptyLaunchIntroScene("scene-1"), cta: { label: "보러 가기", action: { type: "route" as const, path: "/events/e1" } } };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <LaunchIntroSceneView
        scene={scene}
        resolveImage={() => null}
        skipLabel="건너뛰기"
        showSkip
        animateEnter={false}
        playVideo={false}
        onCta={onCta}
        onSkip={onSkip}
      />
    );
  });
}

describe("IN-N1 — 누르는 영역 44×44", () => {
  it("건너뛰기·CTA 모두 최소 44px hit area 를 갖고, hit area 를 누르면 각 버튼 동작이 1회 실행된다", async () => {
    const onCta = vi.fn();
    const onSkip = vi.fn();
    await render(onCta, onSkip);
    expect(LAUNCH_INTRO_MIN_TOUCH_PX).toBe(44);
    for (const kind of ["skip", "cta"] as const) {
      const hit = document.querySelector<HTMLElement>(`[data-launch-intro-hit-area="${kind}"]`);
      expect(hit, kind).not.toBeNull();
      expect(hit!.style.width).toBe("max(100%, 44px)");
      expect(hit!.style.height).toBe("max(100%, 44px)");
      expect(hit!.style.position).toBe("absolute");
      expect(hit!.getAttribute("aria-hidden")).toBe("true");
      const btn = hit!.closest("button")!;
      // hit area 는 위치가 있는 버튼 안에 있어야 버튼 기준으로 퍼진다
      expect(["absolute", "relative"]).toContain(btn.style.position);
      await act(async () => hit!.click());
    }
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  it("보이는 모양은 그대로 — 건너뛰기 칩 패딩·배경, CTA 흰 알약 (서버 렌더 style 문자열)", () => {
    // jsdom 은 cqmin 값을 버리므로 React 서버 렌더 결과(실제 style 문자열)로 확인한다
    const scene = { ...emptyLaunchIntroScene("scene-1"), cta: { label: "보러 가기", action: { type: "route" as const, path: "/events/e1" } } };
    const html = renderToStaticMarkup(
      <LaunchIntroSceneView scene={scene} resolveImage={() => null} skipLabel="건너뛰기" showSkip animateEnter={false} playVideo={false} />
    );
    expect(html).toContain("padding:1.6cqmin 3.6cqmin");
    expect(html).toContain("background:rgba(0,0,0,0.28)");
    expect(html).toContain("padding:3.2cqmin 7cqmin");
    expect(html).toContain("background:white");
    expect(html).toContain("width:max(100%, 44px);height:max(100%, 44px)");
  });
});
