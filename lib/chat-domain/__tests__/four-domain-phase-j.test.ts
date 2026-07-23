import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PHASE_J_DELETED_CHROME } from "@/lib/chat-domain/room-chrome";
import { FORBIDDEN_RESTORE_PATHS } from "@/lib/chat-domain/four-domain-freeze";

describe("Phase J deleted chrome (slice-1 + slice-2)", () => {
  it("deleted shells are gone and listed in forbidden restore", () => {
    const root = resolve(__dirname, "../../..");
    for (const c of PHASE_J_DELETED_CHROME) {
      expect(existsSync(resolve(root, c.path)), c.path).toBe(false);
      expect(FORBIDDEN_RESTORE_PATHS).toContain(c.path);
    }
  });
});
