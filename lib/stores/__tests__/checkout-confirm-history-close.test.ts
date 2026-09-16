/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_CONFIRM_HISTORY_KEY,
  bindCheckoutConfirmHistoryClose,
} from "@/lib/stores/checkout-confirm-history-close";

describe("bindCheckoutConfirmHistoryClose", () => {
  afterEach(() => {
    // Clear sentinel flag without relying on async history navigation.
    try {
      window.history.replaceState({}, "");
    } catch {
      /* ignore */
    }
  });

  it("binds sentinel on same path and popstate closes once", () => {
    const onClose = vi.fn();
    const startPath = window.location.pathname;
    const binding = bindCheckoutConfirmHistoryClose({ onClose });

    expect(window.history.state?.[CHECKOUT_CONFIRM_HISTORY_KEY]).toBe(true);
    expect(window.location.pathname).toBe(startPath);

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe(startPath);

    binding.dispose();
  });

  it("busy popstate re-arms sentinel and does not close", () => {
    const onClose = vi.fn();
    const binding = bindCheckoutConfirmHistoryClose({
      onClose,
      isBusy: () => true,
    });

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onClose).not.toHaveBeenCalled();
    expect(window.history.state?.[CHECKOUT_CONFIRM_HISTORY_KEY]).toBe(true);

    binding.dispose();
  });

  it("programmatic dispose does not call onClose", () => {
    const onClose = vi.fn();
    const pushSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const binding = bindCheckoutConfirmHistoryClose({ onClose });
    binding.dispose();
    expect(onClose).not.toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalled();
    pushSpy.mockRestore();
  });
});
