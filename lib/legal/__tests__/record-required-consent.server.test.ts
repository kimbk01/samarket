import { describe, expect, it, vi } from "vitest";
import { recordRequiredMemberConsentServer } from "@/lib/legal/record-required-consent.server";

const BASE = {
  userId: "u1",
  termsVersion: "t1",
  privacyVersion: "p1",
  dateOfBirth: "2000-01-01",
  source: "signup" as const,
};

describe("recordRequiredMemberConsentServer", () => {
  it("maps RPC success and never sends a marketing choice", async () => {
    const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
      data: { ok: true, termsVersion: "t1", privacyVersion: "p1", recordedAt: "2026-11-05T00:00:00Z" },
      error: null,
    }));
    const r = await recordRequiredMemberConsentServer({ rpc }, BASE);
    expect(r.ok).toBe(true);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_agree_marketing: false, p_marketing_version: null });
  });

  it("legacy reconsent sends no DOB", async () => {
    const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
      data: { ok: true, legacy: true, recordedAt: "x" },
      error: null,
    }));
    const r = await recordRequiredMemberConsentServer({ rpc }, { ...BASE, dateOfBirth: null, source: "reconsent" });
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_date_of_birth: null, p_source: "reconsent" });
    expect(r.ok && r.legacy).toBe(true);
  });

  it("idempotent re-submit is success", async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, idempotent: true, recordedAt: "x" }, error: null }));
    const r = await recordRequiredMemberConsentServer({ rpc }, BASE);
    expect(r.ok && r.idempotent).toBe(true);
  });

  it("fails closed when RPC missing or not executable (no profile-only success)", async () => {
    for (const message of [
      "Could not find the function public.record_member_required_consent",
      "permission denied for function record_member_required_consent",
    ]) {
      const rpc = vi.fn(async () => ({ data: null, error: { message } }));
      const r = await recordRequiredMemberConsentServer({ rpc }, BASE);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("rpc_unavailable");
        expect(r.httpStatus).toBe(503);
      }
    }
  });

  it("maps under-14 returned as data", async () => {
    const rpc = vi.fn(async () => ({ data: { ok: false, code: "age_under_minimum" }, error: null }));
    const r = await recordRequiredMemberConsentServer({ rpc }, { ...BASE, dateOfBirth: "2020-01-01" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("age_under_minimum");
      expect(r.httpStatus).toBe(403);
    }
  });
});
