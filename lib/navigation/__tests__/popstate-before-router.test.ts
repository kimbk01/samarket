/**
 * 뒤로(popstate)를 화면 안에서 듣는 곳은 캡처 단계로 — Next 라우터보다 먼저 (2026-11-15 Xiaomi 계측: 방 리스너 미호출·목록 복사본 3초 잔존).
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { POPSTATE_BEFORE_ROUTER } from "@/lib/navigation/popstate-before-router";

describe("popstate 캡처 리스너", () => {
  it("나중에 등록해도 일반(라우터) 리스너보다 먼저 불린다", () => {
    const order: string[] = [];
    const router = () => order.push("router");
    const screen = () => order.push("screen");
    window.addEventListener("popstate", router);
    window.addEventListener("popstate", screen, POPSTATE_BEFORE_ROUTER);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.removeEventListener("popstate", router);
    window.removeEventListener("popstate", screen, POPSTATE_BEFORE_ROUTER);
    expect(order).toEqual(["screen", "router"]);
  });

  it("이동 화면·방 진입 리스너는 추가·제거 모두 같은 옵션", () => {
    const files = [
      "components/community-messenger/room/MessengerRoomSwipeBackShell.tsx",
      "lib/community-messenger/community-messenger-room-forward-navigation.ts",
      "components/business/owner/OwnerStackPageSlideShell.tsx",
      "components/orders/customer-commerce/CommerceChildSlideShell.tsx",
      "components/route-transition/useRouteTransitionDirection.ts",
    ];
    for (const f of files) {
      const src = readFileSync(path.join(process.cwd(), f), "utf8");
      const adds = src.match(/addEventListener\("popstate",[^)]*\)/g) ?? [];
      const removes = src.match(/removeEventListener\("popstate",[^)]*\)/g) ?? [];
      expect(adds.length, f).toBeGreaterThan(0);
      for (const a of [...adds, ...removes]) expect(a, f).toContain("POPSTATE_BEFORE_ROUTER");
    }
  });
});
