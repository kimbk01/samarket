/**
 * DIBAY INTRO — 12th reconstruction
 * Draft 409 conflict recovery tests ONLY.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDraftConflictInfo,
  draftVersionAfterAuthorityReload,
  isDraftConflictBlockingWrites,
  isDraftVersionConflictStatus,
} from "@/lib/intro/document/draft-conflict";

const studio = readFileSync(
  "components/admin/intro/IntroStudio.tsx",
  "utf8",
);
const apiClient = readFileSync(
  "components/admin/intro/introDocumentApi.ts",
  "utf8",
);
const saveRoute = readFileSync(
  "app/api/admin/intro/documents/[documentId]/route.ts",
  "utf8",
);
const saveService = readFileSync("lib/intro/document/service.ts", "utf8");

describe("Draft 409 — helpers", () => {
  it("detects 409 status", () => {
    expect(isDraftVersionConflictStatus(409)).toBe(true);
    expect(isDraftVersionConflictStatus(200)).toBe(false);
  });

  it("builds conflict info without inventing overwrite", () => {
    const info = buildDraftConflictInfo({
      localExpectedDraftVersion: 5,
      serverDraftVersionFrom409: 6,
    });
    expect(info).toEqual({
      localExpectedDraftVersion: 5,
      serverDraftVersion: 6,
    });
  });

  it("recovery adopts server draftVersion", () => {
    expect(draftVersionAfterAuthorityReload(6)).toBe(6);
    expect(() => draftVersionAfterAuthorityReload(0)).toThrow();
  });

  it("conflict blocks writes until resolved", () => {
    expect(
      isDraftConflictBlockingWrites("conflict", {
        localExpectedDraftVersion: 5,
        serverDraftVersion: 6,
      }),
    ).toBe(true);
    expect(isDraftConflictBlockingWrites("dirty", null)).toBe(false);
  });
});

describe("Draft 409 — server CAS unchanged", () => {
  it("Save uses expectedDraftVersion CAS and returns currentDraftVersion on conflict", () => {
    expect(saveService).toContain(".eq(\"draft_version\", args.expectedDraftVersion)");
    expect(saveService).toContain("DocumentConflictError");
    expect(saveRoute).toContain("DRAFT_VERSION_CONFLICT");
    expect(saveRoute).toContain("currentDraftVersion");
    expect(saveRoute).toContain("status: 409");
    expect(apiClient).toContain("status: 409");
    expect(apiClient).toContain("currentDraftVersion");
  });
});

describe("Draft 409 — Admin recovery contract", () => {
  it("never retries blindly while conflict open", () => {
    expect(studio).toContain("conflictBlocksWrites");
    expect(studio).toContain("Never retry blindly");
    expect(studio).toContain("isDraftVersionConflictStatus");
  });

  it("keeps local edits and does not mark saved on 409", () => {
    expect(studio).toContain("setDirty(true)");
    expect(studio).toContain('setSaveUi("conflict")');
    expect(studio).toContain("저장되지 않았습니다");
    expect(studio).toContain("로컬 편집은 유지됩니다");
  });

  it("fetches authoritative Draft after 409", () => {
    // After 409, GET current document for server version
    const idx = studio.indexOf("isDraftVersionConflictStatus(res.status)");
    const slice = studio.slice(idx, idx + 800);
    expect(slice).toContain("getIntroDocumentApi(documentId)");
    expect(slice).toContain("buildDraftConflictInfo");
  });

  it("presents conflict UI with reload CTA", () => {
    expect(studio).toContain('data-intro-draft-conflict="1"');
    expect(studio).toContain("data-intro-draft-conflict-reload");
    expect(studio).toContain("서버 최신 초안 불러오기");
    expect(studio).toContain("onReloadAuthoritativeDraft");
    expect(studio).toContain("draftVersionAfterAuthorityReload");
  });

  it("Publish and Service Apply blocked during conflict", () => {
    // Save / Publish / Service Apply all gate on conflictBlocksWrites in disabled=
    const saveBlock = studio.slice(
      studio.lastIndexOf("disabled={", studio.indexOf('data-intro-save="1"')),
      studio.indexOf('data-intro-save="1"'),
    );
    const publishBlock = studio.slice(
      studio.lastIndexOf("disabled={", studio.indexOf('data-intro-publish="1"')),
      studio.indexOf('data-intro-publish="1"'),
    );
    const setLiveBlock = studio.slice(
      studio.lastIndexOf(
        "disabled={",
        studio.indexOf('data-intro-set-live="1"'),
      ),
      studio.indexOf('data-intro-set-live="1"'),
    );
    expect(saveBlock).toContain("conflictBlocksWrites");
    expect(publishBlock).toContain("conflictBlocksWrites");
    expect(setLiveBlock).toContain("conflictBlocksWrites");
  });

  it("does not hardcode Service Apply / Live identities in this change", () => {
    expect(studio).not.toContain("4b5cf115-3ede-45a6-b6dd-a255915a9158");
    expect(studio).toContain("getIntroDocumentAuthorityApi");
  });
});
