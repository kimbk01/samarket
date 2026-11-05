// @vitest-environment jsdom
/**
 * 내정보 주소 목록·휴대폰 인증 상태 — 헤더·본문 멈춤에도 마감 안에 끝나고 재진입은 새 요청. 정상 응답은 동시 호출 1회 요청.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectConcurrentCallsShareOneRequest,
  expectStallSettlesAndRetryIsNewRequest,
  installStallFetch,
  stallState,
} from "@/lib/http/__tests__/shared-flight-stall-harness";

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  installStallFetch({ ok: true, addresses: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Call = () => Promise<unknown>;

async function load(): Promise<Record<string, Call>> {
  const addr = await import("@/lib/addresses/address-list-client-cache");
  const phone = await import("@/lib/mypage/load-phone-verification-state");
  return {
    addresses: () => addr.fetchMeAddressesListSingleFlight(),
    phone_verification: () => phone.fetchPhoneVerificationJson(),
  };
}

const names = ["addresses", "phone_verification"];

describe.each(["header_stall", "body_stall"] as const)("내정보 주소 목록·휴대폰 인증 상태 — %s", (kind) => {
  it.each(names)("%s", async (name) => {
    const calls = await load();
    await expectStallSettlesAndRetryIsNewRequest(kind, calls[name]);
  });
});

describe("내정보 주소 목록·휴대폰 인증 상태 — 정상 경로 보존", () => {
  it.each(names)("%s: 동시 호출 1회 요청", async (name) => {
    const calls = await load();
    await expectConcurrentCallsShareOneRequest(calls[name]);
  });

  it("주소 멈춤 종료는 기존 network_error 결과로 끝난다", async () => {
    const calls = await load();
    stallState.behavior = "header_stall";
    const p = calls.addresses();
    await vi.advanceTimersByTimeAsync(12_050);
    expect(await p).toMatchObject({ ok: false, status: 0, error: "network_error" });
  });
});
