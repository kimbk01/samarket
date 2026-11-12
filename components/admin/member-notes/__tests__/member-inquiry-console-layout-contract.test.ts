import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("admin console presentation-only contract", () => {
  const files = ["AdminConsoleState.tsx"];

  it("console chrome does not embed domain fetch/writers", () => {
    for (const name of files) {
      const src = readFileSync(join(ROOT, "components/admin/console", name), "utf8");
      expect(src).not.toMatch(/fetch\(/);
      expect(src).not.toMatch(/\/api\/admin/);
      expect(src).not.toMatch(/postNoteMessage|listAdminNoteThreads|markAdminNoteThreadRead/);
    }
  });
});
