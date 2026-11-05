/** @vitest-environment jsdom */
/**
 * 404 확정 세션 정리 범위 — 그 sessionId 의 표시 플래그만, 살아 있다는 근거가 없을 때만.
 * 진행 중인 다른 통화·최소화·PiP·detached 미디어는 그대로. 미디어 cleanup 은 호출하지 않는다.
 * + 통화 화면 계약: 조회 실패 경로가 세션을 무조건 비우거나 전역 terminal 정리를 부르지 않는다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllCommunityCallLocalSessionFlags,
  dockCommunityCall,
  enterAndroidOsPipCommunityCall,
  forceDisposeDetachedCommunityCall,
  peekDetachedCommunityCallSessionId,
  readAndroidOsPipCallSessionId,
  readDockedCallSessionId,
  readHostedActiveCallSessionId,
  writeHostedActiveCallSession,
} from "@/lib/community-messenger/call-presentation-ownership";
import { releaseLocalCallFlagsForMissingSession } from "@/lib/community-messenger/call-session-missing-local-cleanup";

const ROOT = join(__dirname, "../../..");

beforeEach(async () => {
  await forceDisposeDetachedCommunityCall();
  clearAllCommunityCallLocalSessionFlags();
});
afterEach(async () => {
  await forceDisposeDetachedCommunityCall();
  clearAllCommunityCallLocalSessionFlags();
});

describe("releaseLocalCallFlagsForMissingSession", () => {
  it("근거 없는 오래된 호스트 플래그(새로고침 뒤 등)만 남은 세션 → 그 세션 플래그 정리 + 호스트 동기화", () => {
    writeHostedActiveCallSession("stale");
    const notify = vi.fn();
    expect(
      releaseLocalCallFlagsForMissingSession({ sessionId: "stale", joinedMediaSessionId: null, notifyHostSync: notify })
    ).toBe(true);
    expect(readHostedActiveCallSessionId()).toBeNull();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("다른 통화가 dock(최소화)·detached 로 진행 중이면 그 통화는 그대로", () => {
    const cleanup = vi.fn(async () => undefined);
    dockCommunityCall({ sessionId: "live", roomId: "r1", cleanup });
    expect(
      releaseLocalCallFlagsForMissingSession({ sessionId: "stale", joinedMediaSessionId: null, notifyHostSync: () => {} })
    ).toBe(true);
    expect(readDockedCallSessionId()).toBe("live");
    expect(readHostedActiveCallSessionId()).toBe("live");
    expect(peekDetachedCommunityCallSessionId()).toBe("live");
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("다른 통화가 Android OS PiP 로 진행 중이면 그대로", () => {
    const cleanup = vi.fn(async () => undefined);
    enterAndroidOsPipCommunityCall({ sessionId: "live", roomId: "r1", cleanup });
    releaseLocalCallFlagsForMissingSession({ sessionId: "stale", joinedMediaSessionId: null, notifyHostSync: () => {} });
    expect(readAndroidOsPipCallSessionId()).toBe("live");
    expect(readHostedActiveCallSessionId()).toBe("live");
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("404 세션 자체가 detached 미디어를 보관 중(PiP·최소화) → 미디어·플래그 모두 유지", () => {
    const cleanup = vi.fn(async () => undefined);
    enterAndroidOsPipCommunityCall({ sessionId: "s404", roomId: "r1", cleanup });
    const notify = vi.fn();
    expect(
      releaseLocalCallFlagsForMissingSession({ sessionId: "s404", joinedMediaSessionId: null, notifyHostSync: notify })
    ).toBe(false);
    expect(readAndroidOsPipCallSessionId()).toBe("s404");
    expect(peekDetachedCommunityCallSessionId()).toBe("s404");
    expect(cleanup).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("404 세션 미디어에 이 화면이 join 중 → 유지", () => {
    writeHostedActiveCallSession("s404");
    expect(
      releaseLocalCallFlagsForMissingSession({ sessionId: "s404", joinedMediaSessionId: "s404", notifyHostSync: () => {} })
    ).toBe(false);
    expect(readHostedActiveCallSessionId()).toBe("s404");
  });
});

describe("통화 화면 계약 (CommunityMessengerCallClient)", () => {
  const src = readFileSync(join(ROOT, "components/community-messenger/CommunityMessengerCallClient.tsx"), "utf8");
  const refreshBody = src.slice(src.indexOf("const refreshSession = useCallback("), src.indexOf("refreshSessionRef.current = refreshSession"));
  const bootstrapStart = src.indexOf("const sessionUrl = `/api/community-messenger/calls/sessions/");
  const bootstrapBody = src.slice(bootstrapStart, src.indexOf("void bootstrap();", bootstrapStart));
  const missingBody = src.slice(
    src.indexOf("const releaseLocalFlagsForMissingSession = useCallback("),
    src.indexOf("const applySessionLookupFailure = useCallback(")
  );

  it("세션 조회(refreshSession·bootstrap)는 응답 분류를 거치고, 실패를 곧바로 null 세션으로 만들지 않는다", () => {
    for (const body of [refreshBody, bootstrapBody]) {
      expect(body.length).toBeGreaterThan(100);
      expect(body).toMatch(/classifyCallSessionFetchResponse\(/);
      expect(body).not.toMatch(/\.ok && json\.ok && json\.session \? json\.session : null/);
      expect(body).toMatch(/catch \{\s*outcome = \{ kind: "transient" \}/);
    }
  });

  it("세션 전환 뒤 늦은 응답은 버린다", () => {
    expect(refreshBody).toMatch(/currentSessionIdRef\.current !== requestedSessionId\) return null/);
  });

  it("404 확정 정리는 sessionId 한정 함수만 — 전역 terminal 정리·미디어 dispose 를 부르지 않는다", () => {
    expect(missingBody).toMatch(/releaseLocalCallFlagsForMissingSession\(/);
    expect(missingBody).not.toMatch(
      /releaseCallEngineTerminalLocalState|clearAllCommunityCallLocalSessionFlags|forceDisposeDetachedCommunityCall|disposeCallMedia|cleanupClient|finalizeCommunityMessengerCallTerminalExit/
    );
  });

  it("자동 폴링은 실패 상태(소진·401·404 확정)에서 멈추고, 온라인·화면 복귀로 재개", () => {
    expect(src).toMatch(/reason === "poll" && !readSessionLookupHealth\(\)\.canAutoRetry\(now\)/);
    expect(src).toMatch(/window\.addEventListener\("online", resume\)/);
  });
});
