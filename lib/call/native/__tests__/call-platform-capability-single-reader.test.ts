import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * 맥 판정값 단일 읽기 계약 (Owner 2026-11-15 「맥 판정값 읽는 곳 하나로 합쳐라」).
 * 웹: `dibayVoipCallPlugin.getCallPlatformCapability` 직접 호출은 `call-platform-capability-client.ts` 만.
 * 네이티브: `ProcessInfo.isiOSAppOnMac` 읽기는 `DibayCallPlatformCapability.swift` 만.
 */
function grepFiles(pattern: string, paths: string[]): string[] {
  try {
    const out = execFileSync("git", ["grep", "-l", "-E", pattern, "--", ...paths], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    return out.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

describe("call platform capability single reader", () => {
  it("웹: 플러그인 판정 조회는 call-platform-capability-client 에서만", () => {
    const files = grepFiles("\\.getCallPlatformCapability\\(", ["lib", "components", "app", "hooks"]).filter(
      (f) => !f.includes("__tests__/"),
    );
    expect(files).toEqual(["lib/call/native/call-platform-capability-client.ts"]);
  });

  it("네이티브: isiOSAppOnMac 읽기는 DibayCallPlatformCapability 에서만", () => {
    const files = grepFiles("processInfo\\.isiOSAppOnMac|ProcessInfo\\.processInfo\\.isiOSAppOnMac", ["ios/App/App"]);
    expect(files).toEqual(["ios/App/App/Call/DibayCallPlatformCapability.swift"]);
  });
});
