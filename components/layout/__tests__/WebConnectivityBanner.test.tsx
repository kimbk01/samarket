// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

let mockPath = "/philife";
vi.mock("next/navigation", () => ({ usePathname: () => mockPath }));

import { WebConnectivityBanner } from "@/components/layout/WebConnectivityBanner";
import { __resetNetworkHealthForTest, evaluateAfterDibayTrouble } from "@/lib/net/network-health.client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => createRoot(host).render(<WebConnectivityBanner />));
  return host;
}

beforeEach(() => {
  __resetNetworkHealthForTest();
  document.body.innerHTML = "";
});

describe("WebConnectivityBanner — 휴대폰 문제 vs DIBAY 문제", () => {
  it("정상이면 아무것도 없음", () => {
    expect(render().textContent).toBe("");
  });
  it("DIBAY 만 닿지 않으면 DIBAY 문구(휴대폰 탓으로 안내하지 않음)", async () => {
    const host = render();
    await act(async () => {
      await evaluateAfterDibayTrouble({
        rawFetch: (() => Promise.resolve({})) as unknown as typeof fetch,
        checkUrl: () => "x",
        now: () => 0,
        stallMs: 8000,
      });
    });
    expect(host.querySelector("[data-network-notice]")?.getAttribute("data-network-notice")).toBe("dibay_unreachable");
    expect(host.textContent).toContain("DIBAY");
  });
  it("통화 화면은 예전 그대로 — 새 판정 띠를 띄우지 않는다", async () => {
    mockPath = "/community-messenger/calls-v4/abc";
    const host = render();
    await act(async () => {
      await evaluateAfterDibayTrouble({
        rawFetch: (() => Promise.resolve({})) as unknown as typeof fetch,
        checkUrl: () => "x",
        now: () => 0,
        stallMs: 8000,
      });
    });
    expect(host.textContent).toBe("");
    mockPath = "/philife";
  });
});
