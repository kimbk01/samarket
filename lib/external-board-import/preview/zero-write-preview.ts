import type { SupabaseClient } from "@supabase/supabase-js";
import {
  capturePreviewWriteSnapshot,
  computePreviewWriteDelta,
} from "@/lib/external-board-import/preview/measure-write-delta";
import { buildExternalBoardTransform } from "@/lib/external-board-import/publish/build-transform";
import { assertExternalBoardRightsDeclared } from "@/lib/external-board-import/rights/rights-gate";
import type {
  ExternalBoardArticleRow,
  ExternalBoardPreviewResult,
  ExternalBoardSourceRow,
} from "@/lib/external-board-import/types";

/**
 * Preview uses the same transform authority as publish.
 * Measures forbidden write tables immediately before → after Preview.
 * Guarantees DB write delta = 0 (no Community insert, no media ledger, no claim).
 */
export async function previewExternalBoardArticle(
  sb: SupabaseClient,
  source: ExternalBoardSourceRow,
  article: ExternalBoardArticleRow
): Promise<ExternalBoardPreviewResult & { writeViolations?: string[] }> {
  const before = await capturePreviewWriteSnapshot(sb, article.id);

  const rights = assertExternalBoardRightsDeclared({
    rightsStatus: source.rights_status,
    rightsBasis: source.rights_basis,
  });
  if (!rights.ok) {
    const after = await capturePreviewWriteSnapshot(sb, article.id);
    const delta = computePreviewWriteDelta(before, after);
    return {
      ok: false,
      writeDelta: 0,
      failureStage: rights.failureStage,
      failureCode: rights.failureCode,
      failureMessage: rights.failureMessage,
      writeViolations: delta.violations,
    };
  }

  const built = await buildExternalBoardTransform(sb, source, article);
  const after = await capturePreviewWriteSnapshot(sb, article.id);
  const delta = computePreviewWriteDelta(before, after);

  if (delta.writeDelta !== 0) {
    return {
      ok: false,
      writeDelta: 0,
      failureStage: "transform",
      failureCode: "preview_write_delta_nonzero",
      failureMessage: `Preview must not write. Violations: ${delta.violations.join(",")}`,
      writeViolations: delta.violations,
    };
  }

  if (!built.ok) {
    return {
      ok: false,
      writeDelta: 0,
      failureStage: built.failureStage,
      failureCode: built.failureCode,
      failureMessage: built.failureMessage,
    };
  }

  return { ok: true, writeDelta: 0, transform: built.transform };
}
