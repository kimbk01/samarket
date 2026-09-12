import { createHash } from "node:crypto";
import type { ArticleDocument } from "@/lib/community-board-import/article-document";
import { articleDocumentStructureKey } from "@/lib/community-board-import/article-document";
import { normalizeSourceBoardUrl } from "@/lib/community-board-import/source-board-identity";

/**
 * P0 SOURCE ARTICLE IDENTITY — authority split
 *
 * PRIMARY IDENTITY EVIDENCE (only these establish identity / UNIQUE key):
 * 1. source-provided stable article ID
 * 2. canonical article URL
 * 3. normalized final article URL
 *
 * CONTENT FINGERPRINT:
 * - change detection when PRIMARY identity already matches
 * - auxiliary evidence only when URL move/redirect/canonical relationship exists
 * - NEVER auto-merge two different primary identities solely because fingerprint matches
 *
 * Fingerprint alone is NOT a primary identity key (collision-unsafe).
 */

export type PrimaryIdentityKind = "stable_id" | "canonical_url" | "normalized_url";

export type SourceArticleIdentityEvidence = {
  sourceBoardId: string;
  stableArticleId?: string | null;
  canonicalUrl?: string | null;
  finalUrl?: string | null;
  normalizedTitle: string;
  canonicalContentText: string;
  structureKey?: string | null;
};

export type SourceArticleIdentity = {
  sourceBoardId: string;
  /** UNIQUE(source_board_id, stable_article_identity) — primary evidence only. */
  stableArticleIdentity: string;
  identityKind: PrimaryIdentityKind;
  contentFingerprint: string;
};

export type SourceArticleIdentityBuildResult =
  | { ok: true; identity: SourceArticleIdentity }
  | {
      ok: false;
      code: "PRIMARY_IDENTITY_MISSING";
      message: string;
      contentFingerprint: string;
    };

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeContentText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function computeContentFingerprint(input: {
  normalizedTitle: string;
  canonicalContentText: string;
  structureKey?: string | null;
}): string {
  const payload = [
    normalizeTitle(input.normalizedTitle),
    normalizeContentText(input.canonicalContentText),
    input.structureKey?.trim() || "",
  ].join("\n---\n");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function contentTextFromArticleDocument(doc: ArticleDocument): string {
  const parts: string[] = [];
  for (const n of doc.nodes) {
    switch (n.kind) {
      case "heading":
      case "paragraph":
      case "quote":
        parts.push(n.text);
        break;
      case "link":
        parts.push(n.text);
        break;
      case "list":
        parts.push(n.items.join("\n"));
        break;
      case "image":
        parts.push(`[image:${n.imageId}]`);
        break;
      default:
        break;
    }
  }
  return parts.join("\n");
}

function tryNormalizeUrl(raw: string): string | null {
  try {
    return normalizeSourceBoardUrl(raw);
  } catch {
    return null;
  }
}

/**
 * Build primary identity. Fails closed when no stable ID / canonical / normalized URL.
 * Fingerprint is always computed but never used as UNIQUE identity key.
 */
export function buildSourceArticleIdentity(
  evidence: SourceArticleIdentityEvidence
): SourceArticleIdentityBuildResult {
  const contentFingerprint = computeContentFingerprint({
    normalizedTitle: evidence.normalizedTitle,
    canonicalContentText: evidence.canonicalContentText,
    structureKey: evidence.structureKey,
  });

  const stableId = evidence.stableArticleId?.trim();
  if (stableId) {
    return {
      ok: true,
      identity: {
        sourceBoardId: evidence.sourceBoardId,
        stableArticleIdentity: `id:${stableId}`,
        identityKind: "stable_id",
        contentFingerprint,
      },
    };
  }

  const canonical = evidence.canonicalUrl?.trim();
  if (canonical) {
    const key = tryNormalizeUrl(canonical);
    if (key) {
      return {
        ok: true,
        identity: {
          sourceBoardId: evidence.sourceBoardId,
          stableArticleIdentity: `canon:${key}`,
          identityKind: "canonical_url",
          contentFingerprint,
        },
      };
    }
  }

  const finalUrl = evidence.finalUrl?.trim();
  if (finalUrl) {
    const key = tryNormalizeUrl(finalUrl);
    if (key) {
      return {
        ok: true,
        identity: {
          sourceBoardId: evidence.sourceBoardId,
          stableArticleIdentity: `url:${key}`,
          identityKind: "normalized_url",
          contentFingerprint,
        },
      };
    }
  }

  return {
    ok: false,
    code: "PRIMARY_IDENTITY_MISSING",
    message: "안정적인 글 ID 또는 canonical/정규화 URL이 없어 동일 글 판정을 할 수 없습니다.",
    contentFingerprint,
  };
}

export function buildSourceArticleIdentityFromDocument(input: {
  sourceBoardId: string;
  stableArticleId?: string | null;
  canonicalUrl?: string | null;
  finalUrl?: string | null;
  document: ArticleDocument;
}): SourceArticleIdentityBuildResult {
  return buildSourceArticleIdentity({
    sourceBoardId: input.sourceBoardId,
    stableArticleId: input.stableArticleId,
    canonicalUrl: input.canonicalUrl ?? input.document.canonicalUrl,
    finalUrl: input.finalUrl,
    normalizedTitle: input.document.title,
    canonicalContentText: contentTextFromArticleDocument(input.document),
    structureKey: articleDocumentStructureKey(input.document),
  });
}

/**
 * SAME_ARTICLE only with explicit extra identity evidence (redirect / canonical relation).
 * Fingerprint match alone is insufficient.
 */
export type SameArticleResolveEvidence = {
  /** Incoming URL redirected (or canonicalized) to known article URL. */
  redirectOrCanonicalToKnown: boolean;
  /** Optional: stable id appeared later and matches known row. */
  stableIdMatchesKnown?: boolean;
};

export function canResolveSameArticle(input: {
  primaryIdentityEquals: boolean;
  fingerprintEquals: boolean;
  evidence: SameArticleResolveEvidence;
}): boolean {
  if (input.primaryIdentityEquals) return false; // already same primary — not a URL-move case
  // Different primary identities: require redirect/canonical or stable-id link evidence.
  if (input.evidence.redirectOrCanonicalToKnown) return true;
  if (input.evidence.stableIdMatchesKnown) return true;
  // Fingerprint alone → never.
  if (input.fingerprintEquals) return false;
  return false;
}
