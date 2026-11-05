/** @vitest-environment jsdom */
/**
 * B2a — 방 스냅샷은 통화 권위가 아니다.
 * 방 부트스트랩(critical·silent_delta·RSC 시드·캐시)은 통화를 조회하지 않아 `activeCall` 이 항상 null 이다.
 * 그러므로 방 코드는 스냅샷 변경·`activeCall=null`·네트워크 오류로 통화 media 를 끊거나 dock·PiP·hosted 플래그를 지우지 않는다.
 * 정리는 서버 terminal 확인 경로(`releaseCallEngineTerminalLocalState`·`pinCommunityMessengerCallTerminalSurfaceDismiss`)만 한다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllCommunityCallLocalSessionFlags,
  dockCommunityCall,
  enterAndroidOsPipCommunityCall,
  isRetainedCallPresentation,
  minimizeCommunityCallToPip,
  peekDetachedCommunityCallSessionId,
  readAndroidOsPipCallSessionId,
  readDockedCallSessionId,
  readHostedActiveCallSessionId,
  readPipMinimizedCallSessionId,
} from "@/lib/community-messenger/call-presentation-ownership";

const ROOT = join(__dirname, "../../../..");
const ROOM_CODE_DIRS = ["lib/community-messenger/room", "components/community-messenger/room"];
const FORBIDDEN_IN_ROOM = [
  "disposeDetachedCommunityCallIfStale",
  "forceDisposeDetachedCommunityCall",
  "clearAllCommunityCallLocalSessionFlags",
  "clearCommunityCallPresentationFlags",
  "clearHostedActiveCallSession",
];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "_extract") continue;
      out.push(...listSourceFiles(p));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("B2a 계약 — 방 코드는 통화 로컬 상태를 정리하지 않는다", () => {
  it("방 클라이언트(lib·components room) 소스에 통화 정리·dispose 호출이 없다", () => {
    const hits: string[] = [];
    for (const d of ROOM_CODE_DIRS) {
      for (const file of listSourceFiles(join(ROOT, d))) {
        const src = readFileSync(file, "utf8");
        for (const name of FORBIDDEN_IN_ROOM) {
          if (new RegExp(`\\b${name}\\b`).test(src)) hits.push(`${relative(ROOT, file)} → ${name}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});

const SID = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";

beforeEach(() => {
  clearAllCommunityCallLocalSessionFlags();
  sessionStorage.clear();
});

afterEach(() => {
  clearAllCommunityCallLocalSessionFlags();
});

describe("B2a — 서버 종료 확인 경로만 정리 (기존 경로 보존)", () => {
  it("dock: 다른 세션 terminal 은 유지 · 같은 세션 terminal 은 dock·hosted 정리", async () => {
    const cleanup = vi.fn(async () => undefined);
    dockCommunityCall({ sessionId: SID, roomId: "room-a", cleanup });
    expect(readDockedCallSessionId()).toBe(SID);
    expect(readHostedActiveCallSessionId()).toBe(SID);
    expect(isRetainedCallPresentation(SID)).toBe(true);

    const { releaseCallEngineTerminalLocalState } = await import(
      "@/lib/community-messenger/call-engine/call-engine-terminal-cleanup"
    );
    await releaseCallEngineTerminalLocalState(OTHER, "ended");
    expect(readDockedCallSessionId()).toBe(SID);
    expect(readHostedActiveCallSessionId()).toBe(SID);
    expect(peekDetachedCommunityCallSessionId()).toBe(SID);

    await releaseCallEngineTerminalLocalState(SID, "ended");
    expect(readDockedCallSessionId()).toBeNull();
    expect(readHostedActiveCallSessionId()).toBeNull();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("PiP(최소화)·Android OS PiP: 서버 종료 확인 전에는 플래그·detached 유지", () => {
    const cleanup = vi.fn(async () => undefined);
    minimizeCommunityCallToPip({ sessionId: SID, roomId: "room-a", cleanup });
    expect(readPipMinimizedCallSessionId()).toBe(SID);
    enterAndroidOsPipCommunityCall({ sessionId: SID, roomId: "room-a", cleanup });
    expect(readAndroidOsPipCallSessionId()).toBe(SID);
    expect(readHostedActiveCallSessionId()).toBe(SID);
    expect(peekDetachedCommunityCallSessionId()).toBe(SID);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("통화 화면 terminal 종료(pin dismiss)는 모든 플래그를 정리한다", async () => {
    const cleanup = vi.fn(async () => undefined);
    enterAndroidOsPipCommunityCall({ sessionId: SID, roomId: "room-a", cleanup });
    const { pinCommunityMessengerCallTerminalSurfaceDismiss } = await import(
      "@/lib/community-messenger/call-session-navigation-seed"
    );
    pinCommunityMessengerCallTerminalSurfaceDismiss(SID);
    expect(readAndroidOsPipCallSessionId()).toBeNull();
    expect(readHostedActiveCallSessionId()).toBeNull();
  });
});
