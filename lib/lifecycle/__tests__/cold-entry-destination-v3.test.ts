/**
 * 앱 진입 v3 ① — 첫 진입 화면(어드민)을 시작 판정에서 정한다(홈을 먼저 그리지 않음).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveColdEntrySurfacePath } from "@/lib/startup/initial-app-surface";

describe("첫 진입 화면 경로", () => {
  it("어드민 값 그대로 · 비회원 + 회원 전용 화면이면 홈", () => {
    expect(resolveColdEntrySurfacePath({ adminInitialSurface: "home", isMember: false })).toBe("/home");
    expect(resolveColdEntrySurfacePath({ adminInitialSurface: "community", isMember: false })).toBe("/philife");
    expect(resolveColdEntrySurfacePath({ adminInitialSurface: "trade", isMember: false })).toBe("/market");
    expect(resolveColdEntrySurfacePath({ adminInitialSurface: "my", isMember: false })).toBe("/home");
    expect(resolveColdEntrySurfacePath({ adminInitialSurface: "my", isMember: true })).toBe("/mypage");
    expect(resolveColdEntrySurfacePath({ adminInitialSurface: null, isMember: true })).toBe("/home");
  });

  it("시작 판정이 새로 켬·안전 진입 모두 어드민 값을 쓴다 · 홈 먼저 그린 뒤 이동하던 코드는 없음", () => {
    const kind = readFileSync(join(process.cwd(), "lib/lifecycle/app-entry-kind.ts"), "utf8");
    expect(kind).toContain("resolveColdEntrySurfacePath(");
    expect(kind).toContain("navigateTo: coldNavigate,");
    const boot = readFileSync(join(process.cwd(), "components/app/InitialSurfaceBootstrap.tsx"), "utf8");
    expect(boot).not.toContain("useRouter");
  });
});
