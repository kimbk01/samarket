/**
 * FAIL② — 배포 후 첫 탭 빈 화면: `(main)` 셸의 서버 HTML 첫 그림 계약.
 *
 * Next 16 App Router 의 `next/dynamic` 은 `app-dynamic`(lazy-dynamic/loadable)이다. `ssr: false` 이면 서버에서
 * BailoutToCSR 로 Suspense fallback 만 HTML 에 남는다 — fallback 이 없으면 보이는 내용 0 (빈 화면).
 * 여기서는 실제 App Router 구현으로 서버 렌더해 fallback 이 HTML 에 있는지 확인한다.
 */
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("next/dynamic", async () => {
  const mod = await import("next/dist/shared/lib/app-dynamic");
  return { default: (mod as unknown as { default: unknown }).default };
});
vi.mock("@/components/philife/PhilifeMessengerFromHeaderStack", () => ({
  PhilifeMessengerFromHeaderStack: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/trade/TradeHistoryFromHeaderStack", () => ({
  TradeHistoryFromHeaderStack: ({ children }: { children: React.ReactNode }) => children,
}));

import { MainAppHeaderStackWrap } from "@/components/layout/MainAppHeaderStackWrap";
import { MainShellDocumentLoading } from "@/components/layout/MainRouteLoading";

describe("FAIL② main shell document first paint", () => {
  it("server HTML of the client-only header stack wrapper contains the loading shell (not empty)", () => {
    const html = renderToString(
      <MainAppHeaderStackWrap>
        <div data-test-route-child="">child</div>
      </MainAppHeaderStackWrap>
    );
    // 클라이언트 전용 경계는 그대로(서버에서 자식 미렌더 — 기존 트리·hydration 계약 유지)
    expect(html).toContain("<!--$!-->");
    expect(html).not.toContain("data-test-route-child");
    // 첫 그림 = 로딩 셸
    expect(html).toContain("data-main-shell-document-loading");
    expect(html).toContain('aria-busy="true"');
  });

  it("loading shell is route-neutral: no bottom nav, no user-visible text", () => {
    const html = renderToString(<MainShellDocumentLoading />);
    expect(html).toContain("bg-sam-app");
    expect(html).not.toMatch(/<nav\b/);
    const text = html.replace(/<[^>]+>/g, "").trim();
    expect(text).toBe("");
  });
});
