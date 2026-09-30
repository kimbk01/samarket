import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isOperatorVisibleContentClass,
  normalizeIntroContentClass,
} from "@/lib/intro/admin/operator-classification";

const ROOT = process.cwd();

describe("C4 CREATE / APPLY / LIST / LIVE authority", () => {
  const applySrc = readFileSync(
    join(ROOT, "lib/intro/live/apply-service.ts"),
    "utf8",
  );
  const routeSrc = readFileSync(
    join(
      ROOT,
      "app/api/admin/intro/documents/[documentId]/apply-service/route.ts",
    ),
    "utf8",
  );
  const docServiceSrc = readFileSync(
    join(ROOT, "lib/intro/document/service.ts"),
    "utf8",
  );
  const hubSrc = readFileSync(
    join(ROOT, "components/admin/intro/IntroDocumentHub.tsx"),
    "utf8",
  );

  it("CREATE path accepts explicit contentClass (OWNER/QA/SYSTEM)", () => {
    expect(docServiceSrc).toContain("contentClass?: IntroDataClass");
    expect(docServiceSrc).toContain("content_class");
    expect(normalizeIntroContentClass("QA")).toBe("QA");
    expect(normalizeIntroContentClass("SYSTEM")).toBe("SYSTEM");
    expect(normalizeIntroContentClass("OWNER")).toBe("OWNER");
  });

  it("APPLY rejects non-OWNER before Live pointer", () => {
    expect(applySrc).toContain('contentClass !== "OWNER"');
    expect(applySrc).toContain("apply_forbidden_content_class:");
    expect(routeSrc).toContain("apply_forbidden_content_class:");
    expect(routeSrc).toContain("status = 403");
  });

  it("LIST does not launder QA/SYSTEM via isLive", () => {
    expect(isOperatorVisibleContentClass("QA", { isLive: true })).toBe(false);
    expect(isOperatorVisibleContentClass("SYSTEM", { isLive: true })).toBe(
      false,
    );
    expect(isOperatorVisibleContentClass("OWNER", { isLive: true })).toBe(true);
    expect(hubSrc).toMatch(/isOperatorVisibleContentClass/);
  });

  it("APPLY service documents Live pointer only after OWNER gate", () => {
    const gateIdx = applySrc.indexOf(
      'throw new Error(`apply_forbidden_content_class:${contentClass}`)',
    );
    const liveIdx = applySrc.indexOf("await setLiveRelease");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(liveIdx).toBeGreaterThan(gateIdx);
  });
});

