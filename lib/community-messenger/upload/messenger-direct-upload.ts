"use client";

import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import {
  classifyMessengerSendFailure,
  decideMessengerUploadTransport,
  messengerUploadFallbackErrorCode,
  type MessengerSendFailureKind,
  type MessengerUploadTransport,
} from "@/lib/community-messenger/upload/messenger-direct-upload-policy";

/**
 * D-3 — 메신저 이미지·파일 업로드 클라이언트(전송 방식 단일 진입점).
 * - 작은 요청(≤ MESSENGER_MULTIPART_SAFE_MAX_BYTES): 기존 multipart `POST …/images|files`.
 * - 큰 요청: staged direct upload — 서명 URL 발급 → Storage 직접 PUT → JSON 확정 POST.
 * clientMessageId 는 두 방식 모두 동일 값을 확정 요청에 싣는다(서버 UNIQUE 멱등).
 */

export type MessengerUploadJson = {
  ok?: boolean;
  error?: string;
  code?: string;
  message?: CommunityMessengerMessage;
};

export type MessengerUploadOutcome =
  | { ok: true; transport: MessengerUploadTransport; message: CommunityMessengerMessage | null; res: Response }
  | {
      ok: false;
      transport: MessengerUploadTransport;
      /** 사용자 문구 매핑용 오류 코드 */
      error: string;
      failure: MessengerSendFailureKind;
      /** 확정(전송) 요청 이전 단계에서 실패했는지 — 서버 커밋이 확실히 없음 */
      beforeCommit: boolean;
      res: Response | null;
      json: MessengerUploadJson;
    };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function readJson(res: Response): Promise<{ json: MessengerUploadJson; parsed: boolean }> {
  try {
    const json = (await res.json()) as MessengerUploadJson;
    return { json: json && typeof json === "object" ? json : {}, parsed: Boolean(json && typeof json === "object") };
  } catch {
    return { json: {}, parsed: false };
  }
}

function failureFromResponse(
  transport: MessengerUploadTransport,
  res: Response,
  json: MessengerUploadJson,
  parsed: boolean,
  beforeCommit: boolean
): MessengerUploadOutcome {
  const error =
    (typeof json.error === "string" && json.error.trim()) ||
    (typeof json.code === "string" && json.code.trim()) ||
    messengerUploadFallbackErrorCode(res.status);
  return {
    ok: false,
    transport,
    error,
    failure: beforeCommit && res.status >= 500 ? "indeterminate" : classifyMessengerSendFailure({ status: res.status, jsonParsed: parsed }),
    beforeCommit,
    res,
    json: parsed ? json : { error },
  };
}

function networkFailure(transport: MessengerUploadTransport, beforeCommit: boolean): MessengerUploadOutcome {
  return {
    ok: false,
    transport,
    error: "upload_failed",
    failure: "indeterminate",
    beforeCommit,
    res: null,
    json: { error: "upload_failed" },
  };
}

async function finalizeJson(
  fetchImpl: FetchLike,
  transport: MessengerUploadTransport,
  url: string,
  init: RequestInit
): Promise<MessengerUploadOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch {
    return networkFailure(transport, false);
  }
  const { json, parsed } = await readJson(res);
  if (res.ok && parsed && json.ok) {
    return { ok: true, transport, message: json.message ?? null, res };
  }
  return failureFromResponse(transport, res, json, parsed, false);
}

/** Storage 서명 URL 로 직접 PUT — 선례 `LaunchIntroAdminPage` uploadLaunchIntroAsset */
async function putToSignedUrl(fetchImpl: FetchLike, signedUrl: string, blob: Blob, contentType: string): Promise<boolean> {
  try {
    const put = await fetchImpl(signedUrl, {
      method: "PUT",
      headers: { "content-type": contentType || "application/octet-stream", "x-upsert": "false" },
      body: blob,
    });
    return put.ok;
  } catch {
    return false;
  }
}

