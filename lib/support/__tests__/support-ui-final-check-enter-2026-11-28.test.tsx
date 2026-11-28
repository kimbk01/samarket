// @vitest-environment jsdom
/**
 * 최종 점검 U6 (final-audit-2.md §2) — 고객센터 진입·문의 바로가기 대기 화면 = DIBAY 스피너,
 * 오류 문구는 코드마다(open_failed ≠ missing_context). 동작 시험(jsdom 렌더).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn() }),
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, safeT: (k: string) => k, language: "ko" }),
}));

let deliverResult: { ok: boolean; error?: string } = { ok: true };
vi.mock("@/lib/support/deliver-support-open", () => ({
  deliverSupportOpen: () => ({ ...deliverResult, source: "enter" }),
  canDeliverSupportOpen: () => deliverResult.ok,
  deliverSupportOpenAfterRouteLeaves: () => undefined,
}));
vi.mock("@/lib/auth/dibay-session-manager", () => ({
  getSessionPhase: () => "restoring",
  ensureSessionHealthy: () => new Promise(() => undefined),
}));

import { MESSAGES } from "@/lib/i18n/messages";
import { SupportCenterEnterClient } from "@/components/support/SupportCenterEnterClient";
import { SupportCaseBootstrapClient } from "@/components/support/SupportCaseBootstrapClient";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  replace.mockClear();
  deliverResult = { ok: true };
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/support/enter");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("U6 진입 오류 문구 = 코드마다 (동작)", () => {
  it("맥락 없음 = missing_context 문구", async () => {
    await act(async () => root.render(<SupportCenterEnterClient />));
    const p = container.querySelector("[data-support-enter-error]")!;
    expect(p.getAttribute("data-support-enter-error")).toBe("missing_context");
    expect(p.textContent).toBe("support_enter_missing_context");
  });

  it("창 열기 실패 = open_failed 문구(맥락 없음 문구 아님)", async () => {
    window.history.replaceState(null, "", "/support/enter?category=ACCOUNT");
    deliverResult = { ok: false, error: "open_failed" };
    await act(async () => root.render(<SupportCenterEnterClient />));
    const p = container.querySelector("[data-support-enter-error]")!;
    expect(p.getAttribute("data-support-enter-error")).toBe("open_failed");
    expect(p.textContent).toBe("support_enter_open_failed");
    const ko = MESSAGES.ko as Record<string, string>;
    const en = MESSAGES.en as Record<string, string>;
    expect(ko.support_enter_open_failed).toBeTruthy();
    expect(en.support_enter_open_failed).toBeTruthy();
  });
});

describe("U6 대기 = DIBAY 스피너(글자 아님) (동작)", () => {
  it("문의 바로가기 세션 복구 중", async () => {
    await act(async () => root.render(<SupportCaseBootstrapClient caseId="c1" />));
    expect(container.querySelector("[data-dibay-pending-spinner]")).not.toBeNull();
    expect(container.textContent).not.toContain("common_loading");
  });
});
