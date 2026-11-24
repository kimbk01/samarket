"use client";

import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import {
  classifyMessengerSendFailure,
  messengerUploadFallbackErrorCode,
} from "@/lib/community-messenger/upload/messenger-direct-upload-policy";
import type { MessengerUploadOutcome } from "@/lib/community-messenger/upload/messenger-direct-upload";
import type { MessengerWebVideo } from "@/lib/community-messenger/attachment/messenger-video-web";
import {
  cancelMessengerNativeVideo,
  onMessengerNativeVideoProgress,
  prepareMessengerNativeVideo,
  uploadMessengerNativePreparedVideo,
  type MessengerNativePickedVideo,
  type MessengerNativePreparedVideo,
} from "@/lib/community-messenger/attachment/messenger-photo-library";
import {
  MESSENGER_VIDEO_CONTAINERS,
  MESSENGER_VIDEO_THUMB_CONTENT_TYPE,
  precheckMessengerVideo,
} from "@/lib/community-messenger/upload/messenger-video-upload-policy";

/**
 * 채팅 영상 보내기 — 클라이언트 전송(설계 §3-4).
 * ① (네이티브) 압축 ② `POST …/videos/upload-url` ③ Storage 직접 PUT(썸네일 → 영상, 진행률) ④ `POST …/videos` 확정.
 * 취소(AbortSignal) → 진행 중 PUT·압축 중단 + 서버에 `DELETE …/videos` 1회(이미 올라간 객체 정리).
 * 확정 응답을 못 받은 실패는 indeterminate — 같은 clientMessageId 로 다시 보내면 서버 멱등이 1행만 남긴다.
 */

export type MessengerVideoSendSource =
  | MessengerWebVideo
  | {
      kind: "native";
      picked: MessengerNativePickedVideo;
      /** 재전송 때 다시 압축하지 않도록 첫 시도의 결과를 보관 */
      prepared: MessengerNativePreparedVideo | null;
    };

type Progress = (phase: "transcode" | "upload", fraction: number, transcoded: boolean) => void;

type UrlBody = {
  ok?: boolean;
  error?: string;
  videoPath?: string;
  videoSignedUrl?: string;
  thumbSignedUrl?: string;
  videoContentType?: string;
};

function cancelledOutcome(): MessengerUploadOutcome {
  return {
    ok: false,
    transport: "staged",
    error: "cancelled",
    failure: "definitive",
    beforeCommit: true,
    res: null,
    json: { error: "cancelled" },
  };
}

function failed(error: string, failure: "definitive" | "indeterminate", beforeCommit: boolean, res: Response | null = null): MessengerUploadOutcome {
  return { ok: false, transport: "staged", error, failure, beforeCommit, res, json: { error } };
}

/** XHR PUT — fetch 는 업로드 진행률을 주지 않는다. */
function xhrPut(url: string, body: Blob, contentType: string, signal: AbortSignal, onProgress?: (f: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
      };
    }
    const done = (ok: boolean) => {
      signal.removeEventListener("abort", onAbort);
      resolve(ok);
    };
    xhr.onload = () => done(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => done(false);
    xhr.onabort = () => done(false);
    xhr.send(body);
  });
}

async function postJson(url: string, body: unknown, method = "POST"): Promise<{ res: Response; json: Record<string, unknown>; parsed: boolean } | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    try {
      const json = (await res.json()) as Record<string, unknown>;
      return { res, json: json && typeof json === "object" ? json : {}, parsed: true };
    } catch {
      return { res, json: {}, parsed: false };
    }
  } catch {
    return null;
  }
}

/** 취소 후 서버 정리(한 번, 결과 무시) */
function requestServerCleanup(base: string, videoPath: string): void {
  void postJson(`${base}/videos`, { videoPath }, "DELETE");
}

