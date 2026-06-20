import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "components/chats/ChatDetailView.tsx");
const SRC = readFileSync(ROOT, "utf8");

describe("chat detail scroll contract", () => {
  it("does not assign scrollTop inline", () => {
    expect(SRC).not.toMatch(/\.scrollTop\s*=/);
  });

  it("uses shared chat thread scroll hook", () => {
    expect(SRC).toContain("useChatThreadScroll");
    expect(SRC).toContain("notifyPrependComplete");
  });

  it("does not use legacy 168px stick inline", () => {
    expect(SRC).not.toMatch(/stickPx\s*=\s*168/);
  });
});
