import { describe, expect, it } from "vitest";
import {
  readNonAdOpenOverlayCount,
  registerOpenOverlay,
  subscribeOpenOverlays,
} from "@/lib/ui/open-overlay-registry";

describe("G-8 open overlay registry", () => {
  it("counts non-ad overlays only and notifies on change", () => {
    let calls = 0;
    const unsub = subscribeOpenOverlays(() => {
      calls += 1;
    });
    const releaseAd = registerOpenOverlay({ ad: true });
    expect(readNonAdOpenOverlayCount()).toBe(0);
    const releaseDialog = registerOpenOverlay({ ad: false });
    expect(readNonAdOpenOverlayCount()).toBe(1);
    releaseDialog();
    expect(readNonAdOpenOverlayCount()).toBe(0);
    releaseAd();
    releaseAd();
    expect(readNonAdOpenOverlayCount()).toBe(0);
    expect(calls).toBe(5);
    unsub();
  });
});
