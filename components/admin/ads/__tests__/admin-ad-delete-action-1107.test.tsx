// @vitest-environment jsdom
/**
 * AdminAdDeleteAction 렌더 시험 (R2 · SSOT §3-1·§3-2·§4 · 2026-11-07)
 * 사유 입력 → 서버 미리보기 → (결제 있는 진행 중이면 귀책 + 환급) → 삭제. 대상 재입력 칸 0 · 권한 없으면 꺼짐 + 이유.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    t: (k: string, v?: Record<string, string | number>) => (v ? `${k}:${JSON.stringify(v)}` : k),
    language: "ko",
  }),
}));
const accessActor = { value: { role: "admin", permissions: ["ads"] } as { role: string; permissions: string[] } | null };
vi.mock("@/components/admin/access/use-admin-route-access", () => ({
  useAdminAccessActor: () => ({ actor: accessActor.value, loading: false }),
}));
vi.mock("@/components/ui/dibay-overlay", () => ({
  DibayDialog: ({ open, title, description, children }: { open: boolean; title: string; description?: string; children: ReactNode }) =>
    open ? (
      <div role="dialog">
        <h2>{title}</h2>
        <p data-desc="1">{description}</p>
        {children}
      </div>
    ) : null,
  DibayOverlayButton: ({ children, onClick, disabled, ...rest }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled} {...(rest as Record<string, unknown>)}>
      {children}
    </button>
  ),
}));

import { AdminAdDeleteAction } from "@/components/admin/ads/AdminAdDeleteAction";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
const fetchMock = vi.fn();

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  accessActor.value = { role: "admin", permissions: ["ads"] };
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};
function typeReason(text: string) {
  const ta = q("[data-admin-ad-delete-reason]") as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setter.call(ta, text);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const ok = (plan: Record<string, unknown>) => ({ ok: true, status: 200, json: async () => ({ ok: true, plan }) });

describe("AdminAdDeleteAction", () => {
  it("권한 없으면 버튼이 꺼지고 이유를 보인다 (배달 배너 = business)", () => {
    act(() => root.render(<AdminAdDeleteAction kind="delivery_banner" id="b-1" title="배너" />));
    const btn = q("[data-admin-ad-delete-open]") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(q("[data-admin-ad-delete-denied]")?.textContent).toBe("「매장 (배달관련)」 권한이 필요합니다.");
  });

  it("사유 → 미리보기 → 삭제 표시 · 재입력 칸 없음 · 결과 콜백", async () => {
    const onDone = vi.fn();
    act(() => root.render(<AdminAdDeleteAction kind="ptr" id="p-1" title="PTR 띠" onDone={onDone} />));
    act(() => q("[data-admin-ad-delete-open]")!.click());
    expect(document.querySelectorAll("input[type=text]").length).toBe(0);
    expect((q("[data-admin-ad-delete-next]") as HTMLButtonElement).disabled).toBe(true);
    typeReason("기간 만료 정리");
    expect((q("[data-admin-ad-delete-next]") as HTMLButtonElement).disabled).toBe(false);
    fetchMock.mockResolvedValueOnce(ok({ mode: "soft", refundAmount: 0, paidAmount: 0, refundUnit: "none", needsFault: false }));
    act(() => q("[data-admin-ad-delete-next]")!.click());
    await flush();
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ kind: "ptr", id: "p-1", reason: "기간 만료 정리", preview: true });
    expect(q("[data-admin-ad-delete-plan]")?.getAttribute("data-admin-ad-delete-plan")).toBe("soft");
    expect(q("[data-admin-ad-delete-fault]")).toBeNull();
    expect(document.querySelectorAll("input[type=text]").length).toBe(0);
    fetchMock.mockResolvedValueOnce(ok({ mode: "soft", refundAmount: 0, paidAmount: 0, refundUnit: "none", needsFault: false }));
    act(() => q("[data-admin-ad-delete-submit]")!.click());
    await flush();
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ kind: "ptr", id: "p-1", reason: "기간 만료 정리" });
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ kind: "ptr", id: "p-1" }));
    expect(q("[role=dialog]")).toBeNull();
  });

  it("결제 있는 진행 중: 귀책을 고르기 전에는 삭제 불가 · 고르면 환급 미리보기 · 귀책과 함께 삭제", async () => {
    act(() => root.render(<AdminAdDeleteAction kind="trade_promotion" id="o-1" title="거래 글" />));
    act(() => q("[data-admin-ad-delete-open]")!.click());
    typeReason("운영 정리");
    fetchMock.mockResolvedValueOnce(ok({ mode: "end_and_soft", refundAmount: 0, paidAmount: 500, refundUnit: "point", needsFault: true }));
    act(() => q("[data-admin-ad-delete-next]")!.click());
    await flush();
    expect((q("[data-admin-ad-delete-submit]") as HTMLButtonElement).disabled).toBe(true);
    expect(q("[data-admin-ad-delete-refund]")?.textContent).toBe("admin_ad_delete_fault_pick");
    fetchMock.mockResolvedValueOnce(ok({ mode: "end_and_soft", refundAmount: 428, paidAmount: 500, refundUnit: "point", needsFault: true }));
    act(() => (q('[data-admin-ad-delete-fault-option="operator"]') as HTMLInputElement).click());
    await flush();
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toMatchObject({ fault: "operator", preview: true });
    expect(q("[data-admin-ad-delete-refund]")?.textContent).toContain("admin_ad_delete_refund_preview");
    expect(q("[data-admin-ad-delete-submit]")?.textContent).toBe("admin_ad_delete_confirm_end");
    fetchMock.mockResolvedValueOnce(ok({ mode: "end_and_soft", refundAmount: 428, paidAmount: 500, refundUnit: "point", needsFault: true }));
    act(() => q("[data-admin-ad-delete-submit]")!.click());
    await flush();
    expect(JSON.parse(fetchMock.mock.calls[2]![1].body)).toEqual({ kind: "trade_promotion", id: "o-1", reason: "운영 정리", fault: "operator" });
  });

  it("서버 오류는 한국어 문구 키로 보이고 원문은 보이지 않는다", async () => {
    act(() => root.render(<AdminAdDeleteAction kind="feed_request" id="r-1" title="피드" />));
    act(() => q("[data-admin-ad-delete-open]")!.click());
    typeReason("정리합니다");
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ ok: false, error: "payment_held" }) });
    act(() => q("[data-admin-ad-delete-next]")!.click());
    await flush();
    expect(q("[data-admin-ad-delete-error]")?.textContent).toBe("admin_ad_delete_err_payment_held");
  });
});
