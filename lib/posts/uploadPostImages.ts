"use client";

import { prepareImageFileForFunctionUpload } from "@/lib/media/client-image-upload-prepare";

const BUCKET = "post-images";

type UploadPostImageResponse =
  | { ok: true; url: string; path?: string }
  | { ok: false; error?: string };

export type UploadPostImageResult =
  | { ok: true; url: string }
  | { ok: false; reason: "file_too_large" | "server" | "network"; message?: string };

type PrepareForUpload = typeof prepareImageFileForFunctionUpload;

async function sendPreparedPostImage(file: File): Promise<UploadPostImageResult> {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/posts/upload-image", {
      method: "POST",
      body: form,
      credentials: "include",
    });
    if (res.status === 413) return { ok: false, reason: "file_too_large" };
    const json = (await res.json().catch(() => null)) as UploadPostImageResponse | null;
    if (res.ok && json?.ok && json.url) return { ok: true, url: json.url };
    const message = json && !json.ok && typeof json.error === "string" ? json.error : undefined;
    return { ok: false, reason: "server", ...(message ? { message } : {}) };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/**
 * 거래 글 이미지 업로드 — 파일 순서대로 결과(성공 URL 또는 실패 사유)를 돌려준다.
 *
 * 카메라 원본은 함수 본문 한도(~4.5MB)를 넘으면 라우트 앞단 413 → 긴 변 1600px 로 줄여 보낸다 (IMG-02).
 * 축소(원본 해상도 디코드)는 **한 장씩** — 원본 여러 장을 동시에 디코드하면 웹뷰 메모리가 급증해 종료될 수 있다.
 * 축소가 끝난 사진부터 업로드 요청을 바로 보내고(요청은 동시), 결과는 입력 순서로 모은다.
 */
export async function uploadPostImagesDetailed(
  files: File[],
  prepare: PrepareForUpload = prepareImageFileForFunctionUpload
): Promise<UploadPostImageResult[]> {
  if (!files.length) return [];
  const sends: Promise<UploadPostImageResult>[] = [];
  for (const file of files) {
    const prepared = await prepare(file);
    sends.push(
      prepared.ok
        ? sendPreparedPostImage(prepared.file)
        : Promise.resolve<UploadPostImageResult>({ ok: false, reason: "file_too_large" })
    );
  }
  return Promise.all(sends);
}

/** 첫 실패 결과 (없으면 null) — 사용자 안내 문구 선택용 */
export function firstPostImageUploadFailure(
  results: UploadPostImageResult[]
): Extract<UploadPostImageResult, { ok: false }> | null {
  for (const r of results) if (!r.ok) return r;
  return null;
}

/**
 * 거래 글 이미지 업로드 — 서버 API (upload-time canonical derivatives).
 * 성공한 URL 만 순서대로 반환한다 (실패 사유가 필요하면 `uploadPostImagesDetailed`).
 */
export async function uploadPostImages(
  files: File[],
  _userId: string
): Promise<string[]> {
  const results = await uploadPostImagesDetailed(files);
  return results.flatMap((r) => (r.ok ? [r.url] : []));
}

/** @deprecated Direct client bucket upload removed — use uploadPostImages API. */
export const POST_IMAGES_BUCKET = BUCKET;
