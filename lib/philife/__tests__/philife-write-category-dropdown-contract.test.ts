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

  it("does not live-replace community feed URL while write sheet is open", () => {
    expect(writeForm).toContain("if (suppressWriteScreenTier1) return;");
    expect(writeForm).not.toMatch(
      /if \(suppressWriteScreenTier1\) \{[\s\S]*?buildCommunityFeedHref[\s\S]*?router\.replace/
    );
    /** 제출 성공 후에만 피드 탭/URL 동기화 */
    expect(writeForm).toContain("buildCommunityFeedHref");
    expect(writeForm).toContain('kind: "topic"');
  });
});
