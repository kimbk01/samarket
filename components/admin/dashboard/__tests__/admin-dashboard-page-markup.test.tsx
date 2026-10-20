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
  period: "now",
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
          metric("points.waiting_confirm", 3),
          // 이전 값 유지 + 실패 표시 (0 금지)
          metric("finance.commission_outstanding", 12345, { unit: "php_minor", error: "commission:down", stale: true }),
          metric("finance.commission_net", null, { unit: "php_minor", period: "selected", error: "commission:down" }),
          metric("finance.cash_in_today", 500, { unit: "php_minor", period: "today_fixed" }),
        ],
        shortcuts: [
          { id: "point", labelKo: "포인트 충전", labelEn: "Point", href: "/admin/point-charges" },
          { id: "finance", labelKo: "재무 현황", labelEn: "Finance", href: "/admin/finance" },
        ],
        trend: {
          id: "commission_daily",
          labelKo: "일별 플랫폼 수수료",
          labelEn: "Daily commission",
          days: 7,
          fromDay: "2026-10-14",
          toDay: "2026-10-20",
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
          total: 3,
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
  it("공통 틀: 요약 띠 8 · 탭 7(?tab=) · 본문 · 처리 대기/최근 활동 · 상태 줄(갱신·새로고침·기간)", () => {
    search = "tab=finance";
    const html = renderToStaticMarkup(<AdminDashboardView initial={initial()} />);
    expect(html).toContain('data-admin-dashboard="v4"');
    expect(html).toContain('data-admin-dashboard-tab="finance"');
    expect(html.match(/data-admin-band-tile=/g)).toHaveLength(8);
    // 대시보드 탭 7 + 오른쪽 패널 탭 2 (처리 대기 · 최근 활동)
    expect(html.match(/id="admin-dashboard-tab-/g)).toHaveLength(7);
    expect(html.match(/role="tab"/g)).toHaveLength(9);
    expect(html).toMatch(/id="admin-dashboard-tab-finance"[^>]*aria-selected="true"/);
    expect(html).toContain('id="admin-dashboard-panel-finance"');
    expect(html).toContain('id="action-center"');
    expect(html).toContain('data-admin-dashboard-side="pending"');
    expect(html).toContain("Recent activity");
    expect(html).toContain('data-admin-pending-item="user_charges"');
    expect(html).toMatch(/data-admin-pending-total="1"[^>]*>Total 3</);
    expect(html).toContain('data-admin-dashboard-status="1"');
    expect(html).toContain("17:27 PHT");
    expect(html).toMatch(/data-admin-dashboard-refresh="1"[^>]*>Refresh</);
    expect(html.match(/data-admin-dashboard-period-option=/g)).toHaveLength(4);
    expect(html).toMatch(/aria-pressed="true"[^>]*data-admin-dashboard-period-option="today"/);
    expect(html.match(/data-admin-dashboard-shortcut=/g)).toHaveLength(2);
  });

  it("기간 ?period= — 선택 표시 · 기간 지표 칩 = 선택 기간, 현재/오늘 고정 칩", () => {
    search = "tab=finance&period=7d";
    const html = renderToStaticMarkup(<AdminDashboardView initial={initial()} />);
    expect(html).toContain('data-admin-dashboard-period="7d"');
    expect(html).toMatch(/aria-pressed="true"[^>]*data-admin-dashboard-period-option="7d"/);
    expect(html).toMatch(/data-admin-metric-tile="finance.commission_net"[\s\S]*?data-admin-metric-period-chip="1">7 days</);
    expect(html).toMatch(/data-admin-metric-tile="finance.cash_in_today"[\s\S]*?data-admin-metric-period-chip="1">Today</);
    expect(html).toMatch(/data-admin-metric-tile="points.waiting_confirm"[\s\S]*?data-admin-metric-period-chip="1">Now</);
  });

  it("라벨이 보이는 숫자: 지표 칸 라벨 · 요약 띠 보조 지표 라벨(1024에서도 보임)", () => {
    search = "tab=finance";
    const html = renderToStaticMarkup(<AdminDashboardView initial={initial()} />);
    expect(html).toMatch(/data-admin-metric-tile="points.waiting_confirm"[\s\S]*?>points.waiting_confirm</);
    expect(html).toMatch(/class="block truncate text-\[12px\] leading-4 tabular-nums[^"]*" data-admin-band-secondary=/);
    expect(html).not.toMatch(/hidden truncate[^"]*data-admin-band-secondary/);
  });

  it("두 해상도 예산: 1024×768(띠 72·우 316·행 44) / 1280×800(≥1280: 띠 80·우 344·행 48)", () => {
    search = "tab=finance";
    const html = renderToStaticMarkup(<AdminDashboardView initial={initial()} />);
    expect(html).toMatch(/data-admin-dashboard-band="1" class="[^"]*grid-cols-8[^"]*h-\[72px\][^"]*|data-admin-dashboard-band="1" class="[^"]*h-\[72px\][^"]*grid-cols-8/);
    expect(html).toContain("min-[1280px]:h-20");
    expect(html).toContain("grid-cols-[minmax(0,1fr)_316px]");
    expect(html).toContain("min-[1280px]:grid-cols-[minmax(0,1fr)_344px]");
    expect(html).not.toContain("min-[1200px]");
    // 페이지 스크롤 0: 루트 h-full + 본문만 overflow-y-auto(높이 부족 시), 오른쪽 목록 내부 스크롤
    expect(html).toMatch(/data-admin-dashboard="v4"[^>]*class="flex h-full min-h-0 flex-col"/);
    expect(html).toMatch(/data-admin-dashboard-body="1" class="[^"]*min-h-0 flex-1 overflow-y-auto/);
    expect(html).toContain('class="min-h-0 flex-1 overflow-y-auto" data-admin-dashboard-pending-list="1"');
    expect(html).toContain("h-11");
    expect(html).toContain("min-[1280px]:h-12");
    // 지표 3×2 · 추세 최소 160 · 축
    expect(html).toContain("grid shrink-0 grid-cols-3");
    expect(html).toContain("min-h-[160px]");
    expect(html).toContain('data-admin-trend-y-axis="1"');
    // 추세 창 = 선택 기간이 끝나는 날까지 (PHT 날짜 표시)
    expect(html).toContain('data-admin-trend-window="2026-10-14~2026-10-20"');
    expect(html).toContain("10-14 – 10-20 · 7 days");
    // 1024 짧은 라벨 / 1280 긴 라벨 둘 다 있음 (Provider 없는 렌더 = 기본 언어 en)
    expect(html).toContain(">Pay<");
    expect(html).toContain(">Payments<");
  });

  it("지표 칸: 단위(건·명·곳 / ₱) · 이동 화살표 · 요약 띠 「현재」 칩 · 공지 블록", () => {
    search = "tab=finance";
    const init = initial();
    init.notices = {
      href: "/admin/app/notices",
      items: [
        { id: "n1", title: "점검 안내", contentType: "notice", state: "published", at: "2026-10-19T01:00:00Z", href: "/admin/app/notices/n1" },
        { id: "n2", title: "예약 공지", contentType: "notice", state: "scheduled", at: null, href: "/admin/app/notices/n2" },
      ],
    };
    const html = renderToStaticMarkup(<AdminDashboardView initial={init} />);
    // 이동 가능한 지표 칸마다 화살표
    expect(html.match(/data-admin-metric-arrow="1"/g)).toHaveLength(4);
    // 건수 단위 (기본 언어 en = 단위 문자 없음 → 단위 칸 없음), ₱ 는 값 앞
    expect(html).toMatch(/data-admin-metric-value="finance.cash_in_today"[^>]*>₱5</);
    // 요약 띠 primary 칩 — 현재 상태 지표에도 「Now」
    expect(html).toMatch(/data-admin-band-tile="members"[\s\S]*?data-admin-metric-period-chip="1">Now</);
    // 공지 블록 — 실제 공지 항목·상세 링크·전체 보기
    expect(html).toContain('data-admin-dashboard-notices="1"');
    expect(html).toContain('data-admin-notice-item="n1"');
    expect(html).toContain('href="/admin/app/notices/n1"');
    expect(html).toContain("Scheduled");
    expect(html).toContain('href="/admin/app/notices"');
  });

  it("실패: 이전 값 + 「불러오기 실패」, 이전 값 없으면 「—」 (0 아님)", () => {
    search = "tab=finance";
    const html = renderToStaticMarkup(<AdminDashboardView initial={initial()} />);
    expect(html).toMatch(/data-admin-metric-value="finance.commission_outstanding"[^>]*>₱123.45</);
    expect(html).toMatch(/data-admin-metric-value="finance.commission_net"[^>]*>—</);
    expect(html.match(/data-admin-metric-failed="1"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Failed to load");
  });

  it("데이터 전 탭: 처리 대기 로딩 문구, 0 을 그리지 않는다, 갱신 시각 —", () => {
    search = "tab=support";
    const html = renderToStaticMarkup(<AdminDashboardView initial={{ band: [] }} />);
    expect(html).toContain('data-admin-dashboard-tab="support"');
    expect(html).toContain("Loading");
    expect(html).not.toContain("data-admin-metric-value");
    expect(html).toMatch(/data-admin-dashboard-updated="1">Updated —</);
  });
});
