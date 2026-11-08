/**
 * C8 진입 계측 계약 — 화이트리스트 정규화·개인정보 차단·수집 API·게이트 제외.
 * docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md §4 C8
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENTRY_TELEMETRY_LOG_TAG,
  ENTRY_TELEMETRY_MAX_EVENTS_PER_RUN,
  sanitizeEntryTelemetryEvent,
} from "@/lib/telemetry/entry-telemetry-contract";
import { resetEntryTelemetryRunLimiterForTests } from "@/lib/telemetry/entry-telemetry-run-limiter";
import { isNonMemberMutationPath, resolveMemberActionClassForApiMutation } from "@/lib/auth/member-action-policy";
import { POST } from "@/app/api/telemetry/entry/route";

function validEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    run: "0f6c2d8e-1b1a-4c7e-9a3b-2a1f0e9d8c7b",
    seq: 1,
    kind: "cold",
    ev: "released",
    platform: "android",
    appVersion: "1.2.5",
    appBuild: "37",
    webSha: "9af664c",
    entryKind: "user_cold",
    restoreHint: "fresh",
    releaseReason: "initialDestinationVisualReady",
    failure: null,
    recovery: "none",
    prevFailure: null,
    reloads: 0,
    ageMs: 1834.4,
    hiddenMs: null,
    visible: true,
    t: { firstHtml: 412, reactMounted: 905, release: 1420 },
    ...over,
  };
}

describe("sanitizeEntryTelemetryEvent", () => {
  it("계약 필드만 남기고 숫자는 정수로 반올림한다", () => {
    const out = sanitizeEntryTelemetryEvent(validEvent());
    expect(out).not.toBeNull();
    expect(out!.ageMs).toBe(1834);
    expect(out!.t).toEqual({ firstHtml: 412, reactMounted: 905, release: 1420 });
  });

  it("알 수 없는 필드(토큰·이메일·사용자 ID·URL)는 버린다", () => {
    const out = sanitizeEntryTelemetryEvent(
      validEvent({
        accessToken: "eyJhbGciOi...",
        email: "a@b.c",
        userId: "edc8c2f0-2673-4ca8-9d63-92a609d556f4",
        url: "/philife?x=1",
        t: { firstHtml: 1, cookie: 5 },
      })
    );
    const json = JSON.stringify(out);
    expect(json).not.toContain("eyJ");
    expect(json).not.toContain("a@b.c");
    expect(json).not.toContain("edc8c2f0");
    expect(json).not.toContain("philife");
    expect(out!.t).toEqual({ firstHtml: 1 });
  });

  it("문자열 필드는 짧은 토큰 형식만 허용한다 (자유 문장·URL 차단)", () => {
    const out = sanitizeEntryTelemetryEvent(
      validEvent({ releaseReason: "https://evil.example/?token=abc", appVersion: "x".repeat(65) })
    );
    expect(out!.releaseReason).toBeNull();
    expect(out!.appVersion).toBeNull();
  });

  it("필수 필드가 틀리면 기록하지 않는다", () => {
    expect(sanitizeEntryTelemetryEvent(validEvent({ v: 2 }))).toBeNull();
    expect(sanitizeEntryTelemetryEvent(validEvent({ kind: "boot" }))).toBeNull();
    expect(sanitizeEntryTelemetryEvent(validEvent({ platform: "windows" }))).toBeNull();
    expect(sanitizeEntryTelemetryEvent(validEvent({ seq: ENTRY_TELEMETRY_MAX_EVENTS_PER_RUN + 1 }))).toBeNull();
    expect(sanitizeEntryTelemetryEvent(validEvent({ ageMs: -1 }))).toBeNull();
    expect(sanitizeEntryTelemetryEvent(null)).toBeNull();
    expect(sanitizeEntryTelemetryEvent([validEvent()])).toBeNull();
  });

  it("범위 밖 단계 시각은 버린다", () => {
    const out = sanitizeEntryTelemetryEvent(validEvent({ t: { firstHtml: 99_999_999, release: Number.NaN } }));
    expect(out!.t).toEqual({});
  });
});

describe("POST /api/telemetry/entry", () => {
  let info: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetEntryTelemetryRunLimiterForTests();
    info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  });
  afterEach(() => info.mockRestore());

  function req(body: string): Request {
    return new Request("https://samarket.vercel.app/api/telemetry/entry", { method: "POST", body });
  }

  it("정상 이벤트 → 204 + 로그 1줄", async () => {
    const res = await POST(req(JSON.stringify(validEvent())));
    expect(res.status).toBe(204);
    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0][0]);
    expect(line.startsWith(`${ENTRY_TELEMETRY_LOG_TAG} `)).toBe(true);
    const logged = JSON.parse(line.slice(ENTRY_TELEMETRY_LOG_TAG.length + 1));
    expect(logged.run).toBe("0f6c2d8e-1b1a-4c7e-9a3b-2a1f0e9d8c7b");
    expect(logged).toHaveProperty("dpl");
  });

  it("잘못된 본문·과대 본문 → 204, 기록 없음", async () => {
    expect((await POST(req("not json"))).status).toBe(204);
    expect((await POST(req(JSON.stringify(validEvent({ v: 9 }))))).status).toBe(204);
    expect((await POST(req("x".repeat(5000)))).status).toBe(204);
    expect(info).not.toHaveBeenCalled();
  });

  it("실행 ID 당 상한을 넘으면 기록하지 않는다", async () => {
    for (let i = 0; i < ENTRY_TELEMETRY_MAX_EVENTS_PER_RUN + 3; i += 1) {
      await POST(req(JSON.stringify(validEvent({ seq: Math.min(i + 1, ENTRY_TELEMETRY_MAX_EVENTS_PER_RUN) }))));
    }
    expect(info).toHaveBeenCalledTimes(ENTRY_TELEMETRY_MAX_EVENTS_PER_RUN);
  });

  it("수집 API 는 DB·인증을 쓰지 않는다 (소스 계약)", () => {
    const src = readFileSync("app/api/telemetry/entry/route.ts", "utf8");
    expect(src).not.toMatch(/supabase|createClient|requireAuth|cookies\(|headers\(\)/i);
  });
});

describe("proxy 회원 게이트 제외", () => {
  it("/api/telemetry/* 는 회원 행위가 아니다 → mutation 게이트(DB 읽기) 미실행", () => {
    expect(isNonMemberMutationPath("/api/telemetry/entry")).toBe(true);
    expect(resolveMemberActionClassForApiMutation("/api/telemetry/entry")).toBe("NON_MEMBER");
  });
});
