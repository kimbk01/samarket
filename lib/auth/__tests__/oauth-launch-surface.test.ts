import { describe, expect, it, vi } from "vitest";
import { waitForOAuthLaunchSurfaceAck } from "@/lib/auth/oauth-launch-surface";

describe("oauth-launch-surface", () => {
  it("resolves true when document is already hidden", async () => {
    vi.stubGlobal("document", { visibilityState: "hidden" });
    await expect(waitForOAuthLaunchSurfaceAck(100)).resolves.toBe(true);
    vi.unstubAllGlobals();
  });

  it("resolves true on visibilitychange to hidden", async () => {
    let visibilityState: DocumentVisibilityState = "visible";
    const listeners = new Map<string, Set<() => void>>();
    vi.stubGlobal("document", {
      get visibilityState() {
        return visibilityState;
      },
      addEventListener: (event: string, handler: () => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)?.add(handler);
      },
      removeEventListener: (event: string, handler: () => void) => {
        listeners.get(event)?.delete(handler);
      },
    });

    const promise = waitForOAuthLaunchSurfaceAck(500);
    visibilityState = "hidden";
    listeners.get("visibilitychange")?.forEach((handler) => handler());
    await expect(promise).resolves.toBe(true);
    vi.unstubAllGlobals();
  });
});
