/** @vitest-environment jsdom */
/**
 * 어드민 SSOT §3-1 (Owner 2026-11-07 · AD-123 대체) — 거래 상위노출 종료 = L3: 공개 사유 + 내부 메모 + 귀책 + 환급 미리보기.
 * 대상 재입력 칸이 없고(사유만 입력하면 실행 가능), 내부 메모는 `internalReason` 으로만 간다(D-10).
 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 쓰는 코드를 실행한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
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

vi.mock("@/components/admin/ads/AdminAdDeleteAction", () => ({
  AdminAdDeleteAction: () => null,
}));

import { TradePromotionEndSheet } from "@/components/admin/trade/promotions/TradePromotionsPage";
import { translate } from "@/lib/i18n/messages";

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

describe("거래 상위노출 종료 — 대상 재입력 없음 · 내부 메모 분리", () => {
  it("귀책·사유만으로 2단계 실행 버튼이 켜지고, 재입력 칸이 없다 · 내부 메모는 internalReason 으로 전송", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<TradePromotionEndSheet row={row} onClose={() => {}} onSettled={() => {}} />));
    const operator = document.querySelector('input[type="radio"]') as HTMLInputElement;
    await act(async () => operator.click());
    await flush();
    // 문구는 카탈로그 키 (t 모의 = 키 그대로) — 한국어 값은 그대로 유지
    expect(translate("ko", "admin_trade_promo_end_reason_ph")).toBe("종료 사유 (회원에게 전달됩니다)");
    expect(translate("ko", "admin_trade_post_ads_end")).toBe("종료");
    const reason = document.querySelector('textarea[placeholder="admin_trade_promo_end_reason_ph"]') as HTMLTextAreaElement;
    const memo = document.querySelector("[data-admin-ads-internal-memo] textarea") as HTMLTextAreaElement;
    expect(memo).toBeTruthy();
    await act(async () => setValue(reason, "운영 사유로 종료"));
    await act(async () => setValue(memo, "내부 확인 메모"));
    const next = btn("admin_chat_sheet_next");
    expect(next.disabled).toBe(false);
    await act(async () => next.click());

    expect(document.body.textContent).not.toContain("admin_chat_sheet_retype_label");
    expect(document.querySelector("[data-admin-chat-sheet-step='2'] input")).toBeNull();
    const run = btn("admin_trade_post_ads_end");
    expect(run.disabled).toBe(false);
    await act(async () => run.click());
    await flush();
    const last = fetchMock.mock.calls.at(-1)!;
    const sent = JSON.parse(String((last[1] as { body: string }).body)) as Record<string, unknown>;
    expect(sent).toMatchObject({ action: "end", fault: "operator", reason: "운영 사유로 종료", internalReason: "내부 확인 메모" });
  });
});
