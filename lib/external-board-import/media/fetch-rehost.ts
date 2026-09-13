import type { SupabaseClient } from "@supabase/supabase-js";
import { mediaIdentityFromUrl } from "@/lib/external-board-import/adapters/types";
import type { ExternalBoardDocument } from "@/lib/external-board-import/types";
import { POST_IMAGES_BUCKET } from "@/lib/media/post-images-storage-ownership";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export type RehostResult = {
  document: ExternalBoardDocument;
  images: string[];
};

/**
 * Fetch + rehost every image node. Broken image ⇒ FAIL (never hide and PASS).
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

  for (const node of input.document.nodes) {
    if (node.type !== "image") {
      nodes.push(node);
      continue;
    }
    const src = String(node.src ?? "").trim();
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
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : contentType.includes("gif")
          ? "gif"
          : "jpg";
    const path = `${input.principalUserId}/community/external-board/${input.articleId}/${identity}.${ext}`;
    const { error: upErr } = await input.sb.storage.from(POST_IMAGES_BUCKET).upload(path, buf, {
      contentType,
      upsert: true,
    });
    if (upErr) {
      await markMediaFailed(input.sb, input.articleId, identity, src, upErr.message);
      throw Object.assign(new Error(`Upload failed: ${upErr.message}`), {
        failureStage: "media",
        failureCode: "image_upload_failed",
      });
    }
    const publicUrl = input.sb.storage.from(POST_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
    await input.sb.from("external_board_media_assets").upsert(
      {
        article_id: input.articleId,
        source_media_identity: identity,
        source_url: src,
        dibay_storage_path: path,
        dibay_storage_url: publicUrl,
        content_type: contentType,
        byte_size: buf.byteLength,
        fetch_status: "ok",
        failure_message: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "article_id,source_media_identity" }
    );
    images.push(publicUrl);
    nodes.push({ ...node, src: publicUrl, mediaId: identity });
  }

  return {
    document: { ...input.document, nodes },
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
