// @vitest-environment jsdom
/**
 * A3 — 내 포인트 잔액(`useUserPointBalance`)·사장님 주문 채팅 목록(`OwnerStoreOrderChatsView`) 공유 조회 마감.
 * 응답이 멈춰도 마감 뒤 기존 오류 화면으로 끝나고(잔액 0 표시 아님), 재진입은 새 요청을 보낸다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installStallFetch, stallState } from "@/lib/http/__tests__/shared-flight-stall-harness";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STABLE_T = (k: string) => `T:${k}`;
const STABLE_I18N = { t: STABLE_T, language: "ko" };
const STABLE_PARAMS = new URLSearchParams("storeId=store-1");

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  installStallFetch({ ok: true, balance: 10, chats: [], store: { store_name: "S" } });
  host = document.createElement("div");
  document.body.appendChild(host);
  vi.doMock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => STABLE_I18N }));
  vi.doMock("@/lib/business/use-owner-admin-url-search-params", () => ({
    useOwnerAdminUrlSearchParams: () => STABLE_PARAMS,
  }));
  vi.doMock("@/components/business/owner/OwnerAdminPageScrollShell", () => ({
    OwnerAdminPageScrollShell: ({ children }: { children: unknown }) => createElement("div", null, children as never),
  }));
  vi.doMock("next/link", () => ({
    default: ({ children, href }: { children: unknown; href: string }) =>
      createElement("a", { href }, children as never),
  }));
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.doUnmock("@/components/i18n/AppLanguageProvider");
  vi.doUnmock("@/lib/business/use-owner-admin-url-search-params");
  vi.doUnmock("@/components/business/owner/OwnerAdminPageScrollShell");
  vi.doUnmock("next/link");
});

async function mount(el: ReactElement): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root!.render(el);
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function remount(el: ReactElement): Promise<void> {
  act(() => root?.unmount());
  await mount(el);
}

async function pointsProbe() {
  const { useUserPointBalance } = await import("@/hooks/useUserPointBalance");
  function PointsProbe() {
    const { loading, error, balance } = useUserPointBalance();
    return createElement("span", {
      "data-loading": String(loading),
      "data-error": String(error),
      "data-balance": String(balance),
    });
  }
  return PointsProbe;
}

const attr = (name: string) => host.querySelector("span")?.getAttribute(name);
const ownerLoading = () => host.querySelector(".animate-pulse") != null;

describe.each(["header_stall", "body_stall"] as const)("A3 — %s", (kind) => {
  it("useUserPointBalance: 마감 뒤 loading 해제 + error(잔액 0 성공 표시 아님) · 재진입은 새 요청", async () => {
    const Probe = await pointsProbe();
    stallState.behavior = kind;
    await mount(createElement(Probe));
    await advance(12_050);
    expect(attr("data-loading")).toBe("false");
    expect(attr("data-error")).toBe("true");
    stallState.behavior = "ok";
    await remount(createElement(Probe));
    await advance(100);
    expect(stallState.fetchCalls).toBe(2);
    expect(attr("data-loading")).toBe("false");
    expect(attr("data-error")).toBe("false");
    expect(attr("data-balance")).toBe("10");
  });

  it("OwnerStoreOrderChatsView: 마감 뒤 오류 화면 · 재진입은 새 요청으로 목록 표시", async () => {
    const { OwnerStoreOrderChatsView } = await import("@/components/business/owner/OwnerStoreOrderChatsView");
    stallState.behavior = kind;
    await mount(createElement(OwnerStoreOrderChatsView));
    expect(ownerLoading()).toBe(true);
    await advance(12_050);
    expect(ownerLoading()).toBe(false);
    expect(host.textContent).toContain("T:store_owner_err_network");
    stallState.behavior = "ok";
    await remount(createElement(OwnerStoreOrderChatsView));
    await advance(100);
    expect(stallState.fetchCalls).toBe(2);
    expect(ownerLoading()).toBe(false);
    expect(host.textContent).not.toContain("T:store_owner_err_network");
  });
});

describe("A3 정상 경로 보존", () => {
  it("useUserPointBalance: 동시 인스턴스는 요청 1회 · 잔액 표시", async () => {
    const Probe = await pointsProbe();
    await mount(createElement("div", null, createElement(Probe), createElement(Probe)));
    await advance(100);
    expect(stallState.fetchCalls).toBe(1);
    expect(attr("data-balance")).toBe("10");
    expect(attr("data-error")).toBe("false");
  });

  it("OwnerStoreOrderChatsView: 정상 응답이면 로딩을 벗어나 오류 없음", async () => {
    const { OwnerStoreOrderChatsView } = await import("@/components/business/owner/OwnerStoreOrderChatsView");
    await mount(createElement(OwnerStoreOrderChatsView));
    await advance(100);
    expect(ownerLoading()).toBe(false);
    expect(host.textContent).not.toContain("T:store_owner_err_network");
  });
});
