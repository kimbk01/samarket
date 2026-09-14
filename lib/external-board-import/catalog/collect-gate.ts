/**
 * Collect gate authority = canonical sectionId (not raw URL string equality).
 * URL is used only to resolve sectionId via normalize + catalog lookup.
 */

import {
  findCatalogSection,
  resolveCatalogSectionIdFromUrl,
  type CatalogSectionView,
} from "@/lib/external-board-import/catalog/source-catalog";
import { isFixtureExternalBoardUrl } from "@/lib/external-board-import/adapters/registry";

export const COLLECT_GATE_NEEDS_CHECK = "확인 필요 — 아직 수집할 수 없습니다.";
export const COLLECT_GATE_DISABLED = "사용 중지 — 현재 사용할 수 없습니다.";
export const COLLECT_GATE_UNRESOLVED = "등록된 정보 소스를 확인할 수 없습니다.";

export type CollectGateResult =
  | { ok: true; sectionId: string; section: CatalogSectionView }
  | {
      ok: false;
      failureCode: "needs_check" | "disabled" | "unresolved_section" | "fixture_only";
      failureMessage: string;
    };

export function assertCatalogSectionCollectable(sectionId: string): CollectGateResult {
  const found = findCatalogSection(sectionId);
  if (!found) {
    return {
      ok: false,
      failureCode: "unresolved_section",
      failureMessage: COLLECT_GATE_UNRESOLVED,
    };
  }
  const status = found.section.status;
  if (status === "disabled") {
    return {
      ok: false,
      failureCode: "disabled",
      failureMessage: COLLECT_GATE_DISABLED,
    };
  }
  if (status !== "available") {
    return {
      ok: false,
      failureCode: "needs_check",
      failureMessage: COLLECT_GATE_NEEDS_CHECK,
    };
  }
  return { ok: true, sectionId: found.section.sectionId, section: found.section };
}

/**
 * Production path: URL → normalize → sectionId → assertCollectable(sectionId).
 * Fixture/local non-catalog URLs: allow only explicit fixture adapter host.
 */
export function assertCollectableFromSourceUrl(
  sourceUrl: string,
  opts?: { allowFixtureBypass?: boolean }
): CollectGateResult {
  const allowFixture = opts?.allowFixtureBypass !== false;
  if (allowFixture && isFixtureExternalBoardUrl(sourceUrl)) {
    return {
      ok: false,
      failureCode: "fixture_only",
      failureMessage: "fixture_path",
    };
  }

  const sectionId = resolveCatalogSectionIdFromUrl(sourceUrl);
  if (!sectionId) {
    return {
      ok: false,
      failureCode: "unresolved_section",
      failureMessage: COLLECT_GATE_UNRESOLVED,
    };
  }
  return assertCatalogSectionCollectable(sectionId);
}

/** Discover/register entry: fixture bypass returns ok for tests; Production rejects unresolved. */
export function assertProductionCollectGate(sourceUrl: string): CollectGateResult {
  if (isFixtureExternalBoardUrl(sourceUrl)) {
    // Explicit test-only path — not catalog-gated.
    return {
      ok: true,
      sectionId: "fixture",
      section: {
        sectionId: "fixture",
        sourceId: "fixture",
        sectionName: "Fixture",
        sectionUrl: sourceUrl,
        canonicalUrl: sourceUrl,
        status: "available",
        adapterId: "fixture",
        category: "life",
        defaultLanguage: "en",
        recommendedTopicHint: null,
        importKind: "article",
        authMode: "public",
        capabilities: {
          list: "proven",
          detail: "proven",
          title: "proven",
          author: "proven",
          date: "proven",
          body: "proven",
          thumb: "na",
          bodyImage: "na",
          gallery: "na",
          pagination: "na",
          language: "proven",
          publish: "proven",
        },
        disabledOverride: false,
      },
    };
  }
  return assertCollectableFromSourceUrl(sourceUrl, { allowFixtureBypass: false });
}