export async function uploadMessengerVideo(input: {
  roomResourcePath: string;
  source: MessengerVideoSendSource;
  clientMessageId: string;
  signal: AbortSignal;
  onProgress: Progress;
}): Promise<MessengerUploadOutcome> {
  const { source, signal } = input;
  const base = input.roomResourcePath;

  /* ① 네이티브 압축(재전송이면 건너뜀) */
  let transcoded = false;
  let sizeBytes: number;
  let durationMs: number;
  let width: number | null;
  let height: number | null;
  let ext: "mp4" | "mov";
  if (source.kind === "native") {
    if (!source.prepared) {
      const pickedId = source.picked.id;
      const onAbort = () => void cancelMessengerNativeVideo(pickedId);
      signal.addEventListener("abort", onAbort, { once: true });
      const off = onMessengerNativeVideoProgress((e) => {
        if (e.id === pickedId && e.phase === "transcode") input.onProgress("transcode", e.progress, true);
      });
      try {
        source.prepared = await prepareMessengerNativeVideo(pickedId);
      } finally {
        off();
        signal.removeEventListener("abort", onAbort);
      }
      if (signal.aborted) return cancelledOutcome();
      if (!source.prepared) return failed("video_prepare_failed", "definitive", true);
    }
    const p = source.prepared;
    transcoded = p.transcoded;
    sizeBytes = p.sizeBytes;
    durationMs = p.durationMs;
    width = p.width;
    height = p.height;
    ext = "mp4";
  } else {
    sizeBytes = source.file.size;
    durationMs = source.durationMs;
    width = source.width;
    height = source.height;
    ext = source.ext;
  }
  const pre = precheckMessengerVideo({ bytes: sizeBytes, durationMs, ext });
  if (!pre.ok) return failed(pre.error, "definitive", true);
  if (signal.aborted) return cancelledOutcome();

  /* ② 서명 URL */
  const urlRes = await postJson(`${base}/videos/upload-url`, { bytes: sizeBytes, durationMs, ext });
  if (!urlRes) return failed("upload_failed", "indeterminate", true);
  const urls = urlRes.json as UrlBody;
  if (!urlRes.res.ok || !urls.ok || !urls.videoPath || !urls.videoSignedUrl || !urls.thumbSignedUrl) {
    const err = (typeof urls.error === "string" && urls.error) || messengerUploadFallbackErrorCode(urlRes.res.status);
    /* 확정 전이라 서버 커밋 없음 — 4xx 는 확정 거절, 5xx·네트워크는 다시 보낼 수 있게 */
    return failed(err, urlRes.res.status >= 500 ? "indeterminate" : "definitive", true, urlRes.res);
  }
  const videoPath = urls.videoPath;
  const videoContentType = urls.videoContentType || MESSENGER_VIDEO_CONTAINERS[ext];

  /* ③ 직접 PUT */
  let putOk: boolean;
  if (source.kind === "native") {
    const handle = source.prepared!.handle;
    const onAbort = () => void cancelMessengerNativeVideo(handle);
    signal.addEventListener("abort", onAbort, { once: true });
    const off = onMessengerNativeVideoProgress((e) => {
      if (e.id === handle && e.phase === "upload") input.onProgress("upload", e.progress, transcoded);
    });
    try {
      const r = await uploadMessengerNativePreparedVideo({
        handle,
        videoSignedUrl: urls.videoSignedUrl,
        thumbSignedUrl: urls.thumbSignedUrl,
        videoContentType,
      });
      putOk = r.ok;
    } finally {
      off();
      signal.removeEventListener("abort", onAbort);
    }
  } else {
    putOk =
      (await xhrPut(urls.thumbSignedUrl, source.thumb, MESSENGER_VIDEO_THUMB_CONTENT_TYPE, signal)) &&
      (await xhrPut(urls.videoSignedUrl, source.file, videoContentType, signal, (f) =>
        input.onProgress("upload", f, false)
      ));
  }
  if (signal.aborted) {
    requestServerCleanup(base, videoPath);
    return cancelledOutcome();
  }
  if (!putOk) {
    /* 올라간 일부는 서버가 지운다(못 지우면 일일 GC) — 다시 보내기는 새 URL 로 */
    requestServerCleanup(base, videoPath);
    return failed("upload_failed", "indeterminate", true);
  }
  input.onProgress("upload", 1, transcoded);

  /* ④ 확정 */
  const fin = await postJson(`${base}/videos`, {
    videoPath,
    durationMs,
    width,
    height,
    clientMessageId: input.clientMessageId,
  });
  if (!fin) return failed("upload_failed", "indeterminate", false);
  const json = fin.json as { ok?: boolean; error?: string; message?: CommunityMessengerMessage };
  if (fin.res.ok && fin.parsed && json.ok) {
    return { ok: true, transport: "staged", message: json.message ?? null, res: fin.res };
  }
  const error = (typeof json.error === "string" && json.error) || messengerUploadFallbackErrorCode(fin.res.status);
  return {
    ok: false,
    transport: "staged",
    error,
    failure: classifyMessengerSendFailure({ status: fin.res.status, jsonParsed: fin.parsed }),
    beforeCommit: false,
    res: fin.res,
    json: { error },
  };
}
