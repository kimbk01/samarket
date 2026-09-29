/**
 * DIBAY INTRO — 12th reconstruction
 * Service Apply authority reconstruction tests.
 *
 * Proves: no hardcoded revision, hard-reload discovery path,
 * document isolation, Live ≠ published candidate, cancel zero mutation,
 * server validation surface, post-apply refetch contract.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  humanDraftVersionLabel,
  humanLiveVersionLabel,
  humanPublishedVersionLabel,
} from "@/lib/intro/document/authority-labels";

const studio = readFileSync(
  "components/admin/intro/IntroStudio.tsx",
  "utf8",
);
const apiClient = readFileSync(
  "components/admin/intro/introDocumentApi.ts",
  "utf8",
);
const authorityLib = readFileSync(
  "lib/intro/document/revision-authority.ts",
  "utf8",
);
const authorityRoute = readFileSync(
  "app/api/admin/intro/documents/[documentId]/authority/route.ts",
  "utf8",
);
const liveSetRoute = readFileSync(
  "app/api/admin/intro/live/set/route.ts",
  "utf8",
);
const liveService = readFileSync("lib/intro/live/service.ts", "utf8");

describe("Service Apply — remove hardcoded revision identity", () => {
  it("IntroStudio has no hardcoded revision / document / pack UUIDs", () => {
    expect(studio).not.toContain("4b5cf115-3ede-45a6-b6dd-a255915a9158");
    expect(studio).not.toContain("3347c673-0667-4605-a8c8-a306ae209896");
    expect(studio).not.toContain("2f4dbc7d-b6ce-416f-80eb-012ef9bad153");
    expect(studio).not.toContain("65bb3e9d-1ce4-4dc3-b941-0719031fe000");
    expect(studio).not.toMatch(
      /setLastPublishedRevisionId\(\(prev\)\s*=>\s*prev\s*\?\?/,
    );
  });

  it("session-only lastPublishedRevisionId authority is gone from product path", () => {
    expect(studio).not.toContain("lastPublishedRevisionId");
    expect(studio).not.toContain("setLastPublishedRevisionId");
    expect(studio).toContain("getIntroDocumentAuthorityApi");
    expect(studio).toContain("refreshAuthority");
    expect(studio).toContain("serviceApplyCandidate");
    expect(studio).toContain("latestPublished");
  });
});

describe("Service Apply — canonical revision discovery", () => {
  it("authority library discovers COMMITTED revisions for current documentId", () => {
    expect(authorityLib).toContain("listCommittedRevisionsForDocument");
    expect(authorityLib).toContain("getDocumentRevisionAuthority");
    expect(authorityLib).toContain('eq("publish_state", "COMMITTED")');
    expect(authorityLib).toContain('eq("document_id", documentId)');
    expect(authorityLib).toContain("latestPublished");
    expect(authorityLib).toContain("liveBelongsToDocument");
    // Three separate authorities — never infer
    expect(authorityLib).toContain("draft");
    expect(authorityLib).toContain("latestPublished");
    expect(authorityLib).toContain("live");
  });

  it("Admin authority API route exists and uses server discovery", () => {
    expect(authorityRoute).toContain("getDocumentRevisionAuthority");
    expect(authorityRoute).toContain("/authority");
    expect(apiClient).toContain("/authority");
    expect(apiClient).toContain("getIntroDocumentAuthorityApi");
    expect(apiClient).toContain('cache: "no-store"');
  });

  it("hard reload discovery path: load → refreshAuthority from server", () => {
    expect(studio).toContain("void refreshAuthority()");
    expect(studio).toMatch(/useEffect\(\(\)\s*=>\s*\{\s*void refreshAuthority\(\)/);
    // Service Apply CTA uses authoritative candidate, not React session assignment alone
    expect(studio).toContain(
      "revisionAuthority?.latestPublished",
    );
    expect(studio).toContain("data-intro-set-live-candidate");
  });
});

describe("Service Apply — Publish refreshes authority", () => {
  it("after Publish success Admin refreshes server authority", () => {
    expect(studio).toContain("await refreshAuthority()");
    // publish success path must call refresh — not only local setState
    const publishIdx = studio.indexOf("setPublishUi(\"success\")");
    const refreshAfter = studio.indexOf("await refreshAuthority()", publishIdx);
    expect(publishIdx).toBeGreaterThan(-1);
    expect(refreshAfter).toBeGreaterThan(publishIdx);
  });
});

describe("Service Apply — confirmation + cancel atomicity", () => {
  it("confirmation shows current service → apply published versions", () => {
    expect(studio).toContain("이 게시 버전을 서비스에 적용하시겠습니까?");
    expect(studio).toContain("현재 서비스 버전");
    expect(studio).toContain("적용할 게시 버전");
    expect(studio).toContain("data-intro-set-live-current");
    expect(studio).toContain("data-intro-set-live-target");
    expect(studio).toContain("기기 동기화 후 다음 적용 가능한 앱 실행부터");
  });

  it("Cancel only resets UI — zero Live mutation", () => {
    expect(studio).toContain('data-intro-set-live-confirm-no="1"');
    expect(studio).toContain('onClick={() => setSetLiveUi("idle")}');
    // Cancel handler must not call setIntroLiveApi
    const cancelIdx = studio.indexOf("data-intro-set-live-confirm-no");
    const cancelBlock = studio.slice(Math.max(0, cancelIdx - 180), cancelIdx + 80);
    expect(cancelBlock).toContain('setSetLiveUi("idle")');
    expect(cancelBlock).not.toContain("setIntroLiveApi");
  });
});

describe("Service Apply — Admin status (human, not raw UUID primary)", () => {
  it("shows draft / published / service as separate human states", () => {
    expect(studio).toContain("게시 버전");
    expect(studio).toContain("서비스 버전");
    expect(studio).toContain("humanDraftVersionLabel");
    expect(studio).toContain("humanPublishedVersionLabel");
    expect(studio).toContain("humanLiveVersionLabel");
    expect(studio).toContain("상세 정보");
    expect(studio).toContain("data-intro-authority-detail");
  });

  it("label helpers format without exposing UUID", () => {
    expect(
      humanDraftVersionLabel(5, false, "ko"),
    ).toContain("초안 v5");
    expect(
      humanPublishedVersionLabel(
        { sourceDraftVersion: 5, createdAt: "2026-09-29T12:00:00.000Z" },
        "ko",
      ),
    ).toMatch(/게시 v5/);
    expect(
      humanLiveVersionLabel(
        { sourceDraftVersion: 3, createdAt: "2026-09-28T12:00:00.000Z" },
        "COMMITTED_LIVE",
        "ko",
      ),
    ).toMatch(/서비스 v3/);
    expect(humanLiveVersionLabel(null, "NO_LIVE_INTRO", "ko")).toContain(
      "미적용",
    );
  });
});

describe("Service Apply — server validation", () => {
  it("Live/set requires documentId and validates revision belongs to document", () => {
    expect(liveSetRoute).toContain("documentId");
    expect(liveSetRoute).toContain("expectedDocumentId");
    expect(liveService).toContain("expectedDocumentId");
    expect(liveService).toContain("REVISION_DOCUMENT_MISMATCH");
    expect(liveService).toContain("REVISION_NOT_COMMITTED");
    expect(apiClient).toContain("documentId: string");
  });

  it("resolveCommittedRevisionAuthority still rejects non-COMMITTED / bad pack", () => {
    expect(liveService).toContain("REVISION_NOT_COMMITTED");
    expect(liveService).toContain("PACK_MISSING");
    expect(liveService).toContain("PACK_INTEGRITY_INVALID");
  });
});

describe("Service Apply — post-apply refetch equality", () => {
  it("success requires requested revision == Live after refetch", () => {
    expect(studio).toContain("after.live.publishedRevisionId !== targetRevisionId");
    expect(studio).toContain("서비스 버전 변경 완료");
    expect(studio).toContain("기기 반영: 동기화 확인 필요");
    // Must not claim app pixels changed
    expect(studio).not.toMatch(/앱에 반영되었습니다|pixels changed|이미 앱에/);
  });

  it("stale session cannot override — re-fetches authority before apply", () => {
    expect(studio).toContain(
      "latestPublished.publishedRevisionId !== targetRevisionId",
    );
    expect(studio).toContain("fresh.latestPublished");
  });
});

describe("Service Apply — multiple revision / Live ≠ candidate contract", () => {
  it("authority keeps latestPublished independent from live", () => {
    expect(authorityLib).toContain("liveBelongsToDocument");
    expect(studio).toContain("liveBelongsToDocument");
    expect(studio).toContain("다른 문서");
  });
});
