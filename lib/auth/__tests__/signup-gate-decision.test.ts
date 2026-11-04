import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifySignupStatusResponse,
  SIGNUP_GATE_RETRY_DELAYS_MS,
  signupGateRetryDelayMs,
} from "@/lib/auth/signup-gate-decision";
import { deriveDibaySignupStatus, resolveDibaySignupRoute } from "@/lib/auth/dibay-signup-status";
import { isClientSignupGateExemptPath } from "@/lib/auth/client-signup-gate";

const REQUIRED = {
  termsVersion: "2026-04-store-review",
  privacyVersion: "2026-04-store-review",
  acceptedTermsVersions: ["2026-04-store-review"],
  acceptedPrivacyVersions: ["2026-04-store-review"],
};

function statusFor(profile: Record<string, unknown>, privilegedAdmin = false) {
  const signup = deriveDibaySignupStatus({ id: "u1", ...profile }, {
    hasSession: true,
    privilegedAdmin,
    requiredConsent: REQUIRED,
  });
  return { signup, route: resolveDibaySignupRoute(signup, "/stores") };
}

const CONSENTED = {
  terms_accepted_at: "2026-08-10T00:00:00Z",
  terms_version: "2026-04-store-review",
  privacy_accepted_at: "2026-08-10T00:00:00Z",
  privacy_version: "2026-04-store-review",
};

describe("classifySignupStatusResponse", () => {
  it("existing consented member → complete (no re-consent)", () => {
    expect(classifySignupStatusResponse(200, statusFor(CONSENTED))).toEqual({ kind: "complete" });
  });

  it("existing member without a consent record → redirect to terms with next", () => {
    const out = classifySignupStatusResponse(200, statusFor({}));
    expect(out).toEqual({ kind: "redirect", target: "/auth/onboarding/terms?next=%2Fstores" });
  });

  it("privileged admin without a record keeps the admin exemption", () => {
    expect(classifySignupStatusResponse(200, statusFor({}, true))).toEqual({ kind: "complete" });
  });

  it("401 → session lost (neither complete nor redirect)", () => {
    expect(classifySignupStatusResponse(401, { error: "unauthorized" })).toEqual({ kind: "session_lost" });
  });

  it("server errors and abnormal bodies are never treated as consent complete", () => {
    expect(classifySignupStatusResponse(500, statusFor(CONSENTED))).toEqual({ kind: "retry" });
    expect(classifySignupStatusResponse(503, null)).toEqual({ kind: "retry" });
    expect(classifySignupStatusResponse(200, null)).toEqual({ kind: "retry" });
    expect(classifySignupStatusResponse(200, { ok: true })).toEqual({ kind: "retry" });
    expect(
      classifySignupStatusResponse(200, { signup: { consentComplete: "yes" } as never, route: "/x" }),
    ).toEqual({ kind: "retry" });
  });

  it("incomplete verdict without a usable route → retry, not an invented destination", () => {
    const { signup } = statusFor({});
    expect(classifySignupStatusResponse(200, { signup })).toEqual({ kind: "retry" });
    expect(classifySignupStatusResponse(200, { signup, route: "https://evil.example" })).toEqual({ kind: "retry" });
  });
});

describe("signupGateRetryDelayMs", () => {
  it("backs off then stops", () => {
    SIGNUP_GATE_RETRY_DELAYS_MS.forEach((ms, i) => expect(signupGateRetryDelayMs(i)).toBe(ms));
    expect(signupGateRetryDelayMs(SIGNUP_GATE_RETRY_DELAYS_MS.length)).toBeNull();
  });
});

describe("DibaySignupGate wiring", () => {
  const src = readFileSync(path.join(process.cwd(), "components/auth/DibaySignupGate.tsx"), "utf8");

  it("starts the consent check on /stores without waiting for first input", () => {
    expect(src).not.toContain("useStoresHomeOverlayDeferUntilInput");
    expect(src).not.toContain("deferStoresHomeLcp");
    expect(isClientSignupGateExemptPath("/stores")).toBe(false);
  });

  it("routes signup-status through the classifier and retries on failure", () => {
    expect(src).toContain("classifySignupStatusResponse(status, json)");
    expect(src).toMatch(/catch \{\s*scheduleRetry\(\);/);
  });

  it("keeps escape paths open", () => {
    expect(isClientSignupGateExemptPath("/mypage/customer-center")).toBe(true);
    expect(isClientSignupGateExemptPath("/mypage/section/settings/leave")).toBe(true);
    expect(isClientSignupGateExemptPath("/auth/onboarding/terms")).toBe(true);
  });
});
