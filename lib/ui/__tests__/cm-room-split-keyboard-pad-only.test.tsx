/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import React, { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useCmRoomVisibleViewportShell } from "@/lib/ui/use-cm-room-visible-viewport-shell";

/**
 * SPL-04 — 분할 우측 방: 높이 권한 없이 키보드 열림 시 composer 하단 여백만 0.
 * 셸 height/max-height 를 쓰지 않는다 (분할 flex 레이아웃 유지).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setVv(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: { height, width, offsetTop: 0, addEventListener() {}, removeEventListener() {} },
  });
}

const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));

function Room({ layoutAuthority }: { layoutAuthority: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useCmRoomVisibleViewportShell({ enabled: true, shellRef: ref, layoutAuthority });
  return (
    <div ref={ref} data-cm-room="" className="cm-room-shell" data-testid="shell">
      <div className="cm-room-timeline" />
      <div className="cm-room-composer" />
    </div>
  );
}

describe("SPL-04 split keyboard pad-only", () => {
  it("keyboard closed → no inline height, composer var unset (CSS safe-bottom)", async () => {
    setVv(1280, 800);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<Room layoutAuthority={false} />));
    await act(frames);
    const shell = host.querySelector<HTMLElement>("[data-testid=shell]")!;
    expect(shell.dataset.cmKeyboardOpen).toBe("false");
    expect(shell.style.height).toBe("");
    expect(shell.style.getPropertyValue("--cm-room-composer-bottom-padding")).toBe("");

    // Android adjustResize: visual viewport shrinks by the keyboard
    setVv(1280, 460);
    await act(async () => window.dispatchEvent(new Event("resize")));
    await act(frames);
    expect(shell.dataset.cmKeyboardOpen).toBe("true");
    expect(shell.style.getPropertyValue("--cm-room-composer-bottom-padding")).toBe("0px");
    expect(shell.style.height).toBe("");
    expect(shell.style.maxHeight).toBe("");
    root.unmount();
    host.remove();
  });

  it("mobile (layout authority) still writes the shell height — unchanged contract", async () => {
    setVv(390, 844);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<Room layoutAuthority />));
    await act(frames);
    const shell = host.querySelector<HTMLElement>("[data-testid=shell]")!;
    expect(shell.style.height).toBe("844px");
    root.unmount();
    expect(shell.style.height).toBe("");
    expect(shell.style.maxHeight).toBe("");
    host.remove();
  });
});
