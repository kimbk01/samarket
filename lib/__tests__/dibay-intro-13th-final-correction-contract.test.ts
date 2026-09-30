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
    expect(src).toContain("intro_apply_service_begin");
    expect(src).toContain("NOT silently reinterpreted");
  });

  it("Production System Start Save never writes native filesystem", () => {
    const route = readFileSync(
      "app/api/admin/intro/system-start/route.ts",
      "utf8",
    );
    expect(route).toContain("productionSaveWritesNativeFs: false");
    expect(route).not.toContain("syncDerivedBuildInput");
    expect(route).not.toContain("native/system-start/assets");
    expect(route).toContain("resolveDurableLogoIntegrity");
  });

  it("iOS Cap continuation mounts (launchShowDuration≠0) and hides via plugin", () => {
    const cap = readFileSync("ios/App/App/capacitor.config.json", "utf8");
    const bridge = readFileSync(
      "ios/App/App/DibayStartupBridgeViewController.swift",
      "utf8",
    );
    expect(cap).toMatch(/"launchShowDuration"\s*:\s*1/);
    expect(cap).not.toMatch(/"launchShowDuration"\s*:\s*0/);
    expect(bridge).toContain("invokeCapacitorSplashPluginHide");
    expect(bridge).not.toContain('Notification.Name("splashScreenHide")');
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
    // Native materializer key (build-bound). Admin presets live in contract.ts.
    expect(doc).toContain("SYSTEM_START_MIN_VISIBLE_MS");
    expect(doc).toContain("Hidden artificial hold beyond that = FORBIDDEN");
    expect(doc).toContain("free fit = FORBIDDEN");
  });

  it("System Start Admin locks F1/F2 capability (presets + media; no free fit)", () => {
    const panel = readFileSync(
      "components/admin/intro/IntroSystemStartPanel.tsx",
      "utf8",
    );
    const contract = readFileSync(
      "lib/intro/system-start/contract.ts",
      "utf8",
    );

    // Duration authority = contract presets consumed by Admin (not free ms / not 0).
    expect(contract).toContain("SYSTEM_START_MIN_VISIBLE_PRESETS_MS");
    expect(contract).toContain("SYSTEM_START_MIN_VISIBLE_MS_MIN");
    expect(contract).toContain("minVisibleMs=0 — FORBIDDEN");
    expect(panel).toContain("SYSTEM_START_MIN_VISIBLE_PRESETS_MS");
    // Layer B durable draft + Apply (not legacy "다음 앱 버전 설정 저장" copy).
    expect(panel).toContain("durable desired config");
    expect(panel).toContain("Layer A — materialized (OS)");
    expect(panel).toContain("Layer B Live");
    expect(panel).not.toContain("현재 설치 앱이 반영");

    // Brand media identity + size presets (S/M/L) — F2.
    expect(panel).toContain("brandAssetMediaId");
    expect(panel).toContain("교체 · 미디어에서 선택");
    expect(panel).toContain("BRAND_SIZE_NORM");
    expect(panel).toContain('value: "S"');
    expect(panel).toContain('value: "M"');
    expect(panel).toContain('value: "L"');

    // Free geometry / arbitrary fit removed by F1/F2 freeze — must not regress.
    expect(panel).not.toContain("원본 비율");
    expect(panel).not.toContain("화면 안에 맞춤");
    expect(panel).not.toContain("화면 채우기");
    expect(panel).not.toMatch(/\blogoXNorm\b|\blogoYNorm\b/);
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
    // Transition operator label from capability-registry (not hardcoded "왼쪽으로 밀기").
    expect(src).toContain("TRANSITION_OPERATOR_LABELS");
    expect(src).toContain("MOTION_OPERATOR_LABELS");
  });
});
