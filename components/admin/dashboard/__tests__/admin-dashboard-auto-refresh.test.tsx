// @vitest-environment jsdom
/**
 * 관리자 자동 갱신 정책 — 대시보드 주기 갱신은 핵심 지표만 · 탭 숨김 시 중단 · 겹침 없음 · 수동 새로고침은 전부(fresh).
 * 실제 컴포넌트(AdminDashboardView) + 가짜 API · 주기 타이머와 시계만 가짜(응답 본문 읽기는 실제 타이머).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDashboardView, ADMIN_DASHBOARD_REFRESH_MS as INTERVAL } from "@/components/admin/dashboard/AdminDashboardPage";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(""),
}));

let visibility: DocumentVisibilityState = "visible";
let release: (() => void) | null = null;
let hold = false;

const fetchMock = vi.fn(async (url: string) => {
  void url;
  if (hold) await new Promise<void>((r) => (release = r));
  return new Response(
    JSON.stringify({
      ok: true,
      tab: "overview",
      generatedAt: new Date().toISOString(),
      todayPht: "2026-10-20",
      period: { id: "today", fromDay: "2026-10-20", toDay: "2026-10-20" },
      band: [],
      metrics: [],
    }),
    { status: 200 }
  );
});

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  visibility = "visible";
  hold = false;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchMock.mockClear();
});

/** 가짜 시계를 ms 만큼 진행 + 응답 처리(실제 매크로태스크) */
async function wait(ms: number) {
  await act(async () => await vi.advanceTimersByTimeAsync(ms));
  for (let i = 0; i < 6; i += 1) await act(async () => await new Promise((r) => setTimeout(r, 0)));
}
const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));
const parts = (u: string) => new URL(u, "http://x").searchParams.get("parts");

describe("대시보드 자동 갱신", () => {
  it("진입 = 전부 1회 · 주기마다 핵심 지표만(band,metrics,pending)", async () => {
    await act(async () => root.render(<AdminDashboardView />));
    await wait(5);
    expect(urls()).toHaveLength(1);
    expect(parts(urls()[0])).toBe("band,metrics,trend,pending,recent,notices");
    await wait(INTERVAL * 2.5);
    const auto = urls().slice(1);
    expect(auto.length).toBeGreaterThanOrEqual(1);
    expect(auto.length).toBeLessThanOrEqual(3);
    for (const u of auto) {
      expect(parts(u)).toBe("band,metrics,pending");
      expect(u).not.toContain("fresh=1");
    }
  });

  it("탭이 숨겨지면 요청 0 · 다시 보이면 주기가 지났을 때만 1회", async () => {
    await act(async () => root.render(<AdminDashboardView />));
    await wait(5);
    visibility = "hidden";
    const n = urls().length;
    await wait(INTERVAL * 4);
    expect(urls()).toHaveLength(n);
    visibility = "visible";
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await wait(5);
    expect(urls()).toHaveLength(n + 1);
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await wait(5);
    expect(urls()).toHaveLength(n + 1);
  });

  it("이전 조회가 끝나지 않았으면 다음 차례를 건너뛴다 (겹침 없음)", async () => {
    hold = true;
    await act(async () => root.render(<AdminDashboardView />));
    await wait(INTERVAL * 4);
    expect(urls()).toHaveLength(1);
    hold = false;
    await act(async () => release?.());
    await wait(5);
  });

  it("[새로고침] = 전부 + fresh=1 · 화면을 떠나면 갱신 중단", async () => {
    await act(async () => root.render(<AdminDashboardView />));
    await wait(5);
    const btn = host.querySelector<HTMLButtonElement>('[data-admin-dashboard-refresh="1"]');
    await act(async () => btn!.click());
    await wait(5);
    expect(urls().at(-1)).toContain("fresh=1");
    expect(parts(urls().at(-1)!)).toBe("band,metrics,trend,pending,recent,notices");
    act(() => root.unmount());
    const n = urls().length;
    root = createRoot(host);
    await wait(INTERVAL * 4);
    expect(urls()).toHaveLength(n);
  });
});
