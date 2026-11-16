// @vitest-environment jsdom
/**
 * v5 회전 애니메이션 — 앱이 떠 있는 동안 메뉴 형태가 바뀔 때만 움직이고, 앱 시작(기기 판정 전 → 후)에는 움직이지 않는다.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NAV_PRESENTATION_SWITCH_MS,
  NAV_SWITCHING_HTML_ATTR,
  useNavPresentationSwitchMotion,
  type NavPresentationEnter,
} from "@/lib/device/use-nav-presentation-switch-motion";
import type { DibayNavigationPresentation } from "@/lib/device/dibay-shell-resolver";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

function Probe({ p, resolved }: { p: DibayNavigationPresentation; resolved: boolean }) {
  const enter = useNavPresentationSwitchMotion(p, resolved);
  return createElement("i", { "data-enter": enter ?? "" });
}
const draw = (p: DibayNavigationPresentation, resolved = true) =>
  act(() => root.render(createElement(Probe, { p, resolved })));
const seen = (): NavPresentationEnter => (host.querySelector("i")?.getAttribute("data-enter") || null) as NavPresentationEnter;

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("메뉴 형태 전환 애니메이션 (v5)", () => {
  it("앱 시작(판정 전 하단 탭 → 판정 후 세로 메뉴)에는 움직이지 않는다", () => {
    draw("EXISTING_MAIN_BOTTOM_NAV", false);
    draw("DESKTOP_SIDE_RAIL", true);
    expect(seen()).toBe(null);
    expect(document.documentElement.hasAttribute(NAV_SWITCHING_HTML_ATTR)).toBe(false);
  });

  it("가로 → 세로: 하단 탭이 올라오고 280ms 뒤 끝난다", () => {
    draw("DESKTOP_SIDE_RAIL");
    draw("EXISTING_MAIN_BOTTOM_NAV");
    expect(seen()).toBe("bottom");
    expect(document.documentElement.getAttribute(NAV_SWITCHING_HTML_ATTR)).toBe("bottom");
    act(() => vi.advanceTimersByTime(NAV_PRESENTATION_SWITCH_MS + 40));
    expect(seen()).toBe(null);
    expect(document.documentElement.hasAttribute(NAV_SWITCHING_HTML_ATTR)).toBe(false);
  });

  it("세로 → 가로: 세로 메뉴가 왼쪽에서 들어온다", () => {
    draw("EXISTING_MAIN_BOTTOM_NAV");
    draw("DESKTOP_SIDE_RAIL");
    expect(seen()).toBe("rail");
  });

  it("형태가 그대로면(창 크기만 바뀜) 움직이지 않는다", () => {
    draw("DESKTOP_SIDE_RAIL");
    draw("DESKTOP_SIDE_RAIL");
    expect(seen()).toBe(null);
  });
});
