// @vitest-environment jsdom
/**
 * 채팅 P0-2·P0-3 계약 (Owner 「채팅 P0 승인」 2026-11-11 · docs/audit/messenger-p0-structural-audit-design-2026-11-11.md)
 * P0-2: 진입 room_silent 부트스트랩 1회(D-12 ③ 유지) · 진입 따라잡기 1건 · 목록 미리 받기는 idle.
 * P0-3: 탭·기본 탭 주소는 제자리 교체(서버 요청 없음) · `initial*` 는 마운트 후 무시 · 태블릿 방 주소에 기본 탭 안 씀.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { replaceMessengerUrlInPlace } from "@/lib/community-messenger/messenger-url-in-place";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("P0-3 제자리 주소 교체", () => {
  it("history.replaceState 로 바꾸고, 앱 기록 값은 남기고 Next 내부 표식은 넘기지 않는다", () => {
    window.history.replaceState({ __NA: true, keep: 1, __PRIVATE_NEXTJS_INTERNALS_TREE: [] }, "", "/community-messenger?section=chats");
    const spy = vi.spyOn(window.history, "replaceState");
    replaceMessengerUrlInPlace("/community-messenger?section=friends");
    expect(spy).toHaveBeenCalledTimes(1);
    const [data, , url] = spy.mock.calls[0]!;
    expect(url).toBe("/community-messenger?section=friends");
    expect(data).toEqual({ keep: 1 });
    expect(window.location.search).toBe("?section=friends");
  });

  it("이미 같은 주소면 아무것도 하지 않는다", () => {
    window.history.replaceState(null, "", "/community-messenger?section=calls");
    const spy = vi.spyOn(window.history, "replaceState");
    replaceMessengerUrlInPlace("/community-messenger?section=calls");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("P0-3 구조 계약(소스)", () => {
  it("탭 전환 주소는 router.replace 가 아니라 제자리 교체", () => {
    const nav = read("lib/community-messenger/home/use-community-messenger-home-navigation.ts");
    expect(nav).toContain("replaceMessengerUrlInPlace(nextUrl)");
    expect(nav).not.toMatch(/router\.replace\.bind/);
  });

  it("URL→탭 맞춤의 기본 탭·옛 주소 정리는 제자리 교체, 태블릿 방 주소에는 기본 탭을 쓰지 않는다", () => {
    const fx = read("lib/community-messenger/home/use-community-messenger-home-shell-effects.tsx");
    expect(fx).toMatch(/guardedRouterReplace\(messengerInPlaceUrlRouter, `\$\{sectionUrlBasePath\}\?section=friends/);
    expect(fx).toMatch(/guardedRouterReplace\(messengerInPlaceUrlRouter, `\$\{sectionUrlBasePath\}\?\$\{qs\.toString\(\)\}`/);
    expect(fx).toMatch(/!isMessengerStickyRoomSectionRoute &&\s*!activeSection\.trim\(\)/);
  });

  it("홈 memo 비교는 initial* 를 보지 않는다", () => {
    const home = read("components/community-messenger/CommunityMessengerHome.tsx");
    const body = home.slice(home.indexOf("function communityMessengerHomePropsEqual"), home.indexOf("prev.initialServerBootstrap !== next.initialServerBootstrap"));
    expect(body).not.toMatch(/prev\.initial(Tab|Section|Filter|Kind)/);
  });
});

describe("P0-2 구조 계약(소스)", () => {
  const phase1 = read("lib/community-messenger/room/use-messenger-room-client-phase1.ts");
  it("진입 따라잡기는 entryCatchUp 1건(after+latest 동시 발사 없음)", () => {
    expect(phase1).toContain("void entryCatchUp();");
    expect(phase1).not.toMatch(/void catchUpNewerMessages\(\);\s*\/\*\*[\s\S]{0,400}void reconcileLatestMessages\(\);/);
  });

  it("D-12 ③ entry_silent 결과로 같은 부트스트랩을 바로 다시 받지 않는다", () => {
    expect(phase1).toMatch(/if \(applySource !== "entry_silent"\) \{\s*queueMicrotask\(\(\) => \{\s*forgetMessengerRoomClientBootstrapFlights/);
  });

  it("목록 주소 미리 받기는 브라우저 idle 에", () => {
    const inner = read("components/community-messenger/CommunityMessengerRoomClientInner.tsx");
    expect(inner).toMatch(/scheduleWhenBrowserIdle\(\(\) => \{\s*if \(communityMessengerListRoutesPrefetched\) return;/);
  });
});
