// @vitest-environment jsdom
/**
 * 가입 관문(동의 뒤 전화·주소) — 실제 컴포넌트 동작 (재감사3 · 가입 SSOT §3).
 *  - 일반 화면: 빠진 단계 화면으로 (next = 원래 화면)
 *  - 통화 화면: 보내지 않음
 *  - 사장님 운영 화면: 즉시 읽지 않고 5.2초 지연 큐로 읽은 뒤 보냄(앱 안 이동 포함)
 *  - 가입 완료: 보내지 않음
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/market", replace: vi.fn() }));
const gate = vi.hoisted(() => ({ step: "address" as string | null, calls: 0, reasons: [] as string[] }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace }),
}));
vi.mock("@/lib/app-boot/app-boot-store", () => ({
  getAppBootSnapshot: () => ({ status: "ready" }),
  isAppBootReady: () => true,
  peekAppBootProfile: () => ({
    id: "u1",
    terms_accepted_at: "2026-11-21T00:00:00Z",
    terms_version: "T",
    privacy_accepted_at: "2026-11-21T00:00:00Z",
    privacy_version: "P",
  }),
  subscribeAppBoot: () => () => {},
}));
vi.mock("@/lib/app-boot/run-app-boot", () => ({ ensureAppBoot: () => Promise.resolve() }));
vi.mock("@/lib/auth/fetch-signup-status-client", () => ({ fetchSignupStatusDeduped: vi.fn() }));
vi.mock("@/lib/addresses/mandatory-address-gate-client", () => ({
  invalidateMandatoryAddressGateClientCache: () => {},
  fetchMandatoryAddressGateDeduped: async (opts?: { reason?: string }) => {
    gate.calls += 1;
    gate.reasons.push(opts?.reason ?? "");
    return new Response(JSON.stringify({ ok: true, authenticated: true, registrationNextStep: gate.step }), {
      status: 200,
    });
  },
}));
vi.mock("@/lib/dev/network-loop-guard", () => ({
  guardedRouterReplace: (router: { replace: (t: string) => void }, target: string) => {
    router.replace(target);
    return true;
  },
  logNetworkLoopGuardReplace: () => {},
}));

import { DibaySignupGate, resetRegistrationBounceForTests } from "@/components/auth/DibaySignupGate";
import { resetSignupGateSessionFlags } from "@/lib/auth/signup-gate-session";
import { setClientRequiredConsentVersions } from "@/lib/legal/client-required-consent";
import { resetRegistrationPendingForTests } from "@/lib/auth/registration-pending-state.client";

async function flush() {
  for (let i = 0; i < 8; i += 1) await act(async () => {});
}

describe("DibaySignupGate — 가입 단계(전화·주소)", () => {
  let container: HTMLDivElement;
  let root: Root;

  function mount(path: string) {
    nav.pathname = path;
    window.history.replaceState(null, "", path);
    act(() => root.render(<DibaySignupGate />));
  }

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    /** 사장님 화면 큐는 `performance.now()` 기준 — 실제 시계 그대로, 타이머만 가짜 */
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    nav.replace.mockReset();
    gate.step = "address";
    gate.calls = 0;
    gate.reasons = [];
    resetSignupGateSessionFlags();
    resetRegistrationPendingForTests();
    resetRegistrationBounceForTests();
    setClientRequiredConsentVersions({
      termsVersion: "T",
      privacyVersion: "P",
      acceptedTermsVersions: ["T"],
      acceptedPrivacyVersions: ["P"],
    });
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("일반 화면 → 빠진 단계 화면 (원래 화면은 next)", async () => {
    mount("/market?tab=new");
    await flush();
    expect(nav.replace).toHaveBeenCalledWith("/auth/onboarding/address?next=%2Fmarket%3Ftab%3Dnew");
  });

  it("통화 화면은 보내지 않는다", async () => {
    mount("/community-messenger/calls/abc");
    await flush();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("가입 완료면 보내지 않는다", async () => {
    gate.step = null;
    mount("/market");
    await flush();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("사장님 운영 화면 — 즉시 읽지 않고, 5.2초 지연 뒤 읽어 빠진 단계 화면으로", async () => {
    mount("/stores/owner/orders");
    await flush();
    expect(gate.calls).toBe(0);
    expect(nav.replace).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_300);
    });
    await flush();
    expect(gate.calls).toBe(1);
    expect(nav.replace).toHaveBeenCalledWith("/auth/onboarding/address?next=%2Fstores%2Fowner%2Forders");
  });

  it("단계 화면이 곧바로 되돌려 보내면(다른 기기에서 완료) 사본을 버리고 서버에 다시 — 왕복 없음 (전체 감사 A6)", async () => {
    mount("/market");
    await flush();
    expect(nav.replace).toHaveBeenCalledTimes(1);
    const callsAfterFirst = gate.calls;
    /** 서버는 이제 완료 — 단계 화면이 /market 으로 되돌려 보냄(관문 다시 마운트) */
    gate.step = null;
    act(() => root.unmount());
    root = createRoot(container);
    mount("/market");
    await flush();
    expect(nav.replace).toHaveBeenCalledTimes(1);
    /** 되돌아온 화면에서는 요청 캐시를 건너뛴 서버 확인이 정확히 1번 */
    expect(gate.reasons.filter((r) => r === "registration_bounce")).toHaveLength(1);
    expect(gate.calls).toBeGreaterThan(callsAfterFirst);
  });
});
