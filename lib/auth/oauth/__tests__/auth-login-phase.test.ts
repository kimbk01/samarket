import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isAuthLoginBusyPhase,
  isAuthLoginCompletingPhase,
  shouldTreatForegroundReturnAsCancel,
  type AuthLoginPhase,
} from "@/lib/auth/oauth/auth-login-phase";
import {
  getAuthLoginPhaseForTests,
  getOAuthPendingSnapshotForTests,
  setAuthLoginPhaseForTests,
  setOAuthPendingForTests,
} from "@/lib/auth/oauth/use-oauth-login";

const base = {
  sawHiddenSinceLaunch: true,
  eventType: "visibilitychange" as const,
  pageshowPersisted: false,
};

describe("공통 AUTH 상태 SSOT (auth-login-phase)", () => {
  afterEach(() => {
    setOAuthPendingForTests(null);
  });

  it("복귀·서버 확인·이동 중에는 로그인 화면(폼)으로 돌아가지 않는다", () => {
    const completing: AuthLoginPhase[] = ["returned", "confirming", "navigating"];
    for (const phase of completing) {
      expect(isAuthLoginCompletingPhase(phase)).toBe(true);
      expect(isAuthLoginBusyPhase(phase)).toBe(true);
    }
    expect(isAuthLoginCompletingPhase("provider")).toBe(false);
    expect(isAuthLoginBusyPhase("idle")).toBe(false);
  });

  it("복귀 이벤트는 provider 단계에서만 취소로 판정 — returned/confirming/navigating 은 절대 해제 안 함", () => {
    for (const phase of ["returned", "confirming", "navigating", "idle"] as AuthLoginPhase[]) {
      expect(
        shouldTreatForegroundReturnAsCancel({ ...base, phase, launchKind: "custom_tab" }),
      ).toBe(false);
    }
    expect(
      shouldTreatForegroundReturnAsCancel({ ...base, phase: "provider", launchKind: "custom_tab" }),
    ).toBe(true);
  });

  it("Custom Tab: 앱이 실제로 가려진 뒤 돌아온 경우만 취소", () => {
    expect(
      shouldTreatForegroundReturnAsCancel({
        ...base,
        phase: "provider",
        launchKind: "custom_tab",
        sawHiddenSinceLaunch: false,
      }),
    ).toBe(false);
  });

  it("Native SDK 는 SDK 결과(reject/resolve)로만 판정 — 복귀 이벤트 무시", () => {
    expect(
      shouldTreatForegroundReturnAsCancel({ ...base, phase: "provider", launchKind: "native_sdk" }),
    ).toBe(false);
  });

  it("iOS ASWebAuth 는 복귀 이벤트로 취소 판정하지 않는다 (런처 reject 로만)", () => {
    expect(
      shouldTreatForegroundReturnAsCancel({ ...base, phase: "provider", launchKind: "as_web_auth" }),
    ).toBe(false);
  });

  it("웹 리다이렉트는 bfcache 복원(pageshow persisted)만 취소", () => {
    const input = { ...base, phase: "provider" as const, launchKind: "web_redirect" as const };
    expect(shouldTreatForegroundReturnAsCancel(input)).toBe(false);
    expect(
      shouldTreatForegroundReturnAsCancel({ ...input, eventType: "pageshow", pageshowPersisted: true }),
    ).toBe(true);
  });

  it("pending 시작 = provider, 해제 = idle, 진행 단계는 pending 재설정으로 되돌아가지 않는다", () => {
    setOAuthPendingForTests("kakao");
    expect(getAuthLoginPhaseForTests()).toBe("provider");
    setAuthLoginPhaseForTests("confirming");
    setOAuthPendingForTests("kakao", { suppressVisiblePresentation: false });
    expect(getAuthLoginPhaseForTests()).toBe("confirming");
    setOAuthPendingForTests(null);
    expect(getAuthLoginPhaseForTests()).toBe("idle");
    expect(getOAuthPendingSnapshotForTests()).toBeNull();
  });

  it("임의 타이머로 성공·실패를 판정하지 않는다 (pending 해제 타이머 · 20초 폼 복귀 타이머 제거)", () => {
    const root = process.cwd();
    const hook = readFileSync(join(root, "lib/auth/oauth/use-oauth-login.ts"), "utf8");
    const page = readFileSync(join(root, "app/login/LoginPageClient.tsx"), "utf8");
    expect(hook).not.toMatch(/OAUTH_PENDING_TIMEOUT_MS/);
    expect(hook).not.toMatch(/setTimeout\(clearPending/);
    expect(page).not.toMatch(/setOauthCompleting\(false\)/);
    // 성공 경로 finally clearPending 금지
    expect(hook).not.toMatch(/finally \{\s*clearPending\(\);/);
  });
});
