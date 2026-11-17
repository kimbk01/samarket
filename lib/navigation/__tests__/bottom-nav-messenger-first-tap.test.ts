/**
 * P5 §B5-1 (첫 탭 무시) — 메신저 탭: 프로필 캐시가 없어도 로그인 확인 중(loading·recovering)이면
 * 문지기(requireAuthAction) 없이 누른 즉시 동기 이동(bottom_nav_explicit). 판정은 메신저 화면 게이트.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync("components/layout/BottomNav.tsx", "utf8");
const commit = readFileSync("lib/main-menu/main-bottom-nav-route-commit.ts", "utf8");
const auth = readFileSync("lib/auth/require-auth-action.ts", "utf8");
const layout = readFileSync("app/(main)/community-messenger/layout.tsx", "utf8");

describe("메신저 탭 첫 탭", () => {
  it("세션 확인 중이면 requireAuthAction 앞에서 run()(동기) 으로 이동", () => {
    const branch = src.slice(src.indexOf('if (commitOpts.href.includes("/community-messenger"))'));
    const resolving = branch.indexOf("if (isRecoveringPhase(sessionPhase)) {");
    const gate = branch.indexOf('requireAuthAction("messenger_open"');
    expect(resolving).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(resolving);
    expect(branch.slice(resolving, gate)).toMatch(/const result = run\(\);[\s\S]*?return;/);
  });

  it("먼저 이동한 뒤 확인이 끝나면 같은 회원 게이트(동의·프로필) 실행 — 로그인 시트는 띄우지 않음", () => {
    const branch = src.slice(src.indexOf("if (isRecoveringPhase(sessionPhase)) {"));
    expect(branch.slice(0, 600)).toContain('enforceAuthGatesAfterDeferredNavigation("messenger_open"');
    const fn = auth.slice(auth.indexOf("export async function enforceAuthGatesAfterDeferredNavigation"));
    const body = fn.slice(0, fn.indexOf("export async function requireAuthAction"));
    expect(body).toContain("isClientSignupComplete(profile)");
    expect(body).toContain("buildConsentHrefForAction(next)");
    expect(body).toContain("requireProfileCompletionClient(");
    expect(body).not.toContain("openLoginRequiredSheet(");
  });

  it("화면 게이트가 메신저 경로를 감싼다(비회원 판정 위임처)", () => {
    expect(layout).toContain("<CommunityMessengerGuestGate>");
  });

  it("계측: 탭 경로·인증 거부·이동 차단 이유 코드", () => {
    expect(src).toContain('"[bottom-nav-tap] path=sync"');
    expect(src).toContain('"[bottom-nav-tap] path=async"');
    expect(commit).toContain('"[bottom-nav-tap] blocked"');
    for (const reason of ["auth_resolution_hold", "login_sheet", "consent", "profile"]) {
      expect(auth).toContain(`reason: "${reason}"`);
    }
  });
});
