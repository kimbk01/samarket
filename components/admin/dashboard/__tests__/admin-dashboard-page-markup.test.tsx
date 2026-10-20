import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminDashboardView, type AdminDashboardInitialState } from "@/components/admin/dashboard/AdminDashboardPage";
import { ADMIN_DASHBOARD_BAND } from "@/lib/admin/metrics/registry";
import type { AdminDashboardMetricValue } from "@/lib/admin/metrics/dashboard-overview-contract";

let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(search),
}));

const metric = (id: string, value: number | null, extra: Partial<AdminDashboardMetricValue> = {}): AdminDashboardMetricValue => ({
  id,
  labelKo: id,
  labelEn: id,
  unit: "count",
  value,
  href: "/admin/users",
  ...extra,
});

function initial(): AdminDashboardInitialState {
  return {
    generatedAt: "2026-10-20T09:27:00.000Z",
    band: ADMIN_DASHBOARD_BAND.map((b) => ({
      id: b.id,
      labelKo: b.labelKo,
      labelEn: b.labelEn,
      shortKo: b.shortKo,
      shortEn: b.shortEn,
      tab: b.tab ?? null,
      href: "/admin",
      primary: metric(b.primaryMetricId, b.id === "pending" ? 42 : 1),
      secondary: b.secondaryMetricId ? metric(b.secondaryMetricId, 2) : null,
    })),
    tabData: {
      finance: {
        metrics: [
          metric("queue.user_charges", 3),
          // 이전 값 유지 + 실패 표시 (0 금지)
          metric("finance.commission_outstanding", 12345, { unit: "php_minor", error: "commission:down", stale: true }),
          metric("finance.commission_7d", null, { unit: "php_minor", error: "commission:down" }),
        ],
        domainCards: [],
        shortcuts: [
          { id: "point", labelKo: "포인트 충전", labelEn: "Point", href: "/admin/point-charges" },
          { id: "finance", labelKo: "재무 현황", labelEn: "Finance", href: "/admin/finance" },
        ],
        trend: {
          id: "commission_daily",
          labelKo: "일별 플랫폼 수수료",
          labelEn: "Daily commission",
          bucket: "daily",
          range: 7,
          ranges: [7, 30],
          unit: "php_minor",
          series: [{ key: "commission", labelKo: "수수료", labelEn: "Commission" }],
          points: [
            { key: "2026-10-19", values: { commission: 100 } },
            { key: "2026-10-20", values: { commission: 50 } },
          ],
          href: "/admin/store-settlements",
        },
        pending: {
          complete: true,
          items: [
            {
              key: "user_charges",
              titleKo: "Point 충전 승인 대기",
              titleEn: "Point",
              domainKo: "재무",
              domainEn: "Finance",
              priority: "P1_ACTION_REQUIRED",
              count: 3,
              status: "ok",
              href: "/admin/point-charges",
            },
          ],
        },
      },
    },
  };
}

describe("AdminDashboardView markup (설계 v4 §3)", () => {
  it("공통 틀: 요약 띠 8 · 탭 7(?tab=) · 본문 · 처리 대기 · 상태 줄", () => {
    search = "tab=finance";
    const html = renderToStaticMarkup(<AdminDashboardView initial={initial()} />);
    expect(html).toContain('data-admin-dashboard="v4"');
    expect(html).toContain('data-admin-dashboard-tab="finance"');
    expect(html.match(/data-admin-band-tile=/g)).toHaveLength(8);
    expect(html.match(/role="tab"/g)).toHaveLength(7);
    expect(html).toMatch(/id="admin-dashboard-tab-finance"[^>]*aria-selected="true"/);
    expect(html).toContain('id="admin-dashboard-panel-finance"');
    expect(html).toContain('id="action-center"');
    expect(html).toContain('data-admin-pending-item="user_charges"');
    expect(html).toContain('data-admin-dashboard-status="1"');
    expect(html).toContain("17:27 PHT");
    expect(html.match(/data-admin-dashboard-shortcut=/g)).toHaveLength(2);
  });

  it("두 해상도 예산: 1024×768(띠 72·우 316·행 44) / 1280×800(≥1200: 띠 80·우 344·행 48)", () => {
    search = "tab=finance";
    const html = renderToStaticMarkup(<AdminDashboardView initial={initial()} />);
    // 요약 띠: 8칸 한 줄, 1024 = 72px, 1280 = 80px
    expect(html).toMatch(/data-admin-dashboard-band="1" class="[^"]*grid-cols-8[^"]*h-\[72px\][^"]*|data-admin-dashboard-band="1" class="[^"]*h-\[72px\][^"]*grid-cols-8/);
    expect(html).toContain("min-[1200px]:h-20");
    // 본문 2단: 좌 가변 · 우 316 / 344
    expect(html).toContain("grid-cols-[minmax(0,1fr)_316px]");
    expect(html).toContain("min-[1200px]:grid-cols-[minmax(0,1fr)_344px]");
    // 페이지 스크롤 0: 루트 h-full + 본문만 overflow-y-auto(높이 부족 시), 처리 대기 목록 내부 스크롤
    expect(html).toMatch(/data-admin-dashboard="v4"[^>]*class="flex h-full min-h-0 flex-col"/);
    expect(html).toMatch(/data-admin-dashboard-body="1" class="[^"]*min-h-0 flex-1 overflow-y-auto/);
    expect(html).toMatch(/data-admin-dashboard-pending-list="1"|class="min-h-0 flex-1 overflow-y-auto" data-admin-dashboard-pending-list/);
    expect(html).toContain("h-11");
    expect(html).toContain("min-[1200px]:h-12");
    // 지표 3×2 · 추세 최소 160
    expect(html).toMatch(/data-admin-dashboard-metrics="1"|grid shrink-0 grid-cols-3/);
    expect(html).toContain("min-h-[160px]");
    // 1024 짧은 라벨 / 1280 긴 라벨 둘 다 있음 (Provider 없는 렌더 = 기본 언어 en)
    expect(html).toContain(">Pay<");
    expect(html).toContain(">Payments<");
  });

  it("실패: 이전 값 + 「불러오기 실패」, 이전 값 없으면 「—」 (0 아님)", () => {
    search = "tab=finance";
    const html = renderToStaticMarkup(<AdminDashboardView initial={initial()} />);
    expect(html).toMatch(/data-admin-metric-value="finance.commission_outstanding"[^>]*>₱123.45</);
    expect(html).toMatch(/data-admin-metric-value="finance.commission_7d"[^>]*>—</);
    expect(html.match(/data-admin-metric-failed="1"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Failed to load");
  });

  it("데이터 전 탭: 처리 대기 로딩 문구, 0 을 그리지 않는다", () => {
    search = "tab=support";
    const html = renderToStaticMarkup(<AdminDashboardView initial={{ band: [] }} />);
    expect(html).toContain('data-admin-dashboard-tab="support"');
    expect(html).toContain("Loading");
    expect(html).not.toContain("data-admin-metric-value");
  });
});
