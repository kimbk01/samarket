import { createHash } from "node:crypto";
import type { ExternalBoardDocument, ExternalBoardIdentityKind } from "@/lib/external-board-import/types";
import { normalizeExternalBoardUrl } from "@/lib/external-board-import/identity/source-board-identity";

export function resolveArticleIdentity(input: {
  stableId?: string | null;
  canonicalUrl?: string | null;
}): { stableArticleIdentity: string; identityKind: ExternalBoardIdentityKind; canonicalUrl: string } | null {
  const stableId = String(input.stableId ?? "").trim();
  if (stableId) {
    const canonicalUrl = normalizeExternalBoardUrl(String(input.canonicalUrl ?? "")) || stableId;
    return {
      stableArticleIdentity: `stable:${stableId}`,
      identityKind: "stable_id",
      canonicalUrl,
    };
  }
  const canonical = normalizeExternalBoardUrl(String(input.canonicalUrl ?? ""));
  if (!canonical) return null;
  return {
    stableArticleIdentity: `url:${canonical}`,
    identityKind: "canonical_url",
    canonicalUrl: canonical,
  };
}

export function fingerprintExternalBoardDocument(doc: ExternalBoardDocument): string {
  const payload = JSON.stringify({
    title: doc.title,
    canonicalUrl: doc.canonicalUrl,
    nodes: doc.nodes,
  });
  return createHash("sha256").update(payload).digest("hex");
}
