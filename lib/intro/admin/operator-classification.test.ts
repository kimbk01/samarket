import { describe, expect, it } from "vitest";
import {
  classifyIntroTitle,
  isOperatorVisibleTitle,
} from "@/lib/intro/admin/operator-classification";

describe("intro operator classification", () => {
  it("hides QA fixtures from default operator list", () => {
    expect(classifyIntroTitle("DIBAY-13-V8-SLIDE")).toBe("QA");
    expect(classifyIntroTitle("DIBAY-13-V5-MULTI")).toBe("QA");
    expect(classifyIntroTitle("CUTA-BROWSER-QA-FOO")).toBe("QA");
    expect(
      classifyIntroTitle("CUT A Prove 2026-09-29T06:55:28.125Z"),
    ).toBe("QA");
    expect(classifyIntroTitle("DIBAY-13-FINAL")).toBe("QA");
    expect(classifyIntroTitle("409RCV-TEST")).toBe("QA");
    expect(isOperatorVisibleTitle("DIBAY-13-V8-SLIDE")).toBe(false);
    expect(
      isOperatorVisibleTitle("CUT A Prove 2026-09-29T06:55:28.125Z"),
    ).toBe(false);
  });

  it("keeps owner titles visible", () => {
    expect(classifyIntroTitle("DIBAY GRAND OPENING")).toBe("OWNER");
    expect(classifyIntroTitle("그랜드 오프닝")).toBe("OWNER");
    expect(isOperatorVisibleTitle("DIBAY GRAND OPENING")).toBe(true);
  });

  it("always shows live even if QA-named", () => {
    expect(
      isOperatorVisibleTitle("DIBAY-13-V8-SLIDE", { isLive: true }),
    ).toBe(true);
  });
});
