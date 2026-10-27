/** @vitest-environment jsdom */
/**
 * F6 (docs/audit/notification-defect-fix-design-2026-10-28.md) — 알림 상세 삭제도 알림센터처럼
 * 확인창을 거치고, 실패하면 표시한다. (예전: 휴지통 한 번에 바로 삭제 · 실패해도 아무 표시 없음)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useParams: () => ({ notificationId: "11111111-1111-4111-8111-111111111111" }),
  useRouter: () => router,
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, language: "ko" }),
}));
vi.mock("@/components/my/MySubpageHeader", () => ({
  MySubpageHeader: ({ rightSlot }: { rightSlot?: React.ReactNode }) => <header>{rightSlot}</header>,
}));
vi.mock("@/components/notifications/NotificationDeleteConfirmDialog", () => ({
  NotificationDeleteConfirmDialog: (p: { open: boolean; message: string; onConfirm: () => void }) =>
    p.open ? (
      <div data-testid="confirm-dialog">
        {p.message}
        <button type="button" data-testid="confirm-delete" onClick={p.onConfirm} />
      </div>
    ) : null,
}));
vi.mock("@/lib/me/fetch-me-notification-by-id", () => ({
  fetchMeNotificationById: vi.fn(async () => ({
    status: 200,
    json: {
      ok: true,
      notification: {
        id: "11111111-1111-4111-8111-111111111111",
        title: "운영 공지",
        body: "점검 안내",
        created_at: "2026-10-27T00:00:00.000Z",
        is_read: true,
        link_url: null,
        notification_type: "system",
        event_type: "admin_notice",
        bell_presentation_type: "admin_notice",
        push_kind: "notice",
        meta: {},
      },
    },
  })),
}));
vi.mock("@/lib/notifications/client/notification-events-read-resync", () => ({
  resyncBadgesAfterNotificationEventsRead: vi.fn(),
}));

import NotificationDetailPage from "@/app/(main)/notifications/[notificationId]/page";

let host: HTMLDivElement;
let root: Root;
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await act(async () => Promise.resolve());
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("F6 notification detail delete", () => {
  it("trash opens the confirm dialog and does not delete immediately", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await act(async () => root.render(<NotificationDetailPage />));
    await flush();
    const trash = host.querySelector('button[aria-label="notif_inbox_delete_aria"]') as HTMLButtonElement;
    expect(trash).toBeTruthy();
    await act(async () => trash.click());
    expect(host.querySelector('[data-testid="confirm-dialog"]')?.textContent).toContain(
      "notif_inbox_delete_confirm"
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("failed delete shows the error toast and stays on the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ ok: false, error: "delete_failed" }) }))
    );
    await act(async () => root.render(<NotificationDetailPage />));
    await flush();
    const trash = host.querySelector('button[aria-label="notif_inbox_delete_aria"]') as HTMLButtonElement;
    await act(async () => trash.click());
    await act(async () => (host.querySelector('[data-testid="confirm-delete"]') as HTMLButtonElement).click());
    await flush();
    expect(host.querySelector('[data-testid="notif-detail-delete-error-toast"]')?.textContent).toContain(
      "notif_inbox_error_failed"
    );
    expect(router.replace).not.toHaveBeenCalledWith("/notifications");
  });
});
