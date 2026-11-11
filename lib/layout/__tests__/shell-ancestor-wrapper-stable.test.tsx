// @vitest-environment jsdom
/**
 * D1 R1·R2 (Owner 승인 2026-11-12 · docs/audit/d1-remaining-items-design-2026-11-12.md §2)
 * 앱 셸 위 Provider 는 조건(경로·유휴 시간)에 따라 감싸는 요소 종류를 바꾸지 않는다 —
 * 바뀌면 그 아래 앱 셸 전체(하단 탭 보관 화면 포함)가 다시 만들어진다(운영 확인: 매장 관리 진입·앱 시작 1.2초 뒤).
 */
import { act, createElement, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockPathname = "/stores";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounts = 0;
function Probe() {
  useEffect(() => {
    mounts += 1;
  }, []);
  return null;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
beforeEach(() => {
  mounts = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("앱 셸 위 감싸기 고정", () => {
  it("R1 장바구니 경계: 매장 관리 ↔ 배달 이동에도 아래 화면이 다시 만들어지지 않는다", async () => {
    const { StoreCommerceCartRuntimeBoundary } = await import(
      "@/components/layout/providers/StoreCommerceCartRuntimeBoundary"
    );
    const { useStoreCommerceCartOptional } = await import("@/contexts/StoreCommerceCartContext");
    const seen: Array<boolean> = [];
    function CartSeen() {
      seen.push(useStoreCommerceCartOptional() != null);
      return null;
    }
    const tree = (): ReactNode =>
      createElement(StoreCommerceCartRuntimeBoundary, null, createElement(Probe), createElement(CartSeen));
    mockPathname = "/stores";
    act(() => root!.render(tree()));
    mockPathname = "/stores/owner";
    act(() => root!.render(tree()));
    expect(seen.at(-1)).toBe(false); // 매장 관리: 고객 장바구니 값 없음(예전 Provider 없음과 같음)
    mockPathname = "/stores";
    act(() => root!.render(tree()));
    expect(seen.at(-1)).toBe(true);
    expect(mounts).toBe(1);
  });

  it("R2 거래 상태: 유휴 시간 뒤 켜져도 아래 화면이 다시 만들어지지 않는다", async () => {
    vi.doMock("@/components/chats/TradePresenceActivityContext", async () => {
      const React = await import("react");
      return {
        TradePresenceActivityProvider: ({ children, armed }: { children: ReactNode; armed?: boolean }) =>
          React.createElement("section", { "data-armed": armed ? "1" : "0" }, children),
      };
    });
    const idle: Array<() => void> = [];
    vi.stubGlobal("requestIdleCallback", (cb: () => void) => {
      idle.push(cb);
      return idle.length;
    });
    vi.stubGlobal("cancelIdleCallback", () => {});
    const { DeferredTradePresenceActivityProvider } = await import(
      "@/components/layout/DeferredTradePresenceActivityProvider"
    );
    act(() => root!.render(createElement(DeferredTradePresenceActivityProvider, null, createElement(Probe))));
    expect(host!.querySelector("section")?.getAttribute("data-armed")).toBe("0");
    act(() => idle.forEach((cb) => cb()));
    expect(host!.querySelector("section")?.getAttribute("data-armed")).toBe("1");
    expect(mounts).toBe(1);
    act(() => root!.unmount());
    root = null;
    vi.unstubAllGlobals();
    vi.doUnmock("@/components/chats/TradePresenceActivityContext");
  });

  it("두 경계 모두 Fragment 로 children 을 돌려주는 분기가 없다", () => {
    for (const f of [
      "components/layout/providers/StoreCommerceCartRuntimeBoundary.tsx",
      "components/layout/DeferredTradePresenceActivityProvider.tsx",
    ]) {
      expect(readFileSync(join(process.cwd(), f), "utf8"), f).not.toMatch(/return\s*<>\s*\{children\}\s*<\/>/);
    }
  });

  it("거래 상태 Provider 는 꺼진 동안 값 null·엔진 없음, 엔진은 children 의 형제", () => {
    const src = readFileSync(join(process.cwd(), "components/chats/TradePresenceActivityContext.tsx"), "utf8");
    expect(src).toContain("value={armed ? value : null}");
    expect(src).toContain("{armed ? <TradePresenceActivityEngine onValue={setValue} /> : null}");
  });

  it("장바구니 Provider 꺼짐(inert): 값 null·저장소 읽기/쓰기·동기화·발행 없음", () => {
    const src = readFileSync(join(process.cwd(), "contexts/StoreCommerceCartContext.tsx"), "utf8");
    expect(src).toContain("value={inert ? null : actionsValue}");
    expect(src).toContain("value={inert ? null : value}");
    expect(src).toMatch(/if \(inert \|\| !hydrated\) return;\s*return bindCommerceCartResync/);
    expect(src).toMatch(/if \(inert \|\| !hydrated\) return;\s*writeCommerceCartToStorage/);
    expect(src).toMatch(/if \(inert\) return;\s*publishCommerceCartSnapshot/);
  });
});
