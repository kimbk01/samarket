/**
 * SINGLE-ACTION — proven in-app history must not arm fallback push.
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";

describe("history-back-fallback single-action", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("proven in-app history (idx>0): back only — never fallback push", () => {
    window.history.replaceState({ idx: 2 }, "", "/stores/store-a/p/prod-1");
    const pushes: string[] = [];
    const backs: number[] = [];
    const router = {
      back: () => {
        backs.push(1);
      },
      push: (href: string) => pushes.push(href),
    };

    runHistoryBackWithFallback(router, "/stores", 280);
    expect(backs).toEqual([1]);
    vi.advanceTimersByTime(500);
    expect(pushes).toEqual([]);
  });

  it("uncertain history with length>1: fires fallback only when URL stays stuck", () => {
    window.history.replaceState(null, "", "/stores/store-a");
    Object.defineProperty(document, "referrer", { configurable: true, get: () => "" });
    Object.defineProperty(window.history, "length", { configurable: true, get: () => 3 });
    const pushes: string[] = [];
    const router = {
      back: () => {
        /* URL unchanged */
      },
      push: (href: string) => pushes.push(href),
    };

    runHistoryBackWithFallback(router, "/stores", 280);
    vi.advanceTimersByTime(279);
    expect(pushes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(pushes).toEqual(["/stores"]);
  });

  it("uncertain history with length>1: cancels fallback when URL leaves before", () => {
    window.history.replaceState(null, "", "/stores/store-a");
    Object.defineProperty(document, "referrer", { configurable: true, get: () => "" });
    Object.defineProperty(window.history, "length", { configurable: true, get: () => 3 });
    const pushes: string[] = [];
    const router = {
      back: () => {
        window.history.replaceState(null, "", "/stores");
        window.dispatchEvent(new PopStateEvent("popstate"));
      },
      push: (href: string) => pushes.push(href),
    };

    runHistoryBackWithFallback(router, "/stores", 280);
    vi.advanceTimersByTime(280);
    expect(pushes).toEqual([]);
  });
});
