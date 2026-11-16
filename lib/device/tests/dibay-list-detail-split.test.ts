import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/AppStickyHeader", () => ({ AppStickyHeader: () => createElement("header", null, "h") }));
vi.mock("@/components/layout/BottomNavShowingRouteContexts", () => ({
  BottomNavShowingRouteContexts: ({ children }: { children: unknown }) => children,
}));

import { ListDetailSplitFrame } from "@/components/layout/ListDetailSplitFrame";
import { shouldSuppressListDetailSplitMainShellSlide } from "@/components/route-transition/route-transition-config";
import { DIBAY_DEVICE_CLASSES } from "@/lib/device/dibay-device-class";
import {
  DIBAY_LIST_DETAIL_SPLIT_MIN_CSS,
  dibayDeviceProfile,
  resolveDibayListDetailLayout,
} from "@/lib/device/dibay-device-profile";
import { readDibayListDetailLayoutNow } from "@/lib/device/dibay-list-detail-layout-now";
import { resolveListDetailSplitRoute } from "@/lib/layout/list-detail-split-paths";

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");
const POST = "/philife/5439f751-b393-4d41-9a14-9919b53c4475";

describe("S4 두 칸 판정 (기기 프로필 × 창 폭)", () => {
  it("두 칸 시작 폭 = 메신저 두 칸 계약 768", () => {
    expect(DIBAY_LIST_DETAIL_SPLIT_MIN_CSS).toBe(768);
  });

  it("기기·창 폭(회전 포함) 결과표 — 시안 profiles.js 와 같음", () => {
    const cases: Array<[Parameters<typeof resolveDibayListDetailLayout>[0]["deviceClass"], number, string]> = [
      ["PHONE_ANDROID", 384, "STACK"],
      ["PHONE_IOS", 430, "STACK"],
      ["PHONE_IOS", 932, "STACK"], // 휴대폰은 폭과 무관하게 한 화면
      ["TABLET_ANDROID", 601, "STACK"], // Xiaomi 세로
      ["TABLET_ANDROID", 1006, "SPLIT"], // Xiaomi 가로
      ["TABLET_IPAD", 820, "SPLIT"], // iPad 10 세로
      ["TABLET_IPAD", 1180, "SPLIT"], // iPad 10 가로
      ["TABLET_IPAD", 744, "STACK"], // iPad mini 세로
      ["TABLET_IPAD", 1133, "SPLIT"], // iPad mini 가로
      ["TABLET_IPAD", 590, "STACK"], // iPad 화면 반 나누기
      ["DESKTOP_WINDOWS", 1600, "SPLIT"],
      ["DESKTOP_WINDOWS", 700, "STACK"],
      ["DESKTOP_MAC", 1612, "SPLIT"],
      ["DESKTOP_MAC", 381, "STACK"], // Mac 최소 창
      ["WEB_DESKTOP", 1024, "SPLIT"],
      ["UNKNOWN", 1600, "STACK"],
    ];
    for (const [deviceClass, widthCss, expected] of cases) {
      expect(resolveDibayListDetailLayout({ deviceClass, widthCss }), `${deviceClass} ${widthCss}`).toBe(expected);
    }
  });

  it("R1 회전은 폭만 바꾼다 — 같은 기기에서 결과는 폭으로만 바뀐다", () => {
    for (const dc of DIBAY_DEVICE_CLASSES) {
      const narrow = resolveDibayListDetailLayout({ deviceClass: dc, widthCss: 767 });
      const wide = resolveDibayListDetailLayout({ deviceClass: dc, widthCss: 768 });
      expect(narrow).toBe("STACK");
      expect(wide).toBe(dibayDeviceProfile(dc).listDetailSplit ? "SPLIT" : "STACK");
    }
  });

  it("창 없는 환경(서버·시험)은 한 화면", () => {
    expect(readDibayListDetailLayoutNow()).toBe("STACK");
  });
});

describe("S4 두 칸 경로 (LOUNGE)", () => {
  it("목록·상세", () => {
    expect(resolveListDetailSplitRoute("/philife")).toEqual({ hub: "community", hubPath: "/philife", role: "list" });
    expect(resolveListDetailSplitRoute(POST)).toEqual({ hub: "community", hubPath: "/philife", role: "detail" });
  });
  it("다른 화면은 두 칸 아님", () => {
    for (const p of ["/home", "/market", "/stores", "/community-messenger", "/mypage", "/philife/write", "/philife/my", null]) {
      expect(resolveListDetailSplitRoute(p), String(p)).toBeNull();
    }
  });
  it("두 칸이 아니면 목록↔상세 슬라이드 생략 안 함(지금 연출 그대로)", () => {
    expect(shouldSuppressListDetailSplitMainShellSlide("/philife", POST)).toBe(false);
    expect(shouldSuppressListDetailSplitMainShellSlide("/home", POST)).toBe(false);
  });
});

describe("R4·R5 회전해도 다시 마운트 없음 — 틀 구조가 한 화면·두 칸에서 같다", () => {
  const skeleton = (html: string) => html.replace(/\s[a-z-]+="[^"]*"/g, "").replace(/\s[a-z-]+(?=[\s>])/g, "");
  it("목록·상세 슬롯 위치 동일", () => {
    const list = createElement("i", { id: "L" });
    const detail = createElement("b", { id: "D" });
    const stack = renderToStaticMarkup(createElement(ListDetailSplitFrame, { active: false, showList: false, hubPath: "/philife", detailHeader: true, list, detail }));
    const split = renderToStaticMarkup(createElement(ListDetailSplitFrame, { active: true, showList: true, hubPath: "/philife", detailHeader: true, list, detail }));
    expect(stack).toContain('data-list-detail-split="stack"');
    expect(split).toContain('data-list-detail-split="split"');
    // 두 칸은 목록 칸 머리글만 더해진다(머리글 자리는 첫 자식 null 자리 — 목록·상세 위치는 같음)
    expect(skeleton(split).replaceAll("<div><header>h</header></div>", "")).toBe(skeleton(stack));
  });
  it("보관대는 항상 틀로 감싼다 · 틀 CSS 는 한 화면에서 display: contents", () => {
    const stack = read("components/layout/HubRetentionStack.tsx");
    expect(stack).toContain("<ListDetailSplitFrame");
    expect(stack).toContain("list={retainedEntries}");
    expect(stack).toContain("detail={liveAndSkeleton}");
    const css = read("app/app-list-detail-split.css");
    expect(css).toMatch(/\.list-detail-split,\s*\.list-detail-split > \[data-list-detail-pane\],\s*\.list-detail-split > \[data-list-detail-pane\] > \[data-list-detail-scroll\] \{\s*display: contents;/);
    expect(css).toContain("clamp(360px, 35vw, 470px)");
    expect(read("app/app-bottom-nav.css")).toContain("--cm-split-list-pane-width: clamp(360px, 35vw, 470px)");
  });
  it("셸: 두 칸이면 머리글을 목록 칸으로, 본문 스크롤 잠금, 하단 탭 목록 칸 아래", () => {
    const shell = read("components/layout/ConditionalAppShell.tsx");
    expect(shell).toContain("hubScrollColumn && !listDetailSplit ?");
    expect(shell).toContain('f.isCommunityMessengerHubListSurface || listDetailSplit ? " main-hub-scroll-body--child-scroll-lock"');
    expect(shell).toMatch(/!isDesktopSideRail &&[\s\S]{0,400}listDetailSplit\)\s*\?\s*APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS/);
  });
});
