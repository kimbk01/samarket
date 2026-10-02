import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("COMM-02 community tab prewarm matches default latest sort", () => {
  it("home global prewarm uses latest, not recommended", () => {
    const src = readFileSync(
      resolve(process.cwd(), "lib/main-menu/bottom-nav-tap-prewarm-philife.ts"),
      "utf8"
    );
    expect(src).toContain('prewarmPhilifeGlobalFeedVariant(viewerSig, "", "latest")');
    expect(src).not.toContain('prewarmPhilifeGlobalFeedVariant(viewerSig, "", "recommended")');
  });
});
