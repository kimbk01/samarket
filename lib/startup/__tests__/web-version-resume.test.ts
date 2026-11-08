/**
 * C3 — 복귀 시 웹 버전 확인 · 안전 순간 1회 새로고침 (docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md §4 C3).
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasNewerWebDeploy,
  isSafeMomentForWebUpdateReload,
  resetWebVersionResumeCheckForTests,
  runWebVersionResumeCheck,
  WEB_VERSION_CHECK_MIN_GAP_MS,
  WEB_VERSION_CHECK_MIN_HIDDEN_MS,
  type SafeReloadInput,
} from "@/lib/startup/web-version-resume.client";
import { isMemberReadExemptPath } from "@/lib/auth/enforce-api-member-read-policy";
import { GET } from "@/app/api/app/web-version/route";

vi.mock("@/lib/telemetry/entry-telemetry.client", () => ({ noteEntryUpdateReload: vi.fn() }));
vi.mock("@/lib/call/own-live-call", () => ({ readOwnLiveCall: () => null }));

const SAFE: SafeReloadInput = { pathname: "/philife", visible: true, liveCall: false, editing: false, modalOpen: false };

function deps(over: Partial<{ remote: string | null; local: string | null; state: SafeReloadInput; now: number }> = {}) {
  const reload = vi.fn();
  const fetchRemoteSha = vi.fn(async () => (over.remote === undefined ? "bbbbbbb" : over.remote));
  return {
    reload,
    fetchRemoteSha,
    d: {
      now: () => over.now ?? 1_000_000_000,
      localSha: () => (over.local === undefined ? "aaaaaaa" : over.local),
      fetchRemoteSha,
      reload,
      readState: () => over.state ?? SAFE,
    },
  };
}

const LONG = WEB_VERSION_CHECK_MIN_HIDDEN_MS + 1;

beforeEach(() => resetWebVersionResumeCheckForTests());

describe("판정 함수", () => {
  it("버전은 둘 다 7자리 SHA 이고 다를 때만 새 배포", () => {
    expect(hasNewerWebDeploy("aaaaaaa", "bbbbbbb")).toBe(true);
    expect(hasNewerWebDeploy("aaaaaaa", "aaaaaaa")).toBe(false);
    expect(hasNewerWebDeploy("", "bbbbbbb")).toBe(false);
    expect(hasNewerWebDeploy("aaaaaaa", null)).toBe(false);
    expect(hasNewerWebDeploy("aaaaaaa", "<html>")).toBe(false);
  });

  it("허브 목록 화면만 안전 — 채팅방·작성·결제·주문은 아님", () => {
    for (const p of ["/", "/philife", "/market", "/stores", "/community-messenger", "/mypage", "/philife/"]) {
      expect(isSafeMomentForWebUpdateReload({ ...SAFE, pathname: p })).toBe(true);
    }
    for (const p of [
      "/community-messenger/rooms/abc",
      "/write",
      "/stores/abc/checkout",
      "/orders/store/1/chat",
      "/philife/123",
      "/market/abc",
      "/community-messenger/calls/x",
    ]) {
      expect(isSafeMomentForWebUpdateReload({ ...SAFE, pathname: p })).toBe(false);
    }
  });

  it("통화 중·입력 중·모달 열림·화면 숨김이면 안전하지 않다", () => {
    expect(isSafeMomentForWebUpdateReload({ ...SAFE, liveCall: true })).toBe(false);
    expect(isSafeMomentForWebUpdateReload({ ...SAFE, editing: true })).toBe(false);
    expect(isSafeMomentForWebUpdateReload({ ...SAFE, modalOpen: true })).toBe(false);
    expect(isSafeMomentForWebUpdateReload({ ...SAFE, visible: false })).toBe(false);
  });
});

describe("복귀 처리", () => {
  it("30분 이상 백그라운드 + 새 배포 + 안전 → 새로고침 1회", async () => {
    const { d, reload } = deps();
    expect(await runWebVersionResumeCheck(LONG, d)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("짧은 백그라운드는 확인 요청조차 보내지 않는다", async () => {
    const { d, fetchRemoteSha, reload } = deps();
    expect(await runWebVersionResumeCheck(WEB_VERSION_CHECK_MIN_HIDDEN_MS - 1, d)).toBe(false);
    expect(fetchRemoteSha).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("같은 배포면 새로고침 없음", async () => {
    const { d, reload } = deps({ remote: "aaaaaaa" });
    expect(await runWebVersionResumeCheck(LONG, d)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("새 배포여도 안전하지 않으면(채팅방) 새로고침 없음", async () => {
    const { d, reload } = deps({ state: { ...SAFE, pathname: "/community-messenger/rooms/x" } });
    expect(await runWebVersionResumeCheck(LONG, d)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("확인 간격 30분 — 바로 다시 복귀하면 확인 요청 없음", async () => {
    const first = deps({ remote: "aaaaaaa" });
    await runWebVersionResumeCheck(LONG, first.d);
    const second = deps({ now: 1_000_000_000 + WEB_VERSION_CHECK_MIN_GAP_MS - 1 });
    expect(await runWebVersionResumeCheck(LONG, second.d)).toBe(false);
    expect(second.fetchRemoteSha).not.toHaveBeenCalled();
  });

  it("확인 실패(네트워크)는 무시", async () => {
    const { d, reload } = deps({ remote: null });
    expect(await runWebVersionResumeCheck(LONG, d)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("번들 버전을 모르면(로컬 개발) 확인하지 않는다", async () => {
    const { d, fetchRemoteSha } = deps({ local: null });
    expect(await runWebVersionResumeCheck(LONG, d)).toBe(false);
    expect(fetchRemoteSha).not.toHaveBeenCalled();
  });
});

describe("버전 API", () => {
  it("현재 배포 SHA 7자리·캐시 금지·DB/인증 없음", async () => {
    const prev = process.env.VERCEL_GIT_COMMIT_SHA;
    process.env.VERCEL_GIT_COMMIT_SHA = "9a488885db4f546c7476c3a9b3cf32954d1b7f25";
    const res = GET();
    process.env.VERCEL_GIT_COMMIT_SHA = prev;
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.json()).toEqual({ sha: "9a48888" });
    const src = readFileSync("app/api/app/web-version/route.ts", "utf8");
    expect(src).not.toMatch(/supabase|cookies\(|requireAuth/i);
  });

  it("회원 읽기 게이트 제외 (DB 조회 없음)", () => {
    expect(isMemberReadExemptPath("/api/app/web-version")).toBe(true);
  });
});

describe("연결 · 통화 코드 무변경", () => {
  it("AppBootProvider 에서 시작하고, 통화 판정은 readOwnLiveCall 읽기만 한다", () => {
    expect(readFileSync("components/app/AppBootProvider.tsx", "utf8")).toContain("startWebVersionResumeCheck();");
    const src = readFileSync("lib/startup/web-version-resume.client.ts", "utf8");
    expect(src).toContain('import { readOwnLiveCall } from "@/lib/call/own-live-call";');
    expect(src).not.toMatch(/setInterval|scheduleChunkReloadOnce/);
  });
});
