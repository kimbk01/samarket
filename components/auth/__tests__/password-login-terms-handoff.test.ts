import { afterEach, describe, expect, it, vi } from "vitest";

const fetchSignupStatusDeduped = vi.fn();

vi.mock("@/lib/auth/fetch-signup-status-client", () => ({
  fetchSignupStatusDeduped: (...args: unknown[]) => fetchSignupStatusDeduped(...args),
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => null }));
vi.mock("@/lib/app-boot/run-app-boot", () => ({ ensureAppBoot: vi.fn() }));
vi.mock("@/lib/auth/auth-session-immediate.client", () => ({ primeClientAuthSessionFromSupabase: vi.fn() }));
vi.mock("@/lib/auth/completion/run-common-auth-client-completion.client", () => ({
  runCommonAuthClientCompletion: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/auth/require-auth-action", () => ({
  consumePendingAuthAction: vi.fn(),
  clearStoredLoginRequiredDetail: vi.fn(),
}));

describe("P1-9 password login goes through the consent gate", () => {
  afterEach(() => {
    fetchSignupStatusDeduped.mockReset();
  });

  it("unconsented password login resolves to terms with next", async () => {
    fetchSignupStatusDeduped.mockResolvedValue({
      status: 200,
      json: { ok: true, signup: { consentComplete: false, signupComplete: false } },
    });
    const { resolvePasswordLoginTermsHandoff } = await import("@/components/auth/usePasswordLogin");
    const { resolveImmediateLoginTarget } = await import("@/lib/auth/finish-client-auth-login.client");
    const handoff = await resolvePasswordLoginTermsHandoff("/philife");
    expect(fetchSignupStatusDeduped).toHaveBeenCalledTimes(1);
    expect(handoff.consentComplete).toBe(false);
    expect(resolveImmediateLoginTarget({ ...handoff, next: "/philife" })).toBe(
      `/auth/onboarding/terms?next=${encodeURIComponent("/philife")}`,
    );
  });

  it("consented password login keeps the normal destination", async () => {
    fetchSignupStatusDeduped.mockResolvedValue({
      status: 200,
      json: { ok: true, signup: { consentComplete: true, signupComplete: true } },
    });
    const { resolvePasswordLoginTermsHandoff } = await import("@/components/auth/usePasswordLogin");
    const { resolveImmediateLoginTarget } = await import("@/lib/auth/finish-client-auth-login.client");
    const handoff = await resolvePasswordLoginTermsHandoff(null);
    expect(handoff.consentComplete).toBe(true);
    expect(resolveImmediateLoginTarget({ ...handoff, next: null })).not.toContain("/auth/onboarding/terms");
  });

  it("signup-status failure falls back to the previous (empty) handoff", async () => {
    fetchSignupStatusDeduped.mockRejectedValue(new Error("network"));
    const { resolvePasswordLoginTermsHandoff } = await import("@/components/auth/usePasswordLogin");
    expect(await resolvePasswordLoginTermsHandoff(null)).toEqual({});
  });
});
