// @vitest-environment jsdom
/**
 * 3-C IA-05 · IA-06 — owner coupon screen: confirm + busy (no double reissue), error / success bands,
 * load failure band with refresh.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams("storeId=store-1"),
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, language: "ko" }),
}));
vi.mock("@/lib/me/fetch-me-stores-deduped", () => ({ fetchMeStoresListDeduped: async () => ({ json: {} }) }));
vi.mock("@/components/business/owner/OwnerStoreAdminDashSection", () => ({
  OwnerStoreAdminDashSection: ({ children }: { children: unknown }) => <section>{children as never}</section>,
}));
vi.mock("@/components/business/owner/OwnerStoreCouponCreatePanel", () => ({ OwnerStoreCouponCreatePanel: () => null }));
vi.mock("@/components/business/owner/OwnerStoreCouponDetailPanel", () => ({ OwnerStoreCouponDetailPanel: () => null }));
vi.mock("@/components/business/owner/OwnerStoreCouponListDashboard", () => ({
  OwnerStoreCouponListDashboard: (p: {
    rows: Array<{ id: string }>;
    onPause: (id: string) => void;
    onReissue: (id: string) => void;
  }) => (
    <div>
      {p.rows.map((r) => (
        <div key={r.id}>
          <button type="button" data-testid={`pause-${r.id}`} onClick={() => p.onPause(r.id)} />
          <button type="button" data-testid={`reissue-${r.id}`} onClick={() => p.onReissue(r.id)} />
        </div>
      ))}
    </div>
  ),
}));
vi.mock("@/components/business/owner/OwnerStoreAdminConfirmModal", () => ({
  OwnerStoreAdminConfirmModal: (p: { open: boolean; busy?: boolean; onConfirm: () => void }) =>
    p.open ? (
      <button type="button" data-testid="confirm-ok" data-busy={p.busy ? "1" : "0"} disabled={p.busy} onClick={() => void p.onConfirm()} />
    ) : null,
}));

import { OwnerStoreCouponsView } from "@/components/business/owner/OwnerStoreCouponsView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const fetchMock = vi.fn();

function json(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

const LIST_OK = { ok: true, campaigns: [{ id: "c1", lifecycle_state: "active", funding_mode: "STORE_FUNDED" }] };

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<OwnerStoreCouponsView />));
  await flush();
}

function q(sel: string): HTMLElement | null {
  return host!.querySelector(sel);
}

async function click(el: Element | null) {
  await act(async () => {
    (el as HTMLElement).click();
  });
  await flush();
}

beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

describe("OwnerStoreCouponsView feedback", () => {
  it("list load failure → error band + refresh button that reloads", async () => {
    fetchMock.mockImplementationOnce(() => json(500, { ok: false, error: "db_error" }));
    await mount();
    expect(q('[data-owner-coupon-feedback="load-error"]')?.textContent).toContain("store_coupon_owner_err_load");
    fetchMock.mockImplementationOnce(() => json(200, LIST_OK));
    await click(q('[data-owner-coupon-reload="1"]'));
    expect(q('[data-owner-coupon-feedback="load-error"]')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("non-JSON list response does not throw; shows the error band", async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response("<html>", { status: 502 })));
    await mount();
    expect(q('[data-owner-coupon-feedback="load-error"]')).not.toBeNull();
  });

  it("pause goes through confirm; 409 shows the mapped error band", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === "PATCH" ? json(409, { ok: false, error: "invalid_transition" }) : json(200, LIST_OK)
    );
    await mount();
    await click(q('[data-testid="pause-c1"]'));
    expect(fetchMock.mock.calls.filter(([, i]) => (i as RequestInit | undefined)?.method === "PATCH")).toHaveLength(0);
    await click(q('[data-testid="confirm-ok"]'));
    const band = q('[data-owner-coupon-feedback="error"]');
    expect(band?.getAttribute("role")).toBe("alert");
    expect(band?.textContent).toBe("store_coupon_owner_err_invalid_transition");
  });

  it("reissue: busy while in flight, second click ignored, same form key; success band", async () => {
    let release: (v: Response) => void = () => {};
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return new Promise<Response>((r) => (release = r));
      return json(200, LIST_OK);
    });
    await mount();
    await click(q('[data-testid="reissue-c1"]'));
    const btn = q('[data-testid="confirm-ok"]') as HTMLButtonElement;
    await act(async () => {
      btn.click();
      btn.click();
    });
    await flush();
    const patches = fetchMock.mock.calls.filter(([, i]) => (i as RequestInit | undefined)?.method === "PATCH");
    expect(patches).toHaveLength(1);
    const body = JSON.parse(String((patches[0][1] as RequestInit).body)) as { action: string; clientRequestId?: string };
    expect(body.action).toBe("reissue");
    expect(body.clientRequestId).toMatch(/^reissue-/);
    expect(q('[data-testid="confirm-ok"]')?.getAttribute("data-busy")).toBe("1");
    await act(async () => {
      release(new Response(JSON.stringify({ ok: true, campaign: { id: "new-1" } }), { status: 200 }));
    });
    await flush();
    expect(q('[data-owner-coupon-feedback="success"]')?.textContent).toBe("store_coupon_owner_done_reissue");
    expect(push).toHaveBeenCalled();
  });
});
