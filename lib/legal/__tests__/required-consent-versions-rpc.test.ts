import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 순서 2 — 필수 약관 버전은 `required_consent_versions` 1회(본문 안 읽음).
 * 호출 실패·예외 → 기존 문서 읽기 경로. 버전 없음 → STORE_* fallback (기존과 같음).
 */
const h = vi.hoisted(() => ({
  rpc: null as null | ((name: string, args: unknown) => Promise<unknown>),
  legacyCalls: 0,
}));

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => (h.rpc ? { rpc: h.rpc } : {}),
}));
vi.mock("@/lib/legal/load-published-legal-document", () => ({
  loadPublishedAppLegalDocumentResult: vi.fn(async (kind: string) => {
    h.legacyCalls += 1;
    return { ok: true, row: { version: kind === "terms" ? "legacy-t" : "legacy-p" } };
  }),
}));

import { STORE_PRIVACY_VERSION, STORE_TERMS_VERSION } from "@/lib/auth/store-member-policy";
import {
  resetRequiredConsentVersionsStateForTests,
  resolveRequiredConsentVersionsStrict,
} from "@/lib/legal/resolve-required-consent-versions";

describe("required consent versions via RPC", () => {
  beforeEach(() => {
    resetRequiredConsentVersionsStateForTests();
    h.legacyCalls = 0;
    h.rpc = null;
  });

  it("RPC 1회 · 문서 읽기 0 · ko 로 호출", async () => {
    const calls: unknown[] = [];
    h.rpc = async (name, args) => {
      calls.push([name, args]);
      return { data: { terms: "2026-10-01", privacy: "2026-10-02" }, error: null };
    };
    const v = await resolveRequiredConsentVersionsStrict();
    expect(v).toEqual({ termsVersion: "2026-10-01", privacyVersion: "2026-10-02", source: "cms" });
    expect(calls).toEqual([["required_consent_versions", { p_locale: "ko" }]]);
    expect(h.legacyCalls).toBe(0);
  });

  it("게시 문서 없음(null) → STORE_* fallback (기존과 같음)", async () => {
    h.rpc = async () => ({ data: { terms: null, privacy: "p1" }, error: null });
    const v = await resolveRequiredConsentVersionsStrict();
    expect(v).toEqual({ termsVersion: STORE_TERMS_VERSION, privacyVersion: "p1", source: "fallback" });
  });

  it("RPC 오류 → 기존 문서 읽기", async () => {
    h.rpc = async () => ({ data: null, error: { message: "boom" } });
    const v = await resolveRequiredConsentVersionsStrict();
    expect(v).toEqual({ termsVersion: "legacy-t", privacyVersion: "legacy-p", source: "cms" });
    expect(h.legacyCalls).toBe(2);
  });

  it("RPC 예외 → 기존 문서 읽기", async () => {
    h.rpc = async () => {
      throw new Error("network");
    };
    const v = await resolveRequiredConsentVersionsStrict();
    expect(v.termsVersion).toBe("legacy-t");
    expect(h.legacyCalls).toBe(2);
  });

  it("fallback 상수 확인", () => {
    expect(STORE_PRIVACY_VERSION).toBeTruthy();
  });
});
