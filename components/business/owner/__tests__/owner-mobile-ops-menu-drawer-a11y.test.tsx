// @vitest-environment jsdom
/**
 * 4단계 4-7 (IA-20) — 운영 메뉴 드로어 키보드 접근성: 전역 ESC · 포커스 트랩 · 포커스 복귀.
 */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerMobileOpsMenuDrawer } from "@/components/business/owner/OwnerMobileOpsMenuDrawer";
import {
  __setOverlayBackListenerDriverForTests,
  handleOverlayHardwareBack,
  overlayBackStackDepth,
} from "@/lib/ui/overlay-back-stack";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const onCloseSpy = vi.fn();

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="opener" onClick={() => setOpen(true)}>
        menu
      </button>
      <OwnerMobileOpsMenuDrawer
        open={open}
        onClose={() => {
          onCloseSpy();
          setOpen(false);
        }}
        scrimLabel="close"
        panelLabel="ops menu"
        topBar={
          <button type="button" data-testid="first">
            x
          </button>
        }
      >
        <a href="#orders" data-testid="middle">
          orders
        </a>
        <a href="#ads" data-testid="last">
          ads
        </a>
      </OwnerMobileOpsMenuDrawer>
    </>
  );
}

function q(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing ${id}`);
  return el;
}

function key(k: string, opts: KeyboardEventInit = {}) {
  const target = document.activeElement ?? document.body;
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));
  });
}

beforeEach(() => {
  onCloseSpy.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<Harness />));
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function openFromOpener() {
  const opener = q("opener");
  opener.focus();
  act(() => opener.click());
}

describe("OwnerMobileOpsMenuDrawer keyboard a11y (IA-20)", () => {
  it("open moves focus into the panel (first focusable)", () => {
    openFromOpener();
    expect(document.activeElement).toBe(q("first"));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
  });

  it("Tab on last wraps to first; Shift+Tab on first wraps to last (focus trap)", () => {
    openFromOpener();
    q("last").focus();
    key("Tab");
    expect(document.activeElement).toBe(q("first"));
    key("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(q("last"));
  });

  it("Tab from outside the panel is pulled back in", () => {
    openFromOpener();
    act(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    expect(document.activeElement).toBe(document.body);
    key("Tab");
    expect(document.activeElement).toBe(q("first"));
  });

  it("global ESC closes even when focus is not on the scrim, and focus returns to the opener", () => {
    openFromOpener();
    q("middle").focus();
    key("Escape");
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(q("opener"));
  });

  it("ESC is ignored while closed", () => {
    q("opener").focus();
    key("Escape");
    expect(onCloseSpy).not.toHaveBeenCalled();
  });

  it("Android hardware back closes the open drawer (overlay back stack), and releases the entry when closed", () => {
    __setOverlayBackListenerDriverForTests({ install: () => () => {} });
    try {
      expect(overlayBackStackDepth()).toBe(0);
      openFromOpener();
      expect(overlayBackStackDepth()).toBe(1);
      let handled = false;
      act(() => {
        handled = handleOverlayHardwareBack();
      });
      expect(handled).toBe(true);
      expect(onCloseSpy).toHaveBeenCalledTimes(1);
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(overlayBackStackDepth()).toBe(0);
    } finally {
      __setOverlayBackListenerDriverForTests(null);
    }
  });
});