async function postJson(
  fetchImpl: FetchLike,
  url: string,
  body: unknown
): Promise<{ res: Response; json: MessengerUploadJson & Record<string, unknown>; parsed: boolean } | null> {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const { json, parsed } = await readJson(res);
    return { res, json: json as MessengerUploadJson & Record<string, unknown>, parsed };
  } catch {
    return null;
  }
}

/** 이미지 묶음 전송 — 앨범은 어떤 방식이든 **1메시지**. */
export async function uploadMessengerImages(input: {
  roomResourcePath: string;
  files: File[];
  clientMessageId: string;
  fetchImpl?: FetchLike;
}): Promise<MessengerUploadOutcome> {
  const fetchImpl: FetchLike = input.fetchImpl ?? ((u, i) => fetch(u, i));
  const transport = decideMessengerUploadTransport(input.files.map((f) => f.size));
  const base = input.roomResourcePath;
  if (transport === "multipart") {
    const form = new FormData();
    for (const f of input.files) form.append("files", f);
    // CHAT-05: 업로드 멱등 — 이 전송 시도의 안정 clientMessageId(재전송 시 서버 1행 보장).
    form.append("clientMessageId", input.clientMessageId);
    return finalizeJson(fetchImpl, transport, `${base}/images`, { method: "POST", body: form });
  }
  const start = await postJson(fetchImpl, `${base}/images/upload-urls`, {
    items: input.files.map((f) => ({ mime: (f.type || "").toLowerCase(), bytes: f.size })),
  });
  if (!start) return networkFailure(transport, true);
  const uploads = Array.isArray(start.json.uploads)
    ? (start.json.uploads as Array<{ path?: unknown; signedUrl?: unknown }>)
    : [];
  if (!start.res.ok || !start.json.ok || uploads.length !== input.files.length) {
    return failureFromResponse(transport, start.res, start.json, start.parsed, true);
  }
  const puts = await Promise.all(
    uploads.map((u, i) =>
      typeof u.signedUrl === "string"
        ? putToSignedUrl(fetchImpl, u.signedUrl, input.files[i]!, input.files[i]!.type)
        : Promise.resolve(false)
    )
  );
  if (puts.some((ok) => !ok)) return networkFailure(transport, true);
  return finalizeJson(fetchImpl, transport, `${base}/images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stagedPaths: uploads.map((u) => String(u.path ?? "")),
      clientMessageId: input.clientMessageId,
    }),
  });
}

/** 단일 파일 전송 — 15MB 까지 실제 전송(큰 파일은 staged). */
export async function uploadMessengerFile(input: {
  roomResourcePath: string;
  file: File;
  clientMessageId: string;
  fetchImpl?: FetchLike;
}): Promise<MessengerUploadOutcome> {
  const fetchImpl: FetchLike = input.fetchImpl ?? ((u, i) => fetch(u, i));
  const transport = decideMessengerUploadTransport([input.file.size]);
  const base = input.roomResourcePath;
  if (transport === "multipart") {
    const form = new FormData();
    form.append("file", input.file);
    // CHAT-05: 업로드 멱등 — 이 전송 시도의 안정 clientMessageId(재전송 시 서버 1행 보장).
    form.append("clientMessageId", input.clientMessageId);
    return finalizeJson(fetchImpl, transport, `${base}/files`, { method: "POST", body: form });
  }
  const start = await postJson(fetchImpl, `${base}/files/upload-url`, {
    fileName: input.file.name,
    bytes: input.file.size,
  });
  if (!start) return networkFailure(transport, true);
  const path = typeof start.json.path === "string" ? start.json.path : "";
  const signedUrl = typeof start.json.signedUrl === "string" ? start.json.signedUrl : "";
  if (!start.res.ok || !start.json.ok || !path || !signedUrl) {
    return failureFromResponse(transport, start.res, start.json, start.parsed, true);
  }
  const put = await putToSignedUrl(fetchImpl, signedUrl, input.file, input.file.type);
  if (!put) return networkFailure(transport, true);
  return finalizeJson(fetchImpl, transport, `${base}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stagedPath: path, fileName: input.file.name, clientMessageId: input.clientMessageId }),
  });
}
