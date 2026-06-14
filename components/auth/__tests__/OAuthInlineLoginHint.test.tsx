import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OAuthInlineLoginHint } from "@/components/auth/OAuthInlineLoginHint";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    t: (key: string) => {
      if (key === "auth_oauth_signing_in_hint") return "Preparing sign-in…";
      if (key === "auth_oauth_return_hint") return "Return after browser sign-in.";
      return key;
    },
  }),
}));

describe("OAuthInlineLoginHint", () => {
  it("renders nothing for idle and opening", () => {
    expect(renderToStaticMarkup(<OAuthInlineLoginHint status="idle" />)).toBe("");
    expect(renderToStaticMarkup(<OAuthInlineLoginHint status="opening" />)).toBe("");
  });

  it("renders preparing hint", () => {
    const html = renderToStaticMarkup(<OAuthInlineLoginHint status="preparing" />);
    expect(html).toContain("Preparing sign-in…");
  });

  it("renders awaiting_return hint", () => {
    const html = renderToStaticMarkup(<OAuthInlineLoginHint status="awaiting_return" />);
    expect(html).toContain("Return after browser sign-in.");
  });
});
