import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    language: "ko",
    t: (key: string) =>
      (
        ({
          admin_mock_tool_notice_backup: "모의 화면 — 실제 백업/복구는 수행되지 않습니다",
          admin_mock_tool_notice_automation: "모의 화면 — 실제 자동 실행은 수행되지 않습니다",
        }) as Record<string, string>
      )[key] ?? key,
    tt: (text: string) => text,
  }),
}));

import { AdminMySectionsView } from "../AdminMySectionsPage";
import { AdminMyServicesView } from "../AdminMyServicesPage";
import { AdminMyBannersView } from "../AdminMyBannersPage";
import { AdminMockToolNotice } from "@/components/admin/AdminMockToolNotice";
import type { AdminBanner } from "@/lib/types/admin-banner";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("V3-11 admin my-page screens", () => {
  it("sections: renders rows without the dead edit link and shows the edit-unavailable note", () => {
    const html = renderToStaticMarkup(
      <AdminMySectionsView
        title="섹션"
        loadingLabel="로딩"
        editUnavailableNote="편집 기능은 준비 중입니다"
        loading={false}
        error={null}
        items={[{ section_key: "trade", title: "나의 거래", is_active: true, sort_order: 2 }]}
      />
    );
    expect(html).toContain("나의 거래");
    expect(html).toContain("노출 · 순서 2");
    expect(html).toContain("편집 기능은 준비 중입니다");
    expect(html).not.toContain("/edit");
    expect(html).not.toContain("<a ");
  });

  it("services: renders rows without dead add/edit links", () => {
    const html = renderToStaticMarkup(
      <AdminMyServicesView
        title="서비스"
        loadingLabel="로딩"
        editUnavailableNote="편집 기능은 준비 중입니다"
        loading={false}
        error={null}
        items={[
          {
            code: "coupon",
            label: "쿠폰",
            icon_key: "coupon",
            href: "/my/coupons",
            is_active: false,
            sort_order: 3,
            admin_only: false,
            country_code: null,
          },
        ]}
      />
    );
    expect(html).toContain("쿠폰");
    expect(html).toContain("숨김 · 3");
    expect(html).not.toContain("/admin/my/services/create");
    expect(html).not.toContain("<a ");
  });

  it("banners: keeps existing create/edit routes and maps API status/priority", () => {
    const banner = { id: "b1", title: "배너1", status: "active", priority: 4 } as AdminBanner;
    const html = renderToStaticMarkup(
      <AdminMyBannersView title="배너" loadingLabel="로딩" loading={false} error={null} items={[banner]} />
    );
    expect(html).toContain("배너1");
    // Admin IA R1 (감사 AD-01·UX): 표 + 상태 배지(레지스트리 문구) · 순서 열 · 삭제 버튼(onRemove 있을 때만)
    expect(html).toContain("data-admin-my-banners-table");
    expect(html).toContain("admin_banners_status_active");
    expect(html).toContain(">4<");
    expect(html).toContain('href="/admin/my/banners/create"');
    expect(html).toContain('href="/admin/my/banners/b1/edit"');
    expect(html).not.toContain(">삭제<");
    const withRemove = renderToStaticMarkup(
      <AdminMyBannersView
        title="배너"
        loadingLabel="로딩"
        loading={false}
        error={null}
        items={[banner]}
        onRemove={() => {}}
      />
    );
    expect(withRemove).toContain(">삭제<");
  });

  it("pages read through admin APIs, not the browser Supabase client", () => {
    for (const f of ["AdminMyBannersPage", "AdminMySectionsPage", "AdminMyServicesPage"]) {
      const src = read(`components/admin/my/${f}.tsx`);
      expect(src).not.toContain("getSupabaseClient");
      expect(src).toMatch(/fetch\("\/api\/admin\/(banners|my\/sections|my\/services)"/);
    }
  });
});

describe("모의 화면 표기 (설계 v4 §8)", () => {
  it("renders the mock notice text", () => {
    const html = renderToStaticMarkup(<AdminMockToolNotice tool="backup" />);
    expect(html).toContain("모의 화면 — 실제 백업/복구는 수행되지 않습니다");
    expect(html).toContain('data-admin-mock-tool-notice="backup"');
  });

  it.each([
    ["backup", "backup"],
    ["dr", "dr"],
    ["automation", "automation"],
    ["production-migration", "production_migration"],
  ])("/admin/%s layout shows the notice inside the super-admin gate", (seg, kind) => {
    const src = read(`app/admin/${seg}/layout.tsx`);
    expect(src).toContain("<SuperAdminOnlyPageGate>");
    expect(src).toContain(`<AdminMockToolNotice tool="${kind}" />`);
  });
});
