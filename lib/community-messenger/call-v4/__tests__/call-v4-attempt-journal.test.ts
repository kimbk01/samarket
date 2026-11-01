import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ native: true }));
vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => platform.native,
}));

import {
  CALL_ATTEMPT_JOURNAL_MAX_AGE_MS,
  clearCallAttemptJournal,
  recordCallAttemptJournal,
  takePendingCallAttemptJournal,
} from "@/lib/community-messenger/call-v4/call-v4-attempt-journal";

/** §15-4 (4) — 생성 응답 전 웹이 다시 로드되면 남은 시도를 정리한다. */
describe("call-v4 발신 시도 기록", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    platform.native = true;
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal("window", { localStorage: globalThis.localStorage });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("응답 전 재로드 → 남은 시도를 한 번만 돌려준다", () => {
    recordCallAttemptJournal("a-1", 1_000);
    expect(takePendingCallAttemptJournal(null, 2_000)).toBe("a-1");
    expect(takePendingCallAttemptJournal(null, 2_000)).toBeNull();
  });

  it("응답을 받아 지운 시도는 돌려주지 않는다 · 다른 시도는 지우지 않는다", () => {
    recordCallAttemptJournal("a-1", 1_000);
    clearCallAttemptJournal("a-0");
    clearCallAttemptJournal("a-1");
    expect(takePendingCallAttemptJournal(null, 2_000)).toBeNull();
  });

  it("지금 진행 중인 시도는 건드리지 않는다", () => {
    recordCallAttemptJournal("a-1", 1_000);
    expect(takePendingCallAttemptJournal("a-1", 2_000)).toBeNull();
    expect(takePendingCallAttemptJournal(null, 2_000)).toBe("a-1");
  });

  it("오래된 기록은 정리만 한다", () => {
    recordCallAttemptJournal("a-1", 1_000);
    expect(takePendingCallAttemptJournal(null, 1_000 + CALL_ATTEMPT_JOURNAL_MAX_AGE_MS + 1)).toBeNull();
    expect(store.size).toBe(0);
  });

  it("앱이 아니면(데스크톱 브라우저 탭 공유) 기록하지 않는다", () => {
    platform.native = false;
    recordCallAttemptJournal("a-1", 1_000);
    expect(store.size).toBe(0);
    expect(takePendingCallAttemptJournal(null, 2_000)).toBeNull();
  });
});
