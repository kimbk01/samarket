// @vitest-environment jsdom
/**
 * D-17 (재감사 3차 2026-11-07) — 광고 신고 웹:
 * ② 어드민 미리보기 머리줄에 신고 버튼(고객 화면과 같은 자리) ③ 버튼 터치 44px ④ 같은 사람 중복 접수 막기 ·
 * ① 신고 큐: feed_ad = 「광고」 + 캠페인 이름 + /admin/feed-ads/<id> 링크.
 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 쓰는 코드를 실행한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSb } from "@/lib/ads/__tests__/helpers/fake-supabase-1104f";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/reports",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} data-admin-report-feed-ad-link={rest["data-admin-report-feed-ad-link"] as string | undefined}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => {
  const value = {
    language: "ko",
    t: (k: string) => (k === "admin_report_target_feed_ad" ? "광고" : k),
    safeT: (k: string, o?: { fallbackKo?: string }) => o?.fallbackKo ?? k,
    tt: (s: string) => s,
  };
  return { useI18n: () => value };
});
vi.mock("@/hooks/use-require-auth-action", () => ({ useRequireAuthAction: () => async () => {} }));
vi.mock("@/lib/auth/get-current-user", () => ({ getCurrentUser: () => ({ id: "u1" }) }));
vi.mock("@/components/reports/ReportActionSheet", () => ({ ReportActionSheet: () => null }));

const reportsSb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/auth/api-session", () => ({ requireAuthenticatedUserIdStrict: async () => ({ ok: true, userId: "u1" }) }));
vi.mock("@/lib/auth/server-guards", () => ({ validateActiveSession: async () => ({ ok: true }) }));
vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => reportsSb.current }));
vi.mock("@/lib/security/rate-limit-presets", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  enforceUserReportQuota: async () => ({ ok: true }),
}));

import { FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";
import { FeedAdReportButton } from "@/components/ads/FeedAdReportButton";
import { AdminReportTable } from "@/components/admin/reports/AdminReportTable";
import { POST as postReport } from "@/app/api/reports/route";
import { feedAdReportTargetTitle, mapTradeReportRowsForAdmin } from "@/lib/admin-reports/admin-reports-read.server";
import type { Report } from "@/lib/types/report";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("D-17 화면", () => {
  it.each(["trade", "community"] as const)("미리보기(%s) 머리줄에 신고 버튼 — 누르지 않는 자리 표시", (density) => {
    act(() => root.render(<FeedAdFramePreview density={density} imageUrl="https://x/a.png" advertiserName="가게" />));
    const bar = container.querySelector("[data-feed-ad-advertiser]")!.parentElement!;
    const report = bar.querySelector("[data-feed-ad-report]");
    expect(report).toBeTruthy();
    expect(report!.hasAttribute("data-feed-ad-report-preview")).toBe(true);
    expect(report!.tagName).toBe("SPAN");
  });

  it("고객 화면 신고 버튼 = 누르는 영역 44px(min-h-11·min-w-11) · 줄 높이는 음수 여백", () => {
    act(() => root.render(<FeedAdReportButton campaignId="c1" />));
    const btn = container.querySelector("button[data-feed-ad-report]")!;
    expect(btn.className).toContain("min-h-11");
    expect(btn.className).toContain("min-w-11");
    expect(btn.className).toContain("-my-3");
    expect(btn.className).not.toContain("min-h-6");
  });

  it("신고 큐: feed_ad = 「광고」 · 대상은 /admin/feed-ads/<id> 링크", () => {
    const r = {
      id: "r1",
      reporterId: "u1",
      targetType: "feed_ad",
      targetId: "camp-1",
      targetUserId: "",
      targetTitle: feedAdReportTargetTitle("가을 세일"),
      reasonCode: "spam",
      reasonLabel: "스팸",
      detail: "",
      createdAt: "2026-11-07T00:00:00Z",
      status: "pending",
      reportSource: "reports",
    } as unknown as Report;
    act(() => root.render(<AdminReportTable reports={[r]} />));
    const link = container.querySelector("[data-admin-report-feed-ad-link]") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/admin/feed-ads/camp-1");
    expect(link.textContent).toBe("광고 · 가을 세일");
    expect(container.textContent).toContain("광고");
  });
});

describe("D-17 서버", () => {
  it("신고 대상 제목 = 캠페인 이름 (uuid 노출 없음)", async () => {
    const fake = makeFakeSb({ feed_ad_campaigns: [{ id: "camp-1", name: "가을 세일" }], profiles: [] });
    const rows = await mapTradeReportRowsForAdmin(fake.sb as never, [
      {
        id: "r1",
        reporter_id: "u1",
        target_type: "feed_ad",
        target_id: "camp-1",
        room_id: null,
        product_id: null,
        reason_code: "spam",
        reason_text: null,
        status: "pending",
        admin_note: null,
        created_at: "2026-11-07T00:00:00Z",
        resolved_at: null,
        resolved_by: null,
      } as never,
    ]);
    expect(rows[0]).toMatchObject({ targetType: "feed_ad", targetTitle: "광고 · 가을 세일" });
    expect(rows[0]!.targetTitle).not.toContain("camp-1");
  });

  it("같은 사람이 같은 광고를 다시 신고 → 기존 접수 돌려줌(already) · 행 1개", async () => {
    const fake = makeFakeSb({ feed_ad_campaigns: [{ id: "camp-1" }], reports: [] });
    reportsSb.current = fake.sb;
    const send = () =>
      postReport(
        new Request("https://x.test/api/reports", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetType: "feed_ad", targetId: "camp-1", reasonCode: "spam" }),
        }) as never
      );
    const a = await (await send()).json();
    const b = await (await send()).json();
    expect(a).toMatchObject({ ok: true, already: false });
    expect(b).toMatchObject({ ok: true, already: true, id: a.id });
    expect(fake.tables.reports).toHaveLength(1);
  });
});
