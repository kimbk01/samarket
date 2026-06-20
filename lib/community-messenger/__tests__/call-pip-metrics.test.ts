import { describe, expect, it, vi } from "vitest";
import {
  CALL_PIP_DRAG_LOCK_MS,
  CALL_PIP_PORTRAIT_HEIGHT_RATIO,
  CALL_PIP_SESSION_SNAP_STORAGE_PREFIX,
  CALL_PIP_SNAP_STORAGE_KEY,
  CALL_PIP_SNAP_STORAGE_KEY_LEGACY,
  CALL_PIP_SNAP_STORAGE_KEY_LEGACY_SNAP,
  callPipSessionSnapStorageKey,
  clampCallPipDragDelta,
  computeCallPipCornerAnchors,
  computeCallPipDimensions,
  computeCallPipExpandedDimensions,
  fromSnapStorageValue,
  migrateLegacyCallPipSnapStorage,
  readCallPipSessionSnapPosition,
  readCallPipSnapPosition,
  resolveCallPipDragSnapCenter,
  snapCallPipToNearestCorner,
  toSnapStorageValue,
  writeCallPipSessionSnapPosition,
  writeCallPipSnapPosition,
} from "@/lib/community-messenger/call-pip-metrics";

describe("computeCallPipDimensions", () => {
  it("uses mobile clamp(108, 29vw, 128) and portrait height width×1.38", () => {
    expect(CALL_PIP_PORTRAIT_HEIGHT_RATIO).toBe(1.38);
    expect(computeCallPipDimensions(390)).toEqual({ width: 113, height: 156 });
    expect(computeCallPipDimensions(412)).toEqual({ width: 119, height: 164 });
    expect(computeCallPipDimensions(430)).toEqual({ width: 125, height: 173 });
    expect(computeCallPipDimensions(300)).toEqual({ width: 108, height: 149 });
    expect(computeCallPipDimensions(479)).toEqual({ width: 128, height: 177 });
  });

  it("uses large mobile clamp(120, 25vw, 145) from 480px without shrinking below mobile", () => {
    expect(computeCallPipDimensions(480)).toEqual({ width: 128, height: 177 });
    expect(computeCallPipDimensions(600)).toEqual({ width: 145, height: 200 });
  });

  it("uses tablet clamp(135, 18vw, 175)", () => {
    expect(computeCallPipDimensions(768)).toEqual({ width: 138, height: 190 });
    expect(computeCallPipDimensions(900)).toEqual({ width: 162, height: 224 });
  });

  it("uses PC clamp(145, 11vw, 190)", () => {
    expect(computeCallPipDimensions(1024)).toEqual({ width: 145, height: 200 });
    expect(computeCallPipDimensions(1920)).toEqual({ width: 190, height: 262 });
  });

  it("always keeps height greater than width (portrait self view)", () => {
    for (const vw of [320, 390, 430, 480, 768, 1024, 1920]) {
      const { width, height } = computeCallPipDimensions(vw);
      expect(height).toBeGreaterThan(width);
      expect(height).toBe(Math.round(width * 1.38));
    }
  });
});

describe("computeCallPipExpandedDimensions", () => {
  it("expands mobile PiP clamp(145, 38vw, 180) with portrait 1.38", () => {
    expect(computeCallPipExpandedDimensions(390)).toEqual({ width: 148, height: 204 });
    expect(computeCallPipExpandedDimensions(500)).toEqual({ width: 180, height: 248 });
  });
});

describe("computeCallPipCornerAnchors", () => {
  it("places bottomRight with safe-area and composer offset", () => {
    const pip = { width: 113, height: 156 };
    const anchors = computeCallPipCornerAnchors(
      { width: 390, height: 844 },
      pip,
      { safeTop: 0, safeBottom: 20, marginSide: 16, marginBottomExtra: 80 }
    );
    expect(anchors.bottomRight.left).toBe(390 - 113 - 16);
    expect(anchors.bottomRight.top).toBe(844 - 156 - (20 + 80 + 18));
    expect(anchors.topLeft).toEqual({ left: 16, top: 18 });
  });
});

