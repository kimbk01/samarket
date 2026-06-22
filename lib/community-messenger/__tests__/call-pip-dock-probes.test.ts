/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllCommunityCallLocalSessionFlags,
  dockCommunityCall,
  enterAndroidOsPipCommunityCall,
  forceDisposeDetachedCommunityCall,
} from "@/lib/community-messenger/call-presentation-ownership";
import { resetCallDockPresentation } from "@/lib/community-messenger/call-dock-presentation";
import {
  ANDROID_OS_PIP_SAFE_SELECTOR,
  CALL_DOCK_LAYER_SELECTOR,
  compareRectTopDeltaPx,
  evaluateDockScrollStabilityPass,
  evaluateScenarioVerdict,
  evaluateVideoIdentityStablePass,
  readAndroidOsPipSafeModeProbe,
  readCallDockLayerGateProbe,
  readCallOverlaySuppressProbe,
  readCallPresentationSurfaceProbe,
  readCallPipDockProbeSnapshot,
  readDockLayerRectProbe,
  readDockLayerScrollDeltaProbe,
  readPresentationMutualExclusiveProbe,
  readVideoElementIdentityProbe,
} from "@/lib/community-messenger/qa/call-pip-dock-probes";
import { CALL_DOCK_LAYER_Z_INDEX } from "@/lib/community-messenger/call-ui/call-dock-theme";

function createSessionStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

function createWindowStub(sessionStorage: Storage): Window & { scrollY: number } {
  const win = {
    sessionStorage,
    localStorage: sessionStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    location: { pathname: "/community-messenger/calls/test", search: "" } as Location,
    scrollY: 0,
    scrollTo(_x: number, y: number) {
      win.scrollY = y;
    },
  };
  return win as unknown as Window & { scrollY: number };
}

function mountDockLayerDom(): HTMLElement {
  const layer = document.createElement("div");
  layer.setAttribute("data-call-dock-layer", "");
  layer.style.position = "fixed";
  layer.style.top = "12px";
  layer.style.left = "12px";
  layer.style.zIndex = String(CALL_DOCK_LAYER_Z_INDEX);
  document.body.appendChild(layer);
  return layer;
}

describe("call pip dock probes", () => {
  beforeEach(() => {
    const storage = createSessionStorageStub();
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("window", createWindowStub(storage));
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      }
    );
    resetCallDockPresentation();
    document.body.innerHTML = "";
  });

  afterEach(async () => {
    resetCallDockPresentation();
    await forceDisposeDetachedCommunityCall();
    clearAllCommunityCallLocalSessionFlags();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("readCallPresentationSurfaceProbe follows SSOT", () => {
    dockCommunityCall({ sessionId: "call-d", roomId: "room-d", cleanup: vi.fn(async () => {}) });
    expect(readCallPresentationSurfaceProbe("call-d")).toBe("DOCK");
    expect(readCallDockLayerGateProbe()).toBe(true);
    expect(readCallOverlaySuppressProbe()).toBe(true);
    expect(readPresentationMutualExclusiveProbe("DOCK")).toBe(true);
    expect(readPresentationMutualExclusiveProbe("ANDROID_OS_PIP")).toBe(false);
  });

  it("readAndroidOsPipSafeModeProbe activates only for ANDROID_OS_PIP", () => {
    enterAndroidOsPipCommunityCall({
      sessionId: "call-p",
      roomId: "room-p",
      cleanup: vi.fn(async () => {}),
    });
    expect(readAndroidOsPipSafeModeProbe("call-p")).toBe(true);
    expect(readCallPresentationSurfaceProbe("call-p")).toBe("ANDROID_OS_PIP");
    expect(readCallDockLayerGateProbe()).toBe(false);
  });

  it("readDockLayerRectProbe reads fixed dock layer", () => {
    const layer = mountDockLayerDom();
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({
      top: 12,
      left: 12,
      width: 320,
      height: 56,
      right: 332,
      bottom: 68,
      x: 12,
      y: 12,
      toJSON: () => ({}),
    });
    const rect = readDockLayerRectProbe(document);
    expect(rect).not.toBeNull();
    expect(rect?.zIndex).toBe(CALL_DOCK_LAYER_Z_INDEX);
    expect(rect?.left).toBe(12);
  });

  it("readDockLayerScrollDeltaProbe returns 0 for fixed dock", async () => {
    mountDockLayerDom();
    Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
    const delta = await readDockLayerScrollDeltaProbe({ scrollDeltaPx: 320 });
    expect(delta).toBe(0);
    expect(evaluateDockScrollStabilityPass(delta)).toBe(true);
  });

  it("readVideoElementIdentityProbe stays stable across reads", () => {
    const shell = document.createElement("div");
    shell.setAttribute("data-call-screen-shell", "");
    const video = document.createElement("video");
    shell.appendChild(video);
    document.body.appendChild(shell);

    const first = readVideoElementIdentityProbe(document);
    const second = readVideoElementIdentityProbe(document);
    expect(evaluateVideoIdentityStablePass(first, second)).toBe(true);
  });

  it("readCallPipDockProbeSnapshot aggregates presentation probes", () => {
    dockCommunityCall({ sessionId: "call-s", roomId: "room-s", cleanup: vi.fn(async () => {}) });
    const snap = readCallPipDockProbeSnapshot("call-s");
    expect(snap.surface).toBe("DOCK");
    expect(snap.dockLayerVisible).toBe(true);
    expect(snap.presentationMutualExclusive).toBe(true);
  });

  it("evaluateScenarioVerdict shapes harness JSON", () => {
    const verdict = evaluateScenarioVerdict({
      scenario: "full-dock-cycle",
      iterations: 100,
      pass: 100,
      fail: 0,
      maxPositionDeltaPx: 0,
      videoRecreateCount: 0,
    });
    expect(verdict.pass).toBe(100);
    expect(verdict.maxPositionDeltaPx).toBe(0);
  });

  it("compareRectTopDeltaPx measures position jump", () => {
    expect(
      compareRectTopDeltaPx(
        { top: 12, left: 12, width: 300, height: 56, zIndex: 1270 },
        { top: 12, left: 12, width: 300, height: 56, zIndex: 1270 }
      )
    ).toBe(0);
    expect(
      compareRectTopDeltaPx(
        { top: 12, left: 12, width: 300, height: 56, zIndex: 1270 },
        { top: 20, left: 12, width: 300, height: 56, zIndex: 1270 }
      )
    ).toBe(8);
  });

  it("ANDROID_OS_PIP safe selector constants are defined for e2e", () => {
    expect(ANDROID_OS_PIP_SAFE_SELECTOR).toBe("[data-call-android-os-pip-safe]");
    expect(CALL_DOCK_LAYER_SELECTOR).toBe("[data-call-dock-layer]");
  });
});
