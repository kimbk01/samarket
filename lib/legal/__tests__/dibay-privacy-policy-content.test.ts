import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DIBAY_PRIVACY_POLICY_CONTENT,
  DIBAY_PRIVACY_POLICY_VERSION,
} from "@/lib/legal/dibay-privacy-policy-content";

const root = path.resolve(__dirname, "../../..");

const FORBIDDEN = [
  "TODO",
  "TBD",
  "example.com",
  "example@",
  "010-0000",
  "123-456",
  "lorem ipsum",
  "placeholder",
];

describe("DIBAY privacy policy content (Play)", () => {
  it("has ko/en bodies with required section markers and no placeholders", () => {
    for (const locale of ["ko", "en"] as const) {
      const { title, body } = DIBAY_PRIVACY_POLICY_CONTENT[locale];
      expect(title.length).toBeGreaterThan(4);
      expect(body.length).toBeGreaterThan(2000);
      expect(body).toMatch(/support@dibay\.app/);
      expect(body).toMatch(/samarket\.vercel\.app\/privacy/);
      expect(body).toMatch(/Supabase/);
      expect(body).toMatch(/Agora/);
      expect(body).toMatch(/\/mypage\/section\/settings\/leave/);
      for (const bad of FORBIDDEN) {
        expect(body.toLowerCase()).not.toContain(bad.toLowerCase());
      }
    }
    expect(DIBAY_PRIVACY_POLICY_CONTENT.ko.body).toContain("처리하는 개인정보 항목");
    expect(DIBAY_PRIVACY_POLICY_CONTENT.ko.body).toContain("회원탈퇴");
    expect(DIBAY_PRIVACY_POLICY_CONTENT.en.body).toContain("Account deletion");
    expect(DIBAY_PRIVACY_POLICY_VERSION).toMatch(/^2026-04/);
  });

  it("privacy page wires CMS loader + content module; UI links stay on /privacy", () => {
    const page = readFileSync(path.join(root, "app/(main)/privacy/page.tsx"), "utf8");
    const client = readFileSync(path.join(root, "app/(main)/privacy/PrivacyPageClient.tsx"), "utf8");
    const menu = readFileSync(path.join(root, "lib/mypage/mypage-home-menu-config.ts"), "utf8");
    const consent = readFileSync(path.join(root, "components/auth/AuthConsentForm.tsx"), "utf8");
    const content = readFileSync(path.join(root, "lib/legal/dibay-privacy-policy-content.ts"), "utf8");
    expect(page).toContain("loadPublishedAppLegalDocument");
    expect(page).toContain("getDibayPrivacyPolicyFallback");
    expect(client).toContain('kind="privacy"');
    expect(client).toContain("staticFallbackByLocale");
    expect(menu).toContain('href: "/privacy"');
    expect(consent).toContain('href="/privacy"');
    expect(content).toContain("FALLBACK");
    expect(content).toContain("NOT a consent writer");
  });
});
