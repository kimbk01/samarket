import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  allCriticalCapabilitiesProven,
  deriveOperationStatus,
  unprovenCapabilities,
} from "@/lib/external-board-import/catalog/capabilities";
import {
  COLLECT_GATE_DISABLED,
  COLLECT_GATE_NEEDS_CHECK,
  assertCatalogSectionCollectable,
  assertProductionCollectGate,
} from "@/lib/external-board-import/catalog/collect-gate";
import {
  assertWritableTranslationStatus,
  languageDisplayLabel,
  normalizeWritableTranslationStatus,
  resolveArticleSourceLanguage,
} from "@/lib/external-board-import/catalog/language";
import {
  PHILIPPINES_SOURCE_CATALOG,
  TOPIC_GROUP_ORDER,
  countAvailableCatalogSections,
  makeDerivedAvailableFixture,
  resolveCatalogSectionIdFromUrl,
} from "@/lib/external-board-import/catalog/source-catalog";
import { validateExternalBoardDocument } from "@/lib/external-board-import/document/ordered-document";

const root = process.cwd();

describe("CUT A source catalog SSOT", () => {
  it("includes golf + inventory sources; only proven sections may be available", () => {
    expect(TOPIC_GROUP_ORDER).toContain("golf");
    expect(PHILIPPINES_SOURCE_CATALOG.some((s) => s.sourceId === "nhcp")).toBe(true);
    expect(PHILIPPINES_SOURCE_CATALOG.some((s) => s.sourceId === "ncca")).toBe(true);
    expect(PHILIPPINES_SOURCE_CATALOG.some((s) => s.sourceId === "pia")).toBe(true);
    expect(PHILIPPINES_SOURCE_CATALOG.some((s) => s.sourceId === "bi")).toBe(true);
    expect(PHILIPPINES_SOURCE_CATALOG.some((s) => s.sourceId === "psa")).toBe(true);
    const kwf = PHILIPPINES_SOURCE_CATALOG.find((s) => s.sourceId === "kwf");
    expect(kwf?.sections[0]?.importKind).toBe("language_resource");
    const golf = PHILIPPINES_SOURCE_CATALOG.find((s) => s.sourceId === "dot")?.sections.find(
      (s) => s.sectionId === "dot-golfing"
    );
    expect(golf?.importKind).toBe("reference");
    expect(golf?.status).toBe("needs_check");
    const wiki = PHILIPPINES_SOURCE_CATALOG.find((s) => s.sourceId === "wikivoyage");
    expect(wiki?.sections.every((s) => s.status === "disabled")).toBe(true);
    for (const src of PHILIPPINES_SOURCE_CATALOG) {
      for (const sec of src.sections) {
        if (sec.status === "available") {
          expect(sec.adapterId).toBeTruthy();
          expect(sec.canonicalUrl).toBeTruthy();
        }
      }
    }
  });

  it("available is derived — never manual; fixture with all proven becomes available", () => {
    const derived = makeDerivedAvailableFixture();
    expect(derived.status).toBe("available");
    expect(allCriticalCapabilitiesProven(derived.capabilities)).toBe(true);
    expect(
      deriveOperationStatus({
        capabilities: unprovenCapabilities({ list: "proven" }),
        adapterId: "x",
        canonicalUrl: "https://example.com/a",
      })
    ).toBe("needs_check");
    expect(
      deriveOperationStatus({
        capabilities: derived.capabilities,
        adapterId: null,
        canonicalUrl: "https://example.com/a",
      })
    ).toBe("needs_check");
  });

  it("collect gate uses sectionId; disabled rejects; available DOT accepts", () => {
    const disabled = assertCatalogSectionCollectable("wikivoyage-philippines");
    expect(disabled.ok).toBe(false);
    if (!disabled.ok) {
      expect(disabled.failureCode).toBe("disabled");
      expect(disabled.failureMessage).toBe(COLLECT_GATE_DISABLED);
    }
    const ms = assertCatalogSectionCollectable("ms-reader");
    expect(ms.ok).toBe(false);
    if (!ms.ok) {
      expect(ms.failureCode).toBe("needs_check");
      expect(ms.failureMessage).toBe(COLLECT_GATE_NEEDS_CHECK);
    }
    const prodDot = assertProductionCollectGate(
      "https://www.tourism.gov.ph/destination/central-visayas/"
    );
    expect(prodDot.ok).toBe(true);
    if (prodDot.ok) expect(prodDot.sectionId).toBe("dot-central-visayas");
  });

  it("URL variants resolve to same sectionId", () => {
    const a = resolveCatalogSectionIdFromUrl(
      "https://www.tourism.gov.ph/destination/central-visayas/"
    );
    const b = resolveCatalogSectionIdFromUrl(
      "HTTPS://WWW.TOURISM.GOV.PH/destination/central-visayas"
    );
    expect(a).toBe("dot-central-visayas");
    expect(b).toBe("dot-central-visayas");
    const ms = resolveCatalogSectionIdFromUrl(
      "http://manilaseoul.co.kr/bbs_list.php?tb=board_reader"
    );
    expect(ms).toBe("ms-reader");
  });

  it("language labels + fallback; no draft_ko write; detected not fabricated", () => {
    expect(languageDisplayLabel("en")).toBe("영어");
    expect(languageDisplayLabel("fil")).toBe("필리핀어");
    expect(languageDisplayLabel("tl")).toBe("필리핀어");
    expect(languageDisplayLabel(null)).toBe("미확인");
    expect(
      resolveArticleSourceLanguage({
        explicit: null,
        adapterDeterministic: null,
        catalogDefault: "en",
      })
    ).toBe("en");
    expect(
      resolveArticleSourceLanguage({
        explicit: "ceb",
        catalogDefault: "en",
      })
    ).toBe("ceb");
    expect(normalizeWritableTranslationStatus("unsupported")).toBe("unsupported");
    expect(normalizeWritableTranslationStatus("none")).toBe("none");
    expect(normalizeWritableTranslationStatus("draft_ko")).toBe("unsupported");
    expect(() => assertWritableTranslationStatus("draft_ko")).toThrow();
  });

  it("image contract: feedThumbnailSrc separate; thumbnail role rejected on body image nodes", () => {
    const ok = validateExternalBoardDocument({
      title: "t",
      canonicalUrl: "https://example.com/a",
      feedThumbnailSrc: "https://example.com/thumb.jpg",
      nodes: [{ type: "image", src: "https://example.com/body.jpg", role: "body" }],
    });
    expect(ok.ok).toBe(true);
    const bad = validateExternalBoardDocument({
      title: "t",
      canonicalUrl: "https://example.com/a",
      nodes: [{ type: "image", src: "https://example.com/x.jpg", role: "thumbnail" }],
    });
    expect(bad.ok).toBe(false);
  });

  it("Admin UI has 4-step operator copy and no translation / developer jargon CTAs", () => {
    const ui = readFileSync(
      join(root, "components/admin/community/AdminExternalBoardImportPage.tsx"),
      "utf8"
    );
    expect(ui).toContain("1. 정보 소스 선택");
    expect(ui).toContain("2. 수집 범위 설정");
    expect(ui).toContain("3. 게시물 선택 및 변환");
    expect(ui).toContain("4. DIBAY 게시");
    expect(ui).toContain("최신순");
    expect(ui).toContain("오래된순");
    expect(ui).toContain("되돌리기");
    expect(ui).toContain("이미지 없음");
    expect(ui).toContain("선택 1건 게시");
    expect(ui).not.toContain("한국어 자동 번역");
    expect(ui).not.toContain("Source Catalog");
    for (const bad of ["MANUAL", "AUTO", "DISCOVER", "READY", "CPT", "REST", "writeDelta", "snapshot"]) {
      // Allow "MANUAL" only if not operator-facing — page must not show these as labels.
      if (bad === "MANUAL" || bad === "AUTO") {
        expect(ui).not.toMatch(new RegExp(`\\b${bad}\\b`));
      } else {
        expect(ui).not.toContain(bad);
      }
    }
  });

  it("draft route uses transformed/revert; publish failure path does not set edit_status", () => {
    const draft = readFileSync(
      join(root, "app/api/admin/community/external-board/articles/[id]/draft/route.ts"),
      "utf8"
    );
    expect(draft).toContain('edit_status: "transformed"');
    expect(draft).toContain('action === "revert"');
    expect(draft).not.toMatch(/^\s*source_document\s*:/m);
    expect(draft).not.toMatch(/^\s*source_title\s*:/m);
    const pub = readFileSync(
      join(root, "lib/external-board-import/publish/canonical-publisher.ts"),
      "utf8"
    );
    expect(pub).toContain('edit_status: "published"');
    expect(pub).toMatch(/markArticleFailed[\s\S]*ops_status: "failed"/);
    expect(pub).toMatch(/LOCK 6/);
  });
});
