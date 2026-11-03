import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** 광고 감사 I-4 — OS 해제 전 background/error 종료는 해제 권한을 커뮤니티로 넘긴다 */
describe("I-4 intro exit before OS release", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("before release: INTRO → COMMUNITY hand-off succeeds (community then owns the release)", async () => {
    const m = await import("@/lib/launch-intro/os-release-owner");
    expect(m.claimLaunchOsReleaseForIntro()).toBe(true);
    expect(m.handLaunchOsReleaseToCommunity()).toBe(true);
    expect(m.getLaunchOsReleaseOwner()).toBe("community");
  });

  it("after release: hand-off is refused, so the OS is never released twice", async () => {
    const m = await import("@/lib/launch-intro/os-release-owner");
    expect(m.claimLaunchOsReleaseForIntro()).toBe(true);
    m.noteLaunchOsReleased();
    expect(m.handLaunchOsReleaseToCommunity()).toBe(false);
    expect(m.getLaunchOsReleaseOwner()).toBe("intro");
  });

  it("exit(background|error) hands off before release and keeps the epoch mark", () => {
    const root = src("components/launch-intro/LaunchIntroRoot.tsx");
    const branch = root.slice(root.indexOf('if (reason === "background" || reason === "error") {'));
    expect(branch).toMatch(
      /markLaunchEpochShown\(snapshot\.epoch\);\s+if \(releasedRef\.current\) \{\s+releaseLaunchIntroDeferral\(\);\s+\} else \{[\s\S]{0,300}abortLaunchIntroToCommunity\(`exit_\$\{reason\}_before_release`\);/
    );
    // 해제 표시는 실제 OS 해제(releaseOsForLaunchIntro 성공) 직후에만
    expect(root).toMatch(/if \(!releaseOsForLaunchIntro\(\)\) \{[\s\S]{0,200}\}\s+releasedRef\.current = true;/);
    const dest = src("lib/launch-intro/startup-destination.ts");
    const abort = dest.slice(dest.indexOf("export function abortLaunchIntroToCommunity"));
    expect(abort).toContain("handLaunchOsReleaseToCommunity();");
    expect(abort).toContain("releaseLaunchIntroDeferral();");
  });
});
