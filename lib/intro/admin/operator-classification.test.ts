import { describe, expect, it } from "vitest";
import {
  classifyIntroTitle,
  isOperatorVisibleContentClass,
  normalizeIntroContentClass,
} from "@/lib/intro/admin/operator-classification";

describe("intro operator classification (content_class authority)", () => {
  it("normalizes invalid content_class to OWNER", () => {
    expect(normalizeIntroContentClass(null)).toBe("OWNER");
    expect(normalizeIntroContentClass("")).toBe("OWNER");
    expect(normalizeIntroContentClass("SYSTEM_TEST")).toBe("OWNER");
    expect(normalizeIntroContentClass("CURRENT_LIVE")).toBe("OWNER");
    expect(normalizeIntroContentClass("qa")).toBe("QA");
  });

  it("hides QA/SYSTEM from default operator list by content_class", () => {
    expect(isOperatorVisibleContentClass("QA")).toBe(false);
    expect(isOperatorVisibleContentClass("SYSTEM")).toBe(false);
    expect(isOperatorVisibleContentClass("OWNER")).toBe(true);
    expect(
      isOperatorVisibleContentClass("QA", { includeQa: true }),
    ).toBe(true);
    expect(
      isOperatorVisibleContentClass("SYSTEM", { includeQa: true }),
    ).toBe(true);
  });

  it("always shows live even if content_class is QA", () => {
    expect(
      isOperatorVisibleContentClass("QA", { isLive: true }),
    ).toBe(true);
  });
});

describe("classifyIntroTitle (backfill helper only)", () => {
  it("maps known QA fixture titles to QA", () => {
    expect(classifyIntroTitle("DIBAY-13-V8-SLIDE")).toBe("QA");
    expect(classifyIntroTitle("DIBAY-13-V5-MULTI")).toBe("QA");
    expect(classifyIntroTitle("CUTA-BROWSER-QA-FOO")).toBe("QA");
    expect(
      classifyIntroTitle("CUT A Prove 2026-09-29T06:55:28.125Z"),
    ).toBe("QA");
    expect(classifyIntroTitle("DIBAY-13-FINAL")).toBe("QA");
    expect(classifyIntroTitle("409RCV-TEST")).toBe("QA");
  });

  it("maps system fixture titles to SYSTEM", () => {
    expect(classifyIntroTitle("SYSTEM-FOO")).toBe("SYSTEM");
    expect(classifyIntroTitle("__FIXTURE__intro")).toBe("SYSTEM");
  });

  it("keeps owner titles as OWNER", () => {
    expect(classifyIntroTitle("DIBAY GRAND OPENING")).toBe("OWNER");
    expect(classifyIntroTitle("그랜드 오프닝")).toBe("OWNER");
  });
});
