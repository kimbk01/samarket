// @vitest-environment jsdom
/** 이력 「삭제됨」 + 삭제 취소 (A-2 · L2 · 사유 · 재입력 없음 · R2 2026-11-07) */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, language: "ko" }),
}));
const accessActor = { value: { role: "admin", permissions: ["ads"] } };
vi.mock("@/components/admin/access/use-admin-route-access", () => ({
  useAdminAccessActor: () => ({ actor: accessActor.value, loading: false }),
}));
vi.mock("@/components/admin/ui/AdminPagination", () => ({ AdminPagination: () => null }));
vi.mock("@/components/admin/ui/AdminStateViews", () => ({
  AdminEmptyState: ({ message }: { message?: string }) => <p data-empty="1">{message}</p>,
  AdminErrorState: () => <p data-error="1" />,
  AdminLoadingState: () => <p data-loading="1" />,
}));
const dibayAlert = vi.fn(async () => undefined);
vi.mock("@/components/ui/dibay-overlay", () => ({ dibayAlert: (...a: unknown[]) => dibayAlert(...(a as [])) }));
const confirmAdminAction = vi.fn();
vi.mock("@/lib/admin/operator-ux/admin-confirm-action", () => ({
  confirmAdminAction: (...a: unknown[]) => confirmAdminAction(...a),
}));

import { AdminAdsDeletedList } from "@/components/admin/ads/AdminAdsDeletedList";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
const fetchMock = vi.fn();
const flush = async () => {
  for (let i = 0; i < 4; i += 1) await act(async () => Promise.resolve());
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  fetchMock.mockReset();
  confirmAdminAction.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const ROWS = [
  { kind: "trade_promotion", id: "o-1", title: "거래 글", deletedAt: "2026-11-07T10:00:00Z", deletedBy: "a", deleteReason: "중복" },
  { kind: "delivery_banner", id: "b-1", title: "배너", deletedAt: "2026-11-07T09:00:00Z", deletedBy: "a", deleteReason: "정리" },
];

describe("AdminAdsDeletedList", () => {
  it("삭제된 행·사유를 보이고, 권한 없는 종류는 삭제 취소가 꺼진다", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, rows: ROWS, total: 2 }) });
    act(() => root.render(<AdminAdsDeletedList page={1} size={20} onPageChange={() => {}} onSizeChange={() => {}} />));
    await flush();
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/ads/deleted?limit=20&offset=0");
    const rows = document.querySelectorAll("[data-ads-history-deleted-row]");
    expect(rows.length).toBe(2);
    const btns = document.querySelectorAll<HTMLButtonElement>("[data-ads-history-undelete]");
    expect(btns[0]!.disabled).toBe(false);
    expect(btns[1]!.disabled).toBe(true);
    expect(rows[0]!.textContent).toContain("중복");
  });

  it("삭제 취소 = adUndelete(L2 · 사유) → POST undelete → 다시 불러옴", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, rows: ROWS.slice(0, 1), total: 1 }) });
    act(() => root.render(<AdminAdsDeletedList page={1} size={20} onPageChange={() => {}} onSizeChange={() => {}} />));
    await flush();
    confirmAdminAction.mockResolvedValueOnce({ ok: true, reason: "실수 복구" });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, rows: [], total: 0 }) });
    act(() => document.querySelector<HTMLButtonElement>("[data-ads-history-undelete]")!.click());
    await flush();
    expect(confirmAdminAction.mock.calls[0]![0]).toMatchObject({ action: "adUndelete" });
    expect(confirmAdminAction.mock.calls[0]![0].retypeValue).toBeUndefined();
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/admin/ads/undelete");
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ kind: "trade_promotion", id: "o-1", reason: "실수 복구" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(document.querySelector("[data-empty]")?.textContent).toBe("admin_ads_history_deleted_empty");
  });
});
