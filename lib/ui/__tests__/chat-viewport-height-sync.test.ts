import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..");

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("chat-viewport-height-sync", () => {
  it("exports root sync helpers and html class constant", () => {
    const src = readSrc("lib/ui/chat-viewport-height-sync.ts");
    expect(src).toContain("SAM_CHAT_VIEWPORT_HEIGHT_HTML_CLASS");
    expect(src).toContain("sam-chat-viewport-height-active");
    expect(src).toContain("applyChatViewportHeightToRoot");
    expect(src).toContain("clearChatViewportHeightFromRoot");
    expect(src).toContain("document.documentElement");
  });
});
