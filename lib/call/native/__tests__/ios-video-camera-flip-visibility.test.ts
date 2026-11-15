import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 영상 통화 카메라 전환 버튼 — 전환이 동작하는 플랫폼(iPhone·iPad)에서만 보인다.
 * 맥(Designed for iPad)은 카메라 1개(22:19)·2개(23:02, 연속성 카메라 포함) 모두 전환 result=0 인데 송출 영상 그대로
 * (실기 2026-11-15). 「앞·뒤 카메라 있음」 판정(build 42)은 연속성 카메라 때문에 맥에서도 true 라 FAIL.
 * 설계: docs/audit/call-waiting-transition-design-2026-11-15.md 설계 C′ · Owner 「C′ 구현 승인」 2026-11-15.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const vc = read("ios/App/App/Call/Video/NativeVideoCallViewController.swift");
const cap = read("ios/App/App/Call/DibayCallPlatformCapability.swift");

describe("iOS 영상 통화 카메라 전환 버튼 표시", () => {
  it("플랫폼 단일 정의: 맥이면 전환 불가", () => {
    expect(cap).toMatch(/static var supportsCameraFacingSwitch: Bool \{\s*!isIOSAppOnMac\s*\}/);
  });

  it("버튼은 단일 정의만 보고 숨김 — 카메라 개수 판정 쓰지 않음", () => {
    expect(vc).toContain("let flipSupported = DibayCallPlatformCapability.supportsCameraFacingSwitch");
    expect(vc).toContain("cameraFlipButton.isHidden = !flipSupported");
    expect(vc).not.toContain("hasFrontAndBackCamera");
    expect(vc).not.toContain("isiOSAppOnMac");
    expect(vc.match(/cameraFlipButton\.isHidden\s*=/g)?.length).toBe(1);
  });
});
