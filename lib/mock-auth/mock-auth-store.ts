import {
  findMockSampleAccount,
  mockAccountByRole,
  type MockSampleAccount,
  type MockSampleRole,
} from "./mock-users";

const STORAGE_KEY = "kasama-mock-auth-session-v1";

export type MockAuthSession = {
  role: MockSampleRole;
  userId: string;
  displayName: string;
  loginId: string;
};

let session: MockAuthSession = accountToSession(mockAccountByRole("member"));
let version = 0;
const listeners = new Set<() => void>();

function accountToSession(a: MockSampleAccount): MockAuthSession {
  return {
    role: a.role,
    userId: a.userId,
    displayName: a.displayName,
    loginId: a.loginId,
  };
}

function readStorage(): MockAuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<MockAuthSession>;
    if (!p?.role || !p.userId || !p.loginId) return null;
    return {
      role: p.role,
      userId: p.userId,
      displayName: p.displayName ?? p.loginId,
      loginId: p.loginId,
    };
  } catch {
    return null;
  }
}

function writeStorage(s: MockAuthSession) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function bump() {
  version++;
  listeners.forEach((l) => l());
}

/** 브라우저: localStorage 복원. 서버: 기본 회원(qqqq) 세션(하이드레이션용). */
export function getMockSession(): MockAuthSession {
  if (typeof window !== "undefined") {
    const from = readStorage();
    if (from) {
      session = from;
      return session;
    }
  }
  return session;
}

export function subscribeMockAuth(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getMockAuthVersion() {
  return version;
}

export function mockAuthLogin(loginId: string, password: string): { ok: true } | { ok: false; error: string } {
  const a = findMockSampleAccount(loginId, password);
  if (!a) return { ok: false, error: "아이디 또는 비밀번호를 확인해 주세요." };
  session = accountToSession(a);
  writeStorage(session);
  bump();
  return { ok: true };
}

export function mockAuthSwitchRole(role: MockSampleRole): void {
  session = accountToSession(mockAccountByRole(role));
  writeStorage(session);
  bump();
}

export function mockAuthLogout(): void {
  session = accountToSession(mockAccountByRole("member"));
  writeStorage(session);
  bump();
}

/** 개발 패널 외 사용 금지 — 테스트 시 초기화용 */
export function mockAuthResetToDefaultMember(): void {
  session = accountToSession(mockAccountByRole("member"));
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  bump();
}
