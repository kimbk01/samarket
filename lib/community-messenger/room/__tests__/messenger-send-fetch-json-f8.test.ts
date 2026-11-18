/**
 * F8 (설계 2026-11-18 PR-1) — 글·스티커 전송은 응답 본문 읽기까지 같은 시간 제한 안에서 끝난다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMessengerSendJson } from "@/lib/community-messenger/room/messenger-send-fetch-json";

const TIMEOUT = 12_000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** 헤더는 오지만 본문(json)이 끝나지 않는 응답 */
function hangingBodyResponse(status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: () => new Promise(() => {}) } as unknown as Response;
}

describe("F8 fetchMessengerSendJson", () => {
  it("헤더 뒤 본문이 멈추면 같은 기한에 끝나고 jsonParsed=false (2xx → 결과 불명 분류 재료)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => hangingBodyResponse(200)));
    let settled: Awaited<ReturnType<typeof fetchMessengerSendJson>> | null = null;
    const p = fetchMessengerSendJson("/x", { method: "POST", timeoutMs: TIMEOUT }).then((r) => {
      settled = r;
    });
    await vi.advanceTimersByTimeAsync(TIMEOUT - 1);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(2);
    await p;
    expect(settled!.res?.status).toBe(200);
    expect(settled!.jsonParsed).toBe(false);
    expect(settled!.json).toEqual({});
  });

  it("헤더 전 시간 초과(abort 무시하는 fetch 포함) → res null", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    let settled: Awaited<ReturnType<typeof fetchMessengerSendJson>> | null = null;
    const p = fetchMessengerSendJson("/x", { timeoutMs: TIMEOUT }).then((r) => {
      settled = r;
    });
    await vi.advanceTimersByTimeAsync(TIMEOUT + 1);
    await p;
    expect(settled!.res).toBeNull();
  });

  it("네트워크 예외 → res null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    const r = await fetchMessengerSendJson("/x", { timeoutMs: TIMEOUT });
    expect(r.res).toBeNull();
  });

  it("정상 응답 → 본문 파싱, 기한 타이머 정리", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, message: { id: "m1" } }), { status: 200 }))
    );
    const r = await fetchMessengerSendJson<{ ok: boolean; message: { id: string } }>("/x", { timeoutMs: TIMEOUT });
    expect(r.jsonParsed).toBe(true);
    expect((r.json as { message: { id: string } }).message.id).toBe("m1");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("비 JSON 본문 → jsonParsed=false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    const r = await fetchMessengerSendJson("/x", { timeoutMs: TIMEOUT });
    expect(r.res?.status).toBe(502);
    expect(r.jsonParsed).toBe(false);
  });
});
