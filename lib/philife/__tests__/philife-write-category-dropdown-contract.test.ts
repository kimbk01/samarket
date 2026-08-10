import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());
const writeForm = readFileSync(
  join(root, "components/philife/PhilifeNeighborhoodWriteForm.tsx"),
  "utf8"
);

describe("philife write category dropdown contract", () => {
  it("uses a custom listbox dropdown instead of native select (iOS/APK/Windows parity)", () => {
    expect(writeForm).not.toContain("PHILIFE_WRITE_SELECT_CLASS");
    expect(writeForm).not.toMatch(/<\s*select\b/i);
    expect(writeForm).toContain('role="listbox"');
    expect(writeForm).toContain('role="option"');
    expect(writeForm).toContain("createPortal");
    expect(writeForm).toContain("applyWriteCategory");
  });

  it("syncs selected write category to community feed topic tabs via URL", () => {
    expect(writeForm).toContain("buildCommunityFeedHref");
    expect(writeForm).toContain('kind: "topic"');
    expect(writeForm).toContain("topicSlug: next");
    expect(writeForm).toContain("suppressWriteScreenTier1");
    expect(writeForm).toContain('void router.replace(target, { scroll: false })');
  });
});
