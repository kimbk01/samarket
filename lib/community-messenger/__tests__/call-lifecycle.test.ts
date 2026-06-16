import { describe, expect, it } from "vitest";
import {
  dibayCallSealTerminal,
  dibayRouteLaneAllow,
} from "@/lib/community-messenger/call-lifecycle";

describe("call-lifecycle", () => {
  it("seals terminal and blocks route replay", () => {
    const sessionId = "lifecycle-session";
    const path = `/community-messenger/calls/${sessionId}`;
    expect(dibayRouteLaneAllow(path)).toBe(true);
    dibayCallSealTerminal(sessionId);
    expect(dibayRouteLaneAllow(path)).toBe(false);
  });
});