describe("snapCallPipToNearestCorner", () => {
  it("picks nearest corner by pointer center", () => {
    const pip = { width: 113, height: 156 };
    const anchors = computeCallPipCornerAnchors(
      { width: 390, height: 844 },
      pip,
      { safeTop: 0, safeBottom: 0, marginSide: 16, marginBottomExtra: 80 }
    );
    expect(snapCallPipToNearestCorner({ x: 20, y: 20 }, anchors, pip).corner).toBe("topLeft");
    expect(snapCallPipToNearestCorner({ x: 370, y: 20 }, anchors, pip).corner).toBe("topRight");
    expect(snapCallPipToNearestCorner({ x: 20, y: 800 }, anchors, pip).corner).toBe("bottomLeft");
    expect(snapCallPipToNearestCorner({ x: 370, y: 800 }, anchors, pip).corner).toBe("bottomRight");
  });
});

describe("clampCallPipDragDelta", () => {
  it("keeps portrait PiP inside viewport bounds while dragging", () => {
    const pip = { width: 113, height: 156 };
    const viewport = { width: 390, height: 844 };
    const insets = { safeTop: 0, safeBottom: 0, marginSide: 16, marginBottomExtra: 80 };
    const clamped = clampCallPipDragDelta({
      originLeft: 261,
      originTop: 590,
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

describe("resolveCallPipDragSnapCenter", () => {
  it("uses clamped drag delta before transform reset (snap must not read post-reset DOM)", () => {
    const pip = { width: 113, height: 156 };
    const viewport = { width: 390, height: 844 };
    const insets = { safeTop: 0, safeBottom: 0, marginSide: 16, marginBottomExtra: 80 };
    const originLeft = 261;
    const originTop = 590;
    const { dx, dy } = clampCallPipDragDelta({
      originLeft,
      originTop,
      dx: 200,
      dy: -400,
      pipSize: pip,
      viewport,
      insets,
    });
    const center = resolveCallPipDragSnapCenter({ originLeft, originTop, dx, dy, pipSize: pip });
    expect(snapCallPipToNearestCorner(center, computeCallPipCornerAnchors(viewport, pip, insets), pip).corner).toBe(
      "topRight"
    );
  });
});

describe("call pip snap storage", () => {
  it("exposes drag lock duration for gesture hook", () => {
    expect(CALL_PIP_DRAG_LOCK_MS).toBe(1500);
  });

  it("builds session-scoped storage keys", () => {
    expect(callPipSessionSnapStorageKey("sess-1")).toBe(`${CALL_PIP_SESSION_SNAP_STORAGE_PREFIX}sess-1`);
  });

  it("isolates snap position per sessionId in sessionStorage", () => {
    const session = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => session.get(k) ?? null,
      setItem: (k: string, v: string) => session.set(k, v),
      removeItem: (k: string) => session.delete(k),
      key: (i: number) => [...session.keys()][i] ?? null,
      get length() {
        return session.size;
      },
    });

    writeCallPipSessionSnapPosition("sess-a", "topLeft");
    expect(readCallPipSessionSnapPosition("sess-a")).toBe("topLeft");
    expect(readCallPipSessionSnapPosition("sess-b")).toBeNull();
    expect(session.get(callPipSessionSnapStorageKey("sess-a"))).toBe("top-left");

    vi.unstubAllGlobals();
  });

  it("reads and writes deprecated global snap position in localStorage", () => {
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
    expect(store.get(CALL_PIP_SNAP_STORAGE_KEY_LEGACY)).toBeUndefined();
    expect(store.get(CALL_PIP_SNAP_STORAGE_KEY_LEGACY_SNAP)).toBeUndefined();
    expect(readCallPipSnapPosition()).toBe("topLeft");
    expect(toSnapStorageValue("bottomRight")).toBe("bottom-right");
    expect(fromSnapStorageValue("bottom-right")).toBe("bottomRight");

    vi.unstubAllGlobals();
  });

  it("migrateLegacyCallPipSnapStorage clears legacy keys without seeding new sessions", () => {
    const local = new Map<string, string>([
      [CALL_PIP_SNAP_STORAGE_KEY_LEGACY, "bottom-left"],
      [CALL_PIP_SNAP_STORAGE_KEY, "top-left"],
    ]);
    const session = new Map<string, string>([
      ["cm_call_pip_corner:sess-1", "topRight"],
      ["cm_call_pip_pos:sess-1", "bottom-right"],
    ]);
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
    expect(local.size).toBe(0);
    expect(session.size).toBe(0);
    expect(readCallPipSessionSnapPosition("sess-new")).toBeNull();

    vi.unstubAllGlobals();
  });
});
