/**
 * @vitest-environment node
 * Contract: Owner Apply is atomic; Publish is not a required Owner step.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

describe("13th final correction apply-service contract", () => {
  it("apply-service module + route exist", () => {
    expect(existsSync("lib/intro/live/apply-service.ts")).toBe(true);
    expect(
      existsSync(
        "app/api/admin/intro/documents/[documentId]/apply-service/route.ts",
      ),
    ).toBe(true);
  });

  it("apply-service publishes then sets live with draft version gate", () => {
    const src = readFileSync("lib/intro/live/apply-service.ts", "utf8");
    expect(src).toContain("publishIntroDocument");
    expect(src).toContain("setLiveRelease");
    expect(src).toContain("expectedSourceDraftVersion");
    expect(src).toContain("applyIntroServiceFromDraft");
  });

  it("Owner studio primary actions do not require separate Publish", () => {
    const src = readFileSync(
      "components/admin/intro/IntroStudioPage.tsx",
      "utf8",
    );
    expect(src).toContain("applyService");
    expect(src).toContain("apply-service");
    expect(src).toContain("서비스 적용");
    expect(src).toContain("미리보기");
    // Primary toolbar must not expose a required Publish button click handler
    expect(src).not.toMatch(/onClick=\{\(\) => void publish\(\)\}/);
  });

  it("native delivery always refreshes Live when online", () => {
    const android = readFileSync(
      "android/app/src/main/java/com/dibay/app/intro/DibayIntroLiveDelivery.java",
      "utf8",
    );
    const ios = readFileSync(
      "ios/App/App/Plugins/DibayIntroLiveDelivery.swift",
      "utf8",
    );
    expect(android).toContain("always refresh Live");
    expect(android).not.toContain("verified_local_fast");
    expect(ios).toContain("always refresh Live");
    expect(ios).not.toContain("verified_local_fast");
  });

  it("SSOT doc locks FINAL CORRECTION not 14th rebuild", () => {
    const doc = readFileSync(
      "docs/dibay-intro-13th-final-correction-ssot.md",
      "utf8",
    );
    expect(doc).toContain("14TH FULL REBUILD = NOT YET AUTHORIZED");
    expect(doc).toContain("EDIT → SAVE → PREVIEW → APPLY → APP");
    expect(doc).toContain("SYSTEM_START_MIN_VISIBLE_MS");
    expect(doc).toContain("Hidden artificial hold beyond that = FORBIDDEN");
  });

  it("System Start Admin exposes media + duration controls", () => {
    const panel = readFileSync(
      "components/admin/intro/IntroSystemStartPanel.tsx",
      "utf8",
    );
    expect(panel).toContain("다음 앱 버전 설정 저장");
    expect(panel).toContain("SYSTEM_START_MIN_VISIBLE_MS");
    expect(panel).toContain("원본 비율");
    expect(panel).toContain("화면 안에 맞춤");
    expect(panel).toContain("화면 채우기");
    expect(panel).toContain("logoMediaId");
  });

  it("Intro studio uses AdminActionButton CTA hierarchy", () => {
    const src = readFileSync(
      "components/admin/intro/IntroStudioPage.tsx",
      "utf8",
    );
    expect(src).toContain("AdminActionButton");
    expect(src).toContain('variant="primary"');
    expect(src).toContain("+ 장면 추가");
    expect(src).toContain("+ 이미지");
    expect(src).toContain("요소 등장 효과");
    expect(src).toContain("왼쪽으로 밀기");
  });
});
