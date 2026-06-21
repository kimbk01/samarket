import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INCOMING_CALL_FULLSCREEN_PRESS_MS } from "@/components/messenger/call/incoming/IncomingCallButton";

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8");
}

describe("IncomingCallButton press contract", () => {
  it("fullscreen press threshold is 150ms", () => {
    expect(INCOMING_CALL_FULLSCREEN_PRESS_MS).toBe(150);
  });

  it("fullscreen uses pointer press-release; popup uses immediate click", () => {
    const src = read("components/messenger/call/incoming/IncomingCallButton.tsx");
    expect(src).toContain("onPointerDown");
    expect(src).toContain("onPointerUp");
    expect(src).toContain("onPointerLeave");
    expect(src).toContain("elapsed < INCOMING_CALL_FULLSCREEN_PRESS_MS");
    expect(src).toContain('mode === "fullscreen"');
    expect(src).toContain("triggerCallHaptic");
    expect(src).toContain("incoming-call-btn--accept");
    expect(src).toContain("incoming-call-btn--reject");
    expect(src).toContain("bg-[#34c759]");
    expect(src).toContain("bg-[#ff3b30]");
  });
});
