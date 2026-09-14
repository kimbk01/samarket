import type { SupabaseClient } from "@supabase/supabase-js";
import { mediaIdentityFromUrl } from "@/lib/external-board-import/adapters/types";
import type { ExternalBoardDocument } from "@/lib/external-board-import/types";
import {
  removeCanonicalImageAsset,
  uploadPostImageWithDerivatives,
} from "@/lib/media/canonical-image-upload.server";
import { POST_IMAGES_BUCKET } from "@/lib/media/post-images-storage-ownership";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export type RehostResult = {
  document: ExternalBoardDocument;
  images: string[];
};

/**
 * Fetch + rehost every image node and optional feedThumbnailSrc.
 * Broken image ⇒ FAIL (never hide and PASS).
 * Writes ledger rows to external_board_media_assets.
 */
export async function rehostDocumentImages(input: {
  sb: SupabaseClient;
  articleId: string;
  document: ExternalBoardDocument;
  principalUserId: string;
  fetchImpl?: typeof fetch;
}): Promise<RehostResult> {
  const fetchFn = input.fetchImpl ?? fetch;
  const nodes = [];
  const images: string[] = [];

  async function rehostOne(srcRaw: string): Promise<string> {
    const src = String(srcRaw ?? "").trim();
    if (!src) {
      throw Object.assign(new Error("Empty image src"), {
        failureStage: "media",
        failureCode: "empty_image_src",
      });
    }
    const identity = mediaIdentityFromUrl(src);
    let res: Response;
    try {
      res = await fetchFn(src, { redirect: "follow" });
    } catch (e) {
      await markMediaFailed(input.sb, input.articleId, identity, src, String(e));
      throw Object.assign(new Error(`Image fetch failed: ${src}`), {
        failureStage: "media",
        failureCode: "image_fetch_failed",
      });
    }
    if (!res.ok) {
      await markMediaFailed(input.sb, input.articleId, identity, src, `HTTP ${res.status}`);
      throw Object.assign(new Error(`Image HTTP ${res.status}: ${src}`), {
        failureStage: "media",
        failureCode: "image_http_error",
      });
    }
    const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0]!.trim().toLowerCase();
    if (!ALLOWED_TYPES.has(contentType) && !contentType.startsWith("image/")) {
      await markMediaFailed(input.sb, input.articleId, identity, src, `bad content-type ${contentType}`);
      throw Object.assign(new Error(`Unsupported image type: ${contentType}`), {
        failureStage: "media",
        failureCode: "image_type_invalid",
      });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 32) {
      await markMediaFailed(input.sb, input.articleId, identity, src, "image too small");
      throw Object.assign(new Error("Image too small"), {
        failureStage: "media",
        failureCode: "image_too_small",
      });
    }
    // Seed path; uploadPostImageWithDerivatives may rewrite to .webp after optimize.
    // Must create thumb/feed/detail derivatives — Feed list resolves .feed.webp / .thumb.webp.
    const originalPath = `${input.principalUserId}/community/external-board/${input.articleId}/${identity}.jpg`;
    try {
      for (const p of [
        originalPath,
        originalPath.replace(/\.jpg$/i, ".png"),
        originalPath.replace(/\.jpg$/i, ".webp"),
      ]) {
        try {
          await removeCanonicalImageAsset({
            sb: input.sb,
            bucket: POST_IMAGES_BUCKET,
            originalPath: p,
          });
        } catch {
          /* idempotent cleanup */
        }
      }
      const uploaded = await uploadPostImageWithDerivatives({
        sb: input.sb,
        originalPath,
        rawBuf: buf,
        mimeType: contentType,
      });
      const publicUrl = uploaded.publicUrl;
      await input.sb.from("external_board_media_assets").upsert(
        {
          article_id: input.articleId,
          source_media_identity: identity,
          source_url: src,
          dibay_storage_path: uploaded.originalPath,
          dibay_storage_url: publicUrl,
          content_type: contentType,
          byte_size: buf.byteLength,
          fetch_status: "ok",
          failure_message: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "article_id,source_media_identity" }
      );
      return publicUrl;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markMediaFailed(input.sb, input.articleId, identity, src, msg);
      throw Object.assign(new Error(`Upload failed: ${msg}`), {
        failureStage: "media",
        failureCode: "image_upload_failed",
      });
    }
  }

  const feedRaw = String(input.document.feedThumbnailSrc ?? "").trim();
  let feedThumbnailSrc: string | null = null;
  if (feedRaw) {
    feedThumbnailSrc = await rehostOne(feedRaw);
    images.push(feedThumbnailSrc);
  }

  for (const node of input.document.nodes) {
    if (node.type !== "image") {
      nodes.push(node);
      continue;
    }
    const publicUrl = await rehostOne(String(node.src ?? ""));
    images.push(publicUrl);
    nodes.push({ ...node, src: publicUrl, mediaId: mediaIdentityFromUrl(String(node.src ?? "")) });
  }

  return {
    document: {
      ...input.document,
      nodes,
      feedThumbnailSrc,
    },
    images,
  };
}

async function markMediaFailed(
  sb: SupabaseClient,
  articleId: string,
  identity: string,
  src: string,
  message: string
) {
  await sb.from("external_board_media_assets").upsert(
    {
      article_id: articleId,
      source_media_identity: identity,
      source_url: src,
      fetch_status: "failed",
      failure_message: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "article_id,source_media_identity" }
  );
}
