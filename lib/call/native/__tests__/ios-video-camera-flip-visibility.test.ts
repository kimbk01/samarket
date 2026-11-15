import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 영상 통화 카메라 전환 버튼 — 앞·뒤 카메라가 모두 있는 기기에서만 보인다.
 * 맥(Designed for iPad)은 카메라 1개라 눌러도 변화가 없었다(실기 FAIL 2026-11-15 22:19:00 camera_facing_switch result=0).
 * 설계: docs/audit/call-waiting-transition-design-2026-11-15.md 설계 C · Owner 「A·B·C 구현 승인」 2026-11-15.
 */
const src = readFileSync(
  join(process.cwd(), "ios/App/App/Call/Video/NativeVideoCallViewController.swift"),
  "utf8",
);

describe("iOS 영상 통화 카메라 전환 버튼 표시", () => {
  it("앞·뒤 카메라가 모두 있을 때만 보임", () => {
    expect(src).toContain("cameraFlipButton.isHidden = !Self.hasFrontAndBackCamera");
    expect(src).toMatch(/position: \.front\)\.devices/);
    expect(src).toMatch(/position: \.back\)\.devices/);
    expect(src).toContain("return !front.isEmpty && !back.isEmpty");
  });

  it("다른 곳에서 전환 버튼을 다시 보이게 하지 않음", () => {
    expect(src.match(/cameraFlipButton\.isHidden\s*=/g)?.length).toBe(1);
  });
});
