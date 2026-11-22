import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

let mockPath = "/stores/abc/info";
vi.mock("next/navigation", () => ({ usePathname: () => mockPath }));

import { MainSegmentPendingLoading } from "@/components/layout/MainSegmentPendingLoading";

/** loading-spinner 설계 W1 — 하위 화면만 대기 스피너, 허브 첫 화면·통화 화면은 예전처럼 비움 */
describe("MainSegmentPendingLoading", () => {
  it("하위 화면 = DIBAY 대기 스피너", () => {
    mockPath = "/stores/abc/info";
    expect(renderToStaticMarkup(<MainSegmentPendingLoading />)).toContain('data-dibay-pending-spinner="page"');
    mockPath = "/community-messenger/contacts";
    expect(renderToStaticMarkup(<MainSegmentPendingLoading />)).toContain("data-dibay-pending-spinner");
  });
  it.each(["/stores", "/market", "/community-messenger", "/my", "/philife"])("허브 첫 화면 %s = 비움", (p) => {
    mockPath = p;
    expect(renderToStaticMarkup(<MainSegmentPendingLoading />)).toBe("");
  });
  it.each(["/community-messenger/calls-v4/abc", "/community-messenger/calls/abc", "/community-messenger/calls-v3/abc"])(
    "통화 화면 %s = 비움(통화 규정)",
    (p) => {
      mockPath = p;
      expect(renderToStaticMarkup(<MainSegmentPendingLoading />)).toBe("");
    }
  );
});
