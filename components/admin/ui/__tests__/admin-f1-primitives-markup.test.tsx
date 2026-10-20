import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import { AdminDetailDrawer } from "@/components/admin/ui/AdminDetailDrawer";

let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/admin/sample",
  useSearchParams: () => new URLSearchParams(search),
}));

const TABS = [
  { id: "all", label: "전체", count: 1234 },
  { id: "open", label: "처리 대기", count: 0 },
  { id: "done", label: "완료" },
];

describe("AdminTabs markup", () => {
  it("주소 ?tab= 값을 선택 · 건수 배지(en-PH) · role=tablist/tab · 높이 40", () => {
    search = "tab=open";
    const html = renderToStaticMarkup(<AdminTabs tabs={TABS} ariaLabel="목록" idBase="t" />);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="목록"');
    expect(html).toContain("h-10");
    expect(html).toContain("overflow-x-auto");
    expect(html).toMatch(/id="t-tab-open"[^>]*aria-selected="true"[^>]*tabindex="0"/);
    expect(html).toMatch(/id="t-tab-all"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
    expect(html).toContain(">1,234<");
    expect(html).toContain(">0<");
    expect(html.match(/data-admin-tab-count/g)).toHaveLength(2);
    expect(html).toContain('aria-controls="t-panel-open"');
  });

  it("모르는 탭 값 → defaultValue, 제어형 value 우선", () => {
    search = "tab=bogus";
    expect(renderToStaticMarkup(<AdminTabs tabs={TABS} ariaLabel="x" idBase="t" defaultValue="done" />)).toMatch(
      /id="t-tab-done"[^>]*aria-selected="true"/
    );
    search = "tab=open";
    expect(renderToStaticMarkup(<AdminTabs tabs={TABS} ariaLabel="x" idBase="t" value="all" />)).toMatch(
      /id="t-tab-all"[^>]*aria-selected="true"/
    );
  });
});

describe("AdminFilterBar markup", () => {
  it("순서: 기간 → 상태 → 도메인 → 검색어 → 조회/초기화", () => {
    const html = renderToStaticMarkup(
      <AdminFilterBar
        ko
        draft={{ q: "abc", from: "2026-10-01", to: "2026-10-20" }}
        onDraftChange={() => {}}
        onSubmit={() => {}}
        onReset={() => {}}
        status={{ value: "pending", onChange: () => {}, options: [{ value: "pending", label: "대기" }] }}
      >
        <span data-domain-slot="1">도메인</span>
      </AdminFilterBar>
    );
    const order = [
      'data-admin-filter-period="1"',
      'data-admin-filter-status="1"',
      'data-admin-filter-domain="1"',
      'name="q"',
      'data-admin-filter-submit="1"',
      'data-admin-filter-reset="1"',
    ].map((s) => html.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('role="search"');
    expect(html).toContain('type="submit"');
    expect(html).toContain(">조회<");
    expect(html).toContain(">초기화<");
    expect(html).toContain(">전체<"); // 상태 「전체」 자동 추가
    expect(html).toContain('value="2026-10-01"');
    expect(html).toContain("text-[16px]");
  });

  it("상태·기간·검색 숨김", () => {
    const html = renderToStaticMarkup(
      <AdminFilterBar
        ko={false}
        draft={{ q: "", from: "", to: "" }}
        onDraftChange={() => {}}
        onSubmit={() => {}}
        onReset={() => {}}
        showPeriod={false}
        showSearch={false}
      />
    );
    expect(html).not.toContain("data-admin-filter-period");
    expect(html).not.toContain("data-admin-filter-status");
    expect(html).not.toContain('name="q"');
    expect(html).toContain(">Search<");
  });
});

describe("AdminPagination markup", () => {
  it("요약 · 번호 7칸 · 현재 쪽 · 크기 선택", () => {
    const html = renderToStaticMarkup(
      <AdminPagination ko page={5} size={50} total={1234} onPageChange={() => {}} onSizeChange={() => {}} />
    );
    expect(html).toContain("전체 1,234건 중 201–250");
    expect(html).toMatch(/aria-current="page"[^>]*>5</);
    expect(html.match(/…/g)).toHaveLength(2);
    expect(html).toContain('data-admin-pagination-size="1"');
    expect(html).toContain(">20건<");
    expect(html).toContain(">100건<");
    expect(html).toContain("justify-end");
  });

  it("1쪽 · 0건 → 이전/다음 비활성", () => {
    const html = renderToStaticMarkup(<AdminPagination ko page={1} size={20} total={0} onPageChange={() => {}} />);
    expect(html).toContain("전체 0건");
    expect(html.match(/disabled=""/g)?.length).toBe(2);
    expect(html).not.toContain("data-admin-pagination-size");
  });
});

describe("AdminStatusLabel markup", () => {
  it("등록 코드 → 라벨·톤, 미등록 → 「알 수 없는 상태」", () => {
    const ok = renderToStaticMarkup(<AdminStatusLabel ko code="in_progress" />);
    expect(ok).toContain(">진행 중<");
    expect(ok).toContain('data-admin-tone="progress"');
    expect(ok).toContain('data-admin-status-known="1"');
    const unknown = renderToStaticMarkup(<AdminStatusLabel ko={false} code="weird_code" />);
    expect(unknown).toContain(">Unknown status<");
    expect(unknown).toContain('data-admin-status-code="weird_code"');
    expect(unknown).not.toContain(">weird_code<");
  });
});

describe("AdminDetailDrawer markup (SSR 인라인)", () => {
  it("닫힘 → 없음, 열림 → 머리글·본문·하단 작업(위험 왼쪽·주요 오른쪽)", () => {
    expect(
      renderToStaticMarkup(
        <AdminDetailDrawer open={false} onClose={() => {}} ko title="상세">
          본문
        </AdminDetailDrawer>
      )
    ).toBe("");
    const html = renderToStaticMarkup(
      <AdminDetailDrawer
        open
        onClose={() => {}}
        ko
        title="주문 상세"
        subtitle="부제"
        dangerActions={<button type="button">삭제</button>}
        primaryActions={<button type="button">승인</button>}
      >
        본문
      </AdminDetailDrawer>
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("md:w-[min(720px,50vw)]");
    expect(html).toContain(">주문 상세<");
    expect(html).toContain("overflow-y-auto");
    expect(html.indexOf('data-admin-detail-drawer-danger="1"')).toBeLessThan(html.indexOf('data-admin-detail-drawer-primary="1"'));
    expect(html.indexOf(">삭제<")).toBeLessThan(html.indexOf(">승인<"));
  });
});
