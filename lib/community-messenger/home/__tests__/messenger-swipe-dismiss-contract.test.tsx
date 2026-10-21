/**
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isMessengerSwipeInsideTarget,
  useMessengerSwipeDismissTriggers,
} from "@/lib/community-messenger/home/use-messenger-swipe-dismiss-triggers";
import { __setOverlayBackListenerDriverForTests, handleOverlayHardwareBack } from "@/lib/ui/overlay-back-stack";
import { MESSENGER_SWIPE_AUTO_CLOSE_MS } from "@/lib/messenger-policy/chat-room-swipe-actions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness(props: { open: boolean; onDismiss: () => void }) {
  useMessengerSwipeDismissTriggers(props.open, props.onDismiss);
  return createElement(
    "div",
    null,
    createElement("div", { "data-messenger-chat-row": "true", id: "row" }, createElement("button", { id: "act" })),
    createElement("div", { id: "header" })
  );
}

describe("L-4/L-5 useMessengerSwipeDismissTriggers", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    __setOverlayBackListenerDriverForTests({ install: () => () => {} });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    __setOverlayBackListenerDriverForTests(null);
  });

  const pointerDown = (el: Element) =>
    el.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));

  it("closes on outside tap (header/bottom tab), not on row or its action buttons", () => {
    const onDismiss = vi.fn();
    act(() => root.render(createElement(Harness, { open: true, onDismiss })));
    pointerDown(document.getElementById("act")!);
    pointerDown(document.getElementById("row")!);
    expect(onDismiss).not.toHaveBeenCalled();
    pointerDown(document.getElementById("header")!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("closes on background and on Android hardware back (back is consumed)", () => {
    const onDismiss = vi.fn();
    act(() => root.render(createElement(Harness, { open: true, onDismiss })));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(handleOverlayHardwareBack()).toBe(true);
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it("installs nothing while closed", () => {
    const onDismiss = vi.fn();
    act(() => root.render(createElement(Harness, { open: false, onDismiss })));
    pointerDown(document.getElementById("header")!);
    expect(handleOverlayHardwareBack()).toBe(false);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("inside-target detection covers chat rows and call-log rows", () => {
    const li = document.createElement("li");
    li.setAttribute("data-call-log-row", "true");
    const child = document.createElement("span");
    li.appendChild(child);
    expect(isMessengerSwipeInsideTarget(child)).toBe(true);
    expect(isMessengerSwipeInsideTarget(document.body)).toBe(false);
  });
});

describe("L-1~L-3/L-11 MessengerChatListItem source contract", () => {
  const src = readFileSync(
    path.join(process.cwd(), "components/community-messenger/MessengerChatListItem.tsx"),
    "utf8"
  );
  it("L-1 closes when parent state leaves this row, including null", () => {
    expect(src).toMatch(/openedSwipeItemId !== swipeItemId && !dragRef\.current\.dragging/);
    expect(src).not.toMatch(/if \(openedSwipeItemId && openedSwipeItemId !== swipeItemId\) \{\n\s+dragXRef/);
  });
  it("L-2 pointercancel snaps closed", () => {
    expect(src).toMatch(/const wasDragging = dragRef\.current\.dragging;\n\s+dragRef\.current\.active = false;/);
  });
  it("L-3 first tap while another row is open does not navigate", () => {
    expect(src).toMatch(/tapNavigateArmedRef\.current = !closingOtherRow;/);
  });
  it("L-4 auto-close uses the policy constant (5s)", () => {
    expect(MESSENGER_SWIPE_AUTO_CLOSE_MS).toBe(5000);
    expect(src).toMatch(/MESSENGER_SWIPE_AUTO_CLOSE_MS\)/);
  });
  it("L-11 closed action buttons are not focusable", () => {
    expect(src).toMatch(/tabIndex=\{dragX === 0 \? -1 : undefined\}/);
  });
  it("home and trade list both wire the dismiss triggers", () => {
    for (const f of [
      "components/community-messenger/CommunityMessengerHome.tsx",
      "components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate.tsx",
    ]) {
      expect(readFileSync(path.join(process.cwd(), f), "utf8")).toMatch(
        /useMessengerSwipeDismissTriggers\(openedSwipeItemId != null, dismissOpenedSwipeItem\)/
      );
    }
  });
});
