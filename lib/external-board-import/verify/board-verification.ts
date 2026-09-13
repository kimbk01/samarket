import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveExternalBoardAdapter } from "@/lib/external-board-import/adapters/registry";
import { updateExternalBoardSourceCheck } from "@/lib/external-board-import/registry/source-board-store";
import type { ExternalBoardSourceRow } from "@/lib/external-board-import/types";
import type { ExternalBoardCheckStatus } from "@/lib/external-board-import/product-lock";

export type BoardVerificationResult = {
  status: ExternalBoardCheckStatus;
  reasons: string[];
  samples: Array<{
    stableArticleIdentity: string;
    canonicalUrl: string;
    title: string;
    hasDocument: boolean;
  }>;
};

/**
 * READY requires real sample documents, not mere link discovery.
 * Technical VERIFY is not blocked on rights — public publish remains rights-gated.
 */
export async function verifyExternalBoard(
  sb: SupabaseClient,
  source: ExternalBoardSourceRow
): Promise<BoardVerificationResult> {
  const { ctx, adapter } = resolveExternalBoardAdapter(source.source_url);
  if (!adapter) {
    const result: BoardVerificationResult = {
      status: "UNSUPPORTED",
      reasons: ["no_adapter_for_host", `site=${ctx.siteKey || "unknown"}`],
      samples: [],
    };
    await updateExternalBoardSourceCheck(sb, source.id, {
      status: result.status,
      reasons: result.reasons,
    });
    return result;
  }

  const verified = await adapter.verifyBoard(ctx);
  const samples = verified.samples.map((s) => ({
    stableArticleIdentity: s.stableArticleIdentity,
    canonicalUrl: s.canonicalUrl,
    title: s.title,
    hasDocument: Boolean(s.sampleDocument && s.sampleDocument.nodes.length > 0),
  }));
  const withDocs = samples.filter((s) => s.hasDocument).length;
  let status: ExternalBoardCheckStatus = verified.status;
  const reasons = [...verified.reasons];
  if (status === "READY" && withDocs < 1) {
    status = "UNSUPPORTED";
    reasons.push("ready_requires_sample_documents");
  } else if (status === "READY" && withDocs < 3) {
    status = "PARTIAL";
    reasons.push("fewer_than_3_sample_documents");
  }

  await updateExternalBoardSourceCheck(sb, source.id, { status, reasons });
  return { status, reasons, samples };
}
