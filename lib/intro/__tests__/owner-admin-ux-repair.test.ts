import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  androidSplashColorXml,
  systemStartBuildInputFromConfig,
} from "@/lib/startup/system-start-build-input";
import { BUNDLED_STARTUP_CONFIG } from "@/lib/startup/startup-config";

describe("Owner Admin UX repair — mode switch + System Start editor", () => {
  it("IntroStudio exposes System Start / Dibay Intro mode switch", () => {
    const studio = readFileSync(
      "components/admin/intro/IntroStudio.tsx",
      "utf8",
    );
    expect(studio).toContain('data-intro-mode-switch="1"');
    expect(studio).toContain('data-intro-mode-system="1"');
    expect(studio).toContain('data-intro-mode-intro="1"');
    expect(studio).toContain("SystemStartEditor");
    expect(studio).not.toContain("data-intro-app-run-order");
    expect(studio).not.toContain("관리 기능: 준비 중 (구현 전)");
    expect(studio).not.toContain("앱 실행 시 가장 먼저 표시되는 인트로 화면입니다.");
    expect(studio).toContain("data-intro-compact-timeline");
    expect(studio).toContain("인트로 미리보기 · 준비 중");
  });

  it("SystemStartEditor is a real authoring surface with save confirm", () => {
    const editor = readFileSync(
      "components/admin/intro/SystemStartEditor.tsx",
      "utf8",
    );
    expect(editor).toContain('data-system-start-editor="1"');
    expect(editor).toContain('data-system-start-preview="1"');
    expect(editor).toContain('data-system-start-bg-color="1"');
    expect(editor).toContain('data-system-start-logo-pick="1"');
    expect(editor).toContain('data-system-start-save="1"');
    expect(editor).toContain('data-system-start-save-confirm="1"');
    expect(editor).toContain("시스템 시작 화면 설정을 저장하시겠습니까?");
    expect(editor).toContain("앱 업데이트 후 반영");
    expect(editor).not.toContain("서비스에 적용");
    expect(editor).not.toContain("구현 전");
  });

  it("System Start build input is separate from Intro Pack", () => {
    const input = systemStartBuildInputFromConfig(BUNDLED_STARTUP_CONFIG, {
      adminPersisted: true,
      buildInputGenerated: true,
    });
    expect(input.kind).toBe("SYSTEM_START");
    expect(input.apply.publish).toBe(false);
    expect(input.apply.serviceApply).toBe(false);
    expect(input.apply.mode).toBe("APP_UPDATE_REQUIRED");
    expect(input.status.binaryRebuildRequired).toBe(true);
    expect(input.status.installedPixelsProven).toBe(false);
    expect(androidSplashColorXml("#112233")).toContain(
      "dibay_system_start_background",
    );
    expect(androidSplashColorXml("#112233")).toContain("#112233");
    expect(existsSync("scripts/generate-system-start-build-input.mjs")).toBe(
      true,
    );
  });
});
