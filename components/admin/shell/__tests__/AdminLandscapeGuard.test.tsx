import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_LANDSCAPE_GUARD_MEDIA_QUERY,
  AdminLandscapeGuard,
} from "@/components/admin/shell/AdminLandscapeGuard";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    language: "ko",
    t: (key: string) =>
      (
        {
          admin_landscape_guard_title: "관리자 화면은 태블릿 가로 또는 PC에서 사용합니다",
          admin_landscape_guard_desc: "기기를 가로로 돌리거나 브라우저 창을 넓혀 주세요",
          admin_landscape_guard_logout: "로그아웃",
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("AdminLandscapeGuard — 설계 v4 §2-2 A층", () => {
  const html = renderToStaticMarkup(
    <AdminLandscapeGuard>
      <form data-testid="admin-work-form">
        <input name="draft" defaultValue="작성 중" />
      </form>
    </AdminLandscapeGuard>
  );

  it("작업 화면을 언마운트하지 않고 가드와 함께 렌더한다", () => {
    expect(html).toContain('data-admin-landscape-content="1"');
    expect(html).toContain('data-testid="admin-work-form"');
    expect(html).toContain('value="작성 중"');
  });

  it("안내 화면: 제목·회전 안내·로그아웃", () => {
    expect(html).toContain('data-admin-landscape-guard="1"');
    expect(html).toContain("관리자 화면은 태블릿 가로 또는 PC에서 사용합니다");
    expect(html).toContain("기기를 가로로 돌리거나 브라우저 창을 넓혀 주세요");
    expect(html).toContain("로그아웃");
    expect(html.indexOf("admin-work-form")).toBeLessThan(html.indexOf("admin-landscape-guard"));
  });

  it("CSS 미디어 쿼리(하이드레이션 전 적용)와 JS inert 쿼리가 같고, 작업 화면은 visibility 로만 가린다", () => {
    expect(ADMIN_LANDSCAPE_GUARD_MEDIA_QUERY).toBe(
      "screen and (orientation: portrait), screen and (max-width: 1023px)"
    );
    const css = read("app/samarket-components.css");
    const block = css.slice(css.indexOf(`@media ${ADMIN_LANDSCAPE_GUARD_MEDIA_QUERY} {`));
    expect(block.startsWith("@media")).toBe(true);
    const body = block.slice(0, block.indexOf("\n}\n"));
    expect(body).toMatch(/\.admin-landscape-root__content\s*\{\s*visibility:\s*hidden;/);
    expect(body).not.toMatch(/display:\s*none/);
  });

  it("관리자 루트 레이아웃이 셸·접근 거부 경로를 모두 가드로 감싼다", () => {
    const layout = read("app/admin/layout.tsx");
    expect(layout).toContain("<AdminLandscapeGuard>{await renderAdminTree(children)}</AdminLandscapeGuard>");
    expect(layout).toContain("<AdminAccessDeniedPanel />");
  });
});
