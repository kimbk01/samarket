import type { IntroMediaListItemDto } from "./types";

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function listIntroMediaApi(q?: string): Promise<{
  ok: boolean;
  items: IntroMediaListItemDto[];
  error?: string;
}> {
  const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  const res = await fetch(`/api/admin/intro/media${qs}`, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  const json = await parseJson(res);
  if (!res.ok || json.ok !== true) {
    return {
      ok: false,
      items: [],
      error: String(json.error ?? json.category ?? "list_failed"),
    };
  }
  return {
    ok: true,
    items: (json.items as IntroMediaListItemDto[]) ?? [],
  };
}

export async function getIntroMediaApi(mediaId: string) {
  const res = await fetch(`/api/admin/intro/media/${mediaId}`, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  const json = await parseJson(res);
  return { status: res.status, json };
}

export async function deleteIntroMediaApi(mediaId: string) {
  const res = await fetch(`/api/admin/intro/media/${mediaId}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  const json = await parseJson(res);
  return { status: res.status, json };
}

export async function issueSignedReadApi(
  mediaId: string,
  purpose: "runtime" | "source_preview" = "runtime",
) {
  const res = await fetch(`/api/admin/intro/media/${mediaId}/signed-read`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ purpose }),
  });
  const json = await parseJson(res);
  return { status: res.status, json };
}

export type UploadPipelineStage =
  | "idle"
  | "creating"
  | "uploading"
  | "confirming"
  | "processing"
  | "ready"
  | "failed";

export type UploadPipelineProgress = {
  stage: UploadPipelineStage;
  /** 0–100 transport progress while uploading; null otherwise */
  transportPercent: number | null;
  mediaId: string | null;
  mediaRefId: string | null;
  errorCategory: string | null;
  errorMessage: string | null;
};

/**
 * Canonical Phase 3 flow. Create is called ONLY after a File is chosen
 * (browser picker cancel → mutation 0).
 */
export async function runIntroMediaUploadPipeline(args: {
  file: File;
  mediaKind?: "IMAGE" | "LOGO" | "GIF";
  onProgress?: (p: UploadPipelineProgress) => void;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  mediaId?: string;
  mediaRefId?: string;
  status?: string;
  errorCategory?: string;
  errorMessage?: string;
}> {
  const emit = (p: UploadPipelineProgress) => args.onProgress?.(p);
  let mediaId: string | null = null;

  const fail = (category: string, message: string) => {
    emit({
      stage: "failed",
      transportPercent: null,
      mediaId,
      mediaRefId: mediaId,
      errorCategory: category,
      errorMessage: message,
    });
    return {
      ok: false as const,
      mediaId: mediaId ?? undefined,
      mediaRefId: mediaId ?? undefined,
      errorCategory: category,
      errorMessage: message,
    };
  };

  emit({
    stage: "creating",
    transportPercent: null,
    mediaId: null,
    mediaRefId: null,
    errorCategory: null,
    errorMessage: null,
  });

  const createRes = await fetch("/api/admin/intro/media/create", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      mediaKind: args.mediaKind ?? "IMAGE",
      originalName: args.file.name || "upload.bin",
    }),
    signal: args.signal,
  });
  const createJson = await parseJson(createRes);
  if (!createRes.ok || createJson.ok !== true || typeof createJson.mediaId !== "string") {
    return fail(
      String(createJson.category ?? "CREATE_FAILED"),
      String(createJson.message ?? "create failed"),
    );
  }
  mediaId = createJson.mediaId;

  emit({
    stage: "uploading",
    transportPercent: 0,
    mediaId,
    mediaRefId: mediaId,
    errorCategory: null,
    errorMessage: null,
  });

  const signedRes = await fetch(
    `/api/admin/intro/media/${mediaId}/signed-upload`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: "{}",
      signal: args.signal,
    },
  );
  const signedJson = await parseJson(signedRes);
  if (
    !signedRes.ok ||
    signedJson.ok !== true ||
    typeof signedJson.signedUrl !== "string"
  ) {
    return fail(
      String(signedJson.category ?? "SIGNED_UPLOAD_FAILED"),
      String(signedJson.message ?? "signed upload failed"),
    );
  }

  const putOk = await putWithProgress({
    url: signedJson.signedUrl,
    file: args.file,
    contentType: args.file.type || "application/octet-stream",
    signal: args.signal,
    onPercent: (pct) =>
      emit({
        stage: "uploading",
        transportPercent: pct,
        mediaId,
        mediaRefId: mediaId,
        errorCategory: null,
        errorMessage: null,
      }),
  });
  if (!putOk.ok) {
    return fail("UPLOAD_INCOMPLETE", putOk.error || "upload put failed");
  }

  emit({
    stage: "confirming",
    transportPercent: 100,
    mediaId,
    mediaRefId: mediaId,
    errorCategory: null,
    errorMessage: null,
  });

  const confirmRes = await fetch(
    `/api/admin/intro/media/${mediaId}/confirm-upload`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: "{}",
      signal: args.signal,
    },
  );
  const confirmJson = await parseJson(confirmRes);
  if (!confirmRes.ok || confirmJson.ok !== true) {
    return fail(
      String(confirmJson.category ?? "CONFIRM_FAILED"),
      String(confirmJson.message ?? "confirm failed"),
    );
  }

  emit({
    stage: "processing",
    transportPercent: null,
    mediaId,
    mediaRefId: mediaId,
    errorCategory: null,
    errorMessage: null,
  });

  const processRes = await fetch(
    `/api/admin/intro/media/${mediaId}/process`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: "{}",
      signal: args.signal,
    },
  );
  const processJson = await parseJson(processRes);
  if (!processRes.ok || processJson.ok !== true || processJson.status !== "READY") {
    return fail(
      String(processJson.category ?? "PROCESSOR_FAILED"),
      String(processJson.message ?? "process failed"),
    );
  }

  emit({
    stage: "ready",
    transportPercent: null,
    mediaId,
    mediaRefId: mediaId,
    errorCategory: null,
    errorMessage: null,
  });

  return {
    ok: true,
    mediaId,
    mediaRefId: mediaId,
    status: "READY",
  };
}

function putWithProgress(args: {
  url: string;
  file: File;
  contentType: string;
  signal?: AbortSignal;
  onPercent: (pct: number) => void;
}): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", args.url);
    xhr.setRequestHeader("content-type", args.contentType);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      args.onPercent(Math.max(0, Math.min(100, Math.round((ev.loaded / ev.total) * 100))));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve({ ok: true });
      else resolve({ ok: false, error: `put status ${xhr.status}` });
    };
    xhr.onerror = () => resolve({ ok: false, error: "put network error" });
    xhr.onabort = () => resolve({ ok: false, error: "put aborted" });
    if (args.signal) {
      if (args.signal.aborted) {
        resolve({ ok: false, error: "aborted" });
        return;
      }
      args.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(args.file);
  });
}
