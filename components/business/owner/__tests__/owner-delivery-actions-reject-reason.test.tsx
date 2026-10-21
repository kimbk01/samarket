// @vitest-environment jsdom
/**
 * 결함 1·2 (문서 J): 오너 거절·취소는 선택 사유를 `/cancel-request` 로 보낸다 — PATCH `cancelled` 를 보내지 않는다.
 * (메신저 오너 액션바·채팅 판매자 패널·피크 취소 바 공용 훅 `usePatchOrder`)
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, language: "ko" }),
}));

const postCancel = vi.fn();
vi.mock("@/lib/business/patch-owner-store-order-status", () => ({
  postOwnerStoreOrderCancelRequest: (...a: unknown[]) => postCancel(...a),
  patchOwnerStoreOrderStatus: vi.fn(),
}));

vi.mock("@/components/business/owner/OwnerOrderRejectSheet", () => ({
  OwnerOrderRejectSheet: (p: { open: boolean; onConfirm: (reason: string) => void }) =>
    p.open ? (
      <button type="button" data-testid="confirm-reason" onClick={() => p.onConfirm("재료 소진")}>
        confirm
      </button>
    ) : null,
}));

import { OwnerStoreOrderPeekCancelBar } from "@/components/business/owner/OwnerStoreOrderDeliveryActions";

let host: HTMLDivElement;
let root: Root;
const fetchSpy = vi.fn();

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  postCancel.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function order(status: string) {
  return { id: "o1", order_status: status, fulfillment_type: "local_delivery" } as never;
}

describe("owner reject/cancel reason reaches /cancel-request", () => {
  it.each(["pending", "accepted"])("%s: selected reason is posted; no PATCH cancelled", async (status) => {
    postCancel.mockResolvedValue({ ok: true, order_status: "cancelled", mode: "direct_cancel" });
    const onUpdated = vi.fn();
    await act(async () => {
      root.render(<OwnerStoreOrderPeekCancelBar storeId="s1" order={order(status)} onUpdated={onUpdated} />);
    });
    const cancelBtn = host.querySelector("button") as HTMLButtonElement;
    await act(async () => cancelBtn.click());
    const confirm = host.querySelector('[data-testid="confirm-reason"]') as HTMLButtonElement;
    expect(confirm).not.toBeNull();
    await act(async () => confirm.click());
    expect(postCancel).toHaveBeenCalledWith("s1", "o1", { reason: "재료 소진" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });

  it("server refusal keeps the sheet open and shows the mapped error", async () => {
    postCancel.mockResolvedValue({ ok: false, error: "transition_conflict" });
    const onUpdated = vi.fn();
    await act(async () => {
      root.render(<OwnerStoreOrderPeekCancelBar storeId="s1" order={order("pending")} onUpdated={onUpdated} />);
    });
    await act(async () => (host.querySelector("button") as HTMLButtonElement).click());
    await act(async () => (host.querySelector('[data-testid="confirm-reason"]') as HTMLButtonElement).click());
    expect(onUpdated).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="confirm-reason"]')).not.toBeNull();
    expect(host.textContent ?? "").not.toBe("");
  });
});
