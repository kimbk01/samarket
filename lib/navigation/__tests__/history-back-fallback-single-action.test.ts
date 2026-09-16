/**
 * SINGLE-ACTION — successful history back must cancel fallback push.
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";

describe("history-back-fallback single-action", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Simulate App Router history idx > 0 so canUseSafeInAppHistoryBack is true
    window.history.replaceState({ idx: 1 }, "", "/stores/store-a/p/prod-1");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancels fallback when URL leaves before within delay", () => {
    const pushes: string[] = [];
    const backs: number[] = [];
    const router = {
      back: () => {
        backs.push(1);
        // Soft back settles URL before timeout
        window.history.replaceState({ idx: 0 }, "", "/stores");
        window.dispatchEvent(new PopStateEvent("popstate"));
      },
      push: (href: string) => pushes.push(href),
    };

    runHistoryBackWithFallback(router, "/stores", 280);
    expect(backs).toEqual([1]);
    vi.advanceTimersByTime(280);
    expect(pushes).toEqual([]);
  });

  it("fires fallback only when URL stays stuck", () => {
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
});
