import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "components/group-chat/GroupChatRoomClient.tsx");
const SRC = readFileSync(ROOT, "utf8");

describe("group chat scroll contract", () => {
  it("does not assign scrollTop inline", () => {
    expect(SRC).not.toMatch(/\.scrollTop\s*=/);
    expect(SRC).not.toMatch(/runChatThreadEntryScrollToBottom/);
  });

  it("uses shared chat thread scroll hook", () => {
    expect(SRC).toContain("useChatThreadScroll");
    expect(SRC).toContain("notifyUserScroll");
  });
});
