// @vitest-environment jsdom
/**
 * 4-0 (RC-11) — 공통 primitive: OwnerToastHost/useOwnerToast · OwnerStateView ·
 * OwnerStoreAdminConfirmModal(busy) · useOwnerFormIdempotencyKey.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, language: "ko" }),
}));
vi.mock("@/components/ui/dibay-overlay", () => ({
  DibayDialog: (p: {
    open: boolean;
    title: ReactNode;
    actions: Array<{ key: string; label: ReactNode; onClick: () => void; disabled?: boolean }>;
  }) =>
    p.open ? (
      <div data-testid="dialog">
        <p>{p.title}</p>
        {p.actions.map((a) => (
          <button key={a.key} type="button" data-action={a.key} disabled={a.disabled} onClick={a.onClick}>
            {a.label}
          </button>
        ))}
      </div>
    ) : null,
}));

import {
  OWNER_TOAST_DURATION_MS,
  OwnerToastHost,
  resetOwnerToastsForTest,
  useOwnerToast,
} from "@/components/business/owner/OwnerToastHost";
import { OwnerStateView } from "@/components/business/owner/OwnerStateView";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { useOwnerFormIdempotencyKey } from "@/lib/business/owner-form-idempotency-key";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function render(node: ReactNode) {
  if (!host) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }
  await act(async () => root!.render(node));
}

function q(sel: string): HTMLElement | null {
  return host!.querySelector(sel);
}

beforeEach(() => {
  resetOwnerToastsForTest();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

function Screen() {
  const toast = useOwnerToast();
  return (
    <>
      <button type="button" data-testid="ok" onClick={() => toast.success("saved")} />
      <button type="button" data-testid="err" onClick={() => toast.error("failed")} />
      <button type="button" data-testid="blank" onClick={() => toast.error("   ")} />
    </>
  );
}

async function press(id: string) {
  await act(async () => (q(`[data-testid="${id}"]`) as HTMLButtonElement).click());
}

describe("OwnerToastHost / useOwnerToast", () => {
  it("renders success / error toasts pushed from any screen, auto dismisses", async () => {
    vi.useFakeTimers();
    await render(
      <>
        <Screen />
        <OwnerToastHost />
      </>
    );
    expect(q("[data-owner-toast-host]")).toBeNull();
    await press("ok");
    await press("err");
    expect(q('[data-owner-toast="success"]')?.textContent).toContain("saved");
    const err = q('[data-owner-toast="error"]');
    expect(err?.getAttribute("role")).toBe("alert");
    expect(err?.textContent).toContain("failed");
    await act(async () => {
      vi.advanceTimersByTime(OWNER_TOAST_DURATION_MS + 10);
    });
    expect(q("[data-owner-toast-host]")).toBeNull();
  });

  it("dismiss button removes the toast; empty messages are ignored", async () => {
    await render(
      <>
        <Screen />
        <OwnerToastHost />
      </>
    );
    await press("blank");
    expect(q("[data-owner-toast-host]")).toBeNull();
    await press("err");
    await act(async () => (q('[aria-label="owner_s4_toast_dismiss"]') as HTMLButtonElement).click());
    expect(q('[data-owner-toast="error"]')).toBeNull();
  });
});

describe("OwnerStateView", () => {
  it("loading → skeleton status", async () => {
    await render(<OwnerStateView kind="loading" />);
    expect(q('[data-owner-state-view="loading"]')?.getAttribute("aria-busy")).toBe("true");
  });

  it("error → alert + retry callback", async () => {
    const onRetry = vi.fn();
    await render(<OwnerStateView kind="error" message="msg" onRetry={onRetry} />);
    const box = q('[data-owner-state-view="error"]');
    expect(box?.getAttribute("role")).toBe("alert");
    expect(box?.textContent).toContain("msg");
    await act(async () => (box!.querySelector("button") as HTMLButtonElement).click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("empty → single CTA link; gate kinds show reason + allowed link", async () => {
    await render(<OwnerStateView kind="empty" action={{ label: "add", href: "/stores/owner/products/new" }} />);
    expect(host!.querySelectorAll('[data-owner-state-view="empty"] a')).toHaveLength(1);
    await render(
      <OwnerStateView kind="suspended" reason="policy" action={{ label: "ops", href: "/stores/owner/ops-status" }} />
    );
    const box = q('[data-owner-state-view="suspended"]');
    expect(box?.textContent).toContain("owner_s4_state_suspended_title");
    expect(box?.textContent).toContain("owner_s4_state_reason");
    expect(box?.querySelector("a")?.getAttribute("href")).toBe("/stores/owner/ops-status");
  });
});

describe("OwnerStoreAdminConfirmModal busy (required)", () => {
  it("busy disables both actions and shows busy label", async () => {
    const onConfirm = vi.fn();
    await render(
      <OwnerStoreAdminConfirmModal
        open
        titleId="x"
        title="T"
        busy
        confirmBusyLabel="busy..."
        onCancel={() => {}}
        onConfirm={onConfirm}
      />
    );
    const confirm = q('[data-action="confirm"]') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(confirm.textContent).toBe("busy...");
    expect((q('[data-action="cancel"]') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("useOwnerFormIdempotencyKey", () => {
  it("stable across re-renders, rotates only on rotate()", async () => {
    function Form({ n }: { n: number }) {
      const { key, rotate } = useOwnerFormIdempotencyKey();
      return (
        <button type="button" data-testid="form-key" data-n={n} data-key={key} onClick={rotate} />
      );
    }
    const keyOf = () => q('[data-testid="form-key"]')!.getAttribute("data-key");
    await render(<Form n={1} />);
    const first = keyOf();
    expect(first).toMatch(/[0-9a-f-]{16,}/);
    await render(<Form n={2} />);
    expect(keyOf()).toBe(first);
    await press("form-key");
    expect(keyOf()).not.toBe(first);
  });
});
