/**
 * @vitest-environment jsdom
 */
/**
 * 빌드 전 감사 (2026-11-17 · Owner 「PR-1~3 진행 승인」) — 웹 첫 진입 B3·W1·W2·W3.
 * 시작 판정 `decide()` 를 실제 경로로 돌린다(순수 함수만 보던 v3 시험이 B3 를 못 잡았다).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAppEntryDecision, resetAppEntryDecisionForTests } from "@/lib/lifecycle/app-entry-kind";
import { discardRestoreEnvelope, writeRestoreEnvelope } from "@/lib/lifecycle/restore-envelope";
import { writeStartupConfigCache, readStartupConfigCache } from "@/lib/startup/startup-cache";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { startInactiveRetentionClock, expireInactiveLaunchIntroIndex, LAUNCH_INTRO_INACTIVE_RETENTION_MS, type LaunchIntroIndex } from "@/lib/launch-intro/cache";
import type { InitialAppSurface } from "@/lib/startup/initial-app-surface";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  } as Storage;
}

const EPOCH = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function setNative(hint: string | null) {
  const w = window as unknown as Record<string, unknown>;
  Object.defineProperty(w, "__DIBAY_LAUNCH_EPOCH__", { value: EPOCH, writable: true, configurable: true });
  if (hint === null) delete w.__DIBAY_NATIVE_RESTORE_HINT__;
  else Object.defineProperty(w, "__DIBAY_NATIVE_RESTORE_HINT__", { value: hint, writable: true, configurable: true });
}

function setAdminSurface(surface: InitialAppSurface) {
  writeStartupConfigCache({ ...readStartupConfigCache(), initialSurface: surface });
}

function clearCookies() {
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

describe("빌드 전 감사 — 웹 첫 진입", () => {
  beforeEach(() => {
    const ss = memoryStorage();
    const ls = memoryStorage();
    Object.defineProperty(window, "sessionStorage", { value: ss, configurable: true, writable: true });
    Object.defineProperty(window, "localStorage", { value: ls, configurable: true, writable: true });
    vi.stubGlobal("sessionStorage", ss);
    vi.stubGlobal("localStorage", ls);
    resetAppEntryDecisionForTests();
    discardRestoreEnvelope();
    setSupabaseProfileCache(null);
    clearCookies();
    window.history.replaceState(null, "", "/");
  });
  afterEach(() => {
    clearCookies();
    vi.unstubAllGlobals();
  });

  it("B3: 프로필 캐시가 아직 비어 있어도 로그인 쿠키가 있으면 회원 전용 첫 화면(MY)으로 간다", () => {
    setAdminSurface("my");
    document.cookie = "sb-abc-auth-token.0=x; path=/";
    setNative("fresh");
    const d = getAppEntryDecision();
    expect(d.kind).toBe("user_cold");
    expect(d.navigateTo).toBe("/mypage");
  });

  it("B3: 쿠키도 캐시도 없으면(비회원) 회원 전용 첫 화면 대신 홈 — 이동 없음", () => {
    setAdminSurface("chat");
    setNative("fresh");
    expect(getAppEntryDecision().navigateTo).toBeNull();
  });

  it("W1: 복원 힌트 없는 구 앱도 어드민 첫 화면으로 간다(v3 전 동작)", () => {
    setAdminSurface("community");
    setNative(null);
    const d = getAppEntryDecision();
    expect(d.reason).toBe("legacy_native_no_hint");
    expect(d.navigateTo).toBe("/philife");
  });

  it("W1: 딥링크 등 홈이 아닌 주소로 열린 구 앱은 그대로", () => {
    setAdminSurface("community");
    window.history.replaceState(null, "", "/stores/abc");
    setNative(null);
    expect(getAppEntryDecision().navigateTo).toBeNull();
  });

  it("W3: 문서 다시 열기 「현재 유지」 기준은 앱 홈 — 어드민 값이 라운지여도 /home 문서는 직전 화면으로 복원", () => {
    setAdminSurface("community");
    writeRestoreEnvelope("/stores", "guest");
    window.history.replaceState(null, "", "/home");
    setNative("fresh");
    window.sessionStorage.setItem("dibay:lifecycle:boot-epoch", EPOCH);
    const d = getAppEntryDecision();
    expect(d.kind).toBe("doc_reset");
    expect(d.navigateTo).toBe("/stores");
  });

  it("W2: 시작 시각 없는 예전 비활성 색인은 지금부터 보관 기간을 센다 · 7일 뒤 만료", () => {
    const now = Date.parse("2026-11-17T10:00:00.000Z");
    const legacy = {
      schema: 1,
      revision: 34,
      state: "unpublished",
      promotedAt: "2026-10-12T12:47:37.000Z",
      publication: { id: "p1", assets: [], document: {} },
    } as unknown as LaunchIntroIndex;
    expect(expireInactiveLaunchIntroIndex(legacy, now)).toBeNull();
    const clocked = startInactiveRetentionClock(legacy, new Date(now).toISOString());
    expect(clocked?.inactiveSince).toBe(new Date(now).toISOString());
    expect(startInactiveRetentionClock(clocked!, new Date(now + 1000).toISOString())).toBeNull();
    expect(expireInactiveLaunchIntroIndex(clocked!, now + LAUNCH_INTRO_INACTIVE_RETENTION_MS)?.publication).toBeNull();
    expect(startInactiveRetentionClock({ ...legacy, state: "active" }, new Date(now).toISOString())).toBeNull();
    expect(startInactiveRetentionClock({ ...legacy, publication: null }, new Date(now).toISOString())).toBeNull();
  });
});
