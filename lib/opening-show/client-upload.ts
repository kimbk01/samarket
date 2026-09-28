import {
  validateOpeningImageBytes,
  type OpeningImageMime,
} from "@/lib/opening-show/media-validate";
import type { OpeningReadyMedia } from "@/lib/opening-show/types";

export type OpeningUploadResult =
  | { ok: true; media: OpeningReadyMedia }
  | { ok: false; error: string };

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function uploadOpeningImageFile(input: {
  showId: string;
  file: File;
  signal?: AbortSignal;
}): Promise<OpeningUploadResult> {
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const validated = validateOpeningImageBytes({
    mimeHint: input.file.type,
    bytes,
  });
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const signRes = await fetch("/api/admin/opening-media/sign", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    signal: input.signal,
    body: JSON.stringify({
      showId: input.showId,
      mime: validated.mime,
      fileName: input.file.name,
    }),
  });
  const signJson = await readJson(signRes);
  if (!signRes.ok || signJson.ok !== true) {
    return { ok: false, error: String(signJson.error ?? "sign_failed") };
  }

  const signedUrl = String(signJson.signedUrl ?? "");
  const mediaId = String(signJson.mediaId ?? "");
  const mime = String(signJson.mime ?? validated.mime) as OpeningImageMime;
  if (!signedUrl || !mediaId) {
    return { ok: false, error: "sign_failed" };
  }

  const blob = new Blob([bytes], { type: mime });
  const putRes = await fetch(signedUrl, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": mime },
    signal: input.signal,
  });
  if (!putRes.ok) {
    return { ok: false, error: "upload_failed" };
  }

  const completeRes = await fetch("/api/admin/opening-media/complete", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    signal: input.signal,
    body: JSON.stringify({
      showId: input.showId,
      mediaId,
      mime,
      fileName: input.file.name,
    }),
  });
  const completeJson = await readJson(completeRes);
  if (!completeRes.ok || completeJson.ok !== true || !completeJson.media) {
    return { ok: false, error: String(completeJson.error ?? "process_failed") };
  }
  return { ok: true, media: completeJson.media as OpeningReadyMedia };
}
