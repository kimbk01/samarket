// @vitest-environment jsdom
import "@/lib/i18n/admin-catalog";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/i18n/messages";

/**
 * 모임 R4 묶음 A — 어드민 화면 동작 (설계 docs/audit/moim-r4-decisions-design-2026-11-28.md §2-1 D-14 · §3).
 * 종료일 칸은 추천 제외만 · 단계를 바꾸면 날짜를 지움 · 경고·차단 안내 · 직접 제재 사유 = 정책의 켜진 사유(정책 이름).
 */

import { MoimReportDecisionPanel, type MoimReportDecisionContext } from "@/components/admin/moim/AdminMoimReportDecisionForm";
import { MoimSanctionApplySheet } from "@/components/admin/moim/AdminMoimDetailPage";
import { __setMoimAdminReportReasonsForTests, invalidateMoimAdminReportReasons } from "@/components/admin/moim/admin-moim-shared";

const NOTE = [translate("ko", "admin_moim_field_ends_at_none"), translate("en", "admin_moim_field_ends_at_none")];

let host: HTMLDivElement;
let root: Root;

function setSelect(el: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
function setInput(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
/** 조치 시트는 body 포털에 그릴 수 있어 문서 전체에서 찾는다 */
const dateInput = () => document.querySelector<HTMLInputElement>('input[type="date"]');
const hasNote = () => NOTE.some((n) => document.body.textContent?.includes(n));
/** 단계 고르기 = 「추천 제외」 option 을 가진 select */
const levelSelect = () => [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "unlist"))!;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  invalidateMoimAdminReportReasons();
});

describe("D-14 신고 처리 폼 — 종료일은 추천 제외만", () => {
  const ctx: MoimReportDecisionContext = {
    reportId: "33333333-3333-4333-8333-333333333333",
    status: "reviewing",
    targetType: "moim",
    handledAt: null,
    handler: null,
    host: null,
    warnCount: 0,
    openSameTargetCount: 0,
    resultActions: [],
  };

  it("추천 제외 = 날짜 칸 · 경고·차단 = 날짜 칸 없음 + 「어드민이 해제할 때까지」 · 단계를 바꾸면 날짜를 지운다", () => {
    act(() => root.render(createElement(MoimReportDecisionPanel, { ctx, onChanged: () => {}, banner: null, setBanner: () => {} })));
    expect(dateInput()).toBeNull();
    act(() => setSelect(levelSelect(), "unlist"));
    expect(dateInput()).not.toBeNull();
    expect(hasNote()).toBe(false);
    act(() => setInput(dateInput()!, "2099-01-01"));
    expect(dateInput()!.value).toBe("2099-01-01");
    for (const level of ["warn", "block"]) {
      act(() => setSelect(levelSelect(), level));
      expect(dateInput()).toBeNull();
      expect(hasNote()).toBe(true);
    }
    act(() => setSelect(levelSelect(), "unlist"));
    expect(dateInput()!.value).toBe("");
  });
});

describe("D-14·§3 직접 제재 시트", () => {
  it("날짜 칸은 추천 제외만 · 사유 목록 = 정책의 켜진 사유(정책 이름)", async () => {
    __setMoimAdminReportReasonsForTests([
      { code: "commercial", labelKo: "광고 정책 이름", labelEn: "Ads policy name", isActive: true },
      { code: "other", labelKo: "기타", labelEn: "Other", isActive: false },
      { code: "new_reason", labelKo: "새 사유", labelEn: "New reason", isActive: true },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, rows: [], total: 0 }), { status: 200, headers: { "content-type": "application/json" } }))
    );
    await act(async () => {
      root.render(createElement(MoimSanctionApplySheet, { moimId: "11111111-1111-4111-8111-111111111111", name: "M", onClose: () => {}, onSettled: () => {} }));
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const reasonSelect = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "commercial"))!;
    const codes = [...reasonSelect.options].map((o) => o.value).filter(Boolean);
    expect(codes).toEqual(["commercial", "new_reason"]);
    const labels = [...reasonSelect.options].map((o) => o.textContent);
    expect(labels.some((l) => l === "광고 정책 이름" || l === "Ads policy name")).toBe(true);

    expect(dateInput()).not.toBeNull();
    act(() => setInput(dateInput()!, "2099-01-01"));
    act(() => setSelect(levelSelect(), "warn"));
    expect(dateInput()).toBeNull();
    expect(hasNote()).toBe(true);
    act(() => setSelect(levelSelect(), "unlist"));
    expect(dateInput()!.value).toBe("");
  });
});
