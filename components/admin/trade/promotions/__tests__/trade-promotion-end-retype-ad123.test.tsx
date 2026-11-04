/** @vitest-environment jsdom */
/**
 * 광고 ② AD-123 (2026-11-04) — 거래 상위노출 종료 = forceCancel(L3): 사유 + 대상 재입력.
 * 재입력이 없거나 다르면 실행 버튼이 꺼지고, 같게 입력하면 켜진다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, language: "ko", safeT: (k: string) => k, tt: (x: string) => x }),
}));
vi.mock("@/components/admin/AdminFormSheet", () => ({
  AdminFormSheet: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => (
    <div data-test-sheet="">
      {children}
      <div data-test-footer="">{footer}</div>
    </div>
  ),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/admin/trade/promotions",
  useSearchParams: () => new URLSearchParams(),
}));

import { TradePromotionEndSheet } from "@/components/admin/trade/promotions/TradePromotionsPage";

let root: Root;
const fetchMock = vi.fn();

const row = {
  id: "ord-1",
  user_id: "u1",
  user_label: "회원A",
  target_id: "post-1",
  target_title: null,
  post: { title: "아이폰 15 팝니다" },
  placement: "top",
  duration_days: 3,
  point_cost: 300,
  order_status: "active",
  overdue: false,
  start_at: "2026-11-04T00:00:00Z",
  end_at: "2026-11-07T00:00:00Z",
  created_at: "2026-11-04T00:00:00Z",
  ended_at: null,
  ended_by_label: null,
  fault: null,
  refund_points: null,
  review_reason: null,
};

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
function setValue(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
const buttons = () => Array.from(document.querySelectorAll("[data-test-footer] button")) as HTMLButtonElement[];
const btn = (label: string) => buttons().find((b) => (b.textContent ?? "").includes(label))!;

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, refund_points: 100, paid_points: 300, remaining_seconds: 86_400 }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("AD-123 거래 상위노출 종료 — 대상 재입력(L3)", () => {
  it("재입력이 없거나 다르면 실행 버튼이 꺼지고, 글 제목을 그대로 입력하면 켜진다", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<TradePromotionEndSheet row={row} onClose={() => {}} onSettled={() => {}} />));
    // 책임 구분 → 미리보기
    const operator = document.querySelector('input[type="radio"]') as HTMLInputElement;
    await act(async () => operator.click());
    await flush();
    const reason = document.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => setValue(reason, "운영 사유로 종료"));
    const next = btn("admin_chat_sheet_next");
    expect(next.disabled).toBe(false);
    await act(async () => next.click());

    // 2단계 — 재입력 칸이 있고, 비어 있으면 실행 꺼짐
    expect(document.body.textContent).toContain("admin_chat_sheet_retype_label");
    const run = () => btn("종료");
    expect(run().disabled).toBe(true);
    const retype = document.querySelector("[data-admin-chat-sheet-step='2'] input") as HTMLInputElement;
    await act(async () => setValue(retype, "아이폰"));
    expect(run().disabled).toBe(true);
    await act(async () => setValue(retype, "아이폰 15 팝니다"));
    expect(run().disabled).toBe(false);
  });
});
