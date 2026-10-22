// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { CheckoutEligibleGift } from "@/lib/gift-certificate/checkout-eligible-gifts";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    safeT: (_key: string, opts?: { fallbackKo?: string; fallbackEn?: string }) =>
      opts?.fallbackKo ?? opts?.fallbackEn ?? _key,
  }),
}));

vi.mock("@/components/gift-certificate/GiftVisualCard", () => ({
  GiftVisualCard: ({ title }: { title: string }) => <div data-mock-gift-card="1">{title}</div>,
}));

/** Overlay contract stand-in: renders only while open, exposes confirm/cancel. */
vi.mock("@/components/ui/dibay-overlay", () => ({
  DibayConfirmDialog: ({
    open,
    title,
    description,
    onCancel,
    onConfirm,
  }: {
    open: boolean;
    title: ReactNode;
    description?: ReactNode;
    onCancel: () => void;
    onConfirm: () => void;
  }) =>
    open ? (
      <div data-mock-confirm-dialog="1">
        <h2>{title}</h2>
        <div>{description}</div>
        <button type="button" data-mock-cancel="1" onClick={onCancel}>
          cancel
        </button>
        <button type="button" data-mock-confirm="1" onClick={onConfirm}>
          confirm
        </button>
      </div>
    ) : null,
}));

import { StoreCartGiftApplyPanel } from "@/components/stores/cart/StoreCartGiftApplyPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function gift(id: string, remaining: number): CheckoutEligibleGift {
  return {
    instanceId: id,
    publicGiftNumber: `GFT-${id}`,
    giftScope: "STORE",
    storeId: "s1",
    storeName: "Store",
    title: `Gift ${id}`,
    imageUrl: null,
    faceValue: remaining,
    remainingBalance: remaining,
    status: "ACTIVE",
  };
}

describe("GFT-04 cart gift forfeit notice + consent", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(props: { gifts: CheckoutEligibleGift[]; applied: string | null; amount: number; onChoose: (g: CheckoutEligibleGift, forfeitConsentedPhp: number) => void }) {
    act(() => {
      root.render(
        <StoreCartGiftApplyPanel
          gifts={props.gifts}
          appliedInstanceId={props.applied}
          amountBeforeGift={props.amount}
          onChooseNone={() => {}}
          onChoose={props.onChoose}
        />
      );
    });
  }

  function click(sel: string) {
    const el = container.querySelector(sel) as HTMLElement | null;
    expect(el, sel).not.toBeNull();
    act(() => el!.click());
  }

  it("forfeit > 0: picker shows forfeited amount, choosing opens confirm; confirm applies", () => {
    const onChoose = vi.fn();
    render({ gifts: [gift("g1", 1000)], applied: null, amount: 300, onChoose });
    click('[data-cart-gift-pick="1"]');
    const forfeitLine = container.querySelector('[data-cart-gift-option-forfeit="g1"]');
    expect(forfeitLine?.textContent).toContain("700");
    click('[data-cart-gift-option="g1"]');
    expect(onChoose).not.toHaveBeenCalled();
    const dialog = container.querySelector('[data-mock-confirm-dialog="1"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("300");
    expect(dialog?.textContent).toContain("700");
    click('[data-mock-confirm="1"]');
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose.mock.calls[0]?.[0]?.instanceId).toBe("g1");
    /** CG-01 — 동의한 소멸액을 장바구니에 넘겨 이후 소멸액 증가 시 재동의 판단 */
    expect(onChoose.mock.calls[0]?.[1]).toBe(700);
    expect(container.querySelector('[data-mock-confirm-dialog="1"]')).toBeNull();
  });

  it("forfeit > 0: cancel keeps gift unapplied", () => {
    const onChoose = vi.fn();
    render({ gifts: [gift("g1", 1000)], applied: null, amount: 300, onChoose });
    click('[data-cart-gift-pick="1"]');
    click('[data-cart-gift-option="g1"]');
    click('[data-mock-cancel="1"]');
    expect(onChoose).not.toHaveBeenCalled();
    expect(container.querySelector('[data-mock-confirm-dialog="1"]')).toBeNull();
  });

  it("forfeit = 0: applies immediately without confirm", () => {
    const onChoose = vi.fn();
    render({ gifts: [gift("g2", 200)], applied: null, amount: 300, onChoose });
    click('[data-cart-gift-pick="1"]');
    expect(container.querySelector('[data-cart-gift-option-forfeit="g2"]')).toBeNull();
    click('[data-cart-gift-option="g2"]');
    expect(container.querySelector('[data-mock-confirm-dialog="1"]')).toBeNull();
    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it("applied gift shows forfeited amount only when > 0", () => {
    render({ gifts: [gift("g1", 1000)], applied: "g1", amount: 300, onChoose: () => {} });
    expect(container.querySelector('[data-cart-gift-forfeit="1"]')?.textContent).toContain("700");
    render({ gifts: [gift("g1", 1000)], applied: "g1", amount: 1500, onChoose: () => {} });
    expect(container.querySelector('[data-cart-gift-forfeit="1"]')).toBeNull();
  });
});
