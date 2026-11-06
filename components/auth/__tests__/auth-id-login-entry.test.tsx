import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { authUiMessages } from "@/lib/i18n/catalog/auth-ui";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    t: (key: string) => (authUiMessages.ko as Record<string, string>)[key] ?? key,
  }),
}));

import { AuthIdLoginEntry } from "@/components/auth/AuthIdLoginEntry";

describe("AuthIdLoginEntry (Owner 2026-11-07)", () => {
  it("shows the always-visible ID sign-in entry with the issued-accounts-only hint", () => {
    const html = renderToStaticMarkup(
      <AuthIdLoginEntry expanded={false} controlsId="panel-1" onOpen={() => undefined} />,
    );
    expect(html).toContain("아이디로 로그인");
    expect(html).toContain("발급받은 계정 전용 · 신규 가입 불가");
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="panel-1"');
    expect(html).toContain("min-h-11");
    expect(html).not.toContain("aria-hidden");
  });

  it("reports expanded state for assistive tech", () => {
    const html = renderToStaticMarkup(
      <AuthIdLoginEntry expanded controlsId="panel-1" onOpen={() => undefined} />,
    );
    expect(html).toContain('aria-expanded="true"');
  });

  it("copy never offers sign-up or admin access", () => {
    for (const locale of ["ko", "en"] as const) {
      const m = authUiMessages[locale] as Record<string, string>;
      const text = `${m.auth_login_with_id} ${m.auth_login_with_id_hint}`;
      expect(text).not.toMatch(/관리자|운영|admin|operations/i);
    }
    expect(authUiMessages.en.auth_login_with_id_hint).toMatch(/No new sign-ups/);
  });
});
