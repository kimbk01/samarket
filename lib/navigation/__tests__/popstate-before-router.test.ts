/**
 * 뒤로(popstate) 단일 선등록 리스너 — window 리스너는 등록 순서대로 불리므로(Chrome 156 실측, 캡처 무관)
 * `<head>` 스크립트로 Next 보다 먼저 1개를 걸고 화면은 구독만 한다 (2026-11-15).
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  POPSTATE_BEFORE_ROUTER_BOOT_SCRIPT,
  subscribePopstateBeforeRouter,
} from "@/lib/navigation/popstate-before-router";

describe("popstate 선등록", () => {
  it("부트 스크립트 뒤 라우터가 등록되고, 화면이 나중에 구독해도 화면이 먼저 불린다", () => {
    new Function(POPSTATE_BEFORE_ROUTER_BOOT_SCRIPT)();
    const order: string[] = [];
    const router = () => order.push("router");
    window.addEventListener("popstate", router);
    const off = subscribePopstateBeforeRouter(() => order.push("screen"));
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(order).toEqual(["screen", "router"]);
    off();
    order.length = 0;
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(order).toEqual(["router"]);
    window.removeEventListener("popstate", router);
  });

  it("구독자 하나의 오류가 다른 구독자를 막지 않는다", () => {
    const seen: string[] = [];
    const a = subscribePopstateBeforeRouter(() => {
      throw new Error("x");
    });
    const b = subscribePopstateBeforeRouter(() => seen.push("b"));
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(seen).toEqual(["b"]);
    a();
    b();
  });

  it("루트 레이아웃 <head> 에 부트 스크립트 · 화면 5곳은 window popstate 직접 등록 대신 구독", () => {
    const root = process.cwd();
    const layout = readFileSync(path.join(root, "app/layout.tsx"), "utf8");
    expect(layout).toContain("__html: POPSTATE_BEFORE_ROUTER_BOOT_SCRIPT");
    for (const f of [
      "components/community-messenger/room/MessengerRoomSwipeBackShell.tsx",
      "lib/community-messenger/community-messenger-room-forward-navigation.ts",
      "components/business/owner/OwnerStackPageSlideShell.tsx",
      "components/orders/customer-commerce/CommerceChildSlideShell.tsx",
      "components/route-transition/useRouteTransitionDirection.ts",
    ]) {
      const src = readFileSync(path.join(root, f), "utf8");
      expect(src, f).toContain("subscribePopstateBeforeRouter(");
      expect(src, f).not.toMatch(/addEventListener\("popstate"/);
    }
  });
});
