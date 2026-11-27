// @vitest-environment jsdom
/**
 * 내정보 당겨서 새로고침 연결 (docs/audit/mypage-ptr-2026-11-27 §3).
 * - 고객센터 안 읽음: 당김 때 다시 읽고, 실패면 error · 이전 숫자 유지 · 옵션 없으면 핸들러 없음(분류 화면)
 * - 회원 화면에만 Host·슬롯 · 비회원 화면 없음 · 슬롯은 1단 바로 아래(stickyBelow) 시그니처 그린
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-current-user", () => ({ getSyncViewerUserIdForClient: () => "viewer-1" }));
vi.mock("@/lib/layout/main-hub-ptr-preflight", () => ({ preflightMainHubPtrRefresh: () => {} }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const tick = () => act(async () => new Promise((r) => setTimeout(r, 0)));

let root: Root | null = null;
const seen = { current: -1 };
const fetchMock = vi.fn();

function respond(total: number | null) {
  return total == null
    ? Promise.resolve({ ok: false, json: async () => ({}) })
    : Promise.resolve({ ok: true, json: async () => ({ ok: true, unread_counts: { total } }) });
}

async function mount(withPtr: boolean) {
  const { useCustomerCenterUnreadTotal } = await import("@/components/mypage/myinfo/MyInfoHomeMenuSections");
  function Probe() {
    const n = useCustomerCenterUnreadTotal(withPtr ? { mypagePullRefresh: true } : undefined);
    useEffect(() => {
      seen.current = n;
    });
    return null;
  }
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root!.render(createElement(Probe)));
  await tick();
}

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  seen.current = -1;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("고객센터 안 읽음 — 당김 때 다시 읽기", () => {
  it("당김 → 새 숫자 · success", async () => {
    fetchMock.mockImplementationOnce(() => respond(1)).mockImplementationOnce(() => respond(4));
    await mount(true);
    expect(seen.current).toBe(1);
    const { mypagePtrStore } = await import("@/lib/mypage/mypage-pull-refresh-store");
    let res: unknown;
    await act(async () => {
      res = await mypagePtrStore.run(80);
    });
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toContain("/api/me/settings/notices?unread_counts=1");
    expect(seen.current).toBe(4);
    expect(res).toMatchObject({ status: "success" });
  });

  it("실패 → error · 이전 숫자 유지", async () => {
    fetchMock.mockImplementationOnce(() => respond(2)).mockImplementationOnce(() => respond(null));
    await mount(true);
    const { mypagePtrStore } = await import("@/lib/mypage/mypage-pull-refresh-store");
    let res: unknown;
    await act(async () => {
      res = await mypagePtrStore.run(80);
    });
    await tick();
    expect(seen.current).toBe(2);
    expect(res).toMatchObject({ status: "error" });
  });

  it("옵션 없음(분류 화면) → 당김 핸들러 없음", async () => {
    fetchMock.mockImplementation(() => respond(0));
    await mount(false);
    const { mypagePtrStore } = await import("@/lib/mypage/mypage-pull-refresh-store");
    let res: unknown;
    await act(async () => {
      res = await mypagePtrStore.run(80);
    });
    expect(res).toBe("no_handler");
  });
});

describe("회원 화면에만 Host·슬롯", () => {
  const src = readFileSync(join(process.cwd(), "app/(main)/my/MyContent.tsx"), "utf8");
  it("비회원 분기에는 Host·슬롯 없음", () => {
    const guest = src.slice(src.indexOf("if (isConfirmedGuest) {"), src.indexOf("/** member or checking-with-session"));
    expect(guest).toContain("<MyPageHeader hideActions />");
    expect(guest).not.toContain("MypagePullRefreshHost");
    expect(guest).not.toContain("stickyBelow");
  });
  it("회원 분기 = Host + 1단 아래 슬롯(시그니처 그린)", () => {
    const member = src.slice(src.indexOf("/** member or checking-with-session"));
    expect(member).toContain("<MypagePullRefreshHost />");
    expect(member).toContain("<MyPageHeader stickyBelow={ptrSlot} />");
    expect(src).toMatch(/<DibayPtrSlot store=\{mypagePtrStore\} tone="onBrand" className="bg-signature"/);
  });
  it("핸들러 = 프로필 fresh(refreshFresh) + 요약 force", () => {
    expect(src).toContain("addMypagePullRefreshHandler(() => refreshFresh())");
    expect(src).toContain("loadMypageHomeSummary(uid, { force: true })");
  });
});
