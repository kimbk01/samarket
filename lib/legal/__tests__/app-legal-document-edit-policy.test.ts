import { describe, expect, it } from "vitest";
import {
  evaluateLegalDocumentPatch,
  isLegalVersionConflictError,
  legalBodySha256,
  legalDocAuditSnapshot,
} from "@/lib/legal/app-legal-document-edit-policy";
import type { AppLegalDocumentRow } from "@/lib/legal/app-legal-documents";

const NOW = "2026-10-18T12:00:00.000Z";

function doc(over: Partial<AppLegalDocumentRow> = {}): AppLegalDocumentRow {
  return {
    id: "d1",
    kind: "terms",
    locale: "ko",
    title: "이용약관",
    body: "본문 v1",
    version: "2026-04-store-review",
    status: "published",
    effective_at: "2026-04-01T00:00:00+00:00",
    published_at: "2026-08-06T09:13:49+00:00",
    created_at: "2026-08-06T09:13:49+00:00",
    updated_at: "2026-08-06T09:13:49+00:00",
    ...over,
  };
}

describe("Admin Legal CMS edit policy", () => {
  it("published: 'save draft' cannot unpublish (B13)", () => {
    const d = evaluateLegalDocumentPatch(doc(), { status: "draft", body: "x" }, NOW);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toBe("use_unpublish_action");
  });

  it("published: unpublish is an explicit, confirmed action", () => {
    expect(evaluateLegalDocumentPatch(doc(), { action: "unpublish" }, NOW).ok).toBe(false);
    const d = evaluateLegalDocumentPatch(doc(), { action: "unpublish", confirm: true }, NOW);
    expect(d.ok && d.action).toBe("unpublish");
    if (d.ok) expect(d.patch).toEqual({ updated_at: NOW, status: "draft" });
  });

  it("published: version / kind / locale / effective_at are immutable (B12)", () => {
    for (const input of [
      { version: "2026-11-v2" },
      { kind: "privacy" },
      { locale: "en" },
      { effective_at: "2026-12-01T00:00:00Z" },
    ]) {
      const d = evaluateLegalDocumentPatch(doc(), { ...input, status: "published", confirmNoReconsent: true }, NOW);
      expect(d.ok, JSON.stringify(input)).toBe(false);
      if (!d.ok) expect(d.error).toBe("published_identity_immutable");
    }
    // same instant in another format is not a change
    const same = evaluateLegalDocumentPatch(
      doc(),
      { effective_at: "2026-04-01T00:00:00.000Z", body: "본문 v1 수정", confirmNoReconsent: true },
      NOW,
    );
    expect(same.ok).toBe(true);
  });

  it("published: same-version body edit requires explicit no-re-consent confirmation and keeps it published", () => {
    const blocked = evaluateLegalDocumentPatch(doc(), { body: "오탈자 수정" }, NOW);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toBe("confirm_no_reconsent_required");
    const ok = evaluateLegalDocumentPatch(doc(), { body: "오탈자 수정", confirmNoReconsent: true }, NOW);
    expect(ok.ok && ok.action).toBe("edit_published_same_version");
    if (ok.ok) {
      expect(ok.patch).not.toHaveProperty("status");
      expect(ok.patch).not.toHaveProperty("version");
      expect(ok.patch).not.toHaveProperty("published_at");
    }
  });

  it("draft: save keeps draft; publish requires confirmation", () => {
    const draft = doc({ status: "draft", published_at: null });
    const saved = evaluateLegalDocumentPatch(draft, { body: "초안", version: "2026-11-v2" }, NOW);
    expect(saved.ok && saved.action).toBe("save_draft");
    if (saved.ok) expect(saved.patch.status).toBe("draft");
    expect(evaluateLegalDocumentPatch(draft, { status: "published" }, NOW).ok).toBe(false);
    const pub = evaluateLegalDocumentPatch(draft, { status: "published", confirm: true }, NOW);
    expect(pub.ok && pub.action).toBe("publish");
    if (pub.ok) {
      expect(pub.patch.status).toBe("published");
      expect(pub.patch.published_at).toBe(NOW);
    }
  });

  it("audit snapshot carries identity + body hash, never full text", () => {
    const snap = legalDocAuditSnapshot(doc())!;
    expect(snap.body_sha256).toBe(legalBodySha256("본문 v1"));
    expect(snap).not.toHaveProperty("body");
  });

  it("version conflict detection", () => {
    expect(isLegalVersionConflictError({ code: "23505" })).toBe(true);
    expect(isLegalVersionConflictError({ message: "other" })).toBe(false);
  });
});
