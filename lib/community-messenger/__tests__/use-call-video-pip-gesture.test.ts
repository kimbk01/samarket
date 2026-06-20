import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..");

describe("use-call-video-pip-gesture contract", () => {
  it("uses session-scoped snap storage and drag lock constant", () => {
    const src = readFileSync(
      join(ROOT, "lib/community-messenger/use-call-video-pip-gesture.ts"),
      "utf8"
    );
    expect(src).toContain("readCallPipSessionSnapPosition");
    expect(src).toContain("writeCallPipSessionSnapPosition");
    expect(src).toContain("CALL_PIP_DRAG_LOCK_MS");
    expect(src).toContain("pipDragLockedRef");
    expect(src).not.toContain("readCallPipSnapPosition");
    expect(src).not.toContain("writeCallPipSnapPosition");
  });
});
