/**
 * Rehost ARTICLE DOCUMENT images in document order.
 * Same imageId → one upload. Order never changes. No cover strip.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArticleDocument } from "@/lib/community-board-import/article-document";
import { articleDocumentStructureKey } from "@/lib/community-board-import/article-document";
import { uploadPostImageWithDerivatives } from "@/lib/media/canonical-image-upload.server";
import {
  crawlMediaExtForMime,
  safeFetchCrawlMediaBytes,
} from "@/lib/community-crawler/media/safe-fetch-image";

export type BoardImportRehostedImage = {
  imageId: string;
  imageUrl: string;
  storagePath: string;
  sortOrder: number;
};

export type RehostDocumentImagesResult =
  | {
      ok: true;
      document: ArticleDocument;
      images: BoardImportRehostedImage[];
      structureKey: string;
    }
  | { ok: false; error: string; detail?: string };

function isAlreadyDibayHosted(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname.includes("supabase") ||
      u.pathname.includes("/storage/v1/object/public/post-images/") ||
      u.pathname.includes("/post-images/")
    );
  } catch {
    return false;
  }
}

export async function rehostArticleDocumentImages(input: {
  sb: SupabaseClient;
  articleId: string;
  document: ArticleDocument;
}): Promise<RehostDocumentImagesResult> {
  const beforeKey = articleDocumentStructureKey(input.document);
  const urlByImageId = new Map<string, { imageUrl: string; storagePath: string }>();
  const images: BoardImportRehostedImage[] = [];
  let sortOrder = 0;

  for (const node of input.document.nodes) {
    if (node.kind !== "image") continue;
    const src = node.src.trim();
    if (!src) continue;

    if (urlByImageId.has(node.imageId)) {
      // Same asset already rehosted — reuse URL; do not upload twice.
      continue;
    }

    if (isAlreadyDibayHosted(src)) {
      const entry = { imageUrl: src, storagePath: "" };
      urlByImageId.set(node.imageId, entry);
      images.push({
        imageId: node.imageId,
        imageUrl: src,
        storagePath: "",
        sortOrder: sortOrder++,
      });
      continue;
    }

    const fetched = await safeFetchCrawlMediaBytes(src);
    if (!fetched.ok) {
      return {
        ok: false,
        error: "media_fetch_failed",
        detail: `${fetched.reason}:${src.slice(0, 120)}`,
      };
    }

    const ext = crawlMediaExtForMime(fetched.mime);
    const originalPath = `board-import/${input.articleId}/${node.imageId}.${ext}`;
    try {
      const uploaded = await uploadPostImageWithDerivatives({
        sb: input.sb,
        originalPath,
        rawBuf: fetched.buf,
        mimeType: fetched.mime,
      });
      const entry = {
        imageUrl: uploaded.publicUrl,
        storagePath: uploaded.originalPath,
      };
      urlByImageId.set(node.imageId, entry);
      images.push({
        imageId: node.imageId,
        imageUrl: entry.imageUrl,
        storagePath: entry.storagePath,
        sortOrder: sortOrder++,
      });
    } catch (e) {
      return {
        ok: false,
        error: "media_upload_failed",
        detail: e instanceof Error ? e.message : "upload_failed",
      };
    }
  }

  const document: ArticleDocument = {
    ...input.document,
    nodes: input.document.nodes.map((n) => {
      if (n.kind !== "image") return n;
      const mapped = urlByImageId.get(n.imageId);
      if (!mapped) return n;
      return { ...n, src: mapped.imageUrl };
    }),
  };

  const afterKey = articleDocumentStructureKey(document);
  if (beforeKey !== afterKey) {
    return { ok: false, error: "document_order_changed" };
  }

  return { ok: true, document, images, structureKey: afterKey };
}
