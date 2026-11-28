// @vitest-environment jsdom
/**
 * 고객센터 최종 감사(HEAD b6658fa11) — 어드민·라우트 결함 D1·D3 + 「내 문의」 2페이지 이후 낡은 행.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ meOk: false }));

vi.mock("@/lib/auth/client-instance-id", () => ({ getBoundAuthUserId: () => null }));
vi.mock("@/lib/admin/admin-fetch-client", () => ({
  adminFetch: async () =>
    state.meOk
      ? new Response(JSON.stringify({ ok: true, userId: "adm-1", role: "admin", permissions: ["support"] }), { status: 200 })
      : new Response("{}", { status: 500 }),
  invalidateAdminFetchCache: () => {},
  clearAllAdminFetchCache: () => {},
}));
vi.mock("@/lib/admin/admin-query-cache", () => ({ clearAllAdminQueryCache: () => {} }));

import {
  ADMIN_ME_SNAPSHOT_READY_EVENT,
  clearAdminMeSnapshot,
  fetchAdminMeSnapshot,
} from "@/lib/admin-auth/admin-me-context";
import { supportErrorHttpStatus } from "@/lib/support/support-display-labels";
import { useMypageCursorList, type MypageCursorListState } from "@/lib/mypage/use-mypage-cursor-list";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("D1 — 안내문 이동 대상 입력 오류는 400(500 아님)", () => {
  it.each(["cta_url_forbidden", "invalid_internal_route", "invalid_domain_entity_target"])("%s = 400", (code) => {
    expect(supportErrorHttpStatus(code)).toBe(400);
  });
});

describe("D3 — 권한 조회 실패 뒤 성공하면 알린다(공통 구독 다시 붙이기 신호)", () => {
  beforeEach(() => {
    clearAdminMeSnapshot();
    state.meOk = false;
  });

  it("없다가 생길 때만 1번 알린다", async () => {
    const got = vi.fn();
    window.addEventListener(ADMIN_ME_SNAPSHOT_READY_EVENT, got);
    expect(await fetchAdminMeSnapshot()).toBeNull();
    expect(got).not.toHaveBeenCalled();
    state.meOk = true;
    expect((await fetchAdminMeSnapshot())?.userId).toBe("adm-1");
    expect(got).toHaveBeenCalledTimes(1);
    // 이미 있으면(캐시) 알리지 않는다
    await fetchAdminMeSnapshot();
    expect(got).toHaveBeenCalledTimes(1);
    window.removeEventListener(ADMIN_ME_SNAPSHOT_READY_EVENT, got);
  });
});

describe("「내 문의」 다시 읽기 replace — 2페이지 이후 낡은 행을 붙이지 않는다", () => {
  it("replace: true 면 첫 페이지로 바꾸고, 기본(조용한 재검증)은 예전처럼 꼬리를 붙인다", async () => {
    type Row = { id: string };
    const pageOne: Row[] = [{ id: "a" }, { id: "b" }];
    const fetchPage = async (cursor: string | null) =>
      cursor ? { items: [{ id: "c" }], next_cursor: null } : { items: pageOne, next_cursor: "p2" };
    let api: MypageCursorListState<Row> | null = null;
    function Probe({ onApi }: { onApi: (a: MypageCursorListState<Row>) => void }) {
      onApi(useMypageCursorList<Row>({ cacheKey: "final-audit-test", fetchPage, getId: (r) => r.id }));
      return null;
    }
    const el = document.createElement("div");
    const root = createRoot(el);
    await act(async () => root.render(<Probe onApi={(a) => (api = a)} />));
    await act(async () => {});
    await act(async () => api!.loadMore());
    expect(api!.items.map((r) => r.id)).toEqual(["a", "b", "c"]);
    // c 가 종료되어 서버 목록에서 빠졌다 — 첫 페이지는 a, b 그대로
    await act(async () => api!.reload());
    expect(api!.items.map((r) => r.id)).toEqual(["a", "b", "c"]);
    await act(async () => api!.reload({ replace: true }));
    expect(api!.items.map((r) => r.id)).toEqual(["a", "b"]);
    await act(async () => root.unmount());
  });
});
