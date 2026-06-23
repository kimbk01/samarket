import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("call-v4 import isolation", () => {
  it("call-v4 modules do not import call-v3 actions or provider", () => {
    const screen = read("components/community-messenger/call-v4/CallV4Screen.tsx");
    expect(screen).not.toContain("call-v3-actions");
    expect(screen).not.toContain("CallV3Provider");
    expect(screen).not.toContain("callV3Accept");
    expect(screen).not.toContain("exitCallV3ScreenAfterCleanup");
  });

  it("CallV4Screen logs required Phase 1 markers", () => {
    const screen = read("components/community-messenger/call-v4/CallV4Screen.tsx");
    expect(screen).toContain("screen_mounted");
    expect(screen).toContain("connecting_visible");
  });

  it("CallIncomingChrome gates V4 before V3", () => {
    const chrome = read("components/layout/providers/CallIncomingChrome.tsx");
    expect(chrome).toContain("isCallV4TelegramLaneEnabled()");
    expect(chrome).toMatch(
      /if \(isCallV4TelegramLaneEnabled\(\)\)[\s\S]*?if \(isDibayCallV3SafeLaneEnabled\(\)\)/
    );
  });
});
