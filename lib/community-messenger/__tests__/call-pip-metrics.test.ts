import { describe, expect, it, vi } from "vitest";
import {
  computeCallPipCornerAnchors,
  computeCallPipDimensions,
  readCallPipCornerStorage,
  snapCallPipToNearestCorner,
  writeCallPipCornerStorage,
} from "@/lib/community-messenger/call-pip-metrics";

describe("computeCallPipDimensions", () => {
  it("clamps width to 110–140 and uses 16:9 height", () => {
    expect(computeCallPipDimensions(390)).toEqual({ width: 125, height: 70 });
    expect(computeCallPipDimensions(412)).toEqual({ width: 132, height: 74 });
    expect(computeCallPipDimensions(430)).toEqual({ width: 138, height: 78 });
    expect(computeCallPipDimensions(300)).toEqual({ width: 110, height: 62 });
    expect(computeCallPipDimensions(500)).toEqual({ width: 140, height: 79 });
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
    expect(snapCallPipToNearestCorner({ x: 20, y: 20 }, anchors).corner).toBe("topLeft");
    expect(snapCallPipToNearestCorner({ x: 370, y: 20 }, anchors).corner).toBe("topRight");
    expect(snapCallPipToNearestCorner({ x: 20, y: 800 }, anchors).corner).toBe("bottomLeft");
    expect(snapCallPipToNearestCorner({ x: 370, y: 800 }, anchors).corner).toBe("bottomRight");
  });
});

describe("call pip corner storage", () => {
  it("reads and writes corner per session", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });

    expect(readCallPipCornerStorage("sess-1")).toBeNull();
    writeCallPipCornerStorage("sess-1", "topLeft");
    expect(readCallPipCornerStorage("sess-1")).toBe("topLeft");

    vi.unstubAllGlobals();
  });
});
