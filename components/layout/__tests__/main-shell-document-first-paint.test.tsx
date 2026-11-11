/**
 * C 단계 (Owner 승인 2026-11-10, `docs/audit/app-shell-ssr-c-stage-design-2026-11-10.md`) — `(main)` 셸 서버 HTML 계약.
 *
 * 예전(FAIL②, 2026-11-09): 헤더 패널 래퍼 2개가 `next/dynamic({ ssr:false })` 로 셸 전체를 감싸 서버 HTML 에 메뉴·헤더가 없었다.
 * 이제 래퍼는 일반 import 로 서버에서 그려지고(자식 포함), 페이지 본문만 hydration 이후(C2) 그린다.
 */
// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("@/components/philife/PhilifeMessengerFromHeaderStack", () => ({
  PhilifeMessengerFromHeaderStack: ({ children }: { children: React.ReactNode }) => (
    <div data-test-philife-stack="">{children}</div>
  ),
}));
vi.mock("@/components/trade/TradeHistoryFromHeaderStack", () => ({
  TradeHistoryFromHeaderStack: ({ children }: { children: React.ReactNode }) => (
    <div data-test-trade-stack="">{children}</div>
  ),
}));

import { MainAppHeaderStackWrap } from "@/components/layout/MainAppHeaderStackWrap";
import { MainShellDocumentLoading } from "@/components/layout/MainRouteLoading";
import { useShellHydrated } from "@/lib/ui/use-shell-hydrated";

const root = process.cwd();

describe("C 단계 — 셸 서버 HTML", () => {
  it("C1: 헤더 패널 래퍼는 서버에서 자식(셸)까지 그린다 — 클라이언트 전용 경계 없음", () => {
    const html = renderToString(
      <MainAppHeaderStackWrap>
        <div data-test-route-child="">child</div>
      </MainAppHeaderStackWrap>
    );
    expect(html).toContain("data-test-philife-stack");
    expect(html).toContain("data-test-trade-stack");
    expect(html).toContain("data-test-route-child");
    expect(html).not.toContain("<!--$!-->");
    const src = readFileSync(join(root, "components/layout/MainAppHeaderStackWrap.tsx"), "utf8");
    expect(src).not.toMatch(/from "next\/dynamic"/);
  });

  it("C2: 서버·hydration 첫 렌더는 hydration 전 값(false) — 본문 자리는 기존 회색 줄 화면", () => {
    function Probe() {
      return useShellHydrated() ? <p data-body="">body</p> : <MainShellDocumentLoading />;
    }
    const html = renderToString(<Probe />);
    expect(html).toContain("data-main-shell-document-loading");
    expect(html).not.toContain("data-body");
    const shell = readFileSync(join(root, "components/layout/ConditionalAppShell.tsx"), "utf8");
    /** D1 (2026-11-11): 본문은 허브 화면 보관대를 거쳐 그린다 — hydration 전 회색 줄 계약은 그대로 */
    expect(shell).toContain(
      "{shellHydrated ? <HubRetentionStack>{children}</HubRetentionStack> : <MainShellDocumentLoading />}"
    );
    expect(shell).toContain("document.documentElement.setAttribute(SHELL_HYDRATED_HTML_ATTR");
  });

  it("C3: 하단 메뉴 레일·탭 주소의 저장값 읽기는 hydration 이후에만", () => {
    const nav = readFileSync(join(root, "components/layout/BottomNav.tsx"), "utf8");
    expect(nav.match(/shellHydrated \? resolveMainBottomNavSecondaryRailKind\(pathname, searchParams\) : undefined/g)).toHaveLength(2);
    expect(nav).toMatch(/shellHydrated\s*\?\s*resolveMainBottomNavTabTapHref\(tab\.id, tab\.href, \{[\s\S]*?\}\)\s*:\s*tab\.href/);
    expect(nav).toContain('data-app-bottom-nav=""');
  });

  it("C4: 앱 부팅 서버 스냅샷은 항상 초기값", async () => {
    const { getAppBootServerSnapshot } = await import("@/lib/app-boot/app-boot-store");
    expect(getAppBootServerSnapshot().status).toBe("idle");
    expect(getAppBootServerSnapshot().profile).toBeNull();
    const provider = readFileSync(join(root, "components/app/AppBootProvider.tsx"), "utf8");
    expect(provider).toContain("useSyncExternalStore(subscribeAppBoot, getAppBootSnapshot, getAppBootServerSnapshot)");
  });

  it("C5: hydration 전 하단 메뉴 누름 차단 CSS", () => {
    const css = readFileSync(join(root, "app/app-bottom-nav.css"), "utf8");
    expect(css).toMatch(/html:not\(\[data-shell-hydrated\]\) \[data-app-bottom-nav\] \{\s*pointer-events: none;/);
  });

  it("회색 줄 화면은 경로 중립: 하단 메뉴·문구 없음", () => {
    const html = renderToString(<MainShellDocumentLoading />);
    expect(html).toContain("bg-sam-app");
    expect(html).not.toMatch(/<nav\b/);
    expect(html.replace(/<[^>]+>/g, "").trim()).toBe("");
  });
});
