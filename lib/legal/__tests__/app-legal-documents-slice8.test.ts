import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  pickCurrentPublishedLegalDoc,
  splitLegalBodyParagraphs,
  type AppLegalDocumentRow,
} from "@/lib/legal/app-legal-documents";

const root = path.resolve(__dirname, "../../..");

function row(partial: Partial<AppLegalDocumentRow> & Pick<AppLegalDocumentRow, "id" | "effective_at">): AppLegalDocumentRow {
  return {
    kind: "terms",
    locale: "ko",
    title: "t",
    body: "b",
    version: "v1",
    status: "published",
    published_at: "2026-04-01T00:00:00Z",
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    ...partial,
  };
}

describe("Slice8 Legal CMS Phase 1", () => {
  it("picks newest effective published document", () => {
    const now = Date.parse("2026-08-06T00:00:00Z");
    const picked = pickCurrentPublishedLegalDoc(
      [
        row({ id: "old", effective_at: "2026-01-01T00:00:00Z", version: "old" }),
        row({ id: "new", effective_at: "2026-06-01T00:00:00Z", version: "new" }),
        row({ id: "future", effective_at: "2027-01-01T00:00:00Z", version: "future" }),
      ],
      now,
    );
    expect(picked?.id).toBe("new");
  });

  it("splits body paragraphs on blank lines", () => {
    expect(splitLegalBodyParagraphs("a\n\nb\n\n\nc")).toEqual(["a", "b", "c"]);
  });

  it("public legal reader has no admin gate; admin writer requires requireAdminApiUser", () => {
    const pub = readFileSync(path.join(root, "app/api/legal/[kind]/route.ts"), "utf8");
    const admin = readFileSync(path.join(root, "app/api/admin/app-legal-documents/route.ts"), "utf8");
    expect(pub).not.toContain("requireAdminApiUser");
    expect(pub).toContain('status", "published"');
    expect(admin).toContain("requireAdminApiUser");
    expect(admin).toContain("app_legal_documents");
  });

  it("terms/privacy pages read CMS with i18n fallback; consent writer untouched", () => {
    const terms = readFileSync(path.join(root, "app/(main)/terms/TermsPageClient.tsx"), "utf8");
    const privacy = readFileSync(path.join(root, "app/(main)/privacy/PrivacyPageClient.tsx"), "utf8");
    const privacyPage = readFileSync(path.join(root, "app/(main)/privacy/page.tsx"), "utf8");
    const consent = readFileSync(path.join(root, "app/api/me/legal-consent/route.ts"), "utf8");
    expect(terms).toContain("LegalDocumentPageClient");
    expect(privacy).toContain('kind="privacy"');
    expect(privacyPage).toContain("loadPublishedAppLegalDocument");
    expect(consent).toContain("STORE_TERMS_VERSION");
    expect(consent).toContain("STORE_PRIVACY_VERSION");
    expect(consent).not.toContain("app_legal_documents");
  });

  it("notices routes are not rewritten by legal CMS", () => {
    const notices = readFileSync(path.join(root, "app/api/admin/app-notices/route.ts"), "utf8");
    expect(notices).toContain("app_notices");
    expect(notices).not.toContain("app_legal_documents");
  });
});
