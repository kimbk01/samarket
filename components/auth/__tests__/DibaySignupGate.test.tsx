// @vitest-environment jsdom
/**
 * DibaySignupGate — existing-member consent gate:
 *  - `/stores` starts the check on entry (no first-input deferral)
 *  - consented members are not re-consented; members without a record go to the terms screen
 *  - failed / abnormal signup-status is never treated as consent complete: retry with backoff
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/stores", replace: vi.fn() }));
const boot = vi.hoisted(() => ({ profile: null as Record<string, unknown> | null }));
const fetchStatus = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace }),
}));
vi.mock("@/lib/app-boot/app-boot-store", () => ({
  getAppBootSnapshot: () => ({ status: "ready" }),
  isAppBootReady: () => true,
  peekAppBootProfile: () => boot.profile,
  subscribeAppBoot: () => () => {},
}));
vi.mock("@/lib/app-boot/run-app-boot", () => ({ ensureAppBoot: () => Promise.resolve() }));
vi.mock("@/lib/auth/fetch-signup-status-client", () => ({ fetchSignupStatusDeduped: fetchStatus }));
vi.mock("@/lib/dev/network-loop-guard", () => ({
  guardedRouterReplace: (router: { replace: (t: string) => void }, target: string) => {
    router.replace(target);
    return true;
  },
  logNetworkLoopGuardReplace: () => {},
}));

import { DibaySignupGate } from "@/components/auth/DibaySignupGate";
import { resetSignupGateSessionFlags } from "@/lib/auth/signup-gate-session";
import { setClientRequiredConsentVersions } from "@/lib/legal/client-required-consent";

const V = "2026-04-store-review";
const TERMS = "/auth/onboarding/terms?next=%2Fstores";
const CONSENTED = {
  id: "u-consented",
  terms_accepted_at: "2026-08-10T00:00:00Z",
  terms_version: V,
  privacy_accepted_at: "2026-08-10T00:00:00Z",
  privacy_version: V,
};
const NO_RECORD = { id: "u-no-record" };
const incomplete = { signup: { consentComplete: false }, route: TERMS };

async function flush() {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
}

describe("DibaySignupGate", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    nav.pathname = "/stores";
    nav.replace.mockReset();
    fetchStatus.mockReset();
    resetSignupGateSessionFlags();
    setClientRequiredConsentVersions({
      termsVersion: V,
      privacyVersion: V,
      acceptedTermsVersions: [V],
      acceptedPrivacyVersions: [V],
    });
    window.history.replaceState(null, "", "/stores");
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  async function mount() {
    act(() => root.render(<DibaySignupGate />));
    await flush();
  }

  it("/stores: member without a consent record is sent to terms on entry, without any input", async () => {
    boot.profile = NO_RECORD;
    fetchStatus.mockResolvedValue({ status: 200, json: incomplete });
    await mount();
    expect(fetchStatus).toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledWith(TERMS);
  });

  it("consented member (session restore) is not re-consented and makes no status call", async () => {
    boot.profile = CONSENTED;
    await mount();
    expect(fetchStatus).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("server error is not consent complete: no redirect, retried, then redirected", async () => {
    boot.profile = NO_RECORD;
    fetchStatus.mockResolvedValueOnce({ status: 500, json: null }).mockResolvedValue({ status: 200, json: incomplete });
    await mount();
    expect(nav.replace).not.toHaveBeenCalled();
    const callsBefore = fetchStatus.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    await flush();
    expect(fetchStatus.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(nav.replace).toHaveBeenCalledWith(TERMS);
  });

  it("network error and abnormal 200 body both retry instead of passing", async () => {
    boot.profile = NO_RECORD;
    fetchStatus
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ status: 200, json: { ok: true } })
      .mockResolvedValue({ status: 200, json: incomplete });
    await mount();
    expect(nav.replace).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    await flush();
    expect(nav.replace).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    await flush();
    expect(nav.replace).toHaveBeenCalledWith(TERMS);
  });

  it("401 (session lost) neither redirects to terms nor retries", async () => {
    boot.profile = NO_RECORD;
    fetchStatus.mockResolvedValue({ status: 401, json: null });
    await mount();
    const calls = fetchStatus.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flush();
    expect(fetchStatus.mock.calls.length).toBe(calls);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("customer center and leave stay reachable for a member without consent", async () => {
    boot.profile = NO_RECORD;
    fetchStatus.mockResolvedValue({ status: 200, json: incomplete });
    for (const p of ["/mypage/customer-center", "/mypage/section/settings/leave"]) {
      nav.pathname = p;
      window.history.replaceState(null, "", p);
      await mount();
    }
    expect(fetchStatus).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
