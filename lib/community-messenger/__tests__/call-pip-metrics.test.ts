import { describe, expect, it, vi } from "vitest";
import {
  CALL_PIP_SNAP_STORAGE_KEY,
  clampCallPipDragDelta,
  computeCallPipCornerAnchors,
  computeCallPipDimensions,
  fromSnapStorageValue,
  migrateLegacyCallPipSnapStorage,
  readCallPipSnapPosition,
  snapCallPipToNearestCorner,
  toSnapStorageValue,
  writeCallPipSnapPosition,
} from "@/lib/community-messenger/call-pip-metrics";

describe("computeCallPipDimensions", () => {
  it("clamps mobile width to 110–145 and uses 16:9 height", () => {
    expect(computeCallPipDimensions(390)).toEqual({ width: 125, height: 70 });
    expect(computeCallPipDimensions(412)).toEqual({ width: 132, height: 74 });
    expect(computeCallPipDimensions(430)).toEqual({ width: 138, height: 78 });
    expect(computeCallPipDimensions(300)).toEqual({ width: 110, height: 62 });
    expect(computeCallPipDimensions(500)).toEqual({ width: 145, height: 82 });
  });

  it("uses desktop default width on wide viewports", () => {
    expect(computeCallPipDimensions(768)).toEqual({ width: 150, height: 84 });
    expect(computeCallPipDimensions(1024)).toEqual({ width: 150, height: 84 });
  });
});

describe("computeCallPipCornerAnchors", () => {
  it("places bottomRight with safe-area and composer offset", () => {
    const pip = { width: 125, height: 70 };
    const anchors = computeCallPipCornerAnchors(
      { width: 390, height: 844 },
      pip,
      { safeTop: 0, safeBottom: 20, marginSide: 12, marginBottomExtra: 80 }
    );
    expect(anchors.bottomRight.left).toBe(390 - 125 - 12);
    expect(anchors.bottomRight.top).toBe(844 - 70 - (20 + 80 + 12));
    expect(anchors.topLeft).toEqual({ left: 12, top: 12 });
  });
});

describe("snapCallPipToNearestCorner", () => {
  it("picks nearest corner by pointer center", () => {
    const pip = { width: 125, height: 70 };
    const anchors = computeCallPipCornerAnchors(
      { width: 390, height: 844 },
      pip,
      { safeTop: 0, safeBottom: 0, marginSide: 12, marginBottomExtra: 80 }
    );
    expect(snapCallPipToNearestCorner({ x: 20, y: 20 }, anchors, pip).corner).toBe("topLeft");
    expect(snapCallPipToNearestCorner({ x: 370, y: 20 }, anchors, pip).corner).toBe("topRight");
    expect(snapCallPipToNearestCorner({ x: 20, y: 800 }, anchors, pip).corner).toBe("bottomLeft");
    expect(snapCallPipToNearestCorner({ x: 370, y: 800 }, anchors, pip).corner).toBe("bottomRight");
  });
});

describe("clampCallPipDragDelta", () => {
  it("keeps PiP inside viewport bounds while dragging", () => {
    const pip = { width: 125, height: 70 };
    const viewport = { width: 390, height: 844 };
    const insets = { safeTop: 0, safeBottom: 0, marginSide: 12, marginBottomExtra: 80 };
    const clamped = clampCallPipDragDelta({
      originLeft: 253,
      originTop: 682,
      dx: 200,
      dy: 200,
      pipSize: pip,
      viewport,
      insets,
    });
    expect(clamped.dx).toBe(0);
    expect(clamped.dy).toBe(0);
  });
});

describe("call pip snap storage", () => {
  it("reads and writes global snap position in kebab-case", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      key: () => null,
      length: 0,
    });

    expect(readCallPipSnapPosition()).toBeNull();
    writeCallPipSnapPosition("topLeft");
    expect(store.get(CALL_PIP_SNAP_STORAGE_KEY)).toBe("top-left");
    expect(readCallPipSnapPosition()).toBe("topLeft");
    expect(toSnapStorageValue("bottomRight")).toBe("bottom-right");
    expect(fromSnapStorageValue("bottom-right")).toBe("bottomRight");

    vi.unstubAllGlobals();
  });

  it("migrates legacy sessionStorage corner to localStorage", () => {
    const local = new Map<string, string>();
    const session = new Map<string, string>([["cm_call_pip_corner:sess-1", "topRight"]]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => local.get(k) ?? null,
      setItem: (k: string, v: string) => local.set(k, v),
      removeItem: (k: string) => local.delete(k),
    });
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => session.get(k) ?? null,
      setItem: (k: string, v: string) => session.set(k, v),
      removeItem: (k: string) => session.delete(k),
      key: (i: number) => [...session.keys()][i] ?? null,
      get length() {
        return session.size;
      },
    });

    migrateLegacyCallPipSnapStorage();
    expect(local.get(CALL_PIP_SNAP_STORAGE_KEY)).toBe("top-right");
    expect(session.size).toBe(0);

    vi.unstubAllGlobals();
  });
});
