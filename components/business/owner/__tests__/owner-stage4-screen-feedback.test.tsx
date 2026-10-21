// @vitest-environment jsdom
/**
 * 4단계 4-4 — 화면 피드백 RTL: IA-14 알림 설정 · IA-15 리뷰 · IA-16 문의 · IA-17 토글 · IA-23 스테퍼.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/stores/owner/x",
  useSearchParams: () => new URLSearchParams("storeId=store-1"),
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    t: (k: string, vars?: Record<string, string | number>) =>
      vars ? `${k}:${Object.values(vars).join("|")}` : k,
    language: "ko",
  }),
}));
vi.mock("@/lib/me/fetch-me-stores-deduped", () => ({
  fetchMeStoresListDeduped: async () => ({
    status: 200,
    json: { ok: true, stores: [{ id: "store-1", store_name: "S1", approval_status: "approved" }] },
  }),
  invalidateMeStoresListDedupedCache: vi.fn(),
}));
vi.mock("@/lib/stores/store-public-cache-invalidate", () => ({ invalidateStorePublicCachesForSlug: vi.fn() }));
vi.mock("@/lib/stores/use-owner-lite-store", () => ({ refreshOwnerLiteStore: vi.fn() }));
vi.mock("@/components/business/owner/OwnerStoreCommerceStateLabel", () => ({ OwnerStoreCommerceStateLabel: () => null }));
vi.mock("@/components/business/admin/StoreOpsOnOffSwitch", () => ({
  StoreOpsOnOffSwitch: (p: { checked: boolean; disabled?: boolean; onCheckedChange: (n: boolean) => unknown }) => (
    <button
      type="button"
      role="switch"
      data-testid="ops-switch"
      aria-checked={p.checked}
      disabled={p.disabled}
      onClick={() => void p.onCheckedChange(!p.checked)}
    />
  ),
}));
vi.mock("@/components/business/owner/OwnerStoreAdminConfirmModal", () => ({
  OwnerStoreAdminConfirmModal: (p: {
    open: boolean;
    busy: boolean;
    title: string;
    confirmTone?: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    p.open ? (
      <div data-testid="confirm" data-title={p.title} data-tone={p.confirmTone} data-busy={p.busy ? "1" : "0"}>
        <button type="button" data-testid="confirm-ok" disabled={p.busy} onClick={() => void p.onConfirm()} />
        <button type="button" data-testid="confirm-cancel" onClick={() => p.onCancel()} />
      </div>
    ) : null,
}));
vi.mock("@/components/ui/dibay-overlay", () => ({
  DibayConfirmDialog: (p: { open: boolean; description?: ReactNode; onConfirm: () => void; busy?: boolean }) =>
    p.open ? (
      <div data-testid="step-dialog">
        <div>{p.description}</div>
        <button type="button" data-testid="step-ok" disabled={p.busy} onClick={() => p.onConfirm()} />
      </div>
    ) : null,
}));
vi.mock("@/components/business/owner/OwnerOrderAcceptSheet", () => ({ OwnerOrderAcceptSheet: () => null }));
vi.mock("@/components/business/owner/OwnerOrderCardProgressSteps", () => ({
  OwnerOrderCardProgressSteps: (p: { onStepClick: (i: number) => void }) => (
    <button type="button" data-testid="step" onClick={() => p.onStepClick(2)} />
  ),
}));
vi.mock("@/components/business/owner/OwnerAdminPageScrollShell", () => ({
  OwnerAdminPageScrollShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/business/owner/OwnerStoreSuspenseFallback", () => ({
  OwnerStoreSuspenseFallback: () => <p>loading</p>,
}));
vi.mock("@/components/business/owner/OwnerStoreSettingsContent", () => ({
  OwnerStoreSettingsContent: (p: {
    row: { messenger_voice_calls_enabled?: boolean };
    messengerBusyKey?: string | null;
    onToggleMessengerFeature: (k: "messenger_voice_calls_enabled", n: boolean) => void;
  }) => {
    const enabled = p.row.messenger_voice_calls_enabled !== false;
    return (
      <button
        type="button"
        role="switch"
        data-testid="msgr-voice-calls"
        aria-checked={enabled}
        disabled={p.messengerBusyKey != null}
        onClick={() => p.onToggleMessengerFeature("messenger_voice_calls_enabled", !enabled)}
      />
    );
  },
}));
vi.mock("@/lib/business/owner-order-stepper-transition", () => ({
  resolveOwnerStepperClickAction: () => ({ kind: "confirm", nextStatus: "preparing", message: "go?" }),
}));

import { OwnerToastHost, resetOwnerToastsForTest } from "@/components/business/owner/OwnerToastHost";
import { OwnerStoreReviewsView } from "@/components/business/owner/OwnerStoreReviewsView";
import { OwnerStoreInquiriesView } from "@/components/business/owner/OwnerStoreInquiriesView";
import { BusinessAdminOpenToggle } from "@/components/business/admin/BusinessAdminOpenToggle";
import { BusinessAdminVisibleToggle } from "@/components/business/admin/BusinessAdminVisibleToggle";
import { OwnerStoreOrderCardStepperWithActions } from "@/components/business/owner/OwnerStoreOrderCardStepperWithActions";
import { OwnerNotificationSettings } from "@/components/stores/owner/OwnerNotificationSettings";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import MyBusinessSettingsPage from "@/app/(main)/stores/owner/settings/page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const fetchMock = vi.fn();

function json(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

async function mount(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <>
        {node}
        <OwnerToastHost />
      </>
    )
  );
  await flush();
}

function q(sel: string): HTMLElement | null {
  return host!.querySelector(sel);
}

async function click(el: Element | null) {
  expect(el).not.toBeNull();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await flush();
}

function patchCalls() {
  return fetchMock.mock.calls.filter(([, i]) => (i as RequestInit | undefined)?.method === "PATCH");
}

beforeEach(() => {
  fetchMock.mockReset();
  resetOwnerToastsForTest();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

const REVIEW = {
  id: "r1",
  order_id: "0f6c2d7e-uuid",
  order_no: "ORD-1001",
  buyer_public_label: "buyer",
  rating: 4,
  content: "good",
  status: "active",
  visible_to_public: true,
  image_urls: [],
  created_at: "2026-10-01T00:00:00Z",
  owner_reply_content: "thanks",
  owner_reply_created_at: "2026-10-02T00:00:00Z",
};

describe("IA-15 OwnerStoreReviewsView", () => {
  it("shows order_no (not raw order_id/status); delete goes through danger confirm", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === "PATCH" ? json(200, { ok: true }) : json(200, { ok: true, reviews: [REVIEW] })
    );
    await mount(<OwnerStoreReviewsView />);
    expect(host!.textContent).toContain("ORD-1001");
    expect(host!.textContent).not.toContain("0f6c2d7e-uuid");
    const del = Array.from(host!.querySelectorAll("button")).find((b) => b.textContent === "business_phase7_reply_delete");
    await click(del!);
    expect(patchCalls()).toHaveLength(0);
    expect(q('[data-testid="confirm"]')?.getAttribute("data-tone")).toBe("danger");
    await click(q('[data-testid="confirm-ok"]'));
    expect(patchCalls()).toHaveLength(1);
    expect(JSON.parse(String((patchCalls()[0][1] as RequestInit).body))).toEqual({ reply: "" });
    expect(q('[data-owner-toast="success"]')?.textContent).toContain("owner_s4_review_deleted");
  });

  it("reply save failure keeps the list, shows inline error + toast", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === "PATCH" ? json(500, { ok: false, error: "reply_failed" }) : json(200, { ok: true, reviews: [REVIEW] })
    );
    await mount(<OwnerStoreReviewsView />);
    const save = Array.from(host!.querySelectorAll("button")).find((b) => b.textContent === "business_phase7_471");
    await click(save!);
    expect(host!.textContent).toContain("good");
    expect(q('[data-owner-review-row-error="1"]')?.textContent).toBe("business_phase7_368");
    expect(q('[data-owner-toast="error"]')?.textContent).toContain("business_phase7_368");
  });
});

describe("IA-16 OwnerStoreInquiriesView", () => {
  const INQ = {
    id: "i1",
    from_user_id: "u1",
    subject: "subj",
    content: "body",
    status: "open",
    answer: null,
    answered_at: null,
    created_at: "2026-10-01T00:00:00Z",
  };

  it("answer failure → toast, list stays; close failure → toast and no silent success", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? Promise.resolve(new Response("<html>", { status: 502 }))
        : json(200, { ok: true, inquiries: [INQ] })
    );
    await mount(<OwnerStoreInquiriesView />);
    const ta = q("textarea") as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(ta, "answer text");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const send = Array.from(host!.querySelectorAll("button")).find((b) => b.textContent === "business_phase7_467");
    await click(send!);
    expect(q('[data-owner-toast="error"]')).not.toBeNull();
    expect(host!.textContent).toContain("subj");

    resetOwnerToastsForTest();
    const close = Array.from(host!.querySelectorAll("button")).find((b) => b.textContent === "business_phase7_257");
    await click(close!);
    await click(q('[data-testid="confirm-ok"]'));
    expect(q('[data-owner-toast="error"]')).not.toBeNull();
    expect(q('[data-owner-toast="success"]')).toBeNull();
  });

  it("successful answer reloads in background without loading flash", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === "PATCH" ? json(200, { ok: true }) : json(200, { ok: true, inquiries: [INQ] })
    );
    await mount(<OwnerStoreInquiriesView />);
    const ta = q("textarea") as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(ta, "hello");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    let release: (r: Response) => void = () => {};
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === "PATCH" ? json(200, { ok: true }) : new Promise<Response>((r) => (release = r))
    );
    const send = Array.from(host!.querySelectorAll("button")).find((b) => b.textContent === "business_phase7_467");
    await click(send!);
    // 재조회 진행 중에도 목록 유지 (loading 화면 없음)
    expect(host!.textContent).toContain("subj");
    expect(host!.textContent).not.toContain("common_loading");
    expect(q('[data-owner-toast="success"]')?.textContent).toContain("owner_s4_inquiry_answer_sent");
    await act(async () => release(new Response(JSON.stringify({ ok: true, inquiries: [INQ] }), { status: 200 })));
    await flush();
  });
});

const ROW = {
  id: "store-1",
  slug: "s1",
  approval_status: "approved",
  is_open: true,
  is_visible: true,
} as unknown as StoreRow;

describe("IA-17 open / visible toggles (D-14 confirm on OFF)", () => {
  it("open OFF asks confirm first; failure reverts and toasts", async () => {
    fetchMock.mockImplementation(() => json(500, { ok: false, error: "update_failed" }));
    const onUpdated = vi.fn();
    await mount(<BusinessAdminOpenToggle row={ROW} onUpdated={onUpdated} />);
    await click(q('[data-testid="ops-switch"]'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(q('[data-testid="confirm"]')?.getAttribute("data-title")).toBe("owner_s4_open_off_title");
    await click(q('[data-testid="confirm-ok"]'));
    expect(patchCalls()).toHaveLength(1);
    expect(q('[data-testid="ops-switch"]')?.getAttribute("aria-checked")).toBe("true");
    expect(q('[data-owner-toast="error"]')?.textContent).toContain("되돌렸습니다");
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("visible OFF asks confirm; cancel sends nothing", async () => {
    await mount(<BusinessAdminVisibleToggle row={ROW} onUpdated={() => {}} />);
    await click(q('[data-testid="ops-switch"]'));
    expect(q('[data-testid="confirm"]')?.getAttribute("data-title")).toBe("owner_s4_visible_off_title");
    await click(q('[data-testid="confirm-cancel"]'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(q('[data-testid="confirm"]')).toBeNull();
  });

  it("turning ON needs no confirm", async () => {
    fetchMock.mockImplementation(() => json(200, { ok: true }));
    const onUpdated = vi.fn();
    await mount(<BusinessAdminOpenToggle row={{ ...ROW, is_open: false } as StoreRow} onUpdated={onUpdated} />);
    await click(q('[data-testid="ops-switch"]'));
    expect(q('[data-testid="confirm"]')).toBeNull();
    expect(patchCalls()).toHaveLength(1);
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });
});

describe("IA-23 stepper without onPatchOrderRow", () => {
  it("409 transition_conflict → message in dialog error band + list refetch; dialog stays open", async () => {
    fetchMock.mockImplementation(() => json(409, { ok: false, error: "transition_conflict" }));
    const onUpdated = vi.fn();
    await mount(
      <OwnerStoreOrderCardStepperWithActions
        storeId="store-1"
        orderId="o1"
        orderStatus="accepted"
        fulfillmentType="pickup"
        onUpdated={onUpdated}
      />
    );
    await click(q('[data-testid="step"]'));
    await click(q('[data-testid="step-ok"]'));
    expect(onUpdated).toHaveBeenCalledTimes(1);
    const band = q('[data-owner-step-confirm-error="1"]');
    expect(band?.getAttribute("role")).toBe("alert");
    expect(band?.textContent?.length).toBeGreaterThan(0);
    expect(band?.textContent).not.toBe("transition_conflict");
    expect(q('[data-testid="step-dialog"]')).not.toBeNull();
  });

  it("mapped code (order_admin_locked) shows the same mapping as runOwnerStoreOrderPatch", async () => {
    fetchMock.mockImplementation(() => json(409, { ok: false, error: "order_admin_locked" }));
    const { formatOwnerOrderPatchErr } = await import("@/lib/business/owner-order-patch-errors");
    await mount(
      <OwnerStoreOrderCardStepperWithActions
        storeId="store-1"
        orderId="o1"
        orderStatus="accepted"
        fulfillmentType="pickup"
        onUpdated={() => {}}
      />
    );
    await click(q('[data-testid="step"]'));
    await click(q('[data-testid="step-ok"]'));
    expect(q('[data-owner-step-confirm-error="1"]')?.textContent).toBe(formatOwnerOrderPatchErr("order_admin_locked", "ko"));
  });
});

describe("IA-14 OwnerNotificationSettings", () => {
  const SETTINGS = { ok: true, settings: { optional_push_enabled: true, optional_sound_enabled: true } };

  it("account-wide title, no store UUID, no vibration wording", async () => {
    fetchMock.mockImplementation(() => json(200, SETTINGS));
    await mount(<OwnerNotificationSettings storeId="11111111-2222-3333-4444-555555555555" />);
    expect(host!.textContent).toContain("owner_s4_notif_title");
    expect(host!.textContent).not.toContain("11111111-2222-3333-4444-555555555555");
    expect(host!.textContent).not.toContain("진동");
    expect(host!.textContent).not.toContain("vibration");
  });

  it("toggle failure reverts + toast; busy blocks double click", async () => {
    fetchMock.mockImplementation(() => json(200, SETTINGS));
    await mount(<OwnerNotificationSettings storeId="s" />);
    let release: (r: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Response>((r) => (release = r)));
    const sw = host!.querySelectorAll('[role="switch"]')[0] as HTMLButtonElement;
    await act(async () => {
      sw.click();
      sw.click();
    });
    await flush();
    expect(patchCalls()).toHaveLength(1);
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(sw.disabled).toBe(true);
    await act(async () => release(new Response(JSON.stringify({ ok: false, error: "db" }), { status: 500 })));
    await flush();
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(q('[data-owner-toast="error"]')?.textContent).toContain("owner_s4_setting_failed_reverted");
  });
});

describe("IA-17 settings page messenger toggles", () => {
  it("busy blocks double click; failure reverts without full reload + toast", async () => {
    await mount(<MyBusinessSettingsPage />);
    const btn = q('[data-testid="msgr-voice-calls"]') as HTMLButtonElement;
    expect(btn.getAttribute("aria-checked")).toBe("true");
    let release: (r: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Response>((r) => (release = r)));
    await act(async () => {
      btn.click();
      btn.click();
    });
    await flush();
    expect(patchCalls()).toHaveLength(1);
    const pending = q('[data-testid="msgr-voice-calls"]') as HTMLButtonElement;
    expect(pending.getAttribute("aria-checked")).toBe("false");
    expect(pending.disabled).toBe(true);
    await act(async () => release(new Response(JSON.stringify({ ok: false, error: "update_failed" }), { status: 500 })));
    await flush();
    const after = q('[data-testid="msgr-voice-calls"]') as HTMLButtonElement;
    expect(after.getAttribute("aria-checked")).toBe("true");
    expect(after.disabled).toBe(false);
    expect(q('[data-owner-toast="error"]')?.textContent).toContain("되돌렸습니다");
  });
});
