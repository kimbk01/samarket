import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCallV4OutgoingAttempt,
  resetCallV4OutgoingAttemptForTests,
} from "@/lib/community-messenger/call-v4/call-v4-outgoing-attempt";

/** §15-4 — 서버는 UUID 시도 ID 만 계약으로 받는다. randomUUID 가 없는 환경도 UUID v4. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("발신 시도 ID 형식", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetCallV4OutgoingAttemptForTests();
  });

  it("randomUUID 있음", () => {
    expect(createCallV4OutgoingAttempt({ mediaType: "audio" }).attemptId).toMatch(UUID_V4);
  });

  it("randomUUID 없음 → getRandomValues 로 UUID v4", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: (b: Uint8Array) => real.getRandomValues(b) });
    expect(createCallV4OutgoingAttempt({ mediaType: "audio" }).attemptId).toMatch(UUID_V4);
  });

  it("crypto 없음 → Math.random 으로도 UUID v4", () => {
    vi.stubGlobal("crypto", undefined);
    expect(createCallV4OutgoingAttempt({ mediaType: "audio" }).attemptId).toMatch(UUID_V4);
  });
});
