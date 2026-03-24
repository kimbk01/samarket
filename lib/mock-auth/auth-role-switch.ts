/**
 * 샘플 역할 전환·로그인 — UI는 이 모듈만 호출해도 됨.
 * 이후 Supabase Auth 세션으로 갈아끼울 때 이 파일의 구현만 교체하면 됨.
 */
import {
  mockAuthLogin,
  mockAuthLogout,
  mockAuthSwitchRole,
  type MockAuthSession,
} from "./mock-auth-store";
import type { MockSampleRole } from "./mock-users";

export function loginWithSampleCredentials(
  loginId: string,
  password: string
): ReturnType<typeof mockAuthLogin> {
  return mockAuthLogin(loginId, password);
}

export function switchToSampleRole(role: MockSampleRole): void {
  mockAuthSwitchRole(role);
}

export function logoutSampleAuth(): void {
  mockAuthLogout();
}

export type { MockAuthSession, MockSampleRole };
